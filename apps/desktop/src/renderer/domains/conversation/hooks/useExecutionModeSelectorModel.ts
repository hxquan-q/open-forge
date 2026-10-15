import {
	activeSessionAtom,
	isStreamingAtom,
	type SessionExecutionMode,
	sessionExecutionModeAtom,
} from "@shared/store/atoms";
import { useSearch } from "@tanstack/react-router";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ExecutionModeOptionModel,
	ExecutionModeSandboxNoticeModel,
	ExecutionModeSelectorViewProps,
} from "../components/execution-mode-selector/types";

const MODE_OPTIONS: Array<{
	mode: SessionExecutionMode;
	icon: string;
}> = [
	{ mode: "sandbox", icon: "icon-[solar--shield-linear]" },
	{ mode: "full-access", icon: "icon-[solar--shield-cross-linear]" },
];

/**
 * `capability.reason` → 面向用户的原因文案。主进程按探测失败的具体环节给码，界面据此说清
 * 「为什么没有沙盒」，而不是把 `binary_not_found` 这样的内部码甩给用户。文案只陈述事实，
 * 不承诺用户可以自行恢复：真实原因通常是安装包本身没有内置沙盒组件（BUG-0022）。
 */
const SANDBOX_UNAVAILABLE_REASON_KEYS = {
	binary_not_found: "executionModeSelector.sandboxUnavailable.reason.notBundled",
	binary_not_executable: "executionModeSelector.sandboxUnavailable.reason.notExecutable",
	userns_unavailable: "executionModeSelector.sandboxUnavailable.reason.namespacesUnavailable",
	probe_command_failed: "executionModeSelector.sandboxUnavailable.reason.probeFailed",
	write_root_not_enforced: "executionModeSelector.sandboxUnavailable.reason.probeFailed",
	temp_root_not_isolated: "executionModeSelector.sandboxUnavailable.reason.probeFailed",
	deny_write_not_enforced: "executionModeSelector.sandboxUnavailable.reason.probeFailed",
	limited_host_capabilities: "executionModeSelector.sandboxUnavailable.reason.hostLimited",
	unsupported_host_option: "executionModeSelector.sandboxUnavailable.reason.hostTooOld",
	unsupported_platform: "executionModeSelector.sandboxUnavailable.reason.unsupportedPlatform",
} as const;

type SandboxUnavailableReasonCode = keyof typeof SANDBOX_UNAVAILABLE_REASON_KEYS;
type SandboxUnavailableReasonKey =
	| (typeof SANDBOX_UNAVAILABLE_REASON_KEYS)[SandboxUnavailableReasonCode]
	| "executionModeSelector.sandboxUnavailable.reason.unknown";

function sandboxUnavailableReasonKey(reason: string): SandboxUnavailableReasonKey {
	return reason in SANDBOX_UNAVAILABLE_REASON_KEYS
		? SANDBOX_UNAVAILABLE_REASON_KEYS[reason as SandboxUnavailableReasonCode]
		: "executionModeSelector.sandboxUnavailable.reason.unknown";
}

export interface ExecutionModeSelectorBinding {
	/**
	 * 当前会话或待建会话所在的项目。远程项目（`ssh://…`）没有沙箱——沙箱只能约束本机进程，
	 * 主进程会把这类会话固定为完全访问；选择器据此如实显示并禁用沙箱选项，而不是让用户
	 * 选了沙箱再吃一条报错。
	 *
	 * 同理，本机安装若探测不到沙盒能力（BUG-0022：构建产物没内置沙盒 host），选择器除了
	 * 置灰选项，还要把原因与「当前实际按哪种模式执行」写清楚，否则用户会把置灰当成已隔离。
	 */
	readonly cwd?: string | null;
	readonly mode: SessionExecutionMode;
	readonly isStreaming: boolean;
	readonly onSelectMode: (mode: SessionExecutionMode) => Promise<void> | void;
}

