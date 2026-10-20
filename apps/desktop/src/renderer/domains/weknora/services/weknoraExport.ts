// Copyright The Open Forge contributors.

/**
 * WeKnora 会话导出纯函数引擎（T02；02-plan D1/D2/D7）。
 *
 * 纯函数集合：**全量拉取辅助 + 引用标签转文字 + 三格式序列化 + 文件名净化**。无 UI、无状态。
 * docx 走**动态 import**，不进首屏 bundle（D1：主进程不引 docx，渲染层只在导出时加载该块）。
 *
 * 导出只含问答正文（`user` / `assistant` 两角色，AC-4）：原始 `WeKnoraMessage.content` 即正文，
 * 思考过程不在该类型里（见 atoms 的页面消息类型），故天然不含思考。
 *
 * 数据面**只经既有** `window.vetta.weknora.loadMessages`（C8：不建第二套事实源）。
 */

import type { WeKnoraMessage } from "@preload/api";
import { i18n } from "@shared/i18n";
import type { Paragraph as DocxParagraph } from "docx";
import { type CitationTag, parseCitationSpans } from "./citationTag";

/** 导出只保留问答两角色（AC-4）：`system` 与思考一律不进导出。 */
export type WeKnoraExportRole = "user" | "assistant";

/** 导出用的一轮问答：角色 + 已把引用标签转成文字的正文。 */
export interface WeKnoraExportTurn {
	readonly role: WeKnoraExportRole;
	readonly text: string;
}

/**
 * 归一化消息的**导出视图**：在 `WeKnoraMessage` 之上读可选的 `created_at`（分页游标与顺序校正用）。
 *
 * `created_at` 已由 T03 在主进程归一化中补齐（`main/weknora/http.ts` 的 `toMessage`），故正常路径下
 * 该字段存在、分页可真正翻页。这里仍按**可选字段**读取：旧数据 / 缺字段时有则用于翻页与顺序校正，
 * 无则退化为单页 —— 不臆造时间戳。
 */
export interface WeKnoraExportMessage extends WeKnoraMessage {
	readonly created_at?: string;
}

/** 角色标签走 i18n（复用既有 `message.you` / `message.assistant`，红线 C4）。 */
function roleLabel(role: WeKnoraExportRole): string {
	return i18n.t(role === "user" ? "weknora:message.you" : "weknora:message.assistant");
}

/** 引用来源前缀走 i18n（红线 C4）；zh 基准值即票面要求的「来源」。 */
function citationSourceLabel(): string {
	return i18n.t("weknora:export.citationSource");
}

/** 单个引用标签 → 纯文字（AC-4）：kb → `[来源:文档名]`，web → `[标题](链接)`。 */
function citationTagToPlainText(tag: CitationTag): string {
	if (tag.kind === "kb") {
		return tag.doc === undefined || tag.doc === ""
			? `[${citationSourceLabel()}]`
			: `[${citationSourceLabel()}:${tag.doc}]`;
	}
	if (tag.title !== undefined && tag.title !== "" && tag.url !== undefined && tag.url !== "") {
		return `[${tag.title}](${tag.url})`;
	}
	// web 缺标题或链接时降级：有标题给标题、有链接给链接，都没有则丢弃该标签（不臆造）。
	return tag.title ?? tag.url ?? "";
}

/**
 * 把一条消息正文里的引用标签转成纯文字（AC-4），其余文本逐字保留。
 *
 * 复用 `parseCitationSpans` 切段：文本段原样、标签段按类型转换、尾部残缺段（流式截断）丢弃。
 */
export function citationToPlainText(content: string): string {
	let text = "";
	for (const span of parseCitationSpans(content)) {
		const segment = span.segment;
		if (segment.type === "text") text += segment.text;
		else if (segment.type === "tag") text += citationTagToPlainText(segment.tag);
	}
	return text;
}

/** 过滤出问答正文并转换引用（AC-4）：只留 user/assistant，思考/系统不进导出。 */
export function toExportTurns(messages: readonly WeKnoraMessage[]): WeKnoraExportTurn[] {
	const turns: WeKnoraExportTurn[] = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		turns.push({ role: message.role, text: citationToPlainText(message.content) });
	}
	return turns;
}

/** txt：每轮 `角色: 正文`，轮次之间空行分隔（AC-5）。 */
export function toTxt(messages: readonly WeKnoraMessage[]): string {
	return toExportTurns(messages)
		.map((turn) => `${roleLabel(turn.role)}: ${turn.text}`)
		.join("\n\n");
}

/** markdown：角色作二级标题，正文原样保留 markdown 结构（AC-5）。 */
export function toMarkdown(messages: readonly WeKnoraMessage[]): string {
	return toExportTurns(messages)
		.map((turn) => `## ${roleLabel(turn.role)}\n\n${turn.text}`)
		.join("\n\n");
}

