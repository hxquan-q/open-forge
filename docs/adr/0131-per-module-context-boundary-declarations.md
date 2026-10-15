<!-- Copyright The Open Forge contributors. -->
# ADR-0131：包边界规则改为每模块 Context Boundary 声明 + 白名单 arch test

## 状态

已接受（PLAN-0011 阶段 A；TASK-0110 落地）

## 背景

原包边界守卫 `scripts/quality/check-package-boundaries.mjs` 用集中式 `LIB_PREFIXES` 前缀表表达「哪些目录算库、库不许 import 谁」。该形态有两个结构性问题：

1. **声明与模块分离**：新增包要改的是守卫文件里的前缀表，而不是自己的模块说明；包一多，中心表成为协调热点。
2. **表达不了反向声明**：前缀表只能说「库不许依赖 app」，无法表达「本模块允许依赖谁」——白名单是模块自己的合同，不是全局表的过滤条件。

`RESEARCH-0012` 对 Avernet 取证确认其解法：每模块 README 内嵌 `## Context Boundary` YAML（purpose / provides / consumes / `internal_dependencies` 白名单），arch test 校验「未声明的跨模块 import 即失败」，`dependents` 反向视图由测试生成、禁止手写。该机制与语言无关，可直接照搬到本仓。

## 决策

### 1. 声明形态

- 每个 workspace 模块（含 `packages/plugins/presets|externals/*`、`themes/builtin/*`、`coding-agent/examples/extensions/*`）与非 workspace 交付物（`apps/im-gateway`、`apps/kotlin`、`apps/ssh-helper`）在自有 `README.md`（无 README 时为 `AGENTS.md`）内嵌 `## Context Boundary` yaml 块。
- Schema：`purpose`（必填非空串）、`provides` / `consumes` / `internal_dependencies`（必填列表，可空）。`internal_dependencies` 元素必须是真实存在的 workspace 包名。
- 一个模块只允许一处声明（README 与 AGENTS 同时声明即报错）。

### 2. 校验语义（`scripts/quality/check-context-boundaries.mjs`）

- 扫描模块目录内全部源文件的 import specifier（TypeScript AST，不含注释与字符串），凡跨模块 package import 未列入 `internal_dependencies` 即失败。
- 相对路径逃逸出模块根一律失败；`@pkg/src/**` 深链一律失败——白名单不豁免深链。
- **测试文件例外**：`*.test.*` / `*.spec.*` 与 `test/` 树允许相对逃逸进**已声明**依赖的模块。这是对既有「测试直接引实现文件」耦合模式的让步：依赖方向仍受白名单约束，但访问路径不做生产级要求。该例外是本次双跑比对中唯一与新规则冲突的存量事实，登记于此而非逐个改测试。
- 缺声明块、schema 非法、`internal_dependencies` 指向不存在的包名，均为失败。

### 3. 反向视图

- `docs/architecture/dependents.md` 由 `--write-dependents` 机器生成（谁依赖我），文件头注明禁手写；默认校验比对生成结果，漂移即失败。
- `--apply` 脚手架为缺声明的模块按扫描结果生成首版 yaml 块，供人工修订。

### 4. 与旧守卫的关系

`check-package-boundaries.mjs` 不废弃：它仍承担「库不 import 宿主应用、生产代码不 import 他包 test 树、capability/插件隔离」等与新机制正交的规则。两者在 `check-guards` 并行运行；本 ADR 合并前的比对显示旧守卫报 0 违规，新机制唯一冲突面是上述测试文件相对逃逸例外——无漏报。后续若职责重叠到值得收编，再单独决策。

## 备选方案

- **继续扩集中前缀表**：新增包仍改中心文件，且无法表达白名单；否决。
- **引入 import-linter 类外部工具**：Avernet 用 Python 生态，本仓为 Bun/TS，自写 AST 扫描与既有守卫同构，成本低于引入新工具链；否决。
- **测试文件也按生产级禁逃逸**：会把 15 个既有测试文件变成必须先修的存量违规，超出 TASK-0110「只加声明+校验、不动实现」的范围；以显式例外收编。

## 后果

- 新增包的边界义务从「改守卫」变为「写自己的声明」；`docs/monorepo-new-package.md` checklist 已加入对应步骤。
- `internal_dependencies` 白名单只约束「允许依赖谁」，不声明被谁依赖——反向信息一律读 `dependents.md`。
- `consumes` 当前多为 `[]`，作为后续补充合同描述的扩展点，不阻断校验。
