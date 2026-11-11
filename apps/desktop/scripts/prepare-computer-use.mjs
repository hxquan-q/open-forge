// Copyright The Open Forge contributors.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const desktop = resolve(import.meta.dirname, "..");
export const COMPUTER_USE_SOURCE = join(desktop, "native", "computer-use");
export const COMPUTER_USE_RESOURCES = join(desktop, "resources", "computer-use");
const downloads = join(desktop, "resources", "computer-use-downloads");
export const COMPUTER_USE_BUNDLE_CONTRACT = JSON.parse(readFileSync(join(desktop, "src/shared/computer-use-backend.json"), "utf8"));
const workerFiles = COMPUTER_USE_BUNDLE_CONTRACT.requiredFiles.filter((file) => file.startsWith("worker/") && !file.startsWith("worker/vendor/")).map((file) => file.slice("worker/".length));
const primitives = COMPUTER_USE_BUNDLE_CONTRACT.requiredFiles.filter((file) => file.startsWith("worker/vendor/winhands/")).map((file) => file.slice("worker/vendor/winhands/".length));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateArchivePath(name) {
	if (!name || name.includes("\\") || name.startsWith("/") || name.includes(":") || name.split("/").some((part) => part === ".." || part === ".")) {
		throw new Error(`Unsafe computer-use archive entry: ${name}`);
	}
	return name;
}

async function extract(archivePath, directory) {
	const zip = new AdmZip(archivePath);
	let total = 0;
	for (const entry of zip.getEntries()) {
		validateArchivePath(entry.entryName);
		const mode = entry.attr >>> 16;
		if ((mode & 0o170000) === 0o120000) throw new Error("Computer-use archives cannot contain symlinks");
		total += entry.header.size;
		if (entry.header.size > 64 * 1024 * 1024 || total > 256 * 1024 * 1024) throw new Error("Computer-use archive is too large");
		if (entry.isDirectory) continue;
		const destination = join(directory, entry.entryName);
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, entry.getData(), { flag: "wx" });
	}
}

async function filesUnder(root, relative = "") {
	const result = [];
	for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
		const name = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) throw new Error(`Symlink in computer-use bundle: ${name}`);
		if (entry.isDirectory()) result.push(...await filesUnder(root, name));
		else if (entry.isFile()) result.push(name);
	}
	return result.sort();
}

async function fingerprint(source, lock) {
	const pieces = [JSON.stringify(lock), JSON.stringify(COMPUTER_USE_BUNDLE_CONTRACT)];
	for (const file of workerFiles) pieces.push(digest(await readFile(join(source, file))));
	for (const file of primitives) pieces.push(digest(await readFile(join(source, "vendor", "winhands", file))));
	return digest(pieces.join("\n"));
}

export async function verifyComputerUseBundle(root, expectedFingerprint) {
	const bundle = JSON.parse(await readFile(join(root, "bundle.json"), "utf8"));
	if (bundle.protocol !== COMPUTER_USE_BUNDLE_CONTRACT.protocol || bundle.platform !== COMPUTER_USE_BUNDLE_CONTRACT.platform || bundle.pythonVersion !== COMPUTER_USE_BUNDLE_CONTRACT.pythonVersion || !bundle.files || (expectedFingerprint && bundle.fingerprint !== expectedFingerprint)) throw new Error("Computer-use bundle version mismatch");
	for (const required of COMPUTER_USE_BUNDLE_CONTRACT.requiredFiles) {
		if (!bundle.files[required]) throw new Error(`Computer-use bundle missing: ${required}`);
	}
	const files = (await filesUnder(root)).filter((name) => name !== "bundle.json");
	if (JSON.stringify(files) !== JSON.stringify(Object.keys(bundle.files).sort())) throw new Error("Computer-use bundle contains unexpected or missing files");
	for (const file of files) {
		validateArchivePath(file);
		if (digest(await readFile(join(root, file))) !== bundle.files[file]) throw new Error(`Computer-use integrity mismatch: ${file}`);
	}
	return bundle;
}