export function useDefaultExecutionModeSelectorModel(): ExecutionModeSelectorViewProps {
	const activeSession = useAtomValue(activeSessionAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [mode, setMode] = useAtom(sessionExecutionModeAtom);
	const onSelectMode = useCallback(
		async (nextMode: SessionExecutionMode) => {
			const previousMode = mode;
			setMode(nextMode);
			localStorage.setItem("vetta-session-execution-mode", nextMode);
			if (!activeSession) return;
			try {
				await window.vetta.session.setExecutionMode(activeSession.runtimeId, nextMode);
			} catch (error) {
				setMode(previousMode);
				localStorage.setItem("vetta-session-execution-mode", previousMode);
				console.error("[ExecutionModeSelector] failed to switch execution mode:", error);
			}
		},
		[activeSession, mode, setMode],
	);
	const search = useSearch({ strict: false }) as { cwd?: string };
	const cwd = activeSession?.cwd ?? (search.cwd ? decodeURIComponent(search.cwd) : null);
	return useExecutionModeSelectorModel({ cwd, mode, isStreaming, onSelectMode });
}

export function useExecutionModeSelectorModel(binding: ExecutionModeSelectorBinding): ExecutionModeSelectorViewProps {
	const { t } = useTranslation("chat");
	const [open, setOpen] = useState(false);
	const [isSwitching, setIsSwitching] = useState(false);
	const [sandboxCapabilityGap, setSandboxCapabilityGap] = useState<{ reason: string; details?: string } | null>(null);
	const disabled = binding.isStreaming || isSwitching;
	const isRemoteProject = typeof binding.cwd === "string" && isSshProjectUri(binding.cwd);
	const effectiveMode: SessionExecutionMode = isRemoteProject ? "full-access" : binding.mode;

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				setSandboxCapabilityGap({ reason: capability.reason ?? "unknown_error", details: capability.details });
				return;
			}
			setSandboxCapabilityGap(null);
		});
	}, []);

	const sandboxBlockedReason = isRemoteProject
		? t("executionModeSelector.sandboxUnavailableRemote")
		: sandboxCapabilityGap
			? t(sandboxUnavailableReasonKey(sandboxCapabilityGap.reason))
			: null;

	const sandboxNotice = useMemo<ExecutionModeSandboxNoticeModel | undefined>(() => {
		if (isRemoteProject) {
			return {
				reason: t("executionModeSelector.sandboxUnavailableRemote"),
				mode: t("executionModeSelector.sandboxUnavailable.currentMode"),
			};
		}
		if (!sandboxCapabilityGap) return undefined;
		return {
			reason: t(sandboxUnavailableReasonKey(sandboxCapabilityGap.reason)),
			// 沙盒不可用时不能声称「当前就是完全访问」：模式仍是沙盒的话，这条会话根本起不来。
			mode:
				effectiveMode === "sandbox"
					? t("executionModeSelector.sandboxUnavailable.requestedModeNotEffective")
					: t("executionModeSelector.sandboxUnavailable.currentMode"),
			details: sandboxCapabilityGap.details,
		};
	}, [isRemoteProject, sandboxCapabilityGap, effectiveMode, t]);

	const labelFor = useCallback(
		(m: SessionExecutionMode): string =>
			m === "sandbox" ? t("executionModeSelector.sandbox.label") : t("executionModeSelector.fullAccess.label"),
		[t],
	);
	const titleFor = useCallback(
		(m: SessionExecutionMode): string =>
			m === "sandbox" ? t("executionModeSelector.sandbox.title") : t("executionModeSelector.fullAccess.title"),
		[t],
	);

	const options = useMemo(
		(): ExecutionModeOptionModel[] =>
			MODE_OPTIONS.map((option) => ({
				...option,
				label: labelFor(option.mode),
				title: option.mode === "sandbox" && sandboxBlockedReason ? sandboxBlockedReason : titleFor(option.mode),
				disabled: option.mode === "sandbox" && !!sandboxBlockedReason,
				selected: option.mode === effectiveMode,
			})),
		[sandboxBlockedReason, labelFor, titleFor, effectiveMode],
	);

	const selectedOption = options.find((option) => option.mode === effectiveMode) ?? options[0];

	const handleSelect = useCallback(
		async (nextMode: SessionExecutionMode) => {
			if (disabled || nextMode === effectiveMode) return;
			if (nextMode === "sandbox" && sandboxBlockedReason) return;
			setIsSwitching(true);
			try {
				await binding.onSelectMode(nextMode);
			} finally {
				setIsSwitching(false);
			}
		},
		[binding, disabled, effectiveMode, sandboxBlockedReason],
	);

	return {
		open,
		disabled,
		selectedOption,
		options,
		sandboxNotice,
		onOpenChange: setOpen,
		onSelect: (nextMode) => void handleSelect(nextMode as SessionExecutionMode),
	};
}
