# SDK 规范

## 目标

定义这个 TypeScript SDK 的第一版公开契约。

这份规范会刻意保持收敛。它的作用是为实现和评审建立锚点，而不是提前预测所有未来功能。

当前阶段以 contract-first 为准：先冻结方法签名、输入输出类型和状态模型，再进入具体实现。

本文档从属于 `docs/architecture.md`。如果两者发生冲突，应以总架构文档为准。

## 目标用户

目标用户是需要集成 BNB ZKID、但不希望了解过多底层协议细节的 TypeScript 应用开发者。

## 主工作流

SDK 第一版应优先优化一条真实的端到端主路径：

1. 调用 `GET /v1/config` 拉取支持的 provider、identityProperty 和 schema。
2. 通过 Primus `zktls-js-sdk` 生成 zkTLS attestation 结果。
3. 组装 `POST /v1/proof-requests` 请求体并提交。
4. 通过 `GET /v1/proof-requests/{proofRequestId}` 轮询状态，直到 `on_chain_attested` 或 `failed`。

## 成功标准

如果开发者能够以如下方式完成主工作流，就说明 SDK 设计是成功的：

- 只用较少代码即可接入
- Gateway 的请求和响应对象有明确映射规范
- zkTLS 结果与 Gateway 输入的拼装方式清晰
- 运行时错误清晰可理解
- 不需要直接操作底层 HTTP 细节

## Public API

对外只暴露 `BnbZkIdClient` 类，以及该类相关输入输出类型。

`GatewayClient`、Primus adapter、workflow helper 都属于内部架构概念，不作为当前对外 public surface。

具体形状应尽量接近下面这个版本：

```ts
export interface BnbZkIdError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BusinessParams = Record<string, unknown>;

export interface ProvingParams {
  businessParams?: BusinessParams;
  [key: string]: unknown;
}

export interface InitInput {
  appId: string;
}

export interface InitSuccessResult {
  success: true;
  /** `GET /v1/config` 的 `providers`（Brevis wire：`id`、`properties[].id`、可选 `description` / `businessParams`）。 */
  providers: BnbZkIdGatewayConfigProviderWire[];
}

export interface InitFailureResult {
  success: false;
  error?: BnbZkIdError;
}

export type InitResult = InitSuccessResult | InitFailureResult;

export type ProveStatus =
  | "initializing"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

export interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  identityPropertyId: string;
  provingParams?: ProvingParams;
}

export interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}

export interface ProveOptions {
  onProgress?: (event: ProveProgressEvent) => void;
  closeDataSourceOnProofComplete?: boolean;
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

/** @deprecated Failures throw `BnbZkIdProveError`; this shape is no longer returned. */
export interface ProveFailureResult {
  status: "failed";
  clientRequestId: string;
  proofRequestId?: string;
  error?: BnbZkIdError;
}

/** @deprecated Prefer `ProveSuccessResult` for `prove` return type. */
export type ProveResult = ProveSuccessResult | ProveFailureResult;

export interface BnbZkIdClientMethods {
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
}

export declare class BnbZkIdProveError extends Error {
  readonly proveCode: "00000" | "00001" | "00002" | "00003";
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;
}

/** Framework `error` on proof-requests (and typing aid for `prove` failure `details.brevis`). */
export type BnbZkIdFrameworkErrorCategory =
  | "binding_conflict"
  | "internal_error"
  | "policy_rejected"
  | "schema_invalid"
  | "zktls_invalid";

export interface BnbZkIdFrameworkError {
  category?: BnbZkIdFrameworkErrorCategory | string;
  code: string;
  detail?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export declare class BnbZkIdClient implements BnbZkIdClientMethods {
  constructor();
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
}
```

## `provingParams` 规则

`provingParams` 类型为 `ProvingParams`（与字段同名）：整体序列化进 Primus `additionParams.provingParams`；其中 **`businessParams`** 与 Gateway 的 `businessParams` 对齐（数据源分档等）。

- `businessParams` 内 key 多为 provider-specific 字段，例如 `contribution`、`ordersVolume`；值为阈值数组等，由低到高表达分档边界
- 还可包含其它 key（预留 zktls 扩展），与 `businessParams` 一起进入 `additionParams.provingParams`
- 若不需要显式业务阈值，可省略整个 `provingParams`，或只传扩展字段不传 `businessParams`（此时 Gateway 侧 `businessParams` 仍可使用 `GET /v1/config` 默认值）
- **校验**：仅当调用方提供 **`provingParams.businessParams`** 时，SDK 将其与 `GET /v1/config` 对应当前 `identityPropertyId` 的 `properties[].businessParams` 做深度相等比较；不一致或配置中缺少 `businessParams` 时，`prove` 抛出 `BnbZkIdProveError`（`proveCode` `00003`）

