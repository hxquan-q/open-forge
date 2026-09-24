// Copyright The Open Forge contributors.
import { atom } from "jotai";

/** Canvas 列表在 artifact.descriptor 到达后递增，tab 据此重载。 */
export const canvasArtifactRevisionAtom = atom(0);

/** 待打开的 canvas artifact：写入方标注归属工作空间，跨工作空间互不消费。 */
export interface PendingCanvasArtifact {
	readonly workspaceId: string;
	readonly artifactId: string;
}

/**
 * 聊天「在画布中打开」或新产物到达时要选中的 artifact。
 * 带归属工作空间（TASK-0079）：消费方 workspace.id 不匹配时忽略且不清全局槽，
 * 多面板挂载时不再互相抢槽、也不再渲染错配 workspace 的假「文件缺失」条目。
 */
export const pendingCanvasArtifactIdAtom = atom<PendingCanvasArtifact | null>(null);

/** Canvas tab 未激活时的未读条数。 */
export const canvasUnreadCountAtom = atom(0);

/** 活动面板 tab 以 workspace id 或项目 cwd 为键；任一键指向 canvas 即视为用户正在看画布。 */
export function isCanvasTabVisible(
	tabByProject: ReadonlyMap<string, string>,
	keys: readonly (string | null | undefined)[],
): boolean {
	return keys.some((key) => typeof key === "string" && key.length > 0 && tabByProject.get(key) === "canvas");
}
