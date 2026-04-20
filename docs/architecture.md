# Architecture

## Document Role

This document is the top-level architecture design for `BNB-ZKID-SDK` and the
highest-priority design baseline before implementation.

The goal is not to pre-write every implementation detail. The goal is to freeze the
following first:

- what problem the SDK actually solves
- how the SDK relates to Primus `zktls-js-sdk`, the BNB ZK ID Gateway, and the
  backend proving system
- what the external facade API should look like, and how it should eventually map
  to the internal Gateway integration layer
- module boundaries, dependency direction, and ownership
- data flow, status flow, and error flow
- implementation order and exit criteria for each phase

Implementation code, detailed interfaces, and test strategy should all be
constrained by this document.

## Design-Phase Principles

The current phase uses a `contract-first` strategy:

1. Freeze the overall architecture first.
2. Then freeze the public API and core data structures.
3. Then implement the Gateway integration.
4. Finally implement the Primus integration and end-to-end integration work.

Avoid the following in this phase:

- writing `HttpTransport` details first and reverse-engineering the API later
- writing Primus attestation serialization first and only then explaining the
  architecture
- expanding provider-specific details before defining stable abstraction boundaries

## Background And Problem Definition

This SDK is not meant to generate zero-knowledge proofs itself, and it is not meant
to replace either the Primus SDK or the Gateway.

Its responsibility is to combine these two flows:

- client applications using Primus zkTLS capabilities
- client applications using the BNB ZK ID Gateway

into one stable, clear, and reusable TypeScript integration interface.

Based on the architecture notes, the end goal of the SDK is not merely to expose the
Gateway's atomic interfaces. It should provide a higher-level facade for business
applications:

- `init({ appId })`
- `prove(...)`

At the same time, under the facade it should preserve a more OpenAPI-shaped
`GatewayClient` as the future internal low-level integration layer:

- `getConfig()`
- `createProofRequest(...)`
- `getProofRequestStatus(...)`

From the business application's point of view, a developer needs to:

1. Know which `provider`, `identityProperty`, schema, and business constraints the
   Gateway currently supports.
2. Call Primus `zktls-js-sdk` to obtain a zkTLS attestation.
3. Prepare threshold inputs such as `provingParams` according to
   `identityPropertyId` and provider rules.
4. Assemble the attestation, private data, public data, and related fields into a
   `ProofRequest` accepted by the Gateway.
5. Submit `POST /v1/proof-requests`.
6. Return status to the caller through progress callbacks while `prove(...)` is
   running, until `on_chain_attested` succeeds; on failure, throw
   `BnbZkIdProveError` (the progress stream may still emit `failed`).

In essence, this SDK is a client-side integration orchestration SDK.

## System Context

### External Participants

`Application`

- A business application using this SDK, such as a web app, wallet extension page,
  or another TypeScript client.

`Primus zktls-js-sdk`

- Starts the zkTLS attestation flow.
- Produces the attestation result together with related private/public data.

`BNB ZK ID Gateway`

- Exposes `GET /v1/config`
- Exposes `POST /v1/proof-requests`
- Exposes `GET /v1/proof-requests/{proofRequestId}`

`Internal Proving System`

- Lives behind the Gateway and orchestrates the prover, proof lifecycle, and
  on-chain flow.
- Is not directly integrated by this SDK.

`On-chain Identity Registry`

- Records or carries the final on-chain result.
- Is not a direct public API query target in the current phase.
- Its exact integration method is not frozen yet.

### System Boundaries

This SDK directly owns three boundaries:

1. The product-API boundary between application code and the facade
   `BnbZkIdClient`
2. The orchestration boundary between the facade and the future internal
   `GatewayClient` / `zkTLS Adapter`
3. The integration boundary between the SDK and Gateway / Primus / Registry

This SDK does not directly own:

- prover orchestration
- internal proof lifecycle scheduling
- on-chain relaying
- Registry contract interaction

## Core Goals

### Must Have

- Expose a stable facade `BnbZkIdClient` for business applications
- Preserve stable design space for an internal `GatewayClient`
- Define a dedicated adapter abstraction for the Primus integration
- Make the `zkTls result -> ProofRequest` mapping boundary explicit
- Keep the status model and error model predictable
- Stay browser-first without leaking browser assumptions into every module

### Explicitly Out Of Scope

- Supporting all provider business semantics in v1
- Encapsulating every Primus SDK detail in v1
- Providing a complex plugin system in v1
- Hiding every protocol concept from the public API in v1

## Overall Architecture

### Layered View

```text
Application
  ->
Facade API (BnbZkIdClient)
  ->
Workflow Layer
  ->
Gateway Client Layer / zkTLS Adapter Layer
  ->
Implementation Layer (deferred)
```

### Layer Responsibilities

`Public API`

- Stable entry point for application developers
- Exposes the `BnbZkIdClient` class
- Exposes high-level product methods: `init / prove`

