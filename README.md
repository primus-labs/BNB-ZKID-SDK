# BNB-ZKID-SDK

## Product And Capability Overview

`@primuslabs/bnb-zkid-sdk` is a TypeScript SDK for application developers who want a single integration surface for the BNB ZK ID flow.

The public SDK is intentionally small. The current public facade exposes only one class:

- `BnbZkIdClient`

And two high-level methods:

- `init({ appId })`
- `prove(input, options?)`

At a high level, the SDK helps an application:

1. Load the Gateway configuration for the current app.
2. Initialize the Primus zkTLS runtime for the same app.
3. Start a proof flow for a selected `identityPropertyId`, and run **zkTLS** proof.
4. Submit the proof request to the BNB ZK ID Gateway, and run **zkVM** proof.
5. Poll the proof request until the final result is attested or failed.

### What Is Public And Stable

The following items are part of the current public surface:

- `BnbZkIdClient`
- public input and output types from the package root
- `BnbZkIdProveError`
- Gateway config wire mirror types:
  `BnbZkIdGatewayConfigProviderWire` and
  `BnbZkIdGatewayConfigPropertyWire`

## Quick Start And Integration Example

### Prerequisites

Installing the Primus extension test package is only required during the current testing phase. If you have installed the official version of the Primus extension, you need to stop this process first.

