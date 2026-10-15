// Copyright The Open Forge contributors.
/**
 * better-sqlite3 的 API 子集垫片，底层是 Node 22+ 内建 `node:sqlite`。
 *
 * 内置 MCP server 跑在 `ELECTRON_RUN_AS_NODE=1` 的 Electron 进程里，其 Node ABI
 * 与 npm 预编译的 better-sqlite3 `.node` 不兼容（需要 electron-rebuild）。
 * universal-db-mcp 的 sqlite 适配器只用 new Database()/prepare().run|get|all/
 * pragma()/close()，node:sqlite 的 DatabaseSync 能完整覆盖。
 *
 * 差异点：node:sqlite 的 run()/get() 可能返回 BigInt（大整数列与 rowid），
 * MCP 的 JSON 序列化不认 BigInt——这里统一收窄成 Number。
 */
import { DatabaseSync } from "node:sqlite";

function toJsonSafe(value) {
	if (typeof value === "bigint") return Number(value);
	if (Array.isArray(value)) return value.map(toJsonSafe);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, toJsonSafe(v)]));
	}
	return value;
}

function wrapStatement(stmt) {
	return {
		run: (...params) => toJsonSafe(stmt.run(...params)),
		get: (...params) => toJsonSafe(stmt.get(...params)),
		all: (...params) => toJsonSafe(stmt.all(...params)),
	};
}

export default class Database {
	#db;
	constructor(path, options = {}) {
		this.#db = new DatabaseSync(path, {
			readOnly: options?.readonly === true,
			// better-sqlite3 fileMustExist:false = 不存在则创建；node:sqlite 默认即创建
		});
	}
	pragma(text) {
		// better-sqlite3: db.pragma("foreign_keys = ON")
		this.#db.exec(`PRAGMA ${text}`);
	}
	prepare(sql) {
		return wrapStatement(this.#db.prepare(sql));
	}
	exec(sql) {
		return this.#db.exec(sql);
	}
	close() {
		this.#db.close();
	}
}