`Gateway Client Layer`

- Stable entry point for low-level protocol integration
- Keeps a one-to-one correspondence with the Gateway OpenAPI
- Is not part of the current public surface

`Workflow Layer`

- Defines orchestration interfaces across components
- For example: initialize first, then call Primus, then submit a proof request, then
  track status until completion
- The repository already includes a minimal runnable workflow that connects Primus,
  Gateway, and the progress callback

`Gateway Contract Layer`

- Defines the TypeScript contract for `/v1/config`, `/v1/proof-requests`, and
  `/v1/proof-requests/{proofRequestId}`
- Defines proof lifecycle status, UI status, and error payloads

`zkTLS Adapter Contract Layer`

- Defines how the SDK views a Primus attestation result
- Defines the input/output of `collectAttestationBundle(...)`
- Defines the `identityPropertyId -> templateId` resolution layer
- Does not commit to a concrete serialization strategy in the current phase

`Implementation Layer`

- Includes HTTP transport, response parsing, runtime validation, and the Primus
  adapter implementation
- Explicitly deferred in the current phase

## Key Module Breakdown

### `src/types/public.ts`

Responsibilities:

- Define the public types for the facade `BnbZkIdClient`
- Define the client method signatures
- Define stable input/output structures

This is one of the most important files in the current phase.

### `src/client/`

Responsibilities:

- Carry the default shape of `BnbZkIdClient`
- The repository's `BnbZkIdClient` is already wired into a runtime-configured
  workflow
- The future internal `GatewayClient` does not enter the current public surface
- Keep an internal non-exported configured client that connects the Primus adapter,
  Gateway client, and workflow for implementation validation

### `docs/`

Responsibilities:

- `architecture.md`: overall architecture and implementation order
- `sdk-spec.md`: detailed public contract
- `harness.md`: current harness layers, execution strategy, and acceptance plan

## Public Interface Design

### Facade Client

The first-layer capability exposed by the SDK to business applications should be
fixed as:

- `init({ appId })`
- `prove(input, options?)`

Where:

- `init({ appId })` represents SDK-level initialization, where `appId` is the
  application identifier registered with the BNB ZK ID framework, and failures
  return structured error information
- `prove(...)` represents the full orchestration from "business proving intent" to
  "final proof completion"
- The input to `prove(...)` may include `provingParams` (with optional
  `businessParams` and future zkTLS extension fields) for Gateway / Primus payloads
- `options.onProgress` returns status changes to the caller during the long-running
  execution

### Gateway Client

The SDK keeps this internal layer:

- `getConfig()`
- `createProofRequest(input)`
- `getProofRequestStatus(proofRequestId)`

Reasons:

- These three interfaces map one-to-one to the Gateway API
- They are stable enough and do not depend on Primus implementation details
- Contract design can be finished before transport and validation strategy are
  decided

### Primus Adapter

The first-layer abstraction for the Primus integration should be fixed as:

- `createPrimusZkTlsAdapter(config)`
- `collectAttestationBundle(input)`
- `resolveTemplateId({ appId, identityPropertyId })`

The current repository already wires this layer into the public facade, but browser
live mode still depends on the Primus extension environment.

The return value should include at least:

- `zkTlsProof`
- `attestation`
- `requestId`
- `privateData`

The most important point here is that the SDK defines what it expects from Primus
before it defines how Primus works internally.

### Cross-SDK Workflow

High-level helpers may continue to exist as internal implementation design, but they
are not exported publicly in the current phase.

## Data-Flow Design

## Main Flow

![bnb-zkid-client](./images/bnb-zkid-client.png)

The diagram above is closer to the product view and shows that:

- applications only call the SDK facade
- the SDK internally calls Primus, Gateway, and possibly the Registry

## Data-Flow Design

### Flow A: Read Configuration

1. The application creates a `client`
2. The SDK internally retrieves configuration through `GatewayClient.getConfig()`
3. The SDK obtains `GatewayConfig`
4. Later `prove(...)` uses the configuration to decide provider, property, and input
   collection behavior

### Flow B: Atomic Gateway Call

1. The application already has `zkTlsProof`, where `public_data` is the attestation
   and `private_data` is the output of `getPrivateData`
2. Call `gatewayClient.createProofRequest(input)`
3. Gateway returns `proofRequestId`
4. The application starts tracking status

### Flow C: Primus-To-Gateway Orchestration

1. The application creates a Primus adapter
2. Call `collectAttestationBundle(...)`
3. The application or a workflow helper maps the result into
   `CreateProofRequestInput`
4. Call `gatewayClient.createProofRequest(...)`
5. Poll `gatewayClient.getProofRequestStatus(...)`

### Flow D: Facade Product Flow

