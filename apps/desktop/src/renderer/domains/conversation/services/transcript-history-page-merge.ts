// Copyright The Open Forge contributors.
import type { HistoryPage } from "@preload/api-types/session";
import type { HistoryEntry } from "@vetta/runtime-core";

function entryId(entry: HistoryEntry): string | undefined {
	return "entryId" in entry ? entry.entryId : undefined;
}

function overlapKey(entry: HistoryEntry): string {
	const id = entryId(entry);
	return id ? `id:${id}` : `value:${JSON.stringify(entry)}`;
}

/** Merge an older page without allowing its stale objects to replace the live window. */
export function prependTranscriptPage(windowEntries: readonly HistoryEntry[], page: HistoryPage): HistoryEntry[] {
	const prefix = windowEntries.slice(0, page.history.length).map(overlapKey);
	// Prefix-function matching keeps overlap detection linear even for long,
	// repetitive timing/marker sequences. Only durable IDs can anchor overlap.
	const fallback = new Array<number>(prefix.length).fill(0);
	for (let i = 1; i < prefix.length; i += 1) {
		let length = fallback[i - 1];
		while (length > 0 && prefix[i] !== prefix[length]) length = fallback[length - 1];
		if (prefix[i] === prefix[length]) length += 1;
		fallback[i] = length;
	}
	let overlap = 0;
	for (const entry of page.history) {
		const key = overlapKey(entry);
		while (overlap > 0 && (overlap === prefix.length || prefix[overlap] !== key)) overlap = fallback[overlap - 1];
		if (prefix[overlap] === key) overlap += 1;
	}
	if (!windowEntries.slice(0, overlap).some((entry) => entryId(entry))) overlap = 0;
	const windowIds = new Set(windowEntries.flatMap((entry) => (entryId(entry) ? [entryId(entry)] : [])));
	const seen = new Set<string>();
	const result: HistoryEntry[] = [];
	for (const entry of page.history.slice(0, page.history.length - overlap)) {
		const id = entryId(entry);
		if (id && (windowIds.has(id) || seen.has(id))) continue;
		if (id) seen.add(id);
		result.push(entry);
	}
	for (const entry of windowEntries) {
		const id = entryId(entry);
		if (id && seen.has(id)) continue;
		if (id) seen.add(id);
		result.push(entry);
	}
	return result;
}
