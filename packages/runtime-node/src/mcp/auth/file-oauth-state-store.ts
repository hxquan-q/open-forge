// Modified by The Open Forge contributors.
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type McpOAuthStateStore, type McpOAuthStoredState, parseMcpOAuthStoredState } from "@vetta/runtime-mcp/auth";

export interface FileMcpOAuthStateStoreOptions {
	/** Explicit credential directory; product-specific directory resolution stays in the caller. */
	readonly authDirectory: string;
}

/** File-backed OAuth state adapter with no product-specific path defaults. */
export class FileMcpOAuthStateStore implements McpOAuthStateStore {
	constructor(private readonly options: FileMcpOAuthStateStoreOptions) {}

	getPath(serverName: string): string {
		return join(this.options.authDirectory, `${sanitizeServerName(serverName)}.json`);
	}

	load(serverName: string): McpOAuthStoredState | undefined {
		const path = this.getPath(serverName);
		if (!existsSync(path)) return undefined;
		try {
			return parseMcpOAuthStoredState(JSON.parse(readFileSync(path, "utf-8")));
		} catch {
			return undefined;
		}
	}

	save(serverName: string, state: McpOAuthStoredState): void {
		mkdirSync(this.options.authDirectory, { recursive: true, mode: 0o700 });
		const payload: McpOAuthStoredState = {
			...state,
			updatedAt: new Date().toISOString(),
		};
		const path = this.getPath(serverName);
		// Tokens land on disk here: create with owner-only mode from the start
		// and re-tighten on overwrite, where the mode option is ignored.
		writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
		chmodSync(path, 0o600);
	}

	clear(serverName: string): void {
		const path = this.getPath(serverName);
		if (existsSync(path)) unlinkSync(path);
	}

	hasTokens(serverName: string): boolean {
		const state = this.load(serverName);
		return Boolean(state?.tokens?.access_token || state?.tokens?.refresh_token);
	}
}

function sanitizeServerName(serverName: string): string {
	const cleaned = serverName.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
	return cleaned.length > 0 ? cleaned : "server";
}
