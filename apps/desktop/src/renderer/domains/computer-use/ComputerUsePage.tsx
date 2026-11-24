// Copyright The Open Forge contributors.
import { ComputerUseView } from "@vetta-org/theme-ui/computer-use";
import { useAtomValue } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { activeSessionAtom, activeTeamSessionAtom, sessionsMapAtom } from "@shared/store/atoms";
import { useMemo } from "react";
import { useComputerUseModel } from "./useComputerUseModel.js";

export function ComputerUsePage() {
	const active = useAtomValue(activeSessionAtom);
	const team = useAtomValue(activeTeamSessionAtom);
	const sessions = useAtomValue(sessionsMapAtom);
	const sessionName = useMemo(() => {
		// 团队语境的授权主体是团队会话：会话名不在普通会话池里，授权后由主进程
		// 回填团队标题（ownerLabel）；当前会话文案先用通用形式。
		if (team) return undefined;
		for (const entries of sessions.values()) {
			const found = entries.find((entry) => entry.path === active?.sessionPath);
			if (found) return found.name || found.firstMessage;
		}
		return active?.cwd;
	}, [active?.cwd, active?.sessionPath, sessions, team]);
	const navigate = useNavigate();
	// 授权主体（BUG-0187）：团队语境优先——团队成员/协调 Runtime 的授权落在所属
	// 团队会话上；普通会话沿用 activeSession 的 runtime id。
	const subjectId = team?.sessionId ?? active?.runtimeId;
	const chat = team
		? () => {
				void navigate({
					to: "/agent-teams/$teamId/sessions/$sessionId",
					params: { teamId: team.teamId, sessionId: team.sessionId },
				});
			}
		: () => {
				void navigate({ to: "/" });
			};
	const { model, actions } = useComputerUseModel(subjectId, chat, sessionName);
	return <ComputerUseView model={model} actions={actions} />;
}
