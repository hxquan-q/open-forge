// Copyright The Open Forge contributors.

export const ALLSTAR_PROJECT_CONFIG_RELATIVE_PATH = ".vetta/allstar/project-config.md";

export function getAllstarProjectConfigDirectory(cwd: string): string {
	return `${cwd.replace(/[\\/]+$/, "")}/.vetta/allstar`;
}

export function getAllstarProjectConfigPath(cwd: string): string {
	return `${cwd.replace(/[\\/]+$/, "")}/${ALLSTAR_PROJECT_CONFIG_RELATIVE_PATH}`;
}
