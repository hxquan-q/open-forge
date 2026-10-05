// Copyright The Open Forge contributors.
/**
 * scope-glob.mjs — 写域 glob 语义的权威实现（ac-fence-spec §3.5）
 *
 * 三个函数自 scripts/ac-audit.mjs 原样提取（不重写）：fence（事中拦截，src/fence/judge.ts）
 * 与 ac-audit（事后审计）必须共用同一份实现——否则「围栏放行的」和「审计判越权的」会互相打架。
 *
 * 为什么放在 scripts/ 而不是 src/：scripts/ 随 vettapkg 打包且被 node 直接执行（.mjs 纯 ESM）；
 * src/ 只经 vite 联邦打包进 dist/，不进包。TS 侧经旁置 scope-glob.d.mts 获得类型（同 ac-audit.d.mts 约定）。
 *
 * glob 特性：`**` 跨目录（尾部 `/**` 含目录本体）、`*` 段内、`?` 单字符、`{a,b}` 组（感知嵌套）、
 * 精确路径也是合法条目、`dir` 前缀含全部后代。路径统一 POSIX 化（`\` → `/`）再匹配，相对项目根。
 */

/**
 * glob 转 RegExp。支持子集：双星跨目录、单星段内通配、问号单字符、花括号组。
 * 例：docs/ac/prototype/ 下任意层级，或 src 下所有 ts/tsx。写域声明保守，未匹配即越权。
 */
export function globToRegExp(pattern) {
	let re = "";
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i];
		if (ch === "*") {
			if (pattern[i + 1] === "*") {
				// 双星斜杠或裸双星：跨目录任意段（含零段）
				if (pattern[i + 2] === "/") {
					re += "(?:[^/]+/)*";
					i += 3;
				} else {
					// 尾部 /**：目录本体与其下全部内容（本体匹配由 matches() 的前缀语义兜底，
					// 这里保证"目录/xxx"也命中；写成 .* 即可）
					re += ".*";
					i += 2;
				}
			} else {
				re += "[^/]*";
				i += 1;
			}
		} else if (ch === "?") {
			re += "[^/]";
			i += 1;
		} else if (ch === "{") {
			const end = pattern.indexOf("}", i);
			if (end === -1) {
				re += "\\{";
				i += 1;
			} else {
				const group = pattern
					.slice(i + 1, end)
					.split(",")
					.map((alt) => {
						// 递归生成的是完整正则（含 ^$ 锚），剥掉锚只留主体
						const src = globToRegExp(alt).source;
						return src.startsWith("^") && src.endsWith("$") ? src.slice(1, -1) : src;
					})
					.join("|");
				re += `(?:${group})`;
				i = end + 1;
			}
		} else {
			re += ch.replace(/[.+^$()|[\]\\]/g, "\\$&");
			i += 1;
		}
	}
	return new RegExp(`^${re}$`);
}

/** 按逗号分割 scope 列表，但跳过花括号组内的逗号（{ts,tsx} 是一个 pattern 的一部分）。 */
export function splitScopeList(raw) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const ch of String(raw ?? "")) {
		if (ch === "{") depth += 1;
		if (ch === "}") depth = Math.max(0, depth - 1);
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current);
	return parts;
}

/** glob 列表 → 匹配器（含「精确路径也是合法 scope 条目」语义；目录含其全部后代）。 */
export function compileScope(patterns) {
	const list = (Array.isArray(patterns) ? patterns : splitScopeList(patterns))
		.map((p) => String(p).trim())
		.filter(Boolean);
	return {
		patterns: list,
		/** 命中任一 pattern 即在写域内。 */
		matches(path) {
			return list.some((pattern) => {
				if (pattern.includes("*") || pattern.includes("?") || pattern.includes("{")) {
					if (globToRegExp(pattern).test(path)) return true;
					// 目录本体语义：`dir/**` 的本体（dir 自身）也算写域内
					const base = pattern.replace(/\/\*\*$/, "");
					return base !== pattern && base === path;
				}
				return pattern === path || path.startsWith(`${pattern}/`);
			});
		},
	};
}
