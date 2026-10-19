#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  المرحلة 0 — تجهيز وتحصين خادم نظام المهام (Ubuntu 24.04)
#
#  الأوامر:
#     sudo bash scripts/00-server.sh             ← المرحلة 1: كل شيء، والمنفذ 22 يبقى مفتوحًا مؤقتًا
#     sudo bash scripts/00-server.sh --finish    ← المرحلة 2: إغلاق 22 بعد إثبات الدخول على 2244
#     sudo bash scripts/00-server.sh --status    ← فحص شامل ✓/✗ (في أي وقت وبعد كل إعادة تشغيل)
#     sudo bash scripts/00-server.sh --force     ← إعادة المرحلة 1 بعد اكتمال التحصين (يفتح 22 مؤقتًا)
#
#  آمن للتكرار: كل قاعدة تحمل وسم "task-…"، ويُحذف القديم بوسمه قبل الإضافة.
#  ترتيب مقصود: الجدار الناري و fail2ban أولًا، و SSH آخر خطوة.
#
#  ⚠ قبل المتابعة اختبر Recovery Console في لوحة DigitalOcean (Droplet ← Access ← Recovery Console).
#    Droplet Console العادي يمر عبر الشبكة و SSH، فيُحجب بالحصر الجغرافي — ليس مسار طوارئ.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ───────────────── المعطيات ─────────────────
SYSTEM_NAME=task
ADMIN_USER=devadmin
SSH_PORT=2244
ENV="${ENV:-cloud-dev}"                 # cloud-dev (DigitalOcean) | internal-prod (خادم داخلي)
INTERNAL_NETS="${INTERNAL_NETS:-10.0.0.0/8 172.16.0.0/12 192.168.0.0/16}"   # للإنتاج الداخلي فقط
USE_KEYS="${USE_KEYS:-0}"               # 1 = تعطيل الدخول بكلمة المرور (بعد التأكد من authorized_keys)
CERT_FILE="${CERT_FILE:-}"              # internal-prod: شهادة الجهة (fullchain) ومفتاحها
KEY_FILE="${KEY_FILE:-}"

APP_DIR=/home/$ADMIN_USER/task-system
CONF=/etc/$SYSTEM_NAME-deploy.conf      # DOMAIN و EMAIL
MARK=/etc/$SYSTEM_NAME-hardened         # stage1 | done
PKG_MARK=/etc/$SYSTEM_NAME-packages-done
GEO_DIR=/etc/$SYSTEM_NAME-geo
DO_INI=/root/.secrets/certbot/digitalocean.ini
SSHD_CONF=/etc/ssh/sshd_config.d/10-hardening.conf   # 10 حتى يُقرأ قبل 50-cloud-init.conf (أول قيمة تُعتمد)
BR=/etc/ufw/before.rules
TAG=$SYSTEM_NAME-geo
ROLLBACK_UNIT=$SYSTEM_NAME-ufw-rollback
MOTD=/etc/update-motd.d/99-$SYSTEM_NAME-port22
JAIL=/etc/fail2ban/jail.d/$SYSTEM_NAME.local

# ───────────────── أدوات ─────────────────
_c(){ [ -t 1 ] && printf '\033[%sm' "$1" || true; }
say(){ echo -e "\n$(_c '1;36')==> $*$(_c 0)"; }
ok(){ echo -e "$(_c '1;32')✓$(_c 0) $*"; }
warn(){ echo -e "$(_c '1;33')! $*$(_c 0)"; }
bad(){ echo -e "$(_c '1;31')✗$(_c 0) $*"; }
die(){ echo -e "\n$(_c '1;31')✗ $*$(_c 0)" >&2; exit 1; }
# كل إدخال يُقرأ من /dev/tty: عند لصق أوامر متتالية، أي read عادي يبتلع الأسطر التالية كإجابة
ask(){ local p="$1" d="${2:-}" a; read -r -p "$p" a </dev/tty || true; echo "${a:-$d}"; }
state(){ cat "$MARK" 2>/dev/null || echo none; }

[ "$(id -u)" = 0 ] || die "شغّله بـ sudo"
. /etc/os-release 2>/dev/null || true
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = "24.04" ] || die "هذا السكربت لـ Ubuntu 24.04 فقط (وجدت: ${PRETTY_NAME:-غير معروف})"
export DEBIAN_FRONTEND=noninteractive
[ -f "$CONF" ] && . "$CONF"

