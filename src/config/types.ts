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

export interface BnbZkIdPrimusFieldRuleConfig {
  op: string;
  valueOffset?: number;
}

export interface BnbZkIdPrimusRegistryRuleConfig {
  templateId: string;
  timeoutMs?: number;
  algorithmType?: "proxytls" | "mpctls";
  resultType?: string;
  fieldRules?: Record<string, BnbZkIdPrimusFieldRuleConfig>;
}

export interface BnbZkIdPrimusSdkConfig {
  mode: "sdk";
  zktlsAppId: string;
  appSecret?: string;
}

export interface BnbZkIdPrimusFixtureConfig {
  mode: "fixture";
  bundlePath: string;
}

export type BnbZkIdPrimusRuntimeConfig = BnbZkIdPrimusSdkConfig | BnbZkIdPrimusFixtureConfig;

export interface BnbZkIdConfigFile {
  gateway: BnbZkIdGatewayRuntimeConfig;
  primus: BnbZkIdPrimusRuntimeConfig;
  provingDataRegistry: Record<string, BnbZkIdPrimusRegistryRuleConfig>;
}

export interface LoadedBnbZkIdConfig {
  configPath: string;
  configDir: string;
  sourceKind: "file" | "url" | "embedded";
  file: BnbZkIdConfigFile;
}
