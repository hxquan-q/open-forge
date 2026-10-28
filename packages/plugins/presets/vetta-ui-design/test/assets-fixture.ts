// Copyright The Open Forge contributors.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
	PluginAgentToolHandler,
	PluginAgentToolRegistration,
	PluginContext,
	PluginFsApi,
	PluginNetworkApi,
} from "@vetta-org/plugin-sdk";
import { registerDesignTools } from "../src/tools";

// Generated 1x1 PNG sample, not a claim about photographic relevance or licensing.
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=";
export const COMMONS_ID = "File:Mountain.png";
export const WEBP = "UklGRkoAAABXRUJQVlA4ID4AAADQAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA==";
export function commonsBody(id = COMMONS_ID): unknown {
	return {
		query: {
			pages: [
				{
					title: id,
					imageinfo: [
						{
							mime: "image/png",
							width: 1,
							height: 1,
							size: 68,
							url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Mountain.png",
							thumburl:
								"https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Mountain.png/640px-Mountain.png",
							descriptionurl: "https://commons.wikimedia.org/wiki/File:Mountain.png",
							extmetadata: {
								ObjectName: { value: "Mountain" },
								Artist: { value: "<a>Test author</a>" },
								LicenseShortName: { value: "CC BY 4.0" },
								LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
								AttributionRequired: { value: "true" },
							},
						},
					],
				},
			],
		},
	};
}
export function nodeDesignFs(): PluginFsApi {
	return {
		readFile: async (path) => ({ content: await readFile(path, "utf8"), encoding: "utf8" }),
		readBinaryFile: async (path) => {
			const data = await readFile(path);
			return { data: data.toString("base64"), mimeType: "image/png", size: data.length };
		},
		writeFile: async (path, content, encoding) => {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content, encoding === "base64" ? "base64" : "utf8");
		},
		stat: async (path) => {
			try {
				const s = await stat(path);
				return { size: s.size, modifiedAt: s.mtimeMs, createdAt: s.birthtimeMs };
			} catch (e) {
				if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return null;
				throw e;
			}
		},
		rename: async (from, to) => {
			await rename(from, to);
		},
		delete: async (path) => {
			await rm(path, { recursive: true, force: true });
		},
		createDirectory: async (path) => {
			await mkdir(path, { recursive: true });
		},
		readDir: async (path) =>
			(await readdir(path, { withFileTypes: true })).map((e) => ({
				name: e.name,
				path: `${path}/${e.name}`,
				isDirectory: e.isDirectory(),
				size: 0,
				modifiedAt: 0,
			})),
		listFilesRecursive: async (root) => {
			const walk = async (path: string): Promise<{ name: string; path: string; relPath: string }[]> => {
				const out = [];
				for (const entry of await readdir(path, { withFileTypes: true })) {
					if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
					const child = `${path}/${entry.name}`;
					if (entry.isDirectory()) out.push(...(await walk(child)));
					else out.push({ name: entry.name, path: child, relPath: child.slice(root.length + 1) });
				}
				return out;
			};
			return walk(root);
		},
		saveAs: async () => null,
		watchDirectory: () => ({ dispose() {} }),
	};
}
export function assetFixture(network?: PluginNetworkApi, fs = nodeDesignFs()) {
	const handlers = new Map<string, PluginAgentToolHandler<unknown>>();
	const requested: string[] = [];
	const ctx = {
		fs,
		agent: {
			registerTool: (tool: PluginAgentToolRegistration) => {
				handlers.set(tool.name, tool.handler);
				return { dispose() {} };
			},
		},
		network:
			network ??
			({
				request: async (request) => {
					requested.push(request.url);
					return {
						ok: true,
						status: 200,
						statusText: "OK",
						headers: { "content-type": request.responseType === "base64" ? "image/png" : "application/json" },
						body: request.responseType === "base64" ? PNG : commonsBody(),
					};
				},
			} as PluginNetworkApi),
		ui: { notify() {} },
		i18n: { t: (key: string) => key },
	} as unknown as PluginContext;
	registerDesignTools(ctx);
	return {
		ctx,
		requested,
		call: async (input: unknown, name = "vetd_assets") => {
			const handler = handlers.get(name);
			if (!handler) throw new Error(`Missing tool ${name}`);
			return await handler({ host: { fs }, session: { cwd: "C:/work" }, trigger: { input } } as never);
		},
	};
}