/**
 * docx：动态 `import("docx")` 生成，`Packer.toBase64String` 直接产出 base64（AC-5 / D1）。
 *
 * 返回 **base64 字符串**（供 `dialog.saveData` 的 `base64` 通道）；函数名沿用票面的
 * `toDocxBuffer`，实为 base64 文本 —— 主进程不引 docx，渲染 bundle 只在导出时加载该块。
 *
 * 说明（02-plan D1 写的是 `Packer.toBlob` → base64）：改用 docx 自带的 `toBase64String`
 * 出口，产出同一份 base64，但少一次 Blob 往返 —— `Blob.arrayBuffer()` 在部分环境（jsdom）
 * 缺席，`toBase64String` 走库内置 buffer polyfill，渲染层与测试环境一致。
 */
export async function toDocxBuffer(messages: readonly WeKnoraMessage[]): Promise<string> {
	const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
	const children: DocxParagraph[] = [];
	for (const turn of toExportTurns(messages)) {
		children.push(
			new Paragraph({
				heading: HeadingLevel.HEADING_2,
				children: [new TextRun({ text: roleLabel(turn.role), bold: true })],
			}),
		);
		for (const line of turn.text.split("\n")) {
			children.push(new Paragraph({ children: [new TextRun(line)] }));
		}
	}
	const document = new Document({ sections: [{ children }] });
	return Packer.toBase64String(document);
}

/** 非法文件名字符（与 conversation 域 `useChatExportHostModel` 同一正则先例，AC-7）。 */
const ILLEGAL_FILE_NAME_RE = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * 会话标题 → 安全文件名基名（**不含扩展名**）：非法字符换 `_`、去首尾空白、空则回退（AC-7）。
 *
 * 扩展名（`.txt` / `.md` / `.docx`）由调用方按格式追加 —— 同批文件共用同一扩展名，
 * 故重名去重只需对基名做（见 {@link uniqueFileNames}）。
 */
export function safeFileName(title: string): string {
	const normalized = title.trim().replace(ILLEGAL_FILE_NAME_RE, "_");
	return normalized || i18n.t("weknora:conversation.untitled");
}

/**
 * 批量重名加序号（AC-7）：同名按出现顺序追加 ` (2)`、` (3)`…。
 *
 * 比较**大小写不敏感**：Windows / macOS 文件系统不区分大小写，避免两个「同名」文件写盘互相覆盖。
 */
export function uniqueFileNames(names: readonly string[]): string[] {
	const used = new Set<string>();
	const result: string[] = [];
	for (const name of names) {
		let candidate = name;
		let suffix = 1;
		while (used.has(candidate.toLowerCase())) {
			suffix += 1;
			candidate = `${name} (${suffix})`;
		}
		used.add(candidate.toLowerCase());
		result.push(candidate);
	}
	return result;
}

/** 导出格式（AC-3）：三选一，供格式选择弹窗与序列化分发共用。 */
export type WeKnoraExportFormat = "txt" | "md" | "docx";

/** 格式 → 文件扩展名；同批文件共用同一扩展名，故重名去重只对基名做（见 {@link exportFileNames}）。 */
const EXPORT_EXTENSIONS: Record<WeKnoraExportFormat, string> = { txt: "txt", md: "md", docx: "docx" };

/** 会话标题 + 格式 → 完整文件名（基名经 {@link safeFileName} 净化后追加扩展名，AC-7）。 */
export function exportFileName(title: string, format: WeKnoraExportFormat): string {
	return `${safeFileName(title)}.${EXPORT_EXTENSIONS[format]}`;
}

/** 批量文件名（AC-7）：先对基名去重（{@link uniqueFileNames}），再统一追加扩展名。 */
export function exportFileNames(titles: readonly string[], format: WeKnoraExportFormat): string[] {
	return uniqueFileNames(titles.map((title) => safeFileName(title))).map(
		(base) => `${base}.${EXPORT_EXTENSIONS[format]}`,
	);
}

/** 序列化后的导出载荷：内容 + 编码（docx 走 base64，txt/md 走 utf8）。 */
export interface WeKnoraExportPayload {
	readonly content: string;
	readonly encoding: "utf8" | "base64";
}

/**
 * 消息数组 → 指定格式的载荷（AC-5）：txt/md 直出 utf8 文本，docx 经动态 `import("docx")` 出 base64。
 *
 * 格式 → 序列化器的分发只此一处（单会话导出与批量导出共用），避免两个接线点各判一次格式。
 */
export async function serializeExport(
	messages: readonly WeKnoraMessage[],
	format: WeKnoraExportFormat,
): Promise<WeKnoraExportPayload> {
	if (format === "docx") return { content: await toDocxBuffer(messages), encoding: "base64" };
	return { content: format === "md" ? toMarkdown(messages) : toTxt(messages), encoding: "utf8" };
}

