import type { McpServerConfigData, McpStdioServerConfigData } from "@preload/api.js";

/** settings 命名空间下、内置 MCP 可用的 i18n key（须与 locales 同步扩展） */
export type BuiltinMcpLabelKey =
	| "mcpPresets.canva.displayName"
	| "mcpPresets.canva.description"
	| "mcpPresets.slack.displayName"
	| "mcpPresets.slack.description"
	| "mcpPresets.gmail.displayName"
	| "mcpPresets.gmail.description"
	| "mcpPresets.googleCalendar.displayName"
	| "mcpPresets.googleCalendar.description"
	| "mcpPresets.googleDrive.displayName"
	| "mcpPresets.googleDrive.description"
	| "mcpPresets.universalDb.displayName"
	| "mcpPresets.universalDb.description";

export type BuiltinMcpSecretLabelKey =
	| "mcpPresets.secrets.slackBotToken"
	| "mcpPresets.secrets.slackTeamId"
	| "mcpPresets.secrets.googleClientId"
	| "mcpPresets.secrets.googleClientSecret"
	| "mcpPresets.secrets.gdriveCredentialsPath"
	| "mcpPresets.secrets.dbType"
	| "mcpPresets.secrets.dbHost"
	| "mcpPresets.secrets.dbPort"
	| "mcpPresets.secrets.dbUser"
	| "mcpPresets.secrets.dbPassword"
	| "mcpPresets.secrets.dbName"
	| "mcpPresets.secrets.dbFilePath";

export type BuiltinMcpGuideKey =
	| "mcpPresets.guides.slack"
	| "mcpPresets.guides.gmail"
	| "mcpPresets.guides.googleCalendar"
	| "mcpPresets.guides.googleDrive"
	| "mcpPresets.guides.canva"
	| "mcpPresets.guides.universalDb";

/** select 选项的可读名 i18n key（须与 locales 的 mcpPresets.dbTypes 同步） */
export type BuiltinMcpOptionLabelKey =
	| "mcpPresets.dbTypes.mysql"
	| "mcpPresets.dbTypes.postgres"
	| "mcpPresets.dbTypes.redis"
	| "mcpPresets.dbTypes.oracle"
	| "mcpPresets.dbTypes.dm"
	| "mcpPresets.dbTypes.sqlserver"
	| "mcpPresets.dbTypes.mongodb"
	| "mcpPresets.dbTypes.sqlite"
	| "mcpPresets.dbTypes.kingbase"
	| "mcpPresets.dbTypes.gaussdb"
	| "mcpPresets.dbTypes.oceanbase"
	| "mcpPresets.dbTypes.tidb"
	| "mcpPresets.dbTypes.clickhouse"
	| "mcpPresets.dbTypes.polardb"
	| "mcpPresets.dbTypes.vastbase"
	| "mcpPresets.dbTypes.highgo"
	| "mcpPresets.dbTypes.goldendb";

/** select 单选项：value 是写入 env 的原值，labelKey 提供面向用户的可读名 */
export interface BuiltinMcpSecretOption {
	readonly value: string;
	readonly labelKey?: BuiltinMcpOptionLabelKey;
}

/** 密钥弹窗里可按预设覆盖的文案槽位（缺省回落到通用「粘贴密钥」语境） */
export type BuiltinMcpDialogLabelKey =
	| "mcpPresets.dbDialog.lead"
	| "mcpPresets.dbDialog.fieldsTitle"
	| "mcpPresets.dbDialog.helpCta"
	| "mcpPresets.dbDialog.continueCta";

