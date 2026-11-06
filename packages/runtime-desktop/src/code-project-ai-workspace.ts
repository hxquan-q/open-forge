// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { getVettaHomePath } from "@vetta/coding-agent/config";
import { normalizeProjectCwd, parseProjectLocation } from "@vetta/ssh-transport";

export interface CodeProjectAiWorkspaceLocation {
	readonly id: string;
	readonly directory: string;
	/** A stable virtual root used by SSH file tools to distinguish local storage from remote paths. */
	readonly toolRoot: string;
}

/** Resolves the local, per-project Code workspace without using project names or registry ids. */
export function resolveCodeProjectAiWorkspace(
	projectCwd: string,
	options: { readonly vettaHome?: string } = {},
): CodeProjectAiWorkspaceLocation {
	const requestedLocation = parseProjectLocation(projectCwd);
	if (requestedLocation.kind === "local" && !isAbsolute(requestedLocation.path)) {
		throw new Error("Code project path must be absolute");
	}
	const normalizedCwd = normalizeProjectCwd(projectCwd, resolve);
	const location = parseProjectLocation(normalizedCwd);
	const identity =
		location.kind === "ssh"
			? JSON.stringify(["ssh", location.hostId, location.remotePath])
			: JSON.stringify(["local", location.path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()]);
	const id = createHash("sha256").update(identity, "utf8").digest("hex");
	const directory = join(options.vettaHome ?? getVettaHomePath(), "workspace", "code-projects", id);
	return { id, directory, toolRoot: `vetta-workspace://${id}/` };
}
