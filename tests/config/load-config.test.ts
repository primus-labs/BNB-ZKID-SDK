import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { INTERNAL_BNB_ZKID_CONFIG } from "../../src/config/internal-config.js";
import { loadBnbZkIdConfig } from "../../src/config/load-config.js";

test("loadBnbZkIdConfig falls back to embedded SDK config when no override is provided", async () => {
  const originalConfigPath = process.env.BNB_ZKID_CONFIG_PATH;
  delete process.env.BNB_ZKID_CONFIG_PATH;

  try {
    const loaded = await loadBnbZkIdConfig();
    assert.equal(loaded.sourceKind, "embedded");
    assert.equal(loaded.configPath, "embedded://bnb-zkid-sdk/default-config");
    assert.deepEqual(loaded.file, INTERNAL_BNB_ZKID_CONFIG);
  } finally {
    if (originalConfigPath === undefined) {
      delete process.env.BNB_ZKID_CONFIG_PATH;
    } else {
      process.env.BNB_ZKID_CONFIG_PATH = originalConfigPath;
    }
  }
});

test("loadBnbZkIdConfig merges partial override files with embedded defaults", async () => {
  const originalConfigPath = process.env.BNB_ZKID_CONFIG_PATH;
  delete process.env.BNB_ZKID_CONFIG_PATH;

  const dir = await mkdtemp(path.join(os.tmpdir(), "bnb-zkid-config-override-"));
  const configPath = path.join(dir, "config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        gateway: {
          baseUrl: "http://127.0.0.1:8038"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  process.env.BNB_ZKID_CONFIG_PATH = configPath;

  try {
    const loaded = await loadBnbZkIdConfig();
    assert.equal(loaded.sourceKind, "file");
    assert.equal(loaded.file.gateway.mode, "http");
    assert.equal(loaded.file.gateway.baseUrl, "http://127.0.0.1:8038");
    assert.deepEqual(loaded.file.primus, INTERNAL_BNB_ZKID_CONFIG.primus);
  } finally {
    if (originalConfigPath === undefined) {
      delete process.env.BNB_ZKID_CONFIG_PATH;
    } else {
      process.env.BNB_ZKID_CONFIG_PATH = originalConfigPath;
    }
  }
});
