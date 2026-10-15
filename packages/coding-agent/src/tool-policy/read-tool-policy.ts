const SKILL_MARKDOWN_FILENAME = "SKILL.md";
const SKILL_DIRECTORY_SEGMENT = "skills";

/**
 * 扩展名 → 覆盖该格式的内置技能「候选名」。
 *
 * 候选名只是**待判定**的名字：只有调用方提供的当前会话可用技能集里确实存在时，
 * 提示才可以点名它。把它直接写进提示会让模型去加载一个可能不存在的技能
 * （现场案例：`.xlsx` → 提示 `Load the "xlsx" skill`，而环境里没有该技能，模型据此
 * 反复尝试并长时间空转，见 BUG-0025）。
 */
const BINARY_EXTENSION_SKILLS: Readonly<Record<string, string>> = Object.freeze({
	".doc": "docx",
	".docx": "docx",
	".odt": "docx",
	".xls": "xlsx",
	".xlsx": "xlsx",
	".ods": "xlsx",
	".csv": "xlsx",
	".tsv": "xlsx",
	".ppt": "pptx",
	".pptx": "pptx",
	".odp": "pptx",
});

/** 二进制提示的可用性上下文：`availableSkillNames` 缺省 = 宿主无法确认可用性。 */
export interface CodingAgentBinaryHintContext {
	readonly availableSkillNames?: ReadonlySet<string>;
}

/** Coding Agent 对通用 Node read 实现叠加的资源完整性与能力引导策略。 */
export interface CodingAgentReadToolOptions {
	readonly preserveFullText: (absolutePath: string) => boolean;
	readonly binaryContentHint: (extension: string, context?: CodingAgentBinaryHintContext) => string;
}

export const CODING_AGENT_READ_TOOL_OPTIONS: CodingAgentReadToolOptions = Object.freeze({
	preserveFullText: isCodingAgentInstructionMarkdown,
	binaryContentHint: codingAgentBinaryContentHint,
});
export function isCodingAgentInstructionMarkdown(absolutePath: string): boolean {
	const segments = foldPathSegments(absolutePath);
	const filename = segments.at(-1) ?? "";
	if (filename === SKILL_MARKDOWN_FILENAME) return true;
	if (!filename.toLowerCase().endsWith(".md")) return false;
	return segments.includes(SKILL_DIRECTORY_SEGMENT);
}

export function codingAgentBinaryContentHint(extension: string, context?: CodingAgentBinaryHintContext): string {
	const candidate = BINARY_EXTENSION_SKILLS[extension];
	// 只有确认该技能在当前会话可用时才点名；否则明确说明没有可用技能并给出替代路径。
	if (candidate && context?.availableSkillNames?.has(candidate)) {
		return `Load the "${candidate}" skill for instructions on how to handle this file.`;
	}
	if (candidate) {
		return "No installed skill can handle this format: convert it with a command tool first, or switch to a coding mode that has shell access.";
	}
	return "No matching skill found. Convert this file with a command tool before reading.";
}

function foldPathSegments(absolutePath: string): string[] {
	const segments: string[] = [];
	for (const segment of absolutePath.split(/[/\\]+/)) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments;
}
