// MCP 1.4.0 (18 Oct 2026): restaurants, pharmacies, companies, cinema, TV/radio and series read the site's public JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerServiceTools, _clearCache } from '../tools/services.mjs';

function harness(routes) {
  _clearCache();
  const tools = {}, calls = [];
  const server = { registerTool(name, def, fn) { tools[name] = { def, fn }; } };
  registerServiceTools(server, { wrap: (n, fn) => fn, json: d => ({ content: [{ type: 'text', text: JSON.stringify(d) }] }) });
  const real = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(String(url)); const u = new URL(url); const body = routes(u); return body === 500 ? { ok: false, status: 500 } : { ok: true, json: async () => body }; };
  return { tools, calls, restore: () => { globalThis.fetch = real; } };
}
const out = r => JSON.parse(r.content[0].text);

test('every service tool is read-only and has a title', () => {
  const h = harness(() => ({}));
  try {
    assert.deepEqual(Object.keys(h.tools).sort(), ['list_cinema_showtimes', 'list_tv_and_radio', 'list_tv_series', 'search_companies', 'search_pharmacies', 'search_restaurants']);
    for (const t of Object.values(h.tools)) { assert.equal(t.def.annotations.readOnlyHint, true); assert.ok(t.def.title); }
  } finally { h.restore(); }
});

test('restaurants: filters by word, kind and sub-city; confirmed and phoned places first; page links', async () => {
  const h = harness(() => ({ places: [
    { slug: 'a-pizza', name: 'A Pizza', kind: 'restaurant', sub: 'Bole', cuisine: ['pizza'], phone: null, confirmed: false, lat: 9, lng: 38.8 },
    { slug: 'b-pizza', name: 'B Pizza', kind: 'restaurant', sub: 'Bole', cuisine: ['pizza'], phone: '+251111', confirmed: true, lat: 9, lng: 38.8 },
    { slug: 'c-cafe', name: 'C Cafe', kind: 'cafe', sub: 'Bole', cuisine: [], phone: null, confirmed: false },
    { slug: 'd-pizza', name: 'D Pizza', kind: 'restaurant', sub: 'Arada', cuisine: ['pizza'], phone: null, confirmed: false },
  ] }));
  try {
    const r = out(await h.tools.search_restaurants.fn({ query: 'pizza', area: 'Bole sub-city' }));
    assert.equal(r.count, 2); assert.equal(r.restaurants[0].name, 'B Pizza');
    assert.equal(r.restaurants[0].url, 'https://bina.et/restaurants/b-pizza'); assert.deepEqual(r.restaurants[0].coords, { lat: 9, lng: 38.8 });
    assert.equal(out(await h.tools.search_restaurants.fn({ kind: 'cafe' })).count, 1);
    assert.equal((await h.tools.search_restaurants.fn({ query: 'sushi' })).isError, true);
  } finally { h.restore(); }
});

test('pharmacies: kind=pharmacy search; a medicine nobody reported is said plainly, not as "unavailable"', async () => {
  const h = harness(u => u.pathname === '/api/health/medicine'
    ? { found: true, medicine: { name: 'Paracetamol', nameAm: 'ፓራሲታሞል', prescription: false }, results: [], total: 0, joinedPharmacies: 0, freshness: '7 days' }
    : { total: 1, facilities: [{ slug: 'kenema-3', name: 'Kenema Pharmacy 3', sub: 'Arada', phone: '+251111', confirmed: false }] });
  try {
    const r = out(await h.tools.search_pharmacies.fn({ query: 'Kenema', medicine: 'paracetamol' }));
    const q = new URL(h.calls.find(c => c.includes('/api/health/find'))).searchParams;
    assert.equal(q.get('kind'), 'pharmacy'); assert.equal(q.get('q'), 'kenema');
    assert.equal(r.pharmacies[0].url, 'https://bina.et/health/kenema-3');
    assert.equal(r.medicine_check.prescription_needed, false); assert.equal(r.medicine_check.reported_by, 0);
    assert.match(r.medicine_check.note, /does not mean it is unavailable/); assert.match(r.note, /907/);
  } finally { h.restore(); }
});

