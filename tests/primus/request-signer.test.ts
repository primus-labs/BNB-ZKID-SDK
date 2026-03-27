import assert from "node:assert/strict";
import test from "node:test";
import { createHttpPrimusRequestSigner } from "../../src/primus/request-signer.js";

test("http primus request signer posts appId and request data as json and returns signed request payload", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      ...(init === undefined ? {} : { init })
    });

    return new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          appSignature: "0xsigned-by-server"
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const signer = createHttpPrimusRequestSigner({
      baseUrl: "https://api-dev.padolabs.org",
      signPath: "/developer-center/app-sign-by-app-id",
      apiKey: "signer-key"
    });

    const signedRequest = await signer.sign(
      '{"requestid":"primus-request-001"}',
      "0x8F3A1cB4D9e7F261A4B5C8dE2F7a9C1D3E6b4A2F"
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api-dev.padolabs.org/developer-center/app-sign-by-app-id");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)["content-type"],
      "application/json"
    );
    assert.equal((calls[0]?.init?.headers as Record<string, string>)["x-api-key"], "signer-key");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      appId: "0x8F3A1cB4D9e7F261A4B5C8dE2F7a9C1D3E6b4A2F",
      data: '{"requestid":"primus-request-001"}'
    });
    assert.deepEqual(JSON.parse(signedRequest), {
      attRequest: {
        requestid: "primus-request-001"
      },
      appSignature: "0xsigned-by-server"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
