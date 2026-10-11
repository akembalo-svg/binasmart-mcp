import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRideTools, REVIEW_PHONE } from '../tools/ride.mjs';

// Directory reviewers book with the reserved number: real route and fare, nothing sent to the ride API's request, status
// or cancel, and the answer says it was a test. Every other number books for real, unchanged.
const json = d => ({ content: [{ type: 'text', text: JSON.stringify(d) }] });
const wrap = (_n, fn) => fn;
const out = r => JSON.parse(r.content[0].text);
function setup() {
  const calls = { request: 0, status: 0, cancel: 0, quote: 0 };
  const api = {
    search: async q => ({ ok: true, results: [{ label: q === 'edna' ? 'Edna Mall' : 'Piassa', lat: q === 'edna' ? 9.0 : 9.03, lng: 38.78 }] }),
    quote: async () => { calls.quote++; return { ok: true, distanceM: 5200, durationS: 900, quotes: [{ tier: 'economy', fareEtb: 250, etaMin: 15, label: 'Economy' }] }; },
    request: async b => { calls.request++; return { ok: true, ride: { id: 'r1', status: 'dispatching', fareEtb: 250, tier: b.tier, pickup: b.pickup, dropoff: b.dropoff, driver: null } }; },
    status: async () => { calls.status++; return { ok: true, ride: { id: 'r1', status: 'assigned', driver: null } }; },
    cancel: async () => { calls.cancel++; return { ok: true, ride: { id: 'r1', status: 'cancelled' } }; },
  };
  const reg = {};
  registerRideTools({ registerTool: (name, _def, fn) => { reg[name] = fn; } }, { api, wrap, json });
  return { reg, calls };
}
const booking = phone => ({ tier: 'economy', pickup: 'edna', dropoff: 'piassa', rider_name: 'Directory Reviewer', rider_phone: phone });

test('the reviewer number gets a real fare and a TEST booking; the ride API is never asked to book', async () => {
  assert.equal(REVIEW_PHONE, '+251900000099');
  for (const phone of ['0900000099', '+251900000099', '251 900 000 099']) {
    const { reg, calls } = setup();
    const r = out(await reg.request_ride(booking(phone)));
    assert.equal(r.test, true); assert.equal(r.status, 'test_booking'); assert.match(r.ride_id, /^TEST-/);
    assert.equal(r.fare_etb, 250); assert.equal(r.pickup, 'Edna Mall'); assert.match(r.note, /nothing was sent to a dispatcher or a driver/);
    assert.equal(calls.request, 0); assert.equal(calls.quote, 1);
  }
});

test('booking for a passenger on the reviewer number is a test too', async () => {
  const { reg, calls } = setup();
  const r = out(await reg.request_ride({ ...booking('+447700900123'), passenger_name: 'Test Passenger', passenger_phone: '0900000099' }));
  assert.equal(r.test, true); assert.equal(r.booked_for, 'Test Passenger'); assert.equal(calls.request, 0);
});

test('status and cancel of a TEST ride answer locally; anything else still goes to the ride API', async () => {
  const { reg, calls } = setup();
  assert.equal(out(await reg.get_ride_status({ ride_id: 'TEST-ABC123', rider_phone: '0900000099' })).status, 'test_booking');
  assert.equal(out(await reg.cancel_ride({ ride_id: 'TEST-ABC123', rider_phone: '0900000099' })).status, 'cancelled');
  assert.equal(calls.status + calls.cancel, 0);
  await reg.get_ride_status({ ride_id: 'r1xyz', rider_phone: '0900000099' });   // reviewer number, real-looking id: the API decides
  await reg.get_ride_status({ ride_id: 'TEST-ABC123', rider_phone: '0900000011' }); // TEST id, other number: the API decides
  assert.equal(calls.status, 2);
});

test('every other number books for real, unchanged', async () => {
  const { reg, calls } = setup();
  const r = out(await reg.request_ride(booking('0900000011')));
  assert.equal(r.test, undefined); assert.equal(r.ride_id, 'r1'); assert.equal(calls.request, 1);
});
