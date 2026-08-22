import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.js";
import type { RlmSpawnHandle } from "../rlm-runtime.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

export const spawnSubagentSchema = Type.Object({
	task: Type.String({
		description: "Self-contained task for the child agent. The child does not see this conversation.",
	}),
	name: Type.Optional(
		Type.String({
			description: "Stable unique name among sibling children. Omit to let the host generate one.",
		}),
	),
});

export type SpawnSubagentToolInput = Static<typeof spawnSubagentSchema>;
export type SpawnSubagentToolDetails = RlmSpawnHandle;

export interface SpawnSubagentToolOptions {
	run?: (task: string, name?: string) => Promise<RlmSpawnHandle>;
}

export function createSpawnSubagentToolDefinition(
	options?: SpawnSubagentToolOptions,
): ToolDefinition<typeof spawnSubagentSchema, SpawnSubagentToolDetails> {
	return {
		name: "spawn_subagent",
		label: "spawn_subagent",
		description:
			"Spawn an independent child agent for a self-contained task. Returns immediately after admission with rlm_child_id, name, session_dir, and model. Never waits for or returns the child's answer. Use this instead of doing that work inline. End the turn after spawning.",
		promptSnippet: "spawn_subagent - admit an RLM child agent and return its handle",
		executionMode: "sequential",
		parameters: spawnSubagentSchema,
		execute: async (_toolCallId, params) => {
			if (!options?.run) {
				throw new Error("spawn_subagent is not wired to a session");
			}
			const name = params.name?.trim() ? params.name.trim() : undefined;
			const handle = await options.run(params.task, name);
			return {
				content: [{ type: "text", text: JSON.stringify(handle) }],
				details: handle,
			};
		},
	};
}

export function createSpawnSubagentTool(options?: SpawnSubagentToolOptions): AgentTool<typeof spawnSubagentSchema> {
	return wrapToolDefinition(createSpawnSubagentToolDefinition(options));
}
