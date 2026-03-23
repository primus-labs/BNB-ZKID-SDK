# First Harness Plan

## Goal

Create the first deterministic harness that proves the SDK contract is executable without introducing a live Gateway or Primus dependency.

## Scope

This plan covers:

- a repository entry map for agents and reviewers
- shared mocked Gateway fixtures
- a runnable minimal example
- a deterministic harness test
- package scripts that execute the harness

This plan does not cover:

- real HTTP transport
- live integration tests
- replacing the public facade stub with production behavior

## Deliverables

- `AGENTS.md`
- `docs/index.md`
- `docs/engineering-rules.md`
- `fixtures/config.json`
- `fixtures/create-proof-request.json`
- `fixtures/get-proof-request-status.json`
- `examples/minimal.ts`
- `tests/harness/minimal-sdk.test.ts`

## Exit Criteria

The plan is complete when:

1. `npm test` passes locally.
2. The minimal example executes successfully.
3. The harness validates a full mocked happy path.
4. The public package export surface remains unchanged.

## Risks

- The repository is still in design phase, so harness code must not be mistaken for production runtime.
- Fixture drift may create false confidence if the internal reference contract changes without updating shared payloads.
- Example code may accidentally bypass the public shape if internal helpers become too convenient.

## Controls

- Keep the harness implementation under `src/harness/` and do not export it from `src/index.ts`.
- Make the example use public contract types even if the runtime is harness-backed.
- Fail tests when the example stops executing or the mocked happy path changes shape.

## Progress

- [x] Repository map added
- [x] Rules document added
- [x] Deterministic fixtures added
- [x] Minimal example added
- [x] Harness test added
- [ ] Live integration harness intentionally deferred
