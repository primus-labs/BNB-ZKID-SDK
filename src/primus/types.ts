import type { ProveInput, ProvingParams } from "../types/public.js";

export type PrimusAlgorithmType = "proxytls" | "mpctls";

export type PrimusPlatform = "pc" | "android" | "ios";

export type PrimusEnvironment = "production" | "development";

export interface PrimusInitOptions {
  platform?: PrimusPlatform;
  env?: PrimusEnvironment;
  openAndroidApp?: boolean;
}

export interface PrimusAttMode {
  algorithmType: PrimusAlgorithmType;
  resultType?: string;
}

export interface PrimusAttCondition {
  field: string;
  op: string;
  value?: string;
}

export type PrimusAttConditions = PrimusAttCondition[][];

export type PrimusAdditionParamsValue = string | number | boolean | null | ProvingParams;

export type PrimusAdditionParams = Record<string, PrimusAdditionParamsValue>;

export interface PrimusAttestationRequest {
  readonly requestid?: string;
  setAdditionParams(additionParams: string): void;
  setAttMode(attMode: PrimusAttMode): void;
  setAttConditions(attConditions: PrimusAttConditions): void;
  toJsonString(): string;
}

export interface PrimusAttestation {
  request?: Record<string, unknown>;
  requestid?: string;
  recipient?: string;
  reponseResolve?: unknown[];
  [key: string]: unknown;
}

export interface PrimusZkTlsRuntime {
  init(appId: string, appSecret?: string, options?: PrimusInitOptions): Promise<string | boolean>;
  generateRequestParams(
    attTemplateID: string,
    userAddress?: string,
    timeout?: number
  ): PrimusAttestationRequest;
  sign(signParams: string): Promise<string>;
  startAttestation(attestationParamsStr: string): Promise<PrimusAttestation>;
  verifyAttestation(attestation: PrimusAttestation): boolean;
  getPrivateData(requestid: string, keyName?: string): unknown;
}

export interface PrimusRequestSigner {
  sign(signParams: string): Promise<string>;
}

export interface PrimusZkTlsAdapterConfig {
  appId: string;
  appSecret?: string;
  initOptions?: PrimusInitOptions;
  signer?: PrimusRequestSigner;
  runtimeFactory?: () => Promise<PrimusZkTlsRuntime> | PrimusZkTlsRuntime;
}

export interface CollectPrimusAttestationInput {
  templateId: string;
  userAddress: string;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  additionParams?: PrimusAdditionParams;
  attConditions?: PrimusAttConditions;
}

export interface PrimusZkTlsProof {
  public_data: PrimusAttestation;
  private_data: unknown;
}

export interface PrimusAttestationBundle {
  requestId: string;
  zkTlsProof: PrimusZkTlsProof;
  attestation: PrimusAttestation;
  privateData: unknown;
}

export interface PrimusZkTlsAdapter {
  init(): Promise<string | boolean>;
  collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle>;
}

export interface CollectPrimusBundleForProveInput {
  templateId: string;
  proveInput: Pick<
    ProveInput,
    "clientRequestId" | "identityPropertyId" | "provingParams" | "userAddress"
  >;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  attConditions?: PrimusAttConditions;
  additionParams?: PrimusAdditionParams;
}
