#!/bin/bash
# 正确性检查：theme-ui 全量测试 + desktop conversation 全域测试（走仓库 Node runner）。
set -euo pipefail
cd "$(dirname "$0")/.."
cd packages/theme-ui
"/mnt/c/Program Files/nodejs/node.exe" ../../scripts/quality/run-vitest.mjs --run 2>&1 | tail -25
cd ../../apps/desktop
"/mnt/c/Program Files/nodejs/node.exe" ../../scripts/quality/run-vitest.mjs --run src/renderer/domains/conversation 2>&1 | tail -25
