# 核心合同草案

> 本文是实施前的合同草案，不是可直接合并的生产代码。最终位置、公开导出和版本策略需要先经过包所有权与合同测试评审。

## 1. 所有权建议

| 合同 | 首选所有者 | 原因 |
|---|---|---|
| Task 的通用生命周期、Session 绑定、generation 引用 | `runtime-core` | 不包含 work/coding 业务词汇时可跨产品复用 |
| Work/Coding Task 的目标、Artifact 交付语义 | `coding-agent` 产品合同 | 属于产品组合策略 |
| Artifact Descriptor、Renderer 注册 | 产品合同 + Plugin SDK 适配 | Runtime 保存引用/事件，Plugin 提供展示实现 |
| Tool Risk/Policy | Runtime Tool Policy + 产品默认策略 | Runtime 执行授权，产品决定默认风险映射 |
| Project/Session Trust | Host/平台策略 | 包含本机路径、用户批准和凭据边界 |
| Approval Request/Decision | Runtime 通用事件 + Desktop UI 投影 | 运行时需要可恢复，UI 不拥有状态机 |

## 2. Task 合同草案

```ts
export type RuntimeTaskStatus =
  | "draft"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "paused"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected"
  | "changes_requested";

export interface RuntimeTaskIdentity {
  readonly taskId: string;
  readonly rootSessionId: string;
  readonly generation: string;
}

export interface RuntimeTaskSnapshot {
  readonly identity: RuntimeTaskIdentity;
  readonly status: RuntimeTaskStatus;
  readonly title?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly activeTurnId?: string;
  readonly artifactIds: readonly string[];
  readonly pendingApprovalIds: readonly string[];
}
```

不变量：

- Task 不直接执行模型或 Tool。
- Task 的活动执行必须落到一个已有 Session/Turn 序列。
- `generation` 只能引用已获取的 Runtime Snapshot/Lease 身份，不能读取任意 current revision。
- 状态转换必须由状态机验证，非法转换返回稳定错误。
- Task 状态变化要有可重放事件，不依赖 UI 内存。

## 3. Artifact 合同草案

```ts
export type ArtifactKind =
  | "document"
  | "dataset"
  | "analysis"
  | "code-change"
  | "execution-result"
  | "research-evidence"
  | "bundle";

export type ArtifactStatus =
  | "draft"
  | "generated"
  | "modified"
  | "validated"
  | "accepted"
  | "rejected";

export interface ArtifactDescriptor {
  readonly artifactId: string;
  readonly kind: ArtifactKind;
  readonly status: ArtifactStatus;
  readonly title: string;
  readonly uri?: string;
  readonly version: number;
  readonly sourceTaskId?: string;
  readonly sourceSessionId: string;
  readonly sourceTurnId?: string;
  readonly contentType?: string;
  readonly checksum?: string;
  readonly rendererType?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

不变量：

- 文件内容是用户事实源；descriptor 是可重建的结构化索引。
- `details`/card payload 可以引用 Artifact，但不得把 UI 数据塞进模型可见 `content`。
- Artifact 版本递增，不原地覆盖历史事实。
- Renderer 只能渲染已校验 descriptor，不能绕过权限读取任意路径。
- Bundle 只保存 Artifact 引用，不复制全部内容。

## 4. Tool 风险合同草案

```ts
export type ToolRiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type ToolExecutionClass = "parallel-safe" | "exclusive";

export interface ToolRiskDescriptor {
  readonly defaultLevel: ToolRiskLevel;
  readonly executionClass: ToolExecutionClass;
  readonly irreversible: boolean;
  readonly externalSideEffect: boolean;
  readonly requiredScopes: readonly string[];
}
```

风险只能被参数和目标资源提升，不能由模型降低。Tool Registry、Tool Policy 和 Project Policy 的责任要分开：Registry 描述能力，Policy 决定是否允许，Approval 决定一次具体高风险操作是否放行。

## 5. Permission Grant 合同草案

```ts
export type PermissionTrustScope = "session" | "project";

export interface PermissionGrant {
  readonly grantId: string;
  readonly scope: PermissionTrustScope;
  readonly projectRoot?: string;
  readonly capabilities: readonly string[];
  readonly deniedCapabilities?: readonly string[];
  readonly source: "user" | "project-policy" | "built-in";
  readonly version: string;
  readonly issuedAt: number;
  readonly expiresAt?: number;
  readonly revokedAt?: number;
}
```

Project Trust 只应存在本机 `.vetta-local/trust.json` 或等价安全存储；不得进入共享 `.vetta/`，不得隐式升级为全局信任。

## 6. Approval 合同草案

```ts
export type ApprovalDecision = "approve" | "approve_once" | "deny" | "edit";

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolName: string;
  readonly risk: ToolRiskDescriptor;
  readonly summary: string;
  readonly inputPreview: unknown;
  readonly affectedResources: readonly string[];
  readonly createdAt: number;
  readonly expiresAt?: number;
}
```

Approval 是 Runtime 事件和状态，不是 UI 临时弹窗。UI 关闭或崩溃后，Task 应仍然能恢复到 `awaiting_approval`。
