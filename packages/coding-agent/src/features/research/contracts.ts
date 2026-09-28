// Copyright The Open Forge contributors.
import type { LocalSourceScanResult } from "@vetta/runtime-knowledge";

/**
 * 本地研究的宿主能力 Port：检索范围枚举的实现归 Knowledge Runtime，
 * Coding Agent 只拥有 Tool/Prompt/投影策略。root 由调用方显式给出
 * （用户选定的资料集路径），实现不得回落默认 knowledge home。
 */
export interface CodingAgentResearchScopeOperations {
	scanSources(root: string): Promise<LocalSourceScanResult>;
}
