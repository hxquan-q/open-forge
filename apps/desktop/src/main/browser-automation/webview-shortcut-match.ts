// Copyright The Open Forge contributors.

export interface AcceleratorInput {
	readonly type?: string;
	readonly key: string;
	readonly control: boolean;
	readonly shift: boolean;
	readonly alt: boolean;
	readonly meta: boolean;
}

export function matchShortcutCombo(
	input: AcceleratorInput,
	combo: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (input.type && input.type !== "keyDown") return false;
	const key = input.key.length === 1 ? input.key.toLowerCase() : input.key.toLowerCase();
	if (key === "control" || key === "meta" || key === "alt" || key === "shift") return false;
	const tokens = combo.trim().toLowerCase().split("+").filter(Boolean);
	if (tokens.length === 0) return false;
	const expectedKey = tokens[tokens.length - 1] ?? "";
	const mods = new Set(tokens.slice(0, -1));
	const wantsMod = mods.has("mod");
	const wantsCtrl = mods.has("ctrl") || (wantsMod && platform !== "darwin");
	const wantsMeta = mods.has("meta") || (wantsMod && platform === "darwin");
	return (
		key === expectedKey &&
		input.shift === mods.has("shift") &&
		input.alt === mods.has("alt") &&
		input.control === wantsCtrl &&
		input.meta === wantsMeta
	);
}
