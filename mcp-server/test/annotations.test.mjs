import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import apiGate from '../../api/gate.js';

// What the Claude directory portal checks on every tool (Tools step): a title in annotations.title as well as the tool's
// own title, and a readOnlyHint (true for reads; false plus destructiveHint where it applies for writes). Descriptions
// say what a tool does; they do not tell the assistant how to behave.
const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-mcp-gate-')), proc: 'mcp-test', proxyHeader: 'x-real-ip', anonPerHour: 1000 });
const app = createApp({ rideApi: { settings: async () => ({ ok: true }) }, db: { query: async () => ({ rows: [] }) }, guides: new Map(), gate });
const srv = app.listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
after(() => srv.close());
const res = await fetch(`http://127.0.0.1:${srv.address().port}/mcp`, { method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
const text = await res.text();
const tools = JSON.parse((text.split('\n').find(l => l.startsWith('data:')) || 'data:' + text).slice(5)).result.tools;

test('every tool has a title, the same title in annotations.title, and a readOnlyHint', () => {
  assert.equal(tools.length, 27);
  for (const t of tools) {
    assert.ok(t.title, t.name + ' title');
    assert.equal(t.annotations && t.annotations.title, t.title, t.name + ' annotations.title');
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name + ' readOnlyHint');
  }
  assert.deepEqual(tools.filter(t => !t.annotations.readOnlyHint).map(t => t.name).sort(), ['cancel_ride', 'request_ride']);
  assert.equal(tools.find(t => t.name === 'cancel_ride').annotations.destructiveHint, true);
});

test('no description or parameter tells the assistant what to do', () => {
  const RX = /\b(never|always|must|tell the (user|guest|rider)|confirm with the user|you should|call it first|cite source_url|override model memory)\b/i;
  for (const t of tools) {
    assert.doesNotMatch(t.description || '', RX, t.name);
    for (const [k, v] of Object.entries((t.inputSchema && t.inputSchema.properties) || {})) assert.doesNotMatch((v && v.description) || '', RX, t.name + '.' + k);
  }
});
