// Modified by The Open Forge contributors.
import { TEAM_DELIVERED_EVENT_ID_WINDOW, type TeamMemberAssignment, type TeamSessionDocument } from "./contracts.js";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const FNV_OFFSET_HI = Number(FNV_OFFSET >> 32n);
const FNV_OFFSET_LO = Number(FNV_OFFSET & 0xffffffffn);
const FNV_PRIME_HI = 0x100; // PRIME >> 32: 0x100000001b3 = 0x100 * 2^32 + 0x1b3
const FNV_PRIME_LO = 0x1b3; // PRIME & 0xffffffff

/**
 * BigInt reference implementation; exported for tests to pin output equality.
 * Do not call this on hot paths.
 */
export function fnv64Reference(value: string, seed: bigint): string {
	let hash = seed;
	for (const byte of new TextEncoder().encode(value)) {
		hash ^= BigInt(byte);
		hash = (hash * FNV_PRIME) & MASK_64;
	}
	return hash.toString(16).padStart(16, "0");
}

/**
 * FNV-1a 64 over UTF-8 bytes using two 32-bit limbs instead of BigInt per byte.
 *
 * Every intermediate product stays below 2^49 (hi,lo < 2^32 and limbs < 2^17),
 * so float64 arithmetic is exact here. Output is byte-identical to
 * {@link fnv64Reference}; that equivalence is pinned by the projector tests.
 */
const INVERTED_OFFSET = FNV_OFFSET ^ MASK_64;
const INVERTED_OFFSET_HI = Number(INVERTED_OFFSET >> 32n);
const INVERTED_OFFSET_LO = Number(INVERTED_OFFSET & 0xffffffffn);

/**
 * Both FNV passes share one encode + one loop, so large inputs are hashed once.
 * Output is identical to calling {@link fnv64} with the two seeds separately.
 */
function fnv64Pair(value: string): [primary: string, inverted: string] {
	const bytes = new TextEncoder().encode(value);
	let primaryHi = FNV_OFFSET_HI;
	let primaryLo = FNV_OFFSET_LO;
	let invertedHi = INVERTED_OFFSET_HI;
	let invertedLo = INVERTED_OFFSET_LO;
	for (let index = 0; index < bytes.length; index += 1) {
		const byte = bytes[index];
		primaryLo = (primaryLo ^ byte) >>> 0;
		invertedLo = (invertedLo ^ byte) >>> 0;
		const primaryMiddle = primaryHi * FNV_PRIME_LO + primaryLo * FNV_PRIME_HI;
		const primaryLower = primaryLo * FNV_PRIME_LO;
		primaryLo = primaryLower % 0x100000000;
		primaryHi = (primaryMiddle + Math.floor(primaryLower / 0x100000000)) % 0x100000000;
		const invertedMiddle = invertedHi * FNV_PRIME_LO + invertedLo * FNV_PRIME_HI;
		const invertedLower = invertedLo * FNV_PRIME_LO;
		invertedLo = invertedLower % 0x100000000;
		invertedHi = (invertedMiddle + Math.floor(invertedLower / 0x100000000)) % 0x100000000;
	}
	const toHex = (hi: number, lo: number) => (BigInt(hi) * 0x100000000n + BigInt(lo)).toString(16).padStart(16, "0");
	return [toHex(primaryHi, primaryLo), toHex(invertedHi, invertedLo)];
}

export function stableTeamEventId(parts: readonly string[]): string {
	const canonical = parts.map((part) => `${part.length}:${part}`).join("|");
	const [primary, inverted] = fnv64Pair(canonical);
	return `team-v1-${primary}${inverted}`;
}
/**
 * 任务书的配置指纹。成员运行时按 (Profile 修订, 任务书指纹, 名册指纹) 判断是否需要重开，
 * 因此改团队描述这类不进提示词的编辑不会牵连成员会话，改任务书则一定生效。
 */
export function teamMemberAssignmentFingerprint(assignment: TeamMemberAssignment | undefined): string | undefined {
	if (!assignment?.responsibility && !assignment?.instructions) return undefined;
	return stableTeamEventId(["member-assignment", assignment.responsibility ?? "", assignment.instructions ?? ""]);
}
export function teamUserMessageId(teamSessionId: string, requestId: string): string {
	return stableTeamEventId(["user-message", teamSessionId, requestId]);
}

export function teamMemberResultMessageId(
	teamSessionId: string,
	requestId: string,
	memberId: string,
	sourceTurnId: string,
): string {
	return stableTeamEventId(["member-result", teamSessionId, requestId, memberId, sourceTurnId]);
}

export function teamDelegationActivityId(
	teamSessionId: string,
	requestId: string,
	sourceMemberId: string,
	targetMemberId: string,
): string {
	return stableTeamEventId(["member-delegation", teamSessionId, requestId, sourceMemberId, targetMemberId]);
}
/**
 * 成员投递回执的写入侧窗口：并集去重保序后只保留最近 limit 条。被窗口裁掉
 * 的旧 id 若再次进入投影，只会多执行一次幂等的投递标记（restoreDeliveredContext
 * 的并集本身幂等），不会重复向成员模型投递内容。
 */
export function windowTeamDeliveredEventIds(
	previous: readonly string[],
	additions: readonly string[],
	limit: number = TEAM_DELIVERED_EVENT_ID_WINDOW,
): readonly string[] {
	const seen = new Set(previous);
	const merged = [...previous];
	for (const id of additions) {
		if (seen.has(id)) continue;
		seen.add(id);
		merged.push(id);
	}
	return merged.length > limit ? merged.slice(-limit) : merged;
}

/** Updates the member's private shared-context cursor without duplicating a public message in TeamSessionDocument. */
export function markTeamMemberContextDelivered(input: {
	readonly session: TeamSessionDocument;
	readonly memberId: string;
	readonly deliveredEventIds: readonly string[];
	readonly timestamp: number;
}): TeamSessionDocument {
	const runtimeState = input.session.memberRuntime[input.memberId];
	if (!runtimeState) throw new Error(`Team member runtime not found: ${input.memberId}`);
	return {
		...input.session,
		revision: input.session.revision + 1,
		updatedAt: input.timestamp,
		memberRuntime: {
			...input.session.memberRuntime,
			[input.memberId]: {
				...runtimeState,
				deliveredEventIds: windowTeamDeliveredEventIds(runtimeState.deliveredEventIds, input.deliveredEventIds),
			},
		},
	};
}
