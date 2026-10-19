#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  المرحلة 1 — الأساس: المصادقة + الهيكل التنظيمي + الصلاحيات
#
#      sudo task phase 1
#
#  هذا السكربت يتولّى **تهيئة البنية** للمرحلة فقط (nginx، أسرار، ترحيلات،
#  بيانات تجريبية). أما **كود التطبيق** فيصل عبر git (task deploy).
#  آمن للتكرار: كل قسم يتخطّى نفسه إن كان مكتملًا.
#
#  ── قالب: انسخه لكل مرحلة جديدة (02-tasks.sh، 03-...) ──
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$APP_DIR/scripts/lib.sh"

PHASE=1
PHASE_NAME="الأساس — مصادقة وهيكل وصلاحيات"
say "المرحلة $PHASE: $PHASE_NAME"

# ───────── 1) ما تحتاجه هذه المرحلة من كود ─────────
need_files=(
  "apps/api/package.json"
  "apps/api/prisma/schema.prisma"
  "apps/web/package.json"
)
missing=0
for f in "${need_files[@]}"; do
  [ -e "$APP_DIR/$f" ] || { warn "ناقص: $f"; missing=1; }
done
[ "$missing" = 0 ] || die "كود المرحلة غير موجود. اسحبه أولًا:  task deploy"
ok "ملفات المرحلة موجودة"

# ───────── 2) الأسرار الخاصة بالمرحلة ─────────
say "الأسرار"
bash /usr/local/bin/task env 2>/dev/null || TASK_APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/task" env

# ───────── 3) الحاويات (api + web صارتا معرّفتين في compose) ─────────
say "بناء وتشغيل الخدمات"
compose_valid
dc up -d --build --remove-orphans
for s in postgres redis api web; do
  svc_defined "$s" || continue
  retry 60 2 svc_healthy "$s" || die "الخدمة $s لم تصبح جاهزة — اكتب: task logs $s"
  ok "$s جاهزة"
done

# ───────── 4) قاعدة البيانات ─────────
say "ترحيلات Prisma"
dc exec -T api npx prisma migrate deploy
ok "الترحيلات مطبَّقة"

if ! is_done "phase${PHASE}-seed"; then
  say "البيانات التجريبية (مستخدم لكل دور)"
  dc exec -T api npx prisma db seed
  mark_done "phase${PHASE}-seed"
  ok "أُضيفت"
else
  ok "البيانات التجريبية مضافة مسبقًا (لإعادتها: احذف $STATE_DIR/phase${PHASE}-seed)"
fi

# ───────── 5) nginx: من صفحة ثابتة إلى توجيه للتطبيق ─────────
say "تحويل nginx إلى التطبيق"
need_root
TASK_APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/task" nginx

# ───────── 6) حماية مسارات الدخول من التخمين ─────────
if ! is_done "phase${PHASE}-limitreq"; then
  say "fail2ban: سجن nginx-limit-req"
  cat > /etc/fail2ban/jail.d/task-limit-req.local <<'EOF'
[nginx-limit-req]
enabled  = true
port     = 443
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
findtime = 10m
EOF
  fail2ban-client reload >/dev/null 2>&1 || systemctl restart fail2ban
  mark_done "phase${PHASE}-limitreq"
  ok "مفعّل"
fi

# ───────── 7) التحقق من معايير القبول ─────────
say "فحص معايير القبول"
bash "$APP_DIR/scripts/verify.sh" || die "الفحص الشامل لم ينجح"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "$@"; }
c="$(code "https://$DOMAIN/login")"
[ "$c" = 200 ] || warn "صفحة الدخول أعادت $c"
c="$(code -X POST -H 'Content-Type: application/json' \
      -d '{"employeeNo":"x","password":"y"}' "https://$DOMAIN/api/v1/auth/login")"
[ "$c" = 401 ] || [ "$c" = 400 ] \
  && ok "الـ API يرفض بيانات خاطئة ($c)" \
  || warn "الدخول بخطأ أعاد $c (المتوقع 401) — تحقق من استثناءات WAF لطلبات JSON"

mark_done "phase${PHASE}"
echo
ok "المرحلة $PHASE اكتملت"
cat <<EOF

  افتح:  https://$DOMAIN
  ادخل ببيانات الحساب التجريبي المطبوعة من seed.

  ثم:  احفظ عملك ←  git add -A && git commit -m "phase $PHASE" && git push
EOF
