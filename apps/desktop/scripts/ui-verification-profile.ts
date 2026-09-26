// Modified by The Open Forge contributors.
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const UI_VERIFICATION_PROFILES = ["fresh", "debug", "dev"] as const;

export type UiVerificationProfile = (typeof UI_VERIFICATION_PROFILES)[number];

export interface UiVerificationProfileLayout {
  profile: UiVerificationProfile;
  workspaceId: string;
  sessionName: string;
  configDir: string;
  vettaHome: string;
  userDataDir: string;
  endpointFile: string;
  runtimeDir: string;
  statePath: string | null;
  artifactDir: string;
  logPath: string | null;
  runId: string | null;
}

export interface ResolveProfileLayoutOptions {
  profile: UiVerificationProfile;
  workspaceId: string;
  homeDirectory?: string;
  runtimeRoot?: string;
  runId?: string;
}

export interface SeedDebugProfileOptions {
  sourceHome: string;
  targetHome: string;
  workspacePath: string;
  sync?: boolean;
}

export interface SeedDebugProfileResult {
  seeded: boolean;
  modelsCopied: boolean;
  credentialsCopied: number;
  /** 是否把源实例的 safeStorage 主密钥段（Local State/os_crypt）同步给了目标。 */
  osCryptSynced: boolean;
  sourceHome: string;
  targetHome: string;
}

interface CredentialRecord {
  schemaVersion: number;
  ref: {
    namespace: string;
    ownerId: string;
    name: string;
  };
  ciphertext: string;
}

interface ModelConfig {
  providers?: Record<string, { credentialRef?: unknown; apiKey?: unknown; [key: string]: unknown }>;
	[key: string]: unknown;
}

const seedManifestName = ".ui-verification-seed.json";

export function createWorkspaceId(workspacePath: string): string {
  return createHash("sha256").update(resolve(workspacePath)).digest("hex").slice(0, 8);
}

export function parseUiVerificationProfile(value: string | undefined): UiVerificationProfile {
  const profile = value ?? "fresh";
  if (UI_VERIFICATION_PROFILES.includes(profile as UiVerificationProfile)) {
    return profile as UiVerificationProfile;
  }
  throw new Error(
    `Unknown UI verification profile: ${profile}. Expected one of ${UI_VERIFICATION_PROFILES.join(", ")}.`,
  );
}

export function resolveProfileLayout(
  options: ResolveProfileLayoutOptions,
): UiVerificationProfileLayout {
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const runtimeRoot = resolve(
    options.runtimeRoot ?? join(tmpdir(), "vetta-ui-verification", options.workspaceId),
  );
  const profileRuntimeDir = join(runtimeRoot, options.profile);

  if (options.profile === "dev") {
    const vettaHome = join(homeDirectory, ".openforge-dev");
    return {
      profile: options.profile,
      workspaceId: options.workspaceId,
      sessionName: `openforge-dev-${options.workspaceId}`,
      configDir: ".openforge-dev",
      vettaHome,
      userDataDir: join(vettaHome, "electron-user-data"),
      endpointFile: join(vettaHome, "action-server.json"),
      runtimeDir: profileRuntimeDir,
      statePath: null,
      artifactDir: join(runtimeRoot, "artifacts", "dev"),
      logPath: null,
      runId: null,
    };
  }

  const runId = options.profile === "fresh" ? options.runId ?? randomUUID() : null;
  const vettaHome =
    options.profile === "fresh"
      ? join(profileRuntimeDir, "runs", runId as string, "home")
      : join(homeDirectory, ".openforge-ui-debug", options.workspaceId);
  const configDir = `.openforge-ui-${options.profile}-${options.workspaceId}`;

  return {
    profile: options.profile,
    workspaceId: options.workspaceId,
    sessionName: `vetta-${options.profile}-${options.workspaceId}`,
    configDir,
    vettaHome,
    userDataDir: join(vettaHome, "electron-user-data"),
    endpointFile: join(profileRuntimeDir, "action-server.json"),
    runtimeDir: profileRuntimeDir,
    statePath: join(profileRuntimeDir, "host.json"),
    artifactDir: join(runtimeRoot, "artifacts", options.profile),
    logPath: join(profileRuntimeDir, "host.log"),
    runId,
  };
}

export function createProfileEnvironment(
  layout: UiVerificationProfileLayout,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const profileEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    VETTA_CONFIG_DIR: layout.configDir,
    VETTA_HOME: layout.vettaHome,
    VETTA_CODING_AGENT_DIR: join(layout.vettaHome, "agent"),
    VETTA_DESKTOP_USER_DATA_DIR: layout.userDataDir,
    VETTA_ACTION_RPC_ENDPOINT_FILE: layout.endpointFile,
    VETTA_THEME_DEV_SERVER: "0",
  };

  if (layout.profile !== "dev") {
    profileEnvironment.VETTA_UI_VERIFICATION = "1";
  } else {
    delete profileEnvironment.VETTA_UI_VERIFICATION;
  }

  return profileEnvironment;
}

