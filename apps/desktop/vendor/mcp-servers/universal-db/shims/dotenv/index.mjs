// Copyright The Open Forge contributors.
/**
 * `dotenv` 空垫片：universal-db-mcp 的 config-loader 顶层调用 `config()` 加载 .env。
 * 内置场景下连接参数全部由宿主经 env 注入（postConnectToolCalls 之前也不需要
 * 磁盘上的 .env）；而真实 dotenv 一旦被裁剪会沿父目录解析到仓库根的 v17 副本，
 * 其 stdout 横幅（`◇ injected env … // tip:`）会把 MCP stdio 的 JSON-RPC 流弄脏，
 * 宿主按 Invalid JSON 直接判负杀进程。这里直接提供空实现。
 */
export function config() {
	return { parsed: {} };
}

export function parse() {
	return {};
}

export default { config, parse };
