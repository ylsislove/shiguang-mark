# 腾讯云发布与回滚

该应用为纯静态站点。照片不传输给服务器，无需后台数据库、上传接口或 API 密钥。域名 `mark.aayu.today`，独立 Nginx 虚拟主机，不改动已有站点。

1. 将 DNSPod 中 `mark` 的 A 记录指向目标腾讯云服务器公网 IP；检查不存在冲突 CNAME / AAAA。
2. 运行测试和构建：`npm ci && npm test && npm run build`。
3. 将 `dist/` 内容复制到 `/var/www/mark.aayu.today/releases/<git-commit>/`。
4. 在 `/var/www/mark.aayu.today/` 创建临时符号链接，再原子切换 `current` 到新 release；保留旧版本以便回滚。
5. 首次安装先创建 `/var/www/mark.aayu.today/acme/.well-known/acme-challenge`，将 `ops/nginx.bootstrap.conf` 安装到 `/etc/nginx/sites-available/mark.aayu.today`，在 `sites-enabled` 建立链接，运行 `nginx -t`，成功后 reload。
6. 公网 DNS 生效后运行 `certbot certonly --webroot -w /var/www/mark.aayu.today/acme -d mark.aayu.today` 签发证书，再以 `ops/nginx.conf` 替换该独立配置，`nginx -t` 成功后 reload。这会启用 HTTPS 与 HTTP 重定向；验证目录独立于版本目录，以便自动续期。保持 `certbot.timer` 启用，部署钩子在续期后执行 `nginx -t && systemctl reload nginx`。
7. 检查 HTTPS 首页与资源 HTTP 200、有效证书、浏览器导入/导出，以及已有站点仍按原有访问规则工作。

回滚：把 `current` 原子切回已知正常的 release 即可。源码与构建记录通过 GitHub CI 管理。DNS 凭据只应保存在本机仓库外，部署文件不包含私钥或账户令牌。

## 发布检查

- 核心日期/GPS/路径/位置逻辑测试及生产构建。
- 桌面、手机宽度的布局；两种键盘方向；输入日期时不误切照片。
- 导入多张图片，检查缺失 EXIF 提示，单张 PNG / JPG 与批量 ZIP 下载。
- 留白模板增加底部画布；其他模板保持原始像素尺寸。
- 密钥、用户照片不进入版本控制或静态站点目录。

## 更新已上线站点

提交源码后运行 `./ops/deploy.sh user@server`。脚本先检查 Git 工作区干净，再安装锁定依赖、测试、构建并按提交 SHA 建立发布目录，最后原子切换站点。脚本不修改 DNS、TLS 或其他站点配置。

证书使用 Certbot 已安装的 [Webroot 验证方式](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)，无需安装 Nginx 插件或停止现有网站。可运行 `certbot renew --cert-name mark.aayu.today --dry-run` 检查续期。