export interface UiVerificationCanaryTarget {
  agentDir: string;
  vettaHome: string;
}

/**
 * Runtime Canary 下 Desktop、host 与 runner 必须共享同一份 Action RPC endpoint 合同：
 * endpoint 文件落在 canary home 里，runner 按它连 Desktop，host 也按它断言退出后已清理。
 * Profile 自带的 `endpointFile` 是给普通验证实例用的另一条路径，二者混用会让 canary 在第一次
 * CLI 调用就报 `LOCAL_RPC_SERVER_NOT_FOUND`（BUG-0038）。
 */
export function createUiVerificationEnvironment(
  layout: UiVerificationProfileLayout,
  canary?: UiVerificationCanaryTarget | null,
): NodeJS.ProcessEnv {
  const environment = createProfileEnvironment(layout);
  if (!canary) return environment;
  return {
    ...environment,
    VETTA_ACTION_RPC_ENDPOINT_FILE: join(canary.vettaHome, "action-server.json"),
    VETTA_CODING_AGENT_DIR: canary.agentDir,
    VETTA_DESKTOP_RUNTIME_CANARY: "1",
    VETTA_HOME: canary.vettaHome,
  };
}

export function seedDebugProfile(options: SeedDebugProfileOptions): SeedDebugProfileResult {
  const sourceHome = resolve(options.sourceHome);
  const targetHome = resolve(options.targetHome);
  const manifestPath = join(targetHome, seedManifestName);

  if (!options.sync && existsSync(manifestPath)) {
    return {
      seeded: false,
      modelsCopied: false,
      credentialsCopied: 0,
      osCryptSynced: false,
      sourceHome,
      targetHome,
    };
  }

  mkdirSync(targetHome, { recursive: true });
  const modelsResult = copyModelConfiguration({
    sourceHome,
    targetHome,
    replaceExistingCredentials: options.sync === true,
  });

  // 复制了凭据密文就必须同步主密钥：Windows 上 safeStorage 的 AES 主密钥按
  // user-data 目录生成、DPAPI 包装后写在 Local State 的 os_crypt.encrypted_key，
  // 不同步则 Debug 实例解出来是乱码、Provider 鉴权必 401（BUG-0035）。同机同
  // Windows 用户下 DPAPI 可正常解包，因此这是纯文件级同步，无需解密再加密。
  const osCryptSynced =
    modelsResult.credentialsCopied > 0 ? syncOsCryptKey(sourceHome, targetHome) : false;

  if (!options.sync) {
    writeSafeDesktopConfiguration(sourceHome, targetHome, resolve(options.workspacePath));
  }

  writeJsonAtomic(manifestPath, {
    schemaVersion: 1,
    sourceHome,
    seededAt: new Date().toISOString(),
    modelsCopied: modelsResult.modelsCopied,
    credentialsCopied: modelsResult.credentialsCopied,
    osCryptSynced,
  });

  return {
    seeded: true,
    ...modelsResult,
    osCryptSynced,
    sourceHome,
    targetHome,
  };
}

/**
 * 把源实例 `Local State` 的 `os_crypt` 节整体搬进目标 `Local State`，其余字段保留。
 * 目标已有不同主密钥时先留档再覆盖，避免目标既有密文（凭据、cookies）失去回滚手段。
 */
function syncOsCryptKey(sourceHome: string, targetHome: string): boolean {
  const sourceLocalStatePath = localStatePath(sourceHome);
  const sourceState = existsSync(sourceLocalStatePath)
    ? tryReadJson<Record<string, unknown>>(sourceLocalStatePath)
    : undefined;
  const sourceOsCrypt = isRecord(sourceState?.os_crypt) ? sourceState.os_crypt : undefined;
  if (typeof sourceOsCrypt?.encrypted_key !== "string" || sourceOsCrypt.encrypted_key.length === 0) {
    return false;
  }

  const targetLocalStatePath = localStatePath(targetHome);
  const targetState = existsSync(targetLocalStatePath)
    ? tryReadJson<Record<string, unknown>>(targetLocalStatePath)
    : undefined;
  const target: Record<string, unknown> = isRecord(targetState) ? { ...targetState } : {};
  const existingOsCrypt = isRecord(target.os_crypt) ? target.os_crypt : undefined;
  if (existingOsCrypt?.encrypted_key === sourceOsCrypt.encrypted_key) {
    return true;
  }

  if (typeof existingOsCrypt?.encrypted_key === "string" && existingOsCrypt.encrypted_key.length > 0) {
    const backupPath = `${targetLocalStatePath}.os-crypt-backup.json`;
    if (!existsSync(backupPath)) {
      writeJsonAtomic(backupPath, { os_crypt: existingOsCrypt });
    }
  }

  target.os_crypt = sourceOsCrypt;
  writeJsonAtomic(targetLocalStatePath, target);
  return true;
}

function localStatePath(home: string): string {
  return join(home, "electron-user-data", "Local State");
}

