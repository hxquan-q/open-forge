// Modified by The Open Forge contributors.
import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

export const { GET } = createFromSource(source, {
	buildIndex(page) {
		return {
			// Hidden locales share a public URL, but not a search document ID.
			id: `${page.locale}:${page.url}`,
			title: page.data.title,
			description: page.data.description,
			url: page.url,
			structuredData: page.data.structuredData,
		};
	},
});
