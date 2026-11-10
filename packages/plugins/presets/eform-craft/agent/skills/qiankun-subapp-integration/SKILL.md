---
name: qiankun-subapp-integration
description: "处理 qiankun 子应用注册、路由、资源加载或测试部署接入时调用。先核实当前项目 name/entry/activeRule/base，不把 Workshop 或历史 CustomDev 参数当作固定环境配置。"
---
<!-- Copyright The Open Forge contributors. -->

# qiankun 子应用接入

参数观察集中在 [项目架构与事实](../project-architecture-and-runtime-map/SKILL.md)，本 Skill 只维护接入检查方法，不复制一份配置表。

## 各配置职责

- 菜单路由只负责宿主导航；还须核对主应用 qiankun 的 name、entry、activeRule 注册。
- entry 是子应用 HTML 入口，不是宿主业务路由；静态目录与生产 base 对应。
- 子路由托管时按当前宿主路由前缀配置，检查直达/刷新和导航；请求代理区分网关与本地后端。
- 前后端端口、app name、API prefix、base 都是项目/环境参数，两个项目间不可复制。

## 验收

入口 HTML、JS/CSS 路径、MIME/CORS、代理和缓存逐项检查；宿主菜单可选中不代表子应用挂载成功。先看 Network/Console，区分路由命中、HTML 拉取、资源和挂载/接口错误，避免把所有问题归因后端。

Workshop 的配置仅标准模块参考，CustomDev 的实际注册名与 VITE_MICRO_APP_NAME 是否为同一值必须分别核实。未知宿主/服务器信息保持待验证，不凭历史名字生成部署命令。

来源：`eformSkill/qiankun子应用接入`；Workshop 项目概览与 Practice Vite/env/router 参考，当前 CustomDev 配置观察来自用户提供的 2026-11-06 核实材料。
