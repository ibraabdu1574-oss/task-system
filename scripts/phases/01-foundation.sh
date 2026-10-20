#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  المرحلة 1 — الأساس: المصادقة + الهيكل التنظيمي + الصلاحيات الهرمية
#
#      sudo task phase 1            (آمن للتكرار — أعد تشغيله بعد أي إصلاح)
#      sudo task phase 1 --reseed   (إعادة البيانات التجريبية إلى مرجعها)
#
#  ما يفعله بالترتيب — ويتوقف عند أول فشل برسالة تقول ما العمل:
#   1) يتأكد أن كود المرحلة موجود (يسحبه من GitHub إن كان المستودع مربوطًا)
#   2) يكمل أسرار .env (قاعدة البيانات، JWT، كلمة مرور البذرة)
#   3) يفحص docker-compose.yml ثم يبني الصور ويشغّل الحاويات على 127.0.0.1
#   4) prisma validate → migrate deploy → يتحقق أن قاعدة البيانات تطابق المخطط
#   5) البذرة: هيكل تجريبي + مستخدم لكل دور
#   6) فحوص الكود داخل الحاويات: tsc (api+web) + Jest (وحدة) + Supertest (تكامل)
#   7) nginx: من الصفحة المؤقتة إلى التطبيق (+ استثناءات WAF) مع nginx -t
#   8) معايير القبول عبر https://<النطاق> ثم verify.sh الشامل
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$APP_DIR/scripts/lib.sh"

PHASE=1
PHASE_NAME="الأساس — مصادقة وهيكل وصلاحيات"
RESEED=0
for a in "$@"; do case "$a" in --reseed) RESEED=1 ;; esac; done

need_root
OWNER="$(stat -c %U "$APP_DIR")"
# git دائمًا بصفة مالك المجلد (root يرفض مستودعًا لا يملكه: dubious ownership)
g() { sudo -u "$OWNER" -H git -C "$APP_DIR" "$@"; }
say "المرحلة $PHASE: $PHASE_NAME  (المجلد $APP_DIR · المالك $OWNER)"

# ───────── 1) كود المرحلة ─────────
say "1/8 كود المرحلة"
if g remote get-url origin >/dev/null 2>&1; then
  before="$(g rev-parse HEAD)"
  g fetch --quiet origin || warn "تعذّر السحب من GitHub — أكمل بالكود الموجود"
  g reset --hard "origin/$(g rev-parse --abbrev-ref HEAD)" --quiet || true
  after="$(g rev-parse HEAD)"
  [ "$before" = "$after" ] && ok "الكود محدَّث (${after:0:7})" || ok "سُحب: ${before:0:7} ← ${after:0:7}"
else
  warn "المستودع غير مربوط بـ GitHub (task deploy-key) — أكمل بالكود الموجود"
fi
need_files=(
  "docker-compose.yml"
  "package.json"
  "packages/shared/src/index.ts"
  "apps/api/package.json" "apps/api/Dockerfile" "apps/api/prisma/schema.prisma"
  "apps/api/prisma/migrations/migration_lock.toml" "apps/api/src/main.ts"
  "apps/web/package.json" "apps/web/Dockerfile" "apps/web/src/app/layout.tsx"
  "deploy/nginx/taskapp.conf.tmpl" "deploy/waf/task-exclusions.conf"
)
missing=0
for f in "${need_files[@]}"; do [ -e "$APP_DIR/$f" ] || { warn "ناقص: $f"; missing=1; }; done
[ "$missing" = 0 ] || die "كود المرحلة 1 غير مكتمل في $APP_DIR — ارفع ملفات المرحلة إلى GitHub ثم: task deploy"
ok "ملفات المرحلة موجودة"