示例：

```ts
const input: ProveInput = {
  clientRequestId: "prove-task-001",
  userAddress: "0x1234567890abcdef1234567890abcdef12345678",
  identityPropertyId: "github_account_age",
  provingParams: {
    businessParams: {
      contribution: [21, 51]
    }
  }
};
```

在 Primus 集成层，`provingParams` 不应直接暴露为第三方 SDK 原始配置。

当前收敛后的内部规则是：

- SDK 运行时根据 `identityPropertyId` 从 Primus server 解析 `templateId`
- `provingParams.businessParams` 作为 Gateway `POST /v1/proof-requests` 体里 `businessParams` 的主要来源（可与 config 默认合并逻辑见实现）
- `clientRequestId`、`identityPropertyId`、`provingParams`（整体对象）进入 Primus `additionParams`

这样 public contract 继续保持业务领域命名，而 Primus template 解析细节留在内部。

## 内部参考 Contract

下面这些结构不是当前 public surface 的组成部分，但它们描述了 SDK 未来内部需要对齐的 Gateway 协议对象：

与 BNB ZK ID Framework Gateway 规范对齐的 HTTP 契约（`POST /v1/proof-requests`、`GET /v1/proof-requests/{proofRequestId}`）以源码 **`src/gateway/types.ts`** 为准，主要包括：

- `GatewayCreateProofRequestInput` / `GatewayCreateProofRequestResult`
- `GatewayProofRequestStatusResult`
- `GatewayProofStatus`、public **`BnbZkIdFrameworkError`**（即内部 `GatewayError`）、`GatewayPropertyInformation` 等

`prove` 成功时仅返回 `ProveSuccessResult`（`status: "on_chain_attested"` 等）；网关返回的 **`onchain_attested`** 与历史 **`on_chain_attested`** 会在 workflow 中一并识别。失败时统一 `throw BnbZkIdProveError`（见「prove 错误码」）。

## API 设计原则

- 对外只暴露一个稳定入口类，不把底层 Gateway 集成细节泄漏给业务应用。
- 优先使用产品领域名词，而不是后端实现细节命名。
- 第一版的方法数量要尽量少。
- 可选字段必须是真正可选，并明确说明出现条件。
- 避免在 public contract 中出现泛化的 `any` 或不透明的 `object`。
- Primus 集成层与 Gateway 层要解耦，避免把第三方 SDK 细节直接暴露进 public API。

## 配置规则

第一版 public API 暂不通过构造函数暴露配置对象。

与 Gateway、鉴权、运行时环境相关的接入参数，后续应在真实实现阶段重新评估放置位置，再决定是否进入 public contract。

在当前实现骨架中，为了保持 `new BnbZkIdClient()` 不变，运行时配置默认来自 SDK 内置配置，而不是构造函数参数。

其中 zkTLS SDK 自身使用的 `appId` 不再写死在 SDK 内置配置里，而是运行时从模板接口返回的
`result.<app-node>.zkTlsAppId` 动态解析。

当前实现会在 `init({ appId })` 阶段先解析 app 级配置并初始化 Primus，避免把这一步推迟到首个
`prove(...)` 调用。

当前内置配置还需要提供 Primus server template resolver，例如：

- `primus.templateResolver.baseUrl`
- `primus.templateResolver.resolveTemplatePath`
- `primus.signer.baseUrl`
- `primus.signer.signPath`

当前实现会请求公开模板接口，并先解析 app 级节点，再读取其中的 zkTLS app id 与 provider 字段，例如：

- `listdao -> result.brevisListaDAO.zkTlsAppId`
- `github_account_age -> result.brevisListaDAO.githubIdentityPropertyId`

如果远端 app 节点名或字段名与默认规则不一致，可通过
`primus.templateResolver.appResponseKeyMap` 和 `primus.templateResolver.responseKeyMap` 覆盖。

对于 zkTLS 请求签名，当前实现支持通过服务端 signer 完成；签名接口接收
`{ appId, data }` JSON 请求体，其中 `appId` 就是动态解析出的 `zkTlsAppId`，并返回
`result.appSignature`。

本地测试和 harness 可以通过外部 override 覆盖这套默认配置：

- Node 环境使用 `BNB_ZKID_CONFIG_PATH`
- 浏览器 harness 使用 `globalThis.__BNB_ZKID_CONFIG_URL__`

但这些 override 机制不应成为发布态 SDK 的主要接入方式。

## 错误模型

