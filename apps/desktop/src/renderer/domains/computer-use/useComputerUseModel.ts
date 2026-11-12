// Copyright The Open Forge contributors.

import { waitForCommittedPaint } from "@shared/lib/committed-paint";
import type {
	ComputerUseViewActions,
	ComputerUseViewLabels,
	ComputerUseViewModel,
} from "@vetta-org/theme-ui/computer-use";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ComputerControl, ComputerUseState } from "@/shared/computer-use";

const knownIssues = [
	"backend_not_bundled",
	"backend_integrity_failed",
	"stale_reference",
	"stop_failed",
	"restore_failed",
	"recovery_failed",
	"invalid_session",
	"desktop_owned",
	"recall_unavailable",
	"capture_unavailable",
] as const;

export function useComputerUseModel(
	sessionId: string | undefined,
	chat: () => void,
	sessionName?: string,
): { model: ComputerUseViewModel; actions: ComputerUseViewActions } {
	const { t } = useTranslation("computer-use");
	const [state, setState] = useState<ComputerUseState>();
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [pending, setPending] = useState(0);
	const [optimisticEnabled, setOptimisticEnabled] = useState<boolean>();
	const revision = useRef(-1);
	const lifetime = useRef<AbortSignal | undefined>(undefined);
	const accept = useCallback((next: ComputerUseState) => {
		if (next.revision < revision.current) return;
		revision.current = next.revision;
		setState(next);
		setLoading(false);
		setFailed(false);
	}, []);
	useEffect(() => {
		const controller = new AbortController();
		lifetime.current = controller.signal;
		const unsubscribe = window.vetta.computerUse.onChanged((next) => {
			if (!controller.signal.aborted) accept(next);
		});
		void (async () => {
			await waitForCommittedPaint();
			if (controller.signal.aborted) return;
			try {
				const next = await window.vetta.computerUse.state();
				if (!controller.signal.aborted) accept(next);
			} catch {
				if (!controller.signal.aborted) {
					setFailed(true);
					setLoading(false);
				}
			}
		})();
		return () => {
			controller.abort();
			unsubscribe();
		};
	}, [accept]);

	const dispatch = useCallback(
		(command: ComputerControl) => {
			const signal = lifetime.current;
			setPending((count) => count + 1);
			if (command.action === "enable") setOptimisticEnabled(command.enabled);
			const urgent =
				command.action === "stop" ||
				command.action === "pause" ||
				(command.action === "enable" && !command.enabled);
			void (async () => {
				try {
					if (!urgent) await waitForCommittedPaint();
					if (signal?.aborted) return;
					const next = await window.vetta.computerUse.control(command);
					if (!signal?.aborted) accept(next);
				} catch {
					if (!signal?.aborted) setFailed(true);
				} finally {
					if (!signal?.aborted) {
						setPending((count) => count - 1);
						if (command.action === "enable") setOptimisticEnabled(undefined);
					}
				}
			})();
		},
		[accept],
	);

	const labels: ComputerUseViewLabels = {
		title: t("title"),
		description: t("description"),
		enable: t("enable"),
		unsupported: t("unsupported"),
		loading: t("loading"),
		session: t("session"),
		noSession: t("noSession"),
		owner: t("owner"),
		noOwner: t("noOwner"),
		grant: t("grant"),
		chat: t("chat"),
		pause: t("pause"),
		resume: t("resume"),
		stop: t("stop"),
		hiddenWindows: t("hiddenWindows"),
		restore: t("restore"),
		restoreAll: t("restoreAll"),
		noHidden: t("noHidden"),
		display: t("display"),
		hideVetta: t("hideVetta"),
		showVetta: t("showVetta"),
		topmost: t("topmost"),
		shortcutHelp: t("shortcutHelp"),
		shortcutsUnavailable: t("shortcutsUnavailable"),
		retry: t("retry"),
	};
	const issue = knownIssues.find((code) => code === state?.issue) ?? "generic";
	const currentConversationLabel = sessionName ? t("currentSessionNamed", { name: sessionName }) : t("currentSession");
	const ownerMismatch = Boolean(sessionId && state?.sessionId && state.sessionId !== sessionId);
	const model: ComputerUseViewModel = {
		labels,
		loading,
		pending: pending > 0,
		supported: state?.supported ?? true,
		enabled: optimisticEnabled ?? state?.enabled ?? false,
		phase: t(`phases.${state?.phase ?? "disabled"}`),
		error: failed || state?.issue ? t(`errors.${issue}`) : undefined,
		sessionLabel: sessionId ? currentConversationLabel : "",
		ownerLabel: state?.sessionId
			? state.sessionName
				? t("authorizedSessionNamed", { name: state.sessionName })
				: state.sessionId === sessionId
					? currentConversationLabel
					: t("authorizedSessionId", { id: state.sessionId })
			: "",
		ownershipNotice: ownerMismatch ? t("ownershipMismatch") : undefined,
		canGrant: Boolean(!ownerMismatch && state?.enabled && sessionId),
		hasGrant: Boolean(state?.sessionId),
		canResume: Boolean(state?.sessionId && state.phase === "paused"),
		hiddenWindows: (state?.hiddenWindows ?? []).map((window) => ({
			id: window.id,
			label: window.title || window.exe,
		})),
		vettaHidden: state?.vettaHidden ?? false,
		topmost: state?.topmost ?? false,
		shortcutsAvailable: state?.shortcutsAvailable ?? false,
	};
	return {
		model,
		actions: {
			enable: (enabled) => dispatch({ action: "enable", enabled }),
			grant: () => {
				if (sessionId) dispatch({ action: "grant", sessionId });
			},
			chat,
			pause: () => dispatch({ action: "pause" }),
			resume: () => dispatch({ action: "resume" }),
			stop: () => dispatch({ action: "stop" }),
			restore: (id) => dispatch({ action: "restore", targetId: id }),
			restoreAll: () => dispatch({ action: "restore-all" }),
			display: (value) => dispatch({ action: "display", ...value }),
			retry: () => {
				const signal = lifetime.current;
				void window.vetta.computerUse
					.state()
					.then((next) => {
						if (!signal?.aborted) accept(next);
					})
					.catch(() => {
						if (!signal?.aborted) setFailed(true);
					});
			},
		},
	};
}
