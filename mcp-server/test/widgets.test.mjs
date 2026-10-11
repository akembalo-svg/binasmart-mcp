import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { JOBS_WIDGET_URI, jobsWidgetHtml } from '../lib/widgets.mjs';
import apiGate from '../../api/gate.js';

// MCP Apps: list_jobs names a ui:// resource, the resource is the job-card page with the ext-apps bundle inlined, and
// reading it costs a caller nothing (it is a static page, not data).
const guides = new Map();
const job = { slug: 'nurse-x', title: 'Nurse', titleAm: null, city: 'Addis Ababa', jobType: 'full-time', category: 'health',
  summary: 'Ward nurse', salary: null, experience: null, education: null, vacancies: 2, deadline: new Date(Date.now() + 5 * 86400000),
  publishedAt: new Date(), sourceName: 'Example board', employer: 'Example Hospital', employer_slug: 'example-hospital', verified: false, logoUrl: null };
const db = { query: async sql => ({ rows: /FROM "Job" j JOIN/.test(sql) ? [job] : [] }) };
const api = { search: async () => ({ ok: true, results: [] }), settings: async () => ({ ok: true }) };
const servers = [];
function start(anonPerHour) {
  const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-mcp-gate-')), proc: 'mcp-test', proxyHeader: 'x-real-ip', anonPerHour });
  const srv = createApp({ rideApi: api, db, guides, gate }).listen(0, '127.0.0.1');
  servers.push(srv);
  return new Promise(r => srv.once('listening', () => r(`http://127.0.0.1:${srv.address().port}/mcp`)));
}
after(() => servers.forEach(s => s.close()));
async function rpc(url, method, params, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('data:'));
  return { status: res.status, body: JSON.parse(line ? line.slice(5) : text) };
}

test('the widget page inlines the ext-apps bundle as globalThis.ExtApps', () => {
  const html = jobsWidgetHtml();
  assert.ok(!html.includes('/*__EXT_APPS_BUNDLE__*/'));
  assert.match(html, /globalThis\.ExtApps=\{[^}]*\bApp:/);
  // Two module scripts: the bundle on its own (its minified top-level names would clash with the page's), then the page.
  assert.equal((html.match(/<\/script>/g) || []).length, 2, 'the bundle cannot close its script early');
  assert.match(html, /globalThis\.ExtApps=\{[^}]*\};<\/script>\s*<script type="module">\s*const EXT = globalThis\.ExtApps/);
});

test('list_jobs names the widget; resources/list and resources/read serve it as an MCP App', async () => {
  const url = await start(1000);
  const tools = (await rpc(url, 'tools/list', {})).body.result.tools;
  const lj = tools.find(t => t.name === 'list_jobs');
  assert.equal(lj._meta.ui.resourceUri, JOBS_WIDGET_URI);
  assert.equal(lj._meta['ui/resourceUri'], JOBS_WIDGET_URI);
  assert.equal(lj.annotations.readOnlyHint, true);
  assert.equal(tools.filter(t => t._meta && t._meta.ui).length, 1, 'only list_jobs has a widget');
  const res = (await rpc(url, 'resources/list', {})).body.result.resources;
  assert.deepEqual(res.map(r => [r.uri, r.mimeType]), [[JOBS_WIDGET_URI, 'text/html;profile=mcp-app']]);
  const read = (await rpc(url, 'resources/read', { uri: JOBS_WIDGET_URI })).body.result.contents[0];
  assert.equal(read.mimeType, 'text/html;profile=mcp-app');
  assert.match(read.text, /BinaSmart job cards/);
  assert.deepEqual(read._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
});

test('list_jobs still returns the same JSON text (hosts without the apps surface)', async () => {
  const url = await start(1000);
  const r = (await rpc(url, 'tools/call', { name: 'list_jobs', arguments: { field: 'health' } })).body.result;
  const data = JSON.parse(r.content[0].text);
  assert.equal(data.count, 1);
  assert.equal(data.jobs[0].url, 'https://bina.et/jobs/nurse-x');
  assert.equal(data.jobs[0].closed, false);
  assert.match(data.note, /never charges a job seeker/);
});

test('reading the widget page is free; data calls are still metered', async () => {
  // Loopback callers are exempt from the meter, so this test speaks as an outside address (nginx sets X-Real-IP).
  const url = await start(1);
  const rpcOut = (m, p) => rpc(url, m, p, { 'x-real-ip': '203.0.113.7' });
  for (let i = 0; i < 3; i++) assert.equal((await rpcOut('resources/read', { uri: JOBS_WIDGET_URI })).status, 200);
  assert.equal((await rpcOut('resources/list', {})).status, 200);
  assert.equal((await rpcOut('tools/list', {})).status, 200);
  assert.equal((await rpcOut('tools/list', {})).status, 429);
  assert.equal((await rpcOut('resources/read', { uri: 'ui://bina/jobs-v1.html' })).status, 200, 'still free after the allowance is spent');
});