/** 添加/配置时需要用户填写的密钥或标识 */
export interface BuiltinMcpSecretField {
	/** 写入 mcpServers[].env 的键名 */
	envKey: string;
	/** 内置预设使用 i18n key，市场 MCP 使用定义文件提供的 label。 */
	labelKey?: BuiltinMcpSecretLabelKey;
	label?: string;
	/** 是否必填 */
	required?: boolean;
	/**
	 * 动态必填：引用字段 `envKey` 当前值 ∈ values 时按 mode 判定。
	 * `mode: "in"`（缺省）— 命中列表才必填；`mode: "notIn"` — 未命中才必填。
	 * 存在时覆盖 `required` 的静态值（如 DB_HOST 仅在 DB_TYPE ≠ sqlite 时必填）。
	 */
	requiredWhen?: { envKey: string; values: readonly string[]; mode?: "in" | "notIn" };
	/**
	 * 动态可见：引用字段 `envKey` 当前值 ∈ values 时按 mode 判定显隐。
	 * 与 requiredWhen 同语义；隐藏的字段不渲染、不参与必填校验，其值在提交前清除
	 * （如网络连接参数仅在 DB_TYPE ≠ sqlite 时展示）。
	 */
	visibleWhen?: { envKey: string; values: readonly string[]; mode?: "in" | "notIn" };
	/** 输入框用 password */
	secret?: boolean;
	/** 限定枚举时以 select 渲染；value 是写入 env 的原值，labelKey 给可读名。 */
	options?: readonly BuiltinMcpSecretOption[];
	placeholder?: string;
	/** 官方获取密钥/凭证的页面，一键在浏览器打开 */
	helpUrl?: string;
	/**
	 * 写入 headers/env 时的值模板，`{value}` 替换为用户输入。
	 * 用于形如 `Bearer {value}` 的鉴权头；缺省时直接写入原值。
	 */
	valueTemplate?: string;
}

/** MCP 安装预设：内置项与市场 MCP 参数表单共用，不自动写入 mcp.json，也不预装依赖。 */
export interface BuiltinMcpPreset {
	/** 稳定 id，用于图标文件名与 i18n key */
	id: string;
	/** 写入 mcp.json 的默认 key */
	name: string;
	/** 内置项使用 public/mcp 文件名，市场项直接使用已解析 iconUrl。 */
	iconFile?: string;
	iconUrl?: string;
	displayNameKey?: BuiltinMcpLabelKey;
	descriptionKey?: BuiltinMcpLabelKey;
	displayName?: string;
	description?: string;
	config: McpStdioServerConfigData | Extract<McpServerConfigData, { type: "http" }>;
	/** 需要用户提供的密钥；有则添加前弹出表单 */
	secrets?: readonly BuiltinMcpSecretField[];
	/** 弹窗内展示的「怎么获取」简短步骤（i18n，可用换行） */
	setupGuideKey?: BuiltinMcpGuideKey;
	setupGuide?: string;
	/** 总览型帮助链接（弹窗顶部「打开说明」） */
	setupHelpUrl?: string;
	/** 市场定义显式声明是否需要浏览器授权；缺省保持内置预设原有推断。 */
	browserAuth?: boolean;
	/**
	 * 市场定义声明的二维码登录步骤；状态与二维码都由上游 HTTP API 提供。
	 */
	postInstallSetup?: { kind: "http-qrcode" };
	/** args 中用于回退识别的包名片段 */
	packageHint?: string;
	/**
	 * 是否在「发现」列表中展示。
	 * 缺省/false：仅保留配置与匹配逻辑（已添加识别、图标、OAuth 等），UI 不展示。
	 */
	listedInDiscover?: boolean;
	/**
	 * 密钥弹窗的文案覆盖：默认文案是「获取并粘贴密钥」语境，
	 * 连接参数型连接器（数据库等）需要换成自己的引导/标题/CTA。
	 */
	dialogCopy?: {
		readonly leadKey?: BuiltinMcpDialogLabelKey;
		readonly fieldsTitleKey?: BuiltinMcpDialogLabelKey;
		readonly helpCtaKey?: BuiltinMcpDialogLabelKey;
		readonly continueCtaKey?: BuiltinMcpDialogLabelKey;
	};
}

const MCP_ICON_BASE = "./mcp";

/**
 * universal-db-mcp@2.14.0 `normalizeDbType` 接受的规范值（17 个）。
 * 别名 mssql/opengauss 由上游归一化，表单只暴露规范值避免重复语义。
 */
export const UNIVERSAL_DB_TYPES = [
	"mysql",
	"postgres",
	"redis",
	"oracle",
	"dm",
	"sqlserver",
	"mongodb",
	"sqlite",
	"kingbase",
	"gaussdb",
	"oceanbase",
	"tidb",
	"clickhouse",
	"polardb",
	"vastbase",
	"highgo",
	"goldendb",
] as const;

