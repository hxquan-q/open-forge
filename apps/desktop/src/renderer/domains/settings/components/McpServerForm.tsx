// Modified by The Open Forge contributors.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@vetta-org/ui";
import { SegmentedControl } from "@vetta-org/theme-ui/shared";
import { getMcpAuthorization, setMcpAuthorization } from "./mcp-authorization-header";
import { CheckboxField, InputField, TextareaField } from "@vetta-org/theme-ui/settings";
import type { McpServerToolList } from "@preload/api.js";
import {
	isMcpFormValid,
	type McpServerFormState,
	type McpTransportType,
} from "./useMcpSettingsModel";

const FIELD_CLASS =
	"h-9 w-full rounded-lg border-border/60 bg-background/50 hover:bg-background focus-visible:bg-background focus-visible:border-primary/60 text-xs px-3 transition-colors";
const MONO_FIELD_CLASS = cn(FIELD_CLASS, "font-mono");

export function McpServerForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
	serverTools,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
	/** 编辑态注入的最近目录工具清单；新增态不传（尚未有发现记录）。 */
	serverTools?: McpServerToolList | null;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="space-y-5">
			<McpServerFields form={form} setForm={setForm} serverTools={serverTools} />

			<div className="flex items-center justify-end gap-2.5 pt-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={onCancel}
					className="h-8 rounded-lg px-3.5 text-xs text-muted-foreground hover:text-foreground"
				>
					{t("cancel")}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={onSave}
					disabled={!isMcpFormValid(form) || saving}
					className="h-8 rounded-lg px-4 text-xs font-medium shadow-xs"
				>
					{saveLabel}
				</Button>
			</div>
		</div>
	);
}

