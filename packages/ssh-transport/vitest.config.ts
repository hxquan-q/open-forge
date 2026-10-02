// Copyright The Open Forge contributors.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 包内测试与实现同址（src/**/*.test.ts）；显式 include 保证从包根或仓库根启动
		// 都选到同一集合。平台专属用例各自用 skipIf + 理由内联声明，不靠入口裁剪。
		include: ["src/**/*.test.ts"],
	},
});
