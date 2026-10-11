# Changelog

All notable changes to the BinaSmart MCP server (`https://bina.et/mcp`, registry name `et.bina/binasmart`).
Versions follow [Semantic Versioning](https://semver.org): a new tool or parameter is a minor version, a fix or a clearer description is a patch.

## [1.3.2] - 2026-10-11
### Changed
- Every tool also carries its title in `annotations.title` (MCP ToolAnnotations), which the Claude directory reads; the server copies each tool's title there, so new tools get it too.
- `search_cars` names its source (the BinaSmart car listings at https://bina.et/cars).
- `cancel_ride`, `search_properties` and `search_hotels` describe what they do instead of telling the assistant what to do.

## [1.3.1] - 2026-10-11
### Changed
- Every tool now carries a `title` and a `readOnlyHint` (25 read-only tools) or write annotation (`request_ride`; `cancel_ride` is also `destructiveHint`): `search_knowledge`, `list_pool_corridors` and `find_pool_groups` had none.
- Tool descriptions and the server instructions describe what each tool does instead of telling the assistant how to behave, and the instructions now name the job tools and `list_films`. The guide count is 25.
### Added
- A reserved reviewer number for directory reviews: `request_ride` with `0900000099` (+251900000099) resolves the real route and fixed fare, then returns a `TEST-` booking marked `test: true` that never reaches the dispatcher or a driver; `get_ride_status` and `cancel_ride` answer for that test ride without calling the ride service. Every other number books exactly as before.

## [1.3.0] - 2026-10-11
### Added
- Job cards (MCP Apps): `list_jobs` names the widget `ui://bina/jobs-v1.html` (`text/html;profile=mcp-app`). Hosts with the MCP Apps surface (Claude, ChatGPT) show the vacancies as cards: employer, city, field, a deadline countdown, salary where stated, **Apply on bina.et** (opened through the host) and **Ask about this job** (the assistant then calls `get_job`). Read-only; the page reaches no outside origin. The tool's JSON is unchanged, so other hosts get the same text. Built on `@modelcontextprotocol/ext-apps` 1.7.5, whose browser bundle is inlined into the page.
- `list_overseas_agencies`: licensed Ethiopian overseas employment agencies with their GCC partner offices, whether each is in the Ministry of Labor and Skills register, and their bina.et pages (filter by GCC country).
- `quote_ride` returns `book_url` (and one per tier): bina.et/ride opened with the route and the fixed fare, for assistants that cannot or should not call `request_ride`. The rider confirms on bina.et with their own phone.
### Changed
- Jobs: a vacancy is open exactly when the website says so. A date-only deadline closes at the end of that day in Addis Ababa, and an advert with no deadline counts as closed 90 days after it was published (before, undated adverts stayed open for ever).
- Reading a `ui://` widget page (`resources/list`, `resources/read`) is not counted against the anonymous hourly allowance.
- The docs page (`GET /mcp`) lists the four job tools.

## [1.2.1] - 2026-10-05
### Changed
- `search_hotels`: the `kind` parameter now says what each value covers (`guest_house` includes pensions; `apartment` is furnished apartments and suites), and the description says when to use `search_health` or `search_places` instead. From Glama's tool-definition review.

## [1.2.0] - 2026-10-05
### Added
- Public source repository (this one), MIT licence, `repository` field in the MCP Registry entry.
### Changed
- Test fixtures use reserved test phone numbers only.
- The guide-pages test skips when the main app's `public/` folder is absent, so the tests run from a clean clone.

## [1.1.0] - 2026-10-02
### Added
- Jobs: `list_jobs`, `get_job`, `list_job_fields`, `get_employer` (Amharic or English search by field and city).
- Tenders: `list_tenders`, `get_tender`, `list_tender_categories`.
- News: `list_news`, `get_news_article`.
- Homes and cars: `search_properties`, `search_cars`.
- Hotels and health: `search_hotels`, `search_health`.
- Shared commute: `list_pool_corridors`, `find_pool_groups`.
- Knowledge: `search_knowledge`; films: `list_films`.
- A shared usage meter with the knowledge API (anonymous allowance per address; API keys for higher limits).

## [1.0.0] - 2026-09-03
### Added
- First public release on the MCP Registry: `quote_ride`, `request_ride`, `get_ride_status`, `cancel_ride`, `search_places`, `get_hotel_rooms`, `get_hospital_departments`, `list_events`, `get_ethiopia_guide`.
- Write tools (`request_ride`, `cancel_ride`) marked `readOnlyHint: false`; per-phone and per-caller booking limits; an idempotency key so retries never double-book.

[1.2.1]: https://github.com/akembalo-svg/binasmart-mcp/releases/tag/v1.2.1
[1.2.0]: https://github.com/akembalo-svg/binasmart-mcp/releases/tag/v1.2.0
