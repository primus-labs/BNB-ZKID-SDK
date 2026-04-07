import assert from "node:assert/strict";
import test from "node:test";
import { SdkError } from "../../src/errors/sdk-error.js";
import { createHttpGatewayClient } from "../../src/gateway/http-client.js";

const minimalCreateInput = {
  appId: "app",
  identityPropertyId: "prop",
  zkTlsProof: { public_data: {}, private_data: [] as unknown[] }
};

test("HTTP createProofRequest returns Framework error payload on non-OK status instead of throwing", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            category: "policy_rejected",
            code: "STEAM_POLICY_CHECK_FAILED",
            message: "steam special policy not satisfied: specialScore=0"
          }
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );

    const client = createHttpGatewayClient("https://gateway.test");
    const result = await client.createProofRequest(minimalCreateInput);

    assert.equal(result.error?.code, "STEAM_POLICY_CHECK_FAILED");
    assert.equal(result.error?.category, "policy_rejected");
    assert.equal(result.status, "failed");
    assert.equal(result.proofRequestId, "");
    assert.deepEqual(result.httpRequest, {
      httpStatus: 400,
      pathname: "/v1/proof-requests",
      url: "https://gateway.test/v1/proof-requests"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP getProofRequestStatus throws GATEWAY_API_ERROR on non-OK Framework error body", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: "failed",
          error: {
            code: "PROOF_REQUEST_NOT_FOUND",
            message: "unknown proofRequestId"
          }
        }),
        { status: 404, headers: { "content-type": "application/json" } }
      );

    const client = createHttpGatewayClient("https://gateway.test");
    await assert.rejects(
      () => client.getProofRequestStatus("missing-id"),
      (err: unknown) =>
        err instanceof SdkError &&
        err.code === "GATEWAY_API_ERROR" &&
        (err.details?.phase as string) === "getProofRequestStatus" &&
        err.details?.code === "PROOF_REQUEST_NOT_FOUND"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP getProofRequestStatus still throws TRANSPORT_ERROR when non-OK body is not a Framework error", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "plain error" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });

    const client = createHttpGatewayClient("https://gateway.test");
    await assert.rejects(
      () => client.getProofRequestStatus("proof-request-001"),
      (err: unknown) => err instanceof SdkError && err.code === "TRANSPORT_ERROR"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP createProofRequest still throws TRANSPORT_ERROR when non-OK body is not a Framework error", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "plain error" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });

    const client = createHttpGatewayClient("https://gateway.test");
    await assert.rejects(
      () => client.createProofRequest(minimalCreateInput),
      (err: unknown) => err instanceof SdkError && err.code === "TRANSPORT_ERROR"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
