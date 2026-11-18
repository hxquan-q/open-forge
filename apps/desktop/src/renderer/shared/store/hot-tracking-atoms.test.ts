// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import {
	activeSessionAtom,
	activeSessionHotTrackingAtom,
	currentSessionHotTrackingEnabledAtom,
	hotTrackingBySessionAtom,
	toggleCurrentSessionHotTrackingAtom,
} from "@shared/store/atoms";
import { createStore } from "jotai";
import { expect, it } from "vitest";

it("会话缺省开启，A/B 独立；新 store 不恢复旧进程的关闭偏好", () => {
	const store = createStore();
	const session = { cwd: "/repo", sessionPath: "/a.jsonl", runtimeId: "a", capabilityProfile: "coding" } as const;
	expect(store.get(currentSessionHotTrackingEnabledAtom)).toBe(true);
	store.set(activeSessionAtom, session);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(true);
	store.set(toggleCurrentSessionHotTrackingAtom);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(false);
	store.set(activeSessionAtom, { ...session, runtimeId: "b" });
	expect(store.get(activeSessionHotTrackingAtom)).toBe(true);
	store.set(activeSessionAtom, session);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(false);
	store.set(toggleCurrentSessionHotTrackingAtom);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(true);
	store.set(toggleCurrentSessionHotTrackingAtom);
	store.set(activeSessionAtom, null);
	expect(store.get(currentSessionHotTrackingEnabledAtom)).toBe(true);
	const restarted = createStore();
	restarted.set(activeSessionAtom, session);
	expect(restarted.get(activeSessionHotTrackingAtom)).toBe(true);
});

it.each(["work", undefined] as const)("档位 %s 不允许用 toggle 获得热追踪", (capabilityProfile) => {
	const store = createStore();
	store.set(activeSessionAtom, { cwd: "/repo", sessionPath: "/a.jsonl", runtimeId: "a", capabilityProfile });
	store.set(toggleCurrentSessionHotTrackingAtom);
	expect(store.get(activeSessionHotTrackingAtom)).toBe(false);
	expect(store.get(hotTrackingBySessionAtom).size).toBe(0);
});
