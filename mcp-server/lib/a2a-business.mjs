// A2A step 2 (24 Oct 2026): one agent per company page on bina.et - real-estate companies, car sellers, overseas
// employment agencies and the rest of bina.et/companies. Card: GET https://bina.et/a2a/companies/<slug>; talk: POST there.
//
// Honesty rules, because almost no company has claimed its page yet (1 of 1,399 confirmed on 24 Oct 2026):
//   - Every agent is run by BinaSmart and says so: the card's provider is BinaSmart, its name is "<Company> on BinaSmart",
//     and it never speaks as the company. `confirmed` is true only when the company itself checked its page.
//   - It answers only from what the company's public page shows: the /api/companies row (no mobiles there) and the
//     company's own ACTIVE car or home listings, matched by companySlug. Listings go out with their bina.et link and
//     WITHOUT phone numbers: some dealer and agency numbers are private mobiles, and the listing page already shows
//     the ones that may be shown.
//   - No model is called; the answer is the data.
import { makeTaskStore, rpcError } from './a2a.mjs';
import crypto from 'node:crypto';

const BASE = 'https://bina.et';
const LOCAL = process.env.RIDE_API || 'http://127.0.0.1:4210';
const uuid = () => crypto.randomUUID();
const KIND = {
  real_estate: { label: 'real-estate company', listings: 'homes' },
  car_seller: { label: 'car seller', listings: 'cars' },
  domestic_agency: { label: 'overseas employment agency' },
};
const AGENCY_NOTE = 'A directory, not a licence register: call the agency and ask for its licence before you pay anyone. A licensed agency never asks a worker for a recruitment fee.';
const SQL = {
  cars: 'SELECT slug, title, make, model, year, price, mileage, fuel, transmission, "bodyType", condition, city, "checkedAt" FROM "CarListing" WHERE "companySlug" = $1 AND active = true ORDER BY featured DESC, "createdAt" DESC LIMIT 2000',
  homes: 'SELECT slug, title, "listingType", "propertyType", price, beds, baths, area, location, "checkedAt" FROM "PropertyListing" WHERE "companySlug" = $1 AND active = true ORDER BY "createdAt" DESC LIMIT 2000',
};
const day = d => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const shape = {
  cars: r => ({ title: r.title, make: r.make || undefined, model: r.model || undefined, year: r.year || undefined, price: r.price || 'on request',
    mileage: r.mileage || undefined, fuel: r.fuel || undefined, transmission: r.transmission || undefined, body: r.bodyType || undefined,
    condition: r.condition || undefined, location: r.city || undefined, checked_on_dealer_site: day(r.checkedAt), url: `${BASE}/cars/${r.slug}` }),
  homes: r => ({ title: r.title, listing: r.listingType, type: r.propertyType || undefined, price: r.price || 'on request', beds: r.beds || undefined,
    baths: r.baths || undefined, size: r.area || undefined, location: r.location || undefined, checked_on_company_site: day(r.checkedAt), url: `${BASE}/property/${r.slug}` }),
};
const words = s => String(s || '').toLowerCase().split(/[\s,.;:!?]+/).filter(w => w.length > 1 &&
  !/^(do|you|have|any|the|a|an|for|in|of|and|or|is|are|what|which|show|me|list|your|please|with|sale|rent|cars?|homes?|houses?|apartments?|available|ያላችሁ|አለ|አላችሁ)$/.test(w));

