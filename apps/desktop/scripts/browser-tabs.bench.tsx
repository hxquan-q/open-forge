// Copyright The Open Forge contributors.
import { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { TabBar } from "@vetta-org/theme-ui/shared";
import type { TabBarItem } from "@vetta-org/theme-ui/shared";
import "../src/renderer/styles.css";

const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const noop = () => {};
const labels = ["文件", "浏览器", "Canvas", "终端", "Changes", "知识库", "任务进度", "Preview component.tsx"];

/** Fixed controlled-host workload; real production TabBar/CSS, no Desktop or user profile. */
export async function runBrowserTabsBenchmark() {
	const results = [];
	for (const count of [4, 12, 30]) {
		const host = document.createElement("div");
		host.style.width = "640px";
		document.body.append(host);
		const root = createRoot(host);
		const items: TabBarItem<string>[] = Array.from({ length: count }, (_, i) => ({
			key: `tab-${i}`, label: `${labels[i % labels.length]} ${i + 1}`,
			icon: "icon-[solar--document-linear]", removable: i > 0, badge: i % 3 === 0 ? i : undefined,
		}));
		const durations: number[] = [];
		const latencies: number[] = [];
		let overflow: string[] = [];
		let widthReads = 0;
		const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
			configurable: true,
			get(this: HTMLElement) {
				if (host.contains(this)) widthReads++;
				return descriptor.get!.call(this) as number;
			},
		});
		const onOverflowChange = (keys: string[]) => { overflow = keys; };
		const render = (value: string) => root.render(
			<Profiler id="tabs" onRender={(_id, _phase, duration) => durations.push(duration)}>
				<TabBar items={items} value={value} onChange={noop} onOverflowChange={onOverflowChange}
					onRemove={noop} removeLabel="Hide tab" onReorder={noop} />
			</Profiler>,
		);
		try {
			render("tab-0");
			for (let i = 0; i < 8; i++) await paint();
			durations.length = 0;
			widthReads = 0;
			for (let step = 0; step < 48; step++) {
				// Normal controlled selection, including host/overflow activation, with interleaved panel resizing.
				if (step % 4 === 0) host.style.width = `${[360, 640, 920][(step / 4) % 3]}px`;
				const selected = items[(step * 7 + 1) % count]!.key;
				const start = performance.now();
				render(selected);
				await paint();
				await paint();
				// Overflow is published by a passive effect after a resize/selection commit.
				// Wait for that public contract, not an arbitrary count of effect turns.
				const deadline = performance.now() + 1000;
				while (overflow.includes(selected) || !host.querySelector(`[data-tabkey="${selected}"] button[aria-selected="true"]`)) {
					if (performance.now() > deadline) throw new Error(`Active tab missing: ${count}/${step}/${selected}`);
					await paint();
				}
				const active = host.querySelector<HTMLButtonElement>('button[role="tab"][aria-selected="true"]')!;
				const bounds = active.getBoundingClientRect();
				const row = host.querySelector('[role="tablist"]')!.getBoundingClientRect();
				if (bounds.left < row.left - 1 || bounds.right > row.right + 1) throw new Error("Active tab clipped");
				latencies.push(performance.now() - start);
			}
			const sorted = [...durations].sort((a, b) => a - b);
			const latency = [...latencies].sort((a, b) => a - b);
			results.push({
				count, updates: 48, widthReads, commits: durations.length,
				reactMs: +durations.reduce((sum, duration) => sum + duration, 0).toFixed(3),
				p95CommitMs: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(3),
				p95VisibleMs: +latency[Math.floor(latency.length * 0.95)]!.toFixed(3),
			});
		} finally {
			Object.defineProperty(HTMLElement.prototype, "offsetWidth", descriptor);
			root.unmount();
			host.remove();
		}
	}
	return results;
}
