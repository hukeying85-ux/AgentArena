import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeAtomic, writeJsonAtomic } from "../packages/core/dist/atomic-write.js";

test("writeAtomic: writes file atomically", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "test.json");

  await writeAtomic(filePath, "hello world");

  const content = await fs.readFile(filePath, "utf8");
  assert.equal(content, "hello world");

  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeJsonAtomic: writes JSON with formatting", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "data.json");

  await writeJsonAtomic(filePath, { key: "value", nested: { a: 1 } });

  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  assert.equal(parsed.key, "value");
  assert.equal(parsed.nested.a, 1);
  // Verify 2-space indentation
  assert.ok(content.includes("\n"), "should be formatted with newlines");

  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeAtomic: overwrites existing file", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "test.txt");

  await writeAtomic(filePath, "first");
  await writeAtomic(filePath, "second");

  const content = await fs.readFile(filePath, "utf8");
  assert.equal(content, "second");

  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeAtomic: temp file is cleaned up after success", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "test.txt");

  await writeAtomic(filePath, "data");

  const files = await fs.readdir(tmp);
  // Only the target file should remain, no .tmp files
  const tmpFiles = files.filter((f) => f.includes(".tmp"));
  assert.equal(tmpFiles.length, 0, "no temp files should remain");

  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeAtomic: preserves the previous file and removes temp data when writing fails", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "result.json");
  await fs.writeFile(filePath, JSON.stringify({ version: "previous" }), "utf8");

  const originalOpen = fs.open;
  fs.open = async (candidate, ...args) => {
    const handle = await originalOpen(candidate, ...args);
    if (path.basename(String(candidate)).startsWith(".result.json.tmp.")) {
      return {
        async write() {
          await handle.write("{partial", null, "utf8");
          throw new Error("simulated temp write failure");
        },
        sync: () => handle.sync(),
        close: () => handle.close()
      };
    }
    return handle;
  };

  try {
    await assert.rejects(() => writeAtomic(filePath, JSON.stringify({ version: "next" })), /simulated temp write failure/);
  } finally {
    fs.open = originalOpen;
  }

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version: "previous" });
  assert.deepEqual(
    (await fs.readdir(tmp)).filter((name) => name.includes(".tmp.") || name.endsWith(".bak")),
    []
  );
  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeAtomic: restores the previous file when replacement fails after backup", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "result.json");
  await fs.writeFile(filePath, JSON.stringify({ version: "previous" }), "utf8");

  const originalRename = fs.rename;
  let replacementAttempts = 0;
  fs.rename = async (source, destination) => {
    const sourcePath = path.resolve(String(source));
    const destinationPath = path.resolve(String(destination));
    if (
      path.basename(sourcePath).startsWith(".result.json.tmp.") &&
      destinationPath === path.resolve(filePath)
    ) {
      replacementAttempts += 1;
      if (replacementAttempts === 1) {
        const error = new Error("simulated replace conflict");
        error.code = "EPERM";
        throw error;
      }
      throw new Error("simulated replacement failure after backup");
    }
    return originalRename(source, destination);
  };

  try {
    await assert.rejects(
      () => writeAtomic(filePath, JSON.stringify({ version: "next" })),
      /simulated replacement failure after backup/
    );
  } finally {
    fs.rename = originalRename;
  }

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version: "previous" });
  assert.deepEqual(
    (await fs.readdir(tmp)).filter((name) => name.includes(".tmp.") || name.endsWith(".bak")),
    []
  );
  await fs.rm(tmp, { recursive: true, force: true });
});

test("writeAtomic: restores a backup left by an interrupted replacement before writing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-test-"));
  const filePath = path.join(tmp, "result.json");
  const backupPath = path.join(tmp, ".result.json.bak");
  await fs.writeFile(backupPath, JSON.stringify({ version: "previous" }), "utf8");

  const originalOpen = fs.open;
  fs.open = async (candidate, ...args) => {
    const handle = await originalOpen(candidate, ...args);
    if (path.basename(String(candidate)).startsWith(".result.json.tmp.")) {
      return {
        async write() {
          throw new Error("simulated write failure after backup recovery");
        },
        sync: () => handle.sync(),
        close: () => handle.close()
      };
    }
    return handle;
  };

  try {
    await assert.rejects(
      () => writeAtomic(filePath, JSON.stringify({ version: "next" })),
      /simulated write failure after backup recovery/
    );
  } finally {
    fs.open = originalOpen;
  }

  assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { version: "previous" });
  assert.deepEqual(
    (await fs.readdir(tmp)).filter((name) => name.includes(".tmp.") || name.endsWith(".bak")),
    []
  );
  await fs.rm(tmp, { recursive: true, force: true });
});
