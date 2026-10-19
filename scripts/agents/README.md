<!-- Copyright The Open Forge contributors. -->
# 自主研发执行工具

本目录服务于仓库开发协作，不属于产品 Runtime。完整范围与实际验收状态见 [PLAN-0019](../../project/plans/PLAN-0019-autonomous-development.md)。实现、独立评审、实际测试与集成/发布是不同事实，不能用前一项代替后一项。

## 权威入口

- [策略](../../project/autonomy-policy.json)：目标 L4，当前 level=0，模型与发布能力默认不启用。
- [执行器配置](../../project/agents.json)：示例默认 disabled，启用前固定实际可执行文件、模型与隔离方式。
- [JSON 合同](../../schemas/agents/)：边界采用闭合的 JSON Schema 子集；不支持的关键字报错，不静默略过约束。
- 任务继续使用 project/tasks；不增加 GOAL 状态机。运行进程、租约与尝试次数不写进 Task 心跳提交。

## 当前公开命令

```powershell
# 只读检查配置，不调用模型，不验证真实沙箱或发布环境
node scripts/agents/cli.mjs doctor

# 操作者指定独立、仅控制器可访问的状态目录；不要选真实用户状态目录
node scripts/agents/cli.mjs claim --task TASK-xxxx --holder <controller-id> --run-id <unique-id> --state-dir <controller-state>
# Coordinator 按既有入口把 Task / 索引推进到 in_progress 并准备已提交基线后，生成合同
node scripts/agents/cli.mjs plan --task TASK-xxxx --worktree <task-worktree> --test <test-file>
node scripts/agents/cli.mjs run --run-id <unique-id> --adapter <configured-adapter> --role implementer --contract <contract.json> --state-dir <controller-state>
node scripts/agents/cli.mjs run --run-id <unique-id> --adapter <independent-adapter> --role reviewer --contract <contract.json> --state-dir <controller-state>
node scripts/agents/cli.mjs verify --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs evidence --run-id <unique-id> --state-dir <controller-state>
node scripts/agents/cli.mjs status --state-dir <controller-state>
node scripts/agents/cli.mjs pause --state-dir <controller-state>
node scripts/agents/cli.mjs resume --state-dir <controller-state>
node scripts/agents/cli.mjs release --run-id <unique-id> --state-dir <controller-state>
```

`plan` 将 JSON 输出到 stdout，不默认写文件。claim 可用于人工协作，模型执行另受 level、能力、Provider 白名单与执行器配置约束。`release` 是释放租约，不是发布软件。`recover` 仅在 writer.lock 对应进程已确认不存在时回收锁；不修复或清空损坏状态。

## 信任与恢复

状态使用单机文件锁、fsync/原子替换与 HMAC 完整性校验；控制器密钥不能放入 Git 或挂载给 Worker。它不是分布式锁，运行目录也不是安全沙箱。真实执行必须有经过验证的 OS/VM/沙箱边界，令 Worker 与测试代码均不能访问控制器状态和发布凭据。配置里的 isolation 是执行要求，不是隔离证明。

租约使用 task/run/holder/generation 四元组。过期结果拒绝；旧进程仍存活或生存状态未知时拒绝回收。暂停后心跳会中止本控制器正在管理的子进程，不根据陈旧 PID 随意杀死其他进程。重启后的进程确认、资源回收与部署演练仍需按父计划验证。

运行器记录配置固定的身份和实际子进程结果，模型文本只能输出有限结果 Schema，不能声明自己是 human。身份元数据不等于厂商独立性或模型质量的数学证明；用量拿不到时记录 null，不能写成 0。

验证使用仓库 Node runner、完整 check 和 impact 入口。必需检查缺失、无实际通过断言、候选代码/策略/执行器配置变化时拒绝沿用旧证据。UI 和 packaged 检查需要明确能力；UI 验证适配器尚未接入时拒绝，不以普通单测代替。

## 验证

```powershell
bun scripts/quality/run-vitest.mjs --run scripts/agents
```

测试用真实临时 Git 仓库、文件系统和受控子进程覆盖软件合同，不调用真实 Provider、不读取用户会话，不证明远端 CI、真实模型质量或稳定发布已完成。
