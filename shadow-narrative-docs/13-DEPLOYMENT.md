# Shadow Narrative — Deployment & Environment

## 1. Local Development

建议：

```text
Node.js LTS
pnpm / npm
```

具体版本以项目锁文件为准。

## 2. Commands

README 中必须提供：

```text
install

dev

build

start

lint

test
```

## 3. Environment Variables

至少规划：

```text
DATABASE_URL=
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
AI_PROVIDER=
AI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

具体变量按实际 provider 调整。

禁止提交真实 secrets。

提供：

`.env.example`

## 4. Storage

生产环境推荐对象存储：

- S3 compatible
- R2
- Supabase Storage
- 等价方案

原图和派生图分开管理。

## 5. Database

推荐：

PostgreSQL + Prisma。

必须提供 migration。

## 6. Deployment

可部署到：

- Vercel + managed DB/storage
- Cloudflare + compatible services
- 自有 VPS
- 其他标准 Node/Next 托管

选择最稳定且与项目当前技术栈匹配的方案。

## 7. CI

建议 CI 至少执行：

```text
install
lint
typecheck
test
build
```

## 8. Production Checklist

- secrets configured
- database migrated
- storage configured
- upload limits configured
- auth configured
- AI rate limit configured
- error monitoring configured
- HTTPS enabled
- cache configured
- image transforms verified

## 9. Runtime Observability

建议：

- error monitoring
- performance monitoring
- request metrics

但不要收集不必要的用户记忆内容。

## 10. Preview Environment

每个视觉迭代版本最好可以生成可访问的 preview。

用于：

- 产品检查
- 浏览器检查
- 移动端检查
- 视觉回归
