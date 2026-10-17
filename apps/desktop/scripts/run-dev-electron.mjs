// Modified by The Open Forge contributors.
import { spawn } from "node:child_process";
import { Socket } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import electronPath from "electron";
import { resolveSystemPluginSelection } from "./stage-system-plugins.mjs";

const projectRoot = join(import.meta.dirname, "..");

function resolveRendererPort() {
	const rawPort = process.env.VETTA_DESKTOP_DEV_PORT ?? "3020";
	const port = Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`Invalid VETTA_DESKTOP_DEV_PORT: ${rawPort}`);
	}
	return port;
}

function waitForExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		// 用 close 而非 exit：stderr 的 FATAL 行可能在 exit 之后才派发完。
		child.once("close", (code, signal) => resolve({ code, signal }));
	});
}

export async function waitForRendererPort(
	port,
	{ timeoutMs = 120_000, retryIntervalMs = 100 } = {},
) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await canConnect(port)) return;
		await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
	}
	throw new Error(`Timed out after ${timeoutMs}ms waiting for renderer port 127.0.0.1:${port}`);
}

function canConnect(port) {
	return new Promise((resolve) => {
		const socket = new Socket();
		const finish = (connected) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(connected);
		};
		socket.setTimeout(1_000);
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
		socket.once("timeout", () => finish(false));
		socket.connect(port, "127.0.0.1");
	});
}

export function resolveDevLaunchEnvironment(environment = process.env, homeDirectory = homedir()) {
	const verificationEnabled = environment.VETTA_UI_VERIFICATION === "1";
	const configDir =
		environment.VETTA_CONFIG_DIR?.trim() || (verificationEnabled ? ".openforge-ui-verify" : ".openforge-dev");
	const configuredUserDataDir = environment.VETTA_DESKTOP_USER_DATA_DIR?.trim();
	const userDataDir = configuredUserDataDir
		? resolve(configuredUserDataDir)
		: join(homeDirectory, configDir, "electron-user-data");
	return { configDir, userDataDir };
}

export function resolveDevPluginIds(
	environment = process.env,
	tenantResolver = resolveSystemPluginSelection,
) {
	if (Object.hasOwn(environment, "VETTA_PLUGIN_DEV")) {
		return environment.VETTA_PLUGIN_DEV ?? "";
	}
	const tenant = tenantResolver(environment.VETTA_TENANT, "development");
	return tenant.pluginIds ? Array.from(tenant.pluginIds).sort().join(",") : "";
}

export function resolveDevProcessEnvironment(environment = process.env) {
	return {
		...environment,
		// Keep local action/plugin iteration frictionless without weakening packaged builds.
		// Set to "0" when manually testing the approval flow in development.
		VETTA_DEV_AUTO_APPROVE_ACTIONS: environment.VETTA_DEV_AUTO_APPROVE_ACTIONS ?? "1",
	};
}

/**
 * GPU 禁用逃生开关（与本仓 canary 的捆绑旗标无关，不改变 configDir）：
 * 机器 GPU 栈异常（GPU process launch failed / 0x80000003）时，设
 * VETTA_DESKTOP_DISABLE_GPU=1 走软件合成即可日常开发；驱动恢复后移除。
 * --disable-gpu 不阻止 GPU 进程启动（Chromium 合成仍需要），须同时
 * --no-sandbox 才能在 GPU 进程反复启动失败时让 Chromium 回退软件路径。
 */
export function resolveGpuLaunchFlags(environment = process.env) {
	return environment.VETTA_DESKTOP_DISABLE_GPU === "1" ? ["--disable-gpu", "--no-sandbox"] : [];
}

const GPU_PROCESS_FAILURE_MARKERS = ["GPU process isn't usable", "GPU process launch failed"];

export function isGpuProcessFailureOutput(output) {
	return GPU_PROCESS_FAILURE_MARKERS.some((marker) => output.includes(marker));
}

/**
 * 仅当 Electron 因 GPU 进程起不来而 FATAL 退出（code 3）时回退一次：
 * `--disable-gpu-sandbox` 只关 GPU 沙箱并保留硬件加速，比软件合成侵入更小。
 * 已显式设 VETTA_DESKTOP_DISABLE_GPU=1 时不再重试。
 */
export function shouldRetryElectronWithGpuSandboxFallback(
	{ code, signal, sawGpuFailure },
	environment = process.env,
) {
	if (signal || code !== 3 || !sawGpuFailure) return false;
	return environment.VETTA_DESKTOP_DISABLE_GPU !== "1";
}

function launchElectron(electronArgs, environment) {
	let stderrTail = "";
	let sawGpuFailure = false;
	const child = spawn(electronPath, electronArgs, {
		cwd: projectRoot,
		env: environment,
		// stderr 需同时透传和识别 GPU FATAL；stdout 保持直通。
		stdio: ["inherit", "inherit", "pipe"],
	});
	child.stderr.on("data", (chunk) => {
		process.stderr.write(chunk);
		stderrTail = (stderrTail + chunk.toString("utf8")).slice(-512);
		if (!sawGpuFailure && isGpuProcessFailureOutput(stderrTail)) sawGpuFailure = true;
	});
	return { child, sawGpuFailure: () => sawGpuFailure };
}

async function main() {
	const rendererPort = resolveRendererPort();
	const rendererUrl = `http://127.0.0.1:${rendererPort}`;
	await waitForRendererPort(rendererPort);

	const { configDir, userDataDir } = resolveDevLaunchEnvironment();
	const pluginIds = resolveDevPluginIds();
	const electronSwitches = [];
	if (process.env.VETTA_UI_VERIFICATION === "1") {
		if (process.env.VETTA_DESKTOP_RUNTIME_CANARY === "1") {
			electronSwitches.push("--disable-gpu");
			electronSwitches.push("--no-sandbox");
		}
	}
	electronSwitches.push(...resolveGpuLaunchFlags());
	electronSwitches.push(`--user-data-dir=${userDataDir}`);
	const appEntry = join(projectRoot, "dist", "main", "index.js");
	const electronEnvironment = {
		...resolveDevProcessEnvironment(),
		VETTA_CONFIG_DIR: configDir,
		VETTA_DESKTOP_DEV_URL: rendererUrl,
		VETTA_PLUGIN_DEV: pluginIds,
	};

	let activeChild;
	const forwardSignal = (signal) => activeChild?.kill(signal);
	for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, forwardSignal);

	const launch = async (extraSwitches = []) => {
		const { child, sawGpuFailure } = launchElectron(
			[...electronSwitches, ...extraSwitches, appEntry],
			electronEnvironment,
		);
		activeChild = child;
		return { ...(await waitForExit(child)), sawGpuFailure: sawGpuFailure() };
	};

	try {
		let electronResult = await launch();
		if (shouldRetryElectronWithGpuSandboxFallback(electronResult)) {
			console.warn("[dev] GPU 进程无法启动，改用 --disable-gpu-sandbox 重试一次（保留硬件加速）");
			electronResult = await launch(["--disable-gpu-sandbox"]);
		}
		process.exitCode = electronResult.signal ? 1 : (electronResult.code ?? 1);
	} finally {
		for (const signal of ["SIGINT", "SIGTERM"]) process.off(signal, forwardSignal);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
