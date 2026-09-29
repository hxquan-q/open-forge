// Copyright The Open Forge contributors.
import { definePlugin } from "@vetta-org/plugin-sdk";

/**
 * 纯预设插件：AllstarCoding 流水线的全部资产（队长/辅助者 persona、团队任务书、
 * 11 个阶段技能）都由 plugin.json 的 `agent.*` 声明面承载，宿主装载 manifest 时铺设。
 * 入口只为满足 Module Federation 的 entry 约定，运行时无贡献。
 */
export default definePlugin({
	activate() {},
});
