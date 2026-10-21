// Modified by The Open Forge contributors.
export interface ModelsConfigData {
	/** Default model identifier: "provider/modelId" */
	defaultModel?: string;
	providers: Record<
		string,
		{
			baseUrl?: string;
			/** `get` 仅返回 `***` 或外部引用；实际密钥只允许在 `set` 时短暂传入。 */
			apiKey?: string;
			/** 主进程凭据库中的不透明引用；renderer 只需原样保留。 */
			credentialRef?: string;
			api?: string;
			headers?: Record<string, string>;
			authHeader?: boolean;
			/** 供应商显示名(如 "DeepSeek"),用于 UI 分组标题等;无则回退到 provider 标识 key。 */
			displayName?: string;
			/** 来源标记。"template" = 由[[预设服务商]]填 key 采纳而来,模型列表会被定时同步覆写;无标记 = 手搓自定义,任何同步逻辑都不得触碰。 */
			source?: "template";
			/** 对应服务端模板的 provider 标识(= 模板 provider key),仅 source==="template" 时存在。 */
			templateId?: string;
			/** 供应商图标 symbol(见 CONTEXT.md「icon symbol」),客户端按此解析内置图标。可选。 */
			icon?: string;
			/** 预设服务商模型列表最近一次从上游 /models 同步的时间(ISO)。 */
			modelsSyncedAt?: string;
			/** 该服务商是否经应用代理出网；缺省跟随全局，显式 false 才排除。 */
			useProxy?: boolean;
			models?: Array<{
				id: string;
				/** 上游 API 真实模型名。远程渠道下 id=网关路由 key、modelId=上游真名；缺省回退 id。 */
				modelId?: string;
				name?: string;
				api?: string;
				reasoning?: boolean;
				reasoningLevels?: string[];
				defaultReasoningLevel?: string;
				input?: string[];
				contextWindow?: number;
				maxTokens?: number;
				/** 价格($/百万 tokens):input=输入未命中, cacheRead=输入命中, output=输出, cacheWrite=缓存写入。 */
				cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
			}>;
			modelOverrides?: Record<string, Record<string, unknown>>;
		}
	>;
}

export interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

/** 单个[[预设服务商]]:客户端内置目录条目,不含 key。 */
export interface PresetProviderInfo {
	/** 预设标识(= provider key),持久化时写入 templateId。 */
	id: string;
	displayName: string;
	api: string;
	baseUrl: string;
	/** 供应商图标 symbol。 */
	icon: string;
	/** 公共目录(models.dev)里该家的模型,免 key 可见;填 key 后由账号实际可用的列表取代。 */
	catalogModels: NonNullable<ModelsConfigData["providers"][string]["models"]>;
}

export interface PresetProvidersResult {
	providers: PresetProviderInfo[];
	/** 公共目录最近一次拉取失败的原因。仅在退到随包快照时给出。 */
	catalogError?: PresetError;
	/** 当前目录数据来自哪里:实拉/缓存 = live,随包内置快照 = snapshot。 */
	catalogSource: "live" | "snapshot";
	/** 当前目录数据的抓取时间(ISO)。 */
	catalogFetchedAt?: string;
}

/** 预设链路的结构化错误码。文案由渲染层查 i18n,主进程不产出面向用户的中文。 */
export type PresetErrorCode =
	| "unknown-provider"
	| "missing-key"
	| "invalid-key"
	| "http-status"
	| "empty-models"
	| "timeout"
	| "network";

export interface PresetError {
	code: PresetErrorCode;
	params?: Record<string, string | number>;
	/** 未翻译的原始错误信息,仅用于排查。 */
	detail?: string;
}

export interface PresetModelsResult {
	models: NonNullable<ModelsConfigData["providers"][string]["models"]>;
	error?: PresetError;
}

/** 自定义服务商可用性测试的结构化错误码；文案由渲染层查 i18n。 */
export type ProviderTestErrorCode =
	| "unknown-provider"
	| "missing-base-url"
	| "invalid-base-url"
	| "timeout"
	| "network";

export interface ProviderTestResult {
	ok: boolean;
	/** 端到端耗时（毫秒）；请求真正发出后才给出。 */
	latencyMs?: number;
	/** 上游返回的 HTTP 状态码；网络层失败时缺省。 */
	status?: number;
	/** /models 解析出的模型数，仅接口正常返回时给出。 */
	modelCount?: number;
	error?: ProviderTestErrorCode;
	/** 未翻译的原始错误信息，仅用于排查。 */
	detail?: string;
}

