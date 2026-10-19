#!/usr/bin/env bash
# bootstrap.sh — تهيئة الخادم لاستقبال المشروع. آمن للتكرار.
#   sudo bash scripts/bootstrap.sh
# ما يفعله: يتحقق من المتطلبات، يثبّت أمر `task`، يكمل أسرار .env،
#           يشغّل postgres/redis، ويطبّق إعداد nginx.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$APP_DIR/scripts/lib.sh"

REAL_USER="${SUDO_USER:-$(id -un)}"

say "تهيئة نظام المهام في $APP_DIR"

# ───────── 1) المتطلبات ─────────
say "فحص المتطلبات"
have docker  || die "Docker غير مثبّت. راجع SERVER-SETUP.md"
docker compose version >/dev/null 2>&1 || die "إضافة docker compose غير مثبّتة"
have git     || die "git غير مثبّت"
have openssl || die "openssl غير مثبّت"
have nginx   || warn "nginx غير مثبّت — تخطّي خطوة nginx"
ok "المتطلبات متوفرة"

# ───────── 2) أمر task ─────────
if is_root; then
  say "تثبيت أمر task"
  install -m 755 "$APP_DIR/scripts/task" /usr/local/bin/task
  # ثبّت جذر المشروع داخل الأمر حتى يعمل من أي مجلد
  sed -i "s|^APP_DIR=\"\${TASK_APP_DIR:-.*}\"|APP_DIR=\"\${TASK_APP_DIR:-$APP_DIR}\"|" /usr/local/bin/task
  ok "اكتب الآن: task help"
else
  warn "بلا sudo — لم يُثبَّت أمر task عالميًا. استخدم: bash scripts/task …"
fi

# ───────── 3) الأسرار ─────────
say "الأسرار"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    warn ".env غير موجود — أُنشئ من .env.example، املأ قيم قاعدة البيانات ثم أعد التشغيل"
    install -m 600 "$APP_DIR/.env.example" "$ENV_FILE"
  else
    install -m 600 /dev/null "$ENV_FILE"
  fi
fi
env_ensure JWT_ACCESS_SECRET  "$(gen_secret)"   >/dev/null && ok "وُلِّد JWT_ACCESS_SECRET"
env_ensure JWT_REFRESH_SECRET "$(gen_secret)"   >/dev/null && ok "وُلِّد JWT_REFRESH_SECRET"
env_ensure NODE_ENV           "development"     >/dev/null || true
env_ensure WEB_PORT           "$WEB_PORT"       >/dev/null || true
env_ensure API_PORT           "$API_PORT"       >/dev/null || true
env_ensure PUBLIC_URL         "https://$DOMAIN" >/dev/null || true
chmod 600 "$ENV_FILE"
is_root && chown "$REAL_USER":"$REAL_USER" "$ENV_FILE"
grep -q '^DATABASE_URL=' "$ENV_FILE" || warn "DATABASE_URL ناقص في .env"
ok ".env جاهز (600)"

# تأكّد أن الأسرار لا تدخل git
if ! git -C "$APP_DIR" check-ignore -q .env 2>/dev/null; then
  die ".env ليس ضمن .gitignore — أوقف كل شيء وأصلح هذا أولًا"
fi
ok ".env مستثنى من git"

# ───────── 4) الحاويات ─────────
say "تشغيل قاعدة البيانات والذاكرة المؤقتة"
compose_valid
if is_root; then sudo -u "$REAL_USER" docker compose -f "$APP_DIR/docker-compose.yml" up -d --remove-orphans
else dc up -d --remove-orphans; fi
for s in postgres redis; do
  svc_defined "$s" || continue
  retry 30 2 svc_healthy "$s" || die "$s لم تصبح جاهزة — اكتب: task logs $s"
  ok "$s جاهزة"
done

# ───────── 5) nginx ─────────
if have nginx && is_root; then
  if [ -f "$APP_DIR/deploy/nginx/taskapp.conf.tmpl" ]; then
    TASK_APP_DIR="$APP_DIR" bash /usr/local/bin/task nginx || warn "تخطّي nginx"
  fi
fi

mark_done bootstrap
echo
ok "التهيئة اكتملت"
cat <<EOF

الخطوات التالية:
  1) اربط المستودع بـ GitHub:     task deploy-key
  2) شغّل تهيئة الكتلة أ:          sudo task phase A
  3) فحص شامل:                    task verify
  4) بعدها يوميًا:                 task deploy
EOF
