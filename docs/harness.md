# Harness 说明

## 目标

定义 SDK 进入实现阶段后的第一个可执行 harness。

当前仓库处于接口冻结阶段，因此本文档描述的是“下一阶段”的 harness 目标，而不是当前仓库已经提供的能力。

补充说明：仓库现在已经加入一个仅供仓库内部使用的 deterministic harness，用于验证文档、fixture、example 和测试之间是否一致。它不代表真实生产实现已经开始。

## 第一个 Harness 的定义

第一个 harness 应验证一条完整的 Gateway happy path：

1. 开发者创建一个 client。
2. client 获取 Gateway 配置。
3. client 提交一个包含 `zkTlsProof` 和 `privateData` 的 `ProofRequest`。
4. client 查询 `proofRequestId` 的状态。
5. 应用拿到类型明确的成功结果，包含 `status = on_chain_attested`、`walletAddress`、`providerId`、`identityPropertyId`。

## Harness 必须证明什么

- public API 是自洽的
- README 里的示例是可执行的
- 请求与响应结构能被正确解析
- 错误能够以可预测的形式暴露
- 在早期开发阶段无需真实后端也能验证 SDK

## 建议的早期 Harness 结构

```text
examples/
  minimal.ts
tests/
  harness/
    minimal-sdk.test.ts
fixtures/
  config.json
  create-proof-request.json
  get-proof-request-status.json
```

当前仓库已落地对应目录，并将 internal harness 实现放在 `src/harness/` 下，避免污染 package public surface。

## 执行策略

在第一阶段，应优先使用确定性的 fixture 和 mocked transport。

这样做会立刻带来三个收益：

- 在后端集成尚未稳定前，就能先验证 API 设计
- agent 生成代码时能获得快速的通过/失败反馈
- public contract 的变化会在一个集中位置被捕获

只有在 mocked happy path 稳定之后，项目才应加入真实联调用的 live integration harness。

## Harness 契约

如果出现以下任一情况，第一个 harness 都应该失败：

- 示例代码不再可编译
- `GET /v1/config`、`POST /v1/proof-requests`、`GET /v1/proof-requests/{proofRequestId}` 的方法或参数结构偏离规范
- 解析后的响应泄漏出未经处理的原始未知 payload
- 类型化状态流转变得含糊
- 引入 breaking API change 却没有同步更新示例

## 最低必备产物

在实现进一步展开之前，仓库中至少应包含：

1. 一个与 public API 保持一致的 README 示例
2. 一个可运行的 example 文件
3. 一个使用确定性 fixture 的端到端测试
4. 一套共享的响应 fixture

## 第一阶段退出标准

满足以下条件时，可视为第一阶段完成：

- 最小示例可以运行
- harness 能在本地通过
- Gateway 三个核心接口的 public types 已稳定到可评审程度
- 新增第二个 provider 或 identityProperty 时，不需要重新设计顶层 client 形状

## 本文档之后的建议下一步

实现 harness 所需的项目骨架：

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `examples/minimal.ts`
- `tests/harness/minimal-sdk.test.ts`

只要测试覆盖的是真实 Gateway public API，初期完全可以使用 fake transport。
