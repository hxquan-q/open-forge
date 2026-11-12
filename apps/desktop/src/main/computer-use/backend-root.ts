// Copyright The Open Forge contributors.
import { join } from "node:path";

export function resolveComputerUseBackendRoot(options: {
	isPackaged: boolean;
	resourcesPath: string;
	cwd: string;
}): string {
	return options.isPackaged
		? join(options.resourcesPath, "computer-use")
		: join(options.cwd, "resources", "computer-use");
}