/** DB_TYPE 下拉选项：value 保持上游规范 token，labelKey 给可读产品名。 */
const UNIVERSAL_DB_TYPE_OPTIONS: readonly BuiltinMcpSecretOption[] = UNIVERSAL_DB_TYPES.map((value) => ({
	value,
	labelKey: `mcpPresets.dbTypes.${value}` as BuiltinMcpOptionLabelKey,
}));

/** DB_TYPE=sqlite 时无需网络连接参数。 */
const DB_NETWORK_REQUIRED_WHEN = { envKey: "DB_TYPE", values: ["sqlite"], mode: "notIn" } as const;
/** 仅 sqlite 需要文件路径字段。 */
const DB_FILE_VISIBLE_WHEN = { envKey: "DB_TYPE", values: ["sqlite"] } as const;

export const BUILTIN_MCP_PRESETS: readonly BuiltinMcpPreset[] = [
	{
		id: "universal-db",
		name: "universal-db",
		iconFile: "universal-db.svg",
		displayNameKey: "mcpPresets.universalDb.displayName",
		descriptionKey: "mcpPresets.universalDb.description",
		packageHint: "universal-db-mcp",
		listedInDiscover: true,
		setupGuideKey: "mcpPresets.guides.universalDb",
		setupHelpUrl: "https://github.com/Anarkh-Lee/universal-db-mcp",
		dialogCopy: {
			leadKey: "mcpPresets.dbDialog.lead",
			fieldsTitleKey: "mcpPresets.dbDialog.fieldsTitle",
			helpCtaKey: "mcpPresets.dbDialog.helpCta",
			continueCtaKey: "mcpPresets.dbDialog.continueCta",
		},
		config: {
			command: "npx",
			// 无连接模式启动：stdio 上游只认 argv 或运行时 connect_database，
			// DB_* env 由宿主在每次（重）连后自发调用 connect_database 注入，不进 argv/LLM。
			args: ["-y", "universal-db-mcp@2.14.0"],
			// 首次连接的 initialize 要等 npx 冷装完整棵依赖树（mysql2/oracledb/原生
			// better-sqlite3 等可达分钟级）；普通请求超时 30s 会把还在安装的进程杀掉，
			// 留下缺 package.json 的 _npx 半成品缓存导致后续连接全部瞬间失败。
			startupTimeout: 180_000,
			disabledTools: ["connect_database", "disconnect_database"],
			postConnectToolCalls: [
				{
					tool: "connect_database",
					args: {
						type: "{env:DB_TYPE}",
						host: "{env:DB_HOST}",
						port: "{env:DB_PORT:number}",
						user: "{env:DB_USER}",
						password: "{env:DB_PASSWORD}",
						database: "{env:DB_DATABASE}",
						filePath: "{env:DB_FILE_PATH}",
					},
				},
			],
		},
		secrets: [
			{
				envKey: "DB_TYPE",
				labelKey: "mcpPresets.secrets.dbType",
				required: true,
				options: UNIVERSAL_DB_TYPE_OPTIONS,
				placeholder: "mysql / postgres / sqlite / …",
			},
			{
				envKey: "DB_FILE_PATH",
				labelKey: "mcpPresets.secrets.dbFilePath",
				requiredWhen: DB_FILE_VISIBLE_WHEN,
				visibleWhen: DB_FILE_VISIBLE_WHEN,
				placeholder: "/data/app.db",
			},
			{
				envKey: "DB_HOST",
				labelKey: "mcpPresets.secrets.dbHost",
				requiredWhen: DB_NETWORK_REQUIRED_WHEN,
				visibleWhen: DB_NETWORK_REQUIRED_WHEN,
				placeholder: "db.example.com",
			},
			{
				envKey: "DB_PORT",
				labelKey: "mcpPresets.secrets.dbPort",
				visibleWhen: DB_NETWORK_REQUIRED_WHEN,
				placeholder: "3306",
			},
			{
				envKey: "DB_USER",
				labelKey: "mcpPresets.secrets.dbUser",
				visibleWhen: DB_NETWORK_REQUIRED_WHEN,
				placeholder: "readonly_user",
			},
			{
				envKey: "DB_PASSWORD",
				labelKey: "mcpPresets.secrets.dbPassword",
				secret: true,
				visibleWhen: DB_NETWORK_REQUIRED_WHEN,
			},
			{
				envKey: "DB_DATABASE",
				labelKey: "mcpPresets.secrets.dbName",
				visibleWhen: DB_NETWORK_REQUIRED_WHEN,
				placeholder: "my_database",
			},
		],
	},
	{
		id: "canva",
		name: "canva",
		iconFile: "canva.webp",
		displayNameKey: "mcpPresets.canva.displayName",
		descriptionKey: "mcpPresets.canva.description",
		// 官方设计侧远程 MCP；经 mcp-remote 接入，首次连接浏览器 OAuth（无需粘贴 Key）
		packageHint: "mcp.canva.com",
		setupGuideKey: "mcpPresets.guides.canva",
		setupHelpUrl: "https://www.canva.com/help/mcp-agent-setup/",
		config: {
			command: "npx",
			args: ["-y", "mcp-remote", "https://mcp.canva.com/mcp"],
		},
	},
	{
		id: "slack",
		name: "slack",
		iconFile: "slack.webp",
		displayNameKey: "mcpPresets.slack.displayName",
		descriptionKey: "mcpPresets.slack.description",
		packageHint: "@modelcontextprotocol/server-slack",
		setupGuideKey: "mcpPresets.guides.slack",
		setupHelpUrl: "https://api.slack.com/apps",
		config: {
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-slack"],
		},
		secrets: [
			{
				envKey: "SLACK_BOT_TOKEN",
				labelKey: "mcpPresets.secrets.slackBotToken",
				required: true,
				secret: true,
				placeholder: "xoxb-…",
				helpUrl: "https://api.slack.com/apps",
			},
			{
				envKey: "SLACK_TEAM_ID",
				labelKey: "mcpPresets.secrets.slackTeamId",
				required: true,
				secret: false,
				placeholder: "T0…",
				helpUrl: "https://api.slack.com/methods/auth.test",
			},
		],
	},
	{
		id: "gmail",
		name: "gmail",
		iconFile: "gmail.webp",
		displayNameKey: "mcpPresets.gmail.displayName",
		descriptionKey: "mcpPresets.gmail.description",
		packageHint: "@gongrzhe/server-gmail-autoauth-mcp",
		setupGuideKey: "mcpPresets.guides.gmail",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
		},
		// 默认靠浏览器 OAuth，不弹密钥表单；高级凭证可在添加后用钥匙图标填写
	},
	{
		id: "google-calendar",
		name: "google-calendar",
		iconFile: "google-calendar.webp",
		displayNameKey: "mcpPresets.googleCalendar.displayName",
		descriptionKey: "mcpPresets.googleCalendar.description",
		packageHint: "@cocal/google-calendar-mcp",
		setupGuideKey: "mcpPresets.guides.googleCalendar",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@cocal/google-calendar-mcp"],
		},
		secrets: [
			{
				envKey: "GOOGLE_CLIENT_ID",
				labelKey: "mcpPresets.secrets.googleClientId",
				required: true,
				secret: false,
				helpUrl: "https://console.cloud.google.com/apis/credentials",
			},
			{
				envKey: "GOOGLE_CLIENT_SECRET",
				labelKey: "mcpPresets.secrets.googleClientSecret",
				required: true,
				secret: true,
				helpUrl: "https://console.cloud.google.com/apis/credentials",
			},
		],
	},
	{
		id: "google-drive",
		name: "google-drive",
		iconFile: "google-drive.webp",
		displayNameKey: "mcpPresets.googleDrive.displayName",
		descriptionKey: "mcpPresets.googleDrive.description",
		packageHint: "@modelcontextprotocol/server-gdrive",
		setupGuideKey: "mcpPresets.guides.googleDrive",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-gdrive"],
		},
		// 首次连接多走 OAuth；凭证路径为可选高级项，添加后用钥匙配置
	},
];

