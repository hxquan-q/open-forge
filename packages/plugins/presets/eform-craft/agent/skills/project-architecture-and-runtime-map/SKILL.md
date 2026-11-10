---
name: project-architecture-and-runtime-map
description: "定位 AIMES CustomDev 模块、核对运行假设或使用已核实基础资料关系时调用。集中区分目标事实、带日期测试证据与 Workshop/Practice 参考，端口/应用名不硬编码为当前环境。"
---
<!-- Copyright The Open Forge contributors. -->

# 项目架构与事实地图

目标路径由当前会话 Runtime 提供，绝不从参考材料中的本机路径推定。以下是来源观察，实施时与当前代码/环境核对；与用户决定或新证据冲突则停止受影响部分并报告。

## CustomDev 本地结构

- Maven 聚合 common/api/server，Web UI 在 web-ui；后端 Spring Boot/MyBatis Plus，API 前缀 `/api/custom-dev/**`。
- 前端 Vue 3、Vite、Element Plus、Pinia、Vue Router、qiankun；本地模板观察有 LazyRemoteSelect，具体使用见对应 Skill。
- 服务名历史观察 `custom-dev-server`、端口 16111、profile dev；Nacos 地址与导入/Data ID 来自 bootstrap.yml。它们不是未来会话的固定值或连接授权，不在 Skill 保存服务器地址/凭据。

## 已核实基础资料关系

以下来自工作区 `eform/CustomDev测试环境核实-2026-11-06.md` 的获准只读 Schema/关系证据，本次 preset 改造未重连数据库。复用此证据，不从 Workshop/Practice 猜测；实际新字段关系与 API/DTO/列映射仍在实施时确认。

| 原始标记/用途 | 已核实目标表 | 编码/名称列或关系 |
|---|---|---|
| 组织 | `t_base_organization` | organization_code / organization_name；parent_id 树形 |
| 部门 | `t_base_workshop` | 部门车间表；t_base_personnel.department_id 关联它；编码/名称列待验证 |
| 品名 | `t_base_material` | material_code / material_name |
| 工序 | `t_base_process` | process_code / process_name |
| 人员 | `t_base_personnel` | personnel_code / personnel_name；user_id 关联 t_sys_user.id |
| 登录用户 | `t_sys_user` | username / real_name；与人员基础资料不是同一对象 |

编码/名称各有表前缀，不是通用 code/name。表存在只是证据一部分，须确认目标字段实际关联；统一类型/classXxx 规则仅在 [字段规格](../form-field-specification-and-base-data/SKILL.md) 定义，不在这里预置类型名。

## 单据与日志参考

2026-11-06 测试库证据显示：

- t_qms_inspection_bill 有 approve_status（创建/审核中/重新审核/已审核）与 status（完成状态）等模型，实际存在“重新审核”回退，不能据旧 Demo 限为单向终态。
- 存在 t_sys_wf_definition/instance/user_task/operation_log 等平台工作流表；有审批需求时先评估复用，具体单据状态/权限不是已确认通用合同。
- t_qms_inspection_bill_item 通过 original_bill_id 关联主表，不能假设所有头/体都叫 header_id/bill_id。流水表先例有 t_business_no_sequence、t_sys_biz_seq_no，单号生成须核实实际服务/规则而非客户端造序列。
- 流程操作日志、集成请求日志、审批表存在服务端追加式先例；未证明普通 CRUD 有统一审计平台，不能由此自行扩大本表单需求。

## 前端接入观察

2026-11-06 核实材料记录 CustomDev 前端开发端口 9111、生产 base `/custom-dev`、宿主路径 `/home/custom-dev`；代理 @server 走网关、@local 走本地后端。前端 VITE_MICRO_APP_NAME 值为 `custom-dev`，与 qiankun 注册名不是已经证明等同的字段。

旧 eformSkill/Practice 材料记录 qiankun 名 `mes-custom-dev-app`、base `/custom-dev/`。保留为历史线索：当前主应用实际 name/entry/activeRule、尾斜杠语义及环境值需分别验证，不能将两种 app-name 来源自行合并裁决或直接写进部署配置。

## Workshop（标准模块，非二开目标）

历史结构：CrudService/CrudServiceImpl CRUD 基座；前端 Vue/Vite/Element Plus/Pinia 的 qiankun 子应用。API `/api/workshop/**`，基础代理 `/api/**`；曾记录 qiankun 名 mes-workshop-app、宿主 /home/workshop、静态 base /workshop/、前端端口 9524、本地后端 16104。Nacos 配置由 profile/Data ID 决定，不在本地 resources 完整保存。这些仅 Workshop 参考，不得当作 CustomDev 参数或写域。

## 事实所有权与待验证

- creator/modifier 仅 [用户元数据](../user-metadata-and-audit-boundary/SKILL.md) 为权威；逻辑删除单位仅 [数据库变更](../database-change-control/SKILL.md)；制品/构建仅 [构建回滚](../build-release-and-rollback/SKILL.md)。不复制这些合同。
- Codeup 精确流水线命令/保护规则、测试服务器目录/JDK/启动/停止/配置加载/回滚仍待验证。
- 新业务表的 API/DTO/组件、组织头可信来源和实际授权、具体单据状态/电子签服务/表单审计接入仍须按当次目标核实。历史只读测试证据不是运行授权。

来源：现有 `eformSkill/项目结构与运行环境`、其他 Skills 中重复的参数观察及用户提供的 2026-11-06 测试环境证据；这里只收敛非敏感事实，不内置连接信息。
