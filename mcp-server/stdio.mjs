// Standalone stdio entry for MCP directories (for example Glama) that start the server in their own
// container to read and score its tool definitions. It registers exactly the same tools as the live
// endpoint, but it has no BinaSmart database, ride API or .env, so tool calls that need live data
// return an error pointing to the real server. For real use, connect to https://bina.et/mcp.
//   node mcp-server/stdio.mjs
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.mjs';

const OFFLINE = 'This standalone build only describes the tools. For live data, connect to https://bina.et/mcp.';
const offline = async () => { throw new Error(OFFLINE); };
const rideApi = new Proxy({}, { get: () => offline });
const db = { query: offline, connect: offline };

const server = buildServer({ rideApi, db, guides: new Map(), callerKey: 'stdio', callsRL: () => true, bookRL: () => true });
await server.connect(new StdioServerTransport());
console.error('[mcp] BinaSmart MCP (standalone stdio) ready; live endpoint: https://bina.et/mcp');