# ───────── 2) الأسرار ─────────
say "2/8 الأسرار (.env)"
[ -f "$ENV_FILE" ] || install -m 600 -o "$OWNER" -g "$OWNER" /dev/null "$ENV_FILE"
added=()
env_ensure NODE_ENV            "development"       && added+=(NODE_ENV)
env_ensure PUBLIC_URL          "https://$DOMAIN"   && added+=(PUBLIC_URL)
env_ensure WEB_PORT            "$WEB_PORT"         && added+=(WEB_PORT)
env_ensure API_PORT            "$API_PORT"         && added+=(API_PORT)
env_ensure POSTGRES_USER       "taskapp"           && added+=(POSTGRES_USER)
env_ensure POSTGRES_PASSWORD   "$(gen_secret)"     && added+=(POSTGRES_PASSWORD)
env_ensure POSTGRES_DB         "taskapp"           && added+=(POSTGRES_DB)
env_ensure DATABASE_URL "postgresql://$(env_get POSTGRES_USER):$(env_get POSTGRES_PASSWORD)@postgres:5432/$(env_get POSTGRES_DB)?schema=public" && added+=(DATABASE_URL)
env_ensure REDIS_URL           "redis://redis:6379" && added+=(REDIS_URL)
env_ensure JWT_ACCESS_SECRET   "$(gen_secret)"     && added+=(JWT_ACCESS_SECRET)
env_ensure JWT_REFRESH_SECRET  "$(gen_secret)"     && added+=(JWT_REFRESH_SECRET)
env_ensure JWT_ACCESS_TTL      "15m"               && added+=(JWT_ACCESS_TTL)
env_ensure JWT_REFRESH_TTL     "7d"                && added+=(JWT_REFRESH_TTL)
env_ensure AUTH_SOURCE         "local"             && added+=(AUTH_SOURCE)
# كلمة مرور الحسابات التجريبية: تحقق السياسة (12+ · كبير · صغير · رقم · رمز)
env_ensure SEED_PASSWORD       "Dev-$(openssl rand -hex 6)-Aa1!" && added+=(SEED_PASSWORD)
chown "$OWNER:$OWNER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
[ "${#added[@]}" = 0 ] && ok "كل الأسرار موجودة مسبقًا" || ok "أُضيف: ${added[*]}"
g check-ignore -q .env || die ".env ليس مستثنى من git — أوقف كل شيء وأصلح .gitignore أولًا"
[ "$(env_get JWT_ACCESS_SECRET)" != "$(env_get JWT_REFRESH_SECRET)" ] || die "JWT_ACCESS_SECRET يساوي JWT_REFRESH_SECRET — احذف أحدهما من .env وأعد التشغيل"

# ───────── 3) الحاويات ─────────
say "3/8 الحاويات"
docker info >/dev/null 2>&1 || die "docker لا يعمل — systemctl status docker"
dc config -q || die "docker-compose.yml غير صالح — انظر الخطأ أعلاه"
ok "docker compose config صالح"
dc up -d --build --remove-orphans || die "فشل بناء/تشغيل الحاويات — الناتج أعلاه، ثم: task logs api"
for s in postgres redis; do
  retry 40 3 svc_healthy "$s" || die "الخدمة $s لم تصبح جاهزة — اكتب: task logs $s"
  ok "$s جاهزة"
done
retry 100 3 svc_healthy api || die "الـ API لم تصبح جاهزة خلال 5 دقائق — اكتب: task logs api"
ok "api جاهزة"

# ───────── 4) قاعدة البيانات ─────────
say "4/8 قاعدة البيانات (Prisma)"
dc exec -T api npx prisma validate >/dev/null || die "schema.prisma غير صالح — prisma validate فشل"
ok "schema.prisma صالح"
dc exec -T api npx prisma migrate deploy || die "فشل تطبيق الترحيلات — الناتج أعلاه"
ok "الترحيلات مطبَّقة"
# الترحيلات المكتوبة يدويًا يجب أن تنتج قاعدة مطابقة للمخطط تمامًا (0 = مطابق، 2 = فرق)
set +e
dc exec -T api sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code' > "$STATE_DIR/prisma-drift.txt" 2>&1
drift=$?
set -e
if [ "$drift" = 0 ]; then ok "قاعدة البيانات تطابق المخطط"
elif [ "$drift" = 2 ]; then
  cat "$STATE_DIR/prisma-drift.txt"
  die "قاعدة البيانات لا تطابق schema.prisma — ألصق الناتج أعلاه ليُصحَّح ملف الترحيل"
else warn "تعذّر فحص المطابقة (رمز $drift) — نكمل"; fi

# ───────── 5) البذرة ─────────
say "5/8 البيانات التجريبية"
if [ "$RESEED" = 1 ] || ! is_done "phase${PHASE}-seed"; then
  dc exec -T api npx prisma db seed || die "فشلت البذرة — الناتج أعلاه"
  mark_done "phase${PHASE}-seed"
  ok "البذرة جاهزة"
else
  ok "البذرة مضافة مسبقًا (لإعادتها: sudo task phase 1 --reseed)"
fi

# ───────── 6) فحوص الكود (داخل الحاويات) ─────────
say "6/8 فحوص الكود"
dc exec -T api npx tsc --noEmit -p tsconfig.json || die "أخطاء TypeScript في apps/api — ألصق الناتج أعلاه"
ok "api: tsc"
if dc exec -T api npx jest --silent > "$STATE_DIR/unit.txt" 2>&1; then
  grep -E "Tests:" "$STATE_DIR/unit.txt" | sed 's/^/   /' || true
  ok "api: اختبارات الوحدة (RBAC)"
else
  tail -40 "$STATE_DIR/unit.txt"; die "اختبارات الوحدة (RBAC) فشلت — ألصق الناتج أعلاه"
