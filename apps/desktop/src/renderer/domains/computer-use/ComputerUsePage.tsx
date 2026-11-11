// Copyright The Open Forge contributors.
import { ComputerUseView } from "@vetta-org/theme-ui/computer-use";
import { useAtomValue } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { activeSessionAtom, sessionsMapAtom } from "@shared/store/atoms";
import { useMemo } from "react";
import { useComputerUseModel } from "./useComputerUseModel.js";

export function ComputerUsePage() {
	const active = useAtomValue(activeSessionAtom);
	const sessions = useAtomValue(sessionsMapAtom);
	const sessionName = useMemo(() => {
		for (const entries of sessions.values()) {
			const found = entries.find((entry) => entry.path === active?.sessionPath);
			if (found) return found.name || found.firstMessage;
		}
		return active?.cwd;
	}, [active?.cwd, active?.sessionPath, sessions]);
	const navigate = useNavigate();
	const { model, actions } = useComputerUseModel(active?.runtimeId, () => { void navigate({ to: "/" }); }, sessionName);
	return <ComputerUseView model={model} actions={actions} />;
}
