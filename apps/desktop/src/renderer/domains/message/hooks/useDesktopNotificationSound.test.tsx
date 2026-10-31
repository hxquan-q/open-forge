// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { NotificationSoundPayload } from "@preload/api";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { playNotificationSound } = vi.hoisted(() => ({ playNotificationSound: vi.fn() }));
vi.mock("@shared/audio/notification-sound-player", () => ({ playNotificationSound }));

import { useDesktopNotificationSound } from "./useDesktopNotificationSound";

const originalVetta = Object.getOwnPropertyDescriptor(window, "vetta");

afterEach(() => {
	if (originalVetta) Object.defineProperty(window, "vetta", originalVetta);
	else Reflect.deleteProperty(window, "vetta");
	playNotificationSound.mockClear();
});

it("plays main-process sound events and unsubscribes on unmount", () => {
	let emit: ((payload: NotificationSoundPayload) => void) | undefined;
	const unsubscribe = vi.fn();
	const onSound = vi.fn((handler: (payload: NotificationSoundPayload) => void) => {
		emit = handler;
		return unsubscribe;
	});
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: { notification: { onSound } },
	});

	const { unmount } = renderHook(() => useDesktopNotificationSound());
	act(() => emit?.({ soundId: "single-bell", volume: 35 }));

	expect(onSound).toHaveBeenCalledOnce();
	expect(playNotificationSound).toHaveBeenCalledWith("single-bell", 35);
	unmount();
	expect(unsubscribe).toHaveBeenCalledOnce();
});
