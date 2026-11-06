---
name: lombok-annotation-processor-diagnosis
description: "仅 IntelliJ 或 Maven 出现 Lombok getter/setter 缺失、处理器路径异常等症状时调用。对照实际命令与 IDE profile，先区分处理器、JDK 与业务源码问题。"
---
<!-- Copyright The Open Forge contributors. -->

# IDEA / Lombok 注解处理器诊断

1. 源码是否确有 Data/Getter/Setter，字段声明与访问级别是否正确。
2. 比较 IDE 与命令行结果，使用最窄 Maven 编译目标（例如 `-pl common compile`，实际以当前 reactor 为准）区分是否仅 IDEA。
3. 看当前模块对应的 Annotation Processor profile，不仅看“启用”，还核对 classpath/processor path 来源。
4. 核对父 POM compiler plugin 的 annotationProcessorPaths 与明确版本。旧 CustomDev 模板曾因 Lombok/MapStruct 缺版本使 IDEA 生成 unknown JAR 路径；Workshop 曾显式用 `${lombok.version}`，这些是诊断线索，不是当前项目仍有同病的结论。
5. .idea/compiler.xml 是通常忽略的本机配置，Maven 重载可能重建；不要把改 .idea 当成全体开发者的持久修复，也不未经授权修改用户环境。
6. POM source/target 与实际 JDK 匹配；区分处理器错误与 invalid target/release。

先收具体命令和脱敏输出，再决定是否需改 POM，不为 IDEA 单机设置改业务源码。验证修复既能命令行编译，也不会依赖偶然的 IDE 缓存；无法运行的部分如实说明。

来源：`eformSkill/IDEA与Lombok处理器诊断`；CustomDev/Workshop POM 历史观察，需按当前文件复核。
