#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  المرحلة 2 — المهام: CRUD ضمن النطاق + إسناد متعدد + فرعية + تعليقات + مرفقات + سجل نشاط + الحجم والتوقيت
#
#      sudo task phase 2            (آمن للتكرار — أعد تشغيله بعد أي إصلاح)
#      sudo task phase 2 --reseed   (إعادة تشغيل البذرة: الأحجام الافتراضية + المهام التجريبية إن لم توجد مهام)
#
#  ما يفعله بالترتيب — ويتوقف عند أول فشل برسالة تقول ما العمل:
#   1) يتأكد أن كود المرحلة موجود (يسحبه من GitHub إن كان المستودع مربوطًا)
#   2) يكمل أسرار .env الناقصة (task env)
#   3) يفحص docker-compose.yml ثم يعيد بناء الصور (تبعية @types/multer + مجلد المرفقات) ويشغّل الحاويات
#   4) prisma validate → migrate deploy (ترحيل المرحلة 2) → يتحقق أن قاعدة البيانات تطابق المخطط
#   5) البذرة: الأحجام الافتراضية 4/16/40 + مهام تجريبية تطابق prototype.html
#   6) فحوص الكود داخل الحاويات: tsc (api+web) + Jest (RBAC + نطاق المهام) + Supertest (مصادقة + مهام)
#   7) nginx: حدّ حجم الرفع + استثناء WAF للمرفقات، مع nginx -t
#   8) معايير القبول عبر https://<النطاق>: إسناد متعدد، فرعية بإسناد مستقل، تعليق، مرفق (رفع/تنزيل)،
#      تتبّع النشاط، الحجم والتوقيت، نطاق الرؤية — ثم verify.sh الشامل
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$APP_DIR/scripts/lib.sh"

PHASE=2
PHASE_NAME="المهام — إسناد متعدد وفرعية وتعليقات ومرفقات"
RESEED=0
for a in "$@"; do case "$a" in --reseed) RESEED=1 ;; esac; done

need_root
OWNER="$(stat -c %U "$APP_DIR")"
g() { sudo -u "$OWNER" -H git -C "$APP_DIR" "$@"; }
say "المرحلة $PHASE: $PHASE_NAME  (المجلد $APP_DIR · المالك $OWNER)"
is_done "phase1" || warn "المرحلة 1 غير مسجّلة كمكتملة (.state) — نكمل، لكن لو فشل شيء شغّل أولًا: sudo task phase 1"

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
  "apps/api/prisma/migrations/20261021000000_phase2_tasks/migration.sql"
  "apps/api/src/modules/tasks/tasks.module.ts" "apps/api/src/modules/tasks/tasks.service.ts"
  "apps/api/src/modules/tasks/tasks.controller.ts" "apps/api/src/modules/tasks/attachments.service.ts"
  "apps/api/src/modules/tasks/task-scope.ts" "apps/api/src/modules/tasks/task-scope.spec.ts"
  "apps/api/src/modules/tasks/dto/task.dto.ts" "apps/api/test/tasks.e2e-spec.ts"
  "apps/web/src/app/(app)/tasks/page.tsx" "apps/web/src/app/(app)/tasks/new/page.tsx" "apps/web/src/app/(app)/tasks/[id]/page.tsx"
  "apps/web/src/components/tasks/bits.tsx" "apps/web/src/components/tasks/AssigneePicker.tsx" "apps/web/src/components/tasks/SizePicker.tsx"
  "deploy/waf/task-exclusions.conf" "deploy/nginx/taskapp.conf.tmpl"
)
missing=0
for f in "${need_files[@]}"; do [ -e "$APP_DIR/$f" ] || { warn "ناقص: $f"; missing=1; }; done
[ "$missing" = 0 ] || die "كود المرحلة 2 غير مكتمل في $APP_DIR — ارفع ملفات المرحلة إلى GitHub ثم: task deploy"
grep -q "tasks.read" "$APP_DIR/packages/shared/src/index.ts" || die "packages/shared/src/index.ts قديم (بلا إجراءات tasks.*) — ارفع نسخة المرحلة 2"
grep -q "model Task " "$APP_DIR/apps/api/prisma/schema.prisma" || die "schema.prisma قديم (بلا model Task) — ارفع نسخة المرحلة 2"
grep -q "attachments:/app/data/attachments" "$APP_DIR/docker-compose.yml" || die "docker-compose.yml قديم (بلا مجلد المرفقات) — ارفع نسخة المرحلة 2"
grep -q 'tasks/\[0-9a-fA-F-\]{36}/attachments' "$APP_DIR/deploy/waf/task-exclusions.conf" || die "deploy/waf/task-exclusions.conf قديم (قاعدة المرفقات 9000110 لا تشير إلى /tasks/<id>/attachments) — ارفع نسخة المرحلة 2"
grep -q 'client_max_body_size' "$APP_DIR/deploy/nginx/taskapp.conf.tmpl" || die "قالب nginx بلا client_max_body_size — الرفع سيُرفض (413)"
ok "ملفات المرحلة موجودة"
# أمر task المثبّت يجب أن يطابق نسخة المستودع (المرحلة 2 عدّلته)
if ! cmp -s "$APP_DIR/scripts/task" /usr/local/bin/task; then
  install -m 755 "$APP_DIR/scripts/task" /usr/local/bin/task && ok "حُدّث /usr/local/bin/task من المستودع"
