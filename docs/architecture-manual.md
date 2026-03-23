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

接受zkvm证明请求，返回zkvm证明结果。

## 主要流程

![bnb-zkid-client](./images/bnb-zkid-client.png)

## 对外接口定义

定义一个BnbZkIdClient类，包含如下方法：

### init

初始化sdk。

* 参数：无
* 返回：true或者false。

### prove

请求证明。

* 参数：
  * userAddress（string）：用户地址。
  * provingDataId（string）：对应要证明的数据源和字段内容。
  * provingParams（可选，object）：需要传递的额外字段（比如：余额大于x，这里传x）
* 返回一个object，可以用来去合约查询具体的分数情况。错误的情况下，返回对应的错误码。

## 数据源变化处理

## 安全性

## 性能

## 稳定性

