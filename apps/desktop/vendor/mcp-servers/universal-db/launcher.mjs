// Modified by The Open Forge contributors.
//
// 内置启动器：commander 检测到 argv[0] 是 electron 可执行文件时会把
// argv.slice(1) 全部当成用户参数（Electron-as-Node 下 argv[1] 是脚本路径），
// 报「Expected 0 arguments but got 1」。把 argv 清空到只剩可执行文件，
// node 与 Electron-as-Node 下解析出的用户参数都是空 → 无连接模式启动，
// 等待 connect_database 工具调用。
process.argv = [process.argv[0]];
await import("./node_modules/universal-db-mcp/dist/index.js");
