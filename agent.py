#!/usr/bin/env python3
"""
mud-mcp — Model Context Protocol server for the PLATO MUD
Exposes MUD rooms, objects, and agent actions as MCP tools.
Allows external AI systems (Claude, Kimi, etc.) to interact with the fleet MUD.
"""

import json, urllib.request
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class MCPTool:
    name: str
    description: str
    parameters: Dict
    handler: callable

class MUDMCPServer:
    def __init__(self, mud_url="http://147.224.38.131:4042", plato_url="http://147.224.38.131:8847"):
        self.mud_url = mud_url
        self.plato_url = plato_url
        self.tools: Dict[str, MCPTool] = {}
        self._register_default_tools()
    
    def _register_default_tools(self):
        self.register_tool("mud_look", "Look around the current room", 
                          {"room": "string"}, self._look)
        self.register_tool("mud_move", "Move to another room", 
                          {"direction": "string"}, self._move)
        self.register_tool("mud_examine", "Examine an object", 
                          {"object": "string"}, self._examine)
        self.register_tool("mud_say", "Say something in the current room", 
                          {"message": "string"}, self._say)
        self.register_tool("plato_status", "Get PLATO fleet status", 
                          {}, self._plato_status)
        self.register_tool("plato_submit", "Submit a tile to PLATO", 
                          {"question": "string", "answer": "string"}, self._plato_submit)
    
    def register_tool(self, name: str, description: str, parameters: Dict, handler):
        self.tools[name] = MCPTool(name, description, parameters, handler)
    
    def _look(self, room: str) -> Dict:
        try:
            req = urllib.request.Request(f"{self.mud_url}/room/{room}")
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read())
        except Exception as e:
            return {"error": str(e), "room": room, "description": "A dark room. You see nothing."}
    
    def _move(self, direction: str) -> Dict:
        return {"action": "move", "direction": direction, "result": f"You move {direction}."}
    
    def _examine(self, object: str) -> Dict:
        return {"action": "examine", "object": object, "details": f"The {object} is unremarkable."}
    
    def _say(self, message: str) -> Dict:
        return {"action": "say", "message": message, "echo": f"You say: '{message}'"}
    
    def _plato_status(self) -> Dict:
        try:
            req = urllib.request.Request(f"{self.plato_url}/status")
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read())
        except Exception as e:
            return {"error": str(e), "status": "unknown"}
    
    def _plato_submit(self, question: str, answer: str) -> Dict:
        try:
            payload = json.dumps({"question": question, "answer": answer, "agent": "mud-mcp"}).encode()
            req = urllib.request.Request(f"{self.plato_url}/submit", data=payload,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as r:
                return {"submitted": True, "response": r.read().decode()[:200]}
        except Exception as e:
            return {"submitted": False, "error": str(e)}
    
    def list_tools(self) -> List[Dict]:
        return [{"name": t.name, "description": t.description, "parameters": t.parameters} 
                for t in self.tools.values()]
    
    def call_tool(self, name: str, **kwargs) -> Dict:
        if name not in self.tools:
            return {"error": f"Tool '{name}' not found"}
        tool = self.tools[name]
        return tool.handler(**kwargs)

def demo():
    server = MUDMCPServer()
    
    print("=== MUD MCP Tools ===")
    for tool in server.list_tools():
        print(f"  • {tool['name']}: {tool['description']}")
    
    print("\n=== Calling plato_status ===")
    result = server.call_tool("plato_status")
    print(json.dumps(result, indent=2)[:500])
    
    print("\n=== Calling mud_look ===")
    result = server.call_tool("mud_look", room="harbor")
    print(json.dumps(result, indent=2)[:500])

if __name__ == "__main__":
    demo()
