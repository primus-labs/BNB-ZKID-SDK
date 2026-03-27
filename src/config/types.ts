export interface BnbZkIdGatewayHttpConfig {
  mode: "http";
  baseUrl: string;
}

export interface BnbZkIdGatewayFixtureConfig {
  mode: "fixture";
  configPath: string;
  createProofRequestPath: string;
  proofRequestStatusPath: string;
}

export type BnbZkIdGatewayRuntimeConfig =
  | BnbZkIdGatewayHttpConfig
  | BnbZkIdGatewayFixtureConfig;

export interface BnbZkIdPrimusStaticTemplateResolverConfig {
  mode: "static";
  templateIds: Record<string, string>;
}

export interface BnbZkIdPrimusServerTemplateResolverConfig {
  mode: "server";
  baseUrl: string;
  resolveTemplatePath: string;
  apiKey?: string;
  appResponseKeyMap?: Record<string, string>;
  responseKeyMap?: Record<string, string>;
}

export interface BnbZkIdPrimusServerSignerConfig {
  mode: "server";
  baseUrl: string;
  signPath: string;
  apiKey?: string;
}

export interface BnbZkIdPrimusSdkConfig {
  mode: "sdk";
  appSecret?: string;
  templateResolver: BnbZkIdPrimusStaticTemplateResolverConfig | BnbZkIdPrimusServerTemplateResolverConfig;
  signer?: BnbZkIdPrimusServerSignerConfig;
}

export interface BnbZkIdPrimusFixtureConfig {
  mode: "fixture";
  bundlePath: string;
  templateResolver: BnbZkIdPrimusStaticTemplateResolverConfig | BnbZkIdPrimusServerTemplateResolverConfig;
}

export type BnbZkIdPrimusRuntimeConfig = BnbZkIdPrimusSdkConfig | BnbZkIdPrimusFixtureConfig;

export interface BnbZkIdConfigFile {
  gateway: BnbZkIdGatewayRuntimeConfig;
  primus: BnbZkIdPrimusRuntimeConfig;
}

export interface LoadedBnbZkIdConfig {
  configPath: string;
  configDir: string;
  sourceKind: "file" | "url" | "embedded";
  file: BnbZkIdConfigFile;
}
