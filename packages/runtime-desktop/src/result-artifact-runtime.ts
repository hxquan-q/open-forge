import { join } from "node:path";
import { createCodingAgentCodingToolResultPolicy } from "@vetta/coding-agent/composition";
import { createMcpToolResultPolicy, type McpToolResultPolicy } from "@vetta/runtime-mcp";
import {
	CompositeNodeSessionArtifactCleaner,
	createNodeResultArtifactStorage,
	type NodeSessionArtifactStore,
} from "@vetta/runtime-node/host";
import type { CodingToolResultPolicy } from "@vetta/runtime-tools";
import { getDesktopReviewSnapshotStore } from "./review-snapshot-runtime.js";

export interface DesktopResultArtifactRuntime {
	readonly codingToolResultPolicy: CodingToolResultPolicy;
	readonly mcpToolResultPolicy: McpToolResultPolicy;
	readonly sessionArtifactCleaner: NodeSessionArtifactStore;
}

export function createDesktopResultArtifactRuntime(agentDir: string): DesktopResultArtifactRuntime {
	const storage = createNodeResultArtifactStorage({
		codingRoot: join(agentDir, "tool-results"),
		mcpRoot: join(agentDir, "mcp-results"),
	});
	return {
		codingToolResultPolicy: createCodingAgentCodingToolResultPolicy({ artifactStore: storage.coding }),
		mcpToolResultPolicy: createMcpToolResultPolicy({ artifactStore: storage.mcp }),
		// 会话删除要连审查快照一起清：它是按 sessionId 分目录的会话产物。
		sessionArtifactCleaner: new CompositeNodeSessionArtifactCleaner([
			storage.cleaner,
			getDesktopReviewSnapshotStore(agentDir),
		]),
	};
}
