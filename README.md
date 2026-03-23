# BNB-ZKID-SDK

BNB ZKID TypeScript SDK 设计工作区。

## 当前状态

当前仓库处于接口设计阶段，目标是先冻结对外契约，而不是提前写死运行时实现。

当前重点：

- 定义 facade `BnbZkIdClient(init/prove)`
- 定义 Primus `zktls-js-sdk` 接入抽象
- 定义 `zktls -> Gateway` 的输入映射接口
- 明确状态流转、请求结构和错误模型

## 文档

- [总体架构设计](./docs/architecture.md)
- [SDK 规范](./docs/sdk-spec.md)
- [Harness 说明](./docs/harness.md)
- [文档索引](./docs/index.md)

其中 `docs/architecture.md` 是当前阶段的最高优先级文档。实现工作应先遵循它，再进入 `sdk-spec` 和具体代码。

## 开发

安装依赖：

```bash
npm install
```

执行类型检查：

```bash
npm test
```

执行最小 example：

```bash
npm run example:minimal
```

## 当前接口草案

```ts
import { BnbZkIdClient } from "bnb-zkid-sdk";

const client = new BnbZkIdClient();

const initResult = await client.init({
  appId: "listdao",
});
if (!initResult.success) {
  console.error(initResult.error);
}

await client.prove(
  {
    clientRequestId: "prove-task-001",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    provingDataId: "github_account_age",
  },
  {
    onProgress(event) {
      console.log(event.status, event.proofRequestId);
    },
  }
);
```

当前这些方法只定义接口，不提供可运行实现。

仓库内提供了一个仅用于验证设计的 deterministic harness，用于驱动 `examples/` 和 `tests/harness/`，但它不会作为 package public API 导出。
