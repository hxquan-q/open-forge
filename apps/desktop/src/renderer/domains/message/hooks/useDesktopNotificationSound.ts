// Modified by The Open Forge contributors.
import { playNotificationSound } from "@shared/audio/notification-sound-player";
import { useEffect } from "react";

export function useDesktopNotificationSound(): void {
	useEffect(() => {
		return window.vetta.notification.onSound(({ soundId, volume }) => {
			void playNotificationSound(soundId, volume);
		});
	}, []);
}
