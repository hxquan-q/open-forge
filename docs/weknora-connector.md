<!-- Copyright The Open Forge contributors. -->
# 智能客服 · WeKnora 连接器

> 面向部署与运维同事:这个连接器做了什么、怎么配、有哪些**已知会挡演示的坑**。
> 你不需要任何前置上下文,读完即可接手。

---

## 1. 这个连接器是什么

小爱ai 桌面端新增一个「智能客服」入口,直接连公司的 WeKnora 知识平台,**在客户端内向知识库智能体提问并以流式显示回答**,不需要另外打开 WeKnora 网页。

代码位置:

| 层 | 路径 |
|---|---|
| 主进程客户端层 | `apps/desktop/src/main/weknora/` |
| IPC 与 preload | `apps/desktop/src/main/ipc/weknora.ts`、`apps/desktop/src/preload/{api-types,apis}/weknora.ts` |
| 渲染层页面 | `apps/desktop/src/renderer/domains/weknora/` |
| 文案 | `apps/desktop/src/shared/i18n/locales/{zh,en}/weknora.json` |

改动**以新增为主**。首期(REQ-0017)新增 weknora 域并接入导航;二期打磨(REQ-0019)在其上叠加三能力,31 个文件 +2394/−91(9 个新文件),对既有文件只加不改结构。

---

## 2. 功能范围

### 已实现

- 侧边栏「智能客服」入口(**默认置顶**)
- 智能体选择器:列出当前凭据可见的**全部**智能体,可切换,选中项持久化
- 提问 → **流式逐字回答**
- **思考旁白与正式回答分区显示**:旁白收进可折叠的「思考过程」区,回答结束自动收起
- **新建对话与历史会话**:侧栏列出此前的对话(标题、所用智能体、时间),可新建对话并在多个对话间切换;点历史对话**直接切换**载入(REQ-0022 起去掉替换确认——消息由服务端保存,无需二次确认)
- **后台思考**(REQ-0019):回答生成中切到别的对话,原对话在后台继续生成;侧栏行亮「思考中」呼吸点;切回立即续显;多对话可并行提问;后台完成仅静默刷新列表,无弹窗
- **右键删除历史对话**(REQ-0019):右键 →「删除会话」→ 确认(明示不可恢复)→ 从 WeKnora 删除并刷新列表;删的是当前打开的对话则聊天区回到空白新对话;生成中的对话删除项置灰;失败内联报错可重试
- **侧栏收起**(REQ-0019):页头开关一键收起/展开左侧历史栏,状态跨重启记住,首次默认展开
- **页面观感打磨**(REQ-0020):页头与内容贴窗口边缘(收掉顶部大块留白)、历史会话栏上移;回答生成时新字符逐个淡入上浮;等待首字时显示「思考中」三点动画;侧栏收起/展开为宽度滑动 + 淡出。副标题文案改为「由小爱酱知识库为你回答」。
- 取消(保留已收到的部分内容;仅作用于当前打开的对话,后台对话生成到自然结束)
- 未配置时的中文引导页
- 中英双语

### 尚未实现(已知限制,不是缺陷)

| 缺什么 | 影响 |
|---|---|
| 引用来源角标 | 回答里没有来源角标 —— 见 §4 |
| 错误提示的完整度 | 冷门错误(403 缺能力 / 409 用错 Key 类型)不点名原因;删除失败为通用文案不按错误码细分 |
| 后台流的取消入口 | 后台生成中的对话只能等它跑完;取消按钮只对当前打开的对话生效(用户裁定的取舍) |

---

## 3. 部署配置

### 需要在小爱ai 页面里配两样

```
WeKnora 地址:  http://183.36.30.83:8083
API Key:       <公司 WeKnora 的「租户 API Key」>
```

**⚠️ Key 的创建位置与类型都很要紧:**

```
WeKnora 设置 → 发布集成 → API 集成 → 创建 API Key
  授权方式:  选「能力授权」(不要选「空间完全访问」)
  必须勾选:  ✅ 对话能力    (chat)
            ✅ 读取智能体  (read_agents)
```

**不要用「设置 → 平台 API Key」那一个** —— 那是平台超管密钥,调会话接口时会因为缺 `X-Tenant-ID` 头而返回 **409 `TENANT_REQUIRED`**。

### 凭据存储

API Key 存入 Electron `safeStorage` 加密凭据库,不进配置文件、不进日志、不进 Git。界面只显示「已配置 / 未配置」,不回显密钥。

### 调用的接口(纯数据面调用)

```
POST   /api/v1/sessions                建会话
POST   /api/v1/agent-chat/{session_id} 提问(SSE 流式,多路并发已实测互不串台)
GET    /api/v1/agents                  智能体列表
GET    /api/v1/sessions                会话列表
GET    /api/v1/messages/{id}/load      载入消息
GET    /api/v1/chunks/by-id/{chunk_id} 引用原文(2026-10-20 实测:200;引用角标点开弹层用,只读)
DELETE /api/v1/sessions/{id}           删除会话(2026-10-19 实测:200 成功 / 404 不存在)
```