fi

# ───────── 2) الأسرار ─────────
say "2/8 الأسرار (.env)"
[ -f "$ENV_FILE" ] || die ".env غير موجود — المرحلة 1 لم تُشغَّل: sudo task phase 1"
TASK_APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/task" env
chown "$OWNER:$OWNER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
g check-ignore -q .env || die ".env ليس مستثنى من git — أوقف كل شيء وأصلح .gitignore أولًا"

# ───────── 3) الحاويات ─────────
say "3/8 الحاويات (إعادة بناء: تبعيات جديدة + مجلد المرفقات)"
docker info >/dev/null 2>&1 || die "docker لا يعمل — systemctl status docker"
dc config -q || die "docker-compose.yml غير صالح — انظر الخطأ أعلاه"
ok "docker compose config صالح"
dc up -d --build --remove-orphans || die "فشل بناء/تشغيل الحاويات — الناتج أعلاه، ثم: task logs api"
for s in postgres redis; do
  retry 40 3 svc_healthy "$s" || die "الخدمة $s لم تصبح جاهزة — اكتب: task logs $s"
  ok "$s جاهزة"
done
retry 100 3 svc_healthy api || die "الـ API لم تصبح جاهزة خلال 5 دقائق — اكتب: task logs api  (غالبًا خطأ TypeScript في كود المرحلة)"
ok "api جاهزة"
dc exec -T api sh -c 'test -d /app/data/attachments' || die "مجلد المرفقات /app/data/attachments غير موجود داخل الحاوية — راجع volumes في docker-compose.yml"
ok "مجلد المرفقات مركّب (خارج الجذر العام)"

# ───────── 4) قاعدة البيانات ─────────
say "4/8 قاعدة البيانات (Prisma)"
dc exec -T api npx prisma validate >/dev/null || die "schema.prisma غير صالح — prisma validate فشل"
ok "schema.prisma صالح"
dc exec -T api npx prisma migrate deploy || die "فشل تطبيق الترحيلات — الناتج أعلاه"
ok "الترحيلات مطبَّقة (بما فيها 20261021000000_phase2_tasks)"
set +e
dc exec -T api sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code' > "$STATE_DIR/prisma-drift.txt" 2>&1
drift=$?
set -e
if [ "$drift" = 0 ]; then ok "قاعدة البيانات تطابق المخطط"
elif [ "$drift" = 2 ]; then
  cat "$STATE_DIR/prisma-drift.txt"
  die "قاعدة البيانات لا تطابق schema.prisma — ألصق الناتج أعلاه ليُصحَّح ملف الترحيل"
else warn "تعذّر فحص المطابقة (رمز $drift) — نكمل"; fi
# عميل Prisma داخل الصورة يُولَّد عند البناء؛ لو كان المخطط تغيّر بعد البناء نعيد التوليد ونعيد تشغيل api
dc exec -T api npx prisma generate >/dev/null 2>&1 || warn "prisma generate لم ينجح — إن ظهرت أخطاء 'task' غير معروف في tsc: task restart api"

