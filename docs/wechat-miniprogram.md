# DeepTutor 微信小程序接入指南

本文档给出把 DeepTutor 接到微信小程序的最小可运行方案：DeepTutor 作为后端服务运行，小程序通过 `wss://<域名>/api/v1/ws` 调用统一 WebSocket 接口。

## 1. 总体架构

```text
微信小程序页面
  └─ wx.connectSocket(wss://api.example.com/api/v1/ws?token=...)
       └─ HTTPS/WSS 域名与 TLS 证书
            └─ DeepTutor FastAPI 服务（deeptutor serve）
                 └─ ChatOrchestrator / Tools / Capabilities
```

小程序端不要直接调用模型供应商 API，也不要把 OpenAI、硅基流动、通义等密钥写进小程序代码。所有模型密钥应只放在 DeepTutor 后端的环境变量或服务端配置里。

## 2. 后端部署步骤

### 2.1 准备服务器

建议使用一台 Linux 云服务器或容器平台，并准备：

- Python 3.11 或更高版本；
- 一个已备案且可被微信小程序配置的 HTTPS 域名，例如 `api.example.com`；
- TLS 证书，小程序正式环境必须使用 `wss://`，不能使用裸 `ws://`；
- DeepTutor 需要的 LLM 配置，例如 `OPENAI_API_KEY` 或你的模型供应商配置。

### 2.2 安装 DeepTutor 服务端依赖

```bash
git clone <your-deeptutor-repo-url> DeepTutor
cd DeepTutor
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e ".[server]"
```

### 2.3 配置环境变量

最小开发配置可以先关闭多用户鉴权，方便小程序验证链路：

```bash
export AUTH_ENABLED=false
export OPENAI_API_KEY="sk-..."
```

生产环境建议开启 DeepTutor 鉴权，并由你自己的登录服务向小程序下发短期 token。小程序连接 WebSocket 时把 token 放在查询参数里：

```text
wss://api.example.com/api/v1/ws?token=<jwt-token>
```

### 2.4 启动 API 服务

```bash
deeptutor serve --host 0.0.0.0 --port 8001
```

本机快速检查：

```bash
curl http://127.0.0.1:8001/api/v1/system
```

### 2.5 配置反向代理

下面是 Nginx 示例。重点是保留 WebSocket 的 `Upgrade` 和 `Connection` 头。

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### 2.6 在微信公众平台配置域名

在「小程序管理后台 → 开发管理 → 开发设置 → 服务器域名」添加：

- `request 合法域名`：`https://api.example.com`
- `socket 合法域名`：`wss://api.example.com`

开发者工具调试时可以临时勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」，但真机和发布版必须配置合法域名。

## 3. DeepTutor WebSocket 消息格式

DeepTutor 的统一聊天入口是：

```text
/api/v1/ws
```

小程序发送一轮聊天：

```json
{
  "type": "message",
  "session_id": "wechat-demo-session",
  "content": "请用中文解释傅里叶变换",
  "capability": "chat",
  "tools": [],
  "knowledge_bases": [],
  "language": "zh-CN",
  "config": {}
}
```

常用字段：

| 字段 | 说明 |
| --- | --- |
| `type` | 发送新消息时用 `message` 或 `start_turn` |
| `session_id` | 会话 ID；同一个用户同一会话保持一致即可 |
| `content` | 用户输入 |
| `capability` | 默认 `chat`，也可以使用 `deep_solve`、`deep_question` |
| `tools` | 可选工具，例如 `rag`、`web_search`、`reason` |
| `knowledge_bases` | 可选知识库 ID 列表 |
| `language` | 建议中文小程序使用 `zh-CN` |
| `config` | 能力相关配置；普通聊天可以 `{}` |

服务端会流式返回事件。小程序通常需要处理：

| 返回 `type` | 处理方式 |
| --- | --- |
| `session` | 记录 `session_id`、`turn_id` |
| `stage_start` / `stage_end` / `thinking` / `progress` | 可显示「正在思考」「检索中」等状态 |
| `content` | 追加到当前 assistant 消息 |
| `result` / `done` | 一轮结束，可从 `metadata.turn_terminal` 判断终止 |
| `error` | 显示错误并结束加载状态 |

## 4. 小程序最小代码

仓库里提供了一个可复制的最小示例：`examples/wechat-miniprogram/`。

使用方法：

1. 用微信开发者工具新建小程序项目；
2. 把 `examples/wechat-miniprogram/` 目录下的文件复制到小程序项目根目录；
3. 修改 `app.js` 中的 `apiBaseUrl`、`wsBaseUrl`、`token`；
4. 在开发者工具里编译运行。

## 5. 生产建议

- **鉴权**：生产环境不要关闭 DeepTutor 鉴权。推荐小程序 `wx.login` 获取 `code`，由你的业务后端换取微信 `openid`，再签发 DeepTutor 可识别的 JWT 或换成你的网关鉴权。
- **会话隔离**：`session_id` 建议包含业务用户 ID 与会话 ID，例如 `wx_${openid}_${conversationId}`，避免不同用户共享上下文。
- **限流**：在 Nginx、API 网关或 DeepTutor 上游加入用户级限流，防止小程序被刷导致模型费用失控。
- **日志脱敏**：聊天内容可能包含学生隐私，生产日志不要打印完整输入、token、模型密钥。
- **模型密钥安全**：所有模型密钥只放在后端，绝不能放入小程序源码、云开发函数前端可见配置或代码包。
