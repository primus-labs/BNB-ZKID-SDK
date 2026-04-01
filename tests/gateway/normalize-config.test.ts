import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGatewayConfigPayload } from "../../src/gateway/normalize-config.js";

test("normalizeGatewayConfigPayload maps Brevis /v1/config wire to GatewayConfig", () => {
  const normalized = normalizeGatewayConfigPayload({
    providers: [
      {
        id: "0x07a17bd3c7c8d7b88e93a4d9007e3bc230b0a586a434de0bed6500e9f343deb7",
        description: "GitHub",
        properties: [
          {
            id: "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff",
            description: "GitHub account creation + contribution",
            "businessParams": { "contribution": [10, 20] }
          }
        ]
      }
    ],
    error: null
  });

  assert.deepEqual(normalized.appIds, []);
  assert.equal(normalized.providers.length, 1);
  assert.equal(
    normalized.providers[0]?.providerId,
    "0x07a17bd3c7c8d7b88e93a4d9007e3bc230b0a586a434de0bed6500e9f343deb7"
  );
  const gh = normalized.providers[0]?.identityProperties[0];
  assert.equal(
    gh?.identityPropertyId,
    "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff"
  );
  assert.equal(gh?.primusTemplateResponseKey, undefined);
  assert.deepEqual(gh?.businessParams, { contribution: [10, 20] });
});

test("normalizeGatewayConfigPayload passes through legacy fixture shape", () => {
  const legacy = {
    appIds: ["brevisListaDAO"],
    providers: [
      {
        providerId: "github",
        identityProperties: [{ identityPropertyId: "github_account_age", schemaVersion: "1.0.0" }]
      }
    ]
  };

  assert.deepEqual(normalizeGatewayConfigPayload(legacy), legacy);
});

test("normalizeGatewayConfigPayload rejects top-level error object", () => {
  assert.throws(
    () =>
      normalizeGatewayConfigPayload({
        providers: [],
        error: { code: "E", message: "bad" }
      }),
    /bad/
  );
});
