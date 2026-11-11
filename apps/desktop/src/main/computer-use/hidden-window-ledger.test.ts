// Copyright The Open Forge contributors.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ComputerWindow } from "../../shared/computer-use.js";
import { createHiddenWindowLedger } from "./hidden-window-ledger.js";

const roots: string[] = [];
afterEach(async () => {
	for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
const window: ComputerWindow = {
	id: "w",
	hwnd: "123",
	pid: 4,
	started: "77",
	instance: "42",
	className: "Editor",
	exe: "C:/editor.exe",
	title: "Example",
	hidden: false,
	showCommand: 3,
};

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "computer-use-ledger-"));
	roots.push(root);
	return join(root, "hidden.json");
}

describe("hidden window recovery ledger", () => {
	it("recovers identities and original show state across owner recreation", async () => {
		const path = await fixture();
		const first = createHiddenWindowLedger(path);
		expect(await first.load()).toEqual([]);
		await first.save([window]);
		expect(await createHiddenWindowLedger(path).load()).toEqual([window]);
		await createHiddenWindowLedger(path).save([]);
		expect(await first.load()).toEqual([]);
	});
	it("does not erase corrupt or incompatible recovery records", async () => {
		const path = await fixture();
		const contents = JSON.stringify({ schemaVersion: 9, windows: [] });
		await writeFile(path, contents);
		await expect(createHiddenWindowLedger(path).load()).rejects.toThrow("recovery_failed");
		expect(await readFile(path, "utf8")).toBe(contents);
	});
	it("rejects a record without a verified window-instance marker", async () => {
		const path = await fixture();
		const { instance: _instance, ...withoutMarker } = window;
		await writeFile(path, JSON.stringify({ schemaVersion: 1, windows: [withoutMarker] }));
		await expect(createHiddenWindowLedger(path).load()).rejects.toThrow("recovery_failed");
	});
});
