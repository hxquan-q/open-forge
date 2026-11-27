// Modified by The Open Forge contributors.
import { readFileSync } from "node:fs";

/**
 * 从 `.github/release-notes/v<版本>.md` 的正文中提取发布说明：
 * 标题行与「发布日期 / Upstream baseline」等元信息只面向仓库读者，
 * 更新弹窗已有版本标题，正文从第一个 `##` 小节开始；
 * 只去掉独占一行的 HTML 注释（如汇编生成的标记行），
 * 代码示例或行内的 `<!-- -->` 字面量原样保留。
 * 与渲染进程开发预览共用同一规则，实现见 src/shared/release-note-header.ts；
 * 打包脚本须兼容 Node 20（无类型擦除），不能 import .ts，两处保持同步。
 */
export function extractReleaseNotes(releaseNoteMarkdown) {
	const normalized = releaseNoteMarkdown.replace(/\r\n/g, "\n");
	const firstSection = normalized.search(/^## /m);
	if (firstSection < 0) return undefined;
	let inFence = false;
	const body = normalized
		.slice(firstSection)
		.split("\n")
		.filter((line) => {
			if (/^\s*```/.test(line)) {
				inFence = !inFence;
				return true;
			}
			return inFence || !/^\s*<!--[\s\S]*-->\s*$/.test(line);
		})
		.join("\n")
		.trim();
	return body || undefined;
}

export function resolveReleaseInfo(releaseNotePath, version) {
	let releaseNoteMarkdown;
	try {
		releaseNoteMarkdown = readFileSync(releaseNotePath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
		console.warn(`[prepare-pack] release notes file not found: ${releaseNotePath}`);
		return undefined;
	}
	const releaseNotes = extractReleaseNotes(releaseNoteMarkdown);
	if (!releaseNotes) {
		console.warn(`[prepare-pack] release notes for ${version} are empty in ${releaseNotePath}`);
		return undefined;
	}
	return { releaseNotes };
}
