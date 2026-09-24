// Copyright The Open Forge contributors.

/**
 * 声明式清单契约（`application/vnd.vetta.checklist+json`）：
 *
 * ```json
 * {
 *   "title": "可选标题",
 *   "items": [
 *     { "label": "拉取分支", "status": "done", "detail": "可选说明" }
 *   ]
 * }
 * ```
 *
 * `status` 容错：`done` / `completed` / `passed` → done，`active` / `running` / `in_progress` → active，
 * 其余（含缺失）→ todo。结构不符返回 null，由预览层降级为代码视图。
 */
export type CanvasChecklistStatus = "done" | "active" | "todo";

export interface CanvasChecklistItem {
	readonly label: string;
	readonly status: CanvasChecklistStatus;
	readonly detail?: string;
}

export interface CanvasChecklistSpec {
	readonly title?: string;
	readonly items: readonly CanvasChecklistItem[];
}

const DONE_STATUSES = new Set(["done", "completed", "complete", "passed", "success", "succeeded"]);
const ACTIVE_STATUSES = new Set(["active", "running", "in_progress", "in-progress", "doing", "pending"]);

export function parseCanvasChecklist(content: string): CanvasChecklistSpec | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const record = parsed as { readonly title?: unknown; readonly items?: unknown };
	if (!Array.isArray(record.items)) return null;

	const items: CanvasChecklistItem[] = [];
	for (const entry of record.items) {
		if (typeof entry === "string") {
			if (entry.trim()) items.push({ label: entry, status: "todo" });
			continue;
		}
		if (typeof entry !== "object" || entry === null) continue;
		const item = entry as {
			readonly label?: unknown;
			readonly text?: unknown;
			readonly status?: unknown;
			readonly detail?: unknown;
		};
		const label = typeof item.label === "string" ? item.label : typeof item.text === "string" ? item.text : "";
		if (!label.trim()) continue;
		items.push({
			label,
			status: normalizeStatus(item.status),
			...(typeof item.detail === "string" && item.detail.trim() ? { detail: item.detail } : {}),
		});
	}
	if (items.length === 0) return null;
	return {
		...(typeof record.title === "string" && record.title.trim() ? { title: record.title } : {}),
		items,
	};
}

function normalizeStatus(value: unknown): CanvasChecklistStatus {
	if (typeof value !== "string") return "todo";
	const normalized = value.trim().toLowerCase();
	if (DONE_STATUSES.has(normalized)) return "done";
	if (ACTIVE_STATUSES.has(normalized)) return "active";
	return "todo";
}
