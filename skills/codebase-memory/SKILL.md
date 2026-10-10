---
name: codebase-memory
description: Graph-backed code intelligence for callers, callees, architecture, and unknown semantic discovery. Use after indexing, not for exact string search.
---

# Codebase Memory

Optional local MCP. Call it through the pre-imported `mcp` object after
`prime-agent mcp enable codebase-memory`.

```python
for tool in await mcp.list_tools("codebase-memory"):
    print(tool["name"], "-", tool["description"])
result = await mcp.call_tool("codebase-memory", "<tool>", arguments)
```

Discover tools before calling. Prefer graph search and path tracing over
dumping raw indexer output.

If a call fails because the server is missing, tell the user to install
`codebase-memory-mcp` or set `CODEBASE_MEMORY_MCP`.
