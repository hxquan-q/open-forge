// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LINUX_PACKAGE_PATHS } from "./linux-packaging-contract.mjs";
import {
	parseDebContents,
	parseDebFields,
	parseRpmFields,
	readExpectedVersion,
	verifyLinuxPackageInspection,
} from "./verify-linux-packages.mjs";

const paths = [
	...Object.values(LINUX_PACKAGE_PATHS),
	"/usr/share/applications/OpenForge.desktop",
	"/usr/share/icons/hicolor/512x512/apps/OpenForge.png",
];

for (const [profile, directory] of [["distribution", "Allstr ai"], ["self", "Open Forge"]]) {
	test(`Linux package inspection accepts the ${profile} installation directory and rejects the other brand`, () => {
		// Fresh imports must observe the same profile switch as prepare-pack, regardless of the parent environment.
		const source = `
			import assert from "node:assert/strict";
			import { LINUX_PACKAGE_PATHS } from ${JSON.stringify(new URL("./linux-packaging-contract.mjs", import.meta.url).href)};
			import { verifyLinuxPackageInspection } from ${JSON.stringify(new URL("./verify-linux-packages.mjs", import.meta.url).href)};
			const expected = {
				executable: ${JSON.stringify(`/opt/${directory}/OpenForge`)},
				packageType: ${JSON.stringify(`/opt/${directory}/resources/package-type`)},
			};
			assert.deepEqual(LINUX_PACKAGE_PATHS, expected);
			const paths = [
				...Object.values(expected),
				"/usr/share/applications/OpenForge.desktop",
				"/usr/share/icons/hicolor/512x512/apps/OpenForge.png",
			];
			const inspection = {
				expectedVersion: "1.2.3",
				deb: { name: "openforge", version: "1.2.3", arch: "amd64", paths },
				rpm: { name: "openforge", version: "1.2.3", arch: "x86_64", paths },
			};
			assert.doesNotThrow(() => verifyLinuxPackageInspection(inspection));
			const otherDirectory = ${JSON.stringify(directory === "Allstr ai" ? "Open Forge" : "Allstr ai")};
			const otherPaths = paths.map(path => path.replace(${JSON.stringify(directory)}, otherDirectory));
			assert.throws(() => verifyLinuxPackageInspection({
				...inspection, deb: { ...inspection.deb, paths: otherPaths },
			}), /Debian package is missing/);
		`;
		execFileSync(process.execPath, ["--input-type=module", "-e", source], {
			env: { ...process.env, VETTA_BRAND_PROFILE: profile === "self" ? "self" : "" },
			stdio: "pipe",
		});
	});
}

test("Linux package inspection accepts matching Debian and RPM packages", () => {
	assert.doesNotThrow(() =>
		verifyLinuxPackageInspection({
			expectedVersion: "1.2.3",
			deb: { name: "openforge", version: "1.2.3", arch: "amd64", paths },
			rpm: { name: "openforge", version: "1.2.3", arch: "x86_64", paths },
		}),
	);
});

test("Linux package inspection rejects wrong identities and incomplete payloads", () => {
	const inspection = {
		expectedVersion: "1.2.3",
		deb: { name: "openforge", version: "1.2.3", arch: "amd64", paths },
		rpm: { name: "openforge", version: "1.2.3", arch: "x86_64", paths },
	};
	for (const format of ["deb", "rpm"]) {
		const label = format === "deb" ? "Debian" : "RPM";
		for (const [key, value] of [["name", "wrong"], ["version", "1.2.2"], ["arch", "arm64"]]) {
			assert.throws(
				() => verifyLinuxPackageInspection({
					...inspection,
					[format]: { ...inspection[format], [key]: value },
				}),
				new RegExp(`${label} ${key} ${value} does not match`),
			);
		}
		for (const missing of paths) {
			assert.throws(
				() => verifyLinuxPackageInspection({
					...inspection,
					[format]: { ...inspection[format], paths: paths.filter(path => path !== missing) },
				}),
				new RegExp(`${label} package (is missing|has no)`),
			);
		}
	}
});

test("package command output parsers normalize Debian and RPM metadata", () => {
	assert.deepEqual(
		parseDebFields("Package: openforge\nVersion: 1.2.3\nArchitecture: amd64\nDescription: Open Forge\n"),
		{ name: "openforge", version: "1.2.3", arch: "amd64" },
	);
	assert.deepEqual(parseRpmFields("openforge\n1.2.3\nx86_64\n"), {
		name: "openforge",
		version: "1.2.3",
		arch: "x86_64",
	});
	assert.deepEqual(
		parseDebContents(
			"-rwxr-xr-x root/root 123 2026-01-01 00:00 ./opt/Allstr ai/OpenForge\n" +
				"lrwxrwxrwx root/root 0 2026-01-01 00:00 ./usr/bin/openforge -> /opt/Allstr ai/OpenForge\n",
		),
		["/opt/Allstr ai/OpenForge", "/usr/bin/openforge"],
	);
});

test("native package verification uses the release manifest version", async () => {
	const releaseDir = await mkdtemp(join(tmpdir(), "openforge-linux-packages-"));
	try {
		await writeFile(join(releaseDir, "latest-linux.yml"), "version: 9.8.7\n");
		assert.equal(await readExpectedVersion(releaseDir), "9.8.7");
	} finally {
		await rm(releaseDir, { recursive: true, force: true });
	}
});
