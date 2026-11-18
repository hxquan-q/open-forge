---
name: integration-debugging
description: "编译通过但运行、网关、API 或 qiankun 宿主流程异常时调用。沿浏览器→资源→网关→服务→配置/数据源建立最小复现，脱敏取证；外部访问仍按 Agent 操作合同授权。"
---
<!-- Copyright The Open Forge contributors. -->

# 联调与故障定位

- 先建立可复现用户症状的最窄路径，拆分浏览器路由、子应用 HTML/静态资源、网关/API、服务、Nacos、DB/Redis，不以静态 Demo 的可开页面证明联调成功。
- Workshop/CustomDev 的 Result 可能 HTTP 200 携业务 code/msg，需检查响应体，不只看 HTTP 状态。
- 开发代理区分 @server 网关与 @local 本机；环境/Vite 配置修改后的生效需要按目标启动流程重启前端。
- 子应用菜单可选不代表成功加载；按 [qiankun 接入](../qiankun-subapp-integration/SKILL.md) 看 name/entry/activeRule、资源路径、MIME/CORS、Console/Network。
- Nacos Data ID 按实际 profile、application name、import 规则核实 namespace/group/地址，不能假定每项都存在；环境读取/失败处理以 Agent 共享操作合同为准。
- 数据库错误核实实际 Schema/table，不靠猜配置；结构回查只读，DDL/写数据是另一个授权范围。核验所需范围最小，不采集无关业务数据。
- 输出命令/异常/日志先脱敏密码、token、AES/JWT keys 与用户业务数据，不能把完整配置粘贴到报告。

记录复现输入、实际版本/环境、假设与证据、最小改动、回归与剩余未知；工具/网络失败不等于业务缺陷，失败原因不清时不要循环试同一命令。

来源：`eformSkill/联调与故障定位`；Workshop 概览与 CustomDev 配置/异常处理/代理观察。配置参数集中于 [项目事实](../project-architecture-and-runtime-map/SKILL.md)，不在此另建快照。
