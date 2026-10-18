// BinaSmart public MCP server (streamable HTTP, stateless). pm2 "bina-mcp" on 127.0.0.1:3021;
// nginx proxies https://bina.et/mcp here. Docs: GET /mcp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { makeLimiter } from './lib/limiter.mjs';
import apiGate from '../api/gate.js';
import apiKeystore from '../api/keystore.js';
import { envValue } from './lib/env.mjs';
import { registerRideTools, toolError } from './tools/ride.mjs';
import { registerDirectoryTools } from './tools/directory.mjs';
import { registerGuideTools, loadGuides } from './tools/guides.mjs';
import { registerKnowledgeTools } from './tools/knowledge.mjs';
import { registerContentTools } from './tools/content.mjs';
import { registerJobTools } from './tools/jobs.mjs';
import { registerMarketTools } from './tools/market.mjs';
import { registerHealthTools } from './tools/health.mjs';
import { registerAgencyTools } from './tools/agencies.mjs';
import { registerWidgets } from './lib/widgets.mjs';
import { OUTPUTS } from './lib/outputs.mjs';

const { makeGate } = apiGate;
const { makeKeystore } = apiKeystore;
const API_KEY_PEPPER = envValue('API_KEY_PEPPER');

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version;
const DOCS_MD = fs.existsSync(path.join(here, 'docs.md')) ? fs.readFileSync(path.join(here, 'docs.md'), 'utf8') : '# BinaSmart MCP server\n';

const INSTRUCTIONS =
  'BinaSmart (bina.et) is Ethiopia\'s all-in-one digital platform. Tools: fixed-price ride-hailing in Addis Ababa only ' +
  '(quote_ride → request_ride → get_ride_status / cancel_ride), a directory of buildings, hotels, hospitals and shops ' +
  '(search_places, get_hotel_rooms, get_hospital_departments), hospitals, clinics, dentists, labs and doctors across Addis with ' +
  'their bina.et/health pages (search_health; not medical advice, emergencies 907), homes for sale and rent (search_properties), cars for sale ' +
  '(search_cars), hotels and guest houses (search_hotels), upcoming events (list_events), open Ethiopian tender ' +
  'notices with deadlines (list_tenders, list_tender_categories, get_tender), Amharic news (list_news, ' +
  'get_news_article), 25 bilingual Digital ' +
  'Ethiopia guides (get_ethiopia_guide), licensed Ethiopian overseas employment agencies with their GCC partner offices (list_overseas_agencies), BinaPool shared commute (list_pool_corridors, find_pool_groups), job ' +
  'vacancies and the companies posting them (list_jobs, get_job, list_job_fields, get_employer), Amharic films (list_films) and a knowledge ' +
  'base about every BinaSmart service, Ethiopian paperwork and practical Addis Ababa life (search_knowledge). ' +
  'request_ride sends a real driver, so it takes the pickup, drop-off, tier, fare and Ethiopian phone as the user confirmed them; ' +
  'quote_ride also returns book_url, which opens bina.et/ride with that route and fixed fare for the user to confirm themselves. Fares ' +
  'come from quote_ride and the pool board, official portal names and links from the guides, and every result carries its source_url. ' +
  'Site guide: https://bina.et/llms.txt';

// structuredContent is the same object as the text, round-tripped through JSON (dates become strings, undefined
// fields drop), so it always matches what the text says and the tool's outputSchema in lib/outputs.mjs.
export function json(data) {
  const text = JSON.stringify(data, null, 2);
  const r = { content: [{ type: 'text', text }] };
  if (data && typeof data === 'object' && !Array.isArray(data)) r.structuredContent = JSON.parse(text);
  return r;
}

// Safety net for the output schemas: if a result ever has a field of an unexpected type, log it and drop just that
// field from structuredContent (the text keeps everything), instead of letting the SDK reject the whole call.
export function fitOutput(name, r) {
  const schema = OUTPUTS[name];
  if (!schema || !r || r.isError || !r.structuredContent) return r;
  for (let i = 0; i < 5; i++) {
    const v = schema.safeParse(r.structuredContent);
    if (v.success) return r;
    console.error(JSON.stringify({ t: 'output_mismatch', name, issues: v.error.issues.slice(0, 5).map(x => ({ path: x.path.join('.'), msg: x.message })) }));
    for (const issue of v.error.issues) {
      const path = issue.path; let o = r.structuredContent;
      for (const k of path.slice(0, -1)) { if (o == null || typeof o !== 'object') { o = null; break; } o = o[k]; }
      if (o && typeof o === 'object' && path.length) { if (Array.isArray(o)) o[path[path.length - 1]] = {}; else delete o[path[path.length - 1]]; }
    }
  }
  return r;
}

