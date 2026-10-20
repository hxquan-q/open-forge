---
id: REQ-0021
type: requirement
status: ready
priority: P1
owner: desktop
source: user-request（2026-10-20：智能客服回答里的 <kb/> 引用标签显示为乱码——要么去掉、要么做成可点击引用来源；用户要求先实测成因再动手）
related_requirement: [REQ-0017, REQ-0019, REQ-0020]
related_plan: []
related_tasks: [TASK-0324]
related_issues: []
related_bugs: []
created: 2026-10-20
updated: 2026-10-20
---
<!-- Copyright The Open Forge contributors. -->

# 智能客服引用标签角标化与原文弹层

## 用户问题

智能客服（WeKnora）回答正文里出现 `<kb doc="…" chunk_id="…" kb_id="…"/>` 形式的内联标签，被原样渲染成"乱码"。用户不采信"系统内部资源标识符"的解释，要求先实测定位真实成因，再决策"过滤掉"还是"做成可点击引用"。

## 成因（实测 + 源码双证）

WeKnora 服务端把模型私有引用句柄 `<ref id="cN"/>` 展开为 `<kb/>`/`<web/>` 内联标签（官方前端契约=渲染为可点击角标），桌面端全链路此前零处理，react-markdown 将其转义为明文。标签出现**非确定**（模型自行决定是否引用），但历史已存消息中的标签永久存在。agent-chat 路径无 `references` 结构化事件（与 v0.8.2 开源码 knowledge-chat 路径行为不同），引用数据只能取自标签自身属性；chunk 原文可经 `GET /api/v1/chunks/by-id/:id` 反查（需 `retrieve` 能力，现有租户 Key 具备）。

## 用户结果

回答正文干净：知识库引用显示为角标（文档名截断、悬停看全名），点击弹出**只读**卡片展示引用原文片段（三态、互斥、Esc 关闭、缓存去重）；网页引用转为标准外链；流式期间与思考区不再出现标签文本；历史回看同样生效；无法解析的标签按纯过滤剥除兜底。WeKnora 侧零改动（C1），仅新增一个只读 GET 调用。

## 交付记录

- T01 解析器纯函数（c7a659c41）；T02 chunk 数据面四层+缓存（fa92e78f6 / 9f1667d55 / 19e8cc976）；T03 渲染管道 web 外链+思考区剥标签（1454a1ec1 / cd3263946 / 30cbaca17）；T04 kb 角标+点击弹原文（347026349 / 772d0425d）。验收标准 16 条与证据链见 `docs/devflow/weknora-kb-citation/`（本地过程文档）。
