# apps/api — NestJS (تطوير: hot reload)
# سياق البناء = جذر المستودع (انظر docker-compose.yml)
FROM node:20-bookworm

ENV NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app

# تثبيت التبعيات أولًا (طبقة مُخزَّنة ما لم تتغيّر ملفات package)
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# npm install (لا npm ci): المستودع بلا package-lock.json في المرحلة 1
RUN npm install --no-audit --no-fund --workspace=packages/shared --workspace=apps/api --include-workspace-root=false

# المصدر
COPY packages/shared packages/shared
COPY apps/api apps/api

# بناء الحزمة المشتركة + توليد عميل Prisma داخل الصورة
RUN npm run build -w packages/shared \
 && cd apps/api && npx prisma generate

WORKDIR /app/apps/api
EXPOSE 3001

# عند التشغيل: الحزمة المشتركة تُبنى من المصدر المثبّت (bind mount) ثم Nest بالمراقبة
CMD ["sh", "-c", "cd /app && npm run build -w packages/shared && cd /app/apps/api && npm run start:dev"]
