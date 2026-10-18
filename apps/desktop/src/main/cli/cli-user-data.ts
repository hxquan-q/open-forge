// Modified by The Open Forge contributors.
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * CLI 子进程 userData 的落点计算与创建（RESEARCH-0032 积压 #16）。
 *
 * 旧实现落在 `os.tmpdir()/openforge-…-cli[-<pid>]`：路径可预测且位于共享
 * 临时目录，多用户 Linux/macOS 主机上其他本地用户可预置或篡改目录内容
 * （与 GHSA-jfgx 同类）。现迁入用户主目录下的 `<vettaHome>/tmp/`，目录
 * 创建即 0700，并对旧版本留下的宽松目录显式 chmod 收紧；目录命名与
 * per-command / per-pid 隔离语义由调用方保持不变。
 */
export interface CliUserDataFileSystem {
	mkdir(path: string, options: { recursive: true; mode: number }): void;
	chmod(path: string, mode: number): void;
}

const nodeFileSystem: CliUserDataFileSystem = {
	mkdir: (path, options) => mkdirSync(path, options),
	chmod: (path, mode) => chmodSync(path, mode),
};

export function createCliUserDataDirectory(
	cliUserDataDir: string,
	home: string,
	onWarn?: (message: string) => void,
	fileSystem: CliUserDataFileSystem = nodeFileSystem,
): string {
	const directory = join(home, "tmp", cliUserDataDir);
	try {
		fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
		// mkdir 的 mode 对已存在目录无效；对旧版本遗留的宽松目录显式收紧。
		fileSystem.chmod(directory, 0o700);
	} catch (error) {
		// 非阻断：Electron 仍会按该路径自行创建，此处告警留排查线索。
		onWarn?.(`CLI userData 私有目录创建失败，继续按该路径启动: ${directory} (${String(error)})`);
	}
	return directory;
}
