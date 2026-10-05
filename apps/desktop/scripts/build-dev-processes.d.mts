// Copyright The Open Forge contributors.
export const developmentBuildTasks: readonly { readonly name: string; readonly inputs: readonly string[] }[];
export function hashPaths(paths: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<string>;
