import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer, json, fitOutput } from '../server.mjs';
import { OUTPUTS } from '../lib/outputs.mjs';

const off = async () => { throw new Error('offline'); };
async function listTools() {
  const s = buildServer({ rideApi: new Proxy({}, { get: () => off }), db: { query: off, connect: off }, guides: new Map(), callerKey: 't', callsRL: () => true, bookRL: () => true });
  const [a, b] = InMemoryTransport.createLinkedPair(); await s.connect(a);
  const c = new Client({ name: 't', version: '1' }); await c.connect(b);
  return (await c.listTools()).tools;
}

test('every tool declares an outputSchema that allows extra fields', async () => {
  const tools = await listTools();
  assert.equal(tools.length, Object.keys(OUTPUTS).length);
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} has no outputSchema`);
    assert.equal(t.outputSchema.additionalProperties, true, `${t.name} must allow extra fields`);
  }
});

test('json() sends the same object as text and structuredContent, with dates as strings', () => {
  const r = json({ a: 1, when: new Date('2026-10-18T00:00:00Z'), gone: undefined });
  assert.deepEqual(r.structuredContent, JSON.parse(r.content[0].text));
  assert.equal(r.structuredContent.when, '2026-10-18T00:00:00.000Z');
  assert.ok(!('gone' in r.structuredContent));
});

test('fitOutput drops only fields of the wrong type and leaves good results alone', () => {
  const good = { content: [], structuredContent: { pickup: 'Edna Mall', quotes: [{ tier: 'economy', fare_etb: 300 }] } };
  assert.deepEqual(fitOutput('quote_ride', good).structuredContent, { pickup: 'Edna Mall', quotes: [{ tier: 'economy', fare_etb: 300 }] });
  const bad = fitOutput('quote_ride', { content: [], structuredContent: { pickup: 5, distance_km: 2, quotes: [{ tier: 'economy', fare_etb: 'x' }] } });
  assert.deepEqual(bad.structuredContent, { distance_km: 2, quotes: [{ tier: 'economy' }] });
  assert.ok(OUTPUTS.quote_ride.safeParse(bad.structuredContent).success);
});
