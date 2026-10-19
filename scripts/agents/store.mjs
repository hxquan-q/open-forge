// Copyright The Open Forge contributors.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { canonical } from "./schema.mjs";

const initialState = () => ({
	version: 1,
	revision: 0,
	control: { paused: false },
	leases: {},
	runs: {},
	signals: [],
	lessons: [],
	releases: {},
	audit: [],
});

function refuseLink(path) {
	if (existsSync(path) && lstatSync(path).isSymbolicLink())
		throw new Error(`state path must not be a symbolic link: ${path}`);
}

function atomicWrite(path, value) {
	const temporary = `${path}.${randomUUID()}.tmp`;
	const fd = openSync(temporary, "wx", 0o600);
	try {
		writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		renameSync(temporary, path);
	} catch (error) {
		unlinkSync(temporary);
		throw error;
	}
}

/** Single-host storage. An OS/VM boundary must keep this directory away from workers. */
export function createStore(directory) {
	const root = resolve(directory);
	refuseLink(root);
	if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
	const keyPath = join(root, "controller.key");
	const statePath = join(root, "state.json");
	const lockPath = join(root, "writer.lock");
	for (const path of [keyPath, statePath, lockPath]) refuseLink(path);
	let initialized = false;
	if (!existsSync(keyPath)) {
		if (readdirSync(root).length) throw new Error("refusing to initialize a nonempty, unknown state directory");
		try {
			writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
			initialized = true;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
	const key = readFileSync(keyPath);
	if (key.length !== 32) throw new Error("invalid controller key");
	const mac = (payload) => createHmac("sha256", key).update(canonical(payload)).digest("hex");
	if (initialized) {
		const payload = initialState();
		atomicWrite(statePath, { payload, mac: mac(payload) });
	} else if (!existsSync(statePath)) throw new Error("initialized controller state is missing");
	const read = () => {
		refuseLink(statePath);
		if (!existsSync(statePath)) throw new Error("initialized controller state is missing");
		const envelope = JSON.parse(readFileSync(statePath, "utf8"));
		const actual = Buffer.from(mac(envelope.payload), "hex");
		const expected = typeof envelope.mac === "string" ? Buffer.from(envelope.mac, "hex") : Buffer.alloc(0);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
			throw new Error("state integrity check failed");
		const state = envelope.payload;
		if (
			state.version !== 1 ||
			!Number.isSafeInteger(state.revision) ||
			state.revision < 0 ||
			!Array.isArray(state.audit)
		) {
			throw new Error("invalid state format");
		}
		return state;
	};
	const transaction = (mutate) => {
		if (mutate.constructor.name === "AsyncFunction") throw new Error("state transactions must be synchronous");
		const nonce = randomUUID();
		let lock;
		try {
			lock = openSync(lockPath, "wx", 0o600);
		} catch (error) {
			if (error.code === "EEXIST") throw new Error("controller busy: writer lock is held");
			throw error;
		}
		let result;
		let failure;
		try {
			writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce }));
			fsyncSync(lock);
			const state = read();
			const revision = state.revision;
			const value = mutate(state);
			if (value && typeof value.then === "function") throw new Error("state transactions must be synchronous");
			result = structuredClone(value);
			state.revision = revision + 1;
			atomicWrite(statePath, { payload: state, mac: mac(state) });
		} catch (error) {
			failure = error;
		} finally {
			try {
				closeSync(lock);
				const owner = JSON.parse(readFileSync(lockPath, "utf8"));
				if (owner.nonce === nonce) unlinkSync(lockPath);
				else failure = new Error("writer lock ownership changed", { cause: failure });
			} catch (cleanupError) {
				failure = failure
					? new AggregateError([failure, cleanupError], "transaction and lock cleanup failed")
					: cleanupError;
			}
		}
		if (failure) throw failure;
		return result;
	};
	const recover = () => {
		refuseLink(lockPath);
		if (!existsSync(lockPath)) return false;
		const owner = JSON.parse(readFileSync(lockPath, "utf8"));
		if (!Number.isSafeInteger(owner.pid) || typeof owner.nonce !== "string") throw new Error("invalid writer lock");
		try {
			process.kill(owner.pid, 0);
			throw new Error("writer is still alive; refusing recovery");
		} catch (error) {
			if (error.code !== "ESRCH") throw error;
		}
		if (JSON.parse(readFileSync(lockPath, "utf8")).nonce !== owner.nonce) throw new Error("writer lock changed");
		unlinkSync(lockPath);
		return true;
	};
	return { root, read, transaction, recover };
}
