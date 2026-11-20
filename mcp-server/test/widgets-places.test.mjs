// MCP Apps place cards (19 Oct 2026): search_restaurants, search_pharmacies and search_properties name ui://bina/places-v1.html,
// the page inlines the ext-apps bundle, and only bina.et links can be opened from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.mjs';
import { PLACES_WIDGET_URI, placesWidgetHtml } from '../lib/widgets.mjs';

const off = async () => { throw new Error('offline'); };
async function client() {
  const s = buildServer({ rideApi: new Proxy({}, { get: () => off }), db: { query: off, connect: off }, guides: new Map(), callerKey: 't', callsRL: () => true, bookRL: () => true });
  const [a, b] = InMemoryTransport.createLinkedPair(); await s.connect(a);
  const c = new Client({ name: 't', version: '1' }); await c.connect(b); return c;
}

test('the place card page inlines the bundle and opens only bina.et', () => {
  const html = placesWidgetHtml();
  assert.ok(!html.includes('/*__EXT_APPS_BUNDLE__*/'));
  assert.match(html, /globalThis\.ExtApps=\{[^}]*\bApp:/);
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  assert.match(html, /const onBina = u => typeof u === 'string' && \/\^https:\\\/\\\/bina\\\.et\\\/\//);
});

test('the three search tools name the place cards; the resource is served', async () => {
  const c = await client();
  const tools = (await c.listTools()).tools;
  for (const n of ['search_restaurants', 'search_pharmacies', 'search_properties', 'search_hotels', 'search_health', 'search_cars', 'search_companies', 'list_tenders', 'list_events']) {
    const t = tools.find(x => x.name === n);
    assert.equal(t._meta && t._meta.ui && t._meta.ui.resourceUri, PLACES_WIDGET_URI, n);
  }
  assert.equal(tools.find(x => x.name === 'list_films')._meta?.ui?.resourceUri, undefined);
  const r = await c.readResource({ uri: PLACES_WIDGET_URI });
  assert.match(r.contents[0].text, /BinaSmart place cards/);
});
