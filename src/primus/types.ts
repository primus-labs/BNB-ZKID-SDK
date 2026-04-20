import type { BusinessParams, ProveInput, ProvingParams } from "../types/public.js";

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

/** JSON-like values allowed inside `additionParams` (merged then passed to Primus as a JSON string). */
export type PrimusAdditionParamsValue =
  | string
  | number
  | boolean
  | null
  | BusinessParams
  | ProvingParams
  | PrimusAdditionParamsValue[]
  | { [key: string]: PrimusAdditionParamsValue };

export type PrimusAdditionParams = Record<string, PrimusAdditionParamsValue>;

/**
 * Third argument to {@link PrimusZkTlsRuntime.generateRequestParams} (`@primuslabs/zktls-js-sdk`).
 * Legacy callers may only set {@link CollectPrimusAttestationInput.timeoutMs} which maps to `timeout`.
 */
export interface PrimusGenerateRequestParamsOptions {
  timeout?: number;
}

export interface PrimusAttestationRequest {
  readonly requestid?: string;
  setAdditionParams(additionParams: string): void;
  setAttMode(attMode: PrimusAttMode): void;
  setAttConditions(attConditions: PrimusAttConditions): void;
  setAllJsonResponseFlag?(flag: string): void;
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
    options?: PrimusGenerateRequestParamsOptions
  ): PrimusAttestationRequest;
  sign(signParams: string): Promise<string>;
  startAttestation(attestationParamsStr: string): Promise<PrimusAttestation>;
  verifyAttestation(attestation: PrimusAttestation): boolean;
  getPrivateData(requestid: string, keyName?: string): unknown;
}

export interface PrimusRequestSigner {
  sign(signParams: string, appId: string): Promise<string>;
}

export interface PrimusZkTlsAdapterConfig {
  appId?: string;
  appSecret?: string;
  initOptions?: PrimusInitOptions;
  signer?: PrimusRequestSigner;
  runtimeFactory?: () => Promise<PrimusZkTlsRuntime> | PrimusZkTlsRuntime;
}

export interface CollectPrimusAttestationInput {
  templateId: string;
  userAddress: string;
  zktlsAppId?: string;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  additionParams?: PrimusAdditionParams;
  attConditions?: PrimusAttConditions;
  /** When set, must be `"true"` or `"false"` (Primus API). */
  allJsonResponseFlag?: "true" | "false";
  /** Invoked immediately before `PrimusZkTlsRuntime.startAttestation` (e.g. prove progress). */
  onBeforeStartAttestation?: () => void | Promise<void>;
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
  init(appId?: string): Promise<string | boolean>;
  collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle>;
}

/** Optional Primus fields returned by the template HTTP API (per identity property). */
export interface ResolvedPrimusTemplateOptions {
  attConditions?: PrimusAttConditions;
  allJsonResponseFlag?: "true" | "false";
  additionParams?: PrimusAdditionParams;
}

export interface ResolvePrimusTemplateResult extends ResolvedPrimusTemplateOptions {
  templateId: string;
  zktlsAppId?: string;
}

export interface CollectPrimusBundleForProveInput {
  templateId: string;
  zktlsAppId?: string;
  proveInput: Pick<
    ProveInput,
    "clientRequestId" | "identityPropertyId" | "provingParams" | "userAddress"
  >;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  attConditions?: PrimusAttConditions;
  additionParams?: PrimusAdditionParams;
  allJsonResponseFlag?: "true" | "false";
  /** Defaults from the template resolver (e.g. HTTP `/public/identity/templates`); explicit fields above override when set. */
  resolvedPrimusTemplateOptions?: ResolvedPrimusTemplateOptions;
  /** Forwarded to `collectAttestationBundle` — runs before `startAttestation`. */
  onBeforeStartAttestation?: () => void | Promise<void>;
}
