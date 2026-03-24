## 介绍

作为**BNB ZK ID framework**的sdk，给客户端应用（如：listdao）集成。

它的职责是把“客户端应用调用 Primus zkTLS 能力”和“客户端应用调用 BNB ZK ID Gateway”这两段流程，收敛成一套稳定、清晰、可复用的 TypeScript 集成接口。

## Roles

### Application

使用本 SDK 的业务应用（如：listdao）。

### BNB ZK ID SDK

就是本SDK。

### Primus zktls-js-sdk

负责发起 zkTLS attestation 相关流程，负责生成 attestation 结果。

### BNB ZK ID Gateway

负责接收 Proof Request，并返回 Proof Request 生命周期状态。

## 主要流程

![bnb-zkid-client](./images/bnb-zkid-client.png)

## 对外接口定义

定义一个BnbZkIdClient类，包含如下方法：

### init

初始化sdk。

* 参数：`appId`，注册到 BNB ZK ID framework 的 `appId`。
* 成功返回：`success = true`。
* 失败返回：`success = false`，并包含可选的错误信息。

### prove

请求证明。

* 参数：
  * clientRequestId（string）：调用方传入的本地任务ID，用于长任务和并发任务跟踪。
  
  * userAddress（string）：用户地址。
  
  * provingDataId（string）：对应要证明的数据源和字段内容。
  
  * provingParams（可选，object）：需要传递的额外字段（比如：余额大于x，这里传x）。
  
    * binance
  
      ```json
      // 完成高级 KYC 认证（Level 2）且历史交易超过 50 笔
      // 完成基础 KYC 认证（Level 1）或历史交易达 10～49 笔
      //已绑定账号且有任意交易记录
      // 未绑定
      
      {
        data: [1, 11, 51]
      }
      ```
  
    * okx
  
      ```json
      // 完成高级 KYC 认证（Level 2）且历史交易超过 50 笔
      // 完成基础 KYC 认证（Level 1）或历史交易达 10～49 笔
      // 已绑定账号且有任意交易记录
      // 未绑定
      
      {
        data: [1, 11, 51]
      }
      ```
  
    * github
  
      ```json
      // 账号使用超过 1 年，且过去一年贡献超过 50 次
      // 账号使用超过 6 个月，或过去一年贡献达 20～49 次
      // 已绑定账号      
      // 未绑定
      
      {
        contribution: [21, 51]
      }
      ```
  
    * steam
  
      ```json
      // 非受限账号，使用超过 1 年，游戏库价值超过 $50
      // 非受限账号，使用超过 6 个月
      // 受限账号，或不满足以上条件
      
      {
        limitedAccount: [5], // 所有交易总额
        gameLibraryValue: [51]
      }
      ```
  
    * amazon
  
      ```json
      // Prime 会员且账号使用超过 2 年
      // 账号使用超过 1 年，或过去一年购买超过 20 单
      // 已绑定账号且有历史购买记录
      // 未绑定
      
      {
        ordersVolume: [1, 21]
      }
      ```
  
      
  
  * options.onProgress（可选，function）：证明过程中的进度回调。
  
    `options.onProgress` 回调状态：
  
    * `initialized`：数据项证明请求成功。
    * `data_verifying`：数据源页面已打开，zkTLS 证明中。
    * `proof_generating`：zkTLS 证明已完成，zkVM 证明进行中。
    * `on_chain_attested`：证明成功并已上链。
    * `failed`：证明失败。
  
* 成功返回：`status = on_chain_attested`，并包含 `clientRequestId`、`walletAddress`、`providerId`、`identityPropertyId` 以及 `proofRequestId`。

* 失败返回：`status = failed`，并包含 `clientRequestId`、可选的 `proofRequestId` 以及错误信息。

## 数据源变化处理

## 安全性

## 性能

## 稳定性
