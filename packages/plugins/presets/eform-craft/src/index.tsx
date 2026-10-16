// Copyright The Open Forge contributors.
import { definePlugin } from "@vetta-org/plugin-sdk";

/**
 * 纯预设插件：电子表单工坊的全部行为由 plugin.json 的 `agent.*` 声明面承载
 * （eform agent persona + eform-craft 技能），宿主装载 manifest 时铺设。
 * 入口仅为满足 manifest 的 entry/moduleFederation 约定，运行时无贡献。
 */
export default definePlugin({
	activate() {},
});