**不改 WeKnora 侧的任何配置。**删除与建会话同为数据面操作,调用方 Key 需具备对话能力(chat);引用原文接口需 `retrieve` 能力(2026-10-20 实测现有租户 Key 具备;若未来换成无该能力的 Key,弹层降级为"暂不可用",角标与正文不受影响)。

---

## 4. ⚠️ 两个会挡演示的坑(不是本连接器的问题,但会毁掉演示)

### 坑 1:`Allstar智能助手` 绑定的模型凭据失效

**实测现象**:

```
用 Allstar智能助手 提问 →
{"response_type":"error","content":"LLM call failed: create chat completion stream:
 API request failed with status 401: Authentication Fails,
 Your api key: ****afca is invalid"}
```

**根因**:这是 WeKnora 服务器**内部调用上游大模型**时用的凭据过期了,**不是**调用方(小爱ai)的 API Key 问题 —— 调用方的 Key 一路畅通(建会话返回 201、提问返回 200)。

**影响**:用这个智能体演示会**直接失败**。

**精确定位**(实测对比两个 Agent 的 `model_id`):

| Agent | `model_id` | 状态 |
|---|---|---|
| `Allstar智能助手` / `allstar` | `e02567f3-2530-4763-bf85-69dd435368fe` | ❌ 凭据失效 |
| `智能推理`(builtin) | `7176a86f-e40e-4761-9aed-64e62af8a455` | ✅ 正常 |

**建议**:演示前修好前者绑定的模型凭据,或改用后者。

### 坑 2:引用角标的出现是**非确定的**,结构化引用数据在 agent 路径缺失(2026-10-20 修订)

> 2026-10-16 初版结论"agent 路径不产生引用角标"已被 2026-10-20 三轮实测**部分推翻**,现口径如下:

**现行事实**(Tencent/WeKnora v0.8.2 源码 + 公司实例三轮实测):

1. 回答正文里的 `<kb doc chunk_id kb_id/>` / `<web url title/>` 内联标签**会出现,但非确定**——是否引用由模型自行决定(系统提示词让模型写私有句柄 `<ref id="cN"/>`,服务端展开成标签)。实测:同一 agent 同样两连问,2026-10-19 真实会话出过 8 个标签,2026-10-20 三轮复现 0 个。**历史已存消息里的标签是永久的**。
2. SSE `references` 事件与消息持久化的 `knowledge_references`:**agent-chat 路径上始终缺失**(447 事件实测 + 三轮复现一致;v0.8.2 源码里该事件只挂在 knowledge-chat 管道)。引用数据只能取自标签自身属性。
3. chunk 原文反查 `GET /api/v1/chunks/by-id/{chunk_id}` 可用(需 `retrieve` 能力,现有租户 Key 具备)。

**桌面端已按此口径适配**(2026-10-20,REQ-0021):标签渲染为可点击角标(悬停看文档名,点击经 chunks/by-id 弹只读原文卡片,失败降级);思考区/流式期间剥除标签;解析不了的标签按纯过滤剥除(fail-open)。WeKnora 侧零改动。

---

## 5. 本地验证

```bash
# 依赖已装、工作区已构建。从零开始需要:
bun install
bunx turbo run build --filter='./packages/*'
bunx turbo run build --filter='@vetta/cli-host'
bunx turbo run build --filter='@vetta-org/*'

# 跑测试(必须显式带 --config,否则会用根配置报出假错误)
bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts \
    src/main/weknora src/main/ipc/weknora src/renderer/domains/weknora

# 启动开发版
cd apps/desktop && bun run dev
```

**⚠️ 改过 main/preload 之后做实机验证,必须完整退出再 `bun run dev`,刷新页面无效** —— main/preload 只在启动时构建,旧实例上会出现 `deleteSession is not a function` 之类的**假故障**(新 IPC 合同不在旧 bundle 里)。

**已知基线失败**(与本次改动无关):`src/main/ipc/browser-view.test.ts`
原因:`src/main/window-manager.ts` 在模块加载时读 `process.resourcesPath`,而测试用的 electron stub 未提供该属性。

---

## 6. Windows 环境踩坑记录

在一台干净的 Windows 机器上从零 clone 会撞到这三个坑(本次已解决,**新机器上会重现**):

| 坑 | 症状 | 解法 |
|---|---|---|
| Windows 长路径关闭 | `bun install` 报 `ENOENT: failed to link package ... (copyfile)` | 管理员执行 `reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f` |
| 原生模块编译缺工具链 | `fetch-mcp-servers` 报 `gyp ERR! find VS` | `npm_config_ignore_scripts=true`(该原生模块随后会被垫片替换,编译是白做的) |
| huggingface 不可达 | `prepare:speech-models` 连接超时 | `VETTA_SPEECH_INPUT_ENABLED=false` |
