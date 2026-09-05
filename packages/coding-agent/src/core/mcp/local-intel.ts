import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";
import type { BundledMcpsSettings, McpServerConfig } from "../settings-manager.js";

export const LOCAL_INTEL_SERVERS = ["context-mode", "codemap", "codebase-memory"] as const;

export type LocalIntelServer = (typeof LOCAL_INTEL_SERVERS)[number];

export type BundledMcpKey = keyof BundledMcpsSettings;

export type { BundledMcpsSettings };

export interface LocalIntelPreset {
	server: LocalIntelServer;
	label: string;
	settingKey: BundledMcpKey;
	commandCandidates: string[];
	/** Home-relative or absolute .mjs/.js servers launched with node. */
	scriptCandidates?: string[];
	envCommand: string;
}

export const LOCAL_INTEL_PRESETS: readonly LocalIntelPreset[] = [
	{
		server: "context-mode",
		label: "Context Mode",
		settingKey: "contextMode",
		commandCandidates: ["context-mode-mcp"],
		envCommand: "CONTEXT_MODE_MCP",
	},
	{
		server: "codemap",
		label: "Codemap",
		settingKey: "codemap",
		commandCandidates: ["codemap"],
		scriptCandidates: ["PycharmProjects/the-library/tools/codemap/server.mjs"],
		envCommand: "CODEMAP_MCP",
	},
	{
		server: "codebase-memory",
		label: "Codebase Memory",
		settingKey: "codebaseMemory",
		commandCandidates: ["codebase-memory-mcp"],
		envCommand: "CODEBASE_MEMORY_MCP",
	},
];

export function isLocalIntelServer(name: string): name is LocalIntelServer {
	return (LOCAL_INTEL_SERVERS as readonly string[]).includes(name);
}

export function getLocalIntelPreset(name: string): LocalIntelPreset | undefined {
	return LOCAL_INTEL_PRESETS.find((preset) => preset.server === name);
}

export function getBundledMcps(settings: BundledMcpsSettings | undefined): Required<BundledMcpsSettings> {
	return {
		contextMode: settings?.contextMode === true,
		codemap: settings?.codemap === true,
		codebaseMemory: settings?.codebaseMemory === true,
	};
}

export function isLocalIntelEnabled(settings: BundledMcpsSettings | undefined, preset: LocalIntelPreset): boolean {
	return getBundledMcps(settings)[preset.settingKey];
}

export function missingLocalIntelMessage(preset: LocalIntelPreset): string {
	return `Optional MCP "${preset.server}" is not installed. Install ${preset.label} so ${preset.commandCandidates.join(" or ")} is on PATH, or set ${preset.envCommand} to the executable or .mjs server path.`;
}

export function resolveLocalIntelConfig(
	preset: LocalIntelPreset,
	env: NodeJS.ProcessEnv = process.env,
): McpServerConfig | undefined {
	const override = env[preset.envCommand]?.trim();
	if (override) {
		const fromOverride = resolveCommandSpec(override);
		if (fromOverride) return fromOverride;
		return undefined;
	}
	for (const candidate of preset.commandCandidates) {
		const resolved = findExecutableSync(candidate, env);
		if (resolved) return { type: "stdio", command: resolved };
	}
	for (const script of scriptCandidatePaths(preset, env)) {
		const resolved = resolveCommandSpec(script);
		if (resolved) return resolved;
	}
	return undefined;
}

function scriptCandidatePaths(preset: LocalIntelPreset, env: NodeJS.ProcessEnv): string[] {
	const paths: string[] = [];
	const hub = env.LIBRARY_HUB?.trim();
	if (hub && preset.server === "codemap") {
		paths.push(join(hub, "tools/codemap/server.mjs"));
	}
	const home = env.HOME?.trim();
	for (const candidate of preset.scriptCandidates ?? []) {
		paths.push(candidate.startsWith("/") ? candidate : home ? join(home, candidate) : candidate);
	}
	return paths;
}

function resolveCommandSpec(raw: string): McpServerConfig | undefined {
	if (existsSync(raw)) {
		const extension = extname(raw).toLowerCase();
		if ((extension === ".js" || extension === ".mjs" || extension === ".cjs") && !isExecutableSync(raw)) {
			return { type: "stdio", command: process.execPath, args: [raw] };
		}
		return { type: "stdio", command: raw };
	}
	const fromPath = findExecutableSync(raw, process.env);
	return fromPath ? { type: "stdio", command: fromPath } : undefined;
}

function findExecutableSync(name: string, env: NodeJS.ProcessEnv): string | undefined {
	if (name.includes("/") || name.includes("\\")) {
		return isExecutableSync(name) ? name : undefined;
	}
	const pathValue = env.PATH;
	if (!pathValue) return undefined;
	const candidates = process.platform === "win32" ? [name, `${name}.exe`, `${name}.cmd`] : [name];
	for (const dir of pathValue.split(delimiter)) {
		if (!dir) continue;
		for (const candidate of candidates) {
			const fullPath = join(dir, candidate);
			if (isExecutableSync(fullPath)) return fullPath;
		}
	}
	return undefined;
}

function isExecutableSync(file: string): boolean {
	try {
		accessSync(file, constants.X_OK);
		return true;
	} catch {
		return process.platform === "win32" && existsSync(file);
	}
}
