<!-- Copyright The Open Forge contributors. -->
# 评审 Red-Flag 清单（TASK-0111）

看到这些模式时**停下来复核**，不要继续顺着改。清单是评审辅助与 Agent 自检，不是自动门禁；命中不等于违规，但必须能给出书面理由。

## 类型与边界

- 新增 `any`、`as unknown as`、双断言传参；
- 跨包深链：`@vetta/*/src/**`、相对路径逃出模块根（`../..` 伸进别的包）；
- `internal_dependencies` 白名单里出现「以防万一」的空声明；
- 从 `packages/**` 反向 import `apps/**`，或从协议包 import 平台实现；
- 修改生成文件（`*.generated.*`、catalog、dependents.md）而不改生成源。

## 测试

- 测试只断言 `toHaveBeenCalled`，不断言用户可见结果或持久化事实；
- 测试里出现 `sleep`/`setTimeout` 裸等待、依赖执行顺序的共享状态；
- 为通过测试把被测模块内部全部 mock 掉；
- 用大面积快照替代关键断言。

## 规则与例外

- 新增跨边界协议面却不在 `tests/contracts/protocol-registry.json` 登记 conformance 套件；
- 豁免规则却不写 waiver，或 waiver 没有到期日/owner/补偿条款；
- waiver 到期后「顺手再延一次」而没有新的证据；
- 通过删除守卫、放宽基线、加 ignore 注释来让检查转绿；
- 注释掉一段校验逻辑「临时调试」后忘记还原。

## 权限与安全

- 权限校验从「默认拒绝」改成「默认放行」；
- 日志、诊断包、测试 fixture 里出现凭据、Prompt 全文、用户文件内容；
- 把不可信输入（插件清单、MCP 返回、网页内容）直接拼进执行路径；
- Plugin/Skill/MCP 权限声明悄悄扩大。

## 并发与生命周期

- 新增全局可变单例、`process.env` 散点读写、隐式初始化顺序；
- 资源（listener、timer、子进程、文件句柄）没有对应释放路径；
- 用「先发了再说」绕过取消/中止语义。

## Git 与协作

- 共享工作区里 `git add -A` / `git commit` 不带 pathspec；
- 一个提交混合多个可独立回滚的 concern；
- 对 `main`/`dev` 之外的 ref、上游仓库或共享分支做强制操作。

发现确属真实问题时：能当场修就修；属于「暂不修」的 Policy 级例外，登记 `project/decisions/waivers/`（带到期日）。
