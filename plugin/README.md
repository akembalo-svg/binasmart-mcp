# BinaSmart plugin for Claude

Ethiopia's everyday services inside Claude, from [BinaSmart](https://bina.et).

The plugin connects Claude to the public BinaSmart MCP server at `https://bina.et/mcp`, and adds five skills that show Claude how to use it well:

| Skill | What it helps with |
|---|---|
| `addis-ride` | Fixed-fare rides in Addis Ababa. Quote every tier, book once the person confirms the details (or hand them a one-tap booking link), check a ride's status or cancel it, and use BinaPool shared commuting |
| `ethiopia-jobs` | Find job vacancies by field, city or company, read the full advert and how to apply, keep job seekers safe from fees, and find licensed agencies for work in the Gulf |
| `ethiopia-paperwork` | Step-by-step guides to Ethiopian government and banking services (Fayda ID, e-Passport, TIN, trade licence, driving licence, Labor ID / LMIS and more), with the official offices and portals |
| `addis-places` | Hotels, hospitals, clinics and doctors, shops and restaurants, homes for rent or sale, cars for sale, events, Amharic films and news |
| `ethiopia-tenders` | Open tenders and procurement notices, with deadlines, bid bonds and the original notice |

## What it runs and what it sends

- **No code runs on your machine.** The plugin contains only Markdown skills and one MCP server entry in `.mcp.json`.
- **Tool calls go only to `https://bina.et/mcp`.** That server is operated by BinaSmart, and its source is in this repository (`mcp-server/`).
- **Almost every tool only reads public listings.** Two tools write:
  - `request_ride` books a ride and sends the rider's name and Ethiopian phone number to BinaSmart's dispatcher;
  - `cancel_ride` cancels that ride.

  Claude asks before using either.
- No account or sign-in is needed. Privacy policy: https://bina.et/privacy

## Install

Add the plugin from the Claude directory. Or add the connector on its own, without the skills, by pasting the URL `https://bina.et/mcp` as a custom connector.

## Support and licence

Support: https://bina.et/support. Licence: MIT (see `LICENSE`).
