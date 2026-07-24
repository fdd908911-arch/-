# 洄·Maneo信箱

一个支持本地自定义聊天背景的 Telegram 风格对话页原型。

## 功能

- Chat 只保留 Volo、群聊和终端三个入口
- Chat 侧栏按 New chat、对话、工具与外观分区，移动端可从任意页面一步打开
- 点开开场页的 Chat 卡后，会先进入由 Volo、群聊和终端三张分块组成的 Chat 首页
- Volo 采用暖白极简 AI 对话界面，群聊保留 Telegram 风格，终端暂留为空白页
- 开场页显示“在一起几天”，开始日期可在本机设置并自动更新
- 开场页采用低饱和水玻璃与私人刊物式排版，加入杂志编号和编辑寄语
- “在一起”默认从 2026.7.4 计算，旁边可记录每天的天气、温度和想说的话
- 开场页提供 Chat、Diary、Memory、Volo 状态与世界入口，其余区域留待后续扩展
- 开场页提供“Volo 状态”入口，并建立独立的空白预留页
- “世界”拥有独立入口与空白预留页，后续可继续添加内容
- Diary 可按日期记录天气、温度和 2000 字正文，支持手写、宋体、简洁三种本地字体并自动保存
- Memory 独立页面已建立，目前保留为空白内容区
- 桌面端与移动端响应式布局
- Chat 外观设置只保留照片背景，不再提供预设配色主题
- 上传 JPG、PNG、WebP 或 GIF 作为背景，Volo 页可从顶部直接更换
- Volo 的 user 消息采用轻透明水玻璃气泡，可透出背景照片
- 背景遮罩与模糊程度调节
- 自定义背景通过 IndexedDB 保存在当前浏览器，不上传服务器
- 会话切换、搜索、消息发送、表情插入和模拟回复
- 首页、Chat、Diary、Memory、Volo 状态与世界页共用 Clawd Tank 像素螃蟹，内置 30 种动作，可拖动、点击轮播并分别记住位置
- 螃蟹会根据输入、等待回复、收到消息、搜索、上传背景、离线与闲置自动切换动作
- 键盘操作：Enter 发送、Shift + Enter 换行、Ctrl/Cmd + K 搜索

## 运行

直接打开 index.html 进入开场页，点击“Chat”进入 chat.html，点击“今天想说的话”进入 diary.html，点击“Memory”进入 memory.html，点击“世界”进入 world.html；也可以在本目录启动任意静态文件服务器。

例如使用 VS Code 的 Live Server 扩展即可预览。项目没有第三方运行依赖，也适合直接部署到 GitHub Pages。

## PWA 安装

站点已包含 `manifest.webmanifest`、离线应用壳、192/512 图标和自动更新提示。
安卓 Chrome 打开部署后的 HTTPS 地址后，可以点击首页右上角的安装图标，或使用浏览器菜单中的
“安装应用”。安装后会以独立窗口启动。

Service Worker 只能在 HTTPS 或 `localhost` 下启用，直接双击 HTML 文件不会进入 PWA 模式。
本机验证可运行：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080/`。GitHub Pages 原生提供 HTTPS，并支持当前项目使用的相对
`start_url` 和 Service Worker scope。PWA 只缓存静态界面资源；`/sessions`、`/chat/*`、
`/tmux/*` 等实时后端请求始终走网络，不会缓存会话数据或 Token。

## 连接 Cc 多窗口后端

Chat 页面已接入真实的 tmux/Claude 会话：

- Volo 侧栏从 `GET /sessions` 读取窗口；
- 切换窗口后，聊天历史、草稿、轮询游标和 typing 状态彼此独立；
- New chat 调用 `POST /sessions/create`，会真实创建新的 tmux session；
- 终端页使用 `/tmux/capture` 和 `/tmux/send`；
- 压缩上下文、停止窗口和重启 shell-only 窗口都只作用于当前 session。

打开 `chat.html#volo`，在左侧会话抽屉底部点击“服务器连接”，填写后端地址和
`X-Auth-Token`。地址和 Token 只保存在当前浏览器的 localStorage，不会写入仓库。

若前端和后端不是同一个 Origin，需要在后端 `config.toml` 中加入前端的完整 Origin：

```toml
[server]
strict_auth = true
allow_remote_control = true
allowed_origins = [
  "https://your-name.github.io",
  "http://127.0.0.1:8080",
]
```

生产环境应通过 Tailscale/ZeroTier 或 HTTPS 反向代理访问。不要把 Token 写进 JavaScript、
GitHub Pages 配置或仓库文件。


## Volo 的两种载体

配置了 CcCompanion 的 `[kiwi]` 后，Volo 会话抽屉会在真实 Claude Code/tmux 窗口之前显示
“Volo · 陪我聊聊”：

- “陪我聊聊”是 Gateway 虚拟会话，只显示聊天气泡，不进入终端；
- 真实 Claude Code 窗口、New chat、停止/启动窗口和终端入口保持原样；
- 两种载体都使用同一个 Kiwi 长期记忆库，但各自保留独立会话历史；
- Gateway 可使用服务端配置的只读 Volo Tools MCP，浏览器不会拿到 Kiwi 地址或 MCP 凭据。


## 第三方素材

像素螃蟹动画来自 [marciogranzotto/clawd-tank](https://github.com/marciogranzotto/clawd-tank)，按 MIT License 使用。许可和署名详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

