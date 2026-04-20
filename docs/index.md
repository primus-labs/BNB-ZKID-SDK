# Docs Index

This repository treats `docs/` as the record system for design and harness decisions.

## Primary Documents

- [`architecture.md`](./architecture.md): top-level architecture, boundaries, and implementation order
- [`sdk-spec.md`](./sdk-spec.md): public SDK contract and internal reference contract
- [`harness.md`](./harness.md): first executable harness definition
- [`error-codes-references.md`](./error-codes-references.md): canonical error code/message mapping, public error shape, and stage guide
- [`engineering-rules.md`](./engineering-rules.md): mechanical rules that keep the repo agent-readable

## Execution Plans

- [`exec-plans/active/first-harness.md`](./exec-plans/active/first-harness.md): current plan for the first deterministic harness

## Reading Order

Use this order when entering the repository for the first time:

1. `README.md`
2. `docs/architecture.md`
3. `docs/sdk-spec.md`
4. `docs/harness.md`
5. `docs/engineering-rules.md`
6. Active plan under `docs/exec-plans/active/`

## Status

- Public facade contract: drafted
- Public facade runtime: intentionally not implemented
- Internal harness: deterministic and fixture-backed
- Live integration harness: deferred

## Update Rule

When public contract, fixture shape, or harness behavior changes, update the relevant doc in the same change.
