// Copyright The Open Forge contributors.
/** Task Activity IPC channel 常量：main/preload 两侧共享的唯一事实源。 */
export const TASK_CHANNELS = {
	GET_STATE: "vetta:task:get-state",
	GET_ARTIFACT_VIEWS: "vetta:task:get-artifact-views",
	COMMAND: "vetta:task:command",
	READ_ARTIFACT: "vetta:task:read-artifact",
	VERIFY_ARTIFACT_SOURCES: "vetta:task:verify-artifact-sources",
	EXPORT_ARTIFACT: "vetta:task:export-artifact",
} as const;