export function builtinMcpIconUrl(iconFile: string): string {
	return `${MCP_ICON_BASE}/${iconFile}`;
}

export function resolveMcpPresetIconUrl(preset: BuiltinMcpPreset): string {
	if (preset.iconUrl?.trim()) return preset.iconUrl.trim();
	return preset.iconFile ? builtinMcpIconUrl(preset.iconFile) : "";
}

export function resolveMcpPresetDisplayName(
	preset: BuiltinMcpPreset,
	translate: (key: BuiltinMcpLabelKey) => string,
): string {
	if (preset.displayName?.trim()) return preset.displayName.trim();
	return preset.displayNameKey ? translate(preset.displayNameKey) : preset.name;
}

export function resolveMcpPresetDescription(
	preset: BuiltinMcpPreset,
	translate: (key: BuiltinMcpLabelKey) => string,
): string {
	if (preset.description?.trim()) return preset.description.trim();
	return preset.descriptionKey ? translate(preset.descriptionKey) : "";
}

export function getBuiltinMcpPresetByName(name: string): BuiltinMcpPreset | undefined {
	return BUILTIN_MCP_PRESETS.find((preset) => preset.name === name);
}

export function getBuiltinMcpPresetById(id: string): BuiltinMcpPreset | undefined {
	return BUILTIN_MCP_PRESETS.find((preset) => preset.id === id);
}

