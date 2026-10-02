---
id: VERIFY-0014
type: verification
status: verifying
priority: P1
owner: ssh-transport
source: user-request; current-worktree
created: 2026-10-02
updated: 2026-10-02
related_plan: [PLAN-0014]
related_tasks: [TASK-0147, TASK-0153, TASK-0169, TASK-0166, TASK-0167, TASK-0168]
---
<!-- Copyright The Open Forge contributors. -->

# SSH 适配的既有改动保护与验证

开始时 HEAD 为 1cbe27c53，主树包含用户 WIP，TASK-0148 已在独立工作树。只记录相关源码字节 SHA-256，不复制源码或读取凭据。本轮代码在独立 TASK-0153 Worktree，主树仅维护相关任务/索引；不将该工作树测试等同于含 WIP 的集成验证。

## 开工前快照

```json
[
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.test.tsx",
    "sha256": "58e5b7e14495cdb55c5d459f52fb29621f02a92711b98237ea61d2d18df1f785"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.remoteHostLabel.test.tsx",
    "sha256": "136250a305ef27d0ec44cbffd5e6c56cc44c77b93fbf491c98d8722a15a1c42d"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/hooks/remote-project-badge.test.tsx",
    "sha256": "46f2dc6984889423c0cf0fc1b2180972b1b422497b76aa293708e26c68361cba"
  },
  {
    "path": "apps/desktop/src/renderer/domains/settings/components/SshHostsSettings.test.tsx",
    "sha256": "3a50931ecad69fe9416dc5821f2def36c91988dfc27a6018d2c173ff99d1642b"
  },
  {
    "path": "apps/desktop/src/renderer/shared/hooks/useSshHostFormLabels.tsx",
    "sha256": "972f9216d70307fe99c47bb75fe57f8725959e0ab074145c1c18a68aa75a2c4b"
  },
  {
    "path": "apps/desktop/src/renderer/shared/lib/ssh-host-form.ts",
    "sha256": "800ff7cae39999920a8d29ea9012ed02432349823f2c00c39ce7f03413a94714"
  },
  {
    "path": "packages/theme-ui/src/settings/SshHostFormFieldsView.tsx",
    "sha256": "87a0bec8e186fcafeed8e81e72d203971ae1875723c62bd4a371a8c7e54a0bbf"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.tsx",
    "sha256": "d100924b14042f9e9bca491071d39bc5023193a73396b5917e364fd3ba036832"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/useAddProjectMenuModel.ts",
    "sha256": "a37db1cecb4fb610d3243234695c0b0d80612d2dd4c94271fa4e5a3c58ccb5d6"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/useRemoteProjectPickerModel.ts",
    "sha256": "a89a3c950176f9b84b819d6ecb264bc0c9fe8d56f1ab6a6e1b1f7a55e103e380"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/projects/ProjectGroup.tsx",
    "sha256": "a4507faaead9e649740aca088b56e10886ff59115cfceba2733f0cf313018cf7"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/ProjectGroupsSection.tsx",
    "sha256": "85bbfee7d3096d6b2f4de0ca57cf6e4b6aef038a5f8e80f8e7746b4200bfc37f"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/types.ts",
    "sha256": "0a2210a02149450a548e1cbaeb484e48514858bcbca04dc1de515c307a6508dc"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/useProjectsPanelModel.ts",
    "sha256": "37228526a23e5feebe43d496792b5c51b11631a92a6dcc0492877a8bce186436"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/hooks/useProjectGroupModel.ts",
    "sha256": "198091dc930ec4a89c88807bb4f82391a573bda40172a5518ee9cc0eb4e0244b"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/hooks/useProjects.projectWrites.test.tsx",
    "sha256": "f5a7d08699c39a639910d6550192ead2709cae57fe021a2e8db3b64bce797222"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/hooks/useProjects.ts",
    "sha256": "8e1e296951b0d8f49ccd4acb302019f7ec5178212497d9fe28682d26e9030ad1"
  },
  {
    "path": "apps/desktop/src/renderer/domains/settings/components/SshHostForm.tsx",
    "sha256": "085b380c32ad435d047d8065c359cfe2df747465edbfb685944feaaf8e3a34fb"
  },
  {
    "path": "apps/desktop/src/renderer/domains/settings/components/useSshHostsSettingsModel.ts",
    "sha256": "421f2d370ea0d7eebbba61640016791f50086ba2ac338e9791053038f03e2b2d"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/en/project.json",
    "sha256": "f33d8b8284dc39ac2a55bfdf1b07b3924ac180d7c4ae7551370265d01adb7561"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/en/settings.json",
    "sha256": "393b1665c8a96578ab53d9ac6b98d3a70933dcb1c21181e3f1325a7011e5e447"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/zh/project.json",
    "sha256": "89a4c2afeb5d363417c9180dfe8b085be71346d1294df462490cf92ec523e7e7"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/zh/settings.json",
    "sha256": "9c355dd56a62bca0b559fddc26dd7bf6360ea921e846f344a4948d41c09434c3"
  },
  {
    "path": "packages/theme-ui/package.json",
    "sha256": "0e0699203f6c1e16d267231b5f26f3be35321127a47b2c21f852f7a2e152d493"
  },
  {
    "path": "packages/theme-ui/src/settings/index.ts",
    "sha256": "5da74adaeccb153917d9dd98b2bdb073a31042ecf16d67e7c81965e6618b72a1"
  }
]
```

