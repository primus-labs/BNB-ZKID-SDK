# SDK Spec

## Goal

Define the first public contract for this TypeScript SDK.

This spec intentionally stays narrow. Its job is to anchor implementation and review,
not to predict every future feature in advance.

The current phase is contract-first: freeze method signatures, input/output types,
and the status model before moving on to concrete implementation.

This document is subordinate to `docs/architecture.md`. If the two conflict, the
architecture document wins.

## Target Users

The target users are TypeScript application developers who need to integrate BNB
ZKID but do not want to understand too many low-level protocol details.

## Main Workflow

The first version of the SDK should optimize for one real end-to-end main path:

1. Call `GET /v1/config` to fetch supported providers, identity properties, and
   schemas.
2. Generate a zkTLS attestation result through Primus `zktls-js-sdk`.
3. Assemble and submit the `POST /v1/proof-requests` request body.
4. Poll `GET /v1/proof-requests/{proofRequestId}` until the status reaches
   `on_chain_attested` or `failed`.

## Success Criteria

The SDK design is successful if a developer can complete the main workflow with the
following properties:

- integration requires only a small amount of code
- Gateway request and response objects have a clear mapping contract
- the composition from zkTLS results to Gateway input is clear
- runtime errors are understandable
- low-level HTTP details do not need to be handled directly

## Public API

Only expose the `BnbZkIdClient` class and the related input/output types.

`GatewayClient`, the Primus adapter, and workflow helpers are internal architecture
concepts and are not part of the current public surface.

The concrete shape should stay close to the following:

```ts
export interface BnbZkIdError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BusinessParams = Record<string, unknown>;

export interface ProvingParams {
  businessParams?: BusinessParams;
  [key: string]: unknown;
}

export interface InitInput {
  appId: string;
}

export interface InitSuccessResult {
  success: true;
  /** `GET /v1/config` `providers` (Brevis wire: `id`, `properties[].id`, optional `description` / `businessParams`). */
  providers: BnbZkIdGatewayConfigProviderWire[];
}

export interface InitFailureResult {
  success: false;
  error?: BnbZkIdError;
}

export type InitResult = InitSuccessResult | InitFailureResult;

export type ProveStatus =
  | "initializing"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

export interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  identityPropertyId: string;
  provingParams?: ProvingParams;
}

export interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}

export interface ProveOptions {
  /** If set, invoked for each progress step; on any `prove` failure the SDK calls this once with `status: "failed"` before throwing. */
  onProgress?: (event: ProveProgressEvent) => void;
  closeDataSourceOnProofComplete?: boolean;
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

/** @deprecated Failures throw `BnbZkIdProveError`; this shape is no longer returned. */
export interface ProveFailureResult {
  status: "failed";
  clientRequestId: string;
  proofRequestId?: string;
  error?: BnbZkIdError;
}

/** @deprecated Prefer `ProveSuccessResult` for `prove` return type. */
export type ProveResult = ProveSuccessResult | ProveFailureResult;

export interface BnbZkIdClientMethods {
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
}

export declare class BnbZkIdProveError extends Error {
  readonly proveCode:
    | "00000"
    | "00001"
    | "00002"
    | "00003"
    | "00004"
    | "00005"
    | "00006"
    | "00007"
    | "10000"
    | "10001"
    | "10002"
    | "10003";
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;
}

/** Framework `error` on proof-requests (and typing aid for `prove` failure `details.brevis`). */
export type BnbZkIdFrameworkErrorCategory =
  | "binding_conflict"
  | "internal_error"
  | "policy_rejected"
  | "schema_invalid"
  | "zktls_invalid";

export interface BnbZkIdFrameworkError {
  category?: BnbZkIdFrameworkErrorCategory | string;
  code: string;
  detail?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export declare class BnbZkIdClient implements BnbZkIdClientMethods {
  constructor();
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
}
```

## `provingParams` Rules

`provingParams` uses the `ProvingParams` type. **`businessParams`** aligns with Gateway
`businessParams` for provider-specific tiering: it is validated against `GET /v1/config`
when provided and is used for the Gateway `POST /v1/proof-requests` body — it is **not**
copied into Primus `additionParams`.

If **`jumpToUrl`** is set to a non-empty string, the SDK sets top-level Primus
`additionParams.jumpToUrl` for zkTLS runtimes that consume it.

