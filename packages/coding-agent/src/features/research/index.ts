// Copyright The Open Forge contributors.
export type { CodingAgentResearchScopeOperations } from "./contracts.js";
export {
	formatResearchSourcesManifest,
	parseResearchSourcesManifest,
	RESEARCH_SOURCES_FENCE,
	type ResearchSourceEntry,
	type ResearchSourcesManifest,
	ResearchSourcesManifestSchema,
} from "./research-manifest.js";
export {
	CODING_AGENT_RESEARCH_SCOPE_TOOL_CATEGORY,
	CODING_AGENT_RESEARCH_SCOPE_TOOL_DESCRIPTION,
	CODING_AGENT_RESEARCH_SCOPE_TOOL_SCOPES,
	type CodingAgentResearchScopeToolInput,
	CodingAgentResearchScopeToolInputSchema,
	type CodingAgentResearchScopeToolOptions,
	createCodingAgentResearchScopeToolRegistration,
} from "./research-scope-tool.js";