function tryReadJson<T>(path: string): T | undefined {
  try {
    return readJson<T>(path);
  } catch {
    return undefined;
  }
}

function copyModelConfiguration(options: {
  sourceHome: string;
  targetHome: string;
  replaceExistingCredentials: boolean;
}): { modelsCopied: boolean; credentialsCopied: number } {
  const sourceModelsPath = join(options.sourceHome, "agent", "models.json");
  if (!existsSync(sourceModelsPath)) {
    return { modelsCopied: false, credentialsCopied: 0 };
  }

  const modelConfig = readJson<ModelConfig>(sourceModelsPath);
  const credentialRefs = new Set<string>();
  for (const provider of Object.values(modelConfig.providers ?? {})) {
    if (typeof provider.credentialRef === "string" && provider.credentialRef.length > 0) {
      credentialRefs.add(provider.credentialRef);
    }
  }

  const targetModelsPath = join(options.targetHome, "agent", "models.json");
  writeJsonAtomic(targetModelsPath, sanitizeModelConfiguration(modelConfig));

  const sourceCredentialDir = join(options.sourceHome, "desktop-app", "credentials");
  const targetCredentialDir = join(options.targetHome, "desktop-app", "credentials");
  mkdirSync(targetCredentialDir, { recursive: true });

  if (options.replaceExistingCredentials) {
    removeModelCredentials(targetCredentialDir);
  }

  let credentialsCopied = 0;
  if (existsSync(sourceCredentialDir)) {
    for (const entry of readdirSync(sourceCredentialDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".credential.json")) {
        continue;
      }
      const sourcePath = join(sourceCredentialDir, entry.name);
      const record = tryReadCredentialRecord(sourcePath);
      if (
        record?.ref.namespace !== "models" ||
        record.ref.name !== "api-key" ||
        !credentialRefs.has(record.ref.ownerId)
      ) {
        continue;
      }
      copyFileAtomic(sourcePath, join(targetCredentialDir, entry.name));
      credentialsCopied += 1;
    }
  }

  return { modelsCopied: true, credentialsCopied };
}

function sanitizeModelConfiguration(modelConfig: ModelConfig): ModelConfig {
	const sanitized = structuredClone(modelConfig);
	for (const provider of Object.values(sanitized.providers ?? {})) {
		if (typeof provider.apiKey !== "string" || !isEnvironmentReference(provider.apiKey)) {
			delete provider.apiKey;
		}
	}
	return sanitized;
}

function isEnvironmentReference(value: string): boolean {
	const trimmed = value.trim();
	return /^env:[A-Z_][A-Z0-9_]*$/i.test(trimmed) || /^[A-Z_][A-Z0-9_]*$/.test(trimmed);
}

function removeModelCredentials(targetCredentialDir: string): void {
  if (!existsSync(targetCredentialDir)) {
    return;
  }
  for (const entry of readdirSync(targetCredentialDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".credential.json")) {
      continue;
    }
    const targetPath = join(targetCredentialDir, entry.name);
    if (tryReadCredentialRecord(targetPath)?.ref.namespace === "models") {
      rmSync(targetPath, { force: true });
    }
  }
}

function tryReadCredentialRecord(path: string): CredentialRecord | null {
  try {
    const value = readJson<unknown>(path);
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.ref)) {
      return null;
    }
    if (
      typeof value.ref.namespace !== "string" ||
      typeof value.ref.ownerId !== "string" ||
      typeof value.ref.name !== "string" ||
      typeof value.ciphertext !== "string"
    ) {
      return null;
    }
    return value as unknown as CredentialRecord;
  } catch {
    return null;
  }
}

function writeSafeDesktopConfiguration(
  sourceHome: string,
  targetHome: string,
  workspacePath: string,
): void {
  const targetPath = join(targetHome, "desktop-config.json");
  if (existsSync(targetPath)) {
    return;
  }

  const sourcePath = join(sourceHome, "desktop-config.json");
  let source: Record<string, unknown> = {};
  if (existsSync(sourcePath)) {
    const parsed = readJson<unknown>(sourcePath);
    if (isRecord(parsed)) {
      source = parsed;
    }
  }

  const config: Record<string, unknown> = {
    projects: [workspacePath],
    archivedProjects: [],
    workspacePath: join(targetHome, "workspace"),
    notificationsEnabled: false,
    debugMode: true,
    knowledgeBase: { enabled: false },
    quickPanel: { trigger: "none", postSendBehavior: "foreground" },
    appshot: { enabled: false },
  };

  copyEnum(source, config, "language", ["system", "zh", "en"]);
  copyEnum(source, config, "defaultExecutionMode", ["sandbox", "full-access"]);
  copyEnum(source, config, "defaultAgentMode", ["work", "coding"]);

  writeJsonAtomic(targetPath, config);
}

function copyEnum(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
): void {
  const value = source[key];
  if (typeof value === "string" && allowed.includes(value)) {
    target[key] = value;
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function copyFileAtomic(sourcePath: string, targetPath: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  copyFileSync(sourcePath, temporaryPath);
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, targetPath);
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
