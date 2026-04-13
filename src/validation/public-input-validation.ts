import { createBnbZkIdProveError } from "../errors/prove-error.js";
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

/**
 * Throws {@link import("../errors/prove-error.js").BnbZkIdProveError} `00007` / `Invalid parameters` when
 * `appId` is missing or not a non-empty string.
 */
export function assertInitInputValidOrThrow(input: InitInput): void {
  if (typeof input.appId !== "string" || input.appId.trim().length === 0) {
    throw createBnbZkIdProveError("00007", {
      message: "appId must be a non-empty string.",
      field: "appId"
    });
  }
}

/**
 * Validates runtime `ProveInput` and config alignment; throws `00007` with `details.message` / `details.field`.
 */
export function assertProveInputValidOrThrow(
  proveInput: unknown,
  configProvidersWire: BnbZkIdGatewayConfigProviderWire[]
): asserts proveInput is ProveInput {
  if (!provingParamsRootObject(proveInput)) {
    throw createBnbZkIdProveError(
      "00007",
      {
        message: "prove input must be a plain object.",
        field: "proveInput"
      },
      proveErrContext(clientRequestIdForContext(proveInput))
    );
  }

  const { clientRequestId, userAddress, identityPropertyId, provingParams } = proveInput as Record<
    string,
    unknown
  >;

  if (typeof clientRequestId !== "string" || clientRequestId.trim().length === 0) {
    throw createBnbZkIdProveError(
      "00007",
      {
        message: "clientRequestId must be a non-empty string.",
        field: "clientRequestId"
      },
      proveErrContext(typeof clientRequestId === "string" ? clientRequestId : undefined)
    );
  }

  const trimmedRequestId = clientRequestId.trim();

  if (typeof userAddress !== "string" || !isStandardEvmWalletAddress(userAddress)) {
    throw createBnbZkIdProveError(
      "00007",
      {
        message:
          "userAddress must be a valid EVM wallet address (0x followed by 40 hexadecimal characters).",
        field: "userAddress"
      },
      proveErrContext(trimmedRequestId)
    );
  }

  if (typeof identityPropertyId !== "string" || identityPropertyId.trim().length === 0) {
    throw createBnbZkIdProveError(
      "00007",
      {
        message: "identityPropertyId must be a non-empty string.",
        field: "identityPropertyId"
      },
      proveErrContext(trimmedRequestId)
    );
  }

  const idTrim = identityPropertyId.trim();
  if (!isIdentityPropertyIdInProvidersWire(configProvidersWire, idTrim)) {
    throw createBnbZkIdProveError(
      "00007",
      {
        message:
          "identityPropertyId is not listed in init().providers[].properties[].id.",
        field: "identityPropertyId",
        value: idTrim
      },
      proveErrContext(trimmedRequestId)
    );
  }

  if (provingParams !== undefined && provingParams !== null) {
    if (!provingParamsRootObject(provingParams)) {
      throw createBnbZkIdProveError(
        "00007",
        {
          message: "provingParams must be a plain object when provided.",
          field: "provingParams"
        },
        proveErrContext(trimmedRequestId)
      );
    }
    const pp = provingParams as ProvingParams;
    const explicitBusiness = pp.businessParams;
    if (explicitBusiness !== undefined && !isBusinessParamsObject(explicitBusiness)) {
      throw createBnbZkIdProveError(
        "00007",
        {
          message: "provingParams.businessParams must be a plain object when provided.",
          field: "provingParams.businessParams"
        },
        proveErrContext(trimmedRequestId)
      );
    }
    if (explicitBusiness !== undefined) {
      const expected = findBusinessParamsForIdentityPropertyIdInProvidersWire(
        configProvidersWire,
        idTrim
      );
      if (expected === undefined) {
        throw createBnbZkIdProveError(
          "00007",
          {
            message:
              "provingParams.businessParams was provided, but init().providers[].properties[] has no businessParams for this identityPropertyId.",
            field: "provingParams.businessParams"
          },
          proveErrContext(trimmedRequestId)
        );
      }
      if (!jsonDeepEqual(explicitBusiness, expected)) {
        throw createBnbZkIdProveError(
          "00007",
          {
            message:
              "provingParams.businessParams must exactly match init().providers[].properties[].businessParams for this identityPropertyId.",
            field: "provingParams.businessParams"
          },
          proveErrContext(trimmedRequestId)
        );
      }
    }
  }
}