* Download the [Primus extension test package](https://github.com/primus-labs/BNB-ZKID-SDK/blob/main/extension/PRIMUS-0.3.47.zip) and unzip.

* Access `chrome://extensions/`

* Check `Developer mode`

* Click on `Load unpacked extension`

* Select the unzip folder.

### Install

If this SDK is distributed to your integration as the package `@primuslabs/bnb-zkid-sdk`, use:

```bash
npm install @primuslabs/bnb-zkid-sdk
```

### Demo Link

https://github.com/primus-labs/BNB-ZKID-SDK-Demo

### Minimal Integration Example

```ts
import { BnbZkIdClient, BnbZkIdProveError } from "@primuslabs/bnb-zkid-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C" // example test appId; it must be registered in the BNB ZK ID Framework On-chain Identity Registry: https://github.com/brevis-network/brevis-zk-id-contracts
});

if (!initResult.success) {
  console.error("SDK init failed", initResult.error);
}

console.log("Supported providers:", initResult.providers);

try {
  const result = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678", // user address
      identityPropertyId: "0xa8b86ba89172f269976e3ef2dafed6de381b92a6d19a2ab848273b6f8db69c7c", // the binance identityPropertyId for test
    },
    {
      onProgress(event) {
        console.log("progress", event.status, event.proofRequestId ?? "pending");
      }
    }
  );

  console.log("Proof completed", result);
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error("Proof failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      clientRequestId: error.clientRequestId,
      proofRequestId: error.proofRequestId
    });
  } else {
    console.error("Unexpected error", error);
  }
}
```

### Recommended Integration Sequence

1. Create a new `BnbZkIdClient`.
2. Call `init({ appId })` before any prove request.
3. Read `initResult.providers` to discover the supported providers and
   `identityPropertyId` values.
4. Call `prove(...)` with a unique `clientRequestId`, the target wallet address,
   and the selected `identityPropertyId`.
5. Handle `onProgress` for UI status updates.
6. Handle `BnbZkIdProveError` in `try/catch`.

## API Reference

### Package Exports

The package root exports:

- `BnbZkIdClient`
- `BnbZkIdProveError`
- public contract types such as `InitInput`, `InitResult`, `ProveInput`,
  `ProveOptions`, `ProveProgressEvent`, `ProveSuccessResult`, `ProveStatus`,
  `BusinessParams`, and `ProvingParams`

## `BnbZkIdClient`

### Constructor

```ts
new BnbZkIdClient()
```

The constructor takes no arguments. Runtime configuration is resolved
automatically as described above.

## `init(input)`

### Signature

```ts
init(input: InitInput): Promise<InitResult>
```

### Input

```ts
interface InitInput {
  appId: string;
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `appId` | `string` | Yes | Application identifier registered for the BNB ZK ID flow. |

### Success Result

```ts
interface InitSuccessResult {
  success: true;
  providers: BnbZkIdGatewayConfigProviderWire[];
}
```

`providers` mirrors the Gateway `GET /v1/config` provider list:

```ts
interface BnbZkIdGatewayConfigProviderWire {
  id: string;
  description?: string;
  properties: BnbZkIdGatewayConfigPropertyWire[];
}

interface BnbZkIdGatewayConfigPropertyWire {
  id: string;
  description?: string;
  businessParams?: Record<string, unknown>;
}
```

### Failure Result

```ts
interface InitFailureResult {
  success: false;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

### `init` Behavior Notes

- `init` must succeed before `prove(...)` is called.
- If `appId` is empty or invalid, `init` throws `BnbZkIdProveError` with code
  `00007`.
- If the Gateway rejects the `appId`, or Primus initialization fails, `init`
  returns `success: false`.
- On success, the client stores the initialized app context for later `prove(...)`
  calls.

## `prove(input, options?)`

### Signature

```ts
prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>
```

### Input

```ts
interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  identityPropertyId: string;
  provingParams?: ProvingParams;
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `clientRequestId` | `string` | Yes | Client-defined request identifier used for correlation and logging. |
| `userAddress` | `string` | Yes | EVM wallet address. Must be `0x` followed by 40 hex characters. |
| `identityPropertyId` | `string` | Yes | Identity property to prove, such as `github_account_age`. |
| `provingParams` | `ProvingParams` | No | Optional object forwarded into the zkTLS proving flow. |

### `ProvingParams`

```ts
type BusinessParams = Record<string, unknown>;

interface ProvingParams {
  businessParams?: BusinessParams;
  [key: string]: unknown;
}
```

Rules:

- `provingParams` must be a plain object when provided.
- Other `provingParams` fields are reserved for future zkTLS extensions and are
  passed through as-is. 

### Options

```ts
interface ProveOptions {
  onProgress?: (event: ProveProgressEvent) => void;
  closeDataSourceOnProofComplete?: boolean;
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `onProgress` | `(event) => void` | No | Callback invoked when the prove workflow changes status. |
| `closeDataSourceOnProofComplete` | `boolean` | No | Forwarded to the underlying zkTLS browser flow so the data-source tab may be closed after proof completion. |

### Progress Event

```ts
type ProveStatus =
  | "initializing"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}
```

Typical progress order:

1. `initializing`
2. `data_verifying`
3. `proof_generating`
4. `on_chain_attested`

If the Gateway reaches a terminal failure, the callback may emit `failed` before
the SDK throws an error.

### Success Result

```ts
interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}
```

### `prove` Behavior Notes

- `prove(...)` always requires a previously successful `init(...)`.
- `prove(...)` never returns a failure result object.
- On any failure, `prove(...)` throws `BnbZkIdProveError`.
- Both Gateway success payloads `onchain_attested` and legacy
  `on_chain_attested` are accepted internally, but the public success result always
  normalizes to `status: "on_chain_attested"`.

## Error Codes And Exception Handling

### Error Model Summary

There are two public failure surfaces:

1. `init(...)`
   - invalid input may throw `BnbZkIdProveError`
   - operational failures return `InitFailureResult`
2. `prove(...)`
   - all failures throw `BnbZkIdProveError`

### `BnbZkIdProveError`

```ts
class BnbZkIdProveError extends Error {
  readonly proveCode: BnbZkIdProveErrorCode;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;
}
```

Important notes:

- `code` is an alias of `proveCode`.
- `details.primus` is used for zkTLS and Primus-stage failures.
- `details.brevis` is used for Gateway and proof-lifecycle failures.
- `clientRequestId` is included when the failure is associated with a specific
  prove call.
- `proofRequestId` is included when the Gateway had already created a proof
  request before the failure occurred.

### Error Code Table

| Code | Default message | Typical meaning | Retry guidance |
| --- | --- | --- | --- |
| `00000` | `Not detected the Primus Extension` | Primus extension or required browser runtime is missing. | Retry only after the required browser environment is installed and available. |
| `00001` | `Failed to initialize` | SDK initialization failed, including calling `prove` before a successful `init`, unsupported `appId`, or app-level setup failure. | Check app configuration first. Retry only after the root cause is fixed. |
| `00002` | `A verification process is in progress. Please try again later.` | Primus reported that another verification flow is already active. | Retry later. |
| `00003` | `The user closes or cancels the verification process.` | The user cancelled or closed the verification flow. | Safe to retry when the user is ready. |
| `00004` | `Target data missing. Please check whether the data json path in the request URL's response aligns with your template.` | The zkTLS template could not extract the expected data from the target source. | Retry only after fixing the template or data source. |
| `00005` | `Unstable internet connection. Please try again.` | Network-level failure reported by the zkTLS stage. | Usually safe to retry. |
| `00006` | `Failed to generate zkTLS proof` | Generic Primus or zkTLS proving failure. | Retry after reviewing `details.primus`. |
| `00007` | `Invalid parameters` | Public input validation failed. | Do not retry until the request payload is corrected. |
| `10000` | `This address has pending proof for identityPropertyId.` | The address already has a pending proof for the same property. | Retry later or wait for the existing request to finish. |
| `10001` | `This address is already bound to another account.` | Gateway reported a binding conflict. | Usually not retryable until the account binding state changes. |
| `10002` | `Failed to onChain` | Gateway reached an on-chain submission failure. | Review `details.brevis` and retry only if the backend indicates it is safe. |
| `10003` | `Failed to generate zkVM proof` | Gateway or proof lifecycle failed after proof request creation, or the Gateway returned an invalid terminal payload. | Inspect `details.brevis` before retrying. |

### Common Failure Shapes

#### Invalid Parameter Error

Example:

```ts
try {
  await client.prove({
    clientRequestId: "",
    userAddress: "not-an-address",
    identityPropertyId: ""
  });
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error(error.code); // 00007
    console.error(error.details);
  }
}
```

Typical validation fields include:

- `appId`
- `clientRequestId`
- `userAddress`
- `identityPropertyId`
- `provingParams`
- `provingParams.businessParams`

#### Gateway Failure

When the Gateway returns a framework or proof-lifecycle failure, the SDK throws a
`BnbZkIdProveError` with `details.brevis`.

Typical fields under `details.brevis` include:

- `category`
- `code`
- `message`
- `status`
- `failure`
- `phase`
- `rawDetails`

#### Primus Failure

When the zkTLS stage fails, the SDK throws a `BnbZkIdProveError` with
`details.primus`.

Typical fields under `details.primus` include:

- `code`
- `message`
- `data`
