// Copyright The Open Forge contributors.
import { definePlugin } from "@vetta-org/plugin-sdk";
import { activateFence } from "./fence";

/**
 * 预设插件 + 事中拦截层：AllstarCoding 流水线的全部资产（队长/辅助者 persona、团队任务书、
 * 11 个阶段技能）由 plugin.json 的 `agent.*` 声明面承载，宿主装载 manifest 时铺设；
 * activate 里挂 ac-fence（PreToolUse 事中围栏，越权工具调用在执行前按契约 scope 判定拦截）。
 */
export default definePlugin({
	activate(ctx) {
		return activateFence(ctx);
	},
});