// The JSON-RPC side every place agent shares (companies, health, hotels): message/send makes one finished task,
// kept for an hour so tasks/get works - and only through the agent that made it.
export function agentRpc({ family, tasks, find, answer, pageOf }) {
  return async function handle(slug, body, callerKey) {
    const id = body && body.id;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(id, -32600, 'Invalid Request');
    const c = await find(slug);
    if (!c) return rpcError(id, -32001, `No agent "${slug}" here. The list is at ${BASE}/a2a/${family}`);
    const p = body.params || {};
    if (body.method === 'tasks/get') { const t = tasks.get(p.id); return t && t.metadata.family === family && t.metadata.slug === slug ? { jsonrpc: '2.0', id, result: t } : rpcError(id, -32001, 'Task not found'); }
    if (body.method === 'tasks/cancel') return tasks.get(p.id) ? rpcError(id, -32002, 'Task cannot be canceled: it has already finished') : rpcError(id, -32001, 'Task not found');
    if (body.method === 'message/stream' || body.method === 'tasks/resubscribe') return rpcError(id, -32004, 'This operation is not supported: use message/send');
    if (body.method.startsWith('tasks/pushNotificationConfig/')) return rpcError(id, -32003, 'Push notifications are not supported');
    if (body.method !== 'message/send') return rpcError(id, -32601, 'Method not found');
    const msg = p.message;
    if (!msg || !Array.isArray(msg.parts)) return rpcError(id, -32602, 'Invalid params: params.message with parts is required');
    const t0 = Date.now(); let r;
    try { r = await answer(c, msg); } catch (e) { console.error(`[a2a-${family}] failed:`, e && e.message); r = { fail: true }; }
    if (r.error) return rpcError(id, -32602, r.error);
    const task = { kind: 'task', id: uuid(), contextId: typeof msg.contextId === 'string' ? msg.contextId : uuid(),
      history: [{ ...msg, kind: 'message', role: msg.role || 'user', messageId: msg.messageId || uuid() }], metadata: { family, slug, skill: r.skill, operated_by: 'BinaSmart' } };
    if (r.fail) task.status = { state: 'failed', timestamp: new Date().toISOString(), message: { kind: 'message', role: 'agent', messageId: uuid(), parts: [{ kind: 'text', text: 'Internal error in BinaSmart. Try again or open ' + pageOf(c) }] } };
    else { task.artifacts = [{ artifactId: uuid(), name: r.skill, parts: [{ kind: 'text', text: JSON.stringify(r.out, null, 2) }, { kind: 'data', data: JSON.parse(JSON.stringify(r.out)) }] }];
      task.status = { state: 'completed', timestamp: new Date().toISOString() }; }
    console.log(JSON.stringify({ t: 'a2a-' + family, slug, skill: r.skill, ms: Date.now() - t0, ok: !r.fail, caller: String(callerKey).slice(0, 24) }));
    tasks.put(task);
    return { jsonrpc: '2.0', id, result: task };
  };
}

async function defaultFetchCompanies() {
  const r = await fetch(LOCAL + '/api/companies', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).companies || [];
}

