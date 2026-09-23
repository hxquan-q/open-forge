// Copyright The Open Forge contributors.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PermissionGrant } from "@vetta/runtime-core/task";
import { isPermissionGrantActive, permissionGrantAllows, readPermissionGrant } from "@vetta/runtime-core/task";

/**
 * Project Trust 本机存储（TASK-0016）：`.vetta-local/trust.json`。
 *
 * 只存在于项目本机目录，绝不进入共享 `.vetta/`；路径经规范化后比较；
 * 未知 schemaVersion 或损坏记录整体忽略（fail closed，不猜旧格式）；
 * 撤销写入 `revokedAt` 立即生效（读取时评估）。
 */

const TRUST_FILE_VERSION = 1;

interface TrustFileShape {
	readonly schemaVersion: number;
	readonly grants: readonly unknown[];
}

export interface NodeProjectTrustStoreOptions {
	readonly projectRoot: string;
	readonly now?: () => number;
	/** 注入以便测试；缺省走真实文件系统。 */
	readonly io?: NodeProjectTrustStoreIo;
}

export interface NodeProjectTrustStoreIo {
	read(): Promise<string | undefined>;
	write(contents: string): Promise<void>;
}

function fileIo(projectRoot: string): NodeProjectTrustStoreIo {
	const filePath = join(projectRoot, ".vetta-local", "trust.json");
	return {
		async read() {
			try {
				return await readFile(filePath, "utf8");
			} catch {
				return undefined;
			}
		},
		async write(contents) {
			const directory = dirname(filePath);
			await mkdir(directory, { recursive: true });
			// 先写临时文件再原子替换，避免并发读到半截 JSON。
			const temporary = join(directory, `.trust.${process.pid}.tmp`);
			await writeFile(temporary, contents, "utf8");
			await rename(temporary, filePath);
		},
	};
}

/** 路径规范化：统一分隔符并小写盘符，Windows 大小写不敏感比较。 */
function normalizeRoot(path: string): string {
	const resolved = resolve(path);
	return resolved.replace(/\\/g, "/").replace(/^([A-Z]):/, (match) => match.toLowerCase());
}

export class NodeProjectTrustStore {
	private readonly projectRoot: string;
	private readonly now: () => number;
	private readonly io: NodeProjectTrustStoreIo;

	constructor(options: NodeProjectTrustStoreOptions) {
		this.projectRoot = normalizeRoot(options.projectRoot);
		this.now = options.now ?? Date.now;
		this.io = options.io ?? fileIo(options.projectRoot);
	}

	/** 读取并收窄有效 grant；未知版本/损坏记录直接忽略（fail closed）。 */
	async readGrants(): Promise<readonly PermissionGrant[]> {
		const raw = await this.io.read();
		if (raw === undefined) return [];
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return [];
		}
		if (typeof parsed !== "object" || parsed === null) return [];
		const candidate = parsed as Partial<TrustFileShape>;
		if (candidate.schemaVersion !== TRUST_FILE_VERSION || !Array.isArray(candidate.grants)) return [];
		const grants: PermissionGrant[] = [];
		for (const item of candidate.grants) {
			const grant = readPermissionGrant(item);
			if (grant) grants.push(grant);
		}
		return grants;
	}

	async allows(capability: string): Promise<boolean> {
		const now = this.now();
		const grants = await this.readGrants();
		return grants.some((grant) => permissionGrantAllows(grant, capability, now));
	}

	/** 新增项目级授权；`expiresAt` 可选。返回写盘后的完整 grant 列表。 */
	async grant(input: {
		readonly capabilities: readonly string[];
		readonly expiresAt?: number;
	}): Promise<PermissionGrant> {
		const grant: PermissionGrant = {
			schemaVersion: 1,
			grantId: `grant-${crypto.randomUUID()}`,
			scope: "project",
			projectRoot: this.projectRoot,
			capabilities: [...input.capabilities],
			source: "user",
			version: String(TRUST_FILE_VERSION),
			issuedAt: this.now(),
			...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
		};
		const grants = [
			...(await this.readGrants()).filter((existing) => isPermissionGrantActive(existing, this.now())),
			grant,
		];
		await this.persist(grants);
		return grant;
	}

	/** 撤销按 id；立即写盘生效。返回是否存在该 grant。 */
	async revoke(grantId: string): Promise<boolean> {
		const grants = await this.readGrants();
		let found = false;
		const revoked = grants.map((grant) => {
			if (grant.grantId !== grantId) return grant;
			found = true;
			return { ...grant, revokedAt: this.now() };
		});
		if (found) await this.persist(revoked);
		return found;
	}

	/** 清理过期/已撤销记录；返回剩余有效数量。 */
	async prune(): Promise<number> {
		const now = this.now();
		const grants = (await this.readGrants()).filter((grant) => isPermissionGrantActive(grant, now));
		await this.persist(grants);
		return grants.length;
	}

	private async persist(grants: readonly PermissionGrant[]): Promise<void> {
		const contents: TrustFileShape = { schemaVersion: TRUST_FILE_VERSION, grants: [...grants] };
		await this.io.write(JSON.stringify(contents, null, "\t"));
	}
}
