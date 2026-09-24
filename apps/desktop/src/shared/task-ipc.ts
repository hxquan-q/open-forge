/** Task Activity IPC channel 常量：main/preload 两侧共享的唯一事实源。 */
export const TASK_CHANNELS = {
	GET_STATE: "vetta:task:get-state",
	GET_ARTIFACT_VIEWS: "vetta:task:get-artifact-views",
	COMMAND: "vetta:task:command",
} as const;
