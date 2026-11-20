// A2A step 2, continued (24 Oct 2026): one agent per health facility (bina.et/health, 3,420) and per hotel
// (bina.et/hotels, 552). Same rules as the company agents (lib/a2a-business.mjs): run by BinaSmart from the public
// page, never speaking as the place; confirmed/claimed only when the place itself did it; no model is called.
//   Health: the /api/health/directory row (landline, services, emergency, doctors on BinaSmart, confirmed) - the same
//           public JSON the page uses, never a licence or a mobile. A pharmacy agent also says whether THIS pharmacy
//           confirmed a medicine in the last 7 days (/api/health/search), and never that it "probably has it".
//           Not medical advice; emergencies 907.
//   Hotels: the /api/hotels/directory row (stars, sub-city, facilities, claimed, distance and BinaRide fare from the
//           airport). Phone and website there are only yes/no flags; the hotel page shows the numbers it may show.
import { makeTaskStore } from './a2a.mjs';
import { agentRpc } from './a2a-business.mjs';

const BASE = 'https://bina.et';
const LOCAL = process.env.RIDE_API || 'http://127.0.0.1:4210';
const NOT_ADVICE = 'BinaSmart is a directory, not medical advice: for anything about your health, see a clinician. Emergencies in Addis Ababa: 907.';

