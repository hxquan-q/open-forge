<!-- Copyright The Open Forge contributors. -->
## 改进

- 纯文本模型的图片省略提示从"仅告知省略"升级为"给出下一步"：历史消息或工具结果中的图片因模型不支持图像输入被省略时，提示文案现在直接指引改用 `extract_text_from_img` 按文件路径提取文字，减少模型在图片上的无效尝试轮次。
