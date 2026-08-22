export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.js";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export {
	createIpythonTool,
	createIpythonToolDefinition,
	IpythonKernelProvisioner,
	type IpythonToolDetails,
	type IpythonToolInput,
	type IpythonToolOptions,
} from "./ipython.js";
export {
	createSpawnSubagentTool,
	createSpawnSubagentToolDefinition,
	type SpawnSubagentToolDetails,
	type SpawnSubagentToolInput,
	type SpawnSubagentToolOptions,
	spawnSubagentSchema,
} from "./spawn-subagent.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "../extensions/types.js";
import { createIpythonToolDefinition, type IpythonToolOptions } from "./ipython.js";
import { createSpawnSubagentToolDefinition, type SpawnSubagentToolOptions } from "./spawn-subagent.js";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;
export const DEFAULT_BUILTIN_TOOL_NAMES = ["ipython", "spawn_subagent"] as const;
export type ToolName = (typeof DEFAULT_BUILTIN_TOOL_NAMES)[number];
export const allToolNames: Set<ToolName> = new Set(DEFAULT_BUILTIN_TOOL_NAMES);

export interface ToolsOptions {
	ipython?: IpythonToolOptions;
	spawnSubagent?: SpawnSubagentToolOptions;
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		ipython: createIpythonToolDefinition(cwd, options?.ipython),
		spawn_subagent: createSpawnSubagentToolDefinition(options?.spawnSubagent),
	};
}
