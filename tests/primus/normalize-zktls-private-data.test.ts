import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZkTlsPrivateDataForGateway } from "../../src/primus/normalize-zktls-private-data.js";

test("passes through already-normalized private_data array", () => {
  const normalized = [
    { id: "contribution", salt: "salt-001", content: ["88"] }
  ];
  assert.deepEqual(normalizeZkTlsPrivateDataForGateway(normalized), normalized);
});

test("passes through empty array", () => {
  assert.deepEqual(normalizeZkTlsPrivateDataForGateway([]), []);
});

test("converts flat Primus getPrivateData shape to gateway entries (sorted by id)", () => {
  const flat = {
    data: "078afd50e4e36a854c323b9ced74f36a",
    data_plain: '["[{\\"tradeId\\":1}]"]',
    passKycLevel: "ee249b14db59a42e8f6ec1fd8c9dfb11",
    passKycLevel_plain: '["INTERMEDIATE"]',
    userId: "bcb8ed8e34f327e8fa452faa909b3950",
    userId_plain: '["782151446"]'
  };
  const out = normalizeZkTlsPrivateDataForGateway(flat) as Array<{
    id: string;
    salt: string;
    content: unknown[];
  }>;
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], {
    id: "data",
    salt: "078afd50e4e36a854c323b9ced74f36a",
    content: ['[{"tradeId":1}]']
  });
  assert.deepEqual(out[1], {
    id: "passKycLevel",
    salt: "ee249b14db59a42e8f6ec1fd8c9dfb11",
    content: ["INTERMEDIATE"]
  });
  assert.deepEqual(out[2], {
    id: "userId",
    salt: "bcb8ed8e34f327e8fa452faa909b3950",
    content: ["782151446"]
  });
});

test("leaves objects without *_plain pairs unchanged", () => {
  const o = { foo: "bar" };
  assert.strictEqual(normalizeZkTlsPrivateDataForGateway(o), o);
});

test("leaves non-objects unchanged", () => {
  assert.strictEqual(normalizeZkTlsPrivateDataForGateway("x"), "x");
});
