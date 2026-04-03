## Introduction

This SDK belongs to the **BNB ZK ID framework** and is integrated into client
applications such as `listdao`.

Its responsibility is to consolidate two flows into one stable, clear, and reusable
TypeScript integration interface:

- client applications calling Primus zkTLS capabilities
- client applications calling the BNB ZK ID Gateway

## Roles

### Application

Business applications that use this SDK, such as `listdao`.

### BNB ZK ID SDK

This SDK itself.

### Primus zktls-js-sdk

Responsible for starting the zkTLS attestation flow and producing the attestation
result.

### BNB ZK ID Gateway

Responsible for receiving proof requests and returning proof-request lifecycle
status.

## Main Flow

![bnb-zkid-client](./images/bnb-zkid-client.png)

## Public Interface Definition

Define a `BnbZkIdClient` class with the following methods:

### init

Initialize the SDK.

- Parameter: `appId`, the `appId` registered in the BNB ZK ID framework.
- Success result: `success = true`.
- Failure result: `success = false`, with optional error information.

### prove

Request a proof.

- Parameters:
  - `clientRequestId` (`string`): local task ID provided by the caller for tracking
    long-running or concurrent tasks
  - `userAddress` (`string`): user wallet address
  - `identityPropertyId` (`string`): the identity property to prove
  - `provingParams` (optional, `object`): additional fields to pass through, for
    example threshold inputs such as "balance greater than x"

    - `binance`

      ```json
      // Advanced KYC completed (Level 2) and more than 50 historical trades
      // Basic KYC completed (Level 1) or 10-49 historical trades
      // Account bound and has any trading history
      // Not bound

      {
        data: [1, 11, 51]
      }
      ```

    - `okx`

      ```json
      // Advanced KYC completed (Level 2) and more than 50 historical trades
      // Basic KYC completed (Level 1) or 10-49 historical trades
      // Account bound and has any trading history
      // Not bound

      {
        data: [1, 11, 51]
      }
      ```

    - `github`

      ```json
      // Account older than 1 year and more than 50 contributions in the past year
      // Account older than 6 months or 20-49 contributions in the past year
      // Account bound
      // Not bound

      {
        contribution: [21, 51]
      }
      ```

    - `steam`

      ```json
      // Non-limited account, older than 1 year, game library value above $50
      // Non-limited account, older than 6 months
      // Limited account, or does not satisfy the above conditions

      {
        limitedAccount: [5],
        gameLibraryValue: [51]
      }
      ```

    - `amazon`

      ```json
      // Prime member and account older than 2 years
      // Account older than 1 year or more than 20 orders in the past year
      // Account bound and has purchase history
      // Not bound

      {
        ordersVolume: [1, 21]
      }
      ```

  - `options.onProgress` (optional, `function`): progress callback during the prove
    flow

    `options.onProgress` callback states:

    - `initializing`: the proof request for the data item was created successfully
    - `data_verifying`: the data-source page is open and zkTLS proving is running
    - `proof_generating`: zkTLS proving finished and zkVM proving is in progress
    - `on_chain_attested`: proof succeeded and has been attested on-chain
    - `failed`: proof failed

- Success result: `status = on_chain_attested`, plus `clientRequestId`,
  `walletAddress`, `providerId`, `identityPropertyId`, and `proofRequestId`
- Failure result: `status = failed`, plus `clientRequestId`, optional
  `proofRequestId`, and error information

## Handling Data Source Changes

- The zkTLS template id corresponding to `identityPropertyId` is retrieved
  dynamically from the server. When data sources change, the server only needs to
  update the corresponding mapping list.

## Security

- Source-code security: AI + human review
  - plugin
  - SDK
- Business-flow and architecture security: human review + AI

## Performance

## Stability

- Automated script testing for `zktls-core-sdk`
- Automated script testing with the plugin included
