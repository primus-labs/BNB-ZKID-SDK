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

如果你要运行基于 fixture 的本地 override：

```bash
cp bnb-zkid.config.json bnb-zkid.config.local.json
BNB_ZKID_CONFIG_PATH=./bnb-zkid.config.local.json npm test
```

执行类型检查：

```bash
npm test
```

执行最小 example：

```bash
npm run example:minimal
```

浏览器环境下运行 browser harness：

```bash
npm run build
cd dist/examples/browser
python3 -m http.server 4173
```

然后打开 <http://127.0.0.1:4173>。

- `Fixture Gateway + Fixture Primus`：默认回归模式，不依赖真实 zkTLS
- `Fixture Gateway + Primus SDK`：浏览器 live skeleton，页面里临时输入 `zktlsAppId` 和本地 `appSecret`，Gateway 仍走 fixture

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
    identityPropertyId: "github_account_age",
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
```

当前仓库已经提供一条可运行的 public workflow 实现；发布态默认读取 SDK 内置配置，harness 和测试可以通过外部配置 override。

`provingParams` 用于传递数据源相关的分档阈值输入。当前设计阶段将它收敛为 `Record<string, number[]>`，例如 GitHub 可以传 `contribution: [21, 51]`，表示不同分档对应的贡献次数阈值。

仓库内提供了一个仅用于验证设计的 deterministic harness，用于驱动 `examples/` 和 `tests/harness/`，但它不会作为 package public API 导出。

## 运行时配置

`BnbZkIdClient` 保持 `new BnbZkIdClient()` 的接口不变。

默认情况下，运行时配置使用 SDK 内置配置。

- 发布态固定参数，例如 Gateway base URL、zkTLS `zktlsAppId`、内置 registry，应放在 SDK 内部模块
- Node 测试和本地 harness 可以通过 `BNB_ZKID_CONFIG_PATH` 指向外部 JSON override
- 浏览器 harness 可以通过 `globalThis.__BNB_ZKID_CONFIG_URL__` 指向外部 JSON override

外部 override 配置中可以定义：

- Gateway 地址或 fixture 文件
- zkTLS 的 `zktlsAppId`
- Primus 签名来源：本地 `appSecret`、页面输入或后端 signer
- `identityPropertyId -> templateId` 映射规则

## Browser Harness

仓库提供了一个浏览器专用 harness 页面：

- [examples/browser/index.html](./examples/browser/index.html)

这层 harness 的目标不是替代 `npm test`，而是验证：

- 浏览器环境能加载 `BnbZkIdClient`
- 浏览器配置加载逻辑可运行
- `init -> prove` 主流程在浏览器里能走通

当前 browser harness 支持两层验证：

- `fixture + fixture`：默认回归，不依赖真实 Gateway 或真实 zkTLS
- `fixture + primus sdk`：浏览器里验证真实 zkTLS SDK 初始化和 attestation 流程，但 Gateway 仍保持 fixture
