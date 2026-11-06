// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SETTINGS_HOST_METHODS } from "@vetta/host-protocol";
import { getModelTransport, setModelTransport } from "../agent-settings/model-transport-settings.js";
import {
	getSessionInterruptContinue,
	setSessionInterruptContinue,
} from "../agent-settings/session-interrupt-continue-settings.js";
import { DEFAULT_SERVER_URL, DEFAULT_SITE_URL } from "../constants.js";

/** 设置领域的 Host 实现（TASK-0453）：参数已由合同校验，这里只调用既有业务服务。 */
export const settingsHostDomain: HostDomainImplementation<typeof SETTINGS_HOST_METHODS> = {
	getServerUrl: () => DEFAULT_SERVER_URL,
	getSiteUrl: () => DEFAULT_SITE_URL,
	getModelTransport: () => getModelTransport(),
	setModelTransport: ({ transport }) => setModelTransport(transport),
	getSessionInterruptContinue: () => getSessionInterruptContinue(),
	setSessionInterruptContinue: ({ mode }) => {
		setSessionInterruptContinue(mode);
		return null;
	},
};
