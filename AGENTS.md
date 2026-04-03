# AGENTS

## Purpose

This repository is a contract-first design workspace for the `bnb-zkid-sdk`.

The current goal is to freeze the public facade contract and the first harness shape before implementing a real Gateway or Primus integration.

## Start Here

Read these files in order:

1. `README.md`
2. `docs/index.md`
3. `docs/architecture.md`
4. `docs/sdk-spec.md`
5. `docs/harness.md`

## Source Of Truth

- `docs/architecture.md` is the highest-priority design document.
- `docs/sdk-spec.md` refines the public TypeScript contract.
- `src/types/public.ts` is the canonical public type surface.
- `src/client/client.ts` intentionally remains a stub until the implementation phase begins.

If code and docs disagree, treat the architecture and SDK spec as the decision anchor and update the code or the lower-level doc accordingly.

## Current Phase Constraints

- Do not add real HTTP transport by default.
- Do not couple the public API to Primus runtime details.
- Do not expose internal Gateway client shapes from the package root.
- Do not replace the stub `BnbZkIdClient` with an ad hoc live implementation.

The only executable flow allowed in this phase is the deterministic harness backed by fixtures.

## Repo Map

- `src/types/`: public contract definitions
- `src/config/proof-request-polling.ts`: proof-request `GET` poll interval + max duration (`execute-prove`)
- `src/client/`: public facade stub
- `src/harness/`: internal deterministic harness utilities for examples and tests
- `fixtures/`: shared mocked Gateway payloads
- `examples/`: executable repository examples
- `tests/harness/`: harness verification
- `docs/`: design documents, plans, and rules

## Working Rules

- Keep the package public surface small and explicit.
- Prefer deterministic fixtures over live integrations.
- Any change to public types should update the README example and harness.
- Unknown remote payload should be normalized before it reaches public results.
- Keep shared logic runtime-neutral where possible.

## Validation

Run these commands before considering a change complete:

```bash
npm test
```

This should:

- build the publishable library into `dist/` (compiled `src/` only)
- build test+example output into `dist-test/` (not published)
- run the harness tests and the minimal example against repo-root `fixtures/`

## When Adding New Work

For small changes, update the relevant design doc and test in the same change.

For larger work, add or update an execution plan under `docs/exec-plans/`.

## Immediate Next Milestone

The first milestone is complete when:

- the minimal harness example runs locally
- the deterministic harness test passes
- fixture-backed Gateway contracts remain parseable
- public contract drift is caught by the harness
