// Modified by The Open Forge contributors.

export interface McpServerCommonConfigData {
	disabled?: boolean;
	/** 按 server 原始工具名停用个别工具；停用项不进入 Agent 工具面。 */
	disabledTools?: string[];
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
	/**
	 * 连接所有权：仅对全局配置生效，`application` 会被跨工作区复用，`workspace` 保持按工作区隔离；
	 * 项目配置始终按工作区隔离。
	 */
	resourceScope?: "application" | "workspace";
	/** 仅 UI 展示用的可读名（mcp.json 里的 key 仍是真实 name）。 */
	displayName?: string;
	/** 仅 UI 展示用的描述。 */
	description?: string;
	/** 仅 UI 展示用的图标 URL（远程市场/自定义配置）。 */
	icon?: string;
}

export interface McpPostConnectToolCallData {
	/** 目标工具名（server 原始工具名）。 */
	tool: string;
	/** 参数模板：字面量或 `{env:KEY}` / `{env:KEY:number}` / `{env:KEY:boolean}`；resolve 只在宿主内存发生，不落盘。 */
	args?: Record<string, string>;
}

export interface McpStdioServerConfigData extends McpServerCommonConfigData {
	type?: "stdio";
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	/** stdio 子进程空闲回收阈值（毫秒）：超过后断开连接并回收进程，下次调用自动重连；0 表示不回收。 */
	idleTimeout?: number;
	/** 每次（重）连后由宿主依次执行的工具调用；凭据经 `{env:…}` 模板注入，不进 argv/LLM 上下文。 */
	postConnectToolCalls?: McpPostConnectToolCallData[];
}

export interface McpHttpServerConfigData extends McpServerCommonConfigData {
	type: "http";
	url: string;
	/** Desktop 安装的本地受管 HTTP runtime。普通远程 MCP 不带此字段。 */
	managedRuntimeId?: string;
	/** 仅传给受管 runtime、且必须由市场 manifest 声明允许的环境变量。 */
	managedRuntimeEnv?: Record<string, string>;
	headers?: Record<string, string>;
	/**
	 * 预注册 OAuth client_id：用于不支持 DCR 的远程 MCP（如 GitHub）。
	 * 公开客户端 + PKCE，无 client_secret；非密钥，可安全写入 mcp.json。
	 */
	oauthClientId?: string;
	/** 使用设备码流（Device Flow）而非授权码流：GitHub 等要求 secret 的服务用它免密授权。 */
	oauthDeviceFlow?: boolean;
	/** 设备码流请求的 OAuth scopes（空格分隔）。 */
	oauthScopes?: string;
}

export type McpServerConfigData = McpStdioServerConfigData | McpHttpServerConfigData;

export interface McpConfigData {
	mcpServers: Record<string, McpServerConfigData>;
}

export interface DesktopMcpApi {
	get(): Promise<McpConfigData>;
	set(config: McpConfigData): Promise<void>;
	/** 当前运行时的 mcp.json 绝对路径（只读展示用；随数据根 env 覆盖/迁移变化）。 */
	configPath(): Promise<string>;
	/**
	 * 对 type:http 的远程 MCP 发起浏览器 OAuth 授权（通用机制，不限 Notion）。
	 * 成功后 token 写入 ~/.vetta/agent/mcp-auth/<name>.json。
	 * `url` 可选：首次添加时尚未写入 mcp.json，可直接传远程 MCP 地址。
	 * `oauthClientId` 可选：不支持 DCR 的服务（如 GitHub）首次授权时透传预注册 client_id。
	 * `oauthDeviceFlow`/`oauthScopes` 可选：首次授权时透传设备码流开关与请求 scopes。
	 */
	login(
		serverName: string,
		options?: { url?: string; oauthClientId?: string; oauthDeviceFlow?: boolean; oauthScopes?: string },
	): Promise<void>;
	/** 清除该 server 的 OAuth 凭证 */
	logout(serverName: string): Promise<void>;
	/** 是否已有该 server 的 OAuth token（不探测连通性） */
	hasAuth(serverName: string): Promise<boolean>;
	/** 批量查询多个 server 的授权状态 */
	authStatus(serverNames: string[]): Promise<Record<string, boolean>>;
	/** 使用能力上游声明的状态端点检查真实登录态。 */
	getSetupLoginStatus(serverName: string): Promise<McpSetupLoginStatus>;
	/** 请求能力上游生成登录二维码；requestId 只标识本次二维码请求。 */
	startSetupLogin(serverName: string, requestId: string): Promise<McpSetupLoginStartResult>;
	/** 只取消指定的二维码请求，不影响登录状态探测或其他请求。 */
	cancelSetupLogin(requestId: string): Promise<void>;
	/** 调用上游声明的退出端点并重新读取真实登录态。 */
	clearSetupLogin(serverName: string): Promise<McpSetupLoginStatus>;
	/**
	 * 读取该 server 最近一次成功发现的工具清单（catalog 缓存，不触发连接）。
	 * `cached: false` 表示尚无发现记录。
	 */
	listServerTools(serverName: string): Promise<McpServerToolList>;
}

export interface McpServerToolListItem {
	readonly name: string;
	readonly description: string;
	readonly enabled: boolean;
	/** 在 disabledTools 中但已不在最近目录里（server 侧已改名或移除）。 */
	readonly stale: boolean;
}

export interface McpServerToolList {
	readonly tools: readonly McpServerToolListItem[];
	readonly cached: boolean;
}

export interface McpSetupLoginStatus {
	state: "authenticated" | "unauthenticated";
	username?: string;
	userId?: string;
}

export type McpSetupLoginStartResult =
	| { state: "authenticated"; username?: string; userId?: string }
	| { state: "qr_code"; image: string; expiresInSeconds: number }
	| { state: "cancelled" };

export interface McpSetupLoginQrCode {
	/** 可直接用作 <img src> 的 data URL。 */
	image: string;
	expiresInSeconds: number;
}
