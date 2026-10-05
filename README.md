# BinaSmart MCP server

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-et.bina%2Fbinasmart-0b7d6b)](https://registry.modelcontextprotocol.io) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The public [Model Context Protocol](https://modelcontextprotocol.io) server for **BinaSmart** ([bina.et](https://bina.et)), Ethiopia's all-in-one platform. Any MCP-capable assistant (Claude, ChatGPT, Gemini and others) can use it to:

- **Ride in Addis Ababa**: quote fixed fares, book a ride (the user confirms first), check its status, cancel it
- **Find places**: buildings, hotels, hospitals and clinics, shops and restaurants, with their bina.et pages
- **Jobs and tenders**: open vacancies by field or city (Amharic or English), employers, open tenders with deadlines
- **Homes and cars**: properties for sale or rent, cars for sale
- **Guides and news**: the bilingual Digital Ethiopia guides (Fayda, passport, telebirr, tax, …) and Amharic news
- **BinaPool**: shared commute corridors and groups

**Endpoint:** `https://bina.et/mcp` (Streamable HTTP, stateless, no sign-in needed)
**Registry:** `et.bina/binasmart` on the [MCP Registry](https://registry.modelcontextprotocol.io)
**Docs:** `GET https://bina.et/mcp` · health: `https://bina.et/mcp/health`

## Connect

In any client that accepts a remote MCP server, add the URL `https://bina.et/mcp`. For example, in Claude: *Settings → Connectors → Add custom connector*.

## How it is built

- `mcp-server/server.mjs`: the MCP endpoint (Express + `@modelcontextprotocol/sdk`)
- `mcp-server/tools/`: one file per tool group (ride, directory, jobs, health, market, content, guides, knowledge)
- `mcp-server/lib/`: phone normalisation, an idempotency key so retries never double-book, a per-caller rate limiter, the ride API client
- `api/` and `hotels/rules.js`: the shared usage meter, API-key check and hotel rules from the main BinaSmart app, which this server imports

The server runs next to the private BinaSmart application and reads its data and settings at runtime (database, ride API on localhost, the `.env` file). **No credentials are in this repository.** So this code documents exactly what the public endpoint does, but on its own it will not run against BinaSmart data.

## Safety

- `request_ride` and `cancel_ride` are marked as write tools (`readOnlyHint: false`), so clients ask the user before calling them.
- Bookings are limited per phone (5 per 10 minutes) and per caller (10 per hour). Retries with the same details within 10 minutes return the same booking instead of a second one.
- Only Ethiopian phone numbers are accepted for rides. Phone numbers are masked in logs.
- Privacy: [bina.et/privacy](https://bina.et/privacy) · Terms: [bina.et/terms](https://bina.et/terms) · Support: [bina.et/support](https://bina.et/support)

## Tests

```bash
cd mcp-server && npm install && node --test test/*.test.mjs
```

The tests use reserved test phone numbers only.

## Licence

MIT. See [LICENSE](LICENSE). © 2026 BinaSmart (Ibrahim Kedir).
