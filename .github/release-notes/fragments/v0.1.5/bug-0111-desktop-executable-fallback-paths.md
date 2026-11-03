## 修复

- 修复 PDF / OCR 命令在缺少显式 `VETTA_DESKTOP_EXE` 与 `vettaAppPath` 时，兜底仍查找旧 Vetta 目录/可执行名的问题。当前候选路径与 Windows、macOS、Linux 打包身份一致，并覆盖两种支持的品牌显示名。