// One McpServer per request (stateless). `callerKey` feeds the per-caller limiters.
export function buildServer({ rideApi, db, guides, callerKey, callsRL, bookRL }) {
  const server = new McpServer({ name: 'binasmart', version: VERSION }, { instructions: INSTRUCTIONS });
  // The Claude directory reads a tool's display name from annotations.title (MCP ToolAnnotations), not only from the tool's
  // title: every tool, registerAppTool ones included, gets both from the one title it is registered with. 2026-10-11
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, cb) => register(name, { ...config, outputSchema: config.outputSchema || OUTPUTS[name], annotations: { title: config.title, ...(config.annotations || {}) } }, cb);
  const wrap = (name, fn) => async (args) => {
    if (!callsRL(callerKey)) return toolError('Slow down — too many tool calls from this session. Wait a minute and try again.');
    if (name === 'request_ride' && !bookRL(callerKey)) return toolError('Slow down — this session has booked too many rides this hour.');
    const t0 = Date.now(); let ok = true;
    try { const r = await fn(args); ok = !r.isError; return fitOutput(name, r); }
    catch (e) { ok = false; console.error(`[mcp] ${name} threw:`, e && e.message); return toolError('Internal error in BinaSmart MCP. Try again or use https://bina.et.'); }
    finally { console.log(JSON.stringify({ t: 'tool', name, ms: Date.now() - t0, ok, caller: String(callerKey).slice(0, 24) })); }
  };
  registerRideTools(server, { api: rideApi, wrap, json });
  registerDirectoryTools(server, { db, wrap, json });
  registerAgencyTools(server, { wrap, json });
  registerGuideTools(server, { guides, wrap, json });
  registerKnowledgeTools(server, { api: rideApi, wrap, json });
  registerContentTools(server, { db, wrap, json });
  registerJobTools(server, { db, wrap, json });
  registerMarketTools(server, { wrap, json });
  registerHealthTools(server, { wrap, json });
  registerWidgets(server);
  return server;
}

export function createApp({ rideApi, db, guides, callLimit = { windowMs: 60_000, max: 30 }, bookLimit = { windowMs: 3_600_000, max: 10 },
  // The meter (api/gate.js), shared with binasmart-api through /root/storage/api/usage: ONE anonymous
  // allowance across bina.et/mcp and bina.et/api/knowledge/search, because they are two doors onto the
  // same 23,463 chunks. Injectable so a test never writes to the real counter directory.
  gate = makeGate({ proc: 'mcp', proxyHeader: 'x-real-ip', salt: API_KEY_PEPPER,
    keystore: makeKeystore({ pepper: API_KEY_PEPPER }),
    anonPerHour: Number(envValue('API_ANON_PER_HOUR') || 20) }) }) {
  const callsRL = makeLimiter(callLimit.windowMs, callLimit.max);
  const bookRL = makeLimiter(bookLimit.windowMs, bookLimit.max);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, X-API-Key');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.post('/mcp', async (req, res) => {
    // The handshake - initialize, the notifications that follow it, ping - is recorded but not charged.
    // It costs a harvester nothing, and charging it would spend a fifth of an honest assistant's hourly
    // allowance before the person has asked anything.
    const method = String((req.body && req.body.method) || '');
    // Reading a ui:// widget page (MCP Apps) is free as well: the same static HTML for everyone, not data. 2026-10-11
    const uri = String((req.body && req.body.params && req.body.params.uri) || '');
    const free = method === 'initialize' || method === 'ping' || method.startsWith('notifications/')
      || method === 'resources/list' || (method === 'resources/read' && uri.startsWith('ui://'));
    const d = gate.check({ headers: req.headers, ip: req.ip, endpoint: free ? 'mcp:' + (method || 'unknown') : 'mcp', charge: !free });
    if (!d.allowed) {
      res.setHeader('Retry-After', String(d.retryAfter));
      return res.status(d.status).json(d.body);
    }
    // Who is being counted: the API key if there is one, otherwise the address nginx saw. It used to be
    // Mcp-Session-Id first - a value the CLIENT invents - which made the 30-calls-a-minute limit below an
    // honour system: a new session id per call and it never fired. The session id keeps its own job,
    // MCP's session semantics, and no longer decides anything about rate limiting.
    const callerKey = d.caller;
    try {
      const server = buildServer({ rideApi, db, guides, callerKey, callsRL, bookRL });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('[mcp] transport error:', e && e.message);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });
  // MCP clients open GET /mcp with Accept: text/event-stream for server→client notifications. This
  // stateless server has none; answering 405 (allowed by the spec) stops clients re-polling every second.
  // Browsers and crawlers (Accept: text/html or */*) get the docs.
  app.get('/mcp', (req, res) => {
    if (/text\/event-stream/i.test(req.headers.accept || '')) return res.sendStatus(405);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=3600'); res.send(DOCS_MD);
  });
  app.delete('/mcp', (_req, res) => res.sendStatus(405));
  app.get('/mcp/health', async (_req, res) => {
    const out = { ok: true, db: true, ride_api: true };
    try { await db.query('SELECT 1', []); } catch { out.db = false; }
    try { const s = await rideApi.settings(); if (!s || s.ok === false) out.ride_api = false; } catch { out.ride_api = false; }
    out.ok = out.db && out.ride_api;
    res.status(out.ok ? 200 : 503).json(out);
  });
  return app;
}

// Entry point is start.mjs (pm2 runs scripts through its own wrapper, so an argv[1] "run if main" check never fires).
export async function main() {
  const [{ default: pg }, { databaseUrl }, { makeRideApi }] = await Promise.all([import('pg'), import('./lib/env.mjs'), import('./lib/rideApi.mjs')]);
  const PORT = Number(process.env.PORT || 3021);
  const db = new pg.Pool({ connectionString: databaseUrl(), max: 4, idleTimeoutMillis: 30_000 });
  db.on('error', e => console.error('[mcp] pg pool error:', e.message));
  const rideApi = makeRideApi({ baseUrl: process.env.RIDE_API || 'http://127.0.0.1:4210', timeoutMs: 8000 });
  const guides = await loadGuides(path.join(here, '..', 'public'));
  const app = createApp({ rideApi, db, guides });
  app.listen(PORT, '127.0.0.1', () => console.log(`binasmart MCP server on 127.0.0.1:${PORT}, guides loaded: ${guides.size}`));
}
