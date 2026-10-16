// Modified by The Open Forge contributors.
import type { WebContents } from "electron";
import type { ActionApprovalBroker } from "../app-actions/approval-broker.js";
import { getMessageAnnotationService } from "../message-annotations/host.js";
import { registerNotificationIpc } from "../notifications/index.js";
import type { PluginActionService } from "../plugins/plugin-action-service.js";
import { registerAbilitiesIpc } from "./abilities.js";
import { registerActionApprovalIpc } from "./action-approval.js";
import { registerAgentTeamsIpc } from "./agent-teams.js";
import { registerAppMonitorIpc } from "./app-monitor.js";
import { registerAppshotIpc } from "./appshot.js";
import { registerArchivedSessionsIpc } from "./archived-sessions.js";
import { registerBrowserTabIpc } from "./browser-tab.js";
import { registerBrowserViewIpc } from "./browser-view.js";
import { registerCanvasIpc } from "./canvas.js";
import { registerClipboardIpc } from "./clipboard.js";
import { registerConversationTagsIpc } from "./conversation-tags.js";
import { registerDebugIpc } from "./debug.js";
import { registerDiagnosticsIpc } from "./diagnostics.js";
import { registerDialogIpc } from "./dialog.js";
import { registerDownloadsIpc } from "./downloads.js";
import { registerFileTransferIpc } from "./file-transfer.js";
import { registerFsIpc } from "./fs.js";
import { registerImIpc } from "./im.js";
import { registerMarkdownIpc } from "./markdown.js";
import { registerMediaIpc } from "./media.js";
import { registerMessageAnnotationsIpc } from "./message-annotations.js";
import { registerOnboardingIpc } from "./onboarding.js";
import { registerPermissionsIpc } from "./permissions.js";
import { registerPetIpc } from "./pet.js";
import { registerPluginCapabilitiesIpc } from "./plugin-capabilities.js";
import { registerPluginMediaProvidersIpc } from "./plugin-media-providers.js";
import { registerPluginOcrProvidersIpc } from "./plugin-ocr-providers.js";
import { registerPluginsIpc } from "./plugins.js";
import { registerProjectExportIpc } from "./project-export.js";
import { registerProjectsIpc } from "./projects.js";
import { registerQuickPanelIpc } from "./quickpanel.js";
import { registerRemotePairingIpc } from "./remote-pairing.js";
import { registerReviewChangesIpc } from "./review-changes.js";
import { registerRuntimeConfigurationIpc } from "./runtime-configuration.js";
import { registerRuntimesIpc } from "./runtimes.js";
import { registerSessionIpc } from "./session.js";
import { registerSessionArchiveIpc } from "./session-archive.js";
import { registerSettingsIpc } from "./settings.js";
import { registerSkillsIpc } from "./skills.js";
import { registerSpeechInputIpc } from "./speech-input.js";
import { registerSshIpc } from "./ssh.js";
import { registerSshTransfersIpc } from "./ssh-transfers.js";
import { registerTaskIpc } from "./task.js";
import { registerTerminalIpc } from "./terminal.js";
import { registerThemesIpc } from "./themes.js";
import { registerUpdaterIpc } from "./updater.js";
import { registerWebhookIpc } from "./webhook.js";
import { registerWeKnoraIpc } from "./weknora.js";

interface IpcTeardown {
	teardownAbilities: () => void;
	teardownAgentTeams: () => void;
	teardownActionApproval: () => void;
	teardownAppMonitor: () => void;
	teardownSession: () => void;
	teardownSessionArchive: () => void;
	teardownMessageAnnotations: () => void;
	teardownMarkdown: () => void;
	teardownSettings: () => void;
	teardownUpdater: () => void;
	teardownSkills: () => void;
	teardownSpeechInput: () => void;
	teardownThemes: () => void;
	teardownDialog: () => void;
	teardownClipboard: () => void;
	teardownFs: () => void;
	teardownFileTransfer: () => void;
	teardownDownloads: () => void;
	teardownIm: () => void;
	teardownMedia: () => void;
	teardownDebug: () => void;
	teardownProjectExport: () => void;
	teardownProjects: () => void;
	teardownSsh: () => void;
	teardownSshTransfers: () => void;
	teardownWebhook: () => void;
	teardownRuntimes: () => void;
	teardownRuntimeConfiguration: () => void;
	teardownPermissions: () => void;
	teardownPlugins: () => void;
	teardownPluginCapabilities: () => void;
	teardownPluginMediaProviders: () => void;
	teardownPluginOcrProviders: () => void;
	teardownNotifications: () => void;
	teardownPet: () => void;
	teardownTerminal: () => void;
	teardownConversationTags: () => void;
	teardownArchivedSessions: () => void;
	teardownQuickPanel: () => void;
	teardownTask: () => void;
	teardownCanvas: () => void;
	teardownBrowserTab: () => void;
	teardownBrowserView: () => void;
	teardownAppshot: () => void;
	teardownDiagnostics: () => void;
	teardownOnboarding: () => void;
	teardownRemotePairing: () => void;
	teardownReviewChanges: () => void;
	teardownWeKnora: () => void;
}