/** 「发现」页可见的内置预设（listedInDiscover !== true 的仅保留数据与匹配）。 */
export function getListedBuiltinMcpPresets(): readonly BuiltinMcpPreset[] {
	return BUILTIN_MCP_PRESETS.filter((preset) => preset.listedInDiscover === true);
}

/** 是否为内置预设对应的已添加条目（按 name 命中，或按包名特征回退匹配）。 */
export function isBuiltinMcpServer(name: string, config: McpServerConfigData): boolean {
	if (getBuiltinMcpPresetByName(name)) return true;
	return matchBuiltinMcpPreset(name, config) !== undefined;
}

export function matchBuiltinMcpPreset(name: string, config: McpServerConfigData): BuiltinMcpPreset | undefined {
	const byName = getBuiltinMcpPresetByName(name);
	if (byName) return byName;

	if (config.type === "http") {
		// 只拿「已配置条目的 url」去对 packageHint；不能再用 preset.config.url.includes(hint)
		// —— 后者对 Notion 等预设恒真，会把广场上任意 HTTP MCP 都误匹配成 Notion。
		const url = config.url ?? "";
		return BUILTIN_MCP_PRESETS.find(
			(preset) => Boolean(preset.packageHint) && preset.config.type === "http" && url.includes(preset.packageHint!),
		);
	}
	const args = config.args?.join(" ") ?? "";
	return BUILTIN_MCP_PRESETS.find((preset) => preset.packageHint && args.includes(preset.packageHint));
}

/** 远程 HTTP MCP：走 OAuth 浏览器授权（无必填密钥） */
export function presetUsesOAuth(preset: BuiltinMcpPreset): boolean {
	if (preset.config.type !== "http") return false;
	return preset.browserAuth ?? !presetRequiresSecrets(preset);
}

/**
 * 已添加条目是否应按 OAuth 连接器展示（待授权 / 去授权 / 断开）。
 * 仅内置 OAuth 预设（如 Notion 官方远程 MCP）为 true；
 * 广场上免密钥的 HTTP MCP（如网页搜索）不提示授权。
 */
export function serverUsesOAuth(name: string, config: McpServerConfigData): boolean {
	if (config.type !== "http") return false;
	// 配置了 headers 时通常是静态密钥，不走 OAuth UI
	if (config.headers && Object.keys(config.headers).some((k) => config.headers?.[k]?.trim())) {
		return false;
	}
	const preset = matchBuiltinMcpPreset(name, config);
	return Boolean(preset && presetUsesOAuth(preset));
}

/** 有配置图标时返回 URL；否则 null（UI 使用默认 SVG）。 */
export function resolveMcpIcon(name: string, config: McpServerConfigData): string | null {
	const preset = matchBuiltinMcpPreset(name, config);
	if (preset) return resolveMcpPresetIconUrl(preset);
	const icon = config.icon?.trim();
	if (icon) return icon;
	return null;
}