export function makeBusinessAgents({ db, fetchCompanies = defaultFetchCompanies, tasks = makeTaskStore(), ttlMs = 300_000, now = () => Date.now() }) {
  let cache = null, at = 0;
  async function bySlug() {
    if (!cache || now() - at > ttlMs) { cache = new Map((await fetchCompanies()).map(c => [c.slug, c])); at = now(); }
    return cache;
  }
  const agentUrl = slug => `${BASE}/a2a/companies/${encodeURIComponent(slug)}`;
  const profile = c => ({ name: c.name, name_am: c.nameAm || undefined, kind: c.kind, kind_label: (KIND[c.kind] || {}).label || c.kind,
    sub_city: c.sub || undefined, website: c.website || undefined, hiring_on_binasmart: !!c.hiring, confirmed_by_company: !!c.confirmed, page: c.url || `${BASE}/companies/${c.slug}` });

  function card(c) {
    const k = KIND[c.kind] || {}, label = k.label || 'company';
    const skills = [{ id: 'profile', name: 'Company details', description: `Who ${c.name} is on BinaSmart: kind, sub-city, website, whether it is hiring, whether it has confirmed its page, and its bina.et page.` + (c.kind === 'domestic_agency' ? ' ' + AGENCY_NOTE : ''),
      tags: ['company', c.kind, 'ethiopia'], examples: [`Tell me about ${c.name}`], inputModes: ['text/plain', 'application/json'], outputModes: ['application/json'] }];
    if (k.listings) skills.push({ id: k.listings, name: k.listings === 'cars' ? 'Cars this dealer lists' : 'Homes this company lists',
      description: `The ${k.listings} ${c.name} lists on bina.et right now, each with its price as the company wrote it and its bina.et page. Send words to filter (e.g. "${k.listings === 'cars' ? 'Toyota 2018' : '2 bedroom rent Bole'}").`,
      tags: [k.listings, c.kind, 'addis-ababa'], examples: [k.listings === 'cars' ? 'Which electric cars do you have?' : 'Any 2 bedroom apartments for rent?'], inputModes: ['text/plain', 'application/json'], outputModes: ['application/json'] });
    return {
      protocolVersion: '0.3.0',
      name: `${c.name} on BinaSmart`,
      description: `${c.name}: ${label} in ${c.sub ? c.sub + ', ' : ''}Addis Ababa. This agent is run by BinaSmart from the company's public page on bina.et and does not speak for the company` +
        (c.confirmed ? '; the company has confirmed its page.' : '; the company has not confirmed its page yet.') + ' It answers with the company\'s details' + (k.listings ? ` and the ${k.listings} it lists on bina.et.` : '.'),
      version: '1.0.0', url: agentUrl(c.slug), preferredTransport: 'JSONRPC', additionalInterfaces: [{ url: agentUrl(c.slug), transport: 'JSONRPC' }],
      provider: { organization: 'BinaSmart', url: BASE }, documentationUrl: c.url || `${BASE}/companies/${c.slug}`, iconUrl: `${BASE}/favicon.ico`,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['text/plain', 'application/json'], defaultOutputModes: ['application/json'], skills,
      binasmart: { operated_by: 'BinaSmart', confirmed_by_company: !!c.confirmed, company_page: c.url || `${BASE}/companies/${c.slug}`, all_agents: `${BASE}/a2a/companies` },
    };
  }

  async function listings(c, kind, text, max) {
    const rows = (await db.query(SQL[kind], [c.slug])).rows || [];
    const ws = words(text);
    const hay = r => Object.values(r).filter(v => typeof v === 'string').join(' ').toLowerCase();
    // "SUVs" finds "SUV": a word ending in s also matches without it
    const has = (h, w) => h.includes(w) || (w.length > 3 && w.endsWith('s') && h.includes(w.slice(0, -1)));
    const hit = ws.length ? rows.filter(r => { const h = hay(r); return ws.every(w => has(h, w)); }) : rows;
    return { total: rows.length, matched: ws.length ? hit.length : undefined, items: (hit.length || !ws.length ? hit : rows).slice(0, max).map(shape[kind]), fallback: ws.length > 0 && hit.length === 0 };
  }

  async function answer(c, msg) {
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const data = parts.find(p => p && (p.kind || p.type) === 'data' && p.data && typeof p.data === 'object');
    const text = parts.filter(p => p && (p.kind || p.type) === 'text' && typeof p.text === 'string').map(p => p.text).join(' ').trim();
    const k = KIND[c.kind] || {};
    let skill = data && typeof data.data.skill === 'string' ? data.data.skill : (k.listings && text ? k.listings : 'profile');
    if (skill !== 'profile' && skill !== k.listings) return { error: `This agent has the skills: profile${k.listings ? ', ' + k.listings : ''}.` };
    const args = (data && data.data.arguments) || {};
    const out = { company: profile(c) };
    if (c.kind === 'domestic_agency') out.note = AGENCY_NOTE;
    if (skill !== 'profile') {
      const max = Math.min(Math.max(Number(args.max_results) || 10, 1), 20);
      const l = await listings(c, skill, args.query != null ? String(args.query) : text, max);
      out[skill] = l.items; out[skill + '_total'] = l.total;
      if (l.fallback) out.note = `None of the ${l.total} ${skill} matched those words; these are the newest instead.`;
      if (!l.total) out.note = `${c.name} has no ${skill} listed on bina.et right now.`;
      out.contact = 'Each listing page on bina.et shows how to reach the company. BinaSmart is not the agent and takes no fee.';
    }
    out.source_url = c.url || `${BASE}/companies/${c.slug}`;
    return { skill, out };
  }

  return {
    async list() {
      const m = await bySlug();
      return [...m.values()].map(c => ({ name: c.name, kind: c.kind, confirmed_by_company: !!c.confirmed, agent_card: agentUrl(c.slug) }));
    },
    async card(slug) { const c = (await bySlug()).get(slug); return c ? card(c) : null; },
    handle: agentRpc({ family: 'companies', tasks, find: async slug => (await bySlug()).get(slug), answer, pageOf: c => c.url || BASE }),
  };
}
