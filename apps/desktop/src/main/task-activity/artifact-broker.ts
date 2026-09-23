// Copyright The Open Forge contributors.
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	CodingAgentArtifactFunctionRequest,
	CodingAgentArtifactFunctionResult,
} from "@vetta/coding-agent/function-extensions";
import { getAppLogger } from "../logger.js";
import { getSharedRuntime } from "../runtime.js";
import { desktopTaskActivityService } from "./task-activity-service.js";

const log = getAppLogger("artifact-broker");

/** 文档处理暂存目录固定在会话目录旁：artifact 文件与 descriptor 事件都落在这里。 */
function artifactsRoot(sessionId: string): string | undefined {
	const sessionPath = getSharedRuntime().getSessionPath(sessionId);
	if (!sessionPath) return undefined;
	return join(dirname(sessionPath), "artifacts");
}

/** 文件名只取路径末段，杜绝 `..` 或绝对路径注入到暂存目录外。 */
function baseName(input: string): string {
	const normalized = input.split(/[/\\]+/).pop() ?? "";
	return normalized.trim();
}

async function uniqueTarget(dir: string, stem: string, ext: string): Promise<string> {
	let candidate = join(dir, `${stem}${ext}`);
	for (
		let index = 2;
		await stat(candidate).then(
			() => true,
			() => false,
		);
		index += 1
	) {
		candidate = join(dir, `${stem}-${index}${ext}`);
	}
	return candidate;
}

/** `artifact` 工具的 Desktop 宿主实现：create 落暂存文件，attach 走 Task 控制面。 */
export class DesktopArtifactBroker {
	readonly handle = async (
		request: CodingAgentArtifactFunctionRequest,
	): Promise<CodingAgentArtifactFunctionResult> => {
		try {
			return await this.dispatch(request);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.warn(`artifact tool failed: ${message}`);
			return { ok: false, code: "invalid_input", message, action: request.input.action };
		}
	};

	private async dispatch(request: CodingAgentArtifactFunctionRequest): Promise<CodingAgentArtifactFunctionResult> {
		const { input } = request;
		if (input.action === "create") return this.create(request);
		if (input.action === "attach_to_task") return this.attach(request);
		return this.unsupported(input);
	}

	private unsupported(input: CodingAgentArtifactFunctionRequest["input"]): CodingAgentArtifactFunctionResult {
		return {
			ok: false,
			code: "unimplemented",
			message: `artifact ${input.action} is not available in this host yet`,
			action: input.action,
			...(input.action === "get" || input.action === "update" ? { artifactId: input.artifactId } : {}),
		};
	}

	private async create(request: CodingAgentArtifactFunctionRequest): Promise<CodingAgentArtifactFunctionResult> {
		const { input } = request;
		if (input.action !== "create") return this.unsupported(input);
		const root = artifactsRoot(request.sessionId);
		if (!root) {
			return {
				ok: false,
				code: "invalid_input",
				message: "session is not open; cannot stage artifact files",
				action: "create",
			};
		}
		const { title, kind, content, contentType } = input;
		const nameSource = baseName(input.filename ?? title);
		if (!nameSource) {
			return {
				ok: false,
				code: "invalid_input",
				message: "artifact needs a title or filename to derive a file name",
				action: "create",
			};
		}
		const extIndex = nameSource.lastIndexOf(".");
		const stem = extIndex > 0 ? nameSource.slice(0, extIndex) : nameSource;
		const ext = extIndex > 0 ? nameSource.slice(extIndex) : ".md";
		await mkdir(root, { recursive: true });
		const target = await uniqueTarget(root, stem, ext);
		await writeFile(target, content, "utf8");
		return {
			ok: true,
			action: "create",
			artifactId: `artifact-${crypto.randomUUID()}`,
			version: 1,
			title,
			kind,
			uri: target,
			...(contentType ? { contentType } : {}),
		};
	}

	private async attach(request: CodingAgentArtifactFunctionRequest): Promise<CodingAgentArtifactFunctionResult> {
		const { input } = request;
		if (input.action !== "attach_to_task") return this.unsupported(input);
		// attach_to_task 只带 artifactId：从最新投影找回 descriptor，再委托 Task 控制面
		// 挂到当前活跃任务，让模型拿到稳定回填供后续 update 引用。
		const descriptor = desktopTaskActivityService
			.getState(request.sessionId)
			.artifacts.find((artifact) => artifact.artifactId === input.artifactId);
		if (!descriptor) {
			return {
				ok: false,
				code: "invalid_input",
				message: `artifact ${input.artifactId} not found in this session`,
				action: "attach_to_task",
				artifactId: input.artifactId,
			};
		}
		const outcome = await desktopTaskActivityService.attachToActiveTask(request.sessionId, {
			kind: descriptor.kind,
			title: descriptor.title,
			uri: descriptor.uri ?? "",
			...(descriptor.contentType ? { contentType: descriptor.contentType } : {}),
		});
		if (!outcome.ok) {
			return {
				ok: false,
				code: outcome.code === "task_not_found" ? "no_active_task" : "invalid_input",
				message: outcome.message,
				action: "attach_to_task",
				artifactId: input.artifactId,
			};
		}
		const attached = [...outcome.state.artifacts]
			.reverse()
			.find((artifact) => artifact.uri === descriptor.uri && artifact.title === descriptor.title);
		return {
			ok: true,
			action: "attach_to_task",
			artifactId: attached?.artifactId ?? descriptor.artifactId,
			version: attached?.version ?? descriptor.version,
			title: attached?.title ?? descriptor.title,
			kind: attached?.kind ?? descriptor.kind,
			...(attached?.uri ? { uri: attached.uri } : {}),
			...(attached?.contentType ? { contentType: attached.contentType } : {}),
		};
	}
}

const sharedArtifactBroker = new DesktopArtifactBroker();

export function getDesktopArtifactBroker(): DesktopArtifactBroker {
	return sharedArtifactBroker;
}
