// Copyright The Open Forge contributors.

import { DEFAULT_PERSONA_ID, PERSONAS } from "@vetta/coding-agent/profile";
import type { HostDomainImplementation, SESSION_DEFAULTS_HOST_METHODS } from "@vetta/host-protocol";
import { HOST_PROTOCOL_ERROR_CODES, HostProtocolError } from "@vetta/host-protocol";
import { readAgentSettingsDocument, updateAgentSettingsDocument } from "../agent-settings/settings-document-store.js";

interface PersonalizationSettings {
	personaId?: string;
	customPrompt?: string;
}

/** 会话默认项/个性化子域的 Host 实现（TASK-0466）：与旧 handler 同口径，只换合同入口。 */
export const sessionDefaultsHostDomain: HostDomainImplementation<typeof SESSION_DEFAULTS_HOST_METHODS> = {
	getThinkingLevel: () => {
		const level = readAgentSettingsDocument().defaultThinkingLevel;
		return typeof level === "string" ? level : "off";
	},
	getPersonas: () => PERSONAS.map((p) => ({ id: p.id, label: p.label, description: p.description })),
	getPersonalization: () => {
		const stored = readAgentSettingsDocument().personalization as PersonalizationSettings | undefined;
		return {
			personaId: stored?.personaId ?? DEFAULT_PERSONA_ID,
			customPrompt: stored?.customPrompt ?? "",
		};
	},
	setPersonalization: ({ personaId, customPrompt }) => {
		// personaId 必须在注册表内（旧 handler 同口径）；合同 Schema 已钉形状，这里钉成员关系。
		if (!PERSONAS.some((p) => p.id === personaId)) {
			throw new HostProtocolError(HOST_PROTOCOL_ERROR_CODES.INVALID_PARAMS, "Invalid personaId");
		}
		updateAgentSettingsDocument((settings) => {
			settings.personalization = { personaId, customPrompt };
		});
		return null;
	},
};
