import { ConfigurationError } from "../errors/sdk-error.js";
import { createConfiguredBnbZkIdClient } from "./configured-client.js";
import { loadBnbZkIdConfig, resolveConfigResourcePath } from "../config/load-config.js";
import { createHttpGatewayClient } from "../gateway/http-client.js";
import { createPrimusZkTlsAdapter } from "../primus/adapter.js";
import { createHttpPrimusRequestSigner } from "../primus/request-signer.js";
import {
  createHttpPrimusTemplateResolver,
  createStaticPrimusTemplateResolver
} from "../primus/template-resolver.js";
import { isNodeRuntime } from "../runtime/environment.js";
import type { BnbZkIdClientMethods } from "../types/public.js";
import type { GatewayClient } from "../gateway/types.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";

export async function createRuntimeConfiguredClient(): Promise<BnbZkIdClientMethods> {
  const loadedConfig = await loadBnbZkIdConfig();
  const { file } = loadedConfig;

  const gatewayClient =
    file.gateway.mode === "http"
      ? createHttpGatewayClient(file.gateway.baseUrl)
      : await createRuntimeFixtureGatewayClient(loadedConfig);

  const primusAdapter =
    file.primus.mode === "sdk"
      ? createPrimusZkTlsAdapter({
          appId: resolvePrimusAppId(file.primus.zktlsAppId),
          ...(file.primus.appSecret === undefined ? {} : { appSecret: file.primus.appSecret }),
          ...(file.primus.signer === undefined
            ? {}
            : {
                signer: createHttpPrimusRequestSigner({
                  baseUrl: file.primus.signer.baseUrl,
                  signPath: file.primus.signer.signPath,
                  ...(file.primus.signer.apiKey === undefined
                    ? {}
                    : { apiKey: file.primus.signer.apiKey })
                })
              })
        })
      : await createRuntimeFixturePrimusAdapter(loadedConfig);

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver: createRuntimePrimusTemplateResolver(file.primus.templateResolver)
  });

  return client;
}

function resolvePrimusAppId(zktlsAppId: string): string {
  const appId = zktlsAppId.trim();
  if (appId.length === 0) {
    throw new ConfigurationError("primus.zktlsAppId is required in the config file.");
  }

  return appId;
}

async function createRuntimeFixtureGatewayClient(
  loadedConfig: Awaited<ReturnType<typeof loadBnbZkIdConfig>>
) {
  const gateway = loadedConfig.file.gateway;
  if (gateway.mode !== "fixture") {
    throw new ConfigurationError("Expected fixture gateway config.");
  }

  if (isNodeRuntime()) {
    const { createFixtureGatewayClient } = await importRuntimeModule<{
      createFixtureGatewayClient: (input: {
        configPath: string;
        createProofRequestPath: string;
        proofRequestStatusPath: string;
      }) => GatewayClient;
    }>("../gateway/fixture-client.js");
    return createFixtureGatewayClient({
      configPath: await resolveConfigResourcePath(loadedConfig, gateway.configPath),
      createProofRequestPath: await resolveConfigResourcePath(
        loadedConfig,
        gateway.createProofRequestPath
      ),
      proofRequestStatusPath: await resolveConfigResourcePath(
        loadedConfig,
        gateway.proofRequestStatusPath
      )
    });
  }

  const { createBrowserFixtureGatewayClient } = await import("../gateway/fixture-client.browser.js");
  return createBrowserFixtureGatewayClient({
    configUrl: await resolveConfigResourcePath(loadedConfig, gateway.configPath),
    createProofRequestUrl: await resolveConfigResourcePath(
      loadedConfig,
      gateway.createProofRequestPath
    ),
    proofRequestStatusUrl: await resolveConfigResourcePath(
      loadedConfig,
      gateway.proofRequestStatusPath
    )
  });
}

async function createRuntimeFixturePrimusAdapter(
  loadedConfig: Awaited<ReturnType<typeof loadBnbZkIdConfig>>
) {
  const primus = loadedConfig.file.primus;
  if (primus.mode !== "fixture") {
    throw new ConfigurationError("Expected fixture primus config.");
  }

  if (isNodeRuntime()) {
    const { createFixturePrimusZkTlsAdapter } = await importRuntimeModule<{
      createFixturePrimusZkTlsAdapter: (bundlePath: string) => PrimusZkTlsAdapter;
    }>("../primus/fixture-adapter.js");
    return createFixturePrimusZkTlsAdapter(
      await resolveConfigResourcePath(loadedConfig, primus.bundlePath)
    );
  }

  const { createBrowserFixturePrimusZkTlsAdapter } = await import(
    "../primus/fixture-adapter.browser.js"
  );
  return createBrowserFixturePrimusZkTlsAdapter(
    await resolveConfigResourcePath(loadedConfig, primus.bundlePath)
  );
}

function createRuntimePrimusTemplateResolver(
  config: Awaited<ReturnType<typeof loadBnbZkIdConfig>>["file"]["primus"]["templateResolver"]
) {
  if (config.mode === "static") {
    return createStaticPrimusTemplateResolver(config.templateIds);
  }

  return createHttpPrimusTemplateResolver({
    baseUrl: config.baseUrl,
    resolveTemplatePath: config.resolveTemplatePath,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    ...(config.responseKeyMap === undefined ? {} : { responseKeyMap: config.responseKeyMap })
  });
}

async function importRuntimeModule<T>(specifier: string): Promise<T> {
  return (import(
    /* @vite-ignore */
    specifier
  ) as unknown) as Promise<T>;
}
