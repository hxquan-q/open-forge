// Copyright The Open Forge contributors.
import type { ScheduledTaskPermissionTiers } from "@shared/store/atoms";
import { confirmDialogAtom } from "@shared/store/atoms";
import {
	enableAllUnattendedPermissionTiers,
	UNATTENDED_PERMISSION_TIER_KEYS,
} from "@vetta/coding-agent/function-extensions";
import { useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";

export type PermissionTierKey = (typeof UNATTENDED_PERMISSION_TIER_KEYS)[number];

export interface PermissionTierOption {
	readonly key: PermissionTierKey;
	readonly label: string;
	readonly hint: string;
	readonly enabled: boolean;
}

export interface SchedulerPermissionTiersModel {
	readonly title: string;
	readonly description: string;
	readonly billingVeto: string;
	readonly enableAllLabel: string;
	readonly options: readonly PermissionTierOption[];
	readonly onToggle: (key: PermissionTierKey, enabled: boolean) => void;
	readonly onEnableAll: () => void;
}

export function useSchedulerPermissionTiersModel(
	value: SchedulerTaskDraft,
	onFieldChange: <Key extends keyof SchedulerTaskDraft>(key: Key, nextValue: SchedulerTaskDraft[Key]) => void,
): SchedulerPermissionTiersModel {
	const { t } = useTranslation("automation");
	const { t: tCommon } = useTranslation("common");
	const setConfirm = useSetAtom(confirmDialogAtom);
	const tiers = value.permissionTiers;

	const onToggle = useCallback(
		(key: PermissionTierKey, enabled: boolean): void => {
			const next: ScheduledTaskPermissionTiers = { ...tiers, [key]: enabled };
			onFieldChange("permissionTiers", next);
		},
		[onFieldChange, tiers],
	);

	const onEnableAll = useCallback((): void => {
		setConfirm({
			title: t("form.permissionTiers.enableAllConfirmTitle"),
			message: t("form.permissionTiers.enableAllConfirmMessage"),
			confirmLabel: t("form.permissionTiers.enableAllConfirm"),
			cancelLabel: tCommon("actions.cancel"),
			variant: "danger",
			onConfirm: () => {
				onFieldChange("permissionTiers", enableAllUnattendedPermissionTiers());
			},
		});
	}, [onFieldChange, setConfirm, t, tCommon]);

	return useMemo(
		() => ({
			title: t("form.permissionTiers.title"),
			description: t("form.permissionTiers.description"),
			billingVeto: t("form.permissionTiers.billingVeto"),
			enableAllLabel: t("form.permissionTiers.enableAll"),
			options: UNATTENDED_PERMISSION_TIER_KEYS.map((key) => ({
				key,
				label: t(`form.permissionTiers.tiers.${key}.label`),
				hint: t(`form.permissionTiers.tiers.${key}.hint`),
				enabled: tiers?.[key] === true,
			})),
			onToggle,
			onEnableAll,
		}),
		[onEnableAll, onToggle, t, tiers],
	);
}
