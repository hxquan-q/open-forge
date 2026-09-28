import { describe, expect, it } from "vitest";
import { type ChatErrorKind, classifyChatError } from "./classifyChatError";

/**
 * 从 coding-agent `src/core/session/retry-controller.ts:70` / `:78` 逐字抄来的两条
 * 正则。这里不是要测 coding-agent，而是把「重试策略」与「文案分类」的一致性钉死：
 * 任一侧改了正则，下面的断言会先炸。抄的时候不要顺手改写。
 */
const RETRY_CONTROLLER_NON_RETRYABLE =
	/额度已用尽|额度不足|窗口额度|余额不足|Token Plan|insufficient.?quota|insufficient.?balance|quota.?exhausted|quota.?exceeded|out of quota|exceeded your current quota/i;
const RETRY_CONTROLLER_RETRYABLE =
	/overloaded|rate.?limit|too many requests|no capacity available|model.?capacity.?exhausted|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|EHOSTUNREACH|ENETUNREACH/i;

function isRetryableByController(text: string): boolean {
	if (RETRY_CONTROLLER_NON_RETRYABLE.test(text)) return false;
	return RETRY_CONTROLLER_RETRYABLE.test(text);
}

/** 真实出现过的错误样本：网关中文串、provider 原生 JSON、Node 网络错误。 */
const SAMPLES: ReadonlyArray<{ text: string; kind: ChatErrorKind }> = [
	// quota
	{ text: "429 Token Plan 5h 窗口额度已用尽，将于 2026-08-06 18:00 重置", kind: "quota" },
	{ text: "余额不足，请充值后重试", kind: "quota" },
	{ text: '{"error":{"type":"insufficient_quota","message":"You exceeded your current quota"}}', kind: "quota" },
	// auth
	{ text: "401 Unauthorized", kind: "auth" },
	{ text: '{"error":{"type":"authentication_error","message":"invalid x-api-key"}}', kind: "auth" },
	{ text: "No API key found for provider anthropic", kind: "auth" },
	// rate_limit
	{ text: '429 {"error":{"type":"rate_limit_exceeded"}}', kind: "rate_limit" },
	{ text: '{"type":"overloaded_error","message":"Overloaded"}', kind: "rate_limit" },
	// server
	{ text: "500 Internal Server Error", kind: "server" },
	{ text: "503 Service Unavailable", kind: "server" },
	{
		text: '{"error":{"message":"No capacity available for model gpt-oss-120b-medium","details":[{"reason":"MODEL_CAPACITY_EXHAUSTED"}]}}',
		kind: "server",
	},
	{ text: "upstream connect error or disconnect/reset before headers", kind: "server" },
	// network
	{ text: "TypeError: fetch failed", kind: "network" },
	{ text: "connect ECONNREFUSED 127.0.0.1:8080", kind: "network" },
	{ text: "terminated", kind: "network" },
	// stream_idle：provider 流停滞换连（连接还在，只是上游不再吐字）
	{ text: "Provider stream stalled: no events for 180000ms (stream_idle_timeout)", kind: "stream_idle" },
	// unknown
	{ text: "Assistant response ended with error", kind: "unknown" },
	{ text: "", kind: "unknown" },
];

describe("classifyChatError", () => {
	for (const { text, kind } of SAMPLES) {
		it(`归类「${text.slice(0, 40) || "(空串)"}」→ ${kind}`, () => {
			expect(classifyChatError(text)).toBe(kind);
		});
	}

	it("配额类必须与 retry-controller 的「不可重试」一致", () => {
		for (const { text, kind } of SAMPLES) {
			if (kind !== "quota") continue;
			expect(isRetryableByController(text), text).toBe(false);
		}
	});

	it("限流 / 服务端 / 网络类必须落在 retry-controller 的「可重试」里", () => {
		for (const { text, kind } of SAMPLES) {
			if (kind !== "rate_limit" && kind !== "server" && kind !== "network") continue;
			expect(isRetryableByController(text), text).toBe(true);
		}
	});

	it("流停滞不因 timeout 子串被误判成断网", () => {
		// 回归：`stream_idle_timeout` 含 `timeout`，曾被 NETWORK 抢先命中而显示「网络没连上」。
		const text = "Provider stream stalled: no events for 180000ms (stream_idle_timeout)";
		expect(classifyChatError(text)).toBe("stream_idle");
		expect(classifyChatError(text)).not.toBe("network");
	});

	it("真实断网样本仍归 network", () => {
		// 反向保护：把停滞从 network 摘出来，不能顺手把网络类一起改窄。
		expect(classifyChatError("request timed out")).toBe("network");
		expect(classifyChatError("connect ETIMEDOUT 10.0.0.1:443")).toBe("network");
	});
});
