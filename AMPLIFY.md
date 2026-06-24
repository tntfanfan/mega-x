# AWS Amplify Hosting 部署指南

mega-x 是一个统一 Vite 项目（marketing MPA + Phyntom X8 Console SPA），通过 Amplify 一键部署。

## 一次性配置

### 1. 在 AWS Console 创建 App

1. AWS Console → Amplify → Host web app
2. Connect repository → GitHub → 选择 `mega-x` 仓库
3. Branch: `main`
4. Build settings：Amplify 自动检测到本仓库根的 [amplify.yml](amplify.yml)，确认无误
5. **不要**勾 "Backend environment"（我们没用 Amplify Backend）

### 2. 配 SPA Rewrite 规则 ★ 必须

不配这条规则，刷新 `/console/business/c/c-saas/` 会 404。

**App settings → Rewrites and redirects → Edit → Add rule**：

| Source address | Target address | Type |
|---|---|---|
| `</^\/console\/.*$/>` | `/console/index.html` | `200 (Rewrite)` |

正则表示：任何以 `/console/` 开头的路径都返回 console 的 SPA shell，React Router 在客户端接管。

### 3. 自定义域名（可选）

App settings → Domain management → Add domain → `mega-x.ai`

Amplify 会自动配 ACM 证书 + CloudFront。

## 每次部署

```bash
git push origin main
```

Amplify webhook 触发 → `npm ci` → `npm run build` → 上传 dist/ → CDN 失效 → 几分钟内全球生效。

## 本地复现构建

```bash
cd frontend/mega-x
npm ci          # 严格按 package-lock.json 装
npm run build   # 等价于 vite build
ls dist/        # 看产物（marketing pages + console SPA + i18n zh/ 副本）
```

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| Amplify build 失败 | `npm ci` 找不到 `package-lock.json` | 仓库根必须 commit `package-lock.json`（pnpm-lock.yaml 也提交但 npm 不读） |
| build 成功但页面空白 | 资产路径错（`/assets/...` 找不到） | 检查 vite.config.ts `base` 设置；本地 build 后用 `npx serve dist` 验证 |
| 营销页面看到 `{{partial:nav}}` 字符串 | partials 插件没跑 | 不可能从 vite 漏过；如果发生说明 build 用了错的工具链 |
| 直接访问 /console/business/c/xxx/ 返回 404 | SPA rewrite 规则没配 | 见上 §2 |
| Console 加载但报 fetch /v1/* 错误 | mock 模式没开 | `.env.production` 设 `VITE_USE_MOCK=true`；后端就绪后改 `false` 并配 API 反代 |

## 与 nginx self-host 等价

如果将来从 Amplify 迁到自管 nginx，等价配置：

```nginx
server {
  server_name mega-x.ai;
  root /var/www/mega-x/dist;

  # SPA fallback for console
  location /console/ {
    try_files $uri $uri/ /console/index.html;
  }

  # API proxy
  location /v1/   { proxy_pass http://127.0.0.1:8001; }
  location /health { proxy_pass http://127.0.0.1:8001; }

  # Marketing static + cache
  location / {
    try_files $uri $uri/ =404;
    expires 1h;
  }
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```
