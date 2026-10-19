// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { assertSchema } from "./schema.mjs";

describe("autonomy boundary contracts", () => {
	it("resolves only local, nonrecursive definitions and still rejects unknown nested fields", () => {
		const schema = {
			$defs: {
				identity: {
					type: "object",
					additionalProperties: false,
					required: ["name"],
					properties: { name: { type: "string" } },
				},
			},
			type: "array",
			items: { $ref: "#/$defs/identity" },
		};
		expect(assertSchema(schema, [{ name: "runner" }])).toEqual([{ name: "runner" }]);
		expect(() => assertSchema(schema, [{ name: "runner", approved: true }])).toThrow(/unknown/);
		expect(() => assertSchema({ $ref: "https://example.invalid/schema" }, {})).toThrow(/unsupported/);
		expect(() => assertSchema({ $defs: { loop: { $ref: "#/$defs/loop" } }, $ref: "#/$defs/loop" }, {})).toThrow(
			/recursive/,
		);
	});
	it("accepts a valid contract and rejects missing identity, unknown fields and invalid limits", () => {
		const schema = {
			type: "object",
			additionalProperties: false,
			required: ["actor", "rounds"],
			properties: { actor: { type: "string", minLength: 1 }, rounds: { type: "integer", minimum: 1, maximum: 3 } },
		};
		expect(assertSchema(schema, { actor: "runner:one", rounds: 2 })).toEqual({ actor: "runner:one", rounds: 2 });
		for (const value of [
			{ rounds: 2 },
			{ actor: "", rounds: 2 },
			{ actor: "one", rounds: 0 },
			{ actor: "one", rounds: 2, approved: true },
		]) {
			expect(() => assertSchema(schema, value)).toThrow();
		}
	});
	it("refuses unsupported schema keywords rather than silently skipping a constraint", () => {
		expect(() => assertSchema({ type: "string", format: "email" }, "anything")).toThrow(/unsupported/);
	});
	it("validates every nested list item and prevents duplicate capability declarations", () => {
		const schema = {
			type: "array",
			minItems: 1,
			uniqueItems: true,
			items: { type: "string", enum: ["dev", "stable"] },
		};
		expect(assertSchema(schema, ["dev"])).toEqual(["dev"]);
		expect(() => assertSchema(schema, ["dev", "dev"])).toThrow(/duplicate/);
		expect(() => assertSchema(schema, ["dev", "other"])).toThrow();
	});
});
