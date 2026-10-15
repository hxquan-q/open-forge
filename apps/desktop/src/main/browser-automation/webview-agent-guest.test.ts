// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { evaluateInjectedGuestScript } from "../../test/injected-guest-script.js";
import {
	BROWSER_TAB_SNAPSHOT_LIMIT,
	buildBrowserTabGuestScript,
	collectInAppBrowserSnapshotNodes,
	findInAppBrowserElementByXPath,
} from "./webview-agent-guest.js";

function withDocument(html: string, run: (document: Document) => void): void {
	const parser = new DOMParser();
	run(parser.parseFromString(`<html><body>${html}</body></html>`, "text/html"));
}

describe("应用内 WebView guest 快照", () => {
	it("无 id 的同类元素生成可区分的 xpath，且可回查到原元素", () => {
		withDocument("<div><button>甲</button><button>乙</button></div>", (document) => {
			const { nodes } = collectInAppBrowserSnapshotNodes(document, false);
			expect(nodes).toHaveLength(2);
			expect(nodes[0]!.xpath).not.toBe(nodes[1]!.xpath);
			expect(findInAppBrowserElementByXPath(document, nodes[0]!.xpath)?.textContent).toBe("甲");
			expect(findInAppBrowserElementByXPath(document, nodes[1]!.xpath)?.textContent).toBe("乙");
		});
	});

	it("唯一 id 元素走 id 定位", () => {
		withDocument('<button id="save">保存</button><button>取消</button>', (document) => {
			const { nodes } = collectInAppBrowserSnapshotNodes(document, false);
			expect(nodes[0]!.xpath).toBe('//*[@id="save"]');
			expect(findInAppBrowserElementByXPath(document, nodes[0]!.xpath)?.textContent).toBe("保存");
		});
	});

	it("超过上限时截断并标记 truncated", () => {
		const buttons = Array.from({ length: BROWSER_TAB_SNAPSHOT_LIMIT + 5 }, (_, i) => `<button>b${i}</button>`).join(
			"",
		);
		withDocument(buttons, (document) => {
			const { nodes, truncated } = collectInAppBrowserSnapshotNodes(document, false);
			expect(nodes).toHaveLength(BROWSER_TAB_SNAPSHOT_LIMIT);
			expect(truncated).toBe(true);
		});
	});

	it("注入脚本整段求值返回快照（与 executeJavaScript 同一入口）", () => {
		document.body.innerHTML = `<button id="go">Go</button><input placeholder="邮箱">`;
		const result = evaluateInjectedGuestScript(
			buildBrowserTabGuestScript({ kind: "snapshot", interactiveOnly: false }),
		) as {
			nodes: { name: string; xpath: string }[];
		};
		expect(result.nodes.map((node) => node.name)).toEqual(["Go", "邮箱"]);
		expect(findInAppBrowserElementByXPath(document, result.nodes[0]!.xpath)?.textContent).toBe("Go");
	});

	it("interactiveOnly 过滤零尺寸元素", () => {
		withDocument("<button>可见</button><button>隐藏</button>", (document) => {
			const buttons = document.querySelectorAll("button");
			(buttons[0] as HTMLElement).getBoundingClientRect = () => ({ x: 0, y: 0, width: 10, height: 10 }) as DOMRect;
			const { nodes } = collectInAppBrowserSnapshotNodes(document, true);
			expect(nodes.map((node) => node.name)).toEqual(["可见"]);
		});
	});
});
