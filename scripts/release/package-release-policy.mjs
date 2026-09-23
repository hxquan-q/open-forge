// Copyright The Open Forge contributors.
export function validatePackageReleaseScope({ scope, pushAuthorized, packages }) {
	if (scope !== "lockstep") {
		throw new Error("Package release is disabled until RELEASE_PACKAGE_SCOPE=lockstep is explicitly selected");
	}
	if (!pushAuthorized) {
		throw new Error("Package release requires RELEASE_PUSH=true before changing versions or pushing");
	}

	const versionedPackages = packages.filter(({ version }) => typeof version === "string" && version.length > 0);
	if (versionedPackages.length === 0) throw new Error("Package release scope has no versioned packages");

	const expectedVersion = versionedPackages[0].version;
	const mismatches = versionedPackages.filter(({ version }) => version !== expectedVersion);
	if (mismatches.length > 0) {
		throw new Error(
			`Lockstep package release refused; versions differ from ${expectedVersion}: ${mismatches
				.map(({ path, version }) => `${path.replaceAll("\\", "/")}=${version}`)
				.join(", ")}`,
		);
	}

	return expectedVersion;
}
