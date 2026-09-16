# syntax=docker/dockerfile:1

# ---- verify：运行 Vitest 单元测试与 Playwright E2E ----
# 官方 Playwright 镜像已内置 Chromium 及全部系统依赖。
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS verify
# 中文字体，保证无头浏览器中中文界面与截图正常渲染
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["sh", "-c", "npm run test && npm run build && npx playwright test"]

# ---- build：构建静态前端产物 ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- web：nginx 提供纯静态页面，不包含任何外部服务调用 ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost: >/dev/null 2>&1 || exit 1
