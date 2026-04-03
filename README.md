# BNB-ZKID-SDK

BNB ZKID TypeScript SDK design workspace.

## Current Status

This repository has moved beyond the pure interface-design stage and is now in the
"contract-first + harness-driven implementation" phase.

Current focus:

- Define the facade `BnbZkIdClient(init/prove)`
- Define the Primus `zktls-js-sdk` integration abstraction
- Define the `zktls -> Gateway` input mapping interface
- Validate the main workflow with the deterministic harness and browser harness
- Make the state transitions, request structures, and error model explicit

## Documents

- [Architecture](./docs/architecture.md)
- [SDK Spec](./docs/sdk-spec.md)
- [Harness Guide](./docs/harness.md)
- [Docs Index](./docs/index.md)

`docs/architecture.md` is the highest-priority document in the current phase. Any
implementation work should follow it first, then `sdk-spec`, and only then the
concrete code.

## Development

Install dependencies:

```bash
npm install
```

If you want to run with a local fixture-based override:

```bash
cp bnb-zkid.config.json bnb-zkid.config.local.json
BNB_ZKID_CONFIG_PATH=./bnb-zkid.config.local.json npm test
```

Run the validation suite:

```bash
npm test
```

Run the minimal example:

```bash
npm run example:minimal
```

Run the browser harness:

```bash
npm run dev:browser-harness -- --host 127.0.0.1 --port 4177
```

Then open <http://127.0.0.1:4177>.

- `Fixture Gateway + Fixture Primus`: default regression mode, with no dependency on
  real zkTLS
- `Fixture Gateway + Primus SDK`: browser live skeleton mode. The PADO API address
  reuses the SDK built-in configuration, `zkTlsAppId` and the template id are
  resolved dynamically from the template API, and Gateway still uses fixtures. This
  mode also requires a local browser environment with the Primus extension installed

## Current API Draft

```ts
import { BnbZkIdClient } from "bnb-zkid-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "listdao",
});
if (!initResult.success) {
  console.error(initResult.error);
}

try {
  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId: "github_account_age",
      provingParams: {
        businessParams: {
          contribution: [21, 51],
        },
      },
    },
    {
      onProgress(event) {
        console.log(event.status, event.proofRequestId);
      },
    }
  );
  console.log(proveResult.status, proveResult.walletAddress);
} catch (error) {
  // `BnbZkIdProveError`: codes 00000-00007 and 10000-10003, table `message`; in the prove flow,
  // `details.primus` / `details.brevis` describe the stage-specific failure.
  console.error(error);
}
```

The repository already includes one runnable public workflow implementation. The
published runtime reads the SDK built-in configuration by default, while the harness
and tests can override it through external configuration.

`provingParams` is the object passed into Primus
`additionParams.provingParams`. Its optional `businessParams` aligns with Gateway
`businessParams` (for example, GitHub can pass `contribution: [21, 51]` as tier
thresholds). All other keys are reserved for future zkTLS-side fields and are passed
through unchanged.

The repository also includes a deterministic harness used only to validate the
design. It drives `examples/` and `tests/harness/`, but it is not exported as part
of the package public API.

## Runtime Configuration

`BnbZkIdClient` keeps the `new BnbZkIdClient()` constructor shape unchanged.

By default, runtime configuration comes from SDK built-in configuration.

- Release-time fixed parameters, such as the Gateway base URL, Primus server
  template resolver, and signer address, should live in internal SDK modules
- Node tests and the local harness can point `BNB_ZKID_CONFIG_PATH` to an external
  JSON override
- The browser harness can point `globalThis.__BNB_ZKID_CONFIG_URL__` to an external
  JSON override

The external override configuration can define:

- A Gateway address or fixture file
- The Primus template resolver and server-side signer address
- A Primus server address and template resolution path, or a static template mapping
  for tests

The current built-in resolver requests
`https://api-dev.padolabs.org/public/identity/templates` and first reads the zkTLS
app id from `result.<app-node>.zkTlsAppId`, then reads the template id from
`result.<app-node>.<provider>IdentityPropertyId`; for example,
`github_account_age -> result.brevisListaDAO.githubIdentityPropertyId`.

If `init({ appId })` receives an empty or invalid `appId`, it first throws
`BnbZkIdProveError` (`00007` / `Invalid parameters`, with `details.field` and
related metadata pointing to `appId`). Otherwise it validates the Gateway appId,
prefetches the app-level Primus configuration, and initializes the Primus runtime.
On success the result includes `providers` (matching the `providers` wire returned
by `GET /v1/config`). A later `prove(...)` call only needs to resolve the matching
template id and execute the proving flow. If the caller provides
`provingParams.businessParams`, it must be deeply equal to the configured
`businessParams` for that `identityPropertyId`, otherwise `prove` fails with
`00007`.

## Browser Harness

The repository includes a browser-specific harness page:

- [examples/browser/index.html](./examples/browser/index.html)

This harness is not meant to replace `npm test`. Its purpose is to verify:

- The browser environment can load `BnbZkIdClient`
- The browser configuration-loading logic works
- The `init -> prove` main workflow runs successfully in the browser

The current browser harness supports two validation modes:

- `fixture + fixture`: default regression mode, with no dependency on a real Gateway
  or real zkTLS
- `fixture + primus sdk`: validates real zkTLS SDK initialization and the
  attestation flow in the browser while keeping Gateway fixture-backed; Vite dev
  server is recommended instead of a static `python http.server`
