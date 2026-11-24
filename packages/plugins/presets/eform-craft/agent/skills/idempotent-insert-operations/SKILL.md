---
name: idempotent-insert-operations
description: "新增 POST 创建记录、下推、拆分、合并等非幂等资源写操作时调用。先核实 CustomDev 实际幂等基础设施，不只加 Workshop 注解或默认所有 PUT/DELETE 天然幂等。"
---
<!-- Copyright The Open Forge contributors. -->

# 新增写操作幂等

Workshop 对 INSERT 类 POST（新增、下推、拆分、合并、生成工单）明确要求幂等保护；其 PUT 更新/逻辑删除通常不走该插入拦截，是否真正幂等仍取决于业务副作用，不能仅凭 HTTP 方法证明。

## 一次保存意图

- 前端一次保存意图生成一个键，网络失败重试复用，成功后清空；同一保存流的多个明细请求使用稳定序号后缀区分。
- Workshop 通过 `X-Idempotency-Key` 传递，INSERT 类 Controller 使用 `@Idempotent`。
- 后端 Redis 原子占位与短 TTL，重复返回冲突；业务失败释放以同键重试。Redis 不可用时按项目确认降级，不能自行默许重复写。

## CustomDev 适配

旧材料记录 CustomDev 初始模板没有通用拦截器，Practice/customerdev 的 firstTry 清场接口有 Redis 幂等示例；它不是会话所属 CustomDev 已安装该能力的证明。先核实目标注解、拦截器、Axios 与 Redis 合同，缺失时明确范围并实现完整最小方案，不只加不存在的注解，也不为一个接口默认搬入整套平台基础设施。

验证同键重试、重复并发、成功后新意图、业务失败/Redis 不可用与明细键稳定性；防重复按钮不能替代服务端保障。

来源：`eformSkill/新增写操作幂等`、Workshop CLAUDE/前端通用模式和 Practice 拦截器。保存键是实现合同，不能用旧静态页面保存行为代替。
