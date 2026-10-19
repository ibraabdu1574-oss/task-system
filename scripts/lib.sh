#!/usr/bin/env bash
# مكتبة مشتركة لكل سكربتات المشروع — تُستدعى بـ: source "$(dirname "$0")/lib.sh"
# لا تُشغَّل مباشرة.

set -euo pipefail

# ───────── المسارات والثوابت ─────────
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="$APP_DIR/.env"
STATE_DIR="$APP_DIR/.state"          # علامات ما نُفِّذ (خارج git)
DOMAIN="${DOMAIN:-iat.sa}"
WEB_PORT=3000                         # Next.js  → 127.0.0.1:3000
API_PORT=3001                         # NestJS   → 127.0.0.1:3001
NGINX_SITE=/etc/nginx/sites-available/taskapp
CRS_EXCLUSIONS=/etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf

mkdir -p "$STATE_DIR"

# ───────── الطباعة ─────────
_c() { [ -t 1 ] && printf '\033[%sm' "$1" || true; }
say()  { echo -e "\n$(_c '1;36')==> $*$(_c 0)"; }
ok()   { echo -e "$(_c '1;32')✓$(_c 0) $*"; }
warn() { echo -e "$(_c '1;33')!$(_c 0) $*"; }
die()  { echo -e "\n$(_c '1;31')✗ $*$(_c 0)" >&2; exit 1; }

# ───────── أدوات ─────────
have()      { command -v "$1" >/dev/null 2>&1; }
is_root()   { [ "$(id -u)" = 0 ]; }
need_root() { is_root || die "هذه العملية تحتاج sudo"; }

# علامات الحالة: mark_done <اسم> / is_done <اسم>
mark_done() { touch "$STATE_DIR/$1"; }
is_done()   { [ -f "$STATE_DIR/$1" ]; }

# انتظر حتى ينجح أمر، أو افشل بعد N محاولة.  retry <محاولات> <ثوانٍ> <أمر...>
retry() {
  local tries="$1" gap="$2"; shift 2
  local i
  for i in $(seq 1 "$tries"); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep "$gap"
  done
  return 1
}

# سرّ عشوائي آمن
gen_secret() { openssl rand -hex 32; }

# اقرأ قيمة من .env بلا تنفيذه
env_get() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 || true; }

# أضف متغيّرًا إلى .env إن لم يكن موجودًا (لا يلمس القيم القائمة)
env_ensure() {
  local key="$1" val="$2"
  [ -f "$ENV_FILE" ] || { install -m 600 /dev/null "$ENV_FILE"; }
  if ! grep -q "^$key=" "$ENV_FILE" 2>/dev/null; then
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    return 0   # أُضيف
  fi
  return 1     # موجود مسبقًا
}

# ───────── Docker Compose ─────────
dc() { (cd "$APP_DIR" && docker compose "$@"); }

# هل الخدمة معرّفة في compose؟
svc_defined() { dc config --services 2>/dev/null | grep -qx "$1"; }

# هل الحاوية سليمة (healthy أو running بلا healthcheck)؟
svc_healthy() {
  local cid st
  cid="$(dc ps -q "$1" 2>/dev/null)" || return 1
  [ -n "$cid" ] || return 1
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null)"
  [ "$st" = healthy ] || [ "$st" = running ]
}

# ───────── تحقق قبل التطبيق (نمط راصد) ─────────
nginx_apply() {
  need_root
  nginx -t || die "إعداد nginx غير صالح — لم يُطبَّق أي تغيير"
  systemctl reload nginx
  ok "nginx أُعيد تحميله"
}

compose_valid() { dc config >/dev/null 2>&1 || die "docker-compose.yml غير صالح"; }
