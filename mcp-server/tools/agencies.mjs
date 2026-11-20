import { z } from 'zod';
import { toolError } from './ride.mjs';

export const BASE = 'https://bina.et';

export function registerAgencyTools(server, { wrap, json, fetchImpl = fetch }) {
  server.registerTool('list_overseas_agencies', {
    title: 'Licensed Ethiopian overseas employment agencies',
    description: 'Ethiopian agencies that send domestic workers to GCC countries, approved on BinaSmart/GCC Domestic: name, licence, whether it is in the Ministry of Labor and Skills register, and for each country its GCC partner office (the office families contact). Filter by country: UAE, KSA, Qatar, Kuwait, Bahrain, Oman. Recruitment is through LMIS only (Proclamation 1389/2025).',
    inputSchema: { country: z.enum(['UAE', 'KSA', 'Qatar', 'Kuwait', 'Bahrain', 'Oman']).optional().describe('GCC destination country; omit for all') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap('list_overseas_agencies', async ({ country }) => {
    try {
      const r = await fetchImpl(`${BASE}/api/overseas-agencies${country ? '?country=' + country : ''}`);
      if (!r.ok) return toolError('The agency list is temporarily unavailable.');
      const d = await r.json();
      return json({ count: d.agencies.length, updated: d.updated, agencies: d.agencies.map(a => ({ name: a.name, licence: a.licence, city: a.city,
        in_ministry_register: a.in_register, countries: a.countries, page: `${BASE}/overseas-agencies/${a.slug}` })),
        // When no agency has finished the partner check the API answers with an empty list AND a
        // note saying bina.et still lists the whole Ministry register. Dropping it here left the
        // tool saying only "count: 0", which an assistant reads as "Ethiopia has no licensed
        // agencies" - the opposite of true, and the one thing a family must not be told.
        ...(d.note ? { note: d.note } : {}),
        ...(d.ministry_register ? { ministry_register: d.ministry_register } : {}),
        source_url: `${BASE}/overseas-agencies` });
    } catch (e) { return toolError('The agency list is temporarily unavailable.'); }
  }));
}
