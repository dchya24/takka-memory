import * as fs from "node:fs";
import * as path from "node:path";

export function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/** Atomic write (temp file + rename) so concurrent readers never see a torn file. */
export function atomicWriteFileSync(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, content, "utf-8");
	fs.renameSync(tmp, filePath);
}

/**
 * Cooperative cross-process mutex for one scope dir, implemented via atomic
 * `mkdir(".lock")`. Sync (store APIs are sync); waits up to `timeoutMs`,
 * treats locks older than `staleMs` as crashed-holder garbage.
 */
export function withDirLockSync<T>(dir: string, fn: () => T, opts?: { timeoutMs?: number; staleMs?: number }): T {
	fs.mkdirSync(dir, { recursive: true });
	const lockDir = path.join(dir, ".lock");
	const timeoutMs = opts?.timeoutMs ?? 5000;
	const staleMs = opts?.staleMs ?? 10_000;
	const start = Date.now();
	const sleep = new Int32Array(new SharedArrayBuffer(4));
	while (true) {
		try {
			fs.mkdirSync(lockDir);
			break; // acquired
		} catch {
			try {
				const st = fs.statSync(lockDir);
				if (Date.now() - st.mtimeMs > staleMs) {
					try {
						fs.rmSync(lockDir, { recursive: true, force: true });
					} catch {
						// ignore — retry below
					}
					continue;
				}
			} catch {
				continue; // lock vanished between mkdir and stat — retry immediately
			}
			if (Date.now() - start > timeoutMs) throw new Error(`timeout acquiring lock for ${dir}`);
			Atomics.wait(sleep, 0, 0, 10);
		}
	}
	try {
		return fn();
	} finally {
		try {
			fs.rmSync(lockDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors — stale detection recovers
		}
	}
}
