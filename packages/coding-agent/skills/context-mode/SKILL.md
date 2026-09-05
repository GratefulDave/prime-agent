---
name: context-mode
description: Token firewall for large command, file, and web output. Use when analyzing logs, check output, or other large text without dumping it into context.
---

# Context Mode

Optional local MCP. Call it through the pre-imported `mcp` object after
`prime-agent mcp enable context-mode`.

```python
for tool in await mcp.list_tools("context-mode"):
    print(tool["name"], "-", tool["description"])
result = await mcp.call_tool("context-mode", "<tool>", arguments)
```

Discover tools before calling. Typical jobs: run a command or read a file in
the sandbox and print only the derived answer.

If a call fails because the server is missing, tell the user to install
`context-mode-mcp` or set `CONTEXT_MODE_MCP`.
