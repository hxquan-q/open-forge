// Modified by The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	applyConversationDocumentCommand,
	applyStoredEventToConversationDocument,
	type ConversationDocument,
	type ConversationDocumentCommand,
	type ConversationDocumentCommandResult,
	type ConversationDocumentEntry,
	type ConversationDocumentForkResult,
	type ConversationDocumentStore,
	conversationDocumentEntry,
	createEmptyConversationDocument,
	createSeededConversationDocument,
	extractConversationEntryText,
	resolveConversationUserTurnTip,
	selectConversationDocumentEntries,
	selectConversationDocumentModelMessages,
} from "@vetta/runtime-core/conversation";
import {
	type AppendResult,
	type ContinueConversationInput,
	type ConversationContinuationResult,
	type ConversationContinuationStore,
	type ConversationMetadata,
	type ConversationRepository,
	type ConversationSnapshot,
	type CreateConversationInput,
	FailInterruptedTurnRecoveryPolicy,
	type StoredConversation,
	type StoredSessionEvent,
} from "@vetta/runtime-core/kernel";
import {
	CONVERSATION_SCHEMA_VERSION,
	CONVERSATION_STORAGE_ERROR_CODES,
	type ConversationContinuationSeedRecord,
	type ConversationDocumentOperationRecord,
	type ConversationEventRecord,
	type ConversationFileHeader,
	type ConversationSnapshotRecord,
	ConversationStorageError,
	isConversationContinuationSeedRecord,
	isConversationDocumentCommand,
	isConversationSnapshot,
} from "@vetta/runtime-storage/conversation";
import {
	conversationFromFile,
	createDocumentEntryReference,
	documentFromFile,
	encodeConversationSessionId,
	type ParsedConversationFile,
	parseConversationFile,
	serializeConversationLine,
	validateConversationEvent,
} from "./conversation-file-codec.js";
import { acquireConversationFileLock } from "./conversation-file-lock.js";
import { publishConversationFileExclusive } from "./conversation-file-publisher.js";
import { type ConversationAppendState, ConversationWriteCache } from "./conversation-write-cache.js";
import { nodeErrorCode } from "./node-error-code.js";

export interface FileConversationRepositoryOptions {
	readonly rootDir: string;
	/**
	 * 追加写入与文档读取共用的会话数缓存上限（LRU）。每个活跃会话保留一份已解析
	 * document，使长会话的每次事件追加与文档读取不必全量重读 JSONL；缺省 16，
	 * 必须是正整数。
	 */
	readonly documentCacheLimit?: number;
}

