# AWS Amplify Hosting 部署指南

mega-x 是一个统一 Vite 项目（marketing MPA + Phyntom X8 Console SPA），通过 Amplify 一键部署。

## 一次性配置

### 在 AWS Console 创建 App

1. AWS Console → Amplify → Host web app
2. Connect repository → GitHub → 选择 `mega-x` 仓库
3. Branch: `main`
4. Build settings：Amplify 自动检测到本仓库根的 [amplify.yml](amplify.yml)，确认无误
5. **不要**勾 "Backend environment"（我们没用 Amplify Backend）

### 自定义域名（可选）

App settings → Domain management → Add domain → `mega-x.ai`

Amplify 会自动配 ACM 证书 + CloudFront。

## ★ 不需要配 SPA Rewrite 规则

Console 用 [HashRouter](console/src/main.tsx)，所有 SPA 路由都在 URL `#` 之后，**服务器永远只收到 `/console/`**，对应真实文件 `console/index.html`。任何路径刷新都不会 404，与 Amplify rewrite 配置无关。

代价：URL 形如 `mega-x.ai/console/#/business/c/c-saas/`（中间多个 `#/`）。对内部 SaaS Console 完全可接受。

## 不用 customHttp.yml

Amplify Gen 1 的 customHttp.yml 在 monorepo `appRoot: .` 配置下解析有 bug（无论 flat / applications 形式都会报 `Monorepo spec provided without "applications" key`，且无法保存 headers）。

但**没必要纠结**：
- vite build 产物（CSS/JS）已自带 content hash 文件名（如 `console-CqND220k.js`），文件名一变 CDN/浏览器自动重拉，无需手动 cache-control
- HTML 文件 Amplify CDN 默认 5 min TTL，足够日常迭代
- 想精细控制 cache，可后期切到 CloudFront 自管 distribution

## 每次部署

```bash
git push origin main
```

Amplify webhook 触发 → `npm install -g pnpm@9.0.0` → `pnpm install --frozen-lockfile` → `pnpm build` → 上传 dist/ → CDN 失效 → 几分钟内全球生效。

## 本地复现构建

```bash
cd frontend/mega-x
corepack pnpm install --frozen-lockfile     # 等价于 Amplify 步骤
corepack pnpm build                          # 等价于 vite build
ls dist/                                     # 看产物
```

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| Amplify build 卡在 `corepack prepare` | corepack 签名校验在 Amplify 网络下超时 | amplify.yml 已绕开，直接 `npm install -g pnpm` |
| `pnpm install --frozen-lockfile` 失败 | `pnpm-lock.yaml` 跟 `package.json` 不同步 | 本地 `corepack pnpm install` 重新生成 lockfile，commit + push |
| build 成功但 console 页面空白 | console/src/main.tsx 还在用 BrowserRouter | 应为 HashRouter（v2 已切） |
| 营销页面看到 `{{t:key}}` 字符串 | mega-x-partials 插件没跑 | 检查 vite.config.ts 是否 import 了该插件 |
| Console 加载但报 fetch /v1/* 错误 | mock 模式没开 | `.env.production` 应有 `VITE_USE_MOCK=true` |

## 与 nginx self-host 等价

未来从 Amplify 迁到自管 nginx：

```nginx
server {
  server_name mega-x.ai;
  root /var/www/mega-x/dist;

  # Marketing static
  location / {
    try_files $uri $uri/ =404;
    expires 1h;
  }

  # Long-cache hashed assets
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API proxy（如果未来后端也部署）
  location /v1/   { proxy_pass http://127.0.0.1:8001; }
  location /health { proxy_pass http://127.0.0.1:8001; }

  # Console SPA — HashRouter 无需 try_files fallback；
  # /console/ 直接服务 index.html 即可
}
```
