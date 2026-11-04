## 改进

- 侧边栏浏览器支持直接打开本地文件：地址栏粘贴本地路径（如 D:\demo\index.html 或 /home/x/index.html）自动转为 file:// 地址加载，无需先起本地静态服务；内嵌浏览器的自动化导航（browser_tab）同步放行 file://，本地 HTML 预览不再依赖 http 服务。权限面与全权限模式的 bash 等价（webview 隔离会话、webSecurity 默认开启），其余协议仍在白名单外。
