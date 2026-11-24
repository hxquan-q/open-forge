// Modified by The Open Forge contributors.
import { atom } from "jotai";

/**
 * 后台正在 streaming 的 session 集合（key 为 sessionPath）。
 * 由 main 进程经 Host 事件面 session.subscribeGlobal 推送 + 启动时 listRunning snapshot 维护。
 * sidebar 用它给 session item 加 spin、给 project icon 叠加 pulse 点。
 */
export const runningSessionPathsAtom = atom<Set<string>>(new Set<string>());
