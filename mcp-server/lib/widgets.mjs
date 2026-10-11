import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

// MCP Apps (11 Oct 2026). A host with the apps surface (Claude, ChatGPT) renders a tool's result in a sandboxed iframe
// when the tool names a ui:// resource in _meta.ui.resourceUri. list_jobs is the first: vacancies as cards with an
// "Apply on bina.et" button, because ChatGPT already sends ~1,000 job seekers a week to bina.et and a card is quicker
// to act on than a paragraph. The tool's JSON is unchanged, so a host without the surface still gets the same text.
//
// The URI carries a version: hosts cache UI resources hard, so a changed widget gets a new name (jobs-v2.html …).
export const JOBS_WIDGET_URI = 'ui://bina/jobs-v1.html';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// The iframe's CSP blocks script loads from anywhere, so the ext-apps browser bundle is inlined into the page. Its
// closing `export{a as App,…}` becomes `globalThis.ExtApps={App:a,…}` because an inline module cannot be imported from.
export function inlineBundle() {
  const src = fs.readFileSync(require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'), 'utf8');
  const out = src.replace(/export\{([^}]+)\};?\s*$/, (_, body) => 'globalThis.ExtApps={' + body.split(',').map(p => {
    const [local, exported] = p.split(' as ').map(s => s.trim());
    return `${exported ?? local}:${local}`;
  }).join(',') + '};');
  if (out === src) throw new Error('ext-apps bundle: trailing export not found');
  return out.replace(/<\/script/gi, '<\\/script');
}

let html;
export function jobsWidgetHtml() {
  if (!html) html = fs.readFileSync(path.join(here, '..', 'widgets', 'jobs.html'), 'utf8').replace('/*__EXT_APPS_BUNDLE__*/', () => inlineBundle());
  return html;
}

export function registerWidgets(server) {
  registerAppResource(server, 'BinaSmart job cards', JOBS_WIDGET_URI,
    { description: 'Interactive cards for list_jobs results: each vacancy with its employer, deadline and an apply link on bina.et.' },
    async () => ({ contents: [{ uri: JOBS_WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: jobsWidgetHtml(),
      // No outside origins: the page draws only from the tool result and opens links through the host.
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } }] }));
}
