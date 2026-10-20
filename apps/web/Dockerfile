# apps/web — Next.js (تطوير: hot reload)
# سياق البناء = جذر المستودع (انظر docker-compose.yml)
FROM node:20-bookworm-slim

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
# npm install (لا npm ci): المستودع بلا package-lock.json في المرحلة 1
RUN npm install --no-audit --no-fund --workspace=packages/shared --workspace=apps/web --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["sh", "-c", "cd /app && npm run build -w packages/shared && cd /app/apps/web && npm run dev"]
