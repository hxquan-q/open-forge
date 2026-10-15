// Modified by The Open Forge contributors.
import type {
	DefaultExecutionModeSettingInput,
	GeneralExecutionMode,
	GeneralSettingsSnapshot,
	NotificationsSettingInput,
	SandboxCapabilitySnapshot,
	WorkspaceSettingInput,
} from "@vetta-org/capability-sdk";
import type { DesktopConfig, DesktopConfigUpdater } from "../config/desktop-config-store.js";

export interface GeneralSettingsServiceOptions {
	readonly readConfig: () => Promise<DesktopConfig>;
	readonly updateConfig: (update: DesktopConfigUpdater) => Promise<DesktopConfig>;
	readonly allowWorkspaceRoot: (path: string) => void;
	readonly getSandbox: () => SandboxCapabilitySnapshot;
}

function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export class GeneralSettingsService {
	constructor(private readonly options: GeneralSettingsServiceOptions) {}

	async getSettings(): Promise<GeneralSettingsSnapshot> {
		const config = await this.options.readConfig();
		return {
			workspacePath: config.workspacePath,
			defaultExecutionMode: config.defaultExecutionMode,
			notificationsEnabled: config.notificationsEnabled !== false,
			debugMode: Boolean(config.debugMode),
			sandbox: this.options.getSandbox(),
		};
	}

	async setNotifications(enabled: boolean): Promise<NotificationsSettingInput> {
		await this.updateConfig({ notificationsEnabled: enabled });
		return { enabled };
	}

	async setDefaultExecutionMode(mode: GeneralExecutionMode): Promise<DefaultExecutionModeSettingInput> {
		await this.updateConfig({ defaultExecutionMode: mode });
		return { mode };
	}

	async setWorkspace(path: string): Promise<WorkspaceSettingInput> {
		const normalizedPath = path.trim();
		if (!isAbsolutePath(normalizedPath)) throw new Error("workspace path must be absolute");
		this.options.allowWorkspaceRoot(normalizedPath);
		await this.updateConfig({ workspacePath: normalizedPath });
		return { path: normalizedPath };
	}

	private async updateConfig(patch: Partial<DesktopConfig>): Promise<void> {
		await this.options.updateConfig((current) => ({ ...current, ...patch }));
	}
}
