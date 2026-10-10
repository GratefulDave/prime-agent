---
name: codemap
description: File skeletons, entropy summaries, and import-graph impact. Use for a known source file outline or blast radius before reading large bodies.
---

# Codemap

Optional local MCP. Call it through the pre-imported `mcp` object after
`prime-agent mcp enable codemap`.

```python
for tool in await mcp.list_tools("codemap"):
    print(tool["name"], "-", tool["description"])
result = await mcp.call_tool("codemap", "codemap", {"path": "src/foo.ts"})
```

Discover tools before calling. Use the skeleton or impact result to choose
exact line ranges, then read those ranges with the normal file tools.

If a call fails because the server is missing, tell the user to install
`codemap` on PATH or set `CODEMAP_MCP` to the server script.