/** 单页拉取的入参（含向更早翻页的 `beforeTime` 游标）。 */
export interface LoadMessagesPageInput {
	readonly sessionId: string;
	readonly limit: number;
	/** 更早一页的游标（= 已取最早一条的 `created_at`）；首页不传。 */
	readonly beforeTime?: string;
}

/** 一页消息的拉取函数（**可注入**，便于纯函数单测；缺省走既有 IPC）。 */
export type LoadMessagesPage = (input: LoadMessagesPageInput) => Promise<readonly WeKnoraExportMessage[]>;

/** 导出分页大小：大于屏幕用的 20（现有 `limit=20` 只够渲染一屏，不够导出）。 */
export const EXPORT_PAGE_SIZE = 50;
/** 分页上限保护：最多拉这么多页（50 × 100 = 5000 条），防御服务端游标不前进导致死循环。 */
export const EXPORT_MAX_PAGES = 100;

export interface LoadAllMessagesOptions {
	readonly pageSize?: number;
	readonly maxPages?: number;
	/** 注入的拉页函数；缺省走既有 `window.vetta.weknora.loadMessages`（C8，不建第二事实源）。 */
	readonly loadPage?: LoadMessagesPage;
}

/** 缺省拉页：走既有 IPC 合同（`beforeTime` 已由 T03 在 service/IPC 侧透出，翻页游标可用）。 */
const defaultLoadPage: LoadMessagesPage = (input) => window.vetta.weknora.loadMessages(input);

/** 页内最早一条的时间戳原始串（按 `Date.parse` 比较；无可用时间戳则 `undefined`）。 */
function oldestTimestamp(messages: readonly WeKnoraExportMessage[]): string | undefined {
	let oldestValue: string | undefined;
	let oldestTime = Number.POSITIVE_INFINITY;
	for (const message of messages) {
		const value = message.created_at;
		if (value === undefined || value === "") continue;
		const time = Date.parse(value);
		if (Number.isNaN(time)) continue;
		if (time < oldestTime) {
			oldestTime = time;
			oldestValue = value;
		}
	}
	return oldestValue;
}

/** 按 id 去重（空 id 不去重：`toMessage` 允许缺 id，不能因同名空串吞掉正文）。 */
function dedupeById(messages: readonly WeKnoraExportMessage[]): WeKnoraExportMessage[] {
	const seen = new Set<string>();
	const result: WeKnoraExportMessage[] = [];
	for (const message of messages) {
		if (message.id !== "") {
			if (seen.has(message.id)) continue;
			seen.add(message.id);
		}
		result.push(message);
	}
	return result;
}

/** 顺序校正：全部消息带可解析 `created_at` 时按时间升序**稳定**排序；否则维持分页预置顺序。 */
function orderChronologically(messages: readonly WeKnoraExportMessage[]): WeKnoraExportMessage[] {
	const entries = messages.map((message) => ({
		message,
		time: message.created_at === undefined ? Number.NaN : Date.parse(message.created_at),
	}));
	if (entries.some((entry) => Number.isNaN(entry.time))) return [...messages];
	return entries.sort((a, b) => a.time - b.time).map((entry) => entry.message);
}

/**
 * 拉全某会话的全部消息（D7 / AC-6）：循环 `before_time` 分页，**顺序校正 + 上限保护**。
 *
 * - 从最新一页起向更早翻；每页结果**预置**到累积数组前 → 整体最早在前。
 * - 去重（按 id）：相邻页边界可能重叠。
 * - 终止：空页 / 不足一页 / 无新消息（游标不前进的保护）/ 触达 `maxPages` / 无可推导游标。
 * - 顺序校正：消息带 `created_at` 时按时间升序稳定排序；否则维持分页预置顺序。
 */
export async function loadAllMessages(
	sessionId: string,
	options: LoadAllMessagesOptions = {},
): Promise<WeKnoraMessage[]> {
	const pageSize = options.pageSize ?? EXPORT_PAGE_SIZE;
	const maxPages = options.maxPages ?? EXPORT_MAX_PAGES;
	const loadPage = options.loadPage ?? defaultLoadPage;
	const seen = new Set<string>();
	const collected: WeKnoraExportMessage[] = [];
	let beforeTime: string | undefined;
	for (let page = 0; page < maxPages; page += 1) {
		const messages = await loadPage({
			sessionId,
			limit: pageSize,
			...(beforeTime === undefined ? {} : { beforeTime }),
		});
		if (messages.length === 0) break;
		const hasFresh = messages.some((message) => message.id === "" || !seen.has(message.id));
		if (!hasFresh) break;
		for (const message of messages) {
			if (message.id !== "") seen.add(message.id);
		}
		collected.unshift(...messages);
		const oldest = oldestTimestamp(messages);
		if (oldest === undefined) break;
		if (messages.length < pageSize) break;
		beforeTime = oldest;
	}
	return orderChronologically(dedupeById(collected));
}
