// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { parseChunkContent } from "./chunkContent";

/**
 * chunk 原文切段纯函数(F3 v2;07-acceptance-fixes.md)。
 *
 * 夹具取用户实机样本(采购管理操作手册正文节选)与 t00-run/chunk-probe.json 的 minio 形态。
 */

const MINIO_REF = "minio://images/10001/exports/bdf7b7cd-6fbf-4463-8eb0-ff7a100f7298.png";
// 用户实机样本:正文 + alt 为空的 markdown 图片(minio 内部对象地址)。
const REAL_SAMPLE = `打开采购价目表-下推采购调价表如图所示。![](${MINIO_REF})`;

describe("parseChunkContent · markdown 图片语法", () => {
	it("alt 为空的 minio 图片切成 image 段,正文逐字保留(实机样本)", () => {
		expect(parseChunkContent(REAL_SAMPLE)).toEqual([
			{ type: "text", text: "打开采购价目表-下推采购调价表如图所示。" },
			{ type: "image", ref: MINIO_REF },
		]);
	});

	it("alt 有值也丢弃(07 取简裁定),ref 仍取 minio 原串", () => {
		expect(parseChunkContent("见 ![产品截图](minio://a/b.png) 图。")).toEqual([
			{ type: "text", text: "见 " },
			{ type: "image", ref: "minio://a/b.png" },
			{ type: "text", text: " 图。" },
		]);
	});

	it("带 title 的图片语法只取 url,title 丢弃", () => {
		expect(parseChunkContent('![x](minio://a/b.png "标题")')).toEqual([{ type: "image", ref: "minio://a/b.png" }]);
	});

	it("非 minio 的图片语法(外链)降级为 placeholder,不发起取图", () => {
		expect(parseChunkContent("![x](https://example.com/a.png)")).toEqual([{ type: "placeholder" }]);
	});

	it("同一正文多图各自成段,位置与前后文本不变", () => {
		expect(parseChunkContent("A![](minio://x/1.png)B![alt](minio://y/2.png)C")).toEqual([
			{ type: "text", text: "A" },
			{ type: "image", ref: "minio://x/1.png" },
			{ type: "text", text: "B" },
			{ type: "image", ref: "minio://y/2.png" },
			{ type: "text", text: "C" },
		]);
	});

	it("普通链接语法(无前导 !)不误伤,保持纯文本", () => {
		const text = "[说明](https://example.com/doc)";
		expect(parseChunkContent(text)).toEqual([{ type: "text", text }]);
	});
});

describe("parseChunkContent · 裸 minio 串", () => {
	it("非 markdown 包裹的 minio 串切成 placeholder,正文两侧保留", () => {
		expect(parseChunkContent("附件 minio://images/10001/exports/44cb4d70.png 已上传")).toEqual([
			{ type: "text", text: "附件 " },
			{ type: "placeholder" },
			{ type: "text", text: " 已上传" },
		]);
	});

	it("minio 串尾部的中文句读留在占位之后的文本段", () => {
		expect(parseChunkContent("如图 minio://images/10001/exports/a.png。")).toEqual([
			{ type: "text", text: "如图 " },
			{ type: "placeholder" },
			{ type: "text", text: "。" },
		]);
	});
});

describe("parseChunkContent · 边界与零副作用", () => {
	it("空串切成空段", () => {
		expect(parseChunkContent("")).toEqual([]);
	});

	it("无图片/无 minio 的正文逐字落在单个 text 段(零改动)", () => {
		const plain = "第一行 **不是加粗** <b>不是标签</b>\n第二行 <kb 也不是标签";
		expect(parseChunkContent(plain)).toEqual([{ type: "text", text: plain }]);
	});
});
