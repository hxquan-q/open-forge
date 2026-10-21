---
id: REQ-0023
type: requirement
status: ready
priority: P1
owner: desktop
source: user-request（2026-10-20：切换会话去掉替换确认；会话导出 TXT/MD/docx + 路径自选默认桌面；右键多选批量删除/批量导出）
related_requirement: [REQ-0017, REQ-0020, REQ-0021, REQ-0022]
related_plan: []
related_tasks: [TASK-0345]
related_issues: []
related_bugs: []
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 智能客服会话管理:替换确认移除、导出与批量操作

## 用户问题

① 切换历史会话时的「确认替换当前会话」已无必要(消息由服务端保存);② 需要把对话导出为 TXT / Markdown / docx,保存路径可选(默认桌面);③ 需要多选多个会话做批量删除与批量导出。

## 用户结果

- 点历史对话**直接切换**,不再弹确认
- 右键「导出会话」:三种格式,保存对话框默认桌面可改;导出内容为问答正文(引用标签转文字,不含思考);**自动拉取完整历史**(不受界面 20 条加载限制)
- 右键「多选」进入多选模式:勾选多个对话后批量导出(选目录,每会话一个文件、文件名=标题、重名加序号)或批量删除(确认含数量与不可恢复,生成中禁选);批量结果如实反馈成功/失败明细
- 全程纯客户端,WeKnora 侧零改动;新增依赖仅 `docx@9.13.0`(MIT)

## 交付记录

- T01 替换确认移除(fafb911ab);T02 导出纯函数引擎(d0bb777b7);T03 保存能力扩展+分页游标合同补齐(340a67f42 / 2ad37ad6b);T04 多选与批量删除(7396b1ff9 / 42ae621cc / 13c996fb3);T05 导出接线(a6734e6 / 2265c3f / 6db74d3)。验收标准 12 条与证据链见 `docs/devflow/weknora-session-management/`(本地过程文档)。