/** MCP 表单字段。添加弹窗与编辑弹窗各自组合所需的底部操作。 */
export function McpServerFields({
	form,
	setForm,
	serverTools,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	serverTools?: McpServerToolList | null;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedValues(form));

	return (
		<div className="space-y-4">
			{/* 协议选择：与下方表单字段保持一致的对齐基准线 */}
			<div className="flex items-center justify-between pb-0.5">
				<span className="text-xs font-medium text-foreground/85">{t("transportType")}</span>
				<SegmentedControl
					items={[
						{ key: "stdio" as McpTransportType, label: t("stdio") },
						{ key: "http" as McpTransportType, label: "HTTP" },
					]}
					value={form.transport}
					onChange={(transport) => setForm((current) => ({ ...current, transport }))}
				/>
			</div>

			{/* 基础必填字段：全宽单列严密对齐 */}
			<div className="space-y-3.5">
				<label className="block space-y-1.5">
					<span className="block text-xs font-medium text-foreground/85">
						{t("serverName")} <span className="text-destructive">*</span>
					</span>
					<InputField
						aria-label={t("serverName")}
						value={form.name}
						onChange={(value) => setForm((current) => ({ ...current, name: value }))}
						placeholder={t("mcpStore.namePlaceholder")}
						className={FIELD_CLASS}
					/>
				</label>

				{form.transport === "stdio" ? (
					<StdioBasicFields form={form} setForm={setForm} />
				) : (
					<HttpBasicFields form={form} setForm={setForm} />
				)}
			</div>

			{serverTools !== undefined && <McpToolsSection serverTools={serverTools} setForm={setForm} />}

			{/* 高级选项：系统折叠触发器与对称网格 */}
			<div className="space-y-3 pt-1">
				<button
					type="button"
					aria-expanded={advancedOpen}
					onClick={() => setAdvancedOpen((open) => !open)}
					className="group inline-flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground select-none"
				>
					<span
						className={cn(
							"icon-[solar--alt-arrow-right-linear] h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground/70 group-hover:text-foreground",
							advancedOpen && "rotate-90",
						)}
					/>
					<span>{t("advancedOptions")}</span>
				</button>

				{advancedOpen && (
					<div className="space-y-3.5 pt-1 animate-in fade-in-50 duration-150">
						{form.transport === "stdio" ? (
							<StdioAdvancedFields form={form} setForm={setForm} />
						) : (
							<HttpAdvancedFields form={form} setForm={setForm} />
						)}

						{/* 短输入字段等宽 1:1 对称；stdio 的 idleTimeout 与启动超时并列。 */}
						<div className="grid grid-cols-2 gap-3">
							<label className="block space-y-1.5">
								<span className="block text-xs font-medium text-foreground/85 truncate">
									{t("startupTimeout")}
								</span>
								<InputField
									aria-label={t("startupTimeout")}
									value={form.startupTimeout}
									onChange={(value) => setForm((current) => ({ ...current, startupTimeout: value }))}
									placeholder={t("default10000")}
									className={MONO_FIELD_CLASS}
								/>
							</label>
							{form.transport === "stdio" ? (
								<label className="block space-y-1.5">
									<span className="block text-xs font-medium text-foreground/85 truncate">
										{t("idleTimeout")}
									</span>
									<InputField
										aria-label={t("idleTimeout")}
										value={form.idleTimeout}
										onChange={(value) => setForm((current) => ({ ...current, idleTimeout: value }))}
										placeholder="1800000"
										className={MONO_FIELD_CLASS}
									/>
								</label>
							) : (
								<label className="block space-y-1.5">
									<span className="block text-xs font-medium text-foreground/85 truncate">
										{t("autoApproveTools")}
									</span>
									<InputField
										aria-label={t("autoApproveTools")}
										value={form.autoApprove}
										onChange={(value) => setForm((current) => ({ ...current, autoApprove: value }))}
										placeholder={t("mcpStore.autoApprovePlaceholder")}
										className={MONO_FIELD_CLASS}
									/>
								</label>
							)}
						</div>

						{form.transport === "stdio" && (
							<label className="block space-y-1.5">
								<span className="block text-xs font-medium text-foreground/85 truncate">
									{t("autoApproveTools")}
								</span>
								<InputField
									aria-label={t("autoApproveTools")}
									value={form.autoApprove}
									onChange={(value) => setForm((current) => ({ ...current, autoApprove: value }))}
									placeholder={t("mcpStore.autoApprovePlaceholder")}
									className={MONO_FIELD_CLASS}
								/>
							</label>
						)}

						<div className="flex items-center gap-6 pt-0.5">
							<CheckboxField
								checked={form.disabled}
								onChange={(value) => setForm((current) => ({ ...current, disabled: value }))}
								label={t("disable")}
							/>
							<CheckboxField
								checked={form.debug}
								onChange={(value) => setForm((current) => ({ ...current, debug: value }))}
								label={t("debugMode")}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/** 编辑态工具清单：保留本仓的禁用勾选与过期提示。 */
function McpToolsSection({
	serverTools,
	setForm,
}: {
	serverTools: McpServerToolList | null;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="space-y-1.5">
			<span className="block text-xs font-medium text-foreground/85">{t("mcpServerTools")}</span>
			{serverTools === null ? (
				<p className="text-[12px] text-muted-foreground">{t("mcpServerToolsLoading")}</p>
			) : serverTools.tools.length === 0 ? (
				<p className="text-[12px] text-muted-foreground">
					{serverTools.cached ? t("mcpServerToolsEmpty") : t("mcpServerToolsNotDiscovered")}
				</p>
			) : (
				<div className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-lg border border-border/50 px-3 py-2.5">
					{serverTools.tools.map((tool) => (
						<div key={tool.name} className="flex flex-col">
							<div className="flex items-center gap-2">
								<CheckboxField
									checked={tool.enabled}
									onChange={(enabled) =>
										setForm((current) => ({
											...current,
											disabledTools: enabled
												? current.disabledTools.filter((name) => name !== tool.name)
												: [...new Set([...current.disabledTools, tool.name])],
										}))
									}
									label={tool.name}
								/>
								{tool.stale ? (
									<span className="text-[10px] text-muted-foreground">{t("mcpServerToolStale")}</span>
								) : null}
							</div>
							{tool.description ? (
								<p className="ml-6 truncate text-[11px] text-muted-foreground/70">{tool.description}</p>
							) : null}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function hasAdvancedValues(form: McpServerFormState): boolean {
	return Boolean(
		form.transport === "http" ||
			form.env.trim() ||
			form.cwd.trim() ||
			form.headers.trim() ||
			form.autoApprove.trim() ||
			form.startupTimeout.trim() ||
			form.idleTimeout.trim() ||
			form.disabledTools.length > 0 ||
			form.disabled ||
			form.debug,
	);
}

function StdioBasicFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<label className="block space-y-1.5">
				<span className="block text-xs font-medium text-foreground/85">
					{t("command")} <span className="text-destructive">*</span>
				</span>
				<InputField
					aria-label={t("command")}
					value={form.command}
					onChange={(value) => setForm((current) => ({ ...current, command: value }))}
					placeholder={t("mcpStore.commandPlaceholder")}
					className={MONO_FIELD_CLASS}
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="block text-xs font-medium text-foreground/85">{t("arguments")}</span>
				<InputField
					aria-label={t("arguments")}
					value={form.args}
					onChange={(value) => setForm((current) => ({ ...current, args: value }))}
					placeholder={t("mcpStore.argsPlaceholder")}
					className={MONO_FIELD_CLASS}
				/>
			</label>
		</>
	);
}

function StdioAdvancedFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<label className="block space-y-1.5">
				<span className="block text-xs font-medium text-foreground/85">{t("envVariables")}</span>
				<TextareaField
					value={form.env}
					onChange={(value) => setForm((current) => ({ ...current, env: value }))}
					placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}\nNODE_ENV=production"}
					rows={3}
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="block text-xs font-medium text-foreground/85">{t("workDirectory")}</span>
				<InputField
					aria-label={t("workDirectory")}
					value={form.cwd}
					onChange={(value) => setForm((current) => ({ ...current, cwd: value }))}
					placeholder="${PROJECT_ROOT}"
					className={MONO_FIELD_CLASS}
				/>
			</label>
		</>
	);
}

function HttpBasicFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<label className="block space-y-1.5">
				<span className="block text-xs font-medium text-foreground/85">
					{t("sseUrl")} <span className="text-destructive">*</span>
				</span>
				<InputField
					aria-label={t("sseUrl")}
					value={form.url}
					onChange={(value) => setForm((current) => ({ ...current, url: value }))}
					placeholder={t("mcpStore.urlPlaceholder")}
					className={MONO_FIELD_CLASS}
				/>
			</label>
			<label className="block space-y-1.5">
				<span className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
					<span
						className="icon-[solar--key-minimalistic-square-linear] h-3.5 w-3.5 text-muted-foreground/75"
						aria-hidden="true"
					/>
					{t("mcpStore.authorizationKey")}
				</span>
				<InputField
					type="password"
					aria-label={t("mcpStore.authorizationKey")}
					value={getMcpAuthorization(form.headers)}
					onChange={(value) =>
						setForm((current) => ({ ...current, headers: setMcpAuthorization(current.headers, value) }))
					}
					placeholder={t("mcpStore.authorizationPlaceholder")}
					className={MONO_FIELD_CLASS}
				/>
				<span className="block text-[11px] leading-relaxed text-muted-foreground/75">
					{t("mcpStore.authorizationHint")}
				</span>
			</label>
		</>
	);
}

function HttpAdvancedFields({
	form,
	setForm,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<label className="block space-y-1.5">
			<span className="block text-xs font-medium text-foreground/85">{t("requestHeaders")}</span>
			<TextareaField
				value={form.headers}
				onChange={(value) => setForm((current) => ({ ...current, headers: value }))}
				placeholder={"Authorization=Bearer ${EXA_TOKEN}"}
				rows={2}
			/>
		</label>
	);
}
