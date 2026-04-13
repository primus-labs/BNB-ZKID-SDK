# BNB ZK ID SDK — error catalog

Integration-facing error payloads and Gateway response bodies (captured from real
runs). Fenced blocks are **verbatim samples**; some JSON may be strictly invalid
(e.g. trailing commas) and is kept for illustration only.

## Initialization

#### Primus extension missing; `init()` fails — outer `00000`

```json
{
  "code":"00000",
  "message":"Not detected the Primus Extension",
  "details":{
    "reason":"primus_init_failed",
    "primus":{
      "code":"00006",
      "message":"No Primus extension is installed."
    }
  }
}
```

#### `prove()` before successful `init()` — `00001`

```json
{
  "code": "00001",
  "message": "Call init() successfully before prove().",
  "details": {
    "reason": "init_must_succeed_before_prove"
  },
  "clientRequestId": "1775799705267"
}
```

## Parameter validation — `00007`

```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "appId must be a non-empty string.",
    "field": "appId"
  }
}
```
```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "prove input must be a plain object.",
    "field": "proveInput"
  }
}
```
```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "clientRequestId must be a non-empty string.",
    "field": "clientRequestId"
  }
}
```
```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "userAddress must be a valid EVM wallet address (0x followed by 40 hexadecimal characters).",
    "field": "userAddress"
  },
  "clientRequestId": "1775800529626"
}
```
```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "identityPropertyId must be a non-empty string.",
    "field": "identityPropertyId"
  },
  "clientRequestId": "1775800529626"
}
```
```json
{
  "code": "00007",
  "message": "Invalid parameters",
  "details": {
    "message": "identityPropertyId is not listed in init().providers[].properties[].id.",
    "field": "identityPropertyId",
    "value": "123"
  },
  "clientRequestId": "1775800529626"
}
```


## zkTLS proving stage (`00002`, `00003`, `00004`, `00005`, `00006`)

#### Another verification already in progress — `00002`

```json
{
  "code": "00002",
  "message": "A verification process is in progress. Please try again later.",
  "details": {
    "primus": {
      "code": "00003",
      "message": "A verification process is in progress. Please try again later.",
    }
  }
}
```
#### User closed data source or cancelled — `00003`

```json
{
  "code": "00003",
  "message": "The user closes or cancels the verification process.",
  "details": {
    "primus": {
      "code": "00004",
      "message": "The user closes or cancels the verification process."
    }
  },
  "clientRequestId": "1775802107536"
}
```
#### Target data / request path mismatch — `00004`

  ```json
  {
    "code": "00004",
    "message": "Target data missing. Please check whether the data json path in the request URL’s response aligns with your template.",
    "details": {
      "primus": {
        "code": "00013",
        "message": "Target data missing. Please check whether the data json path in the request URL’s response aligns with your template."
      }
    },
    "clientRequestId": "1775801228225"
  }
  ```
#### Unstable network — `00005` (Primus wire `10001`–`10004`)

```json
{
  "code": "00005",
  "message": "Unstable internet connection. Please try again.",
  "details": {
    "primus": {
      "code": "10004",
      "message": "Unstable internet connection. Please try again.",
      "data": "{\"retcode\":\"2\",\"retdesc\":\"10004:run_client do_online exception: [TlsNetworkError]connect to proxy error\",\"isUserClick\":\"true\",\"content\":null,\"details\":{\"errlog\":{\"code\":\"10004\",\"type\":\"TlsNetworkError\",\"desc\":\"[TlsNetworkError]connect to proxy error\",\"uuid\":\"1004025202604101429574853bf6e741\",\"time\":\"0\"},\"initialization\":{\"status\":\"3\",\"statusDescription\":\"DONE\",\"elapsed\":\"0\"},\"offline\":{\"status\":\"12\",\"statusDescription\":\"RUNNING\",\"elapsed\":\"4\"},\"online\":{\"status\":\"29\",\"statusDescription\":\"ERROR\",\"elapsed\":\"0\",\"errlog\":{\"code\":\"10004\",\"type\":\"TlsNetworkError\",\"desc\":\"[TlsNetworkError]connect to proxy error\",\"uuid\":\"1004025202604101429574853bf6e741\"}}}}"
    }
  }
}
```

#### Other — additional Primus wire codes under `details.primus`

- Primus wire code → message reference (SDK)

