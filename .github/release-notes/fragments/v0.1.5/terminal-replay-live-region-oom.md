## 修复

- 修复长任务中渲染进程内存持续增长直至崩溃（Chromium 报 oom）的问题：AI 命令回放面板此前使用 role="log"（隐式 aria-live），live region 会为无障碍通知保留内容历史，命令流高频更新时该缓存单调增长。改为普通 region，保留可访问名称。