export class FileConversationRepository
	implements ConversationRepository, ConversationDocumentStore, ConversationContinuationStore
{
	private readonly rootDir: string;
	private readonly queues = new Map<string, Promise<void>>();
	private readonly writeCache: ConversationWriteCache;
	private closed = false;

	constructor(options: FileConversationRepositoryOptions) {
		this.rootDir = resolve(options.rootDir);
		this.writeCache = new ConversationWriteCache({ limit: options.documentCacheLimit ?? 16 });
	}

	/** Stable absolute path used by a composition root as the session identity path. */
	resolveConversationPath(sessionId: string): string {
		return this.conversationPath(sessionId);
	}

	/** Stable absolute directory containing this repository's session artifacts. */
	resolveSessionDirectory(): string {
		return this.rootDir;
	}

	async create(input: CreateConversationInput): Promise<ConversationMetadata> {
		this.assertOpen();
		return this.exclusive(input.sessionId, async () => {
			await this.ensureRoot();
			const header: ConversationFileHeader = {
				recordType: "conversation.header",
				schemaVersion: CONVERSATION_SCHEMA_VERSION,
				sessionId: input.sessionId,
				createdAt: input.createdAt,
				...(input.agentId ? { agentId: input.agentId } : {}),
				...(input.cwd ? { cwd: input.cwd } : {}),
			};
			const path = this.conversationPath(input.sessionId);
			try {
				await publishConversationFileExclusive(path, serializeConversationLine(header));
			} catch (error) {
				if (nodeErrorCode(error) === "EEXIST") {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS,
						`Conversation already exists: ${input.sessionId}`,
						{ cause: error },
					);
				}
				throw error;
			}
			return {
				sessionId: input.sessionId,
				createdAt: input.createdAt,
				version: 0,
			};
		});
	}

	async load(sessionId: string): Promise<StoredConversation> {
		this.assertOpen();
		return this.exclusive(sessionId, () => this.withFileLock(sessionId, () => this.readConversation(sessionId)));
	}

	/**
	 * 锁内读取文档：命中写入缓存时复用已解析 document（长会话的每命令/每 turn
	 * 读取不再全量重读 JSONL），未命中全量读取并刷新缓存供后续读写复用。
	 */
	async readDocument(sessionId: string): Promise<ConversationDocument> {
		this.assertOpen();
		// 读路径与追加路径共用缓存：文件未变时直接返回已物化的 document，
		// 不再为每条命令/每轮 turn 重新解析整个 JSONL（BUG-0127）。
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const state = await this.loadAppendState(sessionId);
				return state.document;
			}),
		);
	}

	async execute(
		sessionId: string,
		expectedRevision: number | null,
		command: ConversationDocumentCommand,
	): Promise<ConversationDocumentCommandResult> {
		this.assertOpen();
		if (!isConversationDocumentCommand(command)) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
				`Command for ${sessionId} does not match the conversation document command schema`,
			);
		}
		if (
			expectedRevision === null &&
			command.type !== "session.name.set" &&
			command.type !== "custom.append" &&
			command.type !== "entry.label.set"
		) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
				`Command ${command.type} requires an expected conversation document revision`,
			);
		}
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const state = await this.loadAppendState(sessionId);
				if (state.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.READ_ONLY,
						`Conversation ${sessionId} uses read-only schema version ${state.schemaVersion}`,
					);
				}
				if (expectedRevision !== null && state.document.revision !== expectedRevision) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.DOCUMENT_VERSION_CONFLICT,
						`Conversation document ${sessionId} is at revision ${state.document.revision}, expected ${expectedRevision}`,
					);
				}
				const result = applyConversationDocumentCommand(state.document, command);
				if (!result.changed) return result;
				const record: ConversationDocumentOperationRecord = {
					recordType: "conversation.document.operation",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					revision: result.document.revision,
					command,
				};
				const serialized = serializeConversationLine(record);
				await appendFile(this.conversationPath(sessionId), serialized, "utf8");
				this.writeCache.write(sessionId, {
					byteSize: state.byteSize + Buffer.byteLength(serialized, "utf8"),
					schemaVersion: state.schemaVersion,
					document: result.document,
					eventCount: state.eventCount,
				});
				return result;
			}),
		);
	}

	async fork(sessionId: string, entryId: string): Promise<ConversationDocumentForkResult> {
		this.assertOpen();
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const file = await this.readConversationFile(sessionId);
				if (file.header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.READ_ONLY,
						`Conversation ${sessionId} uses read-only schema version ${file.header.schemaVersion}`,
					);
				}
				return this.writeFork(sessionId, entryId, file);
			}),
		);
	}

	async continueConversation(input: ContinueConversationInput): Promise<ConversationContinuationResult> {
		this.assertOpen();
		return this.exclusive(input.sourceSessionId, () =>
			this.withFileLock(input.sourceSessionId, async () => {
				const sourceFile = await this.readConversationFile(input.sourceSessionId);
				if (sourceFile.header.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.READ_ONLY,
						`Conversation ${input.sourceSessionId} uses read-only schema version ${sourceFile.header.schemaVersion}`,
					);
				}
				const sourceConversation = conversationFromFile(input.sourceSessionId, sourceFile);
				if (sourceConversation.version !== input.expectedVersion) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
						`Conversation ${input.sourceSessionId} is at version ${sourceConversation.version}, expected ${input.expectedVersion}`,
					);
				}
				const recoveryPlan = new FailInterruptedTurnRecoveryPolicy().plan(sourceConversation);
				if (recoveryPlan.status !== "interrupt" || recoveryPlan.turnId !== input.turnId) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
						`Conversation ${sourceConversation.sessionId} cannot continue inactive turn ${input.turnId}`,
					);
				}

				const sourceDocument = documentFromFile(input.sourceSessionId, sourceFile);
				const carried = buildContinuationEntries(sourceDocument);
				if (!carried) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND,
						`Conversation ${input.sourceSessionId} has no compaction boundary to continue from`,
					);
				}

				const sessionId = randomUUID();
				const sourceSessionPath = this.conversationPath(input.sourceSessionId);
				const sessionPath = this.conversationPath(sessionId);
				const header: ConversationFileHeader = {
					recordType: "conversation.header",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					sessionId,
					createdAt: input.timestamp,
					agentId: sourceFile.header.agentId,
					cwd: sourceFile.header.cwd,
					parentSessionPath: sourceSessionPath,
					parentEntryId: carried.sourceEntryId,
				};
				const seedCandidate: unknown = {
					recordType: "conversation.continuation.seed",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					sourceSessionId: input.sourceSessionId,
					sourceSessionPath,
					sourceEntryId: carried.sourceEntryId,
					reason: input.reason,
					entries: carried.entries,
					activeLeafId: carried.activeLeafId,
				};
				if (!isConversationContinuationSeedRecord(seedCandidate)) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
						`Conversation ${input.sourceSessionId} produced an invalid continuation seed`,
					);
				}
				const seed: ConversationContinuationSeedRecord = seedCandidate;
				const continuedEvent = {
					type: "turn.continued",
					sessionId,
					turnId: input.turnId,
					sourceSessionId: input.sourceSessionId,
					snapshotId: input.snapshotId,
					reason: input.reason,
					timestamp: input.timestamp,
				} as const;
				const continuedRecord = {
					recordType: "conversation.event",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					sequence: 1,
					event: continuedEvent,
					documentEntry: null,
				} satisfies ConversationEventRecord;
				const transferredEvent = {
					type: "turn.transferred",
					sessionId: input.sourceSessionId,
					turnId: input.turnId,
					targetSessionId: sessionId,
					reason: input.reason,
					timestamp: input.timestamp,
				} as const;
				const transferredRecord = {
					recordType: "conversation.event",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					sequence: input.expectedVersion + 1,
					event: transferredEvent,
					documentEntry: null,
				} satisfies ConversationEventRecord;
				validateConversationEvent(sessionId, continuedEvent);
				validateConversationEvent(input.sourceSessionId, transferredEvent);

				const seedDocument = createSeededConversationDocument(
					{
						sessionId,
						createdAt: input.timestamp,
						agentId: header.agentId,
						cwd: header.cwd,
						parentSessionPath: sourceSessionPath,
						parentEntryId: carried.sourceEntryId,
					},
					carried.entries,
					carried.activeLeafId,
				);
				const seedConversation: StoredConversation = {
					sessionId,
					createdAt: input.timestamp,
					version: 0,
					messages: selectConversationDocumentModelMessages(seedDocument),
					events: [],
				};

				await this.ensureRoot();
				let targetPublished = false;
				try {
					await publishConversationFileExclusive(
						sessionPath,
						[
							serializeConversationLine(header),
							serializeConversationLine(seed),
							serializeConversationLine(continuedRecord),
						].join(""),
					);
					targetPublished = true;
					await appendFile(sourceSessionPath, serializeConversationLine(transferredRecord), "utf8");
				} catch (error) {
					if (targetPublished) await rm(sessionPath, { force: true });
					throw error;
				} finally {
					// 源会话文件被直接追加（绕过 append 的缓存维护路径），丢弃缓存条目，
					// 下次操作回退全量读取。
					this.writeCache.drop(input.sourceSessionId);
				}

				return {
					sourceSessionId: input.sourceSessionId,
					sourceSessionPath,
					sourceVersion: input.expectedVersion + 1,
					sessionId,
					sessionDirectory: this.rootDir,
					sessionPath,
					version: 1,
					seedConversation,
					seedDocument,
					transferredEvent,
					continuedEvent,
				};
			}),
		);
	}

	async append(
		sessionId: string,
		expectedVersion: number,
		events: readonly StoredSessionEvent[],
	): Promise<AppendResult> {
		this.assertOpen();
		return this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				const state = await this.loadAppendState(sessionId);
				if (state.eventCount !== expectedVersion) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
						`Conversation ${sessionId} is at version ${state.eventCount}, expected ${expectedVersion}`,
					);
				}
				for (const event of events) validateConversationEvent(sessionId, event);
				if (events.length === 0) return { version: expectedVersion };

				let document = state.document;
				const records = events.map((event, index) => {
					const sequence = expectedVersion + index + 1;
					if (state.schemaVersion !== CONVERSATION_SCHEMA_VERSION) {
						return {
							recordType: "conversation.event" as const,
							schemaVersion: state.schemaVersion,
							sequence,
							event,
						};
					}
					const documentEntry = createDocumentEntryReference(event, sequence, document.activeLeafId);
					const record = {
						recordType: "conversation.event" as const,
						schemaVersion: CONVERSATION_SCHEMA_VERSION,
						sequence,
						event,
						documentEntry,
					} satisfies ConversationEventRecord;
					document = applyStoredEventToConversationDocument(document, event, sequence, documentEntry ?? undefined);
					return record;
				});
				const serialized = records.map(serializeConversationLine).join("");
				await appendFile(this.conversationPath(sessionId), serialized, "utf8");
				if (state.schemaVersion === CONVERSATION_SCHEMA_VERSION) {
					this.writeCache.write(sessionId, {
						byteSize: state.byteSize + Buffer.byteLength(serialized, "utf8"),
						schemaVersion: state.schemaVersion,
						document,
						eventCount: state.eventCount + events.length,
					});
				}
				return {
					version: expectedVersion + events.length,
				};
			}),
		);
	}

	async saveSnapshot(sessionId: string, snapshot: ConversationSnapshot): Promise<void> {
		this.assertOpen();
		await this.exclusive(sessionId, () =>
			this.withFileLock(sessionId, async () => {
				if (!isConversationSnapshot(snapshot)) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
						`Snapshot for ${sessionId} does not match the conversation snapshot schema`,
					);
				}
				if (snapshot.sessionId !== sessionId) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT,
						`Snapshot session ${snapshot.sessionId} does not match ${sessionId}`,
					);
				}
				const conversation = await this.readConversation(sessionId);
				if (snapshot.version !== conversation.version) {
					throw new ConversationStorageError(
						CONVERSATION_STORAGE_ERROR_CODES.VERSION_CONFLICT,
						`Snapshot version ${snapshot.version} does not match conversation version ${conversation.version}`,
					);
				}
				await this.ensureRoot();
				const record: ConversationSnapshotRecord = {
					recordType: "conversation.snapshot",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					snapshot,
				};
				const target = this.snapshotPath(sessionId);
				const temporary = `${target}.${randomUUID()}.tmp`;
				try {
					await writeFile(temporary, `${JSON.stringify(record)}\n`, {
						encoding: "utf8",
						flag: "wx",
					});
					await rename(temporary, target);
				} catch (error) {
					await rm(temporary, { force: true });
					throw error;
				}
			}),
		);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.writeCache.clear();
		await Promise.all(this.queues.values());
	}

	private async readConversation(sessionId: string): Promise<StoredConversation> {
		return conversationFromFile(sessionId, await this.readConversationFile(sessionId));
	}

	/**
	 * 锁内获取缓存物化状态，供追加写入与文档读取共用。文件字节数与缓存一致时复用
	 * 已解析 document，长会话的每次事件追加或文档读取不再全量重读 JSONL；会话文件
	 * 经本仓库只增不减，任何外部写入都会改变字节数，命中失败自动回退全量读取并刷新
	 * 缓存。旧 schema 会话不缓存，始终走全量读取以保持原有读取语义。
	 */
	private async loadAppendState(sessionId: string): Promise<ConversationAppendState> {
		const byteSize = await this.statConversationSize(sessionId);
		const cached = this.writeCache.read(sessionId, byteSize);
		if (cached) return cached;
		const file = await this.readConversationFile(sessionId);
		const state: ConversationAppendState = {
			byteSize,
			schemaVersion: file.header.schemaVersion,
			document: documentFromFile(sessionId, file),
			eventCount: file.eventRecords.length,
		};
		if (file.header.schemaVersion === CONVERSATION_SCHEMA_VERSION) this.writeCache.write(sessionId, state);
		return state;
	}

	private async statConversationSize(sessionId: string): Promise<number> {
		try {
			return (await stat(this.conversationPath(sessionId))).size;
		} catch (error) {
			if (nodeErrorCode(error) === "ENOENT") {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.NOT_FOUND,
					`Conversation not found: ${sessionId}`,
					{ cause: error },
				);
			}
			throw error;
		}
	}

	private async readConversationFile(sessionId: string): Promise<ParsedConversationFile> {
		let text: string;
		try {
			text = await readFile(this.conversationPath(sessionId), "utf8");
		} catch (error) {
			if (nodeErrorCode(error) === "ENOENT") {
				throw new ConversationStorageError(
					CONVERSATION_STORAGE_ERROR_CODES.NOT_FOUND,
					`Conversation not found: ${sessionId}`,
					{ cause: error },
				);
			}
			throw error;
		}

		return parseConversationFile(text, sessionId);
	}

	private async writeFork(
		sessionId: string,
		entryId: string,
		file: ParsedConversationFile,
	): Promise<ConversationDocumentForkResult> {
		const document = documentFromFile(sessionId, file);
		const selectedEntry = conversationDocumentEntry(document, entryId);
		const text = extractConversationEntryText(selectedEntry);
		if (
			selectedEntry.type !== "message" ||
			!isObject(selectedEntry.message) ||
			selectedEntry.message.role !== "user"
		) {
			throw new Error("Invalid entry ID for forking");
		}
		const tipId = resolveConversationUserTurnTip(document, entryId);
		const branch = selectConversationDocumentEntries(document, tipId);
		const selectedEntryIds = new Set(branch.map((entry) => entry.id));
		const selectedTurnIds = new Set(
			file.eventRecords.flatMap((record) => {
				if (
					record.schemaVersion === CONVERSATION_SCHEMA_VERSION &&
					record.documentEntry &&
					selectedEntryIds.has(record.documentEntry.id)
				) {
					return [record.event.turnId];
				}
				return [];
			}),
		);
		const newSessionId = randomUUID();
		const newPath = this.conversationPath(newSessionId);
		const sourceSessionPath = this.conversationPath(sessionId);
		const header: ConversationFileHeader = {
			recordType: "conversation.header",
			schemaVersion: CONVERSATION_SCHEMA_VERSION,
			sessionId: newSessionId,
			createdAt: Date.now(),
			agentId: file.header.schemaVersion === CONVERSATION_SCHEMA_VERSION ? file.header.agentId : undefined,
			cwd: file.header.schemaVersion === CONVERSATION_SCHEMA_VERSION ? file.header.cwd : undefined,
			parentSessionPath: sourceSessionPath,
			parentEntryId: entryId,
		};
		const finalEntries = new Map(branch.map((entry) => [entry.id, entry]));
		const sourceSeed = file.seed ?? file.continuationSeed ?? file.importSeed;
		const sourceSeedEntryIds = new Set(sourceSeed?.entries.map((entry) => entry.id) ?? []);
		const seedEntries = rewriteForkSeedEntries(
			document,
			branch.filter((entry) => sourceSeedEntryIds.has(entry.id)),
		);
		const seedCandidate: unknown =
			seedEntries.length === 0
				? undefined
				: {
						recordType: "conversation.continuation.seed",
						schemaVersion: CONVERSATION_SCHEMA_VERSION,
						sourceSessionId: sessionId,
						sourceSessionPath,
						sourceEntryId: entryId,
						reason: "fork",
						entries: seedEntries,
						activeLeafId: seedEntries.at(-1)?.id ?? null,
					};
		if (seedCandidate !== undefined && !isConversationContinuationSeedRecord(seedCandidate)) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
				`Conversation ${sessionId} produced an invalid fork seed`,
			);
		}
		const seed: ConversationContinuationSeedRecord | undefined = seedCandidate;
		const records: Array<ConversationEventRecord | ConversationDocumentOperationRecord> = [];
		const targetIdentity = {
			sessionId: newSessionId,
			createdAt: header.createdAt,
			agentId: header.agentId,
			cwd: header.cwd,
			parentSessionPath: header.parentSessionPath,
			parentEntryId: header.parentEntryId,
		};
		let targetDocument = seed
			? createSeededConversationDocument(targetIdentity, seed.entries, seed.activeLeafId)
			: createEmptyConversationDocument(targetIdentity);
		let eventSequence = 0;
		for (const source of file.records) {
			if (source.recordType === "conversation.document.operation") {
				if (source.command.type !== "custom.append" || !selectedEntryIds.has(source.command.entryId)) {
					continue;
				}
				const entry = finalEntries.get(source.command.entryId);
				if (!entry || entry.type !== "custom") continue;
				if (targetDocument.activeLeafId !== entry.parentId) {
					const selected = applyConversationDocumentCommand(targetDocument, {
						type: "active_leaf.set",
						entryId: entry.parentId,
					});
					if (selected.changed) {
						records.push({
							recordType: "conversation.document.operation",
							schemaVersion: CONVERSATION_SCHEMA_VERSION,
							revision: selected.document.revision,
							command: { type: "active_leaf.set", entryId: entry.parentId },
						});
						targetDocument = selected.document;
					}
				}
				const command = {
					type: "custom.append" as const,
					entryId: entry.id,
					customType: entry.customType,
					data: entry.data,
					timestamp: entry.timestamp,
				};
				const result = applyConversationDocumentCommand(targetDocument, command);
				records.push({
					recordType: "conversation.document.operation",
					schemaVersion: CONVERSATION_SCHEMA_VERSION,
					revision: result.document.revision,
					command,
				});
				targetDocument = result.document;
				continue;
			}
			if (!selectedTurnIds.has(source.event.turnId)) continue;
			const sourceReference = source.schemaVersion === CONVERSATION_SCHEMA_VERSION ? source.documentEntry : null;
			if (source.event.type === "message.appended" && !sourceReference) continue;
			if (sourceReference && !selectedEntryIds.has(sourceReference.id)) continue;
			const entry = sourceReference ? finalEntries.get(sourceReference.id) : undefined;
			eventSequence += 1;
			const record = {
				recordType: "conversation.event",
				schemaVersion: CONVERSATION_SCHEMA_VERSION,
				sequence: eventSequence,
				event: { ...source.event, sessionId: newSessionId },
				documentEntry: entry ? { id: entry.id, parentId: entry.parentId, timestamp: entry.timestamp } : null,
			} satisfies ConversationEventRecord;
			records.push(record);
			targetDocument = applyStoredEventToConversationDocument(
				targetDocument,
				record.event,
				record.sequence,
				record.documentEntry ?? undefined,
			);
		}
		await this.ensureRoot();
		await publishConversationFileExclusive(
			newPath,
			[
				serializeConversationLine(header),
				...(seed ? [serializeConversationLine(seed)] : []),
				...records.map(serializeConversationLine),
			].join(""),
		);
		return { sessionId: newSessionId, path: newPath, text };
	}

	private async withFileLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		await this.ensureRoot();
		const release = await acquireConversationFileLock(this.lockPath(sessionId), sessionId);
		try {
			return await operation();
		} finally {
			await release();
		}
	}

	private async ensureRoot(): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
	}

	private conversationPath(sessionId: string): string {
		return join(this.rootDir, `${encodeConversationSessionId(sessionId)}.conversation.jsonl`);
	}

	private snapshotPath(sessionId: string): string {
		return join(this.rootDir, `${encodeConversationSessionId(sessionId)}.snapshot.json`);
	}

	private lockPath(sessionId: string): string {
		return `${this.conversationPath(sessionId)}.lock`;
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new ConversationStorageError(
				CONVERSATION_STORAGE_ERROR_CODES.CLOSED,
				"Conversation repository is closed",
			);
		}
	}

	private async exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(sessionId) ?? Promise.resolve();
		let release = () => {};
		const gate = new Promise<void>((resolveGate) => {
			release = resolveGate;
		});
		const queued = previous.then(() => gate);
		this.queues.set(sessionId, queued);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.queues.get(sessionId) === queued) {
				this.queues.delete(sessionId);
			}
		}
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function rewriteForkSeedEntries(
	document: ConversationDocument,
	entries: readonly ConversationDocumentEntry[],
): readonly ConversationDocumentEntry[] {
	const selectedIds = new Set(entries.map((entry) => entry.id));
	const sourceById = new Map(document.entries.map((entry) => [entry.id, entry]));
	const resolveSelectedAncestor = (entryId: string): string | undefined => {
		let currentId: string | undefined = entryId;
		const visited = new Set<string>();
		while (currentId && !visited.has(currentId)) {
			if (selectedIds.has(currentId)) return currentId;
			visited.add(currentId);
			currentId = sourceById.get(currentId)?.parentId ?? undefined;
		}
		return undefined;
	};
	return entries.map((entry): ConversationDocumentEntry => {
		if (entry.type === "branch_summary" && entry.fromId !== "root" && !selectedIds.has(entry.fromId)) {
			return { ...entry, fromId: resolveSelectedAncestor(entry.fromId) ?? "root" };
		}
		if (entry.type === "compaction" && !selectedIds.has(entry.firstKeptEntryId)) {
			return { ...entry, firstKeptEntryId: resolveSelectedAncestor(entry.firstKeptEntryId) ?? entry.id };
		}
		if (entry.type === "label" && !selectedIds.has(entry.targetId)) {
			return {
				...entry,
				targetId: resolveSelectedAncestor(entry.targetId) ?? entry.parentId ?? entry.id,
			};
		}
		return entry;
	});
}

