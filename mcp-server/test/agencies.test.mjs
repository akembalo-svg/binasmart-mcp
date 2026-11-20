import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAgencyTools } from '../tools/agencies.mjs';

test('list_overseas_agencies passes the country and shapes the answer', async () => {
  const reg = {}; let asked = '';
  const fetchImpl = async (u) => { asked = u; return { ok: true, json: async () => ({ updated: 'x', agencies: [{ name: 'Z', licence: 'L', city: 'A', in_register: true, slug: 'z-1', countries: [{ country: 'UAE', office: 'O', office_url: 'u' }] }] }) }; };
  registerAgencyTools({ registerTool: (n, _d, f) => { reg[n] = f; } }, { wrap: (_n, f) => f, json: d => ({ content: [{ type: 'text', text: JSON.stringify(d) }] }), fetchImpl });
  const out = JSON.parse((await reg.list_overseas_agencies({ country: 'UAE' })).content[0].text);
  assert.match(asked, /country=UAE$/);
  assert.equal(out.agencies[0].page, 'https://bina.et/overseas-agencies/z-1');
  assert.ok(!out.note, 'no empty-state note when there are agencies to show');
});

// The tool used to build its answer from four fields and drop the rest, so when no agency had
// finished the partner check it replied with only "count: 0". An assistant reads that as "Ethiopia
// has no licensed agencies", which is the opposite of true - bina.et lists the whole Ministry
// register - and it is the one thing a family must not be told. Real external callers use this
// tool, so the note has to survive the hop (24 Oct 2026).
test('an empty list carries the note and the register pointer through', async () => {
  const reg = {};
  const body = { updated: 'x', agencies: [],
    note: 'No Ethiopian agency has completed the BinaSmart GCC partner check yet, so this list is empty. bina.et lists 1,237 agencies from the Ministry of Labour and Skills register.',
    ministry_register: { count: 1237, url: 'https://bina.et/domestic-agencies', caveat: 'register entries only - licences not seen by BinaSmart' } };
  const fetchImpl = async () => ({ ok: true, json: async () => body });
  registerAgencyTools({ registerTool: (n, _d, f) => { reg[n] = f; } },
    { wrap: (_n, f) => f, json: d => ({ content: [{ type: 'text', text: JSON.stringify(d) }] }), fetchImpl });
  const out = JSON.parse((await reg.list_overseas_agencies({})).content[0].text);
  assert.equal(out.count, 0);
  assert.match(out.note, /partner check yet/, 'the tool must say WHY it is empty');
  assert.match(out.note, /Ministry of Labour and Skills register/);
  assert.equal(out.ministry_register.count, 1237);
  assert.match(out.ministry_register.caveat, /licences not seen/);
});
