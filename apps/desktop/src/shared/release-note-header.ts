// Modified by The Open Forge contributors.
/**
 * 从发布说明文件中提取正文：开头的标题行、「发布日期 / Upstream baseline」等
 * 元信息只面向仓库读者，更新对话框自己有标题与版本号，
 * 正文只保留第一个 `##` 小节起的内容——前置元信息随开头一并舍弃，
 * 因此只去掉独占一行的 HTML 注释（如汇编生成的标记行），
 * 代码示例或行内的 `<!-- -->` 字面量原样保留。
 * 没有小节的文件视为格式不完整，宁可不带说明也不把标题元信息推给用户。
 * 打包提取（写入更新 feed）与渲染进程（开发预览）共用同一规则；
 * 脚本侧实现见 apps/desktop/scripts/resolve-release-info.mjs（Node 20 不能 import .ts，各自保持同步）。
 */
export function stripReleaseNoteHeader(markdown: string): string {
	const normalized = markdown.replace(/\r\n/g, "\n");
	const firstSection = normalized.search(/^## /m);
	if (firstSection < 0) return "";
	let inFence = false;
	return normalized
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
}
