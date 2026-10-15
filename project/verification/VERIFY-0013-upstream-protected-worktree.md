---
id: VERIFY-0013
type: verification
status: verifying
priority: P1
owner: coordinator
source: user-request
created: 2026-10-02
updated: 2026-10-02
related_plan: [PLAN-0014]
---
<!-- Copyright The Open Forge contributors. -->

# 选择性适配前的未提交改动保护

基线 HEAD：`1cbe27c538ce65ce4e5bf054cb0c555f7c14114d`。以下是本轮开始前 TASK-0147 的 16 个已修改/新增文件的 SHA-256，不复制或移动内容。实施后逐项核对；发布说明允许追加本批条目，但不得删改原有待交付条目。只有显式继续 TASK-0147 的验证记录时才更新该 Task 文件。

```json
[
  {
    "path": ".github/release-notes/v0.1.3.md",
    "sha256": "c9be96f60efcfbbecc62ca2e318107b2e36136176370e383275addc11a510ea2"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.tsx",
    "sha256": "f00c85767e43dd2b30508b3ca32c8f8bfe85b2517866b09312496604aa846783"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/useRemoteProjectPickerModel.ts",
    "sha256": "2aaf998eab2114e624736c2a08ea85d9efeee84e6c5ae9062270bfffacb0101a"
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
    "sha256": "e097703d7d63a724c92c43ed4e4e3a3a31afa887315c758a767cfcfa93cad583"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/en/settings.json",
    "sha256": "393b1665c8a96578ab53d9ac6b98d3a70933dcb1c21181e3f1325a7011e5e447"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/zh/project.json",
    "sha256": "66842c128b9f3ade798b4018bd4cead9c5796d313309ff599f6b605cea7e9bbc"
  },
  {
    "path": "apps/desktop/src/shared/i18n/locales/zh/settings.json",
    "sha256": "9c355dd56a62bca0b559fddc26dd7bf6360ea921e846f344a4948d41c09434c3"
  },
  {
    "path": "packages/theme-ui/src/settings/index.ts",
    "sha256": "5da74adaeccb153917d9dd98b2bdb073a31042ecf16d67e7c81965e6618b72a1"
  },
  {
    "path": "apps/desktop/src/renderer/domains/project/components/sidebar/add-project/RemoteProjectPickerDialog.test.tsx",
    "sha256": "fcc19f8ac8b2e1352beaa697e2c69ed0c34723f7a9bdfeca5c9b9bf164a0a932"
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
    "path": "project/tasks/TASK-0147-remote-project-add-host.md",
    "sha256": "3a6c2969b2e28a2c4ecebb75e4fbaf4ba73c51771d25fca8d7cdbc9282fc5c80"
  }
]
```

本轮开始时 staged 为空；不把这些内容假定为已提交基线，不夹带进新 Task 提交。

## 并行变更发现

首次复核 16/16 哈希匹配。后续主树出现本 Agent 未修改的 useAddProjectMenuModel、ProjectGroup、ProjectGroupsSection、useProjectsPanelModel、useProjectGroupModel、useProjects 及远程主机标签测试；受保护的 RemoteProjectPickerDialog、useRemoteProjectPickerModel、两个 project.json、RemoteProjectPickerDialog.test.tsx 也有外部变化。没有覆盖、回退这些文件。先前完整回归覆盖的不是固定快照，不将其失败全归为上游或资源问题；改用独立 Task Worktree 验证后才可集成。