`init` 在 **`appId` 缺失、类型非 `string` 或 trim 后为空** 时**抛出** `BnbZkIdProveError`（`proveCode` **`00003`**，`message` **`Invalid parameters`**，`details.message` / `details.field` 指向参数问题）；其余配置类失败仍返回 `InitResult`（`success: false` 时带 `BnbZkIdError`，如 appId 不在 Gateway `appIds` 列表）。

`prove` 失败时**一律抛出** `BnbZkIdProveError`（继承 `Error`），字段：

- `code` / `proveCode`：`00000` | `00001` | `00002` | `00003`
- `message`：与 `proveCode` 对应的固定英文说明（见下表）
- `details`：参数类错误（含 `init` 与 `prove` 的 **00003**）带 **`message`**（人类可读说明）与 **`field`**（出错字段名，如 `appId`、`userAddress`、`identityPropertyId`、`provingParams.businessParams`）；可选 **`value`**（如非法 `identityPropertyId`）。其它阶段：`details.primus`（zkTLS）；`details.brevis`（Gateway）
- `clientRequestId` / `proofRequestId`（若已知）

### prove 错误码

| `code` | 含义 |
|--------|------|
| `00000` | `Failed to initialize`（例如未成功 `init` 就调用 `prove`） |
| `00001` | `Failed to generate zkTLS proof`（Primus / zktls-js-sdk 阶段） |
| `00002` | `Failed to generate zkVM proof`（Gateway：`POST`/`GET` proof-requests 及成功载荷校验） |
| `00003` | `Invalid parameters`（`init` 的 `appId`；`prove` 的输入类型、`userAddress` 格式、`identityPropertyId` 是否在 `GET /v1/config` `providers[].properties[].id`、`provingParams` / `businessParams` 与配置一致性等） |

`00001` 时 `details.primus`：zkTLS SDK 业务错误按带 `code` / `message`（及可选 `data`）的对象序列化（与 `@superorange/zka-js-sdk` 的 `ZkAttestationError` 对齐，不依赖 `instanceof`）；否则为 `cause`（`serializeErrorForProveDetails` 形状）。

`00002` 时 `details.brevis`：轮询 `GET /v1/proof-requests/{id}` 进入终态失败时带 **`status`**（响应里的 `status` 字段）。Framework **`error`** 体仍扁平写入（`category`、`code`、`message` 等，与 **`BnbZkIdFrameworkError`** 对齐）；**`failure`** 体规范嵌套为 **`failure: { reason, detail }`**。纯 status 终态无 `error`/`failure` 时为 `code` / `message` 兜底。轮询超过 **`src/config/proof-request-polling.ts`** 中 **`PROOF_REQUEST_POLL_MAX_DURATION_MS`**（默认 10 分钟）时，`details.brevis` 为 **`code`：`TIMEOUT`**、**`message`：`timeout`**，并带 `phase`：`pollProofRequest`、`maxDurationMs`、`elapsedMs` 等。轮询间隔为同一文件中的 **`PROOF_REQUEST_POLL_INTERVAL_MS`**（默认 3s）。Transport / 其它轮询异常等为 `phase`、`proofRequestId`（若有）、`cause` 等。Primus / zktls-js-sdk 使用 **`details.primus`**，其 `code` 与 Framework 命名空间不同。

`BnbZkIdFrameworkErrorCategory` 枚举了规范中的确定性 `category`（`policy_rejected`、`zktls_invalid`、`schema_invalid`、`binding_conflict`、`internal_error`）；服务端若下发新类别，类型上仍兼容 `string`。

## 运行时支持

第一版运行时目标需要明确：

- 面向现代 TypeScript 使用者
- 优先支持 ESM
- 在确定构建工具前，先决定是否需要支持 CJS
- 在共享逻辑中避免依赖 Node 专属全局对象

## 使用示例

README 和 examples 中的示例，复杂度应尽量保持在这个级别：

```ts
import { BnbZkIdClient, BnbZkIdProveError } from "bnb-zkid-sdk";

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
  console.log(proveResult.status);
  console.log(
    proveResult.walletAddress,
    proveResult.providerId,
    proveResult.identityPropertyId
  );
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error(error.code, error.message, error.details);
  } else {
    throw error;
  }
}
```

## 延后决策

在产品契约更清晰之前，以下问题先保持开放：

- `prove(...)` 是否直接内部依赖 Primus adapter，还是允许调用方手动注入结果
- `clientRequestId` 是否保持必填，还是允许 SDK 自动生成
- 高层 helper 是否应直接内置 Primus `zktls-js-sdk` 的默认 proof 序列化规则
- 多链或多网络抽象
- transport 或 signer 的插件体系
- 批量操作
- 除首个必要流程外的本地密码学辅助能力