function buildContinuationEntries(document: ConversationDocument): {
	readonly sourceEntryId: string;
	readonly entries: readonly ConversationDocumentEntry[];
	readonly activeLeafId: string | null;
} | null {
	const branch = selectConversationDocumentEntries(document);
	let compactionIndex = -1;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry?.type === "compaction" && entry.summaryMessage) {
			compactionIndex = index;
			break;
		}
	}
	if (compactionIndex < 0) return null;
	const compaction = branch[compactionIndex];
	if (!compaction || compaction.type !== "compaction") return null;
	const firstKeptIndex = branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId);
	if (firstKeptIndex < 0 || firstKeptIndex >= compactionIndex) {
		throw new ConversationStorageError(
			CONVERSATION_STORAGE_ERROR_CODES.CORRUPT,
			`Conversation ${document.identity.sessionId} has an invalid compaction kept tail`,
		);
	}
	const carried = [compaction, ...branch.slice(firstKeptIndex, compactionIndex), ...branch.slice(compactionIndex + 1)];
	const targetIds = new Map(carried.map((entry, index) => [entry.id, `seed-${index + 1}`]));
	const entries: ConversationDocumentEntry[] = [];
	let parentId: string | null = null;
	for (const source of carried) {
		const id = targetIds.get(source.id);
		if (!id) throw new Error(`Continuation entry ID was not allocated for ${source.id}`);
		const entry = rewriteContinuationEntry(source, id, parentId, targetIds);
		entries.push(entry);
		parentId = id;
	}
	const first = entries[0];
	if (!first || first.type !== "compaction") {
		throw new Error("Continuation seed must start with a compaction entry");
	}
	const firstKeptEntryId = entries[1]?.id ?? first.id;
	entries[0] = { ...first, firstKeptEntryId };
	return {
		sourceEntryId: compaction.id,
		entries,
		activeLeafId: entries.at(-1)?.id ?? null,
	};
}

function rewriteContinuationEntry(
	entry: ConversationDocumentEntry,
	id: string,
	parentId: string | null,
	targetIds: ReadonlyMap<string, string>,
): ConversationDocumentEntry {
	switch (entry.type) {
		case "compaction":
			return { ...entry, id, parentId };
		case "branch_summary":
			return { ...entry, id, parentId, fromId: targetIds.get(entry.fromId) ?? entry.fromId };
		case "label":
			return { ...entry, id, parentId, targetId: targetIds.get(entry.targetId) ?? entry.targetId };
		case "tool_timing":
			return { ...entry, id, parentId, phases: [...entry.phases] };
		default:
			return { ...entry, id, parentId };
	}
}
