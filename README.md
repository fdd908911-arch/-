# 岛屿信箱

一个支持本地自定义聊天背景的 Telegram 风格对话页原型。

## 功能

- Chat 只保留 Volo、群聊和终端三个入口
- Chat 侧栏按 New chat、对话、工具与外观分区，移动端可从任意页面一步打开
- 点开开场页的 Chat 卡后，会先进入由 Volo、群聊和终端三张分块组成的 Chat 首页
- Volo 采用暖白极简 AI 对话界面，群聊保留 Telegram 风格，终端暂留为空白页
- 开场页显示“在一起几天”，开始日期可在本机设置并自动更新
- “在一起”默认从 2026.7.4 计算，旁边可记录每天的天气、温度和想说的话
- 开场页提供 Chat、Diary、Memory 与 Volo 状态入口，其余区域留待后续扩展
- 开场页提供“Volo 状态”入口，并建立独立的空白预留页
- Diary 可按日期记录天气、温度和 2000 字正文，支持手写、宋体、简洁三种本地字体并自动保存
- Memory 独立页面已建立，目前保留为空白内容区
- 桌面端与移动端响应式布局
- 4 套参考莫兰迪色制作的全局配色主题
- 主题会同步改变界面、按钮、消息气泡与默认聊天背景
- 上传 JPG、PNG、WebP 或 GIF 作为背景
- 背景遮罩与模糊程度调节
- 自定义背景通过 IndexedDB 保存在当前浏览器，不上传服务器
- 会话切换、搜索、消息发送、表情插入和模拟回复
- 首页、Chat、Diary 与 Memory 共用 Clawd Tank 像素螃蟹，内置 30 种动作，可拖动、点击轮播并分别记住位置
- 螃蟹会根据输入、等待回复、收到消息、搜索、换主题、上传背景、离线与闲置自动切换动作
- 键盘操作：Enter 发送、Shift + Enter 换行、Ctrl/Cmd + K 搜索

## 运行

直接打开 index.html 进入开场页，点击“Chat”进入 chat.html，点击“今天想说的话”进入 diary.html，点击“Memory”进入 memory.html；也可以在本目录启动任意静态文件服务器。

例如使用 VS Code 的 Live Server 扩展即可预览。项目没有第三方运行依赖，也适合直接部署到 GitHub Pages。

## 第三方素材

像素螃蟹动画来自 [marciogranzotto/clawd-tank](https://github.com/marciogranzotto/clawd-tank)，按 MIT License 使用。许可和署名详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

