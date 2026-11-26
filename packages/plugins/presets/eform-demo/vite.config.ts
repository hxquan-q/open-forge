// Copyright The Open Forge contributors.
import { vettaPluginFederation } from "@vetta-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vettaPluginFederation({ name: "eform_demo", entry: "./src/index.ts" })],
});
