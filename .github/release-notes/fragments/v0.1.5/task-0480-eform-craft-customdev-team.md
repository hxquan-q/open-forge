## 改进

- 电子表单工坊升级为面向 AIMES CustomDev 二开的主控、需求（原型）、开发、测试、dev 测试部署五角色团队，保留 `@eform` 入口。19 份共享 Skills 按需求条件调用，区分原型与工程实现、Workshop 参考与 CustomDev 合同；电子签、操作审计和状态流转不再默认沿用静态演示。当前部署范围仅限测试服务器，不包含生产。
- 旧 `@esign`、`@eaudit` 专员及五份静态演示 Skills 不再提供；用户自建 Team/配置中的旧引用需改绑到新角色或对应领域 Skill。四个新成员使用 `@eform-requirements`、`@eform-developer`、`@eform-tester`、`@eform-deployer`，避免与其他内置 Agent 短名混淆；既有演示产物不会自动转换或删除。