# ═══════════════════════════════════════════════════════════════════════════
#  --status : الفحص الشامل
# ═══════════════════════════════════════════════════════════════════════════
cmd_status(){
  local FAIL=0
  chk(){ if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; FAIL=1; fi; }
  say "1) SSH"
  local T; T="$(sshd -T 2>/dev/null || true)"
  chk "المنفذ $SSH_PORT"          "grep -qx 'port $SSH_PORT' <<<\"\$T\""
  if [ "$(state)" = done ]; then chk "المنفذ 22 مغلق" "! grep -qx 'port 22' <<<\"\$T\""
  else grep -qx 'port 22' <<<"$T" && warn "المنفذ 22 ما زال مفتوحًا (المرحلة 2 لم تُنفَّذ)"; fi
  chk "IPv4 فقط"                  "grep -qx 'addressfamily inet' <<<\"\$T\""
  chk "root ممنوع"                "grep -qx 'permitrootlogin no' <<<\"\$T\""
  chk "AllowUsers $ADMIN_USER"    "grep -qx 'allowusers $ADMIN_USER' <<<\"\$T\""
  say "2) الجدار الناري"
  chk "ufw فعّال"                 "ufw status | head -1 | grep -q active"
  chk "ufw مفعّل عند الإقلاع"     "grep -qx 'ENABLED=yes' /etc/ufw/ufw.conf && systemctl is-enabled ufw"
  chk "لا قاعدة للمنفذ 80"        "! ufw status | grep -qE '^80(/tcp)?\s'"
  if [ "$ENV" = cloud-dev ]; then
    say "3) الحصر الجغرافي"
    local n; n="$(ipset list geo_sa 2>/dev/null | sed -n 's/^Number of entries: //p')"
    chk "geo_sa: ${n:-0} نطاق (> 300)"  "[ \"${n:-0}\" -gt 300 ]"
    chk "قاعدتا $TAG في before.rules"   "[ \"\$(grep -c \"$TAG\" $BR)\" = 2 ]"
    chk "القاعدتان محمّلتان في iptables" "[ \"\$(iptables -S ufw-before-input | grep -c \"$TAG\")\" = 2 ]"
    chk "مؤقت التحديث الأسبوعي"     "systemctl is-active $SYSTEM_NAME-geo-update.timer"
    systemctl is-active "$ROLLBACK_UNIT.timer" >/dev/null 2>&1 && warn "مؤقت التراجع ما زال نشطًا — سيُلغى في --finish"
  fi
  say "4) fail2ban"
  chk "السجون: $(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:\s*//p')" "fail2ban-client status | grep -q sshd"
  say "5) النظام"
  chk "IPv6 معطّل"                "[ \"\$(sysctl -n net.ipv6.conf.all.disable_ipv6)\" = 1 ]"
  chk "Swap موجود"                "swapon --show | grep -q ."
  say "6) المنافذ المستمعة على غير 127.0.0.1 (المسموح: $SSH_PORT و443 فقط)"
  local p open=0
  while read -r p; do
    if [ "$p" = "$SSH_PORT" ] || [ "$p" = 443 ] || { [ "$p" = 22 ] && [ "$(state)" != done ]; }; then ok "المنفذ $p"
    else bad "المنفذ $p مكشوف"; open=1; fi
  done < <(ss -tlnH | awk '{print $4}' | grep -vE '^(127\.|\[::1\])' | sed 's/.*://' | sort -un)
  [ "$open" = 0 ] || FAIL=1
  if command -v docker >/dev/null; then
    say "7) Docker"
    chk "daemon.json يربط بـ 127.0.0.1" "grep -q '\"ip\": *\"127.0.0.1\"' /etc/docker/daemon.json"
    chk "لا حاوية تنشر منفذًا على 0.0.0.0" "! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q '0.0.0.0'"
  fi
  if [ -n "${DOMAIN:-}" ] && command -v nginx >/dev/null; then
    say "8) HTTPS و WAF"
    # --resolve ضروري: عنوان الخادم العام ليس سعوديًا فيحجبه الحصر الجغرافي من داخله
    code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "$1" 2>/dev/null || echo 000; }
    chk "https://$DOMAIN → 200"         "[ \"\$(code https://$DOMAIN/)\" = 200 ]"
    chk "WAF يحجب SQLi → 403"           "[ \"\$(code \"https://$DOMAIN/?id=1%27%20OR%20%271%27=%271\")\" = 403 ]"
    chk "لا استماع على 80 أو [::]"       "! ss -tlnH | grep -qE ':80 |\[::\]:443'"
    chk "server_tokens off"             "nginx -T 2>/dev/null | grep -q '^\s*server_tokens off'"
    chk "ssl_reject_handshake للأسماء الأخرى" "nginx -T 2>/dev/null | grep -q ssl_reject_handshake"
    chk "SecRuleEngine On"              "grep -q '^SecRuleEngine On' /etc/nginx/modsecurity.conf"
    if [ "$ENV" = cloud-dev ]; then
      chk "الشهادة تنتهي: $(certbot certificates 2>/dev/null | sed -n 's/.*Expiry Date: \([^ ]*\).*/\1/p' | head -1)" "certbot certificates 2>/dev/null | grep -q VALID"
      chk "مؤقت تجديد certbot"          "systemctl is-active certbot.timer"
    fi
  fi
  say "9) الحالة"
  case "$(state)" in
    done)   ok "التحصين مكتمل (done)";;
    stage1) warn "المرحلة 1 فقط — المنفذ 22 مفتوح للعالم. بعد إثبات الدخول على $SSH_PORT: sudo task harden --finish";;
    *)      bad "لم يُنفَّذ التحصين"; FAIL=1;;
  esac
  echo; [ "$FAIL" = 0 ] && ok "كل الفحوص نجحت" || die "فشل فحص واحد على الأقل — راجع أعلاه"
}