async function defaultFetchJson(path) {
  const r = await fetch(LOCAL + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const skill = (id, name, description, examples) => ({ id, name, description, tags: [id, 'addis-ababa'], examples, inputModes: ['text/plain', 'application/json'], outputModes: ['application/json'] });
const textOf = msg => (msg.parts || []).filter(p => p && (p.kind || p.type) === 'text' && typeof p.text === 'string').map(p => p.text).join(' ').trim();
const dataOf = msg => { const d = (msg.parts || []).find(p => p && (p.kind || p.type) === 'data' && p.data && typeof p.data === 'object'); return d ? d.data : null; };

function family({ name, path, load, cardOf, answer, ttlMs, now, tasks }) {
  let cache = null, at = 0;
  const bySlug = async () => { if (!cache || now() - at > ttlMs) { cache = await load(); at = now(); } return cache; };
  const agentUrl = slug => `${BASE}/a2a/${path}/${encodeURIComponent(slug)}`;
  return {
    async list() { return [...(await bySlug()).values()].map(x => ({ name: x.name, kind: x.kind, [name === 'hotels' ? 'claimed_by_hotel' : 'confirmed_by_facility']: !!(x.confirmed || x.claimed), agent_card: agentUrl(x.slug) })); },
    async card(slug) { const x = (await bySlug()).get(slug); return x ? cardOf(x, agentUrl(x.slug)) : null; },
    handle: agentRpc({ family: path, tasks, find: async slug => (await bySlug()).get(slug), answer, pageOf: x => x.page }),
  };
}

const baseCard = (x, url, label, provided, skills, extra) => ({
  protocolVersion: '0.3.0', name: `${x.name} on BinaSmart`, version: '1.0.0', url, preferredTransport: 'JSONRPC', additionalInterfaces: [{ url, transport: 'JSONRPC' }],
  description: `${x.name}: ${label} in ${x.sub ? x.sub + ', ' : ''}Addis Ababa. This agent is run by BinaSmart from the public page on bina.et and does not speak for the ${label.toLowerCase()}; ${provided}`,
  provider: { organization: 'BinaSmart', url: BASE }, documentationUrl: x.page, iconUrl: `${BASE}/favicon.ico`,
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  defaultInputModes: ['text/plain', 'application/json'], defaultOutputModes: ['application/json'], skills, binasmart: { operated_by: 'BinaSmart', page: x.page, ...extra },
});

export function makeHealthAgents({ fetchJson = defaultFetchJson, tasks = makeTaskStore(), ttlMs = 300_000, now = () => Date.now() } = {}) {
  let kinds = {};
  const load = async () => { const d = await fetchJson('/api/health/directory'); kinds = d.kinds || {};
    return new Map((d.facilities || []).map(f => [f.slug, { ...f, page: `${BASE}/health/${f.slug}` }])); };
  const label = f => kinds[f.kind] || 'Health facility';
  const profile = f => ({ name: f.name, name_am: f.nameAm || undefined, kind: label(f), sub_city: f.sub || undefined, phone: f.phone || undefined,
    services: f.services && f.services.length ? f.services : undefined, emergency: !!f.emergency, doctors_on_binasmart: f.doctors || 0,
    confirmed_by_facility: !!f.confirmed, page: f.page, ride_there: `${BASE}/ride?to=${encodeURIComponent(f.name)}&lat=${f.lat}&lng=${f.lng}` });
  function cardOf(f, url) {
    const skills = [skill('profile', 'Facility details', `What bina.et shows about ${f.name}: kind, sub-city, landline, services, emergency care, doctors listed on BinaSmart, and its page. ${NOT_ADVICE}`, [`Is ${f.name} open for emergencies?`])];
    if (f.kind === 'pharmacy') skills.push(skill('medicine', 'Has this pharmacy confirmed a medicine?', 'Send a medicine name. Says whether this pharmacy confirmed it in the last 7 days, and gives the link that asks joined pharmacies now. Never a dose, a substitute or what it treats; controlled medicines are not searched.', ['Do you have amoxicillin?']));
    return baseCard(f, url, label(f), (f.confirmed ? 'the facility has confirmed its page.' : 'the facility has not confirmed its page yet.') + ' ' + NOT_ADVICE, skills, { confirmed_by_facility: !!f.confirmed, all_agents: `${BASE}/a2a/health` });
  }
  async function answer(f, msg) {
    const data = dataOf(msg), text = textOf(msg);
    const want = data && typeof data.skill === 'string' ? data.skill : (f.kind === 'pharmacy' && text ? 'medicine' : 'profile');
    if (want !== 'profile' && !(want === 'medicine' && f.kind === 'pharmacy')) return { error: `This agent has the skills: profile${f.kind === 'pharmacy' ? ', medicine' : ''}.` };
    const out = { facility: profile(f), note: NOT_ADVICE, source_url: f.page };
    if (want === 'medicine') {
      const q = String((data && data.arguments && data.arguments.medicine) || text).slice(0, 80);
      const r = await fetchJson('/api/health/search?' + new URLSearchParams({ q, kind: 'pharmacy', area: f.sub || '' }));
      const m = r.medicine;
      if (!m || !m.found) out.medicine = { asked: q, found: false, say: 'BinaSmart does not recognise that as a medicine it tracks. Call the pharmacy, or ask at bina.et/health/medicine.' };
      else if (m.controlled) out.medicine = { asked: q, controlled: true, say: 'Controlled medicine: BinaSmart does not search for it. It is given on a prescription through a hospital or licensed pharmacy.' };
      else {
        const mine = (m.results || []).find(x => String(x.url || '').endsWith('/' + f.slug));
        out.medicine = { asked: q, name: m.medicine && m.medicine.name, prescription: !!(m.medicine && m.medicine.prescription), note: m.note || undefined,
          this_pharmacy_confirmed: !!mine, confirmed: mine ? mine.confirmed : undefined, freshness: m.freshness, ask_url: m.askUrl,
          say: mine ? 'This pharmacy confirmed it; say how long ago and give its page.' : 'This pharmacy has not confirmed it in the last 7 days. Never say it probably has it: give ask_url, or call the pharmacy.' };
      }
    }
    return { skill: want, out };
  }
  return family({ name: 'health', path: 'health', load, cardOf, answer, ttlMs, now, tasks });
}

export function makeHotelAgents({ fetchJson = defaultFetchJson, tasks = makeTaskStore(), ttlMs = 300_000, now = () => Date.now() } = {}) {
  let kinds = {};
  const load = async () => { const d = await fetchJson('/api/hotels/directory'); kinds = d.kinds || {};
    return new Map((d.places || []).map(h => [h.slug, { ...h, page: `${BASE}/hotels/${h.slug}` }])); };
  const label = h => (kinds[h.kind] && kinds[h.kind].en) || 'Hotel';
  const profile = h => ({ name: h.name, name_am: h.nameAm || undefined, kind: label(h), stars: h.stars || undefined, sub_city: h.sub || undefined,
    facilities: h.fac && h.fac.length ? h.fac : undefined, price_from: h.from || undefined, photos_on_page: h.photos || 0, claimed_by_hotel: !!h.claimed,
    from_bole_airport: h.air ? { km: h.air.km, minutes: h.air.min, binaride_fare_etb: h.air.fare, book: `${BASE}/ride?to=${encodeURIComponent(h.name)}&lat=${h.lat}&lng=${h.lng}` } : undefined,
    page: h.page });
  function cardOf(h, url) {
    return baseCard(h, url, label(h), (h.claimed ? 'the hotel has claimed its page.' : 'the hotel has not claimed its page yet.') + ' Rooms are booked with the hotel itself.',
      [skill('profile', 'Hotel details', `What bina.et shows about ${h.name}: kind, stars, sub-city, facilities, whether it has claimed its page, and the distance and fixed BinaRide fare from Bole airport.`, [`How far is ${h.name} from the airport?`])],
      { claimed_by_hotel: !!h.claimed, all_agents: `${BASE}/a2a/hotels` });
  }
  async function answer(h, msg) {
    const data = dataOf(msg);
    if (data && data.skill && data.skill !== 'profile') return { error: 'This agent has the skill: profile.' };
    return { skill: 'profile', out: { hotel: profile(h), note: 'From the public hotel page on bina.et. Prices and availability come from the hotel itself; the page shows how to reach it.', source_url: h.page } };
  }
  return family({ name: 'hotels', path: 'hotels', load, cardOf, answer, ttlMs, now, tasks });
}
