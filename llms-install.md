# Installing the BinaSmart MCP server (for AI agents such as Cline)

BinaSmart is a **remote** MCP server. There is nothing to clone, build or install, and it needs no API key.

- Endpoint: `https://bina.et/mcp`
- Transport: Streamable HTTP (stateless)
- Auth: none

## Cline

Add this entry to `cline_mcp_settings.json` (Cline → MCP Servers → Configure → "Configure MCP Servers"), then save:

```json
{
  "mcpServers": {
    "binasmart": {
      "type": "streamableHttp",
      "url": "https://bina.et/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Cline connects immediately and lists 27 tools (quote_ride, search_places, list_jobs, get_ethiopia_guide and more).

## Other clients

Any client that supports remote MCP servers over Streamable HTTP can use the same URL, for example:

- Claude: Settings → Connectors → Add custom connector → `https://bina.et/mcp`
- VS Code (`.vscode/mcp.json`): `{ "servers": { "binasmart": { "type": "http", "url": "https://bina.et/mcp" } } }`
- Cursor (`~/.cursor/mcp.json`): `{ "mcpServers": { "binasmart": { "url": "https://bina.et/mcp" } } }`

## Check it works

Ask: "Using BinaSmart, how much is a ride from Edna Mall to Piassa in Addis Ababa?" The answer should list fixed fares per vehicle tier with a bina.et booking link.

## Notes for agents

- `request_ride` books a real driver. Only call it after the user has confirmed pickup, drop-off, tier, fare and an Ethiopian phone number. Otherwise give the user the `book_url` from `quote_ride`.
- Every result includes a `source_url`; cite it.
- `node mcp-server/stdio.mjs` is a tool-definitions-only build for directories; it has no live data. Use the remote endpoint for real use.
