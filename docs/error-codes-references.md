# SDK Error Code Reference Guide

## 1. Introduction

The **BNB ZK ID SDK** provides a unified error handling system that covers the entire lifecycle of a proof: from **zkTLS** data verification and **zkVM** proof generation to **On-chain** submission. This guide helps developers identify and resolve issues at each stage of the workflow.

Each error returned by the SDK is a narrow JSON object:

- **`code` (String):** A 5-digit unique identifier. The first two digits indicate the Category, while the remaining digits specify the unique error within that domain.
- **`message` (String):** A readable explanation of the error. Many messages include an **Internal Reference ID** in brackets (e.g., `[P-301]`) to help the support team locate the exact point of failure.
- **`clientRequestId` (String, optional):** A unique identifier for each proof task.
- **`proofRequestId` (String, optional):** Present only after the SDK has already obtained a non-empty proof request id from Gateway or the deterministic harness.


Example:

```json
{
  "code": "10002",
  "message": "Verification timed out. Please try again. [P-00002].",
  "clientRequestId": "1775799705267",
  "proofRequestId": "proof-request-001"
}
```

### Error Categories

| **Code Range**  | **Category**       | **Scope**                                                    |
| --------------- | ------------------ | ------------------------------------------------------------ |
| 00xxx       | SDK Core       | Initialization, parameter validation, and environment checks. |
| 10xxx/20xxx | zkTLS Stage    | Issues related to zkTLS process and data attestation status. |
| 30xxx      | zkVM Stage     | Proof generation via zkVM and Gateway interaction.           |
| 40xxx       | On-chain Stage | Final proof submission to the BNB Chain.                     |



## 2. SDK Core & Parameter Errors (00xxx)

Errors related to the integration of the SDK and local environment.

- **Code: `00000`**

  - **Message:** `"Primus Extension not detected. Please install or enable the Primus Extension from the Chrome Web Store (https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe), and try again."`

    Note: The Primus Extension is required for the proof process. Ensure it is installed and active in the user's browser.

- **Code: `00001`**

  - **Message:** `"SDK initialization failed. Please call init() successfully before calling prove()."`

    Note: This occurs when a proof is triggered before the SDK has completed its setup.

- **Code: `00002`**

  - **Message:** `"Invalid wallet address. User wallet address must be a valid EVM address (0x followed by 40 hex characters)."`

    Note: The user's wallet address is bound to the proof. A correct wallet address is required.

- **Code: `00003`**

  - **Message:** `"Invalid appId. [SDK-A00/SDK-A01]."`

    Note: The `appId` is either missing (`SDK-A00`) or not recognized by the system (`SDK-A01`).

- **Code: `00004`**

  - **Message:** `"Invalid identityPropertyId. [SDK-I00/SDK-I01]."`

    Note: The `identityPropertyId` is either missing (`SDK-I00`) or does not match any predefined proof templates (`SDK-I01`).

- **Code: `00005`**

  - **Message:** `"clientRequestId is empty."`

    Note: A unique `clientRequestId` is required for tracking. Please ensure a string identifier is provided.

- **Code: `00006`**

  - **Message:** `"Request denied. Unauthorized address."`

    Note: Returned if the user's address is not on the allowed whitelist.

- **Code: `00007`**

  - **Message:** `"Undefined SDK processing error."`

    Note: Fallback error for undefined failures. The process stops before entering the zkTLS attestation stage. Please initialize the SDK again, then try again.
  

## 3. zkTLS Attestation Stage (10xxx & 20xxx)

Errors occurring during the zkTLS and data attestation process.

- **Code: `10001`**

  - **Message:** `"Failed to initiate the algorithm."`

    Note: Often caused by rapid page refreshes. Suggest the user wait a moment and try again. Retry usually resolves this.

- **Code: `10002`**

  - **Message:** `"Verification timed out. Please try again. [P-00002/P-00014]."`

    Note: The process exceeded the 2-minute limit. Retry usually resolves this.

- **Code: `10003`**

  - **Message:** `"A verification task is already in progress."`

    Note: Only one zkTLS task can run at a time. Wait for the current task to finish before starting a new one.

- **Code: `10004`**

  - **Message:** `"Verification cancelled by user."`

    Note: The user closed the target data source website.

- **Code: `10013`**

  - **Message:** `"No verifiable data detected. Please confirm login status and account details."`

    Note: The extension couldn't detect the required data. Ensure the user is logged into the target data source website and has not navigated away during the process.

- **Code: `20001`**

  - **Message:** `"Unstable internet connection. Please try again. [P-10001~10004]."`

    Note: Network instability during the attestation. Retry usually resolves this.

- **Code: `20002`**

  - **Message:** `"Internal algorithm error. Please contact support. [P-20001~20005/40001/40002/50000:501/50000:502/50000:505/50000:507/50000:508/50000:510/50011]."`

    Note: An unexpected runtime error occurred. Please contact support and provide the internal reference ID.

- **Code: `20003`**

  - **Message:** `"Data schema mismatch. Please contact support. [P-30001:301/30001:404/30004/30005/30006]."`

    Note: The target platform may have updated its URL or data structure. The data templates may need an update. Please contact support and provide the internal reference ID.

- **Code: `20004`**

  - **Message:** `"Too many attempts. Please try again later. [P-00000/30001:403/30001:429]."`

    Note: The data source platform has rate-limited the user. Suggest waiting before retrying.

- **Code: `20005`**

  - **Message:** `"Response processing error. Please try again. [P-30001/30001:302/30002/30003]."`

    Note: A rare issue where the response data could not be parsed correctly. Retry usually resolves this.

- **Code: `20006`**

  - **Message:** `"Session expired. Please log in to the data source website again. [P-30001:401]."`

    Note: The user's login session on the target data source website expired during the proof process.

- **Code: `20007`**

  - **Message:** `"Service request error. Please try again. [P-50003/P-50004/P-50006/P-50009/P-99999]."`

    Note: Occurs when the algorithm service fails to start or encounters an unexpected state. Retry usually resolves this.

  

## 4. zkVM Proving Stage (30xxx)

Errors related to the zkVM process, proof generation and Gateway validation.

- **Code: `30000`**

  - **Message:** `"Duplicate request. Task already in progress."`

    Note: A task with the same `userAddress` and `identityPropertyId` is already being processed by the backend.

- **Code: `30001`**

  - **Message:** `"Proof binding error. This data is already bound to another address."`

    Note: To prevent data reuse, a specific piece of data cannot be used to generate proofs for multiple wallet addresses.

- **Code: `30002`**

  - **Message:** `"Proof generation failure."`

    Note: The Gateway encountered an error while generating the proof. Please contact the support team.

- **Code: `30003`**

  - **Message:** `"Prover service internal error."`

    Note: Unknown internal error in the prover service. Please contact the support team. 

- **Code: `30004`**

  - **Message:** `"Connection to the prover service unstable."`

    Note: Can't generate the zkVM process due to an unstable server connection. Please re-initiate this proof task from the frontend.

- **Code: `30005`**

  - **Message:** `"Fetching the proof generation result timed out."`

    Note: Failed to fetch the proof generation result within 20 minutes. For further updates, please use the status query function to fetch the latest result again.



## 5. On-chain Submission Stage (40xxx)

Errors regarding the final transaction on the BNB Chain.

- **Code: `40000`**

  - **Message:** `"On-chain submission failed."`

    Note: The transaction failed to be confirmed on the blockchain. Please confirm the final status directly from the contract later.