test('companies: by name, kind and hiring', async () => {
  const h = harness(() => ({ companies: [
    { slug: 'abay', kind: 'car_seller', brands: 'Toyota, Suzuki', name: 'Abay Technic', sub: 'Kirkos', hiring: false, confirmed: false, url: 'https://bina.et/companies/abay' },
    { slug: 'noah', kind: 'real_estate', name: 'Noah Real Estate', sub: 'Bole', hiring: true, confirmed: true, url: 'https://bina.et/companies/noah' },
  ] }));
  try {
    assert.equal(out(await h.tools.search_companies.fn({ query: 'noah' })).companies[0].url, 'https://bina.et/companies/noah');
    assert.equal(out(await h.tools.search_companies.fn({ kind: 'car seller' })).companies[0].name, 'Abay Technic');
    assert.equal(out(await h.tools.search_companies.fn({ hiring: true })).count, 1);
    const t = out(await h.tools.search_companies.fn({ query: 'suzuki' }));   // brands as a plain string
    assert.deepEqual(t.companies[0].brands, ['Toyota', 'Suzuki']);
  } finally { h.restore(); }
});

test('cinema: showtimes with the cinema\'s own post; a cinema with no programme lists its phone instead', async () => {
  const h = harness(u => u.pathname === '/api/cinema/programme'
    ? { today: '2026-10-18', venues: [{ venue: { slug: 'alem-cinema', name: 'Alem Cinema', address: 'Bole', phone: '+251986' }, films: [{ title: 'Abdelaye', titleAm: 'አብደላዬ', times: ['18:00'], sourceName: 'Alem Cinema Telegram channel', sourceUrl: 'https://t.me/alem_cinema/1' }] }] }
    : { venues: [{ slug: 'city-hall-cinema', name: 'City Hall Cinema', phone: '+251111' }, { slug: 'alem-cinema', name: 'Alem Cinema' }] });
  try {
    const r = out(await h.tools.list_cinema_showtimes.fn({ film: 'አብደላዬ' }));
    assert.equal(r.cinemas[0].films[0].times[0], '18:00'); assert.equal(r.cinemas[0].films[0].post_url, 'https://t.me/alem_cinema/1');
    const e = out(await h.tools.list_cinema_showtimes.fn({ cinema: 'City Hall' }));
    assert.equal(e.count, 0); assert.equal(e.cinemas_listed[0].phone, '+251111');
  } finally { h.restore(); }
});

test('TV and radio: live link only when live; series link to episodes; a broken site is a clear error', async () => {
  const h = harness(u => u.pathname === '/api/watch/live' ? { tv: [{ id: 'ebs', kind: 'tv', name: 'EBS TV', live: true, videoId: 'v1', liveTitle: 'News', latest: [{ id: 'x1', title: 'Ep', published: '2026-10-18' }] }] }
    : u.pathname === '/api/watch/radio' ? { radio: [{ id: 'sheger', kind: 'radio', name: 'Sheger FM', live: false, videoId: 'zz', latest: [] }] }
    : u.pathname === '/api/watch/series' ? { series: [{ id: 'derash', title: 'Derash', titleAm: 'ደራሽ', pl: 'PL1', channelName: 'Kana', latest: [{ id: 'e260', title: 'Ep 260' }] }] } : 500);
  try {
    const r = out(await h.tools.list_tv_and_radio.fn({}));
    assert.equal(r.count, 2); assert.equal(r.channels[0].live_url, 'https://www.youtube.com/watch?v=v1'); assert.equal(r.channels[1].live_url, undefined);
    assert.equal(out(await h.tools.list_tv_and_radio.fn({ kind: 'radio' })).channels[0].name, 'Sheger FM');
    const s = out(await h.tools.list_tv_series.fn({ query: 'ደራሽ' }));
    assert.equal(s.series[0].playlist_url, 'https://www.youtube.com/playlist?list=PL1'); assert.equal(s.series[0].latest[0].url, 'https://www.youtube.com/watch?v=e260');
  } finally { h.restore(); }
  const bad = harness(() => 500);
  try { assert.equal((await bad.tools.list_tv_series.fn({})).isError, true); } finally { bad.restore(); }
});
