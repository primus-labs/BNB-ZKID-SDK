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

## Current API Draft

```ts
import { BnbZkIdClient, BnbZkIdProveError } from "@superorange/bnbzkid-js-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "listdao",
});
if (!initResult.success) {
  console.error(initResult.error);
  process.exit(1);
}

const providers = initResult.providers;
const identityPropertyId = providers[0]?.properties[0]?.id;

if (!identityPropertyId) {
  throw new Error("No identity property is available for this appId.");
}

renderProviderList(providers);

try {
  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId,
    },
    {
      onProgress(event) {
        console.log(event.status, event.proofRequestId);
      },
    }
  );
  console.log(proveResult.status, proveResult.walletAddress);
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error(error.code, error.message, error.details);
  } else {
    console.error(error);
  }
}
```

`init({ appId })` still returns `providers`, so the caller can render the available
provider / property list directly from SDK output.

`provingParams` is the object passed into Primus
`additionParams.provingParams`. Its optional `businessParams` aligns with Gateway
`businessParams` (for example, GitHub can pass `contribution: [21, 51]` as tier
thresholds). All other keys are reserved for future zkTLS-side fields and are passed
through unchanged.

If `prove()` omits `provingParams.businessParams`, the SDK automatically reuses the
matching `properties[].businessParams` loaded during `init()` and sends that into
both Primus `additionParams.provingParams` and Gateway
`POST /v1/proof-requests`. The business layer no longer needs to call `/v1/config`
again or remap thresholds manually.

The repository includes two example tracks:

- [`examples/sdk-usage.ts`](./examples/sdk-usage.ts): end-user integration example
- [`examples/minimal.ts`](./examples/minimal.ts): deterministic harness example used
  by repo tests

The repository also includes a deterministic harness used only to validate the
design. It drives `examples/` and `tests/harness/`, but it is not exported as part
of the package public API.

## Runtime Configuration

`BnbZkIdClient` keeps the `new BnbZkIdClient()` constructor shape unchanged.

For normal SDK usage, runtime configuration now comes from SDK built-in defaults and
does not require any manual `globalThis.__BNB_ZKID_CONFIG_URL__` setup.

Built-in defaults:

- Gateway: `http://44.226.158.196:8038`
- Primus template resolver: `https://api-dev.padolabs.org/public/identity/templates`
- Primus signer: `https://api-dev.padolabs.org/developer-center/app-sign-by-app-id`

External overrides are still supported, but only for tests, harness, and debug:

- Node: `BNB_ZKID_CONFIG_PATH=/path/to/override.json`
- Browser harness / debug: `globalThis.__BNB_ZKID_CONFIG_URL__ = "/override.json"`

Override files are now merged onto the built-in defaults, so partial overrides are
allowed. For example, tests or local debug can override only:

```json
{
  "gateway": {
    "baseUrl": "http://127.0.0.1:8038"
  }
}
```

Full fixture-mode overrides are still supported for harness use.

The built-in resolver requests
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

## Development

Install dependencies:

```bash
npm install
```

Run the validation suite:

```bash
npm test
```

Run the deterministic harness example:

```bash
npm run example:minimal
```

If you want to run repo-local fixture overrides in Node:

```bash
cp bnb-zkid.config.json bnb-zkid.config.local.json
BNB_ZKID_CONFIG_PATH=./bnb-zkid.config.local.json npm test
```

Run the browser harness:

```bash
npm run dev:browser-harness -- --host 127.0.0.1 --port 4177
```

Then open <http://127.0.0.1:4177>.

- `Fixture Gateway + Fixture Primus`: default regression mode, with no dependency on
  real zkTLS
- `Fixture Gateway + Primus SDK`: browser live skeleton mode. The harness uses
  partial runtime overrides for local proxy / fixture switching, while normal SDK
  usage still relies on built-in defaults

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
