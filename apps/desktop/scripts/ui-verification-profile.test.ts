// Modified by The Open Forge contributors.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createProfileEnvironment,
  createUiVerificationEnvironment,
  resolveProfileLayout,
  seedDebugProfile,
} from "./ui-verification-profile";

const temporaryPaths: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("UI verification profiles", () => {
  test("fresh runs never reuse their home while debug remains stable", () => {
    const root = temporaryDirectory("profiles");
    const shared = { workspaceId: "12345678", homeDirectory: root, runtimeRoot: join(root, "runtime") };
    const firstFresh = resolveProfileLayout({ ...shared, profile: "fresh", runId: "first" });
    const nextFresh = resolveProfileLayout({ ...shared, profile: "fresh", runId: "next" });
    const firstDebug = resolveProfileLayout({ ...shared, profile: "debug" });
    const nextDebug = resolveProfileLayout({ ...shared, profile: "debug" });

    expect(firstFresh.vettaHome).not.toBe(nextFresh.vettaHome);
    expect(firstDebug.vettaHome).toBe(nextDebug.vettaHome);
    expect(firstFresh.userDataDir).not.toBe(firstDebug.userDataDir);
  });

  test("dev is attach-only and points to the regular development home", () => {
    const root = temporaryDirectory("dev-profile");
    const layout = resolveProfileLayout({
      profile: "dev",
      workspaceId: "12345678",
      homeDirectory: root,
      runtimeRoot: join(root, "runtime"),
    });
    const environment = createProfileEnvironment(layout, { VETTA_UI_VERIFICATION: "stale" });

    expect(layout.statePath).toBeNull();
    expect(layout.vettaHome).toBe(join(root, ".openforge-dev"));
    expect(environment.VETTA_UI_VERIFICATION).toBeUndefined();
  });

  test("canary env keeps Desktop, host and runner on the canary home endpoint file", () => {
    const root = temporaryDirectory("canary-env");
    const layout = resolveProfileLayout({
      profile: "fresh",
      workspaceId: "12345678",
      homeDirectory: root,
      runtimeRoot: join(root, "runtime"),
      runId: "run",
    });
    const canaryHome = join(layout.runtimeDir, "runtime-canary", "fixture", "home");
    const environment = createUiVerificationEnvironment(layout, {
      agentDir: join(canaryHome, "agent"),
      vettaHome: canaryHome,
    });

    // canary 的 endpoint 必须落在 canary home，否则 runner 与 host 都找不到（BUG-0038）。
    expect(environment.VETTA_ACTION_RPC_ENDPOINT_FILE).toBe(join(canaryHome, "action-server.json"));
    expect(environment.VETTA_ACTION_RPC_ENDPOINT_FILE).not.toBe(layout.endpointFile);
    expect(environment.VETTA_HOME).toBe(canaryHome);
    expect(environment.VETTA_CODING_AGENT_DIR).toBe(join(canaryHome, "agent"));
    expect(environment.VETTA_DESKTOP_RUNTIME_CANARY).toBe("1");

    // 非 canary 仍用 Profile 自己的 endpoint 文件。
    expect(createUiVerificationEnvironment(layout).VETTA_ACTION_RPC_ENDPOINT_FILE).toBe(layout.endpointFile);
  });
});