/** 服务商余额查询的结构化错误码；文案由渲染层查 i18n。 */
export type ProviderBalanceErrorCode =
	| "unsupported"
	| "missing-key"
	| "missing-base-url"
	| "invalid-base-url"
	| "timeout"
	| "unauthorized"
	| "http-status"
	| "network"
	| "invalid-response";

/** 单个 provider 的归一化余额。Key 只在主进程使用，本结构永不含凭据（C2）。 */
export interface ProviderBalanceResult {
	provider: string;
	/** 该 provider 是否具备余额查询能力；false 时其余字段缺省（静默降级）。 */
	supported: boolean;
	/** 余额币种（如 CNY / USD）；接口未给时缺省。 */
	currency?: string;
	/** 可用余额金额（主币种）；接口未给或解析不出时缺省。 */
	available?: number;
	/** 接口给出的「余额是否足够调用」；接口未给时缺省。 */
	isAvailable?: boolean;
	/** 查询失败的结构化错误码；成功时缺省。 */
	errorCode?: ProviderBalanceErrorCode;
}

/**
 * `GET {baseUrl}/models` 返回的单个模型。接口只保证 id；上下文窗口、能力等字段
 * 各家网关的键名与丰富程度不同，拿不到时留空。
 */
export interface FetchedProviderModel {
	id: string;
	/** 上游给的显示名；与 id 相同时省略。 */
	name?: string;
	/** 上下文窗口（tokens）。 */
	contextWindow?: number;
	/** 最大输出（tokens）。 */
	maxTokens?: number;
	vision?: boolean;
	reasoning?: boolean;
	/** 思考档位（如 low/medium/high）；网关与目录都没说时缺省。 */
	reasoningLevels?: string[];
	/** 上游归属方（`owned_by`），仅展示用。 */
	ownedBy?: string;
}

export interface DesktopModelsApi {
	get(): Promise<ModelsConfigData>;
	set(config: ModelsConfigData): Promise<void>;
	/** 主进程直接写入剪贴板；密钥明文不会作为 IPC 结果返回 renderer。 */
	copyApiKey(providerId: string): Promise<boolean>;
	fetchRemote(): Promise<RemoteProvidersResult>;
	/** 读取客户端内置的[[预设服务商]]目录(无网络请求)。 */
	listPresets(): Promise<PresetProvidersResult>;
	/** 按 key 拉取某预设服务商上游 `/models` 的模型列表。只拉不写,由调用方落盘。 */
	refreshPresetModels(providerId: string, apiKey?: string): Promise<PresetModelsResult>;
	/** 手动刷新 models.dev 公共目录(清掉失败冷却强制重拉),失败时返回可读的错误原文。 */
	refreshPresetCatalog(): Promise<{ ok: boolean; error?: PresetError; elapsedMs: number; modelCount: number }>;
	/** 公共目录后台刷新到新数据时触发,收到后重新 listPresets 即可。返回取消订阅函数。 */
	onPresetsUpdated(handler: () => void): () => void;
	/** 探测某 (provider, model) 的 baseUrl 是否可达(本地 models.json 优先,回退云端目录)。仅判可达性,任何 HTTP 响应都算通。 */
	probe(ref: { provider: string; model: string }): Promise<{ ok: boolean; message?: string; error?: string }>;
	/** 拉取本地自定义 provider 的 `GET {baseUrl}/models`，返回模型列表及其参数（网关没报的由 models.dev 目录补齐）。 */
	fetchProviderModels(providerName: string): Promise<{ models: FetchedProviderModel[]; error?: string }>;
	/** 对已保存的自定义服务商做轻量可用性测试（`GET {baseUrl}/models`），报告延迟与结构化失败原因。 */
	testProvider(providerName: string): Promise<ProviderTestResult>;
	/** 查询某 provider 的服务商余额。Key 只在主进程使用；返回值不含任何凭据。 */
	getBalance(providerId: string): Promise<ProviderBalanceResult>;
	/** 当前运行时的模型配置文件绝对路径（只读展示用；随数据根 env 覆盖/迁移变化）。 */
	configPath(): Promise<string>;
	onChanged(handler: (event: { providerIds: string[] }) => void): () => void;
}
