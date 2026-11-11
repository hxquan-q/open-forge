// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { atomicWriteFileAsync } from "@vetta/toolkit/atomic-write";
import { createVersionedJsonConfigStore } from "@vetta/toolkit/config-store";
import { ComputerWindowSchema } from "../../shared/computer-use.js";
import type { HiddenWindowLedger } from "./contracts.js";

const LedgerSchema = Type.Object(
	{ schemaVersion: Type.Literal(1), windows: Type.Array(ComputerWindowSchema, { maxItems: 1024 }) },
	{ additionalProperties: false },
);

export function createHiddenWindowLedger(path: string): HiddenWindowLedger {
	const store = createVersionedJsonConfigStore<Static<typeof LedgerSchema>>({
		path,
		name: "computer-use-hidden-windows",
		readErrorPolicy: "throw",
		normalize(value) {
			if (value === undefined) return { schemaVersion: 1, windows: [] };
			if (!Value.Check(LedgerSchema, value)) throw new Error("recovery_failed");
			return value;
		},
		writeJson: (file, value) => atomicWriteFileAsync(file, JSON.stringify(value)),
	});
	return {
		async load() {
			return (await store.read()).windows;
		},
		async save(windows) {
			await store.write({ schemaVersion: 1, windows: [...windows] });
		},
	};
}
