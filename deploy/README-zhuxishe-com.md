# zhuxishe.com / api.zhuxishe.com 部署说明

本目录提供 `.com` 极简静态页与 `api.zhuxishe.com` 的 Nginx 反向代理模板。

## 目录

- `deploy/com-site/`
  - `index.html`
  - `privacy.html`
  - `terms.html`
- `deploy/nginx/zhuxishe.com.conf`
- `deploy/nginx/zhuxishe.com.bootstrap.conf`
- `deploy/nginx/zhuxishe.api-https.conf`

## 目标结构

- `zhuxishe.com` -> 301 到 `https://www.zhuxishe.com`
- `www.zhuxishe.com` -> 静态页
- `api.zhuxishe.com` -> 代理到当前 Supabase 项目
- `api.zhuxishe.com/storage/v1/...` -> 代理到 Supabase Storage

## 服务器建议路径

- 静态页目录：`/var/www/zhuxishe-com`
- Nginx 配置：`/etc/nginx/conf.d/zhuxishe.com.conf`
- 证书目录：`/etc/nginx/ssl/zhuxishe/`

## 上线步骤

### 阶段 1：无证书启动（推荐先做）

当 DNS 或证书还没完成时，先使用：

- `deploy/nginx/zhuxishe.com.bootstrap.conf`

它只启用 `80` 端口，目标是让服务器先恢复可用，便于后续签发证书和联调。

### 阶段 2：切换到 HTTPS 正式配置

证书就位后，再切换到：

- `deploy/nginx/zhuxishe.com.conf`

### 阶段 1.5：仅 `api` 先启用 HTTPS

如果你先拿到了 `api.zhuxishe.com` 的证书，而 `www.zhuxishe.com` 证书还没签发，可临时使用：

- `deploy/nginx/zhuxishe.api-https.conf`

它会保持 `www` 继续走 HTTP，同时让 `api.zhuxishe.com` 先切到 HTTPS，方便小程序先联调。

1. 把 `deploy/com-site/*` 上传到服务器目录 `/var/www/zhuxishe-com`
2. 若证书未就位，先把 `deploy/nginx/zhuxishe.com.bootstrap.conf` 上传到 `/etc/nginx/conf.d/zhuxishe.com.conf`
3. 若证书已就位，则使用 `deploy/nginx/zhuxishe.com.conf`
4. 将证书文件放到：
   - `/etc/nginx/ssl/zhuxishe/fullchain.pem`
   - `/etc/nginx/ssl/zhuxishe/privkey.pem`
5. 测试配置：
   - `nginx -t`
6. 重载：
   - `systemctl reload nginx`

## 部署后检查

```bash
curl -I http://zhuxishe.com
curl -I https://www.zhuxishe.com
curl -i https://api.zhuxishe.com/auth/v1/health
curl -i 'https://api.zhuxishe.com/rest/v1/members?select=id'
curl -i https://api.zhuxishe.com/functions/v1/wechat-auth
```

## 需要你手动替换的内容

- 如果邮箱或备案号还要调整，再修改 `deploy/com-site/*.html`
- `deploy/nginx/zhuxishe.com.conf` 里的证书实际路径

## 小程序同步改动

仓库内已把小程序请求基址改成：

```ts
const SUPABASE_URL = 'https://api.zhuxishe.com'
```

微信公众平台里至少配置：

- `request 合法域名`：`https://api.zhuxishe.com`
- `downloadFile 合法域名`：`https://wjjhprflldvclulistcx.supabase.co`

后续若已验证 `api.zhuxishe.com/storage/v1/...` 可稳定提供图片/文件下载，可将 `downloadFile 合法域名` 逐步迁移为：

- `https://api.zhuxishe.com`
