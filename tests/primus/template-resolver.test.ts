import assert from "node:assert/strict";
import test from "node:test";
import {
  createHttpPrimusTemplateResolver,
  createStaticPrimusTemplateResolver
} from "../../src/primus/template-resolver.js";

test("static primus template resolver maps identityPropertyId to templateId", async () => {
  const resolver = createStaticPrimusTemplateResolver({
    github_account_age: "github-template"
  });
  const appConfig = await resolver.resolveAppConfig({
    appId: "brevisListaDAO"
  });

  const templateId = await resolver.resolveTemplateId({
    appId: "brevisListaDAO",
    identityPropertyId: "github_account_age"
  });

  assert.deepEqual(appConfig, {});
  assert.equal(templateId, "github-template");
});

test("static primus template resolver fails for unmapped identityPropertyId", async () => {
  const resolver = createStaticPrimusTemplateResolver({});

  await assert.rejects(
    () =>
      resolver.resolveTemplateId({
        appId: "brevisListaDAO",
        identityPropertyId: "unknown_data_id"
      }),
    /No Primus templateId mapping found/
  );
});

test("http primus template resolver reads provider-specific template id from public endpoint", async () => {
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
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            githubIdentityPropertyId: "21701f5e-c90c-40a4-8ced-bc1696828f11"
          }
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
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates",
      apiKey: "primus-key"
    });

    const appConfig = await resolver.resolveAppConfig({
      appId: "brevisListaDAO"
    });
    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    });

    assert.deepEqual(appConfig, {
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
    assert.deepEqual(resolved, {
      templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api-dev.padolabs.org/public/identity/templates");
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal((calls[0]?.init?.headers as Record<string, string>)["x-api-key"], "primus-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver reads zktlsTemplateId and attestation options from nested identity objects", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            githubIdentityPropertyId: {
              zktlsTemplateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
              attConditions: [
                [{ field: "github_id", op: "SHA256_WITH_SALT" }],
                [
                  { field: "contribution", op: "SHA256_WITH_SALT" },
                  { field: "years", op: "SHA256_WITH_SALT" }
                ]
              ],
              allJsonResponseFlag: "true"
            }
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    });

    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    });

    assert.deepEqual(resolved, {
      templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
      attConditions: [
        [{ field: "github_id", op: "SHA256_WITH_SALT" }],
        [
          { field: "contribution", op: "SHA256_WITH_SALT" },
          { field: "years", op: "SHA256_WITH_SALT" }
        ]
      ],
      allJsonResponseFlag: "true"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver preserves additionParams.needUpdateRequests from payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            binanceIdentityPropertyId: {
              zktlsTemplateId: "ccb898b0-e4b2-4859-95ae-9b41159e8b59",
              additionParams: {
                needUpdateRequests: [
                  {
                    bodyParams: {
                      startTime: "1759222655324",
                      endTime: "1774947455324",
                      rows: 100
                    }
                  },
                  {
                    queryParams: {
                      _start: "1759222655324",
                      _end: "1774947455324",
                      limit: "100",
                      t: "1774947455324"
                    }
                  }
                ]
              }
            }
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    });

    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "binanceIdentityPropertyId"
    });

    assert.deepEqual(resolved.additionParams, {
      needUpdateRequests: [
        {
          bodyParams: {
            startTime: "1759222655324",
            endTime: "1774947455324",
            rows: 100
          }
        },
        {
          queryParams: {
            _start: "1759222655324",
            _end: "1774947455324",
            limit: "100",
            t: "1774947455324"
          }
        }
      ]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver supports explicit response key overrides", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            customGithubKey: "github-template"
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates",
      responseKeyMap: {
        github_account_age: "customGithubKey"
      }
    });

    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    });

    assert.deepEqual(resolved, {
      templateId: "github-template",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver accepts identityPropertyId when it already matches the response key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            binanceIdentityPropertyId: "ccb898b0-e4b2-4859-95ae-9b41159e8b59"
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    });

    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "binanceIdentityPropertyId"
    });

    assert.deepEqual(resolved, {
      templateId: "ccb898b0-e4b2-4859-95ae-9b41159e8b59",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver supports chain-app-id bucket with Brevis property hex keys", async () => {
  const chainAppKey =
    "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C";
  const githubPropertyId =
    "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          [chainAppKey]: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            [githubPropertyId]: {
              zktlsTemplateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
              allJsonResponseFlag: "true"
            }
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    });

    const appConfig = await resolver.resolveAppConfig({
      appId: "brevisListaDAO"
    });
    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: githubPropertyId
    });

    assert.deepEqual(appConfig, {
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
    assert.deepEqual(resolved, {
      templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
      allJsonResponseFlag: "true"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http primus template resolver works when appId directly matches the payload key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        rc: 0,
        mc: "SUCCESS",
        msg: "",
        result: {
          brevisListaDAO: {
            zkTlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
            githubIdentityPropertyId: "21701f5e-c90c-40a4-8ced-bc1696828f11"
          }
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const resolver = createHttpPrimusTemplateResolver({
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    });

    const resolved = await resolver.resolveTemplate({
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    });

    assert.deepEqual(resolved, {
      templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
