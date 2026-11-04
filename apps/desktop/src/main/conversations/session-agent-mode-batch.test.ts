// Modified by The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readSessionAgentModes } from "./session-agent-mode-store.js";

/** 临时会话目录：每个目录一份 agent-modes.json（与生产布局一致）。 */
let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "agent-modes-batch-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

async function makeSessionDir(name: string, index: Record<string, unknown> | null): Promise<string> {
	const dir = join(root, name);
	await mkdir(dir, { recursive: true });
	if (index !== null) {
		await writeFile(join(dir, "agent-modes.json"), JSON.stringify(index), "utf8");
	}
	return dir;
}

it("同目录会话共享一份索引，且按完整路径区分（跨目录同名不碰撞）", async () => {
	const shard = await makeSessionDir("shard-a", { s1: "coding", s2: "work", s3: "not-a-mode" });
	const legacy = await makeSessionDir("shard-b", { s1: "work" });

	const result = await readSessionAgentModes([
		join(shard, "s1.jsonl"),
		join(shard, "s2.jsonl"),
		join(shard, "s3.jsonl"),
		join(legacy, "s1.jsonl"),
	]);

	// 两个目录的 s1 同名但路径不同，各自命中自己的索引。
	expect(result.get(join(shard, "s1.jsonl"))).toBe("coding");
	expect(result.get(join(legacy, "s1.jsonl"))).toBe("work");
	expect(result.get(join(shard, "s2.jsonl"))).toBe("work");
	// 索引里的非法模式值按无记录处理（readStore 已过滤，不进结果）。
	expect(result.has(join(shard, "s3.jsonl"))).toBe(false);
});

it("索引缺失或损坏的目录按无记录处理，不抛错", async () => {
	const missing = await makeSessionDir("no-index", null);
	const broken = await makeSessionDir("broken-index", null);
	await writeFile(join(broken, "agent-modes.json"), "{not json", "utf8");

	const result = await readSessionAgentModes([join(missing, "x.jsonl"), join(broken, "y.jsonl"), ""]);

	expect(result.size).toBe(0);
});

it("空输入不产生任何读取", async () => {
	const result = await readSessionAgentModes([]);
	expect(result.size).toBe(0);
});
