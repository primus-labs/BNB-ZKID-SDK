# Error Reference

This page documents the public error object shape and where to find canonical
error-code semantics.

## Public Error Shape

Both `init()` and `prove()` failures throw `BnbZkIdProveError`.

Publicly, the error envelope is intentionally narrow:

- `code` (alias of `proveCode`)
- `message`
- `clientRequestId?`
- `proofRequestId?`

`toJSON()` follows the same shape.

## Canonical Code/Message Reference

For authoritative code-to-message mapping and stage-level interpretation, use:

- [`error-codes-references.md`](./error-codes-references.md)

This includes:

- `00xxx` SDK core and input validation
- `10xxx` / `20xxx` zkTLS stage mapping
- `30xxx` zkVM/Gateway mapping
- `40xxx` on-chain submission mapping

## Notes for Integrators

- `proofRequestId` is exposed on `BnbZkIdProveError` only after the SDK has
  already obtained a non-empty proof request id from Gateway or the deterministic
  harness.
- Non-normalized internal exceptions (for example some transport/setup failures)
  can still surface as non-`BnbZkIdProveError` and should be handled by a generic
  fallback branch.
