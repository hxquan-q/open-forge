// Copyright The Open Forge contributors.

/**
 * TSX 源码解析（TASK-0316）：只负责把源码变成带位置的 AST。
 *
 * 编辑引擎的其余部分都在 AST 的外部边界上工作——按仓库规则不为此引入
 * `@babel/types`，节点统一以 `AstNode`（unknown 收窄）视之，结构守卫见 guards。
 */
import { parse } from "@babel/parser";

export interface ParsedSource {
	code: string;
	ast: object;
}

/** 解析失败抛带原文位置的 Error；编辑入口把它包成 `parse-error` reason。 */
export function parseTsx(code: string): ParsedSource {
	const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
	return { code, ast: ast as unknown as object };
}
