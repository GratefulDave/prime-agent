import { afterEach, describe, expect, it } from "vitest";
import { rtkExtension } from "../src/core/extensions/builtin/rtk.js";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "../src/core/extensions/types.js";

interface ExecCall {
	command: string;
	args: string[];
}

function createMockPi(
	execImpl: (
		command: string,
		args: string[],
	) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>,
) {
	const handlers = new Map<string, Array<(event: ToolCallEvent, ctx: ExtensionContext) => Promise<void> | void>>();
	const calls: ExecCall[] = [];
	const pi = {
		on(event: string, handler: (event: ToolCallEvent, ctx: ExtensionContext) => Promise<void> | void) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		async exec(command: string, args: string[]) {
			calls.push({ command, args });
			return execImpl(command, args);
		},
	} as unknown as ExtensionAPI;
	return { pi, handlers, calls };
}

function bashEvent(command: string): ToolCallEvent {
	return {
		type: "tool_call",
		toolCallId: "t1",
		toolName: "bash",
		input: { command },
	};
}

const idleCtx = { signal: undefined } as ExtensionContext;

describe("rtk extension", () => {
	const previousDisabled = process.env.RTK_DISABLED;
	afterEach(() => {
		if (previousDisabled === undefined) delete process.env.RTK_DISABLED;
		else process.env.RTK_DISABLED = previousDisabled;
	});

	it("rewrites eligible bash commands", async () => {
		delete process.env.RTK_DISABLED;
		const { pi, handlers, calls } = createMockPi(async (command, args) => {
			if (command === "rtk" && args[0] === "--version") {
				return { stdout: "rtk 0.45.0\n", stderr: "", code: 0, killed: false };
			}
			if (command === "rtk" && args[0] === "rewrite") {
				return { stdout: `rtk ${args[1]}\n`, stderr: "", code: 3, killed: false };
			}
			return { stdout: "", stderr: "missing", code: 1, killed: false };
		});

		await rtkExtension(pi);
		const event = bashEvent("git status");
		await handlers.get("tool_call")![0]!(event, idleCtx);

		expect(calls.map((call) => call.args[0])).toEqual(["--version", "rewrite"]);
		expect(event.input).toEqual({ command: "rtk git status" });
	});

	it("leaves ineligible commands unchanged", async () => {
		delete process.env.RTK_DISABLED;
		const { pi, handlers } = createMockPi(async (_command, args) => {
			if (args[0] === "--version") return { stdout: "rtk 0.45.0\n", stderr: "", code: 0, killed: false };
			return { stdout: "", stderr: "", code: 1, killed: false };
		});
		await rtkExtension(pi);
		const event = bashEvent("echo hi");
		await handlers.get("tool_call")![0]!(event, idleCtx);
		expect(event.input).toEqual({ command: "echo hi" });
	});

	it("does not register when rtk is missing", async () => {
		delete process.env.RTK_DISABLED;
		const { pi, handlers } = createMockPi(async () => ({
			stdout: "",
			stderr: "not found",
			code: 127,
			killed: false,
		}));
		await rtkExtension(pi);
		expect(handlers.get("tool_call")).toBeUndefined();
	});

	it("does not register when RTK_DISABLED=1", async () => {
		process.env.RTK_DISABLED = "1";
		const { pi, handlers, calls } = createMockPi(async () => ({
			stdout: "rtk 0.45.0\n",
			stderr: "",
			code: 0,
			killed: false,
		}));
		await rtkExtension(pi);
		expect(calls).toEqual([]);
		expect(handlers.get("tool_call")).toBeUndefined();
	});

	it("ignores non-bash tool calls", async () => {
		delete process.env.RTK_DISABLED;
		const { pi, handlers, calls } = createMockPi(async () => ({
			stdout: "rtk 0.45.0\n",
			stderr: "",
			code: 0,
			killed: false,
		}));
		await rtkExtension(pi);
		const event = {
			type: "tool_call",
			toolCallId: "t1",
			toolName: "edit",
			input: { path: "a.ts" },
		} as unknown as ToolCallEvent;
		await handlers.get("tool_call")![0]!(event, idleCtx);
		expect(calls).toHaveLength(1);
		expect(event.toolName).toBe("edit");
	});
});
