---
id: VERIFY-0005
type: verification
status: approved
owner: release/compliance
task: TASK-0066
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 首发第三方组件许可证清单（草案，待用户终审）

对照 `apps/desktop/scripts/prepare-pack.js` / `desktop-packaging-layout.mjs` /
`fetch-vendor-runtimes.mjs` / `fetch-speech-models.mjs` 实际打进发行物的
extraResources 与 staged node_modules 枚举。许可证字段来自各包
`package.json`/上游项目声明；本清单为合规草稿，未经外部法务审核。

## A. 独立分发的第三方二进制 / 模型（NOTICE 需逐项列名）

| 组件 | 形态 | 平台 | 许可证 | NOTICE 现状 |
| --- | --- | --- | --- | --- |
| Codex CLI `codex-windows-sandbox-host.exe` | 沙箱宿主二进制，`sandbox/bin` | Windows | Apache-2.0 | ✅ 已收录 |
| bubblewrap `bwrap` | 沙箱后端二进制，`sandbox/linux/<arch>` | Linux | LGPL-2.0-or-later | ✅ 已收录（含源码可得声明） |
| PP-OCRv5 权重（det/rec/dict） | OCR 模型，经 `@ocr-web/models-ppocrv5` 进 ocr-runner | 全平台 | Apache-2.0（npm 包壳 MIT） | ✅ 已收录（归属 PaddleOCR） |
| python-build-standalone CPython 3.13.12 | `vendor/python` 归档 | 全平台 | PSF License + 构建工具链许可证 | ✅ 已收录 |
| Node.js 22.22.2 运行时 | `vendor/node` 归档 | 全平台 | MIT | ✅ 已收录 |
| **Sherpa-ONNX 流式 zipformer 模型**（`sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`，encoder/decoder/joiner/tokens） | `speech-models/` extraResource | Windows（语音输入开启时） | Apache-2.0（k2-fsa/sherpa-onnx，HuggingFace csukuangfj 分发） | ❌ **缺失** |
| **sherpa-onnx-win-x64 1.13.5 原生库** | staged node_modules（external 原生模块） | Windows | Apache-2.0 | ❌ **缺失** |

## B. 随 app.asar 分发的 npm 依赖（自带 LICENSE 文件随包）

| 组件 | 许可证 | 说明 |
| --- | --- | --- |
| @lydell/node-pty + 各平台 `node-pty-*` 二进制包 1.0.2 | MIT | 终端 PTY，asarUnpack |
| @silvia-odwyer/photon-node 0.3.4 | Apache-2.0 | 图片缩放 WASM |
| uiohook-napi 1.5.5 | MIT | 全局输入钩子 |
| electron-liquid-glass 1.1.1 | MIT | macOS 液态玻璃（仅 darwin） |
| onnxruntime-web 1.26.0 | MIT | OCR 推理运行时 |
| 其余生产依赖（Electron/React/Vite/Jotai/TanStack/Biome 等） | 各自许可证 | NOTICE 尾部兜底段已声明「licenses distributed with respective packages under node_modules」 |

## C. 源码衍生 / 未随包分发

| 组件 | 关系 | NOTICE 现状 |
| --- | --- | --- |
| Open Vetta（上游本体） | fork 基线 | ✅ 顶部归属段 |
| pi-mono | `ai`/`agent`/`coding-agent`/`ecosystem-adapter` 衍生源 | ✅ 含 MIT 全文 |
| Cowart | 插件源码改编，`externals/` 仅源码示例、不打入发行物 | ✅ 已注明不分发 |

## 建议的 NOTICE 增补（待批准）

在 THIRD-PARTY SOFTWARE 段追加两节：

```text
--------------------------------------------------------------------------------
Sherpa-ONNX
--------------------------------------------------------------------------------
Copyright (c) k2-fsa / sherpa-onnx contributors
Source:  https://github.com/k2-fsa/sherpa-onnx
License: Apache-2.0

The `sherpa-onnx-win-x64` native library is distributed with the Windows
build for on-device speech input, and the streaming Zipformer Chinese
speech model (`sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`,
via HuggingFace csukuangfj) is bundled under `speech-models/` when speech
input is enabled.

Licensed under the Apache License, Version 2.0. See LICENSE for the full text.
```

B 组依赖依赖各自 `LICENSE` 随包分发 + NOTICE 兜底段，不逐项展开（与现行做法一致）。

## 终审结论（用户批准，2026-09-23）

1. Sherpa-ONNX 增补**批准入库**，按终审修订稿写入 NOTICE（模型与原生库同段、注明「仅 Windows 且启用语音输入时打入」、模型标注 HuggingFace csukuangfj 分发与 k2-fsa/icefall 生态来源）。
2. B 组接受「随包 LICENSE + NOTICE 兜底段」粒度，不逐项列名；本表留存作为下次新增原生模块时的 diff 基线。
3. 无外部法务审核；内部 release/compliance 终审为首发合规生效依据，批准记录写入 TASK-0066。
4. 版本钉死说明：A 组版本（Node 22.22.2、CPython 3.13.12、sherpa-onnx-win-x64 1.13.5、zipformer 模型 id）与 `fetch-vendor-runtimes.mjs`/`model-manifest.json` 锁定值一致；脚本升级版本时须同步 NOTICE 与本清单。
5. 非阻塞确认项：bubblewrap 的 LGPL 源码可得声明已含上游 URL；python-build-standalone 内嵌第三方许可证按其发行说明兜底表述可接受；onnxruntime-web 为 WASM 版，Windows 语音路径的原生 ORT 由 sherpa-onnx-win-x64 覆盖并已列名。