fi
dc exec -T api npm run -s test:e2e 2>&1 | tail -40 > "$STATE_DIR/e2e.txt" || { cat "$STATE_DIR/e2e.txt"; die "اختبارات التكامل (مصادقة/صلاحيات) فشلت — ألصق الناتج أعلاه"; }
grep -E "Tests:|Test Suites:" "$STATE_DIR/e2e.txt" | sed 's/^/   /' || true
ok "api: اختبارات التكامل"
retry 100 3 svc_healthy web || die "الواجهة لم تصبح جاهزة — اكتب: task logs web"
dc exec -T web npx tsc --noEmit -p tsconfig.json || die "أخطاء TypeScript في apps/web — ألصق الناتج أعلاه"
ok "web: tsc"

# ───────── 7) nginx ─────────
say "7/8 nginx: توجيه التطبيق + استثناءات WAF"
TASK_APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/task" nginx || die "فشل تطبيق إعداد nginx — انظر nginx -t أعلاه"

# ───────── 8) معايير القبول ─────────
say "8/8 معايير القبول"
R="--resolve $DOMAIN:443:127.0.0.1"   # من داخل الخادم (عنوانه ليس سعوديًا فيُحجب جغرافيًا)
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 $R "$@" 2>/dev/null || echo 000; }
pass=1
c="$(code "https://$DOMAIN/login")";         [ "$c" = 200 ] && ok "صفحة الدخول عبر HTTPS → 200" || { warn "صفحة الدخول → $c"; pass=0; }
c="$(code "https://$DOMAIN/api/v1/health")"; [ "$c" = 200 ] && ok "صحة الـ API عبر nginx → 200" || { warn "صحة الـ API → $c (WAF؟ انظر /var/log/nginx/error.log)"; pass=0; }
c="$(code -X POST -H 'Content-Type: application/json' -d '{"identifier":"x","password":"y"}' "https://$DOMAIN/api/v1/auth/login")"
[ "$c" = 401 ] && ok "دخول خاطئ → 401" || { warn "دخول خاطئ → $c (المتوقع 401 — لو 403 فالـ WAF حجب JSON: grep 'Access denied' /var/log/nginx/error.log)"; pass=0; }
SEED_PW="$(env_get SEED_PASSWORD)"
TOK="$(curl -s --max-time 20 $R -X POST -H 'Content-Type: application/json' \
      -d "{\"identifier\":\"1001\",\"password\":\"$SEED_PW\"}" "https://$DOMAIN/api/v1/auth/login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' || true)"
if [ -n "$TOK" ]; then
  ok "دخول الرئيس التنفيذي عبر HTTPS ناجح"
  c="$(code -H "Authorization: Bearer $TOK" "https://$DOMAIN/api/v1/org/tree")"
  [ "$c" = 200 ] && ok "شجرة الهيكل → 200" || { warn "شجرة الهيكل → $c"; pass=0; }
else warn "تعذّر دخول الحساب التجريبي 1001"; pass=0; fi
# الصلاحيات الهرمية على الخلفية: موظف يحاول إنشاء قسم ⇒ 403 (مباشرة على الـ API لتفادي حدّ محاولات الدخول في nginx)
ETOK="$(curl -s --max-time 20 -X POST -H 'Content-Type: application/json' \
      -d "{\"identifier\":\"1042\",\"password\":\"$SEED_PW\"}" "http://127.0.0.1:$API_PORT/api/v1/auth/login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' || true)"
c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ETOK" \
      -d '{"administrationId":"00000000-0000-0000-0000-000000000000","name":"x"}' "http://127.0.0.1:$API_PORT/api/v1/org/sections")"
[ "$c" = 403 ] && ok "الموظف ممنوع من إدارة الهيكل → 403 (RBAC على الخلفية)" || { warn "فحص RBAC أعاد $c (المتوقع 403)"; pass=0; }
[ "$pass" = 1 ] || die "معايير القبول لم تكتمل — راجع التحذيرات أعلاه"

bash "$APP_DIR/scripts/verify.sh" || die "الفحص الشامل (verify) لم ينجح — راجع أعلاه"

mark_done "phase${PHASE}"
echo
ok "المرحلة $PHASE اكتملت ✓"
cat <<EOF

  افتح:  https://$DOMAIN
  الحسابات التجريبية (كلمة المرور نفسها للجميع):  $SEED_PW
    1001 الرئيس التنفيذي · 1002 مدير عام · 1003 مدير إدارة · 1015 مسؤول متابعة · 1020 مشرف · 1042 موظف
  توثيق الـ API:  https://$DOMAIN/api/v1/docs

  يوميًا بعد أي رفع إلى GitHub:   task deploy
EOF