# ═══════════════════════════════════════════════════════════════════════════
#  SSH (مشترك بين المرحلتين)
# ═══════════════════════════════════════════════════════════════════════════
write_sshd(){ # $1 = 1 لإبقاء المنفذ 22
  local pw=yes
  if [ "$USE_KEYS" = 1 ]; then
    [ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ] || die "USE_KEYS=1 لكن لا يوجد authorized_keys للمستخدم $ADMIN_USER"
    pw=no
  fi
  cat > "$SSHD_CONF" <<EOF
# نظام المهام — تحصين SSH (يكتبه scripts/00-server.sh)
$( [ "$1" = 1 ] && printf '# المنفذ 22 مؤقت حتى: sudo task harden --finish\nPort 22' )
Port $SSH_PORT
AddressFamily inet
ListenAddress 0.0.0.0
PermitRootLogin no
AllowUsers $ADMIN_USER
MaxAuthTries 3
LoginGraceTime 30
PasswordAuthentication $pw
KbdInteractiveAuthentication no
PermitEmptyPasswords no
X11Forwarding no
EOF
  chmod 644 "$SSHD_CONF"; install -d -m 755 /run/sshd
  sshd -t || die "إعداد SSH غير صالح — لم يُطبَّق"
  # Ubuntu 24.04 يشغّل SSH عبر ssh.socket: المنفذ يُقرأ من الإعداد بعد daemon-reload، وإعادة ssh وحده لا تكفي
  systemctl daemon-reload
  if systemctl is-enabled ssh.socket >/dev/null 2>&1; then
    systemctl restart ssh.socket; systemctl restart ssh.service 2>/dev/null || true
  else
    systemctl restart ssh.service
  fi
  sleep 1
  ss -ltn | grep -q ":$SSH_PORT " || die "SSH لا يستمع على $SSH_PORT — لا تغلق جلستك الحالية"
}

# القاعدتان في آخر سلسلة ufw-before-input قبل COMMIT، أي بعد قاعدة الاتصالات القائمة:
# الحصر يُطبَّق على الاتصالات الجديدة فقط، ولا تنقطع جلسة قائمة إن خرج عنوانها بالتحديث.
apply_geo_rules(){
  [ "$(grep -c '^COMMIT$' "$BR")" = 1 ] || die "وجدت أكثر من سطر COMMIT في $BR — راجعه يدويًا"
  cp -n "$BR" "$BR.orig" 2>/dev/null || true
  sed "/$TAG/d" "$BR" > "$BR.bak"          # النسخة الاحتياطية = الملف بلا قواعدنا
  sed -i "/$TAG/d" "$BR"
  sed -i "/^COMMIT$/i\\
-A ufw-before-input -p tcp -m multiport --dports $SSH_PORT,443 -m set --match-set geo_sa src -m comment --comment $TAG -j ACCEPT\\
-A ufw-before-input -p tcp -m multiport --dports $SSH_PORT,443 -m comment --comment $TAG -j DROP" "$BR"
  [ "$(grep -c "$TAG" "$BR")" = 2 ] || { cp "$BR.bak" "$BR"; die "فشل إدراج قواعد الحصر — أُعيد $BR"; }
  iptables-restore --test < "$BR" || { cp "$BR.bak" "$BR"; die "قواعد $BR غير صالحة — أُعيد الأصل"; }
  ufw reload >/dev/null
}

# ═══════════════════════════════════════════════════════════════════════════
#  --finish : المرحلة 2
# ═══════════════════════════════════════════════════════════════════════════
cmd_finish(){
  [ "$(state)" = stage1 ] || die "الحالة الحالية: $(state). المرحلة 2 تعمل فقط بعد المرحلة 1 (stage1)."
  # لا نغلق 22 إلا بعد إثبات أنك متصل فعلًا عبر المنفذ الجديد
  ss -tn state established "( sport = :$SSH_PORT )" | grep -q ":$SSH_PORT" \
    || die "لا يوجد اتصال SSH قائم على المنفذ $SSH_PORT.
   ادخل أولًا من جهازك:  ssh -p $SSH_PORT $ADMIN_USER@<IP>   ثم أعد الأمر من تلك النافذة."
  say "إغلاق المنفذ 22"
  write_sshd 0
  ufw delete allow 22/tcp >/dev/null 2>&1 || true
  ufw delete allow OpenSSH >/dev/null 2>&1 || true
  ufw reload >/dev/null
  sed -i "s/^port *= *22,$SSH_PORT$/port = $SSH_PORT/" "$JAIL"
  fail2ban-client -t >/dev/null && { fail2ban-client reload >/dev/null 2>&1 || systemctl restart fail2ban; }
  systemctl stop "$ROLLBACK_UNIT.timer" "$ROLLBACK_UNIT.service" 2>/dev/null || true
  # إن كان التراجع التلقائي قد أزال قواعد الحصر (تأخرت أكثر من 5 دقائق) نعيدها الآن بلا مؤقت
  if [ "$ENV" = cloud-dev ] && [ "$(grep -c "$TAG" "$BR")" != 2 ]; then apply_geo_rules; ok "أُعيدت قواعد الحصر الجغرافي"; fi
  rm -f "$MOTD"
  echo done > "$MARK"
  ok "اكتمل التحصين — الدخول الآن فقط عبر: ssh -p $SSH_PORT $ADMIN_USER@<IP>"
  echo "   للطوارئ: لوحة DigitalOcean ← Droplet ← Access ← Recovery Console"
}

