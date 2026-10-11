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
});