export function buildBuiltinMcpServerConfig(
	preset: BuiltinMcpPreset,
	labels: { displayName: string; description: string },
	secretValues?: Record<string, string>,
): McpServerConfigData {
	const env: Record<string, string> = { ...(preset.config.type === "http" ? {} : preset.config.env) };
	if (secretValues) {
		for (const [key, value] of Object.entries(secretValues)) {
			const trimmed = value.trim();
			if (!trimmed) continue;
			const template = preset.secrets?.find((field) => field.envKey === key)?.valueTemplate;
			env[key] = template ? template.replace("{value}", trimmed) : trimmed;
		}
	}
	const base = { ...preset.config, displayName: labels.displayName, description: labels.description };
	if (Object.keys(env).length === 0) return base;
	if (base.type === "http") {
		if (base.managedRuntimeId) return { ...base, managedRuntimeEnv: env };
		return { ...base, headers: { ...base.headers, ...env } };
	}
	return { ...base, env: { ...base.env, ...env } };
}

/** 字段在当前取值下的可见态（visibleWhen 缺省即恒可见）。 */
export function isSecretFieldVisible(
	field: BuiltinMcpSecretField,
	values: Record<string, string | undefined>,
): boolean {
	if (!field.visibleWhen) return true;
	const refValue = values[field.visibleWhen.envKey]?.trim() ?? "";
	const inList = field.visibleWhen.values.includes(refValue);
	return field.visibleWhen.mode === "notIn" ? !inList : inList;
}

/** 字段在当前取值下的有效必填态（requiredWhen 存在时按引用字段值动态判定）。 */
export function isSecretFieldRequired(
	field: BuiltinMcpSecretField,
	values: Record<string, string | undefined>,
): boolean {
	if (!field.requiredWhen) return Boolean(field.required);
	const refValue = values[field.requiredWhen.envKey]?.trim() ?? "";
	const inList = field.requiredWhen.values.includes(refValue);
	return field.requiredWhen.mode === "notIn" ? !inList : inList;
}

/** 已配置条目是否缺少必填密钥 */
export function missingRequiredSecrets(preset: BuiltinMcpPreset, config: McpServerConfigData): BuiltinMcpSecretField[] {
	const env =
		config.type === "http" ? (config.managedRuntimeId ? config.managedRuntimeEnv : config.headers) : config.env;
	const secrets =
		preset.secrets?.filter(
			(field) => isSecretFieldVisible(field, env ?? {}) && isSecretFieldRequired(field, env ?? {}),
		) ?? [];
	return secrets.filter((field) => !env?.[field.envKey]?.trim());
}

/** 把存储值按模板还原成用户原始输入（用于回填编辑框）；不匹配时原样返回。 */
function stripSecretTemplate(stored: string, template?: string): string {
	if (!template) return stored;
	const [prefix, suffix] = template.split("{value}");
	if (prefix !== undefined && suffix !== undefined && stored.startsWith(prefix) && stored.endsWith(suffix)) {
		return stored.slice(prefix.length, stored.length - suffix.length);
	}
	return stored;
}

export function existingSecretValues(preset: BuiltinMcpPreset, config: McpServerConfigData): Record<string, string> {
	const env =
		config.type === "http" ? (config.managedRuntimeId ? config.managedRuntimeEnv : config.headers) : config.env;
	const values: Record<string, string> = {};
	for (const field of preset.secrets ?? []) {
		const current = env?.[field.envKey];
		if (current) values[field.envKey] = stripSecretTemplate(current, field.valueTemplate);
	}
	return values;
}

/** 添加前必须粘贴密钥 */
export function presetRequiresSecrets(preset: BuiltinMcpPreset): boolean {
	return preset.secrets?.some((field) => field.required) ?? false;
}

/**
 * 添加后首次使用走浏览器登录，无需先填 Key。
 * （有 setup 说明、且没有必填密钥）
 */
export function presetUsesBrowserAuth(preset: BuiltinMcpPreset): boolean {
	return preset.browserAuth ?? (Boolean(preset.setupGuideKey) && !presetRequiresSecrets(preset));
}