# ═══════════════════════════════════════════════════════════════════════════
#  المرحلة 1
# ═══════════════════════════════════════════════════════════════════════════
case "${1:-}" in
  --status) cmd_status; exit $? ;;
  --finish) cmd_finish; exit 0 ;;
  --force|'') ;;
  *) die "خيار غير معروف: $1  (الخيارات: --finish | --status | --force)" ;;
esac
if [ "$(state)" = done ] && [ "${1:-}" != --force ]; then
  die "التحصين مكتمل. إعادة المرحلة الأولى تفتح المنفذ 22 مؤقتًا من جديد؛ إن أردت ذلك: sudo bash $0 --force"
fi

# ───────────────── فحوص ما قبل التشغيل ─────────────────
say "فحوص ما قبل التشغيل"
echo "  ⚠ اختبر Recovery Console في لوحة DigitalOcean الآن إن لم تفعل (ليس Droplet Console)."
# شهادات قائمة بغير DNS-01 سيفشل تجديدها بعد إغلاق 80 والحصر الجغرافي
for r in /etc/letsencrypt/renewal/*.conf; do
  [ -f "$r" ] || continue
  a="$(sed -n 's/^authenticator *= *//p' "$r")"
  case "$a" in webroot|nginx|standalone) warn "شهادة $(basename "$r" .conf) تستخدم $a — التجديد سيفشل بعد التحصين؛ حوّلها إلى DNS-01";; esac
done

# ───────────────── الإعدادات ─────────────────
if [ -z "${DOMAIN:-}" ]; then
  DOMAIN="$(ask "نطاق الخادم (مثل dev.iat.sa): ")"
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "نطاق غير صالح"
  EMAIL="$(ask "بريدك (لتنبيهات شهادة HTTPS): ")"; [ -n "$EMAIL" ] || die "البريد مطلوب"
  printf "DOMAIN='%s'\nEMAIL='%s'\n" "$DOMAIN" "$EMAIL" > "$CONF"; chmod 600 "$CONF"
fi
ok "النطاق: $DOMAIN · البيئة: $ENV"
[ "$ENV" = internal-prod ] && { [ -s "$CERT_FILE" ] && [ -s "$KEY_FILE" ] || die "internal-prod يحتاج CERT_FILE و KEY_FILE (شهادة الجهة الداخلية، تتضمن IP الخادم في SAN)"; }

# ───────────────── 1) الحزم ─────────────────
if [ ! -f "$PKG_MARK" ]; then
  say "تثبيت الحزم (قد يستغرق دقائق)"
  apt-get update -y -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw ipset fail2ban nftables python3-systemd \
      nginx libnginx-mod-http-modsecurity modsecurity-crs unattended-upgrades
  [ "$ENV" = cloud-dev ] && apt-get install -y -qq certbot python3-certbot-dns-digitalocean
  apt-get install -y -qq python3-pyasyncore 2>/dev/null || true   # لخطأ asynchat في fail2ban على بايثون حديثة
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  touch "$PKG_MARK"; ok "الحزم جاهزة"
fi

