'use strict';
// Who may say "this request is evaluation traffic".
//
// `x-binasmart-eval: 1` does two things: it keeps the harnesses out of the memory and handover paths,
// and - server.js:1045 - it changes the key the per-user memory and the limiter are counted under. Until
// 2026-09-18 anybody could send it, which meant anybody could step out of being counted by adding one
// header. It is now the owner key, or loopback.
//
// Loopback counts because every harness that sets the header (ops/bini/amharic-eval.js,
// ops/health/afiya-eval.js, ops/law/asmat-eval.js, ops/oromo-eval.js, ops/owner/eval.js) runs ON the
// server against http://127.0.0.1:PORT, so they keep working untouched and no key has to be written
// into a script. Requests that arrived through nginx always carry X-Forwarded-For (bina.et's
// `location /` adds it after any client copy), so an outside caller can never look like loopback.

const LOOPBACK = /^(::ffff:)?127\.\d+\.\d+\.\d+$|^::1$/;

function evalAllowed(req, ownerKey) {
  const h = (req && req.headers) || {};
  if (String(h['x-binasmart-eval'] || '') !== '1') return false;
  if (ownerKey && String(h['x-owner-key'] || '') === String(ownerKey)) return true;
  return !h['x-forwarded-for'] && LOOPBACK.test(String((req && req.ip) || ''));
}

// The MCP server (mcp-server/server.mjs) needs the same question answered under a STRICTER rule, so it
// gets its own function rather than a flag on evalAllowed: there, `x-binasmart-eval: 1` only ever means
// "this is a dry run, do not tell the admin chat", it is never a way to be counted differently, and no
// owner key may claim it from outside. Its proxy header is x-real-ip and it reads the raw socket, so
// 127.0.0.1 means a process on this box. Exactly 127.0.0.1 - not 127.x.x.x - because nothing on the
// server talks to the MCP port on any other loopback address.
const SOCKET_LOOPBACK = /^(::ffff:)?127\.0\.0\.1$|^::1$/;

function localEvalDryRun(req) {
  const h = (req && req.headers) || {};
  if (String(h['x-binasmart-eval'] || '') !== '1') return false;
  if (h['x-real-ip']) return false;                       // arrived through nginx: not local
  return SOCKET_LOOPBACK.test(String((req && req.socket && req.socket.remoteAddress) || ''));
}

module.exports = { evalAllowed, localEvalDryRun };