- Keys inside `businessParams` are usually provider-specific, such as
  `contribution` or `ordersVolume`; values are typically threshold arrays ordered
  from low to high tiers
- If explicit business thresholds are not needed, the caller may omit the entire
  `provingParams` object, or pass only `jumpToUrl` / other documented keys without
  `businessParams` (in that case the Gateway-side `businessParams` may still use the
  defaults from `GET /v1/config`)
- **Validation**: only when the caller provides
  **`provingParams.businessParams`**, the SDK compares it by deep equality with the
  `properties[].businessParams` configured for the current `identityPropertyId` in
  `GET /v1/config`; if they do not match, or the config does not include
  `businessParams`, `prove` throws `BnbZkIdProveError` (`proveCode` `00007`)

Example:

```ts
const input: ProveInput = {
  clientRequestId: "prove-task-001",
  userAddress: "0x1234567890abcdef1234567890abcdef12345678",
  identityPropertyId: "github_account_age",
  provingParams: {
    businessParams: {
      contribution: [21, 51]
    }
  }
};
```

At the Primus integration layer, only **`jumpToUrl`** from `provingParams` is merged into
`additionParams` (at the root); template resolver `additionParams` and workflow keys such as
`appId` remain as today.

The current narrowed internal rules are:

- At runtime the SDK resolves `templateId` from the Primus server based on
  `identityPropertyId`
- `provingParams.businessParams` is the primary source of `businessParams` in the
  Gateway `POST /v1/proof-requests` body (with any merge logic against config
  defaults left to the implementation)
- Primus `additionParams` include `clientRequestId`, `identityPropertyId`, merged template /
  workflow fields, and optional root **`jumpToUrl`** — not `provingParams` / `businessParams`

This keeps the public contract expressed in business-domain terms while leaving
Primus template resolution details internal.

## Internal Reference Contract

The following structures are not part of the current public surface, but they
describe the Gateway protocol objects the SDK will need to align with internally.

For the HTTP contract aligned with the BNB ZK ID Framework Gateway spec
(`POST /v1/proof-requests` and `GET /v1/proof-requests/{proofRequestId}`), use the
source of truth in **`src/gateway/types.ts`**, including:

- `GatewayCreateProofRequestInput` / `GatewayCreateProofRequestResult`
- `GatewayProofRequestStatusResult`
- `GatewayProofStatus`, public **`BnbZkIdFrameworkError`** (the internal
  `GatewayError`), `GatewayPropertyInformation`, and related types

