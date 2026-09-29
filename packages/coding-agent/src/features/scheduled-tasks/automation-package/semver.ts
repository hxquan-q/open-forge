// Copyright The Open Forge contributors.
/** 够用的 semver 比较：只看 major.minor.patch；带预发布后缀的视为小于同号正式版。 */
export function compareSemver(left: string, right: string): number {
	const parse = (value: string): readonly [number, number, number, boolean] => {
		const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(value.trim());
		if (!match) return [0, 0, 0, false];
		return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] !== undefined];
	};
	const a = parse(left);
	const b = parse(right);
	for (let index = 0; index < 3; index += 1) {
		if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
	}
	if (a[3] === b[3]) return 0;
	return a[3] ? -1 : 1;
}

export function isSemverAtLeast(actual: string, required: string): boolean {
	return compareSemver(actual, required) >= 0;
}
