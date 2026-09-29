import { brandIconUrl } from "@shared/brand-assets";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type BuiltinMcpPreset,
	type BuiltinMcpSecretField,
	isSecretFieldRequired,
	isSecretFieldVisible,
	resolveMcpPresetDisplayName,
	resolveMcpPresetIconUrl,
} from "../mcp/builtin-mcp-presets";

function resolvePrimaryHelpUrl(preset: BuiltinMcpPreset): string | undefined {
	if (preset.setupHelpUrl) return preset.setupHelpUrl;
	return preset.secrets?.find((field) => field.helpUrl)?.helpUrl;
}

/** 字段随引用值隐藏时同步清掉其值，避免陈旧 envKey 被提交进 env。 */
function pruneHiddenValues(
	fields: readonly BuiltinMcpSecretField[],
	values: Record<string, string>,
): Record<string, string> {
	const next = { ...values };
	for (const field of fields) {
		if (field.envKey in next && !isSecretFieldVisible(field, next)) delete next[field.envKey];
	}
	return next;
}

export interface BuiltinMcpSecretsFieldView {
	readonly envKey: string;
	readonly helpUrl?: string;
	readonly label: string;
	readonly optionalSuffix: string;
	readonly placeholder?: string;
	/** 当前取值下的有效必填态（requiredWhen 已按其它字段值求值）。 */
	readonly required: boolean;
	readonly secret: boolean;
	/** 限定枚举时渲染 select 而非输入框。 */
	readonly options?: readonly { value: string; label: string }[];
}

export interface BuiltinMcpSecretsDialogModel {
	readonly appIconUrl: string;
	readonly canSubmit: boolean;
	readonly connectorIconUrl: string;
	readonly connectorName: string;
	readonly fields: readonly BuiltinMcpSecretsFieldView[];
	readonly guideLines: readonly string[];
	readonly hasFields: boolean;
	readonly labels: {
		readonly continueCta: string;
		readonly getKey: string;
		readonly openAuthPage: string;
		readonly openKeyPage: string;
		readonly privacyTooltip: string;
		readonly privacyTooltipAria: string;
		readonly saving: string;
		readonly authorizing: string;
		readonly setupBody: string;
		readonly setupTitle: string;
		readonly stepPasteKey: string;
		readonly title: string;
	};
	readonly onChangeValue: (envKey: string, value: string) => void;
	readonly onOpenHelp: (url: string) => void;
	readonly open: boolean;
	readonly primaryHelpUrl?: string;
	readonly saving: boolean;
	readonly authorizing: boolean;
	readonly error: string | null;
	readonly values: Record<string, string>;
}

export function useBuiltinMcpSecretsDialogModel({
	open,
	preset,
	initialValues,
	saving = false,
	authorizing = false,
	error = null,
}: {
	open: boolean;
	preset: BuiltinMcpPreset | null;
	initialValues?: Record<string, string>;
	saving?: boolean;
	authorizing?: boolean;
	error?: string | null;
}): BuiltinMcpSecretsDialogModel | null {
	const { t } = useTranslation("settings");
	const fields = preset?.secrets ?? [];
	const [values, setValues] = useState<Record<string, string>>({});

	useEffect(() => {
		if (!open || !preset) return;
		const next: Record<string, string> = {};
		for (const field of preset.secrets ?? []) {
			next[field.envKey] = initialValues?.[field.envKey] ?? "";
		}
		setValues(pruneHiddenValues(fields, next));
	}, [fields, initialValues, open, preset]);

	const visibleFields = useMemo(() => fields.filter((field) => isSecretFieldVisible(field, values)), [fields, values]);

	const canSubmit = useMemo(() => {
		return visibleFields.every((field) => {
			if (!isSecretFieldRequired(field, values)) return true;
			return Boolean(values[field.envKey]?.trim());
		});
	}, [visibleFields, values]);

	return useMemo(() => {
		if (!preset) return null;
		const guide = preset.setupGuide?.trim() || (preset.setupGuideKey ? t(preset.setupGuideKey) : "");
		const guideLines = guide
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		const hasFields = fields.length > 0;
		const connectorName = resolveMcpPresetDisplayName(preset, (key) => t(key));
		return {
			appIconUrl: brandIconUrl,
			canSubmit,
			connectorIconUrl: resolveMcpPresetIconUrl(preset),
			connectorName,
			fields: visibleFields.map((field) => ({
				envKey: field.envKey,
				helpUrl: field.helpUrl,
				label: field.label?.trim() || (field.labelKey ? t(field.labelKey) : field.envKey),
				optionalSuffix: `（${t("optional")}）`,
				placeholder: field.placeholder,
				required: isSecretFieldRequired(field, values),
				secret: Boolean(field.secret),
				options: field.options?.map((option) => ({
					value: option.value,
					label: option.labelKey ? t(option.labelKey) : option.value,
				})),
			})),
			guideLines,
			hasFields,
			labels: {
				continueCta: t(preset.dialogCopy?.continueCtaKey ?? "mcpPresets.continueCta", { name: connectorName }),
				getKey: t("mcpPresets.getKey"),
				openAuthPage: t("mcpPresets.openAuthPage"),
				openKeyPage: t(preset.dialogCopy?.helpCtaKey ?? "mcpPresets.openKeyPage"),
				privacyTooltip: t("mcpPresets.privacyTooltip"),
				privacyTooltipAria: t("mcpPresets.privacyTooltipAria"),
				saving: t("saving"),
				authorizing: t("mcpPresets.authorizing"),
				setupBody: hasFields
					? t(preset.dialogCopy?.leadKey ?? "mcpPresets.secretsDialogLead")
					: t("mcpPresets.browserAuthDialogLead"),
				setupTitle: t("mcpPresets.setupTitle"),
				stepPasteKey: t(preset.dialogCopy?.fieldsTitleKey ?? "mcpPresets.stepPasteKey"),
				title: t("mcpPresets.secretsDialogTitle", { name: connectorName }),
			},
			onChangeValue: (envKey: string, value: string) => {
				setValues((current) => pruneHiddenValues(fields, { ...current, [envKey]: value }));
			},
			onOpenHelp: (url: string) => {
				void window.vetta.auth.openExternal(url);
			},
			open,
			primaryHelpUrl: resolvePrimaryHelpUrl(preset),
			saving,
			authorizing,
			error,
			values,
		};
	}, [authorizing, canSubmit, error, fields, open, preset, saving, t, values, visibleFields]);
}