## 验证记录

待回填：原始失败/green、影响面、完整检查、哈希复核、未运行项与集成事实。未授权真实主机、用户 Desktop 或发布。

阶段性保护复核：25 个文件，变化 0；未修改用户代码。

## TASK-0153 最终验证（2026-10-02）

- 隔离分支：task/TASK-0153-ssh-selective-transport。
- 提交：2e41db644893488117bc58485a03a449a8a114f0；工作树 ../open-forge-wt/task-0153-ssh-selective-transport，提交后 git status --porcelain 为空。
- Node v26.3.1 / Bun 1.4.2 / Windows；未连接真实主机、用户 Desktop 或 Provider。
- SSH 定向：4 文件 43 passed、1 POSIX-only skipped；覆盖 run/open 输出、取消/超时、迟到 exit、幂等/升级清理、失败与既有 ssh2 回环。
- test:impact 首次回退到 test:changed 后失败。按该脚本的 createChangedTestPlan 核对，完整影响包只有 runtime-desktop 与 desktop；runtime-desktop 首次 13 文件、51 passed。
- Electron 安装补齐后独立执行 Desktop 全包：bun ../../scripts/quality/run-vitest.mjs run --maxWorkers=2，876 文件通过、6 既有跳过，4624 测试通过、29 既有跳过，耗时 1129.81 秒。只限制并发，未调整测试/hook 超时、断言或 include/exclude。
- 不把原 test:impact 的失败退出码改写为通过；上述两包全量成功是环境补齐后的影响面复验事实。
- check:quick、完整 bun run check、git diff --check、pre-commit 均通过；提交钩子未再改源码。源码自审完成，非独立评审。
- 主树 Task/Plan 索引、工作流链接与 Task Worktree 合同检查通过；25 个保护文件最终哈希全部不变。

## 未执行与边界

- 未在原生 POSIX 环境执行新增的真实进程树用例；本机用跨平台 OS 边界测试验证信号合同，不能替代实际 POSIX 内核验证。
- 未在含 TASK-0147 UI WIP、TASK-0165 新交互认证补丁的 main 集成验证。这些主树源码未复制、未改动、未提交。
- 未合入 main、未推送、未发布。主树仍不干净，遵循协作合同保留独立提交，不能为合并而 stash/reset/覆盖用户工作。
- 本轮只交付 TASK-0153 切片；TASK-0166/0167/0168/0169 为已落盘的后续草案，不代表已经实施。
