// Copyright The Open Forge contributors.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_LEGAL_FILES, DESKTOP_LEGAL_RESOURCE } from "./desktop-packaging-layout.mjs";

export function stageDesktopLegalResources(repositoryRoot, buildStageDir) {
	const targetDirectory = join(buildStageDir, DESKTOP_LEGAL_RESOURCE.from);
	mkdirSync(targetDirectory, { recursive: true });
	for (const filename of DESKTOP_LEGAL_FILES) {
		const source = join(repositoryRoot, filename);
		if (!existsSync(source)) throw new Error(`Missing required legal resource: ${filename}`);
		cpSync(source, join(targetDirectory, filename));
	}
	return targetDirectory;
}
