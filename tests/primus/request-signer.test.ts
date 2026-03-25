import assert from "node:assert/strict";
import test from "node:test";
import { createHttpPrimusRequestSigner } from "../../src/primus/request-signer.js";

test("http primus request signer posts plain text and returns signed request payload", async () => {
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
      signPath: "/developer-center/app-sign-brevis",
      apiKey: "signer-key"
    });

    const signedRequest = await signer.sign('{"requestid":"primus-request-001"}');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api-dev.padolabs.org/developer-center/app-sign-brevis");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>)["content-type"],
      "text/plain"
    );
    assert.equal((calls[0]?.init?.headers as Record<string, string>)["x-api-key"], "signer-key");
    assert.equal(calls[0]?.init?.body, '{"requestid":"primus-request-001"}');
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
