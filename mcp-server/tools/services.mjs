// More of bina.et for AI assistants (MCP 1.4.0, 18 Oct 2026, Ibrahim "all service mcp"): restaurants and cafés,
// pharmacies (and whether a pharmacy has reported a medicine), companies, cinema showtimes, live TV and radio, and
// Ethiopian TV series. Each tool reads the same public JSON the bina.et pages use, so it shows only what a visitor sees.
// Left out on purpose (checked 18 Oct 2026): lawyers and accountants (0 listed yet), intercity buses (demo trips),
// Office services (sign-in only), and a free-form "ask Bini" (Bini can post jobs, leads and rides; these tools only read).
import { z } from 'zod';
import { toolError } from './ride.mjs';
import { BASE } from './directory.mjs';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { PLACES_WIDGET_URI } from '../lib/widgets.mjs';

const LOCAL = process.env.RIDE_API || 'http://127.0.0.1:4210';
const memo = new Map();
// The directory lists are a few hundred KB and change slowly: one fetch per path per minute serves every caller.
async function get(path, ttlMs = 60_000) {
  const m = memo.get(path);
  if (m && Date.now() - m.t < ttlMs) return m.v;
  const r = await fetch(LOCAL + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const v = await r.json();
  memo.set(path, { t: Date.now(), v });
  return v;
}
export function _clearCache() { memo.clear(); }

const words = s => String(s || '').toLowerCase().replace(/sub[\s-]*city|ክፍለ\s*ከተማ/gi, ' ').split(/[\s,]+/).filter(w => w.length > 1);
const hasAll = (text, ws) => ws.every(w => text.includes(w));
const yt = id => id ? 'https://www.youtube.com/watch?v=' + id : undefined;
const RO = { readOnlyHint: true, openWorldHint: false };
// A company's brands are a plain "A, B" string on the rows that have any (18 Oct 2026: search_companies threw on them).
const brandsOf = c => Array.isArray(c.brands) ? c.brands : c.brands ? String(c.brands).split(/\s*[,;/]\s*/).filter(Boolean) : [];

export function registerServiceTools(server, { wrap, json }) {
  registerAppTool(server, 'search_restaurants', {
    title: 'Restaurants and cafés in Addis Ababa',
    description: 'Restaurants, cafés and fast-food places in Addis Ababa from BinaSmart Restaurants (bina.et/restaurants, about 890 places from the city map plus what restaurants confirmed). Search by name or cuisine word, filter by kind and sub-city. Returns each place\'s bina.et page, phone when known, sub-city, cuisine and map point (pass "lat,lng" to quote_ride for a ride there).',
    inputSchema: {
      query: z.string().max(60).optional().describe('Part of a name or a cuisine word, e.g. pizza, burger, habesha, Kaldi\'s'),
      kind: z.enum(['restaurant', 'cafe', 'fast_food']).optional().describe('Kind of place'),
      area: z.string().max(40).optional().describe('A sub-city: Bole, Kirkos, Arada, Yeka, Lideta, Gulele, Addis Ketema, Kolfe Keranio, Nifas Silk-Lafto, Akaki Kality, Lemi Kura'),
      limit: z.number().int().min(1).max(25).optional().describe('Max results, default 10'),
    },
    annotations: RO,
    _meta: { ui: { resourceUri: PLACES_WIDGET_URI } },   // cards in hosts with MCP Apps; the JSON is unchanged
  }, wrap('search_restaurants', async ({ query, kind, area, limit }) => {
    let d;
    try { d = await get('/api/restaurants/directory'); } catch { return toolError('BinaSmart Restaurants is temporarily unavailable. Browse https://bina.et/restaurants.'); }
    const q = words(query), a = words(area);
    const hits = (d.places || []).filter(p => (!kind || p.kind === kind)
      && (!a.length || hasAll(String(p.sub || '').toLowerCase(), a))
      && (!q.length || hasAll([p.name, p.nameAm, p.kind, (p.cuisine || []).join(' ')].join(' ').toLowerCase(), q)))
      .sort((x, y) => (y.confirmed - x.confirmed) || ((y.phone ? 1 : 0) - (x.phone ? 1 : 0)));
    if (!hits.length) return toolError('No restaurant or café on BinaSmart matches that. Try a shorter word or another sub-city, or browse https://bina.et/restaurants.');
    return json({
      count: hits.length,
      restaurants: hits.slice(0, limit || 10).map(p => ({ name: p.name, name_am: p.nameAm || undefined, kind: p.kind, sub_city: p.sub || undefined,
        cuisine: (p.cuisine || []).length ? p.cuisine : undefined, phone: p.phone || undefined, confirmed: !!p.confirmed,
        coords: p.lat != null ? { lat: p.lat, lng: p.lng } : undefined, url: `${BASE}/restaurants/${p.slug}` })),
      note: 'From the city map (OpenStreetMap contributors) plus what restaurants confirmed (confirmed: true). Opening hours and menus are not listed unless the page shows them: call first.',
      source_url: `${BASE}/restaurants`,
    });
  }));

  registerAppTool(server, 'search_pharmacies', {
    title: 'Pharmacies in Addis Ababa',
    description: 'Pharmacies in Addis Ababa from BinaSmart Health (bina.et/health, about 1,700 pharmacies from the Ministry of Health registry and the city map). Search by name or area. With medicine, also returns whether any pharmacy on BinaSmart has reported having that medicine in the last 7 days, and whether it needs a prescription. Not medical advice; emergencies: 907.',
    inputSchema: {
      query: z.string().max(60).optional().describe('Part of a pharmacy name or a neighbourhood word, e.g. Kenema, Red Cross, Megenagna'),
      area: z.string().max(40).optional().describe('A sub-city, e.g. Bole, Kirkos, Arada, Yeka'),
      medicine: z.string().max(60).optional().describe('A medicine name, e.g. paracetamol, amoxicillin, insulin'),
      limit: z.number().int().min(1).max(20).optional().describe('Max pharmacies, default 8'),
    },
    annotations: RO,
    _meta: { ui: { resourceUri: PLACES_WIDGET_URI } },   // cards in hosts with MCP Apps; the JSON is unchanged
  }, wrap('search_pharmacies', async ({ query, area, medicine, limit }) => {
    const q = [...words(query), ...words(area)].join(' ');
    let d, med;
    try {
      [d, med] = await Promise.all([
        get('/api/health/find?' + new URLSearchParams({ kind: 'pharmacy', q, limit: String(limit || 8) })),
        medicine ? get('/api/health/medicine?' + new URLSearchParams({ q: medicine }), 30_000).catch(() => null) : null,
      ]);
    } catch { return toolError('BinaSmart pharmacies are temporarily unavailable. Browse https://bina.et/health.'); }
    const list = d.facilities || [];
    if (!list.length && !(med && (med.results || []).length)) return toolError('No pharmacy on BinaSmart matches that. Try a shorter name or another area, or browse https://bina.et/health.');
    const out = {
      count: d.total, pharmacies: list.map(f => ({ name: f.name, name_am: f.nameAm || undefined, sub_city: f.sub || undefined, phone: f.phone || undefined,
        confirmed: !!f.confirmed, url: `${BASE}/health/${f.slug}` })),
      note: 'Pharmacies from the Ministry of Health registry and the city map. Stock, prices and opening hours are not known unless a pharmacy reported them: call before going. Not medical advice; in an emergency in Addis Ababa call 907.',
      source_url: `${BASE}/health`,
    };
    if (medicine) {
      out.medicine_check = med && med.found
        ? { medicine: med.medicine && med.medicine.name, medicine_am: med.medicine && med.medicine.nameAm || undefined,
            prescription_needed: med.medicine ? !!med.medicine.prescription : undefined,
            pharmacies_with_it: med.results || [], reported_by: (med.results || []).length,
            pharmacies_reporting_stock: med.joinedPharmacies,
            note: (med.results || []).length ? med.freshness : 'No pharmacy on BinaSmart has reported having it in the last 7 days. That does not mean it is unavailable: call the pharmacies listed.' }
        : { medicine, found: false, note: 'BinaSmart does not track this medicine yet. Call the pharmacies listed.' };
    }
    return json(out);
  }));

  registerAppTool(server, 'search_companies', {
    title: 'Companies in Ethiopia on BinaSmart',
    description: 'Companies listed on BinaSmart (bina.et/companies): real-estate developers, car sellers, domestic-worker agencies and other employers, with sub-city, website, whether they are hiring on the BinaSmart job board, and their bina.et page (with their homes, cars and vacancies when they have any). Search by name or brand, filter by kind and sub-city.',
    inputSchema: {
      query: z.string().max(60).optional().describe('Part of a company name or brand'),
      kind: z.string().max(30).optional().describe('Kind of company, e.g. real_estate, car_seller, domestic_agency'),
      area: z.string().max(40).optional().describe('A sub-city, e.g. Bole, Kirkos'),
      hiring: z.boolean().optional().describe('Only companies with open jobs on BinaSmart'),
      limit: z.number().int().min(1).max(30).optional().describe('Max results, default 10'),
    },
    annotations: RO,
    _meta: { ui: { resourceUri: PLACES_WIDGET_URI } },   // cards in hosts with MCP Apps (19 Oct 2026); the JSON is unchanged
  }, wrap('search_companies', async ({ query, kind, area, hiring, limit }) => {
    let d;
    try { d = await get('/api/companies', 300_000); } catch { return toolError('The BinaSmart company directory is temporarily unavailable. Browse https://bina.et/companies.'); }
    const q = words(query), a = words(area), k = String(kind || '').toLowerCase().replace(/[\s-]+/g, '_');
    const hits = (d.companies || []).filter(c => (!k || String(c.kind).includes(k))
      && (!hiring || c.hiring) && (!a.length || hasAll(String(c.sub || '').toLowerCase(), a))
      && (!q.length || hasAll([c.name, c.nameAm, brandsOf(c).join(' '), c.website].join(' ').toLowerCase(), q)));
    if (!hits.length) return toolError('No company on BinaSmart matches that. Try a shorter name, or browse https://bina.et/companies.');
    return json({
      count: hits.length,
      kinds: [...new Set((d.companies || []).map(c => c.kind))],
      companies: hits.slice(0, limit || 10).map(c => ({ name: c.name, name_am: c.nameAm || undefined, kind: c.kind, sub_city: c.sub || undefined,
        brands: brandsOf(c).length ? brandsOf(c) : undefined, website: c.website, hiring: !!c.hiring, confirmed: !!c.confirmed, url: c.url })),
      note: 'confirmed: true means the company itself checked its page. For open jobs use list_jobs or get_employer.',
      source_url: `${BASE}/companies`,
    });
  }));

  server.registerTool('list_cinema_showtimes', {
    title: 'Cinema showtimes in Addis Ababa',
    description: 'What is showing in Addis Ababa cinemas this week, from BinaSmart Cinema (bina.et/cinema): each cinema with its address and phone, and each film with its show times and dates as the cinema posted them, with a link to the cinema\'s own post. Filter by cinema or film title (English or Amharic).',
    inputSchema: {
      cinema: z.string().max(60).optional().describe('Part of a cinema name, e.g. Alem, Century, Edna, Matti'),
      film: z.string().max(60).optional().describe('Part of a film title, English or Amharic'),
    },
    annotations: RO,
  }, wrap('list_cinema_showtimes', async ({ cinema, film }) => {
    let d, v;
    try { [d, v] = await Promise.all([get('/api/cinema/programme'), get('/api/cinema/venues', 300_000).catch(() => ({ venues: [] }))]); }
    catch { return toolError('BinaSmart Cinema is temporarily unavailable. Browse https://bina.et/cinema.'); }
    const c = words(cinema), f = words(film);
    const progs = (d.venues || []).filter(p => !c.length || hasAll([p.venue.name, p.venue.nameAm, p.venue.slug].join(' ').toLowerCase(), c))
      .map(p => ({
        cinema: p.venue.name, cinema_am: p.venue.nameAm || undefined, address: p.venue.address || undefined, phone: p.venue.phone || undefined, url: `${BASE}/cinema/${p.venue.slug}`,
        films: (p.films || []).filter(x => !f.length || hasAll([x.title, x.titleAm].join(' ').toLowerCase(), f))
          .map(x => ({ title: x.title, title_am: x.titleAm || undefined, times: x.times, from: x.dateFrom, to: x.dateTo, hall: x.hallName || undefined,
            price: x.priceText || undefined, posted_by: x.sourceName || undefined, post_url: x.sourceUrl || undefined })),
      })).filter(p => p.films.length);
    const out = { today: d.today, count: progs.length, cinemas: progs,
      note: 'Times are as each cinema posted them (posted_by, post_url). Programmes change: call the cinema or check its post before going.',
      source_url: `${BASE}/cinema` };
    if (!progs.length) {
      const known = (v.venues || []).filter(x => !c.length || hasAll([x.name, x.nameAm, x.slug].join(' ').toLowerCase(), c));
      if (!known.length) return toolError('No cinema or film on BinaSmart matches that. Browse https://bina.et/cinema.');
      out.note = 'No programme posted on BinaSmart for this' + (f.length ? ' film' : ' cinema') + ' right now. These cinemas are listed: call them for today\'s films.';
      out.cinemas_listed = known.slice(0, 15).map(x => ({ cinema: x.name, cinema_am: x.nameAm || undefined, address: x.address || undefined, phone: x.phone || undefined, website: x.website || undefined, url: `${BASE}/cinema/${x.slug}` }));
    }
    return json(out);
  }));

  server.registerTool('list_tv_and_radio', {
    title: 'Ethiopian TV and radio channels',
    description: 'Ethiopian TV channels and radio stations on BinaWatch (bina.et/watch): whether each is live right now with the live programme title and link, its newest videos, and its own website. Filter by TV or radio.',
    inputSchema: {
      kind: z.enum(['tv', 'radio', 'all']).optional().describe('tv, radio or all (default all)'),
      channel: z.string().max(40).optional().describe('Part of a channel name, e.g. EBS, Fana, Sheger'),
    },
    annotations: RO,
  }, wrap('list_tv_and_radio', async ({ kind, channel }) => {
    const want = kind || 'all';
    let tv = [], radio = [];
    try {
      const [a, b] = await Promise.all([want === 'radio' ? null : get('/api/watch/live'), want === 'tv' ? null : get('/api/watch/radio')]);
      tv = (a && a.tv) || []; radio = (b && b.radio) || [];
    } catch { return toolError('BinaWatch is temporarily unavailable. Browse https://bina.et/watch.'); }
    const n = words(channel);
    const chans = [...tv, ...radio].filter(c => !n.length || hasAll([c.name, c.nameAm, c.id].join(' ').toLowerCase(), n));
    if (!chans.length) return toolError('No channel on BinaWatch matches that. Browse https://bina.et/watch.');
    return json({
      count: chans.length,
      channels: chans.map(c => ({ name: c.name, name_am: c.nameAm || undefined, kind: c.kind, about: c.tag || undefined, live_now: !!c.live,
        live_title: c.live ? c.liveTitle || undefined : undefined, live_url: c.live ? yt(c.videoId) : undefined, website: c.site || undefined,
        latest: (c.latest || []).slice(0, 3).map(x => ({ title: x.title, published: x.published, url: yt(x.id) })) })),
      note: 'Live status and videos come from each channel\'s own YouTube channel; BinaWatch plays them on bina.et/watch.',
      source_url: `${BASE}/watch`,
    });
  }));

  server.registerTool('list_tv_series', {
    title: 'Ethiopian TV series and newest episodes',
    description: 'Ethiopian TV drama and comedy series on BinaWatch (bina.et/watch) with the channel that airs them and their newest episodes (title, date and watch link). Search by series title, English or Amharic.',
    inputSchema: { query: z.string().max(60).optional().describe('Part of a series title, e.g. Derash or ደራሽ') },
    annotations: RO,
  }, wrap('list_tv_series', async ({ query }) => {
    let d;
    try { d = await get('/api/watch/series'); } catch { return toolError('BinaWatch is temporarily unavailable. Browse https://bina.et/watch.'); }
    const q = words(query);
    const list = (d.series || []).filter(s => !q.length || hasAll([s.title, s.titleAm, s.id].join(' ').toLowerCase(), q));
    if (!list.length) return toolError('No series on BinaWatch matches that. Browse https://bina.et/watch.');
    return json({
      count: list.length,
      series: list.map(s => ({ title: s.title, title_am: s.titleAm || undefined, kind: s.kind, channel: s.channelName || undefined,
        playlist_url: s.pl ? 'https://www.youtube.com/playlist?list=' + s.pl : undefined,
        latest: (s.latest || []).slice(0, 3).map(x => ({ title: x.title, published: x.published, url: yt(x.id) })) })),
      note: 'Episodes are on each channel\'s own YouTube channel; BinaWatch lists and plays them on bina.et/watch.',
      source_url: `${BASE}/watch`,
    });
  }));
}
