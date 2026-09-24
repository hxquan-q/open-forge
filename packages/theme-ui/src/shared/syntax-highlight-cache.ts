// Copyright The Open Forge contributors.
/**
 * 高亮 HTML 缓存：在条数上限之外增加字符预算。
 *
 * 缓存 key 是 JSON.stringify([theme, language, code])（含源码全文），value 是
 * shiki 输出的 HTML（约为源码的 3-6 倍体积）；只按条数淘汰时，模型反复 dump
 * 大文件的会话可以让 300 个大条目滞留数百 MB。字符预算把总驻留锚在常量级——
 * 按 key.length + value.length 的 UTF-16 code unit 估算，约 500 万字符 ≈ 10MB。
 *
 * 单条超过整个预算时仍保留最新一条：可见代码块若被立即挤出会每次挂载重高亮，
 * 预算的目的是防累积，不是硬顶。淘汰语义为 Map 插入序 FIFO，命中不刷新顺序。
 */
export interface HighlightHtmlCacheOptions {
	readonly maxEntries: number;
	readonly maxBytes: number;
}

const DEFAULT_MAX_ENTRIES = 300;
const DEFAULT_MAX_BYTES = 5_000_000;

function costOf(key: string, html: string): number {
	return key.length + html.length;
}

export class HighlightHtmlCache {
	private readonly entries = new Map<string, string>();
	private totalChars = 0;
	private readonly maxEntries: number;
	private readonly maxBytes: number;

	constructor(options?: Partial<HighlightHtmlCacheOptions>) {
		this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
		if (!Number.isInteger(this.maxEntries) || this.maxEntries <= 0) {
			throw new Error("HighlightHtmlCache maxEntries must be a positive integer");
		}
		if (!Number.isInteger(this.maxBytes) || this.maxBytes <= 0) {
			throw new Error("HighlightHtmlCache maxBytes must be a positive integer");
		}
	}

	get size(): number {
		return this.entries.size;
	}

	get(key: string): string | undefined {
		return this.entries.get(key);
	}

	has(key: string): boolean {
		return this.entries.has(key);
	}

	put(key: string, html: string): void {
		const previous = this.entries.get(key);
		if (previous !== undefined) {
			this.totalChars -= costOf(key, previous);
			this.entries.delete(key);
		}
		this.entries.set(key, html);
		this.totalChars += costOf(key, html);
		while (this.totalChars > this.maxBytes && this.entries.size > 1) {
			this.evictOldest();
		}
		while (this.entries.size > this.maxEntries) {
			this.evictOldest();
		}
	}

	private evictOldest(): void {
		const oldest = this.entries.keys().next().value;
		if (oldest === undefined) return;
		const html = this.entries.get(oldest);
		if (html === undefined) return;
		this.totalChars -= costOf(oldest, html);
		this.entries.delete(oldest);
	}
}

export const highlightHtmlCache = new HighlightHtmlCache();
