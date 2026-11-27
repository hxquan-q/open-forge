// Copyright The Open Forge contributors.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 包内测试与实现同址（src/**/*.test.ts）；显式 include 保证从包根或仓库根启动
		// 都选到同一集合。平台专属用例各自用 skipIf + 理由内联声明，不靠入口裁剪。
		include: ["src/**/*.test.ts"],
		// Windows 回环每条远端命令都要经 Git Bash 起一串进程（bash → sh → setsid/工具链），
		// 一次操作的花销在百毫秒级，4 MiB 传输这类用例 5 秒装不下。POSIX 上进程便宜，
		// 保持默认 5 秒别放松回归灵敏度。
		testTimeout: process.platform === "win32" ? 20000 : 5000,
	},
});
