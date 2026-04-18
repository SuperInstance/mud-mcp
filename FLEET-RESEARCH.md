# Fleet Research: mud-mcp

**Forked:** 2026-04-18
**Source:** [Nexlen/mud-mcp](https://github.com/Nexlen/mud-mcp)

## Why We Forked
MUD-MCP implements the Model Context Protocol (MCP 2025-03-26 spec) on top of a MUD server. This directly validates our rooms-as-system-prompts pattern in cocapn-mud.

## What to Extract
- **MCP server implementation** — how tools, prompts, and sampling are exposed via JSON-RPC
- **State management** — player location, inventory, quest progress as structured context
- **AI-powered sampling** — dynamic NPC content generation via MCP sampling
- **Protocol bridge** — pattern for connecting MCP-compatible agents to MUD rooms

## Fleet Integration Targets
- `cocapn-mud` — add MCP server capability so any MCP agent can enter rooms natively
- `holodeck-rust` — MCP could standardize room→agent communication protocol
- `plato-ship-demo` — public demo could expose MCP endpoint for external agent testing

## Notes
- Only 94 lines of TypeScript — small enough to fully understand
- Uses the official MCP SDK
- Rooms map directly to our tile system concept
