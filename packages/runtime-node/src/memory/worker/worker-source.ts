// Modified by The Open Forge contributors.

/**
 * Memory worker 引导源（TASK-0371）。
 *
 * 以字符串形式内嵌完整 SQLite 存储实现：与 TASK-0368 probe 的子探测同款
 * 仓库先例（生成源 + 显式 nativeBinding），生产消费也走同一函数，避免
 * dist/源码双入口问题。SQL 全部参数化；所有写入在短事务内完成；scope、
 * erasure epoch、expectedRevision 在事务内校验；迁移单调追加且失败回滚。
 */
export function memoryWorkerSource(): string {
	return String.raw`
"use strict";
// TASK-0371 memory worker（由 runtime-node 生成；协议见 protocol.ts）
const SCHEMA_VERSION = 1;
const ERROR_CODES = {
	INVALID_MEMORY_INPUT: "INVALID_MEMORY_INPUT",
	SCOPE_NOT_ALLOWED: "SCOPE_NOT_ALLOWED",
	REVISION_CONFLICT: "REVISION_CONFLICT",
	MEMORY_SUPPRESSED: "MEMORY_SUPPRESSED",
	SCHEMA_INCOMPATIBLE: "SCHEMA_INCOMPATIBLE",
	STORE_CLOSED: "STORE_CLOSED",
};

class WorkerError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

function scopeKey(scope) {
	return (
		scope.name +
			"|"
			+ scope.principalId
			+ "|"
			+ (scope.projectId ?? "")
			+ "|"
			+ (scope.workspaceViewId ?? "")
			+ "|"
			+ (scope.visibility ?? "user-visible")
	);
}

function isScopeAllowed(scope, allowedScopes) {
	return allowedScopes.some((entry) => scopeKey(entry) === scopeKey(scope));
}

function requireNonEmptyString(value, field) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, field + " 必须是非空字符串");
	}
	return value;
}

function isValidTime(value) {
	return value === "unknown" || /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value);
}

function isValidAt(revision, at) {
	if (revision.valid_from === "unknown" || revision.valid_to === "unknown") return false;
	if (revision.valid_from > at) return false;
	if (revision.valid_to !== "" && revision.valid_to <= at) return false;
	return true;
}

function nowIso() {
	return new Date().toISOString();
}

let db = null;
let allowedScopes = [];
let closed = false;

const MIGRATIONS = [
	{
		version: 1,
		statements: [
			"CREATE TABLE memory_schema_version (version INTEGER NOT NULL)",
			"INSERT INTO memory_schema_version (version) VALUES (1)",
			"CREATE TABLE memory_identity_bindings (binding_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, project_id TEXT, workspace_view_id TEXT, authority TEXT, lineage TEXT, created_at TEXT NOT NULL)",
			"CREATE TABLE memory_revisions (memory_id TEXT NOT NULL, revision_no INTEGER NOT NULL, revision_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, scope_name TEXT NOT NULL, visibility TEXT, status TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT NOT NULL DEFAULT '', recorded_at TEXT NOT NULL, supersedes TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at_ms INTEGER NOT NULL, PRIMARY KEY (memory_id, revision_no))",
			"CREATE TABLE memory_sources (source_id TEXT NOT NULL, memory_id TEXT NOT NULL, revision_no INTEGER NOT NULL, role TEXT NOT NULL, content_hash TEXT, retains_excerpt INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (source_id, memory_id, revision_no))",
			"CREATE TABLE memory_erasure (id INTEGER PRIMARY KEY CHECK (id = 1), erasure_epoch INTEGER NOT NULL)",
			"INSERT INTO memory_erasure (id, erasure_epoch) VALUES (1, 0)",
			"CREATE TABLE memory_suppressed (memory_id TEXT PRIMARY KEY, suppressed_at_ms INTEGER NOT NULL)",
			"CREATE INDEX memory_revisions_scope_status ON memory_revisions(scope_name, status)",
		],
	},
];

function runMigrations(database, ceiling) {
	database.pragma("foreign_keys = ON");
	// db.transaction 自带 BEGIN/COMMIT/ROLLBACK：抛错即回滚，不破坏原库。
	return database.transaction(() => {
		const hasVersionTable = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_schema_version'")
			.get();
		let version = 0;
		if (hasVersionTable) {
			const row = database.prepare("SELECT MAX(version) AS v FROM memory_schema_version").get();
			version = row && row.v != null ? row.v : 0;
		}
		if (version > SCHEMA_VERSION) {
			throw new WorkerError(
				ERROR_CODES.SCHEMA_INCOMPATIBLE,
				"数据库 schema 版本 " + version + " 高于本实现支持的 " + SCHEMA_VERSION + "；拒绝打开，不重建空库",
			);
		}
		if (ceiling !== undefined && version > ceiling) {
			throw new WorkerError(
				ERROR_CODES.SCHEMA_INCOMPATIBLE,
				"数据库 schema 版本 " + version + " 超过调用方上限 " + ceiling,
			);
		}
		for (const migration of MIGRATIONS) {
			if (migration.version <= version) continue;
			for (const statement of migration.statements) database.exec(statement);
			database.prepare("INSERT INTO memory_schema_version (version) VALUES (?)").run(migration.version);
		}
		return version;
	})();
}

function assertOpen() {
	if (closed || db === null) {
		throw new WorkerError(ERROR_CODES.STORE_CLOSED, "memory store 已关闭");
	}
}

function assertScope(scope) {
	if (!isScopeAllowed(scope, allowedScopes)) {
		throw new WorkerError(ERROR_CODES.SCOPE_NOT_ALLOWED, "作用域未授权：" + scopeKey(scope));
	}
}

function readErasure() {
	const row = db.prepare("SELECT erasure_epoch FROM memory_erasure WHERE id = 1").get();
	return {
		erasureEpoch: row ? row.erasure_epoch : 0,
		suppressedMemoryIds: db.prepare("SELECT memory_id FROM memory_suppressed").all().map((row2) => row2.memory_id),
	};
}

function assertNotSuppressed(memoryId) {
	const row = db.prepare("SELECT 1 AS hit FROM memory_suppressed WHERE memory_id = ?").get(memoryId);
	if (row) {
		throw new WorkerError(ERROR_CODES.MEMORY_SUPPRESSED, "记忆 " + memoryId + " 已被遗忘，拒绝写入");
	}
}

function parseValidFrom(value) {
	if (value === undefined) return nowIso();
	// 空串 = 开区间起点（导入的 legacy 事实：自导入起一直有效，不猜测日期）。
	if (value === "") return "";
	requireNonEmptyString(value, "validFrom");
	if (!isValidTime(value)) {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "validFrom 不是合法时间：" + value);
	}
	return value;
}

function insertSources(memoryId, revisionNo, sources) {
	if (sources === undefined) return;
	if (!Array.isArray(sources)) {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "sources 必须是数组");
	}
	const statement = db.prepare(
		"INSERT INTO memory_sources (source_id, memory_id, revision_no, role, content_hash, retains_excerpt) VALUES (?, ?, ?, ?, ?, ?)",
	);
	for (const source of sources) {
		requireNonEmptyString(source.sourceId, "source.sourceId");
		requireNonEmptyString(source.role, "source.role");
		statement.run(
			source.sourceId,
			memoryId,
			revisionNo,
			source.role,
			source.contentHash ?? null,
			source.retainsExcerpt === true ? 1 : 0,
		);
	}
}

function handleOpen(request) {
	if (db !== null && !closed) {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "store 已打开；一个 worker 只持一个库");
	}
	const options = request.nativeBinding ? { nativeBinding: request.nativeBinding } : {};
	db = new (require(request.driverModulePath))(request.databasePath, options);
	db.pragma("journal_mode = WAL");
	db.pragma("busy_timeout = 5000");
	db.pragma("foreign_keys = ON");
	allowedScopes = request.allowedScopes.map((entry) => ({ ...entry }));
	closed = false;
	runMigrations(db, request.schemaVersionCeiling);
	return { schemaVersion: SCHEMA_VERSION, sqliteVersion: db.prepare("SELECT sqlite_version() AS v").get().v };
}

function handleWrite(request) {
	assertOpen();
	assertScope(request.scope);
	const command = request.command;
	if (typeof command !== "object" || command === null) {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "记忆命令必须是对象");
	}
	const now = nowIso();
	if (command.action === "remember") {
		requireNonEmptyString(command.content, "content");
		requireNonEmptyString(command.kind, "kind");
		const validFrom = parseValidFrom(command.validFrom);
		return db.transaction(() => {
			const memoryId = "mem-" + randomId();
			db.prepare(
				"INSERT INTO memory_revisions (memory_id, revision_no, revision_id, kind, content, scope_name, visibility, status, valid_from, valid_to, recorded_at, supersedes, evidence, pinned, created_at_ms) VALUES (?, 1, ?, ?, ?, ?, ?, 'active', ?, '', ?, '', ?, ?, ?)",
			).run(
				memoryId,
				"rev-" + randomId(),
				command.kind,
				command.content,
				request.scope.name,
				request.scope.visibility ?? null,
				validFrom,
				now,
				command.evidence && ["claimed", "tool-verified", "user-confirmed"].includes(command.evidence)
					? command.evidence
					: "claimed",
				command.pinned === true ? 1 : 0,
				Date.now(),
			);
			insertSources(memoryId, 1, command.sources);
			return { memoryId, revision: 1, status: "saved" };
		})();
	}
	if (command.action === "correct") {
		requireNonEmptyString(command.memoryId, "memoryId");
		if (typeof command.expectedRevision !== "number" || !Number.isInteger(command.expectedRevision) || command.expectedRevision < 0) {
			throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "expectedRevision 必须是非负整数");
		}
		requireNonEmptyString(command.content, "content");
		const validFrom = parseValidFrom(command.validFrom);
		return db.transaction(() => {
			assertNotSuppressed(command.memoryId);
			const current = db
				.prepare("SELECT MAX(revision_no) AS n FROM memory_revisions WHERE memory_id = ?")
				.get(command.memoryId);
			const currentRevision = current && current.n != null ? current.n : 0;
			if (currentRevision === 0) {
				throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "记忆 " + command.memoryId + " 不存在");
			}
			if (command.expectedRevision !== currentRevision) {
				throw new WorkerError(
					ERROR_CODES.REVISION_CONFLICT,
					"expectedRevision " + command.expectedRevision + " 与当前修订 " + currentRevision + " 不符",
				);
			}
			const next = currentRevision + 1;
			db.prepare(
				"UPDATE memory_revisions SET status = 'superseded', valid_to = ? WHERE memory_id = ? AND revision_no = ?",
			).run(validFrom, command.memoryId, currentRevision);
			db.prepare(
				"INSERT INTO memory_revisions (memory_id, revision_no, revision_id, kind, content, scope_name, visibility, status, valid_from, valid_to, recorded_at, supersedes, evidence, pinned, created_at_ms) VALUES (?, ?, ?, 'fact', ?, ?, ?, 'active', ?, '', ?, ?, 'claimed', 0, ?)",
			).run(
				command.memoryId,
				next,
				"rev-" + randomId(),
				command.content,
				request.scope.name,
				request.scope.visibility ?? null,
				validFrom,
				now,
				"rev-of-" + currentRevision,
				Date.now(),
			);
			insertSources(command.memoryId, next, command.sources);
			return { memoryId: command.memoryId, revision: next, status: "saved" };
		})();
	}
	if (command.action === "forget") {
		requireNonEmptyString(command.memoryId, "memoryId");
		return db.transaction(() => {
			const erasure = readErasure();
			db.prepare("UPDATE memory_erasure SET erasure_epoch = ? WHERE id = 1").run(erasure.erasureEpoch + 1);
			db.prepare(
				"INSERT OR REPLACE INTO memory_suppressed (memory_id, suppressed_at_ms) VALUES (?, ?)",
			).run(command.memoryId, Date.now());
			db.prepare("DELETE FROM memory_revisions WHERE memory_id = ?").run(command.memoryId);
			db.prepare("DELETE FROM memory_sources WHERE memory_id = ?").run(command.memoryId);
			return { memoryId: command.memoryId, revision: 0, status: "saved", alsoProcessSources: command.alsoProcessSources === true };
		})();
	}
	throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "action 必须是 remember/correct/forget");
}

function handleRead(request) {
	assertOpen();
	assertScope(request.scope);
	if (typeof request.selector !== "object" || request.selector === null || typeof request.selector.asOf !== "string") {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "temporal selector.asOf 必须是时间字符串");
	}
	if (!isValidTime(request.selector.asOf) || request.selector.asOf === "unknown") {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "asOf 不是合法时间：" + String(request.selector.asOf));
	}
	if (request.selector.knownAt !== undefined && (!isValidTime(request.selector.knownAt) || request.selector.knownAt === "unknown")) {
		throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "knownAt 不是合法时间");
	}
	const rows = db.prepare("SELECT * FROM memory_revisions WHERE scope_name = ?").all(request.scope.name);
	const knownAt = request.selector.knownAt;
	return rows
		.filter((row) =>
			row.recorded_at === "unknown" ? knownAt === undefined : knownAt === undefined || row.recorded_at <= knownAt,
		)
		.filter((row) => isValidAt(row, request.selector.asOf))
		.map(toRevisionDto);
}

function toRevisionDto(row) {
	return {
		memoryId: row.memory_id,
		revisionId: row.revision_id,
		kind: row.kind,
		content: row.content,
		scopeName: row.scope_name,
		...(row.visibility == null ? {} : { visibility: row.visibility }),
		status: row.status,
		validFrom: row.valid_from,
		validTo: row.valid_to,
		recordedAt: row.recorded_at,
		supersedes: row.supersedes,
		evidence: row.evidence,
		pinned: row.pinned === 1,
	};
}

function handleListRevisions(request) {
	assertOpen();
	assertScope(request.scope);
	requireNonEmptyString(request.memoryId, "memoryId");
	const suppressed = db.prepare("SELECT 1 AS hit FROM memory_suppressed WHERE memory_id = ?").get(request.memoryId);
	if (suppressed) return [];
	return db
		.prepare("SELECT * FROM memory_revisions WHERE memory_id = ? ORDER BY revision_no")
		.all(request.memoryId)
		.map(toRevisionDto);
}

function handleListSources(request) {
	assertOpen();
	assertScope(request.scope);
	requireNonEmptyString(request.memoryId, "memoryId");
	return db
		.prepare(
			"SELECT source_id AS sourceId, role, content_hash AS contentHash, retains_excerpt AS retainsExcerpt FROM memory_sources WHERE memory_id = ?",
		)
		.all(request.memoryId)
		.map((row) => ({ ...row, retainsExcerpt: row.retainsExcerpt === 1 }));
}

function handleClose() {
	if (db !== null && !closed) {
		db.close();
	}
	closed = true;
	db = null;
	return { closed: true };
}

async function handleBackup(request) {
	assertOpen();
	requireNonEmptyString(request.destinationPath, "destinationPath");
	await db.backup(request.destinationPath);
	return { backedUp: true };
}

function randomId() {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const { parentPort, workerData } = require("node:worker_threads");
parentPort.on("message", (request) => {
	Promise.resolve()
		.then(() => {
			switch (request.type) {
				case "open":
					return handleOpen(request);
				case "write":
					return handleWrite(request);
				case "read":
					return handleRead(request);
				case "listRevisions":
					return handleListRevisions(request);
				case "listSources":
					return handleListSources(request);
				case "close":
					return handleClose();
				case "backup":
					return handleBackup(request);
				case "ping":
					return { pong: true };
				default:
					throw new WorkerError(ERROR_CODES.INVALID_MEMORY_INPUT, "未知请求类型：" + String(request.type));
			}
		})
		.then((result) => parentPort.postMessage({ ok: true, id: request.id, result }))
		.catch((error) =>
			parentPort.postMessage({
				ok: false,
				id: request.id,
				error: { code: error && error.code ? error.code : "INVALID_MEMORY_INPUT", message: String(error && error.message ? error.message : error) },
			}),
		);
});
if (workerData && workerData.readySignal) {
	parentPort.postMessage({ ok: true, id: 0, result: { ready: true } });
}
`;
}
