# Changelog

All notable changes to the BinaSmart MCP server (`https://bina.et/mcp`, registry name `et.bina/binasmart`).
Versions follow [Semantic Versioning](https://semver.org): a new tool or parameter is a minor version, a fix or a clearer description is a patch.

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
