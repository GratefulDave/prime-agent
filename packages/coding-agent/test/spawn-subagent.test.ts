import { describe, expect, test } from "vitest";
import { createSpawnSubagentToolDefinition } from "../src/core/tools/spawn-subagent.js";

describe("createSpawnSubagentToolDefinition", () => {
	test("describes admission-only child spawn", () => {
		const tool = createSpawnSubagentToolDefinition();
		expect(tool.name).toBe("spawn_subagent");
		expect(tool.description).toContain("Returns immediately after admission");
		expect(tool.parameters.properties.task).toBeDefined();
	});

	test("admits a child through the wired session runner", async () => {
		const handle = {
			rlm_child_id: "sub-1",
			name: "herdr-inspect",
			session_dir: "/tmp/child",
			model: "xai-oauth/grok-4.6",
		};
		const tool = createSpawnSubagentToolDefinition({
			run: async (task, name) => {
				expect(task).toBe("inspect live herdr");
				expect(name).toBe("herdr-inspect");
				return handle;
			},
		});

		const result = await tool.execute(
			"call-1",
			{ task: "inspect live herdr", name: "herdr-inspect" },
			undefined,
			undefined,
			undefined as never,
		);

		expect(result.details).toEqual(handle);
		expect(result.content).toEqual([{ type: "text", text: JSON.stringify(handle) }]);
	});

	test("omits a blank name so the host can generate one", async () => {
		const tool = createSpawnSubagentToolDefinition({
			run: async (task, name) => {
				expect(task).toBe("shard");
				expect(name).toBeUndefined();
				return {
					rlm_child_id: "sub-2",
					name: "subagent-shard-abcd",
					session_dir: "/tmp/child-2",
					model: "xai-oauth/grok-4.6",
				};
			},
		});

		await tool.execute("call-2", { task: "shard", name: "   " }, undefined, undefined, undefined as never);
	});

	test("throws when the tool is not wired to a session", async () => {
		const tool = createSpawnSubagentToolDefinition();
		await expect(tool.execute("call-3", { task: "nope" }, undefined, undefined, undefined as never)).rejects.toThrow(
			"spawn_subagent is not wired to a session",
		);
	});
});
