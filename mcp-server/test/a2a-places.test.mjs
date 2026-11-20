// A2A step 2: one agent per health facility and per hotel (lib/a2a-places.mjs), through the real express app. 24 Oct 2026.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { makeHealthAgents, makeHotelAgents } from '../lib/a2a-places.mjs';
import { makeBusinessAgents } from '../lib/a2a-business.mjs';
import { makeRequestDesk } from '../lib/a2a-requests.mjs';
import apiGate from '../../api/gate.js';

const HEALTH = { kinds: { hospital: 'Hospital', pharmacy: 'Pharmacy' }, facilities: [
  { slug: 'addis-hiwot-h1', name: 'Addis Hiwot General Hospital', kind: 'hospital', sub: 'Bole', lat: 9.01, lng: 38.78, phone: '7560', services: ['Emergency', 'Maternity'], doctors: 0, confirmed: false, emergency: true },
  { slug: 'zogdom-pharmacy-n1', name: 'Zogdom Pharmacy', kind: 'pharmacy', sub: 'Kirkos', lat: 9.0, lng: 38.75, phone: null, services: [], doctors: 0, confirmed: true, emergency: false } ] };
const HOTELS = { kinds: { hotel: { en: 'Hotel', am: 'ሆቴል' } }, places: [
  { slug: 'golden-tulip-n4', name: 'Golden Tulip', kind: 'hotel', sub: 'Bole', stars: 5, phone: false, website: false, claimed: false, photos: 0, lat: 8.99, lng: 38.78, air: { km: 2.4, min: 3, fare: 155 }, fac: ['wifi', 'spa'], from: null } ] };
