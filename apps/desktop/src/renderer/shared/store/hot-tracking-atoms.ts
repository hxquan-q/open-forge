// Copyright The Open Forge contributors.
import { atom } from "jotai";
import { activeSessionAtom } from "./chat-atoms";

/** Renderer 进程内的会话偏好；不写持久化存储，重启后缺省开启。 */
export const hotTrackingBySessionAtom = atom<ReadonlyMap<string, boolean>>(new Map());

export const currentSessionHotTrackingEnabledAtom = atom((get) => {
	const runtimeId = get(activeSessionAtom)?.runtimeId;
	return runtimeId ? (get(hotTrackingBySessionAtom).get(runtimeId) ?? true) : true;
});

/** §11.3：内存偏好不能赋予 work 或未声明档位的会话热追踪能力。 */
export const activeSessionHotTrackingAtom = atom(
	(get) => get(activeSessionAtom)?.capabilityProfile === "coding" && get(currentSessionHotTrackingEnabledAtom),
);

export const toggleCurrentSessionHotTrackingAtom = atom(null, (get, set) => {
	const session = get(activeSessionAtom);
	if (!session || session.capabilityProfile !== "coding") return;
	const next = new Map(get(hotTrackingBySessionAtom));
	next.set(session.runtimeId, !get(currentSessionHotTrackingEnabledAtom));
	set(hotTrackingBySessionAtom, next);
});
