import assert from "node:assert/strict";
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
