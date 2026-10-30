## 其他

- GitHub → 云效 Codeup 单向同步改为 GitHub Actions 定时任务（公开仓库标准 runner；默认分支每 5 分钟、`main` push 与手动触发），复用已测试的 `scripts/ci/codeup-sync.mjs` 全量快进推送分支与标签，拒绝覆盖、删除与同名标签冲突；云效流水线只保留 Codeup 构建与测试，且不接触同步写凭据。云效北京公共集群到 github.com 的连接不稳定，同步因此不依赖其出网；同步写凭据分别存于 GitHub Actions secret 与云效变量组（TASK-0404）。
