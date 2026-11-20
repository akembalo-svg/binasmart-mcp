// A2A step 2: one agent per company page (lib/a2a-business.mjs), through the real express app. 24 Oct 2026.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { makeBusinessAgents } from '../lib/a2a-business.mjs';
import { makeRequestDesk } from '../lib/a2a-requests.mjs';
import apiGate from '../../api/gate.js';

const companies = [
  { slug: 'markon-cars', kind: 'car_seller', name: 'Markon Car Importer', sub: 'Bole', website: 'https://markon.example', confirmed: false, url: 'https://bina.et/companies/markon-cars' },
  { slug: 'mon-real-estate', kind: 'real_estate', name: 'Mon Real Estate', sub: 'Kirkos', confirmed: true, url: 'https://bina.et/companies/mon-real-estate' },
  { slug: 'abc-agency', kind: 'domestic_agency', name: 'ABC Foreign Employment Agent', sub: 'Arada', confirmed: false, url: 'https://bina.et/companies/abc-agency' },
];
const queries = [];
const db = { query: async (sql, args) => {
  queries.push({ sql, args });
  if (/"CarListing"/.test(sql) && args[0] === 'markon-cars') return { rows: [
    { slug: 'markon-ev-1', title: 'BYD Seagull electric', make: 'BYD', model: 'Seagull', year: '2025', price: 'ETB 2,100,000', fuel: 'Electric', dealerPhone: '+251900000001' },
    { slug: 'markon-tz-2', title: 'Toyota Corolla 2018', make: 'Toyota', model: 'Corolla', year: '2018', price: 'ETB 3,000,000', fuel: 'Petrol' } ] };
  if (/"PropertyListing"/.test(sql) && args[0] === 'mon-real-estate') return { rows: [{ slug: 'mon-1', title: '2BR apartment CMC', listingType: 'rent', propertyType: 'Apartment', price: 'ETB 40,000', beds: '2' }] };
  return { rows: [] };
} };
const api = { search: async () => ({}), quote: async () => ({}), request: async () => ({}), status: async () => ({}), cancel: async () => ({}), settings: async () => ({ ok: true }), knowledge: async () => ({ results: [] }) };
const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-biz-')), proc: 'a2a-biz-test', proxyHeader: 'x-real-ip', anonPerHour: 1000 });
const businessAgents = makeBusinessAgents({ db, fetchCompanies: async () => companies });
// A2A_REQUESTS=1 in .env adds a "request" skill to every card (server.mjs), and envValue() reads .env off
// DISK, not process.env - so no test runner setting can hold it still. Until 24 Oct the skill assertions
// below silently read that live flag: the day the feature was switched on they went red, and nothing
// re-ran them to say so. The desk is stated here; the open case is asserted in its own test.
const closedDesk = makeRequestDesk({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-desk-')), 'r.json'), enabled: false });
const app = createApp({ rideApi: api, db, guides: new Map(), gate, businessAgents, requestDesk: closedDesk });
const srv = app.listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}/a2a/companies`;
after(() => srv.close());

const send = async (slug, parts, method = 'message/send') => (await fetch(`${base}/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '41.86.3.3' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 9, method, params: { message: { role: 'user', messageId: 'q', parts } } }) })).json();

test('agent card: run by BinaSmart, never as the company; confirmed only when the company confirmed; skills by kind', async () => {
  const car = await (await fetch(`${base}/markon-cars`)).json();
  assert.equal(car.protocolVersion, '0.3.0'); assert.equal(car.name, 'Markon Car Importer on BinaSmart');
  assert.equal(car.provider.organization, 'BinaSmart'); assert.equal(car.url, 'https://bina.et/a2a/companies/markon-cars');
  assert.match(car.description, /run by BinaSmart/); assert.match(car.description, /has not confirmed/);
  assert.deepEqual(car.skills.map(s => s.id), ['profile', 'cars']);
  const home = await (await fetch(`${base}/mon-real-estate/.well-known/agent-card.json`)).json();
  assert.equal(home.binasmart.confirmed_by_company, true); assert.deepEqual(home.skills.map(s => s.id), ['profile', 'homes']);
  const ag = await (await fetch(`${base}/abc-agency`)).json();
  assert.deepEqual(ag.skills.map(s => s.id), ['profile']); assert.match(ag.skills[0].description, /not a licence register/);
  assert.equal((await fetch(`${base}/no-such-company`)).status, 404);
});

