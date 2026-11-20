# BinaSmart MCP server

**Endpoint:** `https://bina.et/mcp` (Streamable HTTP, stateless, no auth) · **Health:** `https://bina.et/mcp/health`

BinaSmart (bina.et) is Ethiopia's all-in-one digital platform: fixed-price ride-hailing in Addis Ababa, a directory of buildings, hotels, hospitals and shops, events, and bilingual Digital Ethiopia guides. This server lets AI assistants (Claude, ChatGPT, Gemini) use it.

## Tools
| Tool | What it does | Writes? |
|---|---|---|
| `quote_ride` | fixed ETB fare for every tier between two Addis places | no |
| `request_ride` | books a ride (name + Ethiopian phone); dispatcher confirms by phone | **yes** |
| `get_ride_status` | status, driver, plate for a ride id + phone | no |
| `cancel_ride` | cancel before the trip starts | **yes** |
| `search_places` | buildings, hotels, hospitals, shops (cafés, restaurants, pharmacies, banks…) | no |
| `get_hotel_rooms` | room types and nightly prices | no |
| `get_hospital_departments` | departments, fees, slots left | no |
| `search_health` | hospitals, clinics, dentists, labs and doctors across Addis Ababa: by kind, sub-city, specialty or near a place (nearest first), each with its bina.et/health page and landline. Not medical advice; emergencies 907 | no |
| `search_restaurants` | about 890 restaurants, cafés and fast-food places in Addis Ababa by name, cuisine, kind or sub-city: phone, map point (for quote_ride) and bina.et page | no |
| `search_pharmacies` | about 1,700 pharmacies by name or area; with a medicine, whether any pharmacy reported having it in the last 7 days and whether it needs a prescription. Not medical advice | no |
| `search_properties` | homes for sale and rent from Addis real-estate companies' own sites, checked weekly: price as written, bedrooms, area, the company's phone and WhatsApp | no |
| `search_cars` | new and used cars from Addis dealers' own sites, checked weekly: make, model, year, price, mileage, the dealer's phone and WhatsApp | no |
| `search_hotels` | hotels, guest houses and furnished apartments (1,000+): type, stars, sub-city, the hotel's own phone and website, bina.et page; no prices or availability | no |
| `list_events` | upcoming films, concerts and events on sale, prices, seats left | no |
| `list_films` | Amharic films to watch online: free or 48-hour rental, watch url | no |
| `list_cinema_showtimes` | what is on in Addis Ababa cinemas this week: times and dates as each cinema posted them, with the link to its post | no |
| `list_tv_and_radio` | Ethiopian TV channels and radio stations: live now or not, the live link, newest videos (BinaWatch) | no |
| `list_tv_series` | Ethiopian TV series and their newest episodes, with watch links | no |
| `get_ethiopia_guide` | 25 step-by-step guides: Fayda, telebirr, TIN, VAT, eVisa, driving licence… | no |
| `search_knowledge` | semantic search over every BinaSmart service, its rules, the guides and practical Addis Ababa knowledge; returns passages + source_url | no |
| `list_pool_corridors` | BinaPool shared-commute corridors open now, stops, live seat-price ladder, cars filling | no |
| `find_pool_groups` | cars filling within ~2.5 km of a point: seats left, price, women-only, share url | no |
| `list_tenders` | open Ethiopian tender notices: organisation, deadline, days left, budget, link to the original notice | no |
| `list_tender_categories` | which tender categories are open now and how many in each | no |
| `get_tender` | one tender in full, including the notice body | no |
| `list_news` | recent BinaSmart news, mostly Amharic: technology, business, law, real estate | no |
| `get_news_article` | one news article in full | no |
| `list_jobs` | open job vacancies in Ethiopia: title, company, city, deadline and days left, salary where stated. **Shows as job cards** where the assistant supports MCP Apps | no |
| `get_job` | one vacancy in full: duties, requirements, how to apply | no |
| `list_job_fields` | fields of work and cities hiring now, with counts | no |
| `get_employer` | a company and every vacancy it posted | no |
| `search_companies` | companies on BinaSmart (developers, car sellers, agencies, employers): sub-city, website, hiring or not, bina.et page | no |
| `list_overseas_agencies` | Ethiopian agencies sending domestic workers to GCC countries: licence, whether in the Ministry of Labor and Skills register, partner offices per country | no |

## Job cards (MCP Apps)
`list_jobs` names the widget `ui://bina/jobs-v1.html` (`text/html;profile=mcp-app`). Claude, ChatGPT and other hosts with the MCP Apps surface show the vacancies as cards: the employer, a deadline countdown, **Apply on bina.et** and **Ask about this job** (the assistant then fetches `get_job`). The widget only reads the tool result and opens bina.et links; it applies for nothing and sends nothing. Hosts without the surface get the same JSON as text.

## Connect
- **Claude Code:** `claude mcp add --transport http binasmart https://bina.et/mcp`
- **Gemini (Spark):** gemini.google.com → Settings → Connected apps → Custom apps → `https://bina.et/mcp`
- **Any client:** `POST https://bina.et/mcp` with `Accept: application/json, text/event-stream`

## Limits
Rides: 5 requests per 10 minutes per phone; 30 tool calls/min and 10 bookings/hour per session. Addis Ababa only. Fares are fixed at quote time — no surge.

Questions: https://bina.et · WhatsApp https://wa.me/251911244344

## Source and licence
Source code: https://github.com/akembalo-svg/binasmart-mcp (MIT licence) · Changelog: https://github.com/akembalo-svg/binasmart-mcp/blob/main/CHANGELOG.md · MCP Registry: et.bina/binasmart

## A2A (Agent2Agent)

The same tools are reachable over A2A 0.3 (JSON-RPC 2.0) at `https://bina.et/a2a`; the agent card is at `https://bina.et/.well-known/agent-card.json`.

- `message/send` with a **text** part → answered from the knowledge base (`search_knowledge`), with source urls.
- `message/send` with a **data** part `{ "tool": "search_pharmacies", "arguments": { "query": "Bole" } }` → runs that tool.
- The result is a completed task; its artifact has a text part (JSON) and a data part (the same object). `tasks/get` reads it back for an hour.
- `request_ride` and `cancel_ride` are not available over A2A (they act in the world): use `quote_ride` and give the person its `book_url`.
- Same allowance as `/mcp` (20 requests per UTC hour per address without a key). No streaming or push notifications.
