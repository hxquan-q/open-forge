// Copyright The Open Forge contributors.
import { atom } from "jotai";

/** Canvas 列表在 artifact.descriptor 到达后递增，tab 据此重载。 */
export const canvasArtifactRevisionAtom = atom(0);

/** 聊天「在画布中打开」或新产物到达时要选中的 artifact。 */
export const pendingCanvasArtifactIdAtom = atom<string | null>(null);

/** Canvas tab 未激活时的未读条数。 */
export const canvasUnreadCountAtom = atom(0);

/** 活动面板 tab 以 workspace id 或项目 cwd 为键；任一键指向 canvas 即视为用户正在看画布。 */
export function isCanvasTabVisible(
	tabByProject: ReadonlyMap<string, string>,
	keys: readonly (string | null | undefined)[],
): boolean {
	return keys.some((key) => typeof key === "string" && key.length > 0 && tabByProject.get(key) === "canvas");
}
