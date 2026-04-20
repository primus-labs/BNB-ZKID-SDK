import {
  createBnbZkIdProveError,
  getInvalidAppIdMessage,
  getInvalidIdentityPropertyIdMessage
} from "../errors/prove-error.js";
import { isBusinessParamsObject } from "../gateway/business-params.js";
import { jsonDeepEqual } from "../gateway/json-deep-equal.js";
import {
  findBusinessParamsForIdentityPropertyIdInProvidersWire,
  isIdentityPropertyIdInProvidersWire
} from "../gateway/providers-wire-lookup.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import type { InitInput, ProveInput, ProvingParams } from "../types/public.js";

/** Typical EVM hex address: `0x` + 40 hex digits (checksum not required here). */
const EVM_WALLET_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function isStandardEvmWalletAddress(value: string): boolean {
  return EVM_WALLET_ADDRESS.test(value.trim());
}

function provingParamsRootObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clientRequestIdForContext(input: unknown): string | undefined {
  if (!provingParamsRootObject(input)) {
    return undefined;
  }
  const id = input.clientRequestId;
  return typeof id === "string" ? id : undefined;
}

/** Safe third argument for {@link createBnbZkIdProveError} under `exactOptionalPropertyTypes`. */
function proveErrContext(clientRequestId: string | undefined): { clientRequestId: string } | undefined {
  if (typeof clientRequestId !== "string") {
    return undefined;
  }
  const t = clientRequestId.trim();
  return t.length > 0 ? { clientRequestId: t } : undefined;
}

export function assertInitInputValidOrThrow(input: InitInput): void {
  if (typeof input.appId !== "string" || input.appId.trim().length === 0) {
    throw createBnbZkIdProveError("00003", {
      messageOverride: getInvalidAppIdMessage("empty")
    });
  }
}

export function assertProveInputValidOrThrow(
  proveInput: unknown,
  configProvidersWire: BnbZkIdGatewayConfigProviderWire[]
): asserts proveInput is ProveInput {
  if (!provingParamsRootObject(proveInput)) {
    throw createBnbZkIdProveError("30002", proveErrContext(clientRequestIdForContext(proveInput)));
  }

  const { clientRequestId, userAddress, identityPropertyId, provingParams } = proveInput as Record<
    string,
    unknown
  >;

  if (typeof clientRequestId !== "string" || clientRequestId.trim().length === 0) {
    throw createBnbZkIdProveError(
      "00005",
      proveErrContext(typeof clientRequestId === "string" ? clientRequestId : undefined)
    );
  }

  const trimmedRequestId = clientRequestId.trim();

  if (typeof userAddress !== "string" || !isStandardEvmWalletAddress(userAddress)) {
    throw createBnbZkIdProveError("00002", proveErrContext(trimmedRequestId));
  }

  if (typeof identityPropertyId !== "string" || identityPropertyId.trim().length === 0) {
    throw createBnbZkIdProveError("00004", {
      ...(proveErrContext(trimmedRequestId) ?? {}),
      messageOverride: getInvalidIdentityPropertyIdMessage("empty")
    });
  }

  const idTrim = identityPropertyId.trim();
  if (!isIdentityPropertyIdInProvidersWire(configProvidersWire, idTrim)) {
    throw createBnbZkIdProveError("00004", {
      ...(proveErrContext(trimmedRequestId) ?? {}),
      messageOverride: getInvalidIdentityPropertyIdMessage("not_supported")
    });
  }

  if (provingParams !== undefined && provingParams !== null) {
    if (!provingParamsRootObject(provingParams)) {
      throw createBnbZkIdProveError("30002", proveErrContext(trimmedRequestId));
    }
    const pp = provingParams as ProvingParams;
    const explicitBusiness = pp.businessParams;
    if (explicitBusiness !== undefined && !isBusinessParamsObject(explicitBusiness)) {
      throw createBnbZkIdProveError("30002", proveErrContext(trimmedRequestId));
    }
    if (explicitBusiness !== undefined) {
      const expected = findBusinessParamsForIdentityPropertyIdInProvidersWire(
        configProvidersWire,
        idTrim
      );
      if (expected === undefined) {
        throw createBnbZkIdProveError("30002", proveErrContext(trimmedRequestId));
      }
      if (!jsonDeepEqual(explicitBusiness, expected)) {
        throw createBnbZkIdProveError("30002", proveErrContext(trimmedRequestId));
      }
    }
  }
}
