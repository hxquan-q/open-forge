import assert from "node:assert/strict";
import test from "node:test";
import { resolveDevPluginIds, resolveDevProcessEnvironment } from "./run-dev-electron.mjs";

const tenantWithPresets = () => ({ pluginIds: new Set(["git", "browser"]) });

test("development starts plugin dev servers for every preset of the tenant by default", () => {
	assert.equal(resolveDevPluginIds({}, tenantWithPresets), "browser,git");
});

test("an empty VETTA_PLUGIN_DEV disables every plugin dev server (dev:lean)", () => {
	assert.equal(resolveDevPluginIds({ VETTA_PLUGIN_DEV: "" }, tenantWithPresets), "");
});

test("VETTA_PLUGIN_DEV limits dev servers to the listed plugins", () => {
	assert.equal(resolveDevPluginIds({ VETTA_PLUGIN_DEV: "browser" }, tenantWithPresets), "browser");
});

test("development Electron enables local action approval bypass by default", () => {
	assert.equal(resolveDevProcessEnvironment({}).VETTA_DEV_AUTO_APPROVE_ACTIONS, "1");
});

test("development approval bypass can be disabled explicitly", () => {
	assert.equal(
		resolveDevProcessEnvironment({ VETTA_DEV_AUTO_APPROVE_ACTIONS: "0" }).VETTA_DEV_AUTO_APPROVE_ACTIONS,
		"0",
	);
});
