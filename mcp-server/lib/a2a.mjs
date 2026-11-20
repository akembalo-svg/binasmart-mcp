// A2A (Agent2Agent protocol, a2a-protocol.org v0.3) front door for BinaSmart: POST https://bina.et/a2a, JSON-RPC 2.0.
// 24 Oct 2026, step 1 of 4 (step 2 = one agent per claimed business, 3 = tasks a business approves, 4 = GCC agencies).
//
// It is a thin adapter over the same MCP tools, run in-process through the SDK's in-memory transport, so A2A callers
// get exactly what MCP callers get: the same per-caller limits, output fitting, demo disclosures and source urls.
//   - A data part that names a tool runs that tool:   { kind: 'data', data: { tool: 'search_pharmacies', arguments: {...} } }
//   - Plain text goes to search_knowledge (the query is the text).
// No model is called here: the shared Gemini key must not carry outside agents' traffic (it took smart search down on
// 17 Oct). The two tools that act in the world - request_ride sends a real driver, cancel_ride cancels one - are not
// reachable over A2A in this step; an agent that wants a ride gets quote_ride's book_url for the person to confirm.
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export const A2A_BLOCKED = new Set(['request_ride', 'cancel_ride']);
const TASK_TTL_MS = 3_600_000, TASK_MAX = 2000;

// Finished tasks are kept for an hour so tasks/get works; nothing here is durable and nothing needs to be.
export function makeTaskStore(now = () => Date.now()) {
  const m = new Map();
  return {
    put(t) { m.set(t.id, { t, at: now() }); while (m.size > TASK_MAX) m.delete(m.keys().next().value); },
    get(id) { const e = m.get(String(id)); if (!e) return null; if (now() - e.at > TASK_TTL_MS) { m.delete(String(id)); return null; } return e.t; },
  };
}

export const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: data === undefined ? { code, message } : { code, message, data } });
const uuid = () => crypto.randomUUID();
const agentMessage = (text, contextId, taskId) => ({ kind: 'message', role: 'agent', messageId: uuid(), contextId, taskId, parts: [{ kind: 'text', text }] });

// The request inside an A2A Message: the first data part that names a tool wins; otherwise the text parts are the query.
export function parseRequest(message) {
  const parts = Array.isArray(message && message.parts) ? message.parts : [];
  for (const p of parts) {
    if ((p && (p.kind || p.type)) === 'data' && p.data && typeof p.data.tool === 'string') {
      const a = p.data.arguments;
      return { tool: p.data.tool, args: a && typeof a === 'object' && !Array.isArray(a) ? a : {} };
    }
  }
  const text = parts.filter(p => p && (p.kind || p.type) === 'text' && typeof p.text === 'string').map(p => p.text).join('\n').trim();
  return text ? { tool: 'search_knowledge', args: { query: text.slice(0, 300), k: 4 } } : null;
}

async function withClient(buildServer, opts, fn) {
  const server = buildServer(opts);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'bina-a2a', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try { return await fn(client); }
  finally { await client.close().catch(() => {}); await server.close().catch(() => {}); }
}

// handle(body, callerKey) -> JSON-RPC response object. `serverOpts` is everything buildServer needs except callerKey.
export function makeA2AHandler({ buildServer, serverOpts, tasks = makeTaskStore() }) {
  let names = null;   // tool names, read once from the server itself so this list can never drift from tools/list
  const toolNames = async () => names || (names = new Set((await withClient(buildServer, { ...serverOpts, callerKey: 'a2a:list' }, c => c.listTools())).tools.map(t => t.name)));

  return async function handle(body, callerKey) {
    const id = body && body.id;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(id, -32600, 'Invalid Request');
    const p = body.params || {};
    switch (body.method) {
      case 'message/send': {
        const msg = p.message;
        if (!msg || !Array.isArray(msg.parts)) return rpcError(id, -32602, 'Invalid params: params.message with parts is required');
        const req = parseRequest(msg);
        if (!req) return rpcError(id, -32602, 'Invalid params: send a text part, or a data part { tool, arguments }');
        const all = await toolNames();
        if (A2A_BLOCKED.has(req.tool)) return rpcError(id, -32602, `${req.tool} acts in the world and is not available over A2A. Use quote_ride: its book_url lets the person confirm the ride themselves.`);
        if (!all.has(req.tool)) return rpcError(id, -32602, `Unknown tool: ${req.tool}`, { tools: [...all].filter(n => !A2A_BLOCKED.has(n)).sort() });
        const task = { kind: 'task', id: uuid(), contextId: typeof msg.contextId === 'string' ? msg.contextId : uuid(), history: [{ ...msg, kind: 'message', role: msg.role || 'user', messageId: msg.messageId || uuid() }], metadata: { tool: req.tool, provider: 'https://bina.et' } };
        const t0 = Date.now(); let ok = false;
        try {
          const r = await withClient(buildServer, { ...serverOpts, callerKey }, c => c.callTool({ name: req.tool, arguments: req.args }));
          const text = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
          if (r.isError) {
            task.status = { state: 'failed', timestamp: new Date().toISOString(), message: agentMessage(text || 'The tool returned an error.', task.contextId, task.id) };
          } else {
            const parts = [{ kind: 'text', text }];
            if (r.structuredContent) parts.push({ kind: 'data', data: r.structuredContent });
            task.artifacts = [{ artifactId: uuid(), name: req.tool, parts }];
            task.status = { state: 'completed', timestamp: new Date().toISOString() };
            ok = true;
          }
        } catch (e) {
          console.error('[a2a] call failed:', e && e.message);
          task.status = { state: 'failed', timestamp: new Date().toISOString(), message: agentMessage('Internal error in BinaSmart. Try again or use https://bina.et.', task.contextId, task.id) };
        } finally {
          console.log(JSON.stringify({ t: 'a2a', tool: req.tool, ms: Date.now() - t0, ok, caller: String(callerKey).slice(0, 24) }));
        }
        tasks.put(task);
        return { jsonrpc: '2.0', id, result: task };
      }
      case 'tasks/get': {
        const t = tasks.get(p.id);
        return t ? { jsonrpc: '2.0', id, result: t } : rpcError(id, -32001, 'Task not found');
      }
      case 'tasks/cancel':
        return tasks.get(p.id) ? rpcError(id, -32002, 'Task cannot be canceled: it has already finished') : rpcError(id, -32001, 'Task not found');
      case 'message/stream':
      case 'tasks/resubscribe':
        return rpcError(id, -32004, 'This operation is not supported: use message/send (answers come back in one response)');
      default:
        if (body.method.startsWith('tasks/pushNotificationConfig/')) return rpcError(id, -32003, 'Push notifications are not supported');
        return rpcError(id, -32601, 'Method not found');
    }
  };
}
