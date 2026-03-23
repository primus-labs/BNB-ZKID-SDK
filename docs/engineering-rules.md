# Engineering Rules

These rules are the repository's current "golden rules". They should be easy for humans and agents to follow and cheap to verify in review.

## Contract Rules

- `src/types/public.ts` defines the package public contract.
- New public fields require a corresponding README and harness update.
- Do not expose raw Gateway payloads through public return types.
- Avoid `any` in public-facing contract code.

## Implementation Rules

- `src/client/client.ts` remains a stub until the implementation phase is explicitly started.
- Harness-only helpers live outside the package root exports.
- Shared logic should avoid Node-only assumptions unless it is test or harness specific.
- Runtime normalization is preferred over passing unknown payload through the API.

## Harness Rules

- The first harness must stay deterministic.
- Shared response fixtures live under `fixtures/`.
- The minimal example must run from repository code, not only compile.
- Harness tests must fail when example usage drifts from the contract.

## Documentation Rules

- `docs/architecture.md` is the top-level decision anchor.
- Plans for non-trivial work belong under `docs/exec-plans/`.
- Update docs in the same change that alters the contract or harness behavior.

## Deferred Work

These remain intentionally out of scope for the current phase:

- live Gateway integration
- real Primus orchestration
- browser automation
- observability-driven validation
- plugin architecture
