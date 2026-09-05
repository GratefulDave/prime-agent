import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLocalIntelPreset, isLocalIntelServer, resolveLocalIntelConfig } from "../src/core/mcp/local-intel.js";

describe("local intel MCP presets", () => {
	const root = join(tmpdir(), `prime-local-intel-${process.pid}`);
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("recognizes the three optional server names", () => {
		expect(isLocalIntelServer("context-mode")).toBe(true);
		expect(isLocalIntelServer("codemap")).toBe(true);
		expect(isLocalIntelServer("codebase-memory")).toBe(true);
		expect(isLocalIntelServer("linear")).toBe(false);
	});

	it("resolves an env override to a stdio command", () => {
		mkdirSync(root, { recursive: true });
		const binary = join(root, "context-mode-mcp");
		writeFileSync(binary, "#!/bin/sh\n");
		chmodSync(binary, 0o755);
		const preset = getLocalIntelPreset("context-mode");
		expect(preset).toBeDefined();
		expect(resolveLocalIntelConfig(preset!, { CONTEXT_MODE_MCP: binary })).toEqual({
			type: "stdio",
			command: binary,
		});
	});

	it("runs a non-executable .mjs override through the current node", () => {
		mkdirSync(root, { recursive: true });
		const script = join(root, "server.mjs");
		writeFileSync(script, "export {}\n");
		const preset = getLocalIntelPreset("codemap");
		expect(resolveLocalIntelConfig(preset!, { CODEMAP_MCP: script })).toEqual({
			type: "stdio",
			command: process.execPath,
			args: [script],
		});
	});

	it("returns undefined when the override path is missing", () => {
		const preset = getLocalIntelPreset("codebase-memory");
		expect(resolveLocalIntelConfig(preset!, { CODEBASE_MEMORY_MCP: join(root, "missing") })).toBeUndefined();
	});

	it("resolves a home-relative codemap script through node", () => {
		const script = join(root, "PycharmProjects/the-library/tools/codemap/server.mjs");
		mkdirSync(join(script, ".."), { recursive: true });
		writeFileSync(script, "export {}\n");
		const preset = getLocalIntelPreset("codemap");
		expect(resolveLocalIntelConfig(preset!, { HOME: root, PATH: "" })).toEqual({
			type: "stdio",
			command: process.execPath,
			args: [script],
		});
	});
});
