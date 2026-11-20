// A2A front door (lib/a2a.mjs) through the real express app, 24 Oct 2026.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { parseRequest, makeTaskStore } from '../lib/a2a.mjs';
import apiGate from '../../api/gate.js';

const guides = new Map([['fayda', { slug: 'fayda', title: 'Fayda', summary: 'ID', url: 'https://bina.et/fayda', text: '# Fayda\nHello' }]]);
const db = { query: async () => ({ rows: [] }) };
let asked = null, requested = 0;
const api = {
  search: async () => ({ ok: true, results: [] }), quote: async () => ({}), status: async () => ({}), cancel: async () => ({}), settings: async () => ({ ok: true }),
  request: async () => { requested++; return {}; },
  knowledge: async (q) => { asked = q; return { query: q, results: [{ title: 'Fayda', url: 'https://bina.et/fayda', text: 'National ID' }] }; },
};
const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-gate-')), proc: 'a2a-test', proxyHeader: 'x-real-ip', anonPerHour: 1000 });
const app = createApp({ rideApi: api, db, guides, gate });
const srv = app.listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const url = `http://127.0.0.1:${srv.address().port}/a2a`;
after(() => srv.close());

async function rpc(method, params, raw) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '41.86.2.2' }, body: raw ?? JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }) });
  return { status: res.status, body: await res.json() };
}
const msg = parts => ({ message: { role: 'user', messageId: 'm1', parts } });

test('parseRequest: a data part naming a tool wins; text goes to search_knowledge; nothing usable is null', () => {
  assert.deepEqual(parseRequest({ parts: [{ kind: 'text', text: 'hi' }, { kind: 'data', data: { tool: 'list_news', arguments: { limit: 2 } } }] }), { tool: 'list_news', args: { limit: 2 } });
  assert.deepEqual(parseRequest({ parts: [{ kind: 'text', text: ' pharmacies in Bole ' }] }), { tool: 'search_knowledge', args: { query: 'pharmacies in Bole', k: 4 } });
  assert.equal(parseRequest({ parts: [{ kind: 'file', file: {} }] }), null);
  assert.equal(parseRequest(null), null);
});

test('message/send with a data part runs the MCP tool and returns a completed task with text + data artifacts', async () => {
  const { status, body } = await rpc('message/send', msg([{ kind: 'data', data: { tool: 'get_ethiopia_guide', arguments: { slug: 'fayda' } } }]));
  assert.equal(status, 200); assert.equal(body.id, 7);
  const t = body.result;
  assert.equal(t.kind, 'task'); assert.equal(t.status.state, 'completed'); assert.equal(t.metadata.tool, 'get_ethiopia_guide');
  assert.match(t.artifacts[0].parts[0].text, /"title": "Fayda"/);
  assert.equal(t.history[0].messageId, 'm1');
  // tasks/get returns the same task; cancelling a finished task is refused
  const g = await rpc('tasks/get', { id: t.id });
  assert.equal(g.body.result.id, t.id);
  assert.equal((await rpc('tasks/cancel', { id: t.id })).body.error.code, -32002);
  assert.equal((await rpc('tasks/get', { id: 'nope' })).body.error.code, -32001);
});

test('plain text goes to search_knowledge with the text as the query', async () => {
  const { body } = await rpc('message/send', msg([{ kind: 'text', text: 'How do I get a Fayda ID?' }]));
  assert.equal(body.result.status.state, 'completed');
  assert.equal(body.result.metadata.tool, 'search_knowledge');
  assert.equal(asked, 'How do I get a Fayda ID?');
  assert.match(body.result.artifacts[0].parts[0].text, /bina\.et\/fayda/);
});

test('request_ride and cancel_ride are refused over A2A and never reach the ride API', async () => {
  for (const tool of ['request_ride', 'cancel_ride']) {
    const { body } = await rpc('message/send', msg([{ kind: 'data', data: { tool, arguments: { phone: '+251900000000' } } }]));
    assert.equal(body.error.code, -32602); assert.match(body.error.message, /not available over A2A/);
  }
  assert.equal(requested, 0);
});

test('unknown tool lists the reachable tools (33 minus the 2 blocked)', async () => {
  const { body } = await rpc('message/send', msg([{ kind: 'data', data: { tool: 'make_coffee' } }]));
  assert.equal(body.error.code, -32602);
  assert.equal(body.error.data.tools.length, 31);
  assert.ok(!body.error.data.tools.includes('request_ride'));
});

test('JSON-RPC errors: bad request, unknown method, streaming, push, parse error', async () => {
  assert.equal((await rpc(null, null, JSON.stringify({ id: 1, method: 'message/send' }))).body.error.code, -32600);
  assert.equal((await rpc('nope/method', {})).body.error.code, -32601);
  assert.equal((await rpc('message/stream', msg([{ kind: 'text', text: 'x' }]))).body.error.code, -32004);
  assert.equal((await rpc('tasks/pushNotificationConfig/set', {})).body.error.code, -32003);
  assert.equal((await rpc('message/send', { message: {} })).body.error.code, -32602);
  assert.equal((await rpc(null, null, '{not json')).body.error.code, -32700);
});

test('GET /a2a points at the agent card', async () => {
  const r = await fetch(url); const j = await r.json();
  assert.equal(r.status, 200); assert.match(j.agentCard, /agent-card\.json$/);
});

test('task store forgets tasks after an hour', () => {
  let now = 0; const s = makeTaskStore(() => now);
  s.put({ id: 'a' }); assert.ok(s.get('a'));
  now = 3_600_001; assert.equal(s.get('a'), null);
});
