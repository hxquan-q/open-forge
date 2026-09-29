// Copyright The Open Forge contributors.
import { notifyTeamSessionsChanged } from "@shared/agent-teams/team-session-events";
import { pathBasename } from "@shared/lib/utils";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArchivedSessionEntry } from "../../../../shared/archived-sessions";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

export interface ArchivedSessionItem {
	name: string;
	path: string;
	archivedAtLabel: string;
}

export interface ArchivedSessionsSettingsModel {
	actions: {
		delete: (path: string) => void;
		unarchive: (path: string) => Promise<void>;
	};
	labels: {
		deleteSession: string;
		empty: string;
		sectionTitle: string;
		unarchive: string;
	};
	sessions: readonly ArchivedSessionItem[];
}

/** 归档时可能没有名字（未命名会话），回落到路径尾段，别让行只剩一个日期。 */
function sessionName(entry: ArchivedSessionEntry): string {
	const label = entry.label.trim();
	return label.length > 0 ? label : pathBasename(entry.path);
}

export function useArchivedSessionsSettingsModel(): ArchivedSessionsSettingsModel {
	const { t, i18n } = useTranslation("settings");
	const [archivedSessions, setArchivedSessions] = useState<readonly ArchivedSessionEntry[]>([]);
	const setConfirm = useSetAtom(confirmDialogAtom);

	// 快照本身已按归档时间倒序；这里不做二次排序，顺序与侧边栏的操作历史一致。
	useEffect(() => {
		void window.vetta.archivedSessions.list().then((snapshot) => setArchivedSessions(snapshot.sessions));
	}, []);

	const unarchive = useCallback(async (path: string) => {
		await window.vetta.archivedSessions.unarchive(path);
		setArchivedSessions((prev) => prev.filter((entry) => entry.path !== path));
		recordSettingsUsage({ tab: "archived", action: "restored", target: "session" });
	}, []);

	const deleteSession = useCallback(
		(path: string) => {
			const entry = archivedSessions.find((item) => item.path === path);
			if (!entry) return;
			const team = entry.team;
			setConfirm({
				title: t("deleteArchivedSessionConfirm"),
				message: t("deleteArchivedSessionMessage", { name: sessionName(entry) }),
				confirmLabel: t("archiveDelete"),
				variant: "danger",
				onConfirm: () => {
					// 团队会话必须走团队级删除：它会先中止团队，再连同成员会话与团队记录一起清掉；
					// 普通会话删除由会话运行时负责，而运行时明确拒绝团队会话。
					const removal = team
						? window.vetta.agentTeams
								.deleteSession({ id: team.teamSessionId, coordinationSessionPath: path })
								.then(() => notifyTeamSessionsChanged(team.teamId))
						: window.vetta.session.delete(path);
					void removal.then(() => {
						// 会话没了，归档标记就是孤儿；与侧边栏删除会话的清理时机保持一致。
						void window.vetta.archivedSessions.forget([path]);
						setArchivedSessions((prev) => prev.filter((item) => item.path !== path));
						recordSettingsUsage({ tab: "archived", action: "deleted", target: "session" });
					});
				},
			});
		},
		[archivedSessions, setConfirm, t],
	);

	const sessions = useMemo<readonly ArchivedSessionItem[]>(
		() =>
			archivedSessions.map((entry) => ({
				name: sessionName(entry),
				path: entry.path,
				archivedAtLabel: t("archivedAt", {
					date: new Date(entry.archivedAt).toLocaleDateString(i18n.language, {
						year: "numeric",
						month: "long",
						day: "numeric",
					}),
				}),
			})),
		[archivedSessions, i18n.language, t],
	);

	const labels = useMemo(
		() => ({
			deleteSession: t("deleteArchivedSession"),
			empty: t("noArchivedSessions"),
			sectionTitle: t(SETTINGS_SECTION["archived-sessions"].titleKey),
			unarchive: t("unarchive"),
		}),
		[t],
	);

	return {
		actions: {
			delete: deleteSession,
			unarchive,
		},
		labels,
		sessions,
	};
}