```javscript
{
  '00000':'Operation too frequent. Please try again later.',
  '00001':'Algorithm startup exception.',
  '00002':'The verification process timed out.',
  '00005':'Wrong SDK parameters.',
  '00012':'Invalid Template ID.',
  '00013': 'Target data missing. Please check whether the data json path in the request URL’s response aligns with your template.',
  '00014':'The verification process timed out.',
  '00104': 'Not met the verification requirements.',
  '01000': 'Attestation timeout.',
  '20001':"An internal error occurred.",
  '20003':"Invalid algorithm parameters.",
  // '20004': "Something went wrong. Please try again later.",
  '20005':"Can't complete the attestation due to some workflow error. Please try again later.",
  '30001': "Response error. Please try again.",
  '30002': "Response check error.",
  // '30003': "Can't complete the attestation flow due to response error. Please try again later.",
  '30004': "Response parse error.",
  // '40001':"Something went wrong. Please try again later.",
  '40002': "SSLCertificateError",
  '50001':"An internal error occurred.",
  // '50002': "Something went wrong. Please try again later.",
  '50003':"The client encountered an unexpected error.",
  '50004': "The client not started. Please try again.",
  // '50005':"Something went wrong. Please try again later.",
  '50006': "The algorithm server not started. Please try again.",
  '50007':"Algorithm execution issues.",
  '50008':"Abnormal execution results.",
  '50009': 'Algorithm service timed out.',
  '50010': "Compatibility issues during algorithm execution.",
  '50011': "Unsupported TLS version.",
  '99999':'Undefined error.',
  '-1002001':"Invalid App ID.",
  '-1002002':"Invalid App Secret.",
  '-1002003':"Trial quota exhausted.",
  '-1002004':"Subscription expired.",
  '-1002005':"Quota exhausted.",
}
```

```json
{
  "code": "00006",
  "message": "Failed to generate zkTLS proof",
  "details": {
    "primus": {
      "code": "30001",
      "message": "Response error. Please try again.",
      "data": "{\"retcode\":\"2\",\"retdesc\":\"50003:run_client do_offline exception: [PlainThreadException]run plain client exception\",\"isUserClick\":\"true\",\"content\":null,\"details\":{\"errlog\":{\"code\":\"30001\",\"type\":\"ResponseException\",\"desc\":\"[ResponseException]response http status code error:404, url:github.com/.*?action=show&controller=profiles&tab=contributions&user_id=.*\",\"uuid\":\"100402520260410152919638c6e5777c\",\"time\":\"3\"},\"initialization\":{\"status\":\"3\",\"statusDescription\":\"DONE\",\"elapsed\":\"0\"},\"offline\":{\"status\":\"19\",\"statusDescription\":\"ERROR\",\"elapsed\":\"12\",\"errlog\":{\"code\":\"50003\",\"type\":\"PlainThreadException\",\"desc\":\"[PlainThreadException]run plain client exception\",\"uuid\":\"100402520260410152919639c6e5777c\"}},\"online\":{\"status\":\"29\",\"statusDescription\":\"ERROR\",\"elapsed\":\"3\",\"errlog\":{\"code\":\"30001\",\"type\":\"ResponseException\",\"desc\":\"[ResponseException]response http status code error:404, url:github.com/.*?action=show&controller=profiles&tab=contributions&user_id=.*\",\"uuid\":\"100402520260410152919638c6e5777c\"}}}}"
    }
  },
  "clientRequestId": "1775806146778"
}
```


## zkVM / Gateway proving stage

#### Pending proof for this address (surfaced via zkTLS SDK) — `10000`

```json
{
  "code": "10000",
  "message": "This address has pending proof for identityPropertyId.",
  "details": {
    "primus": {
      "code": "-210001",
      "message": "Address has pending proof for identityPropertyId."
    }
  },
  "clientRequestId": "1775801228225"
}
```

#### Address already bound to another account — `10001`; `POST /v1/proof-requests` HTTP 400 response body

```json
  {
    "error": {
        "category": "binding_conflict",
        "code": "BINDING_CONFLICT",
        "message": "nullifier already bound to another wallet"
      }
  }
```

**SDK error**

```json
{
  "code": "10001",
  "message": "This address is already bound to another account.",
  "details": {
    "brevis": {
      "phase": "createProofRequest",
      "category": "binding_conflict",
      "code": "BINDING_CONFLICT",
      "message": "nullifier already bound to another wallet",
      "httpStatus": 400,
      "pathname": "/v1/proof-requests",
      "url": "https://zk-id.brevis.network/v1/proof-requests"
    }
  },
  "clientRequestId": "1775805642765"
}
```

#### On-chain submission failed — `10002`; `GET /v1/proof-requests/{id}` with `"status": "submission_failed"` response body