# ───────── 5) البذرة ─────────
say "5/8 البيانات التجريبية (الأحجام الافتراضية + مهام)"
if [ "$RESEED" = 1 ] || ! is_done "phase${PHASE}-seed"; then
  dc exec -T api npx prisma db seed || die "فشلت البذرة — الناتج أعلاه"
  mark_done "phase${PHASE}-seed"
  ok "البذرة جاهزة"
else
  ok "البذرة مضافة مسبقًا (لإعادتها: sudo task phase 2 --reseed)"
fi

# ───────── 6) فحوص الكود (داخل الحاويات) ─────────
say "6/8 فحوص الكود"
dc exec -T api npx tsc --noEmit -p tsconfig.json || die "أخطاء TypeScript في apps/api — ألصق الناتج أعلاه"
ok "api: tsc"
if dc exec -T api npx jest --silent > "$STATE_DIR/unit.txt" 2>&1; then
  grep -E "Tests:" "$STATE_DIR/unit.txt" | sed 's/^/   /' || true
  ok "api: اختبارات الوحدة (RBAC + نطاق رؤية المهام)"
else
  tail -60 "$STATE_DIR/unit.txt"; die "اختبارات الوحدة فشلت — ألصق الناتج أعلاه"
fi
if dc exec -T api npm run -s test:e2e > "$STATE_DIR/e2e.txt" 2>&1; then
  grep -E "Tests:|Test Suites:" "$STATE_DIR/e2e.txt" | sed 's/^/   /' || true
  ok "api: اختبارات التكامل (مصادقة/صلاحيات + مهام)"
else
  grep -vE "^\s*$" "$STATE_DIR/e2e.txt" | tail -80; die "اختبارات التكامل فشلت — ألصق الناتج أعلاه"
fi
retry 100 3 svc_healthy web || die "الواجهة لم تصبح جاهزة — اكتب: task logs web"
dc exec -T web npx tsc --noEmit -p tsconfig.json || die "أخطاء TypeScript في apps/web — ألصق الناتج أعلاه"
ok "web: tsc"

# ───────── 7) nginx ─────────
say "7/8 nginx: استثناء WAF للمرفقات (القاعدة 9000110)"
TASK_APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/task" nginx || die "فشل تطبيق إعداد nginx — انظر nginx -t أعلاه"
grep -q 'tasks/\[0-9a-fA-F-\]{36}/attachments' "$CRS_EXCLUSIONS" && ok "استثناء WAF 9000110 (رفع المرفقات) مُدرج" || warn "استثناء WAF للمرفقات غير مُدرج — sudo task nginx"

