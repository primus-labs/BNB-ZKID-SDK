# Error reference

Field-by-field reference for failure shapes returned or thrown by the public SDK
(`BnbZkIdError`, `BnbZkIdProveError`, and nested `details`). Normative tables for
machine codes and default messages remain in [`sdk-spec.md`](./sdk-spec.md). This
page describes **structure** only; keep it aligned with `src/errors/`,
`src/workflow/execute-prove.ts`, `src/client/configured-client.ts`, and
`src/gateway/http-client.ts`.

Integration-facing catalog with example **`toJSON()`-style objects**: [`bnbzkidsdk-error.md`](./bnbzkidsdk-error.md).

---

## 1. Two primary surfaces

| Shape | When it appears | Fields |
| --- | --- | --- |
| **`BnbZkIdError`** | `init()` returns `success: false` and an `error` | `code`, `message`, optional `details` (`Record<string, unknown>`) |
| **`BnbZkIdProveError`** (`extends Error`) | Invalid `init` input (**throws**); **every** `prove()` failure (**throws**) | `name` = `"BnbZkIdProveError"`, `proveCode` (getter `code` returns the same), `message`, `details`, optional `clientRequestId`, optional `proofRequestId`, `toJSON()` |

**Convention**

- **zkTLS / Primus** context lives under **`details.primus`**.
- **Gateway / Framework / poll lifecycle** context lives under **`details.brevis`**, as a nested object: `details = { brevis: { … } }`.

---

## 2. `init()` — `InitResult.error` (`BnbZkIdError`)

| Situation | `code` | `message` | `details` |
| --- | --- | --- | --- |
| `appId` missing / empty / not a string | — | — | Does **not** return: `assertInitInputValidOrThrow` **throws** `BnbZkIdProveError` **`00007`** (see §3). |
| `appId` not in Gateway `appIds` | `00001` | Default table message for `00001` | `reason: "appId_not_enabled"`, `appId` |
| Template resolver failure | `00001` | Same | `reason: "template_resolve_failed"`, `cause` (see §6) |
| Primus `init` failure | `00001` or mapped outer code | Table message for that outer code | `reason: "primus_init_failed"`, **`primus`** (see §5) |

The four **`reason`** values above align `init` failures with **`00001`** thrown from
`prove` when order is wrong (§4).

---

## 3. `init()` — thrown `BnbZkIdProveError` (`00007`)

| `details` | Notes |
| --- | --- |
| `message` | Human-readable text (e.g. `appId must be a non-empty string.`) |
| `field` | `"appId"` |

Source: `assertInitInputValidOrThrow` in `src/validation/public-input-validation.ts`.

---

## 4. `prove()` — order / not initialized (`00001`)

| Source | `message` | `details` |
| --- | --- | --- |
| Configured client or `BnbZkIdClient` before a successful `init` | **`MESSAGE_PROVE_BEFORE_INIT`** (e.g. `Call init() successfully before prove().`) | **`reason: "init_must_succeed_before_prove"`** only |

This branch **overrides** the default table string for `00001`. Other `00001` paths
keep the generic **Failed to initialize** message (see `createProveBeforeInitError`).

---

## 5. `details.primus` (zkTLS / Primus)

Built by `serializePrimusStageDetails` in `src/errors/prove-error.ts`. Used as
`BnbZkIdProveError.details.primus` during `prove`, and under
`BnbZkIdError.details.primus` for Primus **`init`** failures.

| Input shape | Serialized `primus` |
| --- | --- |
| ZkAttestation-like (`code`, `message`, optional `data`) | `code`, `message`, optional `data` |
| Object with non-empty string `code` | `code`, optional `message`, optional `data` |
| Anything else | `{ cause: serializeErrorForProveDetails(err) }` |

Outer `proveCode` during `prove` comes from **`outerProveCodeForPrimusProveFailure`**
(wire code mapping; unmapped → `00006`).

---

## 6. `serializeErrorForProveDetails` (nested causes)

Used for template resolve `cause`, `brevis.cause`, and similar.

| Input | Approximate shape |
| --- | --- |
| `SdkError` | `name`, `message`, `code`, optional `sdkDetails` |
| `Error` | `name`, `message` |
| Other object | `value: <object>` |
| Non-object | `value: string` |

---

## 7. `prove()` — validation and config alignment (`00007`)

