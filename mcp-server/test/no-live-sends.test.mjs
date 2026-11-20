// No live send can leave the MCP server from a test, however the suite was started. 24 Oct 2026.
//
// The root guard (test/_live-guard.cjs) blocks Telegram, Facebook and SMS, but package.json loads it with
// --require, so it is only there under `npm test`. Running these .mjs files directly - which is what you
// do while working on them - leaves it out, and nothing said so: test/no-live-sends.test.js asserts
// BINA_TEST=1 but lives in the root suite, which a mcp-server file list does not include. So this suite
// gets its own, and the sender refuses on NODE_TEST_CONTEXT rather than on the guard being installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { adminTelegram } from '../server.mjs';

test('adminTelegram refuses to send from a test, whatever the invocation', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'node --test always sets NODE_TEST_CONTEXT');
  await assert.rejects(adminTelegram('this must never reach the admin chat'),
    /blocked in tests: adminTelegram would reach the live admin chat/);
});

// The invariant, not just today's code: one guarded sender. A second live reach added anywhere in
// mcp-server/ turns this red, so whoever adds it has to decide how a test is kept away from it.
test('mcp-server has exactly one way to reach a live message service', () => {
  const LIVE = /api\.telegram\.org|graph\.facebook\.com|api\.geezsms\.com|api\.tiktok(apis)?\.com/g;
  const root = new URL('..', import.meta.url).pathname;
  const hits = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'test' || name === 'node_modules') continue;
      const f = path.join(dir, name);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (!/\.(mjs|js|cjs)$/.test(name)) continue;
      for (const m of readFileSync(f, 'utf8').match(LIVE) || []) hits.push(path.relative(root, f) + ' -> ' + m);
    }
  };
  walk(root);
  assert.deepEqual(hits, ['server.mjs -> api.telegram.org'],
    'a new live sender needs the NODE_TEST_CONTEXT refusal adminTelegram has');
});