# ───────── 8) معايير القبول ─────────
say "8/8 معايير القبول (PLAN المرحلة 2)"
R="--resolve $DOMAIN:443:127.0.0.1"   # من داخل الخادم (عنوانه ليس سعوديًا فيُحجب جغرافيًا)
API="http://127.0.0.1:$API_PORT/api/v1"
SEED_PW="$(env_get SEED_PASSWORD)"
# قراءة حقل من JSON: jget '<json>' 'expr'  (expr على المتغيّر d)
jget() { python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))' "$1" "$2" 2>/dev/null || true; }
login_direct() { curl -s --max-time 20 -X POST -H 'Content-Type: application/json' -d "{\"identifier\":\"$1\",\"password\":\"$SEED_PW\"}" "$API/auth/login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'; }
pass=1
fail() { warn "$1"; pass=0; }

# دخول المدير العام عبر HTTPS (مرة واحدة — حدّ محاولات الدخول في nginx)
GM="$(curl -s --max-time 20 $R -X POST -H 'Content-Type: application/json' -d "{\"identifier\":\"1002\",\"password\":\"$SEED_PW\"}" "https://$DOMAIN/api/v1/auth/login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' || true)"
[ -n "$GM" ] && ok "دخول المدير العام (1002) عبر HTTPS" || die "تعذّر دخول الحساب التجريبي 1002 عبر HTTPS — راجع: task logs api · /var/log/nginx/error.log"
SARA="$(login_direct 1042)"; FAHAD="$(login_direct 1051)"
[ -n "$SARA" ] && [ -n "$FAHAD" ] || die "تعذّر دخول حسابات الموظفين التجريبية (1042/1051) — هل البذرة مكتملة؟ sudo task phase 2 --reseed"

# المعرّفات من الشجرة والمستخدمين
TREE="$(curl -s --max-time 20 -H "Authorization: Bearer $GM" "$API/org/tree")"
SYSTEMS_ID="$(jget "$TREE" "[a for g in d['generalAdmins'] for a in g['administrations'] if a['name']=='إدارة الأنظمة'][0]['id']")"
DB_SEC_ID="$(jget "$TREE" "[s for g in d['generalAdmins'] for a in g['administrations'] for s in a['sections'] if s['name']=='قواعد البيانات'][0]['id']")"
CYBER_ID="$(jget "$TREE" "[a for g in d['generalAdmins'] for a in g['administrations'] if a['name']=='إدارة الأمن السيبراني'][0]['id']")"
SARA_ID="$(jget "$(curl -s --max-time 20 -H "Authorization: Bearer $SARA" "$API/auth/me")" "d['id']")"
[ -n "$SYSTEMS_ID" ] && [ -n "$DB_SEC_ID" ] && [ -n "$CYBER_ID" ] && [ -n "$SARA_ID" ] || die "تعذّر استخراج معرّفات الهيكل التجريبي — هل البذرة مكتملة؟"

# (1) إسناد مهمة لعدة جهات عبر HTTPS: موظفة + قسم + إدارة، بحجم weekly ⇒ 16 ساعة
TITLE="قبول المرحلة 2 — $(date +%s)"
TASK="$(curl -s --max-time 20 $R -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $GM" \
  -d "{\"title\":\"$TITLE\",\"category\":\"adhoc\",\"priority\":\"high\",\"dueDate\":\"2031-01-15\",\"sizePreset\":\"weekly\",\"administrationId\":\"$SYSTEMS_ID\",\"assignments\":[{\"assigneeType\":\"user\",\"assigneeId\":\"$SARA_ID\"},{\"assigneeType\":\"section\",\"assigneeId\":\"$DB_SEC_ID\"},{\"assigneeType\":\"administration\",\"assigneeId\":\"$CYBER_ID\"}]}" \
  "https://$DOMAIN/api/v1/tasks")"
TASK_ID="$(jget "$TASK" "d['id']")"
N_ASG="$(jget "$TASK" "len(d['assignments'])")"
HOURS="$(jget "$TASK" "d['estimatedHours']")"
if [ -n "$TASK_ID" ] && [ "$N_ASG" = 3 ]; then ok "إسناد مهمة لثلاث جهات (موظفة + قسم + إدارة) عبر HTTPS"
else fail "إنشاء المهمة متعددة الإسناد فشل: $(echo "$TASK" | head -c 300)  (لو 403 من WAF: grep 'id \"9' /var/log/nginx/error.log | tail)"; fi
[ "$HOURS" = "16.0" ] || [ "$HOURS" = "16" ] && ok "الحجم weekly ⇒ 16 ساعة مقدّرة (التقاط الحجم)" || fail "estimatedHours = '$HOURS' (المتوقع 16)"

if [ -n "$TASK_ID" ]; then
  # (2) نطاق الرؤية: سارة ترى، فهد (زميلها غير المسند) لا يرى
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $SARA" "$API/tasks/$TASK_ID")"
  [ "$c" = 200 ] && ok "الموظفة المسندة ترى المهمة → 200" || fail "سارة → $c"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $FAHAD" "$API/tasks/$TASK_ID")"
  [ "$c" = 404 ] && ok "الموظف غير المسند لا يراها → 404 (نطاق الرؤية على الخلفية)" || fail "فهد → $c (المتوقع 404)"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $SARA" -d "{\"assignments\":[{\"assigneeType\":\"user\",\"assigneeId\":\"$SARA_ID\"}]}" "$API/tasks/$TASK_ID/assignments")"
  [ "$c" = 403 ] && ok "الموظف ممنوع من الإسناد → 403" || fail "إسناد من موظف → $c (المتوقع 403)"

  # (3) فرعية بإسناد مستقل (سارة تقسّم مهمتها لنفسها) ثم المدير يُسندها لفهد
  SUB="$(curl -s --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $SARA" \
    -d "{\"title\":\"فرعية — $TITLE\",\"category\":\"adhoc\",\"parentTaskId\":\"$TASK_ID\",\"sizePreset\":\"daily\"}" "$API/tasks")"
  SUB_ID="$(jget "$SUB" "d['id']")"
  [ -n "$SUB_ID" ] && [ "$(jget "$SUB" "d['parent']['id']")" = "$TASK_ID" ] && ok "مهمة فرعية بإسناد مستقل (سارة)" || fail "الفرعية: $(echo "$SUB" | head -c 200)"
  FAHAD_ID="$(jget "$(curl -s --max-time 20 -H "Authorization: Bearer $FAHAD" "$API/auth/me")" "d['id']")"
  if [ -n "$SUB_ID" ]; then
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $GM" -d "{\"assignments\":[{\"assigneeType\":\"user\",\"assigneeId\":\"$FAHAD_ID\"}]}" "$API/tasks/$SUB_ID/assignments")"
    [ "$c" = 201 ] && ok "إعادة إسناد الفرعية إلى فهد → 201" || fail "إسناد الفرعية → $c"
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $FAHAD" "$API/tasks/$SUB_ID")"
    [ "$c" = 200 ] && ok "فهد يرى الفرعية المسندة إليه (دون الأم)" || fail "فهد/الفرعية → $c"
    # (4) التوقيت من انتقال الحالة
    ST="$(curl -s --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $FAHAD" -d '{"state":"in_progress"}' "$API/tasks/$SUB_ID/state")"
    [ "$(jget "$ST" "d['startedAt'] is not None")" = True ] && ok "in_progress ⇒ startedAt مسجّل (التقاط التوقيت)" || fail "startedAt لم يُسجَّل: $(echo "$ST" | head -c 200)"
    ST="$(curl -s --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $FAHAD" -d '{"state":"done"}' "$API/tasks/$SUB_ID/state")"
    [ "$(jget "$ST" "d['completedAt'] is not None")" = True ] && ok "done ⇒ completedAt مسجّل" || fail "completedAt لم يُسجَّل"
  fi

  # (5) تعليق
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $SARA" -d '{"content":"تعليق قبول المرحلة 2"}' "$API/tasks/$TASK_ID/comments")"
  [ "$c" = 201 ] && ok "تعليق من الموظفة المسندة → 201" || fail "تعليق → $c"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $FAHAD" -d '{"content":"x"}' "$API/tasks/$TASK_ID/comments")"
  [ "$c" = 404 ] && ok "تعليق من خارج النطاق → 404" || fail "تعليق خارج النطاق → $c"

  # (6) مرفق عبر HTTPS (يمر بالـ WAF): رفع multipart ثم تنزيل ومطابقة المحتوى
  TMPF="$(mktemp /tmp/phase2-XXXX.txt)"; echo "نتائج قبول المرحلة 2 — SELECT * FROM test; <b>html</b>" > "$TMPF"
  UP_BODY="$(mktemp)"; UP_CODE="$(curl -s -o "$UP_BODY" -w '%{http_code}' --max-time 30 $R -X POST -H "Authorization: Bearer $GM" -F "file=@$TMPF;filename=نتائج-القبول.txt;type=text/plain" "https://$DOMAIN/api/v1/tasks/$TASK_ID/attachments")"
  ATT_ID="$(jget "$(cat "$UP_BODY")" "d['id']")"
  if [ "$UP_CODE" = 201 ] && [ -n "$ATT_ID" ]; then
    ok "رفع مرفق عبر HTTPS (WAF) → 201"
    DL="$(mktemp)"; c="$(curl -s -o "$DL" -w '%{http_code}' --max-time 30 $R -H "Authorization: Bearer $GM" "https://$DOMAIN/api/v1/tasks/$TASK_ID/attachments/$ATT_ID/download")"
    [ "$c" = 200 ] && cmp -s "$TMPF" "$DL" && ok "تنزيل المرفق ومطابقة المحتوى → 200" || fail "تنزيل المرفق → $c أو المحتوى مختلف"
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $FAHAD" "$API/tasks/$TASK_ID/attachments/$ATT_ID/download")"
    [ "$c" = 404 ] && ok "تنزيل من خارج النطاق → 404 (فحص الصلاحية قبل التنزيل)" || fail "تنزيل خارج النطاق → $c"
    rm -f "$DL"
  elif [ "$UP_CODE" = 403 ]; then
    fail "رفع المرفق حُجب عبر nginx/WAF (403). آخر قواعد ModSecurity التي أطلقت:"
    grep -o 'id "[0-9]*"' /var/log/nginx/error.log 2>/dev/null | tail -5 | sed 's/^/     /' || true
    echo "     → أضف ctl:ruleRemoveById=<المعرّف> داخل القاعدة 9000110 في deploy/waf/task-exclusions.conf ثم: sudo task nginx && sudo task phase 2"
    echo "     → ولو حُظر عنوانك في fail2ban: sudo fail2ban-client unban --all"
  elif [ "$UP_CODE" = 413 ]; then
    fail "رفع المرفق → 413: client_max_body_size في قالب nginx لم يُطبَّق — sudo task nginx ثم أعد التشغيل"
  else
    fail "رفع المرفق → $UP_CODE: $(head -c 300 "$UP_BODY")"
  fi
  rm -f "$TMPF" "$UP_BODY"

  # (7) تتبّع كل تغيير: سجل النشاط يحوي الإنشاء والفرعية والتعليق والمرفق
  DET="$(curl -s --max-time 20 -H "Authorization: Bearer $GM" "$API/tasks/$TASK_ID")"
  TYPES="$(jget "$DET" "','.join(sorted(set(a['type'] for a in d['activities'])))")"
  case "$TYPES" in
    *created*subtask_created*) ok "سجل النشاط يتتبّع التغييرات: $TYPES" ;;
    *) fail "سجل النشاط ناقص: $TYPES" ;;
  esac
  [ "$(jget "$DET" "d['subtaskDoneCount']")" = 1 ] && ok "اكتمال الفرعية ينعكس على الأم (1/1)" || fail "subtaskDoneCount ≠ 1"

  # تنظيف: حذف مهمة القبول (مع فرعيتها ومرفقاتها)
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X DELETE -H "Authorization: Bearer $GM" "$API/tasks/$TASK_ID")"
  [ "$c" = 200 ] && ok "تنظيف: حُذفت مهمة القبول" || warn "تعذّر حذف مهمة القبول ($c) — احذفها من الواجهة"
