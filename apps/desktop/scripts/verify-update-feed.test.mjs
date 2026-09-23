// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import test from "node:test";
import {
	resolveUpdateFeedBase,
	resolveUpdateFeedMetadataFiles,
	verifyUpdateFeed,
} from "./verify-update-feed.mjs";

const version = "0.5.46";
const metadata = {
	"latest.yml": `version: ${version}\npath: Open Forge-Setup-${version}.exe\nfiles:\n  - url: Open Forge-Setup-${version}.exe\n`,
	"latest-mac.yml": `version: ${version}\nfiles:\n  - url: Open Forge-${version}.zip\n    sha512: test\n`,
	"latest-linux.yml": `version: ${version}\npath: Open Forge-${version}.AppImage\nfiles:\n  - url: Open Forge-${version}.AppImage\n`,
};

function createFetch() {
	const calls = [];
	return {
		calls,
		fetchImpl: async (url, init) => {
			calls.push({ url, method: init.method });
			const fileName = new URL(url).pathname.split("/").at(-1);
			if (fileName in metadata) return { ok: true, status: 200, text: async () => metadata[fileName] };
			return { ok: true, status: 200, text: async () => "" };
		},
	};
}

test("resolves provider-specific public feed bases", () => {
	assert.equal(
		resolveUpdateFeedBase({
			env: { VETTA_UPDATE_PROVIDER: "generic", VETTA_UPDATE_URL: "https://updates.example.com/desktop/stable" },
			version,
		}),
		"https://updates.example.com/desktop/stable/",
	);
	assert.equal(
		resolveUpdateFeedBase({
			env: { VETTA_UPDATE_PROVIDER: "github", VETTA_UPDATE_GITHUB_OWNER: "hxquan-q", VETTA_UPDATE_GITHUB_REPO: "open-forge" },
			version,
		}),
		"https://github.com/hxquan-q/open-forge/releases/download/v0.5.46/",
	);
});

test("accepts a Git tag version with the leading v", () => {
	assert.equal(
		resolveUpdateFeedBase({
			env: { VETTA_UPDATE_PROVIDER: "github", VETTA_UPDATE_GITHUB_OWNER: "hxquan-q", VETTA_UPDATE_GITHUB_REPO: "open-forge" },
		version: "v0.5.46",
		}),
		"https://github.com/hxquan-q/open-forge/releases/download/v0.5.46/",
	);
});

test("verifies all platform metadata and referenced artifacts", async () => {
	const fake = createFetch();
	const result = await verifyUpdateFeed({
		env: { VETTA_UPDATE_PROVIDER: "generic", VETTA_UPDATE_URL: "https://updates.example.com/desktop/stable" },
		version,
		fetchImpl: fake.fetchImpl,
		retryDelayMs: 0,
	});
	assert.equal(result.metadataFiles.length, 3);
	assert.equal(result.artifacts.length, 3);
	assert.equal(fake.calls.filter((call) => call.method === "GET").length, 3);
	assert.equal(fake.calls.filter((call) => call.method === "HEAD").length, 3);
});

test("falls back to a ranged GET when a CDN rejects HEAD", async () => {
	const fake = createFetch();
	const fetchImpl = async (url, init) => {
		if (init.method === "HEAD") return { ok: false, status: 405, text: async () => "" };
		return fake.fetchImpl(url, init);
	};
	await verifyUpdateFeed({
		env: { VETTA_UPDATE_PROVIDER: "generic", VETTA_UPDATE_URL: "https://updates.example.com/desktop/stable" },
		version,
		metadataFiles: ["latest-linux.yml"],
		fetchImpl,
		retryDelayMs: 0,
	});
	assert.ok(fake.calls.some((call) => call.method === "GET"));
});

test("limits feed verification to the platforms the release actually shipped", async () => {
	const fake = createFetch();
	const result = await verifyUpdateFeed({
		env: { VETTA_UPDATE_PROVIDER: "generic", VETTA_UPDATE_URL: "https://updates.example.com/desktop/stable" },
		version,
		metadataFiles: resolveUpdateFeedMetadataFiles({ VETTA_UPDATE_FEED_METADATA: "latest.yml, latest-linux.yml" }),
		fetchImpl: fake.fetchImpl,
		retryDelayMs: 0,
	});
	assert.deepEqual(result.metadataFiles, ["latest.yml", "latest-linux.yml"]);
	assert.equal(fake.calls.filter((call) => call.url.endsWith("latest-mac.yml")).length, 0);
});

test("defaults to all platform metadata and rejects malformed overrides", () => {
	assert.deepEqual(resolveUpdateFeedMetadataFiles({}), [
		"latest.yml",
		"latest-mac.yml",
		"latest-linux.yml",
	]);
	assert.throws(
		() => resolveUpdateFeedMetadataFiles({ VETTA_UPDATE_FEED_METADATA: "latest.yml,../etc/passwd" }),
		/invalid metadata file name/,
	);
});

test("rejects a feed that serves a different release version", async () => {
	const fake = createFetch();
	assert.rejects(
		verifyUpdateFeed({
			env: { VETTA_UPDATE_PROVIDER: "generic", VETTA_UPDATE_URL: "https://updates.example.com/desktop/stable" },
			version: "0.5.47",
			metadataFiles: ["latest.yml"],
			fetchImpl: fake.fetchImpl,
			retryDelayMs: 0,
		}),
		/expected 0\.5\.47/,
	);
});
