<!-- Copyright The Open Forge contributors. -->
## 修复

- 修复 agentTeam 团队会话无法使用 computer-use 授权的问题：授权页看不到可授权的团队会话、即便授权也只对单 Agent 会话生效。现在团队会话在会话语境中打开 computer-use 页即可授权给整个团队，团队内任何成员与协调 Agent 的 computer_observe / computer_click 等调用都会放行（授权主体是团队会话，不再要求调用方恰好是授权的那个会话）。单主体互斥与未知调用方一律拒绝的授权模型不变；换员或恢复导致成员 runtime 会话标识漂移时授权仍保持有效。已知限制：授权给团队后，单 Agent 会话需先停止团队授权才能接管（与既有互斥规则一致）。
