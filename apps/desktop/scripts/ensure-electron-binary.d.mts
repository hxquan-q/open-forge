// Copyright The Open Forge contributors.

export type ElectronInstallReason =
	| "installed"
	| "missing-path-file"
	| "missing-executable"
	| "version-mismatch"
	| "unsupported-platform";

export type EnsureElectronBinaryStatus = "installed" | "repaired" | "override" | "unsupported-platform";

export interface ElectronInstallInspection {
	complete: boolean;
	reason: ElectronInstallReason;
	executablePath: string | undefined;
}

export interface EnsureElectronBinaryResult {
	status: EnsureElectronBinaryStatus;
	executablePath?: string;
}

export declare function resolvePlatformExecutable(platform: string): string | undefined;

export declare function resolveElectronPackageDir(requireResolve?: (specifier: string) => string): string;

export declare function inspectElectronInstall(
	packageDir: string,
	options?: { platform?: string },
): ElectronInstallInspection;

export declare function runElectronInstaller(packageDir: string, env?: NodeJS.ProcessEnv): Promise<void>;

export declare function ensureElectronBinary(options?: {
	packageDir?: string;
	env?: NodeJS.ProcessEnv;
	runInstaller?: (packageDir: string, env: NodeJS.ProcessEnv) => Promise<void>;
	log?: (message: string) => void;
}): Promise<EnsureElectronBinaryResult>;
