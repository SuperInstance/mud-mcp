# mud-mcp

**A text adventure MCP server — dynamic tools, prompts, and notifications for AI agents.** Explore rooms, battle monsters, collect items, and talk to NPCs through the Model Context Protocol.

## Brand Line
> An educational showcase of every MCP feature — tools that appear and disappear, prompts that adapt, and notifications that keep AI agents locked into the game state.

## Installation
```bash
npm install mud-mcp
# or
git clone https://github.com/SuperInstance/mud-mcp
cd mud-mcp
npm install
npm run build
```

## Usage
```bash
npm start          # Start the MCP server
npm run dev        # Development mode with auto-reload
```

Connect to Claude Desktop or any MCP-compatible client:

```json
{
  "mcpServers": {
    "mud-mcp": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

## MCP Features
- **Dynamic Tools**: `look`, `move`, `pick_up`, `battle`, `talk` — available based on game state
- **Contextual Prompts**: `room_description`, `quest_prompt`, `battle_prompt` — adapt to player context
- **Rich Resources**: `mud://world`, `mud://room/current`, `mud://player/inventory`
- **Real-time Notifications**: `tools/list_changed`, `prompts/list_changed`, `resources/changed`
- **AI Sampling**: Dynamic NPC dialogue generated via MCP sampling

## Fleet Context
Part of the Cocapn fleet. Related repos:
- [plato-sdk](https://github.com/SuperInstance/plato-sdk) — Python SDK for building PLATO agents
- [plato-server](https://github.com/SuperInstance/plato-server) — Knowledge server that agents can submit discoveries to
- [open-agents](https://github.com/SuperInstance/open-agents) — Agent runtime with fleet communication tools

---
🦐 Cocapn fleet — lighthouse keeper architecture
