// A2A step 3 (24 Oct 2026): requests an outside agent sends to a place - a viewing, a quote, a room, whether a medicine
// is in stock - through that place's agent (/a2a/<family>/<slug>, skill "request").
//
// The rule: NOTHING goes to the place, or to the number in the request, automatically. A request is stored and the
// BinaSmart admin chat gets one Telegram message with Approve / Decline / Done links; the team phones the place. The
// A2A task follows the team: submitted -> working (approved) -> completed (done), or rejected, or canceled by the
// caller while still submitted. The links open a confirm page that POSTs, because Telegram fetches links on its own
// for previews and a plain GET would approve by itself. Off unless A2A_REQUESTS=1.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeLimiter } from './limiter.mjs';

const BASE = 'https://bina.et';
const uuid = () => crypto.randomUUID();
const MAX_KEEP = 3000;
const STATES = { approve: { from: ['submitted'], to: 'working', say: 'The BinaSmart team approved this request and is contacting the place by phone.' },
  decline: { from: ['submitted', 'working'], to: 'rejected', say: 'The BinaSmart team could not pass this request on.' },
  done: { from: ['submitted', 'working'], to: 'completed', say: 'The BinaSmart team passed this request to the place. The place answers the person directly.' } };
const contactOk = c => /^\+?[\d\s()-]{7,20}$/.test(c) && c.replace(/\D/g, '').length >= 7 || /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(c);
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function makeRequestDesk({ file = '/root/storage/a2a/requests.json', sendAdmin, enabled = false, now = () => Date.now(),
  perCaller = makeLimiter(3_600_000, 3), perDay = makeLimiter(86_400_000, 20) } = {}) {
  let rows = null;
  const load = () => { if (!rows) { try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { rows = []; } } return rows; };
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(rows.slice(-MAX_KEEP))); fs.renameSync(t, file); };
  const find = id => load().find(r => r.id === String(id));
  const stamp = () => new Date(now()).toISOString();

  function asTask(r) {
    const msg = r.status === 'submitted' ? 'Received. The BinaSmart team reads every request first and contacts the place by phone; nothing was sent to the place automatically.'
      : (STATES[{ working: 'approve', rejected: 'decline', completed: 'done' }[r.status]] || {}).say || (r.status === 'canceled' ? 'Canceled by the caller.' : '');
    return { kind: 'task', id: r.id, contextId: r.contextId, status: { state: r.status, timestamp: r.updatedAt, message: { kind: 'message', role: 'agent', messageId: r.id + ':' + r.status, parts: [{ kind: 'text', text: msg }] } },
      history: r.history, metadata: { family: r.family, slug: r.slug, skill: 'request', operated_by: 'BinaSmart', place: r.place, page: r.page } };
  }

  // Returns a JSON-RPC response when the call is a request-desk call, or null to let the place agent answer it.
  async function rpc({ body, family, slug, card, callerKey, dryRun = false }) {
    const id = body && body.id, p = (body && body.params) || {};
    if (body && (body.method === 'tasks/get' || body.method === 'tasks/cancel')) {
      const r = find(p.id);
      if (!r || r.family !== family || r.slug !== slug) return null;
      if (body.method === 'tasks/get') return { jsonrpc: '2.0', id, result: asTask(r) };
      if (r.status !== 'submitted') return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Task cannot be canceled: the BinaSmart team has already acted on it' } };
      r.status = 'canceled'; r.updatedAt = stamp(); save();
      return { jsonrpc: '2.0', id, result: asTask(r) };
    }
    if (!body || body.method !== 'message/send' || !p.message || !Array.isArray(p.message.parts)) return null;
    const d = p.message.parts.find(x => x && (x.kind || x.type) === 'data' && x.data && x.data.skill === 'request');
    if (!d) return null;
    if (!enabled) return { jsonrpc: '2.0', id, error: { code: -32004, message: 'Requests through BinaSmart agents are not open yet. Use the place\'s bina.et page.' } };
    const a = d.data.arguments || {};
    const req = { request: clean(a.request, 500), name: clean(a.name, 80), contact: clean(a.contact, 120), when: clean(a.when, 80) };
    if (req.request.length < 5 || !req.name || !contactOk(req.contact)) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'A request needs arguments: request (what the person wants), name, and contact (the person\'s own phone or email). Optional: when.' } };
    if (!dryRun && (!perCaller(String(callerKey)) || !perDay('all'))) return { jsonrpc: '2.0', id, error: { code: -32005, message: 'Too many requests right now. Try again later, or use the place\'s bina.et page.' } };
    const place = String(card.name || slug).replace(/ on BinaSmart$/, ''), page = card.documentationUrl || BASE;
    const r = { id: uuid(), token: crypto.randomBytes(18).toString('hex'), contextId: typeof p.message.contextId === 'string' ? p.message.contextId : uuid(),
      family, slug, place, page, ...req, status: 'submitted', createdAt: stamp(), updatedAt: stamp(), caller: crypto.createHash('sha256').update(String(callerKey)).digest('hex').slice(0, 16),
      history: [{ kind: 'message', role: 'user', messageId: p.message.messageId || uuid(), parts: p.message.parts }] };
    const link = d2 => `${BASE}/a2a/requests/${r.id}/decide?t=${r.token}&d=${d2}`;
    const text = `🤝 A2A REQUEST — BinaSmart\n🏢 ${place} (${family})\n${page}\n👤 ${req.name} · ${req.contact}\n📝 ${req.request}` + (req.when ? `\n🕐 ${req.when}` : '') +
      `\n\nFrom an outside AI agent over A2A. Nothing was sent to the place or to this person.\n✅ Approve (we call the place): ${link('approve')}\n☑️ Done: ${link('done')}\n❌ Decline: ${link('decline')}`;
    if (dryRun) return { jsonrpc: '2.0', id, result: { ...asTask(r), metadata: { ...asTask(r).metadata, dryRun: true, wouldSend: text } } };
    load().push(r); save();
    const n = await sendAdmin(text).catch(() => 0);
    console.log(JSON.stringify({ t: 'a2a-request', family, slug, id: r.id, admins: n }));
    return { jsonrpc: '2.0', id, result: asTask(r) };
  }

  // The links in the Telegram message: GET shows a confirm button, POST applies it.
  function decidePage(idv, token, action, post) {
    const r = find(idv), st = STATES[action];
    const ok = r && st && typeof token === 'string' && token.length === r.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(r.token));
    const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px"><h2>${esc(title)}</h2>${body}</body>`;
    if (!ok) return { status: 404, html: page('Not found', '<p>This link is not valid.</p>') };
    const sum = `<p><b>${esc(r.place)}</b> (${esc(r.family)})<br>${esc(r.name)} · ${esc(r.contact)}<br>${esc(r.request)}${r.when ? '<br>🕐 ' + esc(r.when) : ''}</p><p>Status now: <b>${esc(r.status)}</b></p>`;
    if (!post) {
      if (!st.from.includes(r.status)) return { status: 200, html: page('Already ' + r.status, sum) };
      return { status: 200, html: page({ approve: 'Approve this request?', done: 'Mark this request done?', decline: 'Decline this request?' }[action],
        sum + `<form method="post"><button style="font:inherit;padding:10px 18px">${esc({ approve: '✅ Approve', done: '☑️ Done', decline: '❌ Decline' }[action])}</button></form>`) };
    }
    if (!st.from.includes(r.status)) return { status: 409, html: page('Already ' + r.status, sum) };
    r.status = st.to; r.updatedAt = stamp(); save();
    console.log(JSON.stringify({ t: 'a2a-request-decided', id: r.id, status: r.status }));
    return { status: 200, html: page('Saved: ' + r.status, sum.replace(/Status now: <b>[^<]*<\/b>/, 'Status now: <b>' + esc(r.status) + '</b>')) };
  }

  const skill = place => ({ id: 'request', name: 'Send a request to this place', tags: ['request', 'addis-ababa'],
    description: `Ask BinaSmart to pass a request to ${place}: a viewing, a quote, a room, whether a medicine is in stock. Send a data part {"skill":"request","arguments":{"request":"...","name":"...","contact":"the person's own phone or email","when":"optional"}}. The BinaSmart team reads it first and contacts the place by phone; nothing is sent to the place automatically. Follow it with tasks/get: submitted -> working -> completed, or rejected.`,
    examples: ['I would like to view the 2 bedroom apartment on Saturday morning'], inputModes: ['application/json'], outputModes: ['application/json'] });

  return { enabled, rpc, decidePage, skill, _rows: () => load() };
}
