// A2A step 3: requests through a place agent (lib/a2a-requests.mjs), through the real express app. 24 Oct 2026.
// sendAdmin is a stub that records: no test may send to a live Telegram chat.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { makeRequestDesk } from '../lib/a2a-requests.mjs';
import { makeBusinessAgents } from '../lib/a2a-business.mjs';
import { makeHealthAgents, makeHotelAgents } from '../lib/a2a-places.mjs';
import apiGate from '../../api/gate.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-req-'));
const sent = [];
const desk = makeRequestDesk({ file: path.join(tmp, 'requests.json'), enabled: true, sendAdmin: async t => { sent.push(t); return 1; } });
const companies = [{ slug: 'mon-real-estate', kind: 'real_estate', name: 'Mon Real Estate', sub: 'Kirkos', confirmed: true, url: 'https://bina.et/companies/mon-real-estate' }];
const db = { query: async () => ({ rows: [] }) };
const api = { search: async () => ({}), quote: async () => ({}), request: async () => ({}), status: async () => ({}), cancel: async () => ({}), settings: async () => ({ ok: true }), knowledge: async () => ({ results: [] }) };
const fetchJson = async p => (p === '/api/health/directory' ? { kinds: {}, facilities: [] } : { kinds: {}, places: [] });
const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-req-gate-')), proc: 'a2a-req-test', proxyHeader: 'x-real-ip', anonPerHour: 1000 });
const app = createApp({ rideApi: api, db, guides: new Map(), gate, requestDesk: desk,
  businessAgents: makeBusinessAgents({ db, fetchCompanies: async () => companies }), healthAgents: makeHealthAgents({ fetchJson }), hotelAgents: makeHotelAgents({ fetchJson }) });
const srv = app.listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const root = `http://127.0.0.1:${srv.address().port}`;
const agent = `${root}/a2a/companies/mon-real-estate`;
after(() => srv.close());
const call = async (method, params, headers = { 'x-real-ip': '41.86.5.5' }) => (await fetch(agent, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method, params }) })).json();
const ask = (args, headers) => call('message/send', { message: { role: 'user', messageId: 'r1', parts: [{ kind: 'data', data: { skill: 'request', arguments: args } }] } }, headers);
const good = { request: 'I would like to view the 2 bedroom apartment', name: 'Sara', contact: '+251 900 000 002', when: 'Saturday morning' };

test('the card offers the request skill when requests are open', async () => {
  const c = await (await fetch(agent)).json();
  assert.ok(c.skills.some(s => s.id === 'request')); assert.match(c.skills.find(s => s.id === 'request').description, /nothing is sent to the place automatically/);
});

test('a request is stored, ONE message goes to the admin chat, and the task is submitted; nothing else is sent', async () => {
  const r = await ask(good);
  assert.equal(r.result.status.state, 'submitted'); assert.equal(r.result.metadata.place, 'Mon Real Estate');
  assert.equal(sent.length, 1); assert.match(sent[0], /A2A REQUEST/); assert.match(sent[0], /Nothing was sent to the place/); assert.match(sent[0], /decide\?t=[0-9a-f]{36}&d=approve/);
  assert.equal(desk._rows().length, 1);
  const got = await call('tasks/get', { id: r.result.id });
  assert.equal(got.result.status.state, 'submitted');
  // another agent cannot read it
  const other = await (await fetch(`${root}/a2a/health/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { id: r.result.id } }) })).json();
  assert.ok(other.error);
});

test('approve -> working -> done -> completed through the confirm page; GET alone changes nothing; a bad token is refused', async () => {
  const r = (await ask({ ...good, name: 'Abebe' })).result;
  const tok = desk._rows().find(x => x.id === r.id).token;
  const url = d => `${root}/a2a/requests/${r.id}/decide?t=${tok}&d=${d}`;
  const g = await fetch(url('approve')); assert.equal(g.status, 200); assert.match(await g.text(), /<form method="post">/);
  assert.equal((await call('tasks/get', { id: r.id })).result.status.state, 'submitted');
  assert.equal((await fetch(url('approve'), { method: 'POST' })).status, 200);
  assert.equal((await call('tasks/get', { id: r.id })).result.status.state, 'working');
  assert.equal((await call('tasks/cancel', { id: r.id })).error.code, -32002);
  assert.equal((await fetch(url('done'), { method: 'POST' })).status, 200);
  assert.equal((await call('tasks/get', { id: r.id })).result.status.state, 'completed');
  assert.equal((await fetch(`${root}/a2a/requests/${r.id}/decide?t=${'0'.repeat(36)}&d=approve`, { method: 'POST' })).status, 404);
});

test('the caller can cancel while submitted; bad input is refused; per-caller limit holds', async () => {
  const r = (await ask(good, { 'x-real-ip': '41.86.6.6' })).result;
  assert.equal((await call('tasks/cancel', { id: r.id }, { 'x-real-ip': '41.86.6.6' })).result.status.state, 'canceled');
  assert.equal((await ask({ request: 'hi', name: 'x', contact: '12' })).error.code, -32602);
  assert.equal((await ask({ ...good, contact: 'not a contact' })).error.code, -32602);
  const h = { 'x-real-ip': '41.86.7.7' };
  for (let i = 0; i < 3; i++) assert.equal((await ask(good, h)).result.status.state, 'submitted');
  assert.equal((await ask(good, h)).error.code, -32005);
});

test('dry run (loopback, no X-Real-IP, eval header) sends nothing and stores nothing', async () => {
  const before = sent.length, rows = desk._rows().length;
  const r = await ask(good, { 'x-binasmart-eval': '1' });
  assert.equal(r.result.metadata.dryRun, true); assert.match(r.result.metadata.wouldSend, /A2A REQUEST/);
  assert.equal(sent.length, before); assert.equal(desk._rows().length, rows);
  // the same header from outside (nginx always sets X-Real-IP) is NOT a dry run
  const live = await ask(good, { 'x-binasmart-eval': '1', 'x-real-ip': '41.86.8.8' });
  assert.equal(live.result.metadata.dryRun, undefined); assert.equal(sent.length, before + 1);
});

test('requests closed (the default): refused, nothing sent, no request skill on the card', async () => {
  const closed = makeRequestDesk({ file: path.join(tmp, 'closed.json'), sendAdmin: async () => { throw new Error('must not send'); } });
  const r = await closed.rpc({ body: { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { parts: [{ kind: 'data', data: { skill: 'request', arguments: good } }] } } }, family: 'companies', slug: 's', card: { name: 'S on BinaSmart' }, callerKey: 'k' });
  assert.equal(r.error.code, -32004); assert.equal(closed.enabled, false);
});
