// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { createHostClient } from "../src/client.js";
import {
	createDirectHostTransport,
	defineHostMethod,
	HOST_PROTOCOL_ERROR_CODES,
	HostDispatcher,
	type HostMethodSignatures,
	HostOwnerRegistry,
	HostProtocolError,
} from "../src/index.js";

const METHODS = {
	echo: defineHostMethod({
		name: "test.echo",
		params: Type.Object({ value: Type.String() }),
		result: Type.String(),
	}),
	broken: defineHostMethod({ name: "test.broken", params: Type.Object({}), result: Type.Number() }),
	fails: defineHostMethod({ name: "test.fails", params: Type.Object({}), result: Type.Null() }),
	browse: defineHostMethod({
		name: "test.browse",
		params: Type.Object({}),
		result: Type.String(),
		requires: ["browser"],
	}),
} as const;
type Methods = HostMethodSignatures<typeof METHODS>;

function setup() {
	const owners = new HostOwnerRegistry();
	const dispatcher = new HostDispatcher(owners);
	dispatcher.register(METHODS, {
		echo: ({ value }) => value,
		broken: () => "not a number" as unknown as number,
		fails: () => {
			throw new Error("boom");
		},
		browse: (_params, context) => context.owners.require<{ name: string }>("browser").name,
	});
	const client = createHostClient<Methods>(createDirectHostTransport(dispatcher));
	return { owners, dispatcher, client };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error instanceof HostProtocolError ? error.code : "not-a-host-error";
	}
}

describe("HostDispatcher", () => {
	it("round-trips a valid call through the direct transport", async () => {
		const { client } = setup();
		await expect(client.call("test.echo", { value: "hi" })).resolves.toBe("hi");
	});

	it("rejects malformed envelopes and unknown methods", async () => {
		const { dispatcher } = setup();
		expect(await dispatcher.handle(null)).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
		expect(await dispatcher.handle({ method: "nope", params: {} })).toMatchObject({
			ok: false,
			error: { code: "UNKNOWN_METHOD" },
		});
	});

	it("validates params before running the handler", async () => {
		const { client } = setup();
		expect(await codeOf(client.call("test.echo", { value: 1 } as unknown as { value: string }))).toBe(
			HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS,
		);
	});

	it("reports invalid results as a Host defect and maps thrown errors to INTERNAL", async () => {
		const { client } = setup();
		expect(await codeOf(client.call("test.broken", {}))).toBe(HOST_PROTOCOL_ERROR_CODES.INVALID_RESULT);
		expect(await codeOf(client.call("test.fails", {}))).toBe(HOST_PROTOCOL_ERROR_CODES.INTERNAL);
	});

	it("returns CAPABILITY_UNAVAILABLE until the owner slot is provided", async () => {
		const { client, owners } = setup();
		expect(await codeOf(client.call("test.browse", {}))).toBe(HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE);
		const release = owners.provide("browser", { name: "local" });
		await expect(client.call("test.browse", {})).resolves.toBe("local");
		release();
		expect(await codeOf(client.call("test.browse", {}))).toBe(HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE);
	});

	it("refuses duplicate method registration and duplicate owners", () => {
		const { dispatcher, owners } = setup();
		expect(() => dispatcher.register(METHODS, {} as never)).toThrow("already registered");
		owners.provide("x", 1);
		expect(() => owners.provide("x", 2)).toThrow("already provided");
	});

	it("client maps malformed responses to a host error", async () => {
		const client = createHostClient<Methods>(async () => ({ nonsense: true }) as never);
		expect(await codeOf(client.call("test.echo", { value: "a" }))).toBe(HOST_PROTOCOL_ERROR_CODES.INVALID_REQUEST);
	});
});