On success, `prove` returns only `ProveSuccessResult`
(`status: "on_chain_attested"` and related fields). Gateway responses using either
**`onchain_attested`** or the legacy **`on_chain_attested`** are both recognized by
the workflow. On failure, the SDK always throws `BnbZkIdProveError` (see "prove
error codes").

## API Design Principles

- Expose only one stable entry class to callers and do not leak low-level Gateway
  integration details to business applications
- Prefer product-domain terminology over backend implementation terminology
- Keep the number of v1 methods as small as possible
- Optional fields must be truly optional and their presence conditions must be
  documented clearly
- Avoid broad `any` and opaque `object` in the public contract
- Keep the Primus integration layer decoupled from the Gateway layer and avoid
  exposing third-party SDK details directly in the public API

## Configuration Rules

The first version of the public API does not expose a configuration object through
the constructor.

Parameters related to Gateway, authentication, or runtime environment should be
re-evaluated in the real implementation phase before deciding whether they belong in
the public contract.

In the current implementation skeleton, runtime configuration comes from SDK
built-in configuration instead of constructor parameters so that
`new BnbZkIdClient()` remains unchanged.

The zkTLS SDK's own `appId` is no longer hard-coded in the built-in SDK
configuration. It is resolved dynamically at runtime from
`result.<app-node>.zkTlsAppId` returned by the template API.

The current implementation resolves app-level configuration and initializes Primus
during `init({ appId })` to avoid delaying that work until the first `prove(...)`
call.

The current built-in configuration still needs to provide Primus server template
resolver fields such as:

- `primus.templateResolver.baseUrl`
- `primus.templateResolver.resolveTemplatePath`
- `primus.signer.baseUrl`
- `primus.signer.signPath`

The current implementation requests the public template API, resolves the app-level
node first, and then reads the zkTLS app id and provider fields from it, for
example:

- `listdao -> result.brevisListaDAO.zkTlsAppId`
- `github_account_age -> result.brevisListaDAO.githubIdentityPropertyId`

If the remote app node name or field names do not match the default rule, they can
be overridden by `primus.templateResolver.appResponseKeyMap` and
`primus.templateResolver.responseKeyMap`.

For zkTLS request signing, the current implementation supports a server-side signer.
The signing API accepts a JSON body `{ appId, data }`, where `appId` is the
dynamically resolved `zkTlsAppId`, and returns `result.appSignature`.

Local tests and the harness can override this default configuration via external
config:

- Node uses `BNB_ZKID_CONFIG_PATH`
- The browser harness uses `globalThis.__BNB_ZKID_CONFIG_URL__`

But these override mechanisms should not become the primary integration path for the
published SDK. They now act as partial overrides merged onto the embedded defaults,
so tests and debug flows can change only the fields they need, such as
`gateway.baseUrl`.

## Error Model

For a full breakdown of `details.primus`, `details.brevis`, and `init` vs `prove`
failure shapes, see [`error-reference.md`](./error-reference.md).

`init` **throws** `BnbZkIdProveError` when `appId` is missing, not a `string`, or
empty after `trim()` (`proveCode` **`00007`**, `message` **`Invalid parameters`**,
and `details.message` / `details.field` point to the parameter problem). Other
configuration failures still return `InitResult` (`success: false` with
`BnbZkIdError` using the same numeric `code` / table `message` as `prove` failures,
for example **`00001`** when the appId is not in the Gateway `appIds` list or
template resolution fails). For those **`00001`** outcomes—and for **`prove`
before a successful `init`**—`details.reason` discriminates the case:
**`appId_not_enabled`**, **`template_resolve_failed`**, **`primus_init_failed`**, or
**`init_must_succeed_before_prove`**. Init failures that carry Primus context keep it
under **`details.primus`** (`code` mirrors outer `proveCode` when mappable). Calling
**`prove`** before init still uses **`00001`** but sets **`message`** to the
prove-before-init string (not the generic table line for **`00001`**).

Any `prove` failure **always throws** `BnbZkIdProveError` (which extends `Error`)
with these fields:

- `code` / `proveCode`: `00000`–`00007` and `10000`–`10003` (see table)
- `message`: fixed English explanation corresponding to the `proveCode` (see table
  below)
- `details`: parameter errors (including **00007** from both `init` and `prove`)
  include **`message`** (human-readable description) and **`field`** (the field
  name, such as `appId`, `userAddress`, `identityPropertyId`,
  `provingParams.businessParams`); optionally **`value`** (for example an invalid
  `identityPropertyId`). Other phases use `details.primus` (zkTLS) and
  `details.brevis` (Gateway)
- `clientRequestId` / `proofRequestId` if known

### prove Error Codes

| `code` | Meaning |
|--------|---------|
| `00000` | `Not detected the Primus Extension` (zkTLS wire `00006` → outer) |
| `00001` | `Failed to initialize` for init-time Gateway/template/Primus failures; **`prove` before `init`** uses the same code with a dedicated message and **`details.reason`**: **`init_must_succeed_before_prove`** |
| `00002` | `A verification process is in progress. Please try again later.` (zkTLS wire `00003`) |
| `00003` | `The user closes or cancels the verification process.` (zkTLS wire `00004`) |
| `00004` | `Target data missing...` (zkTLS wire `00013`) |
| `00005` | `Unstable internet connection. Please try again.` (zkTLS wire `10001`–`10004`) |
| `00006` | `Failed to generate zkTLS proof` (other zkTLS / prove-stage failures) |
| `00007` | `Invalid parameters` (`appId` in `init`; `prove` input shape, `userAddress`, `identityPropertyId` in config, `provingParams` / `businessParams` alignment) |
| `10000` | `This address has pending proof for identityPropertyId.` (zkTLS wire `-210001`) |
| `10001` | `This address is already bound to another account.` (`POST /v1/proof-requests` `error.category` **`binding_conflict`**) |
| `10002` | `Failed to onChain` (poll terminal **`submission_failed`**) |
| `10003` | `Failed to generate zkVM proof` (other Gateway create/poll/payload failures, **`TIMEOUT`**, non–`binding_conflict` Framework errors) |

For zkTLS-range codes **`00000`–`00007`** and **`10000`**, `details.primus` carries the
SDK payload; wire `code` values are a different namespace from Framework **`category`**
/ **`code`**.

For **`10001`–`10003`**, `details.brevis` carries Gateway / Framework context. **`POST
/v1/proof-requests`** failures that surface a Framework **`error`** (including HTTP
4xx/5xx bodies parsed by the client) use **`phase`: `createProofRequest`**, the
flattened Framework fields, and when applicable **`httpStatus`** / **`pathname`** /
**`url`** (same shape as GET query failures). Per Gateway semantics, top-level **`error`**
on a proof-request **GET** is an **API/query failure** (for example unknown id), while
**`failure`** is **lifecycle terminal failure** on an otherwise successful GET. The SDK
maps GET **`error`** to **`phase`: `getProofRequestStatus`**, optional wire **`status`**
when the server included it, and **`httpStatus`** / **`pathname`** / **`url`** when the
failure came from a non-OK HTTP response with a Framework body. When polling reaches a
**failed terminal lifecycle** (wire **`status`** such as **`prover_failed`** /
**`packaging_failed`** / **`submission_failed`** / **`internal_error`**, etc.), **`details.brevis`**
includes **`phase`: `pollProofRequestTerminal`**, wire **`status`**, normalized **`failure`**
when present, or `code` / `message` fallback (**`10002`** only when **`status`** is
**`submission_failed`**; otherwise **`10003`**). The Framework **`error`** object is flattened
(`category`, `code`, `message`, and related fields aligned with **`BnbZkIdFrameworkError`**);
lifecycle **`failure`** is normalized to **`failure: { reason, detail }`**. If a terminal
lifecycle status has no `failure` payload, `code` / `message` fallback values are used.
When polling exceeds **`PROOF_REQUEST_POLL_MAX_DURATION_MS`** in
**`src/config/proof-request-polling.ts`** (default 10 minutes),
`details.brevis` becomes **`code`: `TIMEOUT`**, **`message`: `timeout`**, together with
`phase: pollProofRequest`, `maxDurationMs`, `elapsedMs`, and related metadata (no duplicate
`proofRequestId` here — use the error object's top-level **`proofRequestId`** when set). The poll
interval comes from the same file's **`PROOF_REQUEST_POLL_INTERVAL_MS`** (default 3
seconds). Transport and other polling failures include `phase`, `cause`, and related metadata;
**`proofRequestId`** when known remains on **`BnbZkIdProveError.proofRequestId`** / `toJSON()`.

`BnbZkIdFrameworkErrorCategory` enumerates the spec's stable `category` values
(`policy_rejected`, `zktls_invalid`, `schema_invalid`, `binding_conflict`,
`internal_error`), while still remaining type-compatible with future server-defined
categories through `string`.

## Runtime Support

The first-version runtime target should be explicit:

- modern TypeScript users
- ESM-first
- decide later whether CJS support is needed before the build strategy is finalized
- avoid depending on Node-only globals in shared logic

## Usage Example

Examples in the README and `examples/` should stay roughly at this level of
complexity:

```ts
import { BnbZkIdClient, BnbZkIdProveError } from "@superorange/bnbzkid-js-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "listdao",
});
if (!initResult.success) {
  console.error(initResult.error);
  process.exit(1);
}

const providers = initResult.providers;
const identityPropertyId = providers[0]?.properties[0]?.id;

if (!identityPropertyId) {
  throw new Error("No identity property is available for this appId.");
}

try {
  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId,
    },
    {
      onProgress(event) {
        console.log(event.status, event.proofRequestId);
      },
    }
  );
  console.log(proveResult.status, proveResult.walletAddress);
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error(error.code, error.message, error.details);
  } else {
    throw error;
  }
}
```

## Deferred Decisions

Keep the following questions open until the product contract is clearer:

- whether `prove(...)` should directly depend on the Primus adapter internally, or
  allow callers to inject results manually
- whether `clientRequestId` should remain required or be auto-generated by the SDK
- whether high-level helpers should embed the default proof serialization rule for
  Primus `zktls-js-sdk`
- multi-chain or multi-network abstractions
- a plugin system for transport or signer
- batch operations
- local cryptographic helper capabilities beyond the first required workflow
