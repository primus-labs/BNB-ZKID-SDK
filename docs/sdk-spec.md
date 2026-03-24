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

export type ProvingParams = Record<string, number[]>;

export interface InitInput {
  appId: string;
}

export interface InitSuccessResult {
  success: true;
}

export interface InitFailureResult {
  success: false;
  error?: BnbZkIdError;
}

export type InitResult = InitSuccessResult | InitFailureResult;

export type ProveStatus =
  | "initialized"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

export interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  provingDataId: string;
  provingParams?: ProvingParams;
}

export interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}

export interface ProveOptions {
  onProgress?: (event: ProveProgressEvent) => void;
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

export interface ProveFailureResult {
  status: "failed";
  clientRequestId: string;
  proofRequestId?: string;
  error?: BnbZkIdError;
}

export type ProveResult = ProveSuccessResult | ProveFailureResult;

export interface BnbZkIdClientMethods {
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult>;
}

export declare class BnbZkIdClient implements BnbZkIdClientMethods {
  constructor();
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult>;
}
```

## `provingParams` 规则

`provingParams` 用于传递与 `provingDataId` 对应的数据源分档阈值。

- 它的当前设计类型应收敛为 `Record<string, number[]>`
- key 表示 provider-specific 的判定字段，例如 `contribution`、`ordersVolume`
- value 表示该字段对应的阈值数组，由低到高表达不同分档边界
- 如果只证明“已绑定”而不需要额外阈值，调用方可以不传 `provingParams`

示例：

```ts
const input: ProveInput = {
  clientRequestId: "prove-task-001",
  userAddress: "0x1234567890abcdef1234567890abcdef12345678",
  provingDataId: "github_account_age",
  provingParams: {
    contribution: [21, 51]
  }
};
```

在 Primus 集成层，`provingParams` 不应直接暴露为第三方 SDK 原始配置。SDK 内部应增加一层解析，把：

- `provingDataId`
- `provingParams`

映射为：

- `templateId`
- `attConditions`
- 可选的 `additionParams`

这样 public contract 继续保持业务领域命名，而 Primus template 和 attestation condition 细节留在内部。

## 内部参考 Contract

下面这些结构不是当前 public surface 的组成部分，但它们描述了 SDK 未来内部需要对齐的 Gateway 协议对象：

```ts
export interface CreateProofRequestInput {
  appId: string;
  identityPropertyId: string;
  zkTlsProof: {
    public_data: unknown;
    private_data: unknown;
  };
  businessParams?: Record<string, unknown>;
}

export interface CreateProofRequestResponse {
  proofRequestId: string;
  status: "initialized" | "generating" | "submitting" | "on_chain_attested" | "failed";
  createdAt?: string;
}

export interface ProofRequestStatusResponse {
  proofRequestId: string;
  status: "initialized" | "generating" | "submitting" | "on_chain_attested" | "failed";
  uiStatus?: "Processing" | "Completed" | "Failed";
}
```

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

其中 zkTLS SDK 自身使用的 `appId` 通过 SDK 内置配置里的 `primus.zktlsAppId` 提供，而不是取自 `init({ appId })`。

本地测试和 harness 可以通过外部 override 覆盖这套默认配置：

- Node 环境使用 `BNB_ZKID_CONFIG_PATH`
- 浏览器 harness 使用 `globalThis.__BNB_ZKID_CONFIG_URL__`

但这些 override 机制不应成为发布态 SDK 的主要接入方式。

## 错误模型

第一版应提供可预测的错误表面：

- 配置错误：client 配置不合法
- 校验错误：输入或输出结构不合法
- transport 错误：网络失败或非成功响应
- 协议错误：远端状态违反预期

每个错误至少应包含：

- 稳定的错误名称
- 简短的用户可读信息
- 可选的机器可读元数据

## 运行时支持

第一版运行时目标需要明确：

- 面向现代 TypeScript 使用者
- 优先支持 ESM
- 在确定构建工具前，先决定是否需要支持 CJS
- 在共享逻辑中避免依赖 Node 专属全局对象

## 使用示例

README 和 examples 中的示例，复杂度应尽量保持在这个级别：

```ts
import { BnbZkIdClient } from "bnb-zkid-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "listdao",
});
if (!initResult.success) {
  console.error(initResult.error);
}

const proveResult = await client.prove(
  {
    clientRequestId: "prove-task-001",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    provingDataId: "github_account_age",
    provingParams: {
      contribution: [21, 51],
    },
  },
  {
    onProgress(event) {
      console.log(event.status, event.proofRequestId);
    },
  }
);

console.log(proveResult.status);
if (proveResult.status === "on_chain_attested") {
  console.log(
    proveResult.walletAddress,
    proveResult.providerId,
    proveResult.identityPropertyId
  );
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