# ───────────────── 2) Docker: يتجاوز ufw، فأي منفذ منشور على 0.0.0.0 يُكشف للعالم ─────────────────
cat > /etc/docker/daemon.json <<'EOF'
{
  "ip": "127.0.0.1",
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl enable docker >/dev/null 2>&1 || true
systemctl restart docker
ok "Docker مربوط بـ 127.0.0.1 (واكتب 127.0.0.1: صراحةً في كل ports داخل compose)"

# ───────────────── 3) المستخدم الإداري ─────────────────
# مجموعة docker تعادل root: لا يُضاف إليها إلا المستخدم الإداري وحده (يحتاجها لأمر task)
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  say "إنشاء المستخدم $ADMIN_USER"
  useradd -m -s /bin/bash -G sudo,docker "$ADMIN_USER"
else
  usermod -aG sudo,docker "$ADMIN_USER"
fi
# المرحلة 1 تمنع دخول root فورًا، فلا بد من كلمة مرور فعلية (passwd -S يعرض P)
if ! passwd -S "$ADMIN_USER" | awk '{exit $2!="P"}'; then
  say "كلمة مرور $ADMIN_USER (16 حرفًا فأكثر — للدخول و sudo)"
  PW=""; PW2="x"
  while [ ${#PW} -lt 16 ] || [ "$PW" != "$PW2" ]; do
    read -r -s -p "كلمة المرور: " PW </dev/tty; echo
    read -r -s -p "أعدها للتأكيد: " PW2 </dev/tty; echo
    [ "$PW" = "$PW2" ] || echo "غير متطابقتين"
  done
  printf '%s:%s\n' "$ADMIN_USER" "$PW" | chpasswd; unset PW PW2
fi
ok "المستخدم $ADMIN_USER جاهز"

# ───────────────── 4) مجلد المشروع وأمر task ─────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  install -d -o "$ADMIN_USER" -g "$ADMIN_USER" "$APP_DIR"
  sudo -u "$ADMIN_USER" git -C "$APP_DIR" init -q -b main
  sudo -u "$ADMIN_USER" git config --global init.defaultBranch main
  sudo -u "$ADMIN_USER" git config --global core.autocrlf input
  sudo -u "$ADMIN_USER" git config --global user.name  "$ADMIN_USER"
  sudo -u "$ADMIN_USER" git config --global user.email "$EMAIL"
fi
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$SRC" != "$APP_DIR" ] && [ -d "$SRC/scripts" ]; then
  cp -r "$SRC/scripts" "$SRC/deploy" "$APP_DIR/" 2>/dev/null || true
  chown -R "$ADMIN_USER":"$ADMIN_USER" "$APP_DIR"
fi
install -m 755 "$APP_DIR/scripts/task" /usr/local/bin/task
sed -i "s|^APP_DIR=\"\${TASK_APP_DIR:-.*}\"|APP_DIR=\"\${TASK_APP_DIR:-$APP_DIR}\"|" /usr/local/bin/task
ok "المشروع في $APP_DIR · الأمر task مثبّت"

# ───────────────── 5) Swap (إن كانت الذاكرة ≤ 4GB ولا يوجد swap) ─────────────────
if ! swapon --show | grep -q . && [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -le 4096 ]; then
  say "ذاكرة احتياطية 2G"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  findmnt --verify >/dev/null || die "fstab غير صالح بعد إضافة swap — أصلحه قبل أي إعادة تشغيل"
  echo 'vm.swappiness = 10' > /etc/sysctl.d/99-$SYSTEM_NAME-swap.conf
  ok "مضافة"
fi

# ───────────────── 6) تعطيل IPv6 (بـ sysctl لا GRUB: تعطيله من GRUB يكسر ssh.socket) ─────────────────
cat > /etc/sysctl.d/99-$SYSTEM_NAME-no-ipv6.conf <<'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF
sysctl -q --system >/dev/null 2>&1 || true
# IPV6=yes في ufw: القيمة no لا تغلق IPv6 بل توقف حماية ufw له. عناوين fe80:: من netplan مقبولة (غير قابلة للوصول من الإنترنت)
sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
ok "IPv6 معطّل"

# ───────────────── 7) الحصر الجغرافي للسعودية (cloud-dev فقط) ─────────────────
if [ "$ENV" = cloud-dev ]; then
  say "الحصر الجغرافي (عناوين السعودية فقط)"
  install -d -m 755 "$GEO_DIR"
  [ -f "$GEO_DIR/allow-extra.txt" ] || cat > "$GEO_DIR/allow-extra.txt" <<'EOF'
# نطاقات إضافية مسموحة من خارج السعودية (سطر لكل نطاق مثل 203.0.113.7/32)، ثم: sudo task-geo-update
EOF
  cat > /usr/local/sbin/$SYSTEM_NAME-geo-update <<'GEOEOF'
#!/usr/bin/env bash
# تحديث مجموعة geo_sa: نطاقات السعودية (ipdeny) + عناوين iCloud Private Relay المصنّفة SA
# + النطاقات الإضافية في /etc/task-geo/allow-extra.txt. تحقق، ثم تبديل ذري (ipset swap)، ثم حفظ على القرص.
#   --boot = تحميل من النسخة المحفوظة بلا إنترنت (عند الإقلاع قبل ufw)
# المجموعة تُنشأ دائمًا ولو فارغة: ufw يفشل كليًا عند الإقلاع إن أشارت قاعدته إلى مجموعة غير موجودة.
set -euo pipefail
DIR=/etc/task-geo; SET=geo_sa; MIN_SA=300
IPV4='^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$'
log(){ echo "$(date '+%F %T') $*"; logger -t task-geo "$*" 2>/dev/null || true; }
ensure(){ ipset list -n 2>/dev/null | grep -qx "$1" || ipset create "$1" hash:net family inet hashsize 4096 maxelem 65536; }

if [ "${1:-}" = --boot ]; then
  ensure $SET
  if [ -s "$DIR/$SET.save" ]; then
    grep -E "^add $SET " "$DIR/$SET.save" | ipset restore -exist
    log "boot: حُمِّل $(ipset list $SET | sed -n 's/^Number of entries: //p') نطاقًا"; exit 0
  fi
  log "boot: لا نسخة محفوظة — المجموعة فارغة (الحصر يحجب الجميع حتى التحديث)"; exit 0
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"; ipset destroy ${SET}_new 2>/dev/null || true' EXIT
curl -fsS --max-time 60 --retry 3 https://www.ipdeny.com/ipblocks/data/aggregated/sa-aggregated.zone -o "$tmp/sa.zone" \
  || { log "تعذّر تنزيل قائمة ipdeny؛ أُبقيت القائمة الحالية"; exit 1; }
grep -E "$IPV4" "$tmp/sa.zone" > "$tmp/list" || true
n_sa=$(wc -l < "$tmp/list")
bad_lines=$(grep -vE "$IPV4" "$tmp/sa.zone" | grep -cvE '^\s*(#|$)' || true)
[ "$n_sa" -ge "$MIN_SA" ] || { log "ipdeny أعاد $n_sa نطاقًا فقط؛ أُبقيت القائمة الحالية"; exit 1; }
[ "$bad_lines" = 0 ] || { log "قائمة ipdeny تحوي $bad_lines سطرًا غير صالح؛ أُبقيت القائمة الحالية"; exit 1; }

# iCloud Private Relay (Safari على الآيفون): عناوين الخروج المصنّفة للسعودية
if curl -fsS --max-time 180 --retry 2 https://mask-api.icloud.com/egress-ip-ranges.csv -o "$tmp/relay.csv"; then
  awk -F, '$2=="SA"{print $1}' "$tmp/relay.csv" | grep -E "$IPV4" > "$tmp/relay" || true
  [ -s "$tmp/relay" ] && cp "$tmp/relay" "$DIR/relay-sa.txt"
else
  log "تعذّر تنزيل قائمة Private Relay؛ أستخدم آخر نسخة محفوظة"
fi
[ -f "$DIR/relay-sa.txt" ] && cat "$DIR/relay-sa.txt" >> "$tmp/list"
n_relay=$( [ -f "$DIR/relay-sa.txt" ] && wc -l < "$DIR/relay-sa.txt" || echo 0 )
[ -f "$DIR/allow-extra.txt" ] && grep -E "$IPV4" "$DIR/allow-extra.txt" >> "$tmp/list" || true
sort -u "$tmp/list" -o "$tmp/list"
total=$(wc -l < "$tmp/list")

ipset destroy ${SET}_new 2>/dev/null || true
ipset create ${SET}_new hash:net family inet hashsize 4096 maxelem 65536
sed "s/^/add ${SET}_new /" "$tmp/list" | ipset restore -exist
ensure $SET
ipset swap ${SET}_new $SET
ipset destroy ${SET}_new
ipset save $SET > "$DIR/$SET.save.tmp" && mv "$DIR/$SET.save.tmp" "$DIR/$SET.save"
log "geo_sa: $total نطاق (السعودية $n_sa، Private Relay $n_relay)"
GEOEOF
  chmod 755 /usr/local/sbin/$SYSTEM_NAME-geo-update
  cat > /etc/systemd/system/$SYSTEM_NAME-geo.service <<EOF
[Unit]
Description=Load geo_sa ipset before ufw
DefaultDependencies=no
After=local-fs.target
Before=ufw.service network-pre.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/$SYSTEM_NAME-geo-update --boot
[Install]
WantedBy=ufw.service multi-user.target
EOF
  cat > /etc/systemd/system/$SYSTEM_NAME-geo-update.service <<EOF
[Unit]
Description=Weekly refresh of geo_sa ipset
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/$SYSTEM_NAME-geo-update
EOF
  cat > /etc/systemd/system/$SYSTEM_NAME-geo-update.timer <<'EOF'
[Unit]
Description=Weekly refresh of geo_sa ipset
[Timer]
OnCalendar=Sun *-*-* 03:00:00 UTC
RandomizedDelaySec=30m
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  # لا بد أن ينجح التحميل قبل إضافة القاعدتين، وإلا يُحجب الجميع
  /usr/local/sbin/$SYSTEM_NAME-geo-update || die "تعذّر تحميل قائمة عناوين السعودية — لم يُطبَّق الحصر. أعد المحاولة لاحقًا."
  systemctl enable $SYSTEM_NAME-geo.service $SYSTEM_NAME-geo-update.timer >/dev/null 2>&1
  systemctl start $SYSTEM_NAME-geo-update.timer
  ok "$(ipset list geo_sa | sed -n 's/^Number of entries: //p') نطاقًا محمّلًا"
fi

# ───────────────── 8) الجدار الناري ufw ─────────────────
say "الجدار الناري: منع كل الوارد عدا $SSH_PORT و443 (+22 مؤقتًا)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw delete allow 80/tcp >/dev/null 2>&1 || true
ufw delete allow 80 >/dev/null 2>&1 || true
if [ "$ENV" = internal-prod ]; then
  # لا حصر جغرافي: السماح من الشبكات الداخلية فقط
  for n in $INTERNAL_NETS; do
    ufw allow from "$n" to any port "$SSH_PORT" proto tcp comment "$SYSTEM_NAME-internal" >/dev/null
    ufw allow from "$n" to any port 443 proto tcp comment "$SYSTEM_NAME-internal" >/dev/null
  done
else
  # لا تستخدم from 0.0.0.0/0 لقاعدة IPv4 فقط: ufw يعدّها مطابقة لـ Anywhere فلا يضيفها، ثم delete يحذف الأصلية ويُغلق المنفذ
  ufw allow "$SSH_PORT/tcp" >/dev/null
  ufw allow 443/tcp >/dev/null
fi
ufw allow 22/tcp >/dev/null      # مؤقت، بلا حصر جغرافي — مسار احتياطي أثناء الانتقال (يعمل معه Droplet Console)
sed -i 's/^ENABLED=.*/ENABLED=yes/' /etc/ufw/ufw.conf
systemctl enable ufw >/dev/null 2>&1 || true
ufw --force enable >/dev/null

if [ "$ENV" = cloud-dev ]; then
  apply_geo_rules
  # تراجع تلقائي بعد 5 دقائق إن أُقفلنا خارج الخادم؛ يُلغى في --finish بعد ثبوت الاتصال
  systemctl stop "$ROLLBACK_UNIT.timer" 2>/dev/null || true
  systemd-run --quiet --unit="$ROLLBACK_UNIT" --on-active=5min \
    /bin/sh -c "cp $BR.bak $BR && ufw reload && logger -t $TAG 'ROLLBACK: أُعيد before.rules الأصلي'"
  ok "الحصر الجغرافي مفعّل (تراجع تلقائي بعد 5 دقائق ما لم تُنفَّذ المرحلة 2)"
fi
ufw reload >/dev/null
ok "الجدار الناري مفعّل (المنفذ 22 مفتوح مؤقتًا)"

# ───────────────── 9) fail2ban ─────────────────
say "fail2ban"
cat > /etc/fail2ban/filter.d/nginx-modsecurity.conf <<'EOF'
[Definition]
failregex = ModSecurity: Access denied .*, client: <HOST>,
ignoreregex =
EOF
IGNORE="127.0.0.1/8"; [ "$ENV" = internal-prod ] && IGNORE="$IGNORE $INTERNAL_NETS"   # بوابات NAT: عدة موظفين بعنوان واحد
JPORT="22,$SSH_PORT"; [ "$(state)" = done ] && JPORT="$SSH_PORT"
# nftables لا ufw: قاعدة قبول الحصر الجغرافي تسبق قواعد ufw العادية، فحظر ufw لا يصيب مهاجمًا سعوديًا.
# جدول nftables يعمل قبل ufw كله.
cat > "$JAIL" <<EOF
[DEFAULT]
banaction = nftables-multiport
banaction_allports = nftables-allports
bantime  = 1h
findtime = 10m
bantime.increment = true
bantime.factor = 1
bantime.maxtime = 1w
ignoreip = $IGNORE

[sshd]
enabled  = true
port     = $JPORT
backend  = systemd
maxretry = 4

[nginx-modsecurity]
enabled  = true
port     = 443
filter   = nginx-modsecurity
logpath  = /var/log/nginx/error.log
backend  = auto
maxretry = 5

[nginx-limit-req]
enabled  = true
port     = 443
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF
touch /var/log/nginx/error.log
fail2ban-client -t >/dev/null || die "إعداد fail2ban غير صالح"
systemctl enable fail2ban >/dev/null 2>&1; systemctl restart fail2ban
for i in 1 2 3 4 5; do fail2ban-client status sshd >/dev/null 2>&1 && break; sleep 1; done
fail2ban-client set sshd banip 203.0.113.50 >/dev/null && fail2ban-client set sshd unbanip 203.0.113.50 >/dev/null \
  && ok "fail2ban يعمل (اختبار حظر/فكّ ناجح)" || warn "fail2ban يعمل لكن اختبار الحظر لم يُثبت"

# ───────────────── 10) شهادة HTTPS ─────────────────
if [ "$ENV" = cloud-dev ]; then
  if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    if [ ! -s "$DO_INI" ]; then
      echo; echo "الشهادة تُصدر عبر DNS-01 (لا نفتح المنفذ 80). تحتاج مفتاح DigitalOcean بصلاحية domain فقط:"
      echo "(API ← Generate New Token ← Custom Scopes ← domain: create/read/update/delete)"
      DO_TOKEN=""; while [ ${#DO_TOKEN} -lt 20 ]; do read -r -s -p "الصق المفتاح (لن يظهر): " DO_TOKEN </dev/tty; echo; done
      install -d -m 700 /root/.secrets /root/.secrets/certbot
      ( umask 077; printf 'dns_digitalocean_token = %s\n' "$DO_TOKEN" > "$DO_INI" ); unset DO_TOKEN
    fi
    chmod 600 "$DO_INI"
    say "إصدار شهادة $DOMAIN (دقيقة إلى دقيقتين)"
    certbot certonly --non-interactive --agree-tos -m "$EMAIL" \
      --dns-digitalocean --dns-digitalocean-credentials "$DO_INI" \
      --dns-digitalocean-propagation-seconds 60 --key-type ecdsa -d "$DOMAIN" \
      || die "فشل إصدار الشهادة. تأكد أن ${DOMAIN#*.} مُدار في DigitalOcean (Networking ← Domains) وأن المفتاح بصلاحية domain"
    ok "صدرت"
  fi
  install -d /etc/letsencrypt/renewal-hooks/deploy
  printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem; KEY=/etc/letsencrypt/live/$DOMAIN/privkey.pem; HSTS=86400
else
  install -d -m 755 /etc/ssl/$SYSTEM_NAME
  install -m 644 "$CERT_FILE" /etc/ssl/$SYSTEM_NAME/fullchain.pem
  install -m 600 "$KEY_FILE"  /etc/ssl/$SYSTEM_NAME/privkey.pem
  CERT=/etc/ssl/$SYSTEM_NAME/fullchain.pem; KEY=/etc/ssl/$SYSTEM_NAME/privkey.pem; HSTS=31536000
fi

# ───────────────── 11) nginx + ModSecurity/OWASP CRS ─────────────────
say "nginx + جدار حماية الويب"
# في Ubuntu 24.04 إعداد ModSecurity في /etc/nginx/modsecurity.conf و /etc/nginx/unicode.mapping (لا /etc/modsecurity)
[ -f /etc/nginx/modsecurity.conf ] || cp /etc/modsecurity/modsecurity.conf-recommended /etc/nginx/modsecurity.conf
sed -i 's/^SecRuleEngine .*/SecRuleEngine On/' /etc/nginx/modsecurity.conf
if [ ! -f /etc/nginx/unicode.mapping ]; then
  UM="$(find /etc/modsecurity /usr/share -name unicode.mapping -print -quit 2>/dev/null || true)"
  [ -n "$UM" ] && cp "$UM" /etc/nginx/unicode.mapping || die "لم أجد unicode.mapping"
fi
sed -i 's|^SecUnicodeMapFile .*|SecUnicodeMapFile /etc/nginx/unicode.mapping 20127|' /etc/nginx/modsecurity.conf
grep -q '^SecUnicodeMapFile' /etc/nginx/modsecurity.conf || echo 'SecUnicodeMapFile /etc/nginx/unicode.mapping 20127' >> /etc/nginx/modsecurity.conf
install -d -m 755 /etc/modsecurity/crs
EXC=/etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
[ -f "$EXC" ] || cp /usr/share/modsecurity-crs/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example "$EXC" 2>/dev/null || touch "$EXC"
RESP999=/usr/share/modsecurity-crs/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf
[ -f "$RESP999" ] || { [ -f "$RESP999.example" ] && cp "$RESP999.example" "$RESP999"; } || true
install -d -m 755 /etc/nginx/modsec
# الترتيب: modsecurity.conf ← crs-setup ← REQUEST-900 ← القواعد ← RESPONSE-999
cat > /etc/nginx/modsec/main.conf <<EOF
Include /etc/nginx/modsecurity.conf
Include /etc/modsecurity/crs/crs-setup.conf
Include $EXC
Include /usr/share/modsecurity-crs/rules/*.conf
EOF
cat > /etc/logrotate.d/$SYSTEM_NAME-modsec <<'EOF'
/var/log/modsec_audit.log {
    weekly
    rotate 4
    missingok
    compress
    delaycompress
    notifempty
    create 640 root adm
}
EOF
cat > /etc/nginx/snippets/tls-params.conf <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
EOF
echo 'server_tokens off;' > /etc/nginx/conf.d/security.conf
rm -f /etc/nginx/sites-enabled/default     # المنفذ 80 غير مستخدم
install -d -m 755 /var/www/taskapp
[ -f /var/www/taskapp/index.html ] || echo '<!doctype html><meta charset=utf-8><title>task</title><h1>الخادم جاهز</h1>' > /var/www/taskapp/index.html
# موقع مؤقت يخدم ملفًا ثابتًا (لا return: فهو يتجاوز ModSecurity ويُبطل اختبار WAF). المرحلة 1 تستبدله بـ: sudo task nginx
if [ ! -f /etc/nginx/sites-available/taskapp ] || ! grep -q proxy_pass /etc/nginx/sites-available/taskapp; then
  cat > /etc/nginx/sites-available/taskapp <<EOF
# خادم افتراضي يرفض أي اسم غير النطاق (مثل الوصول بعنوان IP)
server { listen 443 ssl default_server; server_name _;
  ssl_certificate $CERT; ssl_certificate_key $KEY;
  include snippets/tls-params.conf; ssl_reject_handshake on; }

server {
    listen 443 ssl http2;                 # nginx 1.24 في Ubuntu 24.04 لا يعرف "http2 on;"
    server_name $DOMAIN;
    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;
    include snippets/tls-params.conf;
    add_header Strict-Transport-Security "max-age=$HSTS" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsec/main.conf;
    root /var/www/taskapp; index index.html;
}
EOF
fi
ln -sf /etc/nginx/sites-available/taskapp /etc/nginx/sites-enabled/taskapp
nginx -t || die "إعداد nginx غير صالح"
systemctl enable nginx >/dev/null 2>&1; systemctl restart nginx
ok "nginx يعمل على 443"

# ───────────────── 12) تنبيه الدخول ─────────────────
cat > "$MOTD" <<EOF
#!/bin/sh
printf '\n\033[1;33m! المنفذ 22 ما زال مفتوحًا للعالم. بعد إثبات الدخول على $SSH_PORT:  sudo task harden --finish\033[0m\n\n'
EOF
chmod 755 "$MOTD"

# ───────────────── 13) SSH (آخر خطوة) ─────────────────
say "تأمين SSH — المنفذ $SSH_PORT (المنفذ 22 يبقى مؤقتًا)"
write_sshd 1
echo stage1 > "$MARK"
IP="$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')"

echo
ok "المرحلة 1 اكتملت"
cat <<EOF

  الموقع:   https://$DOMAIN      (صفحة مؤقتة حتى المرحلة 1 من التطبيق)
  المشروع:  $APP_DIR

  الآن — من نافذة جديدة على جهازك (وأنت داخل السعودية)، خلال 5 دقائق:
     1) ssh -p $SSH_PORT $ADMIN_USER@$IP          ← تأكد أن الدخول يعمل
     2) sudo task harden --finish            ← من تلك النافذة؛ يغلق المنفذ 22 ويلغي التراجع التلقائي
     3) sudo task verify                     ← فحص شامل
     4) task deploy-key                      ← لربط المستودع بـ GitHub

  الطوارئ: لوحة DigitalOcean ← Droplet ← Access ← Recovery Console (لا يمر بالجدار الناري)
EOF