1. The application creates a `client`
2. Call `client.init({ appId })`
3. The application assembles optional `provingParams` by `identityPropertyId`
4. Call `client.prove(input, { onProgress })`
5. The SDK internally triggers the Primus and Gateway orchestration
6. During execution, the SDK returns status to the application through `onProgress`
7. If `client.prove(...)` succeeds, it returns an `on_chain_attested` result; on
   failure it throws a unified error type (see `docs/sdk-spec.md`)
8. The success result must include `walletAddress`, `providerId`, and
   `identityPropertyId`

## Status Model

`ProveStatus`

- `initializing`
- `data_verifying`
- `proof_generating`
- `on_chain_attested`
- `failed`

`ProveProgressEvent` always includes `clientRequestId` (from `ProveInput`). `proofRequestId` is
attached once the Gateway returns a non-empty id from `createProofRequest`: it is present on
`proof_generating` (emitted only after a successful create response without Framework `error`) and
`on_chain_attested`, and omitted for earlier steps.

Design principles:

- Expose only a small set of business-meaningful states
- `onProgress` and the success return value share the same core state semantics
  (failure does not return through the success path)
- The first version of the SDK should not expose too many internal lifecycle details

## Error Model

SDK errors fall into two categories:

### SDK Errors Reserved At Design Time

- `ConfigurationError`
- `NotImplementedError`

### Gateway Errors Passed Through At Runtime

For example:

- `INVALID_REQUEST`
- `WHITELIST_REQUIRED`
- `PROVING_LIMIT_EXCEEDED`
- `INVALID_ZK_TLS_PROOF`
- `BINDING_CONFLICT`

Design principles:

- SDK errors describe caller-layer and infrastructure problems
- Gateway errors describe business and protocol problems
- Do not mix both categories into one enum

## Dependency Rules

Dependency direction must remain one-way:

`types -> client -> workflows`

`types -> zktls`

`types -> future transport implementation`

Avoid:

- making `types` depend on concrete Primus packages
- making the public API depend on a concrete HTTP library
- making `workflow` depend directly on future transport details
- letting Gateway payload structure leak into the Primus adapter's internal
  implementation constraints

## Runtime And Packaging Strategy

### Current Phase

- Only guarantee internal consistency for the type layer and contract layer
- Do not commit to any runtime implementation
- Do not commit to any platform behavior

### Next Phase

- Browser-first
- ESM-first
- Then re-evaluate whether Node-side Gateway calls need to be supported

Reasons:

- Primus `zktls-js-sdk` is closer to a browser integration scenario
- The Gateway client itself can be designed to be runtime-neutral
- But the combined workflow is not automatically cross-runtime

## Phased Implementation Plan

### Phase 0: Freeze The Overall Architecture

Exit criteria:

- The architecture document is complete
- The public contract covers the main workflow
- Everyone agrees on module boundaries

### Phase 1: Freeze Public Types

Exit criteria:

- `src/types/public.ts` is stable
- `sdk-spec.md` is aligned with the types
- The status enum, progress-event structure, and request structure are frozen

### Phase 2: Implement The Gateway Client

Exit criteria:

- `getConfig`
- `createProofRequest`
- `getProofRequestStatus`
- Basic transport and parsing are complete

### Phase 3: Implement The Primus Adapter

Exit criteria:

- `collectAttestationBundle(...)` is usable
- Primus result mapping rules are clear
- The browser happy path is executable

### Phase 4: Implement Workflow And Harness

Exit criteria:

- The facade workflow is runnable
- The README example is executable
- The harness passes

## Currently Frozen Items

The following should now be treated as frozen:

- the facade `BnbZkIdClient` is the only external class entry point for now
- the facade only exposes `init({ appId })` and `prove(...)`
- `prove(...)` supports `onProgress`
- `ProveInput.clientRequestId` is the local identifier for long-running and
  concurrent tasks
- the future internal design keeps space for both `GatewayClient` and a Primus
  adapter
- the top-level field structure of `CreateProofRequestInput`
- the enum set for `ProveStatus`

The following are not frozen yet:

- concrete HTTP implementation
- concrete schema parser implementation
- final proof encoding format for Primus attestation
- provider-level conversion logic for private/public data details
- final implementation strategy for retries, timeouts, and cancellation

## Open Questions

- Should Primus `zktls-js-sdk` only target browsers as its primary runtime?
- Will the final structure of `zkTlsProof.public_data` remain stable enough for
  long-term Gateway acceptance?
- Should `zkTlsProof.private_data` always use the raw result from `getPrivateData`
  directly?
- Should `businessParams` eventually become a narrower typed schema by
  provider/property?
- Should `clientRequestId` remain required, or may the SDK generate it
  automatically?
- Does v1 need to support custom transport injection?

## Implementation Requirements

From now on, any implementation work should answer two questions first:

1. Which module responsibility in this document does this implementation belong to?
2. Is this implementation filling in an already frozen contract, or quietly changing
   the contract?

If it is the latter, update the documentation first and only then update the code.
