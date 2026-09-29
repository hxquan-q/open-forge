// Copyright The Open Forge contributors.
import type { CodingAgentPromptResourceSource } from "../runtime-contracts/index.js";

/**
 * 二进制读提示的技能可用性来源：与 `invoke_skill` 共享同一份资源源，按调用时刻取名字快照。
 * 资源源缺省时返回 `undefined`，让读工具按「没有可用技能」处理（BUG-0025 / BUG-0026）。
 */
export function createAvailableSkillNamesProvider(
	source: Pick<CodingAgentPromptResourceSource, "getSkills"> | undefined,
): (() => ReadonlySet<string> | undefined) | undefined {
	if (!source) return undefined;
	return () => new Set(source.getSkills().skills.map((skill) => skill.name));
}
