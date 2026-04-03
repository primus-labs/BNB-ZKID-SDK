# Harness Guide

## Goal

Define the first executable harness for the SDK after entering the implementation
phase.

The repository is already in the harness-driven implementation phase, so this
document describes both the target and the harness layers that already exist in the
repository.

Additional note: the repository now includes both a deterministic harness and a
browser harness to verify consistency between the docs, fixtures, examples, and the
public workflow. They do not imply that production live integration is complete.

## Definition Of The First Harness

The first harness should validate one full Gateway happy path:

1. A developer creates a client.
2. The client fetches Gateway configuration.
3. The client submits a `ProofRequest` that includes `zkTlsProof`, where
   `public_data` is the Primus attestation and `private_data` is the result of
   `getPrivateData`.
4. The client queries the status for `proofRequestId`.
5. The application receives a typed success result containing
   `status = on_chain_attested`, `walletAddress`, `providerId`, and
   `identityPropertyId`.

## What The Harness Must Prove

- The public API is internally coherent
- The example in the README is executable
- Request and response structures are parsed correctly
- Errors are exposed in a predictable form
- The SDK can be validated early without a real backend

## Suggested Early Harness Structure

```text
examples/
  minimal.ts
tests/
  harness/
    minimal-sdk.test.ts
fixtures/
  config.json
  create-proof-request.json
  get-proof-request-status.json
```

The repository already includes the matching directories and keeps the internal
harness implementation under `src/harness/` to avoid polluting the package public
surface.

As the Primus integration expands, the repository can also add deterministic tests
for `src/primus/` and `src/workflow/`, but fake runtime and injected signer should
still be preferred over direct dependencies on a browser extension or a real
`appSecret`.

Likewise, the repository already uses an internal configured client to connect
`init -> Primus -> Gateway -> status` as the implementation-acceptance skeleton for
the public facade.

If the real zkTLS runtime must be validated in a browser, the project should keep a
separate browser harness layer. Its role is different from the default deterministic
harness:

- deterministic harness: default regression path, fast feedback, no browser
  dependency
- browser harness: validates browser runtime behavior, config loading, and real page
  context

The browser harness in this repository already supports two modes:

- `fixture + fixture`: validates page loading, browser config loading, and the
  public client workflow
- `gateway fixture + primus sdk`: validates real zkTLS SDK initialization and the
  main attestation path in the browser while keeping Gateway deterministic and
  fixture-backed

Recommended startup command:

```bash
npm run dev:browser-harness -- --host 127.0.0.1 --port 4177
```

## Execution Strategy

In the first phase, deterministic fixtures and mocked transport should be preferred.

This immediately brings three benefits:

- API design can be validated before backend integration stabilizes
- Agents get fast pass/fail feedback while generating code
- Public contract changes are caught in one concentrated place

Only after the mocked happy path is stable should the project add a live integration
harness.

## Harness Contract

The first harness should fail if any of the following happens:

- Example code no longer compiles
- The method or parameter shapes for `GET /v1/config`,
  `POST /v1/proof-requests`, or `GET /v1/proof-requests/{proofRequestId}` drift
  from the spec
- Parsed responses leak raw unknown payloads without normalization
- Typed state transitions become ambiguous
- A breaking API change is introduced without updating the example

## Minimum Required Artifacts

Before the implementation grows further, the repository should contain at least:

1. A README example consistent with the public API
2. A runnable example file
3. An end-to-end test using deterministic fixtures
4. A shared set of response fixtures

## Phase-One Exit Criteria

The first phase can be considered complete when:

- The minimal example runs
- The harness passes locally
- The public types for the three core Gateway interfaces are stable enough for
  review
- Adding a second provider or identity property does not require redesigning the
  top-level client shape

## Recommended Next Step After This Document

Implement the project skeleton required by the harness:

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `examples/minimal.ts`
- `tests/harness/minimal-sdk.test.ts`

As long as the tests cover the real public Gateway API, the initial phase can rely
entirely on fake transport.
