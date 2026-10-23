// Modified by The Open Forge contributors.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildStagingPlan,
	MEMORY_DRIVER_NAME,
	MEMORY_DRIVER_VERSION,
	prebuildRelativePath,
	resolveMemoryDriver,
} from "./memory-native-staging.mjs";

/**
 * TASK-0371 staging 合同测试（node --test 直跑，原生加载只在 --verify/CLI 路径）：
 * 版本固定、平台 binding 定位、计划形状与 unpack 标记、非法输入拒绝。
 */

test("驱动版本与 TASK-0368/ADR-0150 契约一致", () => {
	assert.equal(MEMORY_DRIVER_NAME, "better-sqlite3");
	assert.equal(MEMORY_DRIVER_VERSION, "13.0.3");
});

test("prebuild 相对路径按平台/架构生成", () => {
	assert.equal(prebuildRelativePath("win32", "x64").replaceAll("\\", "/"), "better-sqlite3/prebuilds/win32-x64.node");
	assert.equal(prebuildRelativePath("darwin", "arm64").replaceAll("\\", "/"), "better-sqlite3/prebuilds/darwin-arm64.node");
});

test("resolveMemoryDriver 返回包根与存在的本机 binding，版本不漂移", () => {
	const driver = resolveMemoryDriver();
	assert.ok(driver.packageRoot.includes("better-sqlite3"));
	assert.ok(driver.bindingPath.endsWith(`${process.platform}-${process.arch}.node`));
	assert.equal(driver.manifest.name, MEMORY_DRIVER_NAME);
	assert.equal(driver.manifest.version, MEMORY_DRIVER_VERSION);
});

test("staging 计划包含包清单、入口与 unpack 的 binding", () => {
	const plan = buildStagingPlan({ target: "Z:/stage-target" });
	const destinations = plan.files.map((file) => file.destination.replaceAll("\\", "/"));
	assert.ok(destinations.some((destination) => destination.endsWith("better-sqlite3/package.json")));
	assert.ok(destinations.some((destination) => destination.endsWith("better-sqlite3/lib/index.js")));
	const binding = plan.files.find(
		(file) => file.unpack && file.destination.endsWith(prebuildRelativePath().replaceAll("\\", "/").split("/").pop() ?? ""),
	);
	assert.ok(binding);
	assert.ok(binding.destination.replaceAll("\\", "/").endsWith(prebuildRelativePath().replaceAll("\\", "/")));
	assert.ok(plan.unpack.includes(prebuildRelativePath().replaceAll("\\", "/")));
	assert.ok(plan.files.every((file) => !file.source.replaceAll("\\", "/").includes("better-sqlite3/node_modules")));
});

test("非法 target 拒绝", () => {
	assert.throws(() => buildStagingPlan({ target: "" }), /--target/);
	assert.throws(() => buildStagingPlan({ target: "   " }), /--target/);
});