describe("debug profile seeding", () => {
  test("copies models and only referenced encrypted model credentials", () => {
    const root = temporaryDirectory("seed");
    const sourceHome = join(root, "source");
    const targetHome = join(root, "target");
    const credentialDir = join(sourceHome, "desktop-app", "credentials");
    mkdirSync(join(sourceHome, "agent"), { recursive: true });
    mkdirSync(credentialDir, { recursive: true });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: {
        openai: { credentialRef: "openai-ref", apiKey: "plaintext-secret" },
        local: { apiKey: "env:LOCAL_MODEL_KEY" },
		command: { apiKey: "cmd:read-secret" },
      },
    });
    writeJson(join(sourceHome, "desktop-config.json"), {
      projects: ["C:/private-project"],
      language: "zh",
      defaultExecutionMode: "sandbox",
		defaultAgentMode: "coding",
      quickPanel: { triggerMode: "hotkey" },
      knowledgeBase: { enabled: true },
    });
    writeCredential(credentialDir, "referenced", "models", "openai-ref", "secret-ciphertext");
    writeCredential(credentialDir, "unreferenced", "models", "other-ref", "other-secret");
    writeCredential(credentialDir, "unrelated", "mcp", "server-ref", "mcp-secret");
    writeJson(join(sourceHome, "action-server.json"), { token: "must-not-copy" });

    const result = seedDebugProfile({
      sourceHome,
      targetHome,
      workspacePath: "C:/workspace/vetta",
    });

    expect(result).toMatchObject({ seeded: true, modelsCopied: true, credentialsCopied: 1 });
    expect(JSON.stringify(result)).not.toContain("secret-ciphertext");
    expect(readJson(join(targetHome, "agent", "models.json"))).toMatchObject({
      providers: {
			openai: { credentialRef: "openai-ref" },
			local: { apiKey: "env:LOCAL_MODEL_KEY" },
			command: {},
		},
    });
		expect(readFileSync(join(targetHome, "agent", "models.json"), "utf8")).not.toContain(
			"plaintext-secret",
		);
    expect(readJson(join(targetHome, "desktop-app", "credentials", "referenced.credential.json")))
      .toMatchObject({ ciphertext: "secret-ciphertext" });
    expect(() => readFileSync(join(targetHome, "desktop-app", "credentials", "unrelated.credential.json")))
      .toThrow();
    expect(() => readFileSync(join(targetHome, "action-server.json"))).toThrow();

    const desktopConfig = readJson(join(targetHome, "desktop-config.json")) as Record<string, unknown>;
    expect(desktopConfig).toMatchObject({
      projects: [resolve("C:/workspace/vetta")],
      notificationsEnabled: false,
      debugMode: true,
      language: "zh",
      defaultExecutionMode: "sandbox",
		defaultAgentMode: "coding",
      knowledgeBase: { enabled: false },
      quickPanel: { trigger: "none", postSendBehavior: "foreground" },
      appshot: { enabled: false },
    });
    expect(JSON.stringify(desktopConfig)).not.toContain("private-project");
  });

  test("initial seeding preserves debug edits while sync refreshes model data only", () => {
    const root = temporaryDirectory("sync");
    const sourceHome = join(root, "source");
    const targetHome = join(root, "target");
    const sourceCredentialDir = join(sourceHome, "desktop-app", "credentials");
    mkdirSync(join(sourceHome, "agent"), { recursive: true });
    mkdirSync(sourceCredentialDir, { recursive: true });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: { openai: { credentialRef: "ref-v1" } },
    });
    writeCredential(sourceCredentialDir, "v1", "models", "ref-v1", "cipher-v1");

    seedDebugProfile({ sourceHome, targetHome, workspacePath: "C:/workspace" });
    writeJson(join(targetHome, "desktop-config.json"), { marker: "debug-edit" });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: { openai: { credentialRef: "ref-v2" } },
    });
    writeCredential(sourceCredentialDir, "v2", "models", "ref-v2", "cipher-v2");

    expect(seedDebugProfile({ sourceHome, targetHome, workspacePath: "C:/workspace" }).seeded)
      .toBe(false);
    const synced = seedDebugProfile({
      sourceHome,
      targetHome,
      workspacePath: "C:/workspace",
      sync: true,
    });

    expect(synced.credentialsCopied).toBe(1);
    expect(readJson(join(targetHome, "desktop-config.json"))).toEqual({ marker: "debug-edit" });
    expect(() => readFileSync(join(targetHome, "desktop-app", "credentials", "v1.credential.json")))
      .toThrow();
    expect(readJson(join(targetHome, "desktop-app", "credentials", "v2.credential.json")))
      .toMatchObject({ ciphertext: "cipher-v2" });
  });

  // BUG-0035：Windows safeStorage 主密钥按 user-data 目录生成，只复制密文不同步
  // os_crypt.encrypted_key 时，Debug 实例解出乱码、Provider 鉴权必失败。
  test("seeded credentials carry the source os_crypt master key into target Local State", () => {
    const root = temporaryDirectory("oscrypt");
    const sourceHome = join(root, "source");
    const targetHome = join(root, "target");
    const credentialDir = join(sourceHome, "desktop-app", "credentials");
    mkdirSync(join(sourceHome, "agent"), { recursive: true });
    mkdirSync(credentialDir, { recursive: true });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: { openai: { credentialRef: "openai-ref" } },
    });
    writeCredential(credentialDir, "referenced", "models", "openai-ref", "cipher");
    mkdirSync(join(sourceHome, "electron-user-data"), { recursive: true });
    writeJson(join(sourceHome, "electron-user-data", "Local State"), {
      os_crypt: { encrypted_key: "source-master-key" },
      other_source_field: "kept",
    });

    const result = seedDebugProfile({ sourceHome, targetHome, workspacePath: "C:/workspace" });

    expect(result).toMatchObject({ seeded: true, credentialsCopied: 1, osCryptSynced: true });
    const targetLocalState = readJson(
      join(targetHome, "electron-user-data", "Local State"),
    ) as Record<string, unknown>;
    expect(targetLocalState.os_crypt).toEqual({ encrypted_key: "source-master-key" });
    expect(readJson(join(targetHome, ".ui-verification-seed.json"))).toMatchObject({
      osCryptSynced: true,
    });
  });

  test("overwriting an existing target os_crypt keeps a backup of the old key", () => {
    const root = temporaryDirectory("oscrypt-backup");
    const sourceHome = join(root, "source");
    const targetHome = join(root, "target");
    const credentialDir = join(sourceHome, "desktop-app", "credentials");
    mkdirSync(join(sourceHome, "agent"), { recursive: true });
    mkdirSync(credentialDir, { recursive: true });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: { openai: { credentialRef: "openai-ref" } },
    });
    writeCredential(credentialDir, "referenced", "models", "openai-ref", "cipher");
    mkdirSync(join(sourceHome, "electron-user-data"), { recursive: true });
    writeJson(join(sourceHome, "electron-user-data", "Local State"), {
      os_crypt: { encrypted_key: "source-master-key" },
    });
    const targetLocalStatePath = join(targetHome, "electron-user-data", "Local State");
    mkdirSync(join(targetHome, "electron-user-data"), { recursive: true });
    writeJson(targetLocalStatePath, {
      os_crypt: { encrypted_key: "target-master-key" },
      target_setting: "preserved",
    });

    seedDebugProfile({ sourceHome, targetHome, workspacePath: "C:/workspace" });

    const targetLocalState = readJson(targetLocalStatePath) as Record<string, unknown>;
    expect(targetLocalState.os_crypt).toEqual({ encrypted_key: "source-master-key" });
    expect(targetLocalState.target_setting).toBe("preserved");
    expect(readJson(`${targetLocalStatePath}.os-crypt-backup.json`)).toEqual({
      os_crypt: { encrypted_key: "target-master-key" },
    });
  });

  test("does not touch target Local State when no credentials are seeded", () => {
    const root = temporaryDirectory("oscrypt-skip");
    const sourceHome = join(root, "source");
    const targetHome = join(root, "target");
    mkdirSync(join(sourceHome, "agent"), { recursive: true });
    writeJson(join(sourceHome, "agent", "models.json"), {
      providers: { local: { apiKey: "env:LOCAL_MODEL_KEY" } },
    });
    mkdirSync(join(sourceHome, "electron-user-data"), { recursive: true });
    writeJson(join(sourceHome, "electron-user-data", "Local State"), {
      os_crypt: { encrypted_key: "source-master-key" },
    });

    const result = seedDebugProfile({ sourceHome, targetHome, workspacePath: "C:/workspace" });

    expect(result).toMatchObject({ seeded: true, credentialsCopied: 0, osCryptSynced: false });
    expect(() => readFileSync(join(targetHome, "electron-user-data", "Local State"))).toThrow();
  });
});

function temporaryDirectory(name: string): string {
  const path = join(tmpdir(), `vetta-ui-profile-${name}-${crypto.randomUUID()}`);
  mkdirSync(path, { recursive: true });
  temporaryPaths.push(path);
  return path;
}

function writeCredential(
  directory: string,
  fileName: string,
  namespace: string,
  ownerId: string,
  ciphertext: string,
): void {
  writeJson(join(directory, `${fileName}.credential.json`), {
    schemaVersion: 1,
    ref: { namespace, ownerId, name: "api-key" },
    backend: "electron-safe-storage",
    ciphertext,
  });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
