# BNB-ZKID-SDK

## Introduction

The **BNB ZK ID SDK** is a core component of the **BNB ZK ID Framework**, providing a unified integration interface for application frontends.

By integrating this SDK, applications can invoke both the **Primus zkTLS** and **Brevis zkVM** proving capabilities through one consistent flow, while receiving standardized progress updates and final proof results across all proving stages.

### Key Features

* **Unified Orchestration**: Coordinates zkTLS and zkVM proofs in a single flow, abstracting away the complexity of underlying cross-platform interactions.
* **Multi-Platform Support**: Supports privacy-preserving verification of data from major platforms including Binance, OKX, GitHub, Steam, and Amazon. The supported data scope will continue to expand based on requirements.
* **Standardized Output**: Offers unified state tracking for the proof lifecycle and consistent result formats.


> [!NOTE]
> For a comprehensive understanding of the business logic, supported data sources, detailed proof outputs, and full integration specifications, please refer to:
> **[ZK ID SDK Integration Guide](https://docs.google.com/document/d/1dPf19pJUi8okP5eifMRgo0WuZNTceEPBdUv9SZQkgiU/edit?usp=sharing)**




## Live Demo

Use the live demo below to experience the complete end-to-end flow from an end-user perspective:

**[BNB ZK ID Live Demo](http://api-dev.padolabs.org:38113/)**




## Product and Capability Overview

`@primuslabs/bnb-zkid-sdk` is a TypeScript SDK for application developers who want a single integration surface for the BNB ZK ID flow.

The public SDK is intentionally minimal. The current public facade exposes only one class:

- `BnbZkIdClient`

And three high-level methods:

- `init({ appId })`
- `prove(input, options?)`
- `queryProofResult({ proofRequestId, clientRequestId? })`

At a high level, the SDK helps an application:

1. Load the Gateway configuration for the current app.
2. Initialize the Primus zkTLS runtime for the same app.
3. Start a proof flow for a selected `identityPropertyId`, and run **zkTLS** proof.
4. Submit the proof request to the BNB ZK ID Gateway, and run **zkVM** proof.
5. Poll the proof request until the final result is attested or failed.

### What is Public and Stable

The following items are part of the current public surface:

- `BnbZkIdClient`
- public input and output types from the package root
- `BnbZkIdProveError`
- Gateway config wire mirror types: `BnbZkIdGatewayConfigProviderWire` and `BnbZkIdGatewayConfigPropertyWire`



## Quick Start and Integration Example

### Install

If this SDK is distributed to your integration as the package `@primuslabs/bnb-zkid-sdk`, use:

```bash
npm install @primuslabs/bnb-zkid-sdk
```

### Frontend Integration Reference

https://github.com/primus-labs/BNB-ZKID-SDK-Demo

This repository is a developer integration reference that shows how to implement the frontend flow with this SDK.


### Minimal Integration Example

```ts
import { BnbZkIdClient, BnbZkIdProveError } from "@primuslabs/bnb-zkid-sdk";

const client = new BnbZkIdClient();

try {
  const initResult = await client.init({
    appId: "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C" // example test appId; it must be registered in the BNB ZK ID Framework On-chain Identity Registry: https://github.com/brevis-network/brevis-zk-id-contracts
  });
  console.log("Supported providers:", initResult.providers);
  const result = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678", // user address
      identityPropertyId: "0xa8b86ba89172f269976e3ef2dafed6de381b92a6d19a2ab848273b6f8db69c7c", // the binance identityPropertyId for test
      // provingParams: {
      //   jumpToUrl: "https://www.amazon.com" // For Amazon-related proofs, pass the target page URL.
      // },
    },
    {
      onProgress(event) {
        console.log(
          "progress",
          JSON.stringify({
            status: event.status,
            clientRequestId: event.clientRequestId,
            proofRequestId: event.proofRequestId
          })
        );
      }
    }
  );

  console.log("Proof completed", result);
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error("Proof failed", {
      code: error.code,
      message: error.message,
      clientRequestId: error.clientRequestId
    });
  } else {
    console.error("Unexpected error", error);
  }
}
```

### Recommended Integration Sequence

1. Create a new `BnbZkIdClient`.
2. Call `init({ appId })` before any prove request.
3. Read `initResult.providers` to discover the supported providers and `identityPropertyId` values.
4. Call `prove(...)` with a unique `clientRequestId`, the target wallet address, and the selected `identityPropertyId`.
5. Handle `onProgress` for UI status updates.
6. Handle `BnbZkIdProveError` in `try/catch`.

**Note**: the `init` method automatically checks whether the [Primus Extension](https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe) is installed, and prompts the user to install it if it is missing.



## API Reference

### Package Exports

The package root exports:

- `BnbZkIdClient`
- `BnbZkIdProveError`
- public contract types such as `InitInput`, `InitSuccessResult`, `ProveInput`, `ProveOptions`, `ProveProgressEvent`, `ProveSuccessResult`, `ProveStatus`, `BusinessParams`, and `ProvingParams`



## `BnbZkIdClient`

### Constructor

```ts
new BnbZkIdClient()
```

The constructor takes no arguments. Runtime configuration is resolved automatically as described above.



## `init(input)`

### Signature

```ts
init(input: InitInput): Promise<InitSuccessResult>
```

### Input

```ts
interface InitInput {
  appId: string;
}
```

| Field   | Type     | Required | Description                                               |
| ------- | -------- | -------- | --------------------------------------------------------- |
| `appId` | `string` | Yes      | Application identifier registered for the BNB ZK ID flow. |

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

### `init` Behavior Notes

- `init` must succeed before `prove(...)` is called.
- On any failure, `init` throws `BnbZkIdProveError`.
- On success, the client stores the initialized app context for later `prove(...)` calls.



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

| Field                | Type            | Required | Description                                                  |
| -------------------- | --------------- | -------- | ------------------------------------------------------------ |
| `clientRequestId`    | `string`        | Yes      | Client-defined request identifier used for tracing and logging. |
| `userAddress`        | `string`        | Yes      | EVM wallet address. Must be `0x` followed by 40 hex characters. |
| `identityPropertyId` | `string`        | Yes      | A unique identifier for a provider-defined verifiable data scope, such as  `0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff`. |
| `provingParams`      | `ProvingParams` | No       | `jumpToUrl`: For Amazon-related proofs (which may require different regional service sites), pass the target page URL. |


### `ProvingParams`

```ts
type BusinessParams = Record<string, unknown>;

interface ProvingParams {
  businessParams?: BusinessParams;
  jumpToUrl?: string;
  [key: string]: unknown;
}

// For Amazon-related proofs, pass the target page URL, for example:
// provingParams: {
//  jumpToUrl: "https://www.amazon.com"
// },
```

Rules:

- `provingParams` must be a plain object when provided.
- `businessParams` is validated against `GET /v1/config` when present and is used for the Gateway request body, not for Primus `additionParams`.
- `jumpToUrl` should be set when a data-source platform has different regional service sites. For example, for Amazon-related proofs, pass a specific target page URL.

### Options

```ts
interface ProveOptions {
  onProgress?: (event: ProveProgressEvent) => void;
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `onProgress` | `(event) => void` | No | Callback invoked when the prove workflow changes status. |

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

| Field | Description |
| --- | --- |
| `status` | Current coarse-grained prove step (see `ProveStatus`). |
| `clientRequestId` | Always present; matches `ProveInput.clientRequestId`. |
| `proofRequestId` | Present once the Gateway returns a non-empty id from `createProofRequest`: from **`proof_generating`** through **`on_chain_attested`**. Omitted for `initializing` and `data_verifying`. |

Typical progress order:

1. `initializing` — workflow starting (Primus attestation not yet collected).
2. `data_verifying` — zkTLS / data-source verification in progress.
3. `proof_generating` — Gateway accepted the proof request; **`proofRequestId`** is set when the server returns it; SDK then polls until the request settles.
4. `on_chain_attested` — success; **`proofRequestId`** included when available (same id as step 3 when present).

On failure, `onProgress` runs once with `status: "failed"` (then `prove` throws `BnbZkIdProveError`). Use `catch` for `code` / `message` / optional `proofRequestId` on the error object.

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
- Both Gateway success payloads `onchain_attested` and legacy `on_chain_attested` are accepted internally, but the public success result always normalizes to `status: "on_chain_attested"`.



## `queryProofResult(input)`

`queryProofResult(...)` is a supplemental API for recovery scenarios.
Most integrations should not call it directly. In the normal flow, prefer `prove(...)` and let the SDK handle submission and polling internally.

### Signature

```ts
queryProofResult(input: QueryProofResultInput): Promise<QueryProofResultResult>
```

### Input

```ts
interface QueryProofResultInput {
  proofRequestId: string;
  clientRequestId?: string;
}
```

Use this method only when the caller already has a known `proofRequestId`, for example after application reload, persisted task recovery, or manual status reconciliation.

### Result

```ts
type QueryProofResultResult =
  | {
      status: "initialized" | "generating" | "submitting";
      proofRequestId: string;
      clientRequestId?: string;
    }
  | {
      status: "on_chain_attested";
      walletAddress: string;
      providerId: string;
      identityPropertyId: string;
      proofRequestId: string;
      clientRequestId?: string;
    }
  | {
      status: "prover_failed" | "packaging_failed" | "submission_failed" | "internal_error" | "failed";
      proofRequestId: string;
      clientRequestId?: string;
    };
```

Behavior notes:

- This method performs exactly one `GET /v1/proof-requests/{proofRequestId}` call (no polling).
- If `clientRequestId` is provided in input, it is echoed in the returned status object.
- If `clientRequestId` is omitted, it is omitted from the returned status object.
- Pending states (`initialized` / `generating` / `submitting`) are returned directly.
- Terminal Gateway states are returned directly as terminal statuses without a nested `failure` object.
- This method throws `BnbZkIdProveError` only for invalid input, transport failures, or malformed/unusable payloads.



## Error Codes and Exception Handling

### Error Model Summary

The public methods now use two patterns:

1. `init(...)` failures throw `BnbZkIdProveError`
2. `prove(...)` failures throw `BnbZkIdProveError`
3. `queryProofResult(...)` returns current status for pending, attested, and terminal proof-request states
4. `queryProofResult(...)` throws `BnbZkIdProveError` only for invalid input, transport failures, or malformed/unusable payloads

### `BnbZkIdProveError`

```ts
class BnbZkIdProveError extends Error {
  readonly code: string;
  readonly message: string;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;
}
```

Important notes:

- Publicly, the stable error envelope is `code`, `message`,
  `clientRequestId?`, and `proofRequestId?`.
- Internally, `code` is an alias of `proveCode`.
- `clientRequestId` (`string`, optional): A unique identifier for each proof task.
- `proofRequestId` (`string`, optional): Present only after the SDK has already obtained a non-empty proof request id from Gateway or the deterministic harness.

### Error Code Reference and Troubleshooting Guide

Error codes and messages are maintained in this document:
[`docs/error-codes-references.md`](./docs/error-codes-references.md).

Use this reference as the primary lookup during integration and troubleshooting:

- Search by `code` to identify the exact failure category.
- Review the corresponding message and recommended handling strategy.
- Use `clientRequestId` and `proofRequestId` to correlate frontend logs with backend/Gateway records.
- Keep this README focused on SDK contracts, while the error codes reference document carries continuously updated details.