export async function prepareComputerUse({
	platformTag = process.env.VETTA_VENDOR_PLATFORM ?? `${process.platform}-${process.arch}`,
	source = COMPUTER_USE_SOURCE,
	target = COMPUTER_USE_RESOURCES,
	downloadRoot = downloads,
	fetchImpl = fetch,
	log = console.log,
} = {}) {
	if (!platformTag.startsWith("win32-")) return null;
	if (platformTag !== "win32-x64") throw new Error("Computer Use currently requires Windows x64");
	const lock = JSON.parse(await readFile(join(source, "dependencies.json"), "utf8"));
	for (const key of ["protocol", "platform", "pythonVersion"]) if (lock[key] !== COMPUTER_USE_BUNDLE_CONTRACT[key]) throw new Error(`Computer-use dependency lock mismatch: ${key}`);
	const expected = await fingerprint(source, lock);
	try {
		await verifyComputerUseBundle(target, expected);
		return target;
	} catch { /* A source change or a damaged cache requires a fresh verified assembly. */ }
	const assembled = `${target}.${randomUUID()}.staging`;
	await mkdir(assembled, { recursive: true });
	try {
		for (const entry of lock.archives) {
			if (!/^[a-z0-9.-]+$/.test(entry.id) || !/^[a-z0-9.]+$/.test(entry.filename) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid computer-use dependency lock");
			validateArchivePath(entry.destination);
			const archive = join(downloadRoot, entry.id, entry.filename);
			await mkdir(dirname(archive), { recursive: true });
			let valid = false;
			try { valid = digest(await readFile(archive)) === entry.sha256; } catch { /* Not downloaded yet. */ }
			if (!valid) {
				log(`[computer-use] downloading ${entry.id}`);
				const response = await fetchImpl(entry.url, { signal: AbortSignal.timeout(120_000) });
				if (!response.ok) throw new Error(`HTTP ${response.status}: ${entry.id}`);
				const bytes = Buffer.from(await response.arrayBuffer());
				if (digest(bytes) !== entry.sha256) throw new Error(`Computer-use download integrity mismatch: ${entry.id}`);
				await writeFile(archive, bytes);
			}
			const unpacked = join(dirname(archive), `unpacked-${randomUUID()}`);
			await mkdir(unpacked);
			try {
				await extract(archive, unpacked);
				await cp(unpacked, join(assembled, entry.destination), { recursive: true });
			} finally { await rm(unpacked, { recursive: true, force: true }); }
		}
		await mkdir(join(assembled, "worker", "vendor", "winhands"), { recursive: true });
		for (const file of workerFiles) await cp(join(source, file), join(assembled, "worker", file));
		for (const file of primitives) await cp(join(source, "vendor", "winhands", file), join(assembled, "worker", "vendor", "winhands", file));
		const abi = lock.pythonVersion.split(".").slice(0, 2).join("");
		await writeFile(join(assembled, "runtime", `python${abi}._pth`), `python${abi}.zip\n.\nLib/site-packages\n../worker\n../worker/vendor\n`);
		await mkdir(join(assembled, "licenses"));
		await cp(join(assembled, "runtime", "LICENSE.txt"), join(assembled, "licenses", "Python.txt"));
		await cp(join(source, "vendor", "winhands", "LICENSE"), join(assembled, "licenses", "WinHands.txt"));
		await writeFile(join(assembled, "licenses", "NOTICE.txt"), "Vetta Computer Use: CPython 3.12.10 (PSF), WinHands 0.4.1 restricted primitives (MIT, Rodolfo Obreque), uiautomation 2.0.29 (Apache-2.0), comtypes 1.4.17 (MIT), Pillow 12.0.0 (MIT-CMU). Dependency license texts are preserved in runtime/Lib/site-packages/*.dist-info/. No system Python or first-run download is required.\n");
		const files = {};
		for (const file of await filesUnder(assembled)) files[file] = digest(await readFile(join(assembled, file)));
		await writeFile(join(assembled, "bundle.json"), JSON.stringify({ protocol: COMPUTER_USE_BUNDLE_CONTRACT.protocol, platform: COMPUTER_USE_BUNDLE_CONTRACT.platform, pythonVersion: lock.pythonVersion, fingerprint: expected, files }, null, 2));
		await verifyComputerUseBundle(assembled, expected);
		await rm(target, { recursive: true, force: true });
		await rename(assembled, target);
		log(`[computer-use] bundled ${Object.keys(files).length} verified files`);
		return target;
	} finally { await rm(assembled, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	prepareComputerUse().catch((error) => { console.error(error); process.exitCode = 1; });
}
