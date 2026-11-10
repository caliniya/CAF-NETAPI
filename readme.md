# CAF NETAPI

CAF 的网络 API，部署在 Cloudflare Pages。静态页面在 `public/`，`public/_worker.js` 使用 Pages advanced mode 处理 `/api/*`；新增网络 API 时在 Worker 的路由表中注册。

## 部署到 Cloudflare Pages

推荐连接本 GitHub 仓库：

1. 在 Cloudflare 的 Workers & Pages 中创建 Pages 项目，连接 `caliniya/CAF-NETAPI`，生产分支选 `main`。
2. 框架预设选 **None**，构建命令留空，输出目录填写 **public**，根目录使用仓库根目录。
3. 部署完成后访问 `https://你的项目.pages.dev/api/time`，确认返回 JSON，而不是网页。

也可以上传本地文件：使用 Node.js 22 或更高版本，在本仓库中执行 `npm run deploy`，首次运行按 Wrangler 的提示安装工具、登录 Cloudflare。已有不同名称的 Pages 项目时执行 `npx wrangler pages deploy public --project-name=你的项目名`。

**包含 `_worker.js` 的目录请用 Wrangler 上传，或连接 Git 部署。Cloudflare 控制台的拖拽上传不编译 `_worker.js`，不能用这种方式部署此动态时间接口。** 不需要数据库或密钥。API 请求计入 Pages Functions / Workers 的额度；当前套餐额度以 [Cloudflare 官方说明](https://developers.cloudflare.com/pages/functions/pricing/) 为准。

## 时间接口

```http
GET /api/time?nonce=your-request-id
```

```json
{
  "schemaVersion": 1,
  "utc": "2026-11-10T08:30:00.123Z",
  "unixMs": 1794299400123,
  "source": "cloudflare",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "nonce": "your-request-id"
}
```

- `utc` 和 `unixMs` 来自同一次服务器 `Date.now()`；`unixMs` 是自 Unix epoch 起的毫秒数，UTC 字符串使用 ISO 8601。
- `requestId` 是服务器为本次取时生成的 UUID，也在 `X-Request-ID` 响应头中返回。
- `nonce` 可选，允许 1–128 位 ASCII 字母、数字、下划线和连字符，未传时返回 `null`。客户端每次生成新值并核对响应，可发现缓存或响应错配。
- 支持 `GET`、`HEAD`、`OPTIONS`，其他方法返回 `405`；非法 nonce 返回 `400`；未知 API 返回 JSON `404`。
- 所有 API 响应禁止浏览器及 CDN 缓存，允许跨域读取。

接口时间来自 Cloudflare 运行环境的系统时钟；毫秒字段表示数据分辨率，不承诺毫秒级绝对准确度，也不是签名时间戳。HTTPS 客户端仍应验证证书。

网页会在 4 秒取时失败后显示本机 UTC 时间，明确标注 `local` 来源及失败原因；恢复连接时重新取时。页面可见时每分钟重新同步，并使用 `performance.now()` 推进最近一次结果。往返耗时的一半仅用于估计网络补偿，原始 API 时间保持原值。

将来接入 CAF 时，Go 客户端需要自行实现超时和本机回退；服务器接口不会替客户端返回本机时间。持久化记忆建议保存原始时间、时间来源、请求标识和往返耗时，并用版本关系或序号保证顺序。

## 本地验证

```bash
npm test
npm run dev
```

测试只依赖 Node.js 内置工具，不需要安装依赖或联网。`dev` / `deploy` 使用 Wrangler，首次运行需要网络。打开 Wrangler 输出的本地地址即可预览页面和接口；本地 Wrangler 使用开发机器的时钟，正式 Cloudflare 部署才是 Cloudflare 服务器时间。

官方部署说明：[Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)、[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)。