let medicineReply = null;
const fetchJson = async (p) => {
  if (p === '/api/health/directory') return HEALTH;
  if (p === '/api/hotels/directory') return HOTELS;
  if (p.startsWith('/api/health/search')) return medicineReply;
  throw new Error('unexpected ' + p);
};
const api = { search: async () => ({}), quote: async () => ({}), request: async () => ({}), status: async () => ({}), cancel: async () => ({}), settings: async () => ({ ok: true }), knowledge: async () => ({ results: [] }) };
const gate = apiGate.makeGate({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-places-')), proc: 'a2a-places-test', proxyHeader: 'x-real-ip', anonPerHour: 1000 });
const db = { query: async () => ({ rows: [] }) };
// A2A_REQUESTS=1 in .env adds a "request" skill to every card (server.mjs), and envValue() reads .env off
// DISK, not process.env - so no test runner setting can hold it still. Until 24 Oct the skill assertions
// below silently read that live flag: the day the feature was switched on they went red, and nothing
// re-ran them to say so. The desk is stated here; the open case is asserted in its own test.
const closedDesk = makeRequestDesk({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bina-a2a-desk-')), 'r.json'), enabled: false });
const app = createApp({ rideApi: api, db, guides: new Map(), gate, requestDesk: closedDesk,
  businessAgents: makeBusinessAgents({ db, fetchCompanies: async () => [] }), healthAgents: makeHealthAgents({ fetchJson }), hotelAgents: makeHotelAgents({ fetchJson }) });
const srv = app.listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const root = `http://127.0.0.1:${srv.address().port}/a2a`;
after(() => srv.close());
const send = async (fam, slug, parts) => (await fetch(`${root}/${fam}/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '41.86.4.4' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'message/send', params: { message: { role: 'user', messageId: 'q', parts } } }) })).json();
const data = r => r.result.artifacts[0].parts[1].data;

test('health cards: run by BinaSmart, not medical advice, medicine skill only for pharmacies; list endpoint', async () => {
  const h = await (await fetch(`${root}/health/addis-hiwot-h1`)).json();
  assert.equal(h.name, 'Addis Hiwot General Hospital on BinaSmart'); assert.equal(h.provider.organization, 'BinaSmart');
  assert.match(h.description, /run by BinaSmart/); assert.match(h.description, /907/); assert.match(h.description, /has not confirmed/);
  assert.deepEqual(h.skills.map(s => s.id), ['profile']);
  const p = await (await fetch(`${root}/health/zogdom-pharmacy-n1/.well-known/agent-card.json`)).json();
  assert.deepEqual(p.skills.map(s => s.id), ['profile', 'medicine']); assert.equal(p.binasmart.confirmed_by_facility, true);
  const l = await (await fetch(`${root}/health`)).json();
  assert.equal(l.count, 2); assert.equal(l.agents[0].agent_card, 'https://bina.et/a2a/health/addis-hiwot-h1');
});

test('hospital agent answers its profile with the 907 note; a medicine skill on a hospital is refused', async () => {
  const o = data(await send('health', 'addis-hiwot-h1', [{ kind: 'text', text: 'Do you have an emergency room?' }]));
  assert.equal(o.facility.emergency, true); assert.equal(o.facility.phone, '7560'); assert.match(o.note, /907/);
  assert.equal((await send('health', 'addis-hiwot-h1', [{ kind: 'data', data: { skill: 'medicine' } }])).error.code, -32602);
});

test('pharmacy agent: confirmed only when THIS pharmacy is in the results; never "probably"; controlled medicines not searched', async () => {
  medicineReply = { medicine: { found: true, medicine: { name: 'Amoxicillin', prescription: true }, results: [{ url: 'https://bina.et/health/zogdom-pharmacy-n1', confirmed: '2 h ago' }], askUrl: 'https://bina.et/health/medicine?q=Amoxicillin&ask=1', freshness: '7 days' } };
  let m = data(await send('health', 'zogdom-pharmacy-n1', [{ kind: 'text', text: 'amoxicillin' }])).medicine;
  assert.equal(m.this_pharmacy_confirmed, true); assert.equal(m.confirmed, '2 h ago'); assert.equal(m.prescription, true);
  medicineReply = { medicine: { found: true, medicine: { name: 'Amoxicillin' }, results: [{ url: 'https://bina.et/health/other-pharmacy', confirmed: '1 h ago' }], askUrl: 'https://bina.et/health/medicine?q=Amoxicillin&ask=1' } };
  m = data(await send('health', 'zogdom-pharmacy-n1', [{ kind: 'text', text: 'amoxicillin' }])).medicine;
  assert.equal(m.this_pharmacy_confirmed, false); assert.match(m.say, /Never say it probably has it/); assert.match(m.ask_url, /ask=1/);
  medicineReply = { medicine: { found: true, controlled: true } };
  m = data(await send('health', 'zogdom-pharmacy-n1', [{ kind: 'text', text: 'morphine' }])).medicine;
  assert.equal(m.controlled, true); assert.equal(m.this_pharmacy_confirmed, undefined);
});

test('hotel agent: card and profile with airport fare, no phone, claimed flag; unknown hotel and wrong skill', async () => {
  const c = await (await fetch(`${root}/hotels/golden-tulip-n4`)).json();
  assert.equal(c.name, 'Golden Tulip on BinaSmart'); assert.match(c.description, /has not claimed/); assert.match(c.description, /Hotel in Bole/);
  const o = data(await send('hotels', 'golden-tulip-n4', [{ kind: 'text', text: 'How far from the airport?' }]));
  assert.equal(o.hotel.stars, 5); assert.equal(o.hotel.from_bole_airport.binaride_fare_etb, 155); assert.equal(o.hotel.claimed_by_hotel, false);
  assert.equal(o.hotel.phone, undefined);
  assert.equal((await send('hotels', 'nope', [{ kind: 'text', text: 'hi' }])).error.code, -32001);
  assert.equal((await send('hotels', 'golden-tulip-n4', [{ kind: 'data', data: { skill: 'rooms' } }])).error.code, -32602);
  assert.equal((await fetch(`${root}/hotels/nope`)).status, 404);
});
