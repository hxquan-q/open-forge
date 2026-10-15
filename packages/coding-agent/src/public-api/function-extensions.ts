// Modified by The Open Forge contributors.
export {
	CODING_AGENT_TOOL_APPROVAL_EXTENSION_ID,
	CODING_AGENT_TOOL_APPROVAL_FUNCTION,
	type CodingAgentToolApprovalDecision,
	type CodingAgentToolApprovalFunctionRequest,
} from "../execution/permissions/approval-contract.js";
export {
	CODING_AGENT_SANDBOX_AUTHORIZATION_EXTENSION_ID,
	CODING_AGENT_SANDBOX_AUTHORIZATION_FUNCTION,
	type CodingAgentSandboxAuthorizationDecision,
	type CodingAgentSandboxAuthorizationFunctionRequest,
} from "../execution/sandbox/authorization-contract.js";
export {
	ARTIFACT_TOOL_ACTIONS,
	ARTIFACT_TOOL_ERROR_CODES,
	ARTIFACT_TOOL_NAME,
	type ArtifactToolAction,
	type ArtifactToolError,
	type ArtifactToolErrorCode,
	ArtifactToolErrorSchema,
	type ArtifactToolInput,
	ArtifactToolInputSchema,
	type ArtifactToolListItem,
	artifactToolError,
	CODING_AGENT_ARTIFACT_EXTENSION_ID,
	CODING_AGENT_ARTIFACT_FUNCTION,
	type CodingAgentArtifactFunctionRequest,
	type CodingAgentArtifactFunctionResult,
	readArtifactToolError,
	readArtifactToolInput,
} from "../features/artifacts/artifact-tool-contract.js";
export {
	type ArtifactUpdateDecision,
	type ArtifactVersionState,
	decideArtifactUpdate,
	isExternalArtifactUpdate,
	nextArtifactVersion,
} from "../features/artifacts/artifact-version-policy.js";
export {
	CODING_AGENT_ATTACH_ARTIFACT_EXTENSION_ID,
	CODING_AGENT_ATTACH_ARTIFACT_FUNCTION,
	type CodingAgentAttachArtifactRequest,
	type CodingAgentAttachArtifactResult,
} from "../features/artifacts/attach-artifact-tool.js";
export {
	CODING_AGENT_ASK_USER_QUESTION_EXTENSION_ID,
	CODING_AGENT_ASK_USER_QUESTION_FUNCTION,
	type CodingAgentQuestionAnswer,
	type CodingAgentQuestionFunctionRequest,
	type CodingAgentQuestionItem,
	type CodingAgentQuestionOption,
	type CodingAgentQuestionRequest,
	type CodingAgentQuestionResult,
} from "../features/ask-user-question/contracts.js";
export {
	BROWSER_ELEMENT_REF_ENCODING,
	BROWSER_SCREENSHOT_FORMAT,
	BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX,
	BROWSER_TAB_READ_ACTIONS,
	BROWSER_TAB_TOOL_ACTIONS,
	BROWSER_TAB_TOOL_ERROR_CODES,
	BROWSER_TAB_TOOL_NAME,
	BROWSER_TAB_WRITE_ACTIONS,
	type BrowserElementRef,
	BrowserElementRefSchema,
	type BrowserTabToolAction,
	type BrowserTabToolError,
	type BrowserTabToolErrorCode,
	BrowserTabToolErrorSchema,
	type BrowserTabToolInput,
	BrowserTabToolInputSchema,
	browserTabToolError,
	CODING_AGENT_BROWSER_TAB_EXTENSION_ID,
	CODING_AGENT_BROWSER_TAB_FUNCTION,
	type CodingAgentBrowserTabFunctionRequest,
	type CodingAgentBrowserTabFunctionResult,
	encodeBrowserElementRef,
	isAllowedBrowserTabUrl,
	isBrowserTabReadAction,
	isBrowserTabWriteAction,
	raiseBrowserTabToolRisk,
	readBrowserElementRef,
	readBrowserTabToolError,
	readBrowserTabToolInput,
} from "../features/browser-tab/browser-tab-tool-contract.js";
export {
	BROWSER_ELEMENT_ATTRIBUTE_KEYS,
	BROWSER_ELEMENT_COMPUTED_STYLE_KEYS,
	BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS,
	BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS,
	BROWSER_ELEMENT_OUTER_HTML_MAX_CHARS,
	BROWSER_ELEMENT_SELECTION_CONTEXT_MAX_BYTES,
	BROWSER_ELEMENT_SELECTION_SCHEMA,
	BROWSER_ELEMENT_SELECTION_VERSION,
	BROWSER_ELEMENT_SURROUNDING_TEXT_MAX_CHARS,
	type BrowserElementLiveEdit,
	BrowserElementLiveEditSchema,
	type BrowserElementLiveEditStyleKey,
	type BrowserElementSelectionContext,
	BrowserElementSelectionContextSchema,
	type BrowserElementSelectionPayload,
	BrowserElementSelectionPayloadSchema,
	readBrowserElementSelectionContext,
	readBrowserElementSelectionPayload,
} from "../features/browser-tab/element-selection-capsule.js";
export {
	DOCUMENT_ARTIFACT_KIND,
	type DocumentExportResult,
	type DocumentProcessingRequest,
} from "../features/documents/contracts.js";
export type {
	FileOrganizeItemResult,
	FileOrganizeItemStatus,
	FileOrganizeOperation,
	FileOrganizeOutcome,
	FileOrganizePlan,
} from "../features/file-organize/contracts.js";
export { readFileOrganizePlan } from "../features/file-organize/contracts.js";
export {
	CODING_AGENT_FILE_ORGANIZE_EXTENSION_ID,
	CODING_AGENT_FILE_ORGANIZE_FUNCTION,
	type CodingAgentFileOrganizeFunctionRequest,
} from "../features/file-organize/organize-files-tool.js";
export {
	CODING_AGENT_PLAN_MODE_EXTENSION_ID,
	CODING_AGENT_PLAN_REVIEW_FUNCTION,
	type CodingAgentPlanReviewRequest,
	type CodingAgentPlanReviewResult,
} from "../features/plan-mode/contracts.js";
export {
	formatResearchSourcesManifest,
	parseResearchSourcesManifest,
	RESEARCH_SOURCES_FENCE,
	type ResearchSourceEntry,
	type ResearchSourcesManifest,
	ResearchSourcesManifestSchema,
} from "../features/research/research-manifest.js";
// 无人值守授权分档是纯策略常量与纯函数。刻意从 features/scheduled-tasks 的**具体模块**
// 导出，而不是那条 barrel：barrel 会牵出 automation-package 的 canonical（node:crypto），
// Renderer 一旦 import 就会在浏览器里抛「node:crypto has been externalized」并让
// `build:renderer` 直接失败（见 BUG-0024）。Renderer 只能从本入口取这些纯符号。
export {
	enableAllUnattendedPermissionTiers,
	UNATTENDED_PERMISSION_TIER_KEYS,
	type UnattendedPermissionTierKey,
	type UnattendedPermissionTiers,
} from "../features/scheduled-tasks/unattended-permission-tiers.js";