// The other half of the flag: when the desk IS open the skill must appear, and it must still say that a
// request reaches the BinaSmart team and not the place. That sentence is the whole claim an outside agent
// relies on, so it is asserted, not assumed.
test('request skill: advertised only when the desk is open, and honest about who reads it', async () => {
  const open = createApp({ rideApi: api, db, guides: new Map(), gate, businessAgents,
    requestDesk: makeRequestDesk({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-open-')), 'r.json'), enabled: true }) });
  const s2 = open.listen(0, '127.0.0.1');
  await new Promise(r => s2.once('listening', r));
  const card = await (await fetch(`http://127.0.0.1:${s2.address().port}/a2a/companies/markon-cars`)).json();
  s2.close();
  assert.deepEqual(card.skills.map(s => s.id), ['profile', 'cars', 'request']);
  assert.match(card.skills.at(-1).description, /nothing is sent to the place automatically/);
});

test('GET /a2a/companies lists every company agent card', async () => {
  const j = await (await fetch(base)).json();
  assert.equal(j.count, 3); assert.equal(j.agents[0].agent_card, 'https://bina.et/a2a/companies/markon-cars');
});

test('a car seller agent answers text from ITS OWN listings by companySlug, with links and no phone numbers', async () => {
  const r = await send('markon-cars', [{ kind: 'text', text: 'Do you have any electric cars?' }]);
  const out = r.result.artifacts[0].parts[1].data;
  assert.equal(r.result.status.state, 'completed'); assert.equal(r.result.metadata.operated_by, 'BinaSmart');
  assert.equal(out.cars.length, 1); assert.equal(out.cars[0].url, 'https://bina.et/cars/markon-ev-1'); assert.equal(out.cars_total, 2);
  const pl = (await send('markon-cars', [{ kind: 'text', text: 'Toyotas?' }])).result.artifacts[0].parts[1].data;
  assert.equal(pl.cars.length, 1); assert.equal(pl.cars[0].make, 'Toyota');
  assert.ok(!JSON.stringify(r).includes('+251'), 'no phone number may leave');
  assert.equal(queries.at(-1).args[0], 'markon-cars'); assert.match(queries.at(-1).sql, /active = true/);
  // words that match nothing: newest listings instead, and it says so
  const none = (await send('markon-cars', [{ kind: 'text', text: 'Lamborghini' }])).result.artifacts[0].parts[1].data;
  assert.equal(none.cars.length, 2); assert.match(none.note, /None of the 2 cars matched/);
});

test('real estate agent: data part with skill + arguments; agency agent: profile + licence note; wrong skill refused', async () => {
  const r = await send('mon-real-estate', [{ kind: 'data', data: { skill: 'homes', arguments: { query: '2br' } } }]);
  const out = r.result.artifacts[0].parts[1].data;
  assert.equal(out.homes[0].url, 'https://bina.et/property/mon-1'); assert.equal(out.company.confirmed_by_company, true);
  const ag = (await send('abc-agency', [{ kind: 'text', text: 'Do you send workers to Saudi Arabia?' }])).result.artifacts[0].parts[1].data;
  assert.equal(ag.company.kind, 'domestic_agency'); assert.match(ag.note, /recruitment fee/); assert.equal(ag.cars, undefined);
  const bad = await send('abc-agency', [{ kind: 'data', data: { skill: 'cars' } }]);
  assert.equal(bad.error.code, -32602);
});

test('unknown company, tasks/get scoped to its company, unsupported methods', async () => {
  assert.equal((await send('no-such-company', [{ kind: 'text', text: 'hi' }])).error.code, -32001);
  const t = (await send('mon-real-estate', [{ kind: 'text', text: 'rent' }])).result;
  const get = async (slug) => (await fetch(`${base}/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { id: t.id } }) })).json();
  assert.equal((await get('mon-real-estate')).result.id, t.id);
  assert.equal((await get('markon-cars')).error.code, -32001);
  assert.equal((await send('markon-cars', [], 'message/stream')).error.code, -32004);
});
