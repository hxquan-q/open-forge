const SUPPORTED_PROVIDERS = new Set(["generic", "github"]);
const DEFAULT_UPDATE_PROVIDER = "generic";

function requireValue(env, key, provider) {
	const value = env[key]?.trim();
	if (!value) {
		throw new Error(`[update-publish] ${key} is required when VETTA_UPDATE_PROVIDER=${provider}`);
	}
	return value;
}

function normalizeHttpUrl(rawUrl) {
	const url = new URL(rawUrl);
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("[update-publish] VETTA_UPDATE_URL must use http or https");
	}
	return url.toString().replace(/\/+$/, "");
}

export function resolveUpdatePublishConfig(env = process.env) {
	const provider = (env.VETTA_UPDATE_PROVIDER?.trim() || DEFAULT_UPDATE_PROVIDER).toLowerCase();
	if (!SUPPORTED_PROVIDERS.has(provider)) {
		throw new Error(
			`[update-publish] unsupported VETTA_UPDATE_PROVIDER=${provider}; expected generic or github`,
		);
	}
	if (provider === "generic") {
		// No built-in feed URL: an unset URL must fail the build rather than
		// silently point the update channel at upstream infrastructure.
		return {
			provider: "generic",
			url: normalizeHttpUrl(requireValue(env, "VETTA_UPDATE_URL", provider)),
			useMultipleRangeRequest: true,
		};
	}

	return {
		provider: "github",
		owner: requireValue(env, "VETTA_UPDATE_GITHUB_OWNER", provider),
		repo: requireValue(env, "VETTA_UPDATE_GITHUB_REPO", provider),
		releaseType: "release",
	};
}
