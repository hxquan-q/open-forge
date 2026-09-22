import assert from "node:assert/strict";
import test from "node:test";
import { resolveUpdatePublishConfig } from "./resolve-update-publish-config.mjs";

test("generic provider fails closed when no update URL is configured", () => {
	// Ship-blocker guard: an unset feed URL must never fall back to upstream
	// infrastructure, so the build fails instead of shipping a silent default.
	assert.throws(() => resolveUpdatePublishConfig({}), /VETTA_UPDATE_URL is required/);
	assert.throws(
		() => resolveUpdatePublishConfig({ VETTA_UPDATE_PROVIDER: "generic" }),
		/VETTA_UPDATE_URL is required/,
	);
});

test("uses the explicitly configured generic update feed", () => {
	assert.deepEqual(
		resolveUpdatePublishConfig({
			VETTA_UPDATE_URL: "https://releases.example.com/desktop/test/",
		}),
		{
			provider: "generic",
			url: "https://releases.example.com/desktop/test",
			useMultipleRangeRequest: true,
		},
	);
});

test("rejects a package without an update provider", () => {
	assert.throws(
		() => resolveUpdatePublishConfig({ VETTA_UPDATE_PROVIDER: "none" }),
		/expected generic or github/,
	);
});

test("still requires GitHub coordinates for the GitHub provider", () => {
	assert.throws(
		() => resolveUpdatePublishConfig({ VETTA_UPDATE_PROVIDER: "github" }),
		/VETTA_UPDATE_GITHUB_OWNER is required/,
	);
});