fi

# الواجهة: صفحات المهام تُخدَم عبر HTTPS
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 $R "$@" 2>/dev/null || echo 000; }
c="$(code "https://$DOMAIN/tasks")";     [ "$c" = 200 ] && ok "صفحة قائمة المهام عبر HTTPS → 200" || fail "صفحة /tasks → $c"
c="$(code "https://$DOMAIN/tasks/new")"; [ "$c" = 200 ] && ok "صفحة مهمة جديدة عبر HTTPS → 200" || fail "صفحة /tasks/new → $c"

[ "$pass" = 1 ] || die "معايير القبول لم تكتمل — راجع التحذيرات أعلاه (أعد التشغيل بعد الإصلاح: sudo task phase 2)"

bash "$APP_DIR/scripts/verify.sh" || die "الفحص الشامل (verify) لم ينجح — راجع أعلاه"

mark_done "phase${PHASE}"
echo
ok "المرحلة $PHASE اكتملت ✓"
cat <<EOF

  افتح:  https://$DOMAIN/tasks
  الحسابات التجريبية (كلمة المرور نفسها للجميع):  $SEED_PW
    1001 الرئيس التنفيذي · 1002 مدير عام · 1003 مدير إدارة الأنظمة · 1015 مسؤول متابعة · 1020 مشرف الدعم · 1042 سارة (موظفة)
  جرّب: 1003 يرى كل مهام إدارة الأنظمة ويُسند لعدة جهات · 1042 ترى المسند إليها فقط وتقسّمها لفرعية وتعلّق وترفق
  توثيق الـ API:  https://$DOMAIN/api/v1/docs

  يوميًا بعد أي رفع إلى GitHub:   task deploy
EOF
