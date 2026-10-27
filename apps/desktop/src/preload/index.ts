// Modified by The Open Forge contributors.
import { contextBridge, ipcRenderer, webUtils } from "electron";
import "./telemetry.js";
import type { DesktopApi } from "./api.js";
import { createAbilitiesApi } from "./apis/abilities.js";
import { createActionApprovalApi } from "./apis/action-approval.js";
import { createAgentTeamsApi } from "./apis/agent-teams.js";
import { createAppLifecycleApi } from "./apis/app-lifecycle.js";
import { createAppMonitorApi } from "./apis/app-monitor.js";
import { createAppshotApi } from "./apis/appshot.js";
import { createArchivedSessionsApi } from "./apis/archived-sessions.js";
import { createBatchTasksApi } from "./apis/batch-tasks.js";
import { createBrowserTabApi } from "./apis/browser-tab.js";
import { createBrowserViewApi } from "./apis/browser-view.js";
import { createCanvasApi } from "./apis/canvas.js";
import { createConversationTagsApi } from "./apis/conversation-tags.js";
import { createDownloadsApi } from "./apis/downloads.js";
import { createGitApi } from "./apis/git.js";
import { createI18nApi } from "./apis/i18n.js";
import { createImApi } from "./apis/im.js";
import { createMarkdownApi } from "./apis/markdown.js";
import { createMemoryControlApi } from "./apis/memory.js";
import { createMessageAnnotationsApi } from "./apis/message-annotations.js";
import { createNotificationApi } from "./apis/notification.js";
import { createPetApi } from "./apis/pet.js";
import { createPluginsApi } from "./apis/plugins.js";
import { createProjectApi } from "./apis/project.js";
import { createQuickPanelApi } from "./apis/quick-panel.js";
import { createRemotePairingApi } from "./apis/remote-pairing.js";
import { createReviewChangesApi } from "./apis/review-changes.js";
import { createRuntimeConfigurationApi } from "./apis/runtime-configuration.js";
import { createSchedulerApi } from "./apis/scheduler.js";
import { createSessionApi } from "./apis/session.js";
import { createSessionArchiveApi } from "./apis/session-archive.js";
import { createSpeechInputApi } from "./apis/speech-input.js";
import { createSshApi } from "./apis/ssh.js";
import { createSystemApi } from "./apis/system.js";
import { createTaskApi } from "./apis/task.js";
import { createTelemetryApi } from "./apis/telemetry.js";
import { createTerminalApi } from "./apis/terminal.js";
import { createThemesApi } from "./apis/themes.js";
import { createWebhookApi } from "./apis/webhook.js";
import { createWeKnoraApi } from "./apis/weknora.js";
import { createHostAccessGate } from "./host-access.js";
import { createUserActivityReporter, USER_ACTIVITY_CHANNEL } from "./user-activity.js";

const reportUserActivity = createUserActivityReporter(() => ipcRenderer.send(USER_ACTIVITY_CHANNEL)).report;

for (const eventName of ["keydown", "mousedown", "mousemove", "touchstart", "wheel"] as const) {
	window.addEventListener(eventName, reportUserActivity, { capture: true, passive: true });
}

const rawApi: Omit<DesktopApi, "hostAccess"> = {
	...createAbilitiesApi(ipcRenderer),
	...createGitApi(ipcRenderer),
	...createAgentTeamsApi(ipcRenderer),
	...createActionApprovalApi(ipcRenderer),
	...createAppLifecycleApi(ipcRenderer),
	...createAppMonitorApi(ipcRenderer),
	...createSessionApi(ipcRenderer),
	...createSessionArchiveApi(ipcRenderer),
	...createSpeechInputApi(ipcRenderer),
	...createImApi(ipcRenderer),
	...createDownloadsApi(ipcRenderer),
	...createBatchTasksApi(ipcRenderer),
	...createCanvasApi(ipcRenderer),
	...createBrowserTabApi(ipcRenderer),
	...createBrowserViewApi(ipcRenderer),
	...createSchedulerApi(ipcRenderer),
	...createWebhookApi(ipcRenderer),
	...createWeKnoraApi(ipcRenderer),
	...createMessageAnnotationsApi(ipcRenderer),
	...createMarkdownApi(ipcRenderer),
	...createNotificationApi(ipcRenderer),
	...createPluginsApi(ipcRenderer, webUtils),
	...createThemesApi(ipcRenderer),
	...createPetApi(ipcRenderer),
	...createConversationTagsApi(ipcRenderer),
	...createMemoryControlApi(ipcRenderer),
	...createArchivedSessionsApi(ipcRenderer),
	...createReviewChangesApi(ipcRenderer),
	...createProjectApi(ipcRenderer),
	...createSshApi(ipcRenderer),
	...createTerminalApi(ipcRenderer),
	...createQuickPanelApi(ipcRenderer),
	...createTaskApi(ipcRenderer),
	...createRuntimeConfigurationApi(ipcRenderer),
	remotePairing: createRemotePairingApi(ipcRenderer),
	...createAppshotApi(ipcRenderer),
	...createI18nApi(ipcRenderer),
	...createTelemetryApi(ipcRenderer),
	...createSystemApi(ipcRenderer, webUtils),
};

const hostGate = createHostAccessGate(rawApi);
const api: DesktopApi = {
	hostAccess: hostGate.hostAccess,
	...hostGate.api,
};

contextBridge.exposeInMainWorld("vetta", api);