```json
{
    "proofRequestId": "0x914fee5c3c6d70be1fdfe31204b7edcfdf055d7e0e04f3126f0f928b39b5fcb4",
    "status": "submission_failed",
    "error": null,
    "walletAddress": "0xB12a1f7035FdCBB4cC5Fa102C01346BD45439Adf",
    "providerId": "0x07a17bd3c7c8d7b88e93a4d9007e3bc230b0a586a434de0bed6500e9f343deb7",
    "identityProperty": {
        "id": "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff",
        "description": "identity property 0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff"
    },
    "appId": "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C",
    "attestation": {
        "chainId": 11155111,
        "registry": "0xe172B277228C0F8954f62BCea717013e3AA22dB0",
        "txHash": "0xcb0576b01e7c0fe58a2d818ff841b45e8a5bc3fc9c7a3ead0bb0e86983a4d4fc"
    },
    "failure": {
        "reason": "FRONTEND_TEST_FAILURE",
        "detail": "synthetic failure for frontend test"
    }
}
```

**SDK error**

```json
{
  "code": "10002",
  "message": "Failed to onChain",
  "details": {
    "brevis": {
      "phase": "pollProofRequestTerminal",
      "status": "submission_failed",
      "failure": {
        "reason": "FRONTEND_TEST_FAILURE",
        "detail": "synthetic failure for frontend test"
      }
    }
  },
  "clientRequestId": "1775806585507",
  "proofRequestId": "0x191ab6df58e3052cda045f46d72813ff829970358673a82b361bb82086782a12"
}
```

#### Other cases (outer code `10003`)

- Invalid `proofRequestId`; `GET /v1/proof-requests/...` HTTP 404 response body

```json
  {
    "error": {
          "category": "schema_invalid",
          "code": "PROOF_REQUEST_NOT_FOUND",
          "message": "proofRequestId does not exist"
      }
  }
```

**SDK error**

```json
  {
    "code": "10003",
    "message": "Failed to generate zkVM proof",
    "details": {
      "brevis": {
        "phase": "getProofRequestStatus",
        "httpStatus": 404,
        "pathname": "/v1/proof-requests/x914fee5c3c6d70be1fdfe31204b7edcfdf055d7e0e04f3126f0f928b39b5fcb4",
        "url": "https://zk-id.brevis.network/v1/proof-requests/x914fee5c3c6d70be1fdfe31204b7edcfdf055d7e0e04f3126f0f928b39b5fcb4",
        "category": "schema_invalid",
        "code": "PROOF_REQUEST_NOT_FOUND",
        "message": "proofRequestId does not exist"
      }
    },
    "clientRequestId": "1775806265290",
    "proofRequestId": "0x4d6934920e9802808e1e8568b89300dfb43acd68ab0b0e5e41a43e4275e4b0b5"
  }
```

- Invalid `appId`; `POST /v1/proof-requests` HTTP 400 response body

```json
  {
    "error": {
        "category": "schema_invalid",
        "code": "APP_ID_INVALID",
        "message": "must be 0x-prefixed 32-byte hex"
      }
  }
```

**SDK error**

```json
  {
    "code": "10003",
    "message": "Failed to generate zkVM proof",
    "details": {
      "brevis": {
        "phase": "createProofRequest",
        "category": "schema_invalid",
        "code": "APP_ID_INVALID",
        "message": "must be 0x-prefixed 32-byte hex",
        "httpStatus": 400,
        "pathname": "/v1/proof-requests",
        "url": "https://zk-id.brevis.network/v1/proof-requests"
      }
    },
    "clientRequestId": "1775798715404"
  }
```

- `status: prover_failed`

```json
{
  "code": "10003",
  "message": "Failed to generate zkVM proof",
  "details": {
    "brevis": {
      "phase": "pollProofRequestTerminal",
      "status": "prover_failed",
      "failure": {
        "reason": "PROOF_REQUEST_FAILED",
        "detail": "Gateway reported proof lifecycle failure."
      }
    }
  },
  "clientRequestId": "prove-task-001",
  "proofRequestId": "0x…"
}
```

- Poll exceeded max duration without terminal success or failure

```json
{
  "code": "10003",
  "message": "Failed to generate zkVM proof",
  "details": {
    "brevis": {
      "code": "TIMEOUT",
      "message": "timeout",
      "phase": "pollProofRequest",
      "maxDurationMs": 5000,
      "elapsedMs": 6449
    }
  },
  "clientRequestId": "1775807216090",
  "proofRequestId": "0x42032c721c51b55f4cad40a6ddbcf659f2494b569938f6f05bb828671b0a477a"
}
```

- Gateway server error HTTP 500

```json
{
  "code": "10003",
  "message": "Failed to generate zkVM proof",
  "details": {
    "brevis": {
      "phase": "createProofRequest",
      "category": "internal_error",
      "code": "ONCHAIN_PREREQ_STALE",
      "message": "on-chain prerequisite cache is stale; waiting for sync",
      "httpStatus": 500,
      "pathname": "/v1/proof-requests",
      "url": "https://explorer-gateway.brevis.network/v1/proof-requests"
    }
  },
  "clientRequestId": "1775554589010"
}
```
