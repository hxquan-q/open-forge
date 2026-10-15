// Copyright The Open Forge contributors.
// 任意抛值的单行诊断描述——给 log.error/log.warn 的 fields 对象当值用。
// 此前的两处反模式：非 Error 抛值 `String(error)` → "[object Object]"；只记
// `error.name` → 有名字没原因。本工具把三类输入都落到可读的一行。

import { inspect } from "node:util";
import type { ErrorChainNode } from "./format-error-chain.js";
import { formatErrorChainJSON } from "./format-error-chain.js";

const MAX_DESCRIBE_LENGTH = 500;

/**
 * Error：`Name: message`，沿 cause 链追加 `; caused by: Name: message`，
 * 附带 code/errno/address/port 元数据（ECONNREFUSED 类网络错误的关键信息）。
 * string 直通；其余值走 `util.inspect` 摘要——普通对象得到 `{ code: 'X' }`
 * 而不是 `[object Object]`。输出截断到 500 字符防单行爆长。
 */
export function describeError(error: unknown): string {
	const text =
		error instanceof Error
			? describeErrorChain(error)
			: typeof error === "string"
				? error
				: inspect(error, { depth: 3, breakLength: 120 });
	return text.length > MAX_DESCRIBE_LENGTH ? `${text.slice(0, MAX_DESCRIBE_LENGTH)}…` : text;
}

function describeErrorChain(error: Error): string {
	const parts: string[] = [];
	let node: ErrorChainNode | undefined = formatErrorChainJSON(error);
	while (node) {
		const meta = [
			node.code ? `code=${node.code}` : "",
			node.errno !== undefined ? `errno=${node.errno}` : "",
			node.address ? `address=${node.address}` : "",
			node.port !== undefined ? `port=${node.port}` : "",
		]
			.filter(Boolean)
			.join(", ");
		parts.push(`${node.name}: ${node.message}${meta ? ` [${meta}]` : ""}`);
		node = node.cause;
	}
	return parts.join("; caused by: ");
}
