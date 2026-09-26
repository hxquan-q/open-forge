// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * research-evidence 产物的来源引用清单（TASK-0025）。
 *
 * 产物文件是事实源：模型在 research-evidence 正文末尾追加一个围栏代码块
 * 记录引用来源的指纹，宿主复查来源「缺失/已变更」时据此逐项 stat。
 * 同一会话重开仍可读——清单格式是本包拥有的产品合同，解析器对未知字段
 * 宽松（只校验需要的键），对缺失/畸形返回 undefined 而不是猜。
 */

export const RESEARCH_SOURCES_FENCE = "vetta-research-sources";

const ResearchSourceEntrySchema = Type.Object(
	{
		uri: Type.String({ minLength: 1 }),
		path: Type.String({ minLength: 1 }),
		name: Type.Optional(Type.String()),
		sizeBytes: Type.Integer({ minimum: 0 }),
		modifiedAtMs: Type.Number(),
	},
	{ additionalProperties: true },
);

export const ResearchSourcesManifestSchema = Type.Object(
	{
		version: Type.Literal(1),
		root: Type.Optional(Type.String()),
		sources: Type.Array(ResearchSourceEntrySchema),
	},
	{ additionalProperties: true },
);

export type ResearchSourceEntry = Static<typeof ResearchSourceEntrySchema>;
export type ResearchSourcesManifest = Static<typeof ResearchSourcesManifestSchema>;

/** 生成待追加到产物正文的围栏清单块（JSON 单行，便于正则无损回读）。 */
export function formatResearchSourcesManifest(manifest: ResearchSourcesManifest): string {
	return `\`\`\`${RESEARCH_SOURCES_FENCE}\n${JSON.stringify(manifest)}\n\`\`\``;
}

const MANIFEST_BLOCK = new RegExp(`\`\`\`${RESEARCH_SOURCES_FENCE}\\s*\\n([\\s\\S]*?)\\n\`\`\``, "g");

/**
 * 从产物正文解析引用清单。约定取最后一个匹配块（模型重复输出时以最新为准）；
 * 找不到或 JSON/Schema 不合即返回 undefined——调用方据此走「无引用清单」分支。
 */
export function parseResearchSourcesManifest(content: string): ResearchSourcesManifest | undefined {
	let parsed: ResearchSourcesManifest | undefined;
	for (const match of content.matchAll(MANIFEST_BLOCK)) {
		try {
			const value = JSON.parse(match[1] ?? "");
			if (Value.Check(ResearchSourcesManifestSchema, value)) parsed = value;
		} catch {
			// 畸形块跳过，继续找更早的合法块
		}
	}
	return parsed;
}
