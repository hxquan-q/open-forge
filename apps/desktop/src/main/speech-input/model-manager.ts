// Modified by The Open Forge contributors.
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { SpeechInputStatus } from "../../preload/api-types/speech-input.js";
import { type SpeechModelDefinition, WINDOWS_ZIPFORMER_MODEL } from "./model-catalog.js";
import { downloadSpeechModel, type FetchLike } from "./model-downloader.js";

export interface SpeechModelManagerOptions {
	platform?: NodeJS.Platform;
	arch?: string;
	enabled?: boolean;
	/** 安装包内置模型根目录（可能不存在——默认不再打进包里）。 */
	bundleRoot?: string;
	/** 按需下载的落地根目录（可写用户目录）。 */
	userRoot: string;
	model?: SpeechModelDefinition;
	fetchImpl?: FetchLike;
}

/**
 * 语音模型状态与按需下载。安装包默认不带模型：首次使用语音输入时按
 * model-manifest.json 下载到 userRoot 并校验 sha256；bundleRoot 仅作为
 * 只读兜底（离线打包渠道仍可选内置）。下载中的状态经 getStatus 以
 * `downloading` + `downloadProgress` 暴露给 IPC 事件链。
 */
export class SpeechModelManager {
	private readonly platform: NodeJS.Platform;
	private readonly arch: string;
	private readonly enabled: boolean;
	private readonly model: SpeechModelDefinition;
	private readonly bundleRoot?: string;
	private readonly userRoot: string;
	private readonly fetchImpl?: FetchLike;
	private resolvedDir: string | null = null;
	private downloadTask: Promise<void> | null = null;
	private downloadProgress = 0;

	constructor(options: SpeechModelManagerOptions) {
		this.platform = options.platform ?? process.platform;
		this.arch = options.arch ?? process.arch;
		this.enabled = options.enabled ?? true;
		this.bundleRoot = options.bundleRoot;
		this.userRoot = options.userRoot;
		this.model = options.model ?? WINDOWS_ZIPFORMER_MODEL;
		this.fetchImpl = options.fetchImpl;
	}

	get supported(): boolean {
		return this.enabled && this.platform === "win32" && this.arch === "x64";
	}

	get modelDirectory(): string {
		return this.resolvedDir ?? join(this.userRoot, this.model.id);
	}

	/** 返回完整模型所在目录；bundleRoot 优先（只读内置），其次用户目录。 */
	private async findCompleteModelDir(): Promise<string | null> {
		for (const root of [this.bundleRoot, this.userRoot]) {
			if (!root) continue;
			const dir = join(root, this.model.id);
			if (await this.isComplete(dir)) {
				this.resolvedDir = dir;
				return dir;
			}
		}
		return null;
	}

	private async isComplete(dir: string): Promise<boolean> {
		try {
			const fileStats = await Promise.all(
				this.model.files.map(async (file) => ({ file, info: await stat(join(dir, file.name)) })),
			);
			return fileStats.every(({ file, info }) => info.isFile() && info.size === file.size);
		} catch {
			return false;
		}
	}

	/**
	 * 确保模型就绪：缺文件或损坏时按 manifest 下载/补齐到 userRoot。
	 * 并发调用共享同一任务；失败的任务清场后可重试。
	 */
	async ensureModel(onProgress?: (completedBytes: number, totalBytes: number) => void): Promise<void> {
		if (!this.supported) throw new Error("Speech input is not supported on this platform");
		this.downloadTask ??= (async () => {
			try {
				const dir = join(this.userRoot, this.model.id);
				await downloadSpeechModel(this.model, dir, {
					fetchImpl: this.fetchImpl,
					onProgress: (done, total) => {
						this.downloadProgress = total > 0 ? done / total : 0;
						onProgress?.(done, total);
					},
				});
				this.resolvedDir = dir;
			} finally {
				this.downloadTask = null;
				this.downloadProgress = 0;
			}
		})();
		return this.downloadTask;
	}

	async getStatus(): Promise<SpeechInputStatus> {
		if (!this.enabled) return this.status("unsupported");
		if (!this.supported) return this.status("unsupported", "unsupported-platform");
		if (this.downloadTask) {
			return { ...this.status("downloading"), downloadProgress: this.downloadProgress };
		}
		if (await this.findCompleteModelDir()) return this.status("ready");

		const dir = join(this.userRoot, this.model.id);
		const hasFiles = existsSync(dir);
		return this.status("not-downloaded", hasFiles ? "model-invalid" : "model-missing");
	}

	private status(phase: SpeechInputStatus["phase"], errorCode?: SpeechInputStatus["errorCode"]): SpeechInputStatus {
		return {
			supported: this.supported,
			phase,
			modelId: this.model.id,
			...(errorCode ? { errorCode } : {}),
		};
	}
}
