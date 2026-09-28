import type { IpcRenderer, IpcRendererEvent } from "electron";

export function onIpcEvent<T>(ipc: IpcRenderer, channel: string, handler: (data: T) => void): () => void {
	const listener = (_event: IpcRendererEvent, data: unknown) => {
		handler(data as T);
	};
	ipc.on(channel, listener);
	return () => ipc.removeListener(channel, listener);
}

export function onIpcVoidEvent(ipc: IpcRenderer, channel: string, handler: () => void): () => void {
	const listener = () => handler();
	ipc.on(channel, listener);
	return () => ipc.removeListener(channel, listener);
}

/**
 * 单条载荷解不出来不等于这条订阅坏了：主进程的载荷可能来自更新 / 更旧的版本，一条
 * 坏事件不该拖垮整条会话流。但容错必须有界——连续坏包说明是协议本身对不上，
 * 这时把原始错误抛回调用方，避免整条订阅永久静默降级。
 */
export const MAX_CONSECUTIVE_DECODE_FAILURES = 5;

export async function subscribeById<T>(
	ipc: IpcRenderer,
	subscribeChannel: string,
	eventChannel: string,
	unsubscribeChannel: string,
	handler: (data: T) => void,
	args: unknown[],
	decode: (data: unknown) => T = (data) => data as T,
): Promise<() => void> {
	let subscriptionId: string | undefined;
	let consecutiveDecodeFailures = 0;
	const buffered: Array<{ readonly incomingId: string; readonly data: unknown }> = [];
	/**
	 * 顺序即语义：坏载荷被跳过，其余事件仍按到达顺序送达；解码成功即重新计数，
	 * 所以「偶发坏包」永远不会被累计成协议错误。
	 */
	const deliver = (data: unknown): void => {
		let decoded: T;
		try {
			decoded = decode(data);
		} catch (error) {
			consecutiveDecodeFailures += 1;
			const stopTolerating = consecutiveDecodeFailures >= MAX_CONSECUTIVE_DECODE_FAILURES;
			console.error(
				stopTolerating
					? `[ipc] ${eventChannel} 连续 ${consecutiveDecodeFailures} 条载荷无法解码，视为协议不匹配`
					: `[ipc] 丢弃一条无法解码的 ${eventChannel} 载荷`,
				error,
			);
			if (stopTolerating) throw error;
			return;
		}
		consecutiveDecodeFailures = 0;
		handler(decoded);
	};
	const listener = (_event: IpcRendererEvent, incomingId: string, data: unknown) => {
		if (subscriptionId === undefined) {
			buffered.push({ incomingId, data });
			return;
		}
		if (incomingId === subscriptionId) deliver(data);
	};
	ipc.on(eventChannel, listener);
	let initial: T | undefined;
	try {
		const response = (await ipc.invoke(subscribeChannel, ...args)) as {
			subscriptionId: string;
			initial?: T;
		};
		subscriptionId = response.subscriptionId;
		initial = response.initial;
	} catch (error) {
		ipc.removeListener(eventChannel, listener);
		throw error;
	}
	if (initial !== undefined) deliver(initial);
	for (const event of buffered) {
		if (event.incomingId === subscriptionId) deliver(event.data);
	}
	buffered.length = 0;
	return () => {
		ipc.removeListener(eventChannel, listener);
		void ipc.invoke(unsubscribeChannel, subscriptionId);
	};
}
