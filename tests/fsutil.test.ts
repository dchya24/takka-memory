import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { atomicWriteFileSync, readFileSafe, withDirLockSync } from "../src/core/fsutil.js";

let root: string;
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "fsutil-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("readFileSafe", () => {
	it("returns null for a missing file instead of throwing", () => {
		expect(readFileSafe(path.join(root, "nope.md"))).toBeNull();
	});
});

describe("atomicWriteFileSync", () => {
	it("writes the file and leaves no temp files behind", () => {
		const target = path.join(root, "sub", "file.md");
		atomicWriteFileSync(target, "hello");
		expect(fs.readFileSync(target, "utf-8")).toBe("hello");
		expect(fs.readdirSync(path.join(root, "sub"))).toEqual(["file.md"]);
	});
	it("overwrites existing content", () => {
		const target = path.join(root, "file.md");
		atomicWriteFileSync(target, "one");
		atomicWriteFileSync(target, "two");
		expect(fs.readFileSync(target, "utf-8")).toBe("two");
	});
});

describe("withDirLockSync", () => {
	it("runs the callback and releases the lock", () => {
		const dir = path.join(root, "locked");
		const out = withDirLockSync(dir, () => "value");
		expect(out).toBe("value");
		expect(fs.existsSync(path.join(dir, ".lock"))).toBe(false);
	});
	it("serializes nested-free sequential calls", () => {
		const dir = path.join(root, "seq");
		const order: number[] = [];
		withDirLockSync(dir, () => order.push(1));
		withDirLockSync(dir, () => order.push(2));
		expect(order).toEqual([1, 2]);
	});
	it("releases the lock even when the callback throws", () => {
		const dir = path.join(root, "boom");
		expect(() =>
			withDirLockSync(dir, () => {
				throw new Error("kaboom");
			}),
		).toThrow("kaboom");
		expect(fs.existsSync(path.join(dir, ".lock"))).toBe(false);
	});
	it("recovers a stale lock left by a crashed holder", () => {
		const dir = path.join(root, "stale");
		fs.mkdirSync(path.join(dir, ".lock"), { recursive: true });
		// Backdate the lock so it looks abandoned.
		const old = new Date(Date.now() - 60_000);
		fs.utimesSync(path.join(dir, ".lock"), old, old);
		const out = withDirLockSync(dir, () => "recovered", { staleMs: 1000 });
		expect(out).toBe("recovered");
	});
});