export function registerAllIpc(
	webContents: WebContents,
	options: {
		actionApprovalBroker: ActionApprovalBroker;
		pluginActionService: PluginActionService;
		remotePairingService: import("../remote-control/desktop-remote-pairing-service.js").DesktopRemotePairingService;
	},
): IpcTeardown {
	return {
		teardownAbilities: registerAbilitiesIpc(),
		teardownAgentTeams: registerAgentTeamsIpc(),
		teardownActionApproval: registerActionApprovalIpc(options.actionApprovalBroker),
		teardownAppMonitor: registerAppMonitorIpc(),
		teardownSession: registerSessionIpc(webContents),
		teardownMessageAnnotations: registerMessageAnnotationsIpc(webContents, getMessageAnnotationService()),
		teardownMarkdown: registerMarkdownIpc(webContents),
		teardownSessionArchive: (() => {
			registerSessionArchiveIpc();
			return () => undefined;
		})(),
		teardownSettings: registerSettingsIpc(),
		teardownUpdater: registerUpdaterIpc(),
		teardownSkills: registerSkillsIpc(),
		teardownSpeechInput: registerSpeechInputIpc(webContents),
		teardownThemes: registerThemesIpc(),
		teardownDialog: registerDialogIpc(),
		teardownClipboard: registerClipboardIpc(),
		teardownFs: registerFsIpc(),
		teardownFileTransfer: registerFileTransferIpc(),
		teardownDownloads: registerDownloadsIpc(webContents),
		teardownIm: registerImIpc(webContents),
		teardownMedia: registerMediaIpc(),
		teardownDebug: registerDebugIpc(),
		teardownProjectExport: registerProjectExportIpc(),
		teardownProjects: registerProjectsIpc(),
		teardownSsh: registerSshIpc(),
		teardownSshTransfers: registerSshTransfersIpc(webContents),
		teardownWebhook: registerWebhookIpc(),
		teardownRuntimes: registerRuntimesIpc(),
		teardownRuntimeConfiguration: registerRuntimeConfigurationIpc(webContents),
		teardownPermissions: registerPermissionsIpc(),
		teardownPlugins: registerPluginsIpc(options.pluginActionService),
		teardownPluginCapabilities: registerPluginCapabilitiesIpc(),
		teardownPluginMediaProviders: registerPluginMediaProvidersIpc(),
		teardownPluginOcrProviders: registerPluginOcrProvidersIpc(),
		teardownNotifications: registerNotificationIpc(webContents),
		teardownPet: registerPetIpc(),
		teardownTerminal: registerTerminalIpc(),
		teardownConversationTags: registerConversationTagsIpc(webContents),
		teardownArchivedSessions: registerArchivedSessionsIpc(webContents),
		teardownQuickPanel: registerQuickPanelIpc(),
		teardownTask: registerTaskIpc(webContents),
		teardownCanvas: registerCanvasIpc(),
		teardownBrowserTab: registerBrowserTabIpc(),
		teardownBrowserView: registerBrowserViewIpc(),
		teardownAppshot: registerAppshotIpc(),
		teardownDiagnostics: registerDiagnosticsIpc(),
		teardownOnboarding: registerOnboardingIpc(),
		teardownRemotePairing: registerRemotePairingIpc(options.remotePairingService),
		teardownReviewChanges: registerReviewChangesIpc(),
		teardownWeKnora: registerWeKnoraIpc(webContents),
	};
}

export function teardownAllIpc(teardown: IpcTeardown): void {
	teardown.teardownAbilities();
	teardown.teardownAgentTeams();
	teardown.teardownActionApproval();
	teardown.teardownAppMonitor();
	teardown.teardownSession();
	teardown.teardownMessageAnnotations();
	teardown.teardownMarkdown();
	teardown.teardownSessionArchive();
	teardown.teardownSettings();
	teardown.teardownUpdater();
	teardown.teardownSkills();
	teardown.teardownSpeechInput();
	teardown.teardownThemes();
	teardown.teardownDialog();
	teardown.teardownClipboard();
	teardown.teardownFs();
	teardown.teardownFileTransfer();
	teardown.teardownDownloads();
	teardown.teardownIm();
	teardown.teardownMedia();
	teardown.teardownDebug();
	teardown.teardownProjectExport();
	teardown.teardownProjects();
	teardown.teardownSsh();
	teardown.teardownSshTransfers();
	teardown.teardownWebhook();
	teardown.teardownRuntimes();
	teardown.teardownRuntimeConfiguration();
	teardown.teardownPermissions();
	teardown.teardownPlugins();
	teardown.teardownPluginCapabilities();
	teardown.teardownPluginMediaProviders();
	teardown.teardownPluginOcrProviders();
	teardown.teardownNotifications();
	teardown.teardownPet();
	teardown.teardownTerminal();
	teardown.teardownConversationTags();
	teardown.teardownArchivedSessions();
	teardown.teardownQuickPanel();
	teardown.teardownTask();
	teardown.teardownCanvas();
	teardown.teardownBrowserTab();
	teardown.teardownBrowserView();
	teardown.teardownAppshot();
	teardown.teardownDiagnostics();
	teardown.teardownOnboarding();
	teardown.teardownRemotePairing();
	teardown.teardownReviewChanges();
	teardown.teardownWeKnora();
}

export { registerBatchTasksIpc } from "./batch-tasks.js";
export { registerSchedulerIpc } from "./scheduler.js";

export type { IpcTeardown };