From `assertProveInputValidOrThrow` and from **`executeProveWorkflow`** when
`identityPropertyId` is not present on the normalized Gateway config
(`ConfigurationError` → `00007`). The user-facing `details.message` for
`identityPropertyId` matches the providers-wire check: **not listed in
`init().providers[].properties[].id`**.

| Common `details` | Notes |
| --- | --- |
| `message`, `field` | `field` may be `proveInput`, `clientRequestId`, `userAddress`, `identityPropertyId`, `provingParams`, `provingParams.businessParams`, etc. |
| `value` | Present in some cases (e.g. rejected `identityPropertyId`). |
| Context | Optional `clientRequestId` on the error when known from input. |

---

## 8. `prove()` — Gateway: inner shape of `details.brevis`

Workflow wraps all of the following as **`details.brevis = inner`**. The tables
below describe **`inner`** only.

### 8.1 `createProofRequest` throws (non-Framework failure path)

**Outer code:** `10003`.

| `inner` fields |
| --- |
| `phase: "createProofRequest"` |
| `cause` (§6) |

### 8.2 `createProofRequest` returns a Framework `error`

**Outer code:** `10001` if `error.category === "binding_conflict"`, else `10003`.

| `inner` fields |
| --- |
| `phase: "createProofRequest"` |
| Flattened Framework fields from `flatDetailsFromFrameworkError`: `code`, `message` (from `detail ?? message ?? code`), optional `category`, optional `rawDetails` if Gateway sent nested `error.details` |
| When HTTP client parsed a non-OK body as Framework error: `httpStatus`, `pathname`, `url` |

### 8.3 Poll timeout

**Outer code:** `10003`.

| `inner` fields |
| --- |
| `code: "TIMEOUT"` |
| `message: "timeout"` |
| `phase: "pollProofRequest"` |
| `maxDurationMs`, `elapsedMs` |

The error object may also carry **`proofRequestId`** when the create step succeeded.

### 8.4 Poll: GET proof-request status, Framework `error` body (`GATEWAY_API_ERROR`)

**Outer code:** `10003`. Workflow copies `SdkError.details` into `brevis`.

| Typical `inner` fields |
| --- |
| `phase: "getProofRequestStatus"` |
| `httpStatus`, `pathname`, `url` |
| Optional wire `status` when the server included it |
| Plus flattened Framework fields (`category`, `code`, `message`, optional `rawDetails`) |

### 8.5 Poll: other errors during poll

**Outer code:** `10003`.

| `inner` fields |
| --- |
| `phase: "pollProofRequest"` |
| `cause` (§6) |

### 8.6 Poll: terminal **lifecycle** failure on the proof request

**Outer code:** `10002` if wire `status === "submission_failed"`, else `10003`.

| `inner` fields |
| --- |
| `phase: "pollProofRequestTerminal"` |
| `status` (wire terminal status) |
| If Gateway sent `failure`: **`failure: { reason, detail }`** (normalized) |
| If no `failure`: **`code: "PROOF_REQUEST_FAILED"`** and a fixed **`message`** fallback |

### 8.7 Success-shaped payload but required fields missing

**Outer code:** `10003`.

| `inner` fields |
| --- |
| `phase: "gateway_payload"` |
| `reason` — fixed explanation string (e.g. missing `walletAddress`, identity id, or `providerId`) |

---

## 9. Default messages vs overrides

Default English strings for each outer code are defined in
`src/errors/prove-error.ts` (`PROVE_ERROR_MESSAGES`). **Exception:** prove-before-init
uses a dedicated **message override** while keeping **`proveCode` `00001`** (§4).

---

## 10. Errors that may not be `BnbZkIdProveError`

| Situation | Notes |
| --- | --- |
| `executeProveWorkflow` outer `catch` | If something other than `BnbZkIdProveError` is thrown, the workflow emits `onProgress({ status: "failed" })` and **rethrows** unchanged. |
| Gateway config normalization | `normalizeGatewayConfigPayload` and related paths may throw **`SdkError`** (e.g. `VALIDATION_ERROR`) during config load. |
| Transport | **`SdkError`** with `TRANSPORT_ERROR` and `httpStatus` / `pathname` / `url` may surface on HTTP paths; poll-time transport issues are usually wrapped into **`10003`** + `brevis.cause`, but `getConfig` and similar can still throw `SdkError` directly. |

---

## Maintenance

When you change error construction in code, update this file in the same change so
integrators can rely on stable `details` keys.
