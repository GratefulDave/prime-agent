/**
 * Built-in RTK hook. Rewrites agent bash commands through `rtk rewrite`
 * before execution so git/test/lint output stays compact.
 *
 * No-op when `rtk` is missing, too old, or RTK_DISABLED=1.
 * Prime Agent has no native bash minimizer, so every remaining command
 * is eligible for rewrite.
 */
import type { ExtensionContext, ExtensionFactory, ToolCallEvent } from "../types.js";

const REWRITE_TIMEOUT_MS = 2_000;
const MIN_SUPPORTED_RTK_MINOR = 23;

export const rtkExtension: ExtensionFactory = async (pi) => {
	if (process.env.RTK_DISABLED === "1") return;

	const version = await pi.exec("rtk", ["--version"], { timeout: REWRITE_TIMEOUT_MS });
	if (version.code !== 0) return;

	const match = version.stdout
		.replace(/^rtk\s+/, "")
		.trim()
		.match(/(\d+)\.(\d+)\.(\d+)/);
	if (match) {
		const major = Number.parseInt(match[1]!, 10);
		const minor = Number.parseInt(match[2]!, 10);
		if (major === 0 && minor < MIN_SUPPORTED_RTK_MINOR) return;
	}

	pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
		if (event.toolName !== "bash") return;
		const command = event.input.command;
		if (typeof command !== "string" || command.trim() === "") return;
		if (process.env.RTK_DISABLED === "1") return;

		try {
			const result = await pi.exec("rtk", ["rewrite", command], {
				timeout: REWRITE_TIMEOUT_MS,
				signal: ctx.signal,
			});
			if (result.killed || (result.code !== 0 && result.code !== 3)) return;
			const rewritten = result.stdout.trim();
			if (rewritten && rewritten !== command) event.input.command = rewritten;
		} catch {
			// Pass through the original command.
		}
	});
};
