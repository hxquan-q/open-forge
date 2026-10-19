// Copyright The Open Forge contributors.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { createStore } from "./store.mjs";

const folders = [];
function directory() {
	const path = mkdtempSync(join(tmpdir(), "forge-autonomy-store-"));
	folders.push(path);
	return join(path, "state");
}
afterEach(() => {
	for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("controller-owned durable state", () => {
	it("commits one revision at a time and leaves a failed transaction unchanged", () => {
		const store = createStore(directory());
		store.transaction((state) => {
			state.signals.push({ id: "one" });
		});
		expect(store.read().revision).toBe(1);
		expect(() =>
			store.transaction((state) => {
				state.signals.push({ id: "two" });
				throw new Error("abort");
			}),
		).toThrow("abort");
		expect(store.read().signals).toEqual([{ id: "one" }]);
	});
	it("never interprets corrupted or modified state as an empty queue", () => {
		const folder = directory();
		const store = createStore(folder);
		store.transaction((state) => {
			state.signals.push({ id: "one" });
		});
		const file = join(folder, "state.json");
		const envelope = JSON.parse(readFileSync(file, "utf8"));
		envelope.payload.signals = [];
		writeFileSync(file, JSON.stringify(envelope));
		expect(() => store.read()).toThrow(/integrity/);
		writeFileSync(file, "{");
		expect(() => store.transaction(() => {})).toThrow();
	});
	it("refuses an occupied writer lock and asynchronous mutations", () => {
		const folder = directory();
		const store = createStore(folder);
		writeFileSync(join(folder, "writer.lock"), JSON.stringify({ pid: process.pid, nonce: "other" }));
		expect(() => store.transaction(() => {})).toThrow(/busy/);
		rmSync(join(folder, "writer.lock"));
		expect(() => store.transaction(async () => {})).toThrow(/synchronous/);
		expect(store.read().revision).toBe(0);
	});
	it("does not recreate an empty queue after a previously initialized state file disappears", () => {
		const folder = directory();
		const store = createStore(folder);
		store.transaction((state) => {
			state.signals.push({ id: "must-not-disappear" });
		});
		rmSync(join(folder, "state.json"));
		expect(() => store.read()).toThrow(/missing/);
		expect(() => createStore(folder)).toThrow(/missing/);
	});
	it("serializes competing controller processes without lost revisions", async () => {
		const folder = directory();
		const store = createStore(folder);
		const program = `import {createStore} from ${JSON.stringify(new URL("./store.mjs", import.meta.url).href)};
const store=createStore(process.argv[1]);
for(let index=0;index<12;index++){let attempts=0;for(;;){try{store.transaction(state=>{state.signals.push({id:process.argv[2]+':'+index})});break}catch(error){if(!error.message.includes('busy')||attempts++>2000)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1)}}}`;
		const results = await Promise.all(
			["first", "second"].map((identity) =>
				runProcess({
					command: [process.execPath, "--input-type=module", "-e", program, folder, identity],
					cwd: folder,
					env: isolatedEnvironment(join(folder, identity)),
					timeoutMs: 20000,
					stallMs: 20000,
				}),
			),
		);
		expect(results.map((result) => result.reason)).toEqual(["success", "success"]);
		expect(store.read().revision).toBe(24);
		expect(new Set(store.read().signals.map((signal) => signal.id)).size).toBe(24);
	}, 25000);
	it("recovers only a writer process proven terminal and retains the previous state", () => {
		const folder = directory();
		const store = createStore(folder);
		store.transaction((state) => {
			state.signals.push({ id: "retained" });
		});
		const terminal = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
			env: isolatedEnvironment(join(folder, "probe")),
			windowsHide: true,
		});
		expect(terminal.status).toBe(0);
		writeFileSync(join(folder, "writer.lock"), JSON.stringify({ pid: terminal.pid, nonce: "dead-writer" }));
		expect(store.recover()).toBe(true);
		expect(store.read().signals).toEqual([{ id: "retained" }]);
	});
});
