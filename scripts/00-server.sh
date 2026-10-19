#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  المرحلة 0 — تجهيز خادم التطوير بالكامل (Ubuntu 24.04 على DigitalOcean)
#
#  شغّله على خادم جديد تمامًا، كـ root:
#      sudo bash scripts/00-server.sh
#
#  بعد نجاحه ودخولك على المنفذ الجديد:
#      sudo task harden --finish        ← يغلق المنفذ 22 نهائيًا
#
#  يُنفَّذ مرارًا بأمان: كل قسم يتخطّى نفسه إن كان مكتملًا.
#  ترتيب مقصود: تأمين SSH آخر شيء، والمنفذ 22 يبقى مفتوحًا حتى تثبت أن 2244 يعمل.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SSH_PORT=2244
ADMIN=devadmin
APP_DIR=/home/$ADMIN/task-system
CONF=/etc/task-deploy.conf
MARK=/etc/task-server-state
GEO_DIR=/etc/task-geo
DO_INI=/root/.secrets/certbot/digitalocean.ini
SSHD_CONF=/etc/ssh/sshd_config.d/10-hardening.conf

_c(){ [ -t 1 ] && printf '\033[%sm' "$1" || true; }
say(){ echo -e "\n$(_c '1;36')==> $*$(_c 0)"; }
ok(){ echo -e "$(_c '1;32')✓$(_c 0) $*"; }
warn(){ echo -e "$(_c '1;33')!$(_c 0) $*"; }
die(){ echo -e "\n$(_c '1;31')✗ $*$(_c 0)" >&2; exit 1; }
step(){ grep -qx "$1" "$MARK" 2>/dev/null; }
done_(){ echo "$1" >> "$MARK"; }
ask(){ local p="$1" d="${2:-}" a; read -r -p "$p" a </dev/tty || true; echo "${a:-$d}"; }

[ "$(id -u)" = 0 ] || die "شغّله بـ sudo"
. /etc/os-release 2>/dev/null || true
[ "${VERSION_ID:-}" = "24.04" ] || warn "مُجرَّب على Ubuntu 24.04 (أنت على ${VERSION_ID:-غير معروف})"
touch "$MARK"
export DEBIAN_FRONTEND=noninteractive

# ───────────────── 1) الإعدادات ─────────────────
[ -f "$CONF" ] && . "$CONF"
if [ -z "${DOMAIN:-}" ]; then
  say "إعدادات الخادم"
  DOMAIN="$(ask "نطاق خادم التطوير (مثل dev.iat.sa): ")"
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "نطاق غير صالح"
  EMAIL="$(ask "بريدك (لتنبيهات شهادة HTTPS): ")"
  [ -n "$EMAIL" ] || die "البريد مطلوب"
  printf "DOMAIN='%s'\nEMAIL='%s'\n" "$DOMAIN" "$EMAIL" > "$CONF"; chmod 600 "$CONF"
fi
ok "النطاق: $DOMAIN"

# ───────────────── 2) الذاكرة الاحتياطية ─────────────────
if ! swapon --show | grep -q /swapfile; then
  say "ذاكرة احتياطية 2G"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness = 10' > /etc/sysctl.d/99-task-swap.conf
  ok "مضافة"
fi

# ───────────────── 3) الحزم ─────────────────
if ! step packages; then
  say "تثبيت الحزم (قد يستغرق دقائق)"
  apt-get update -y -qq
  apt-get install -y -qq ca-certificates curl gnupg git ufw ipset fail2ban nftables \
      nginx libnginx-mod-http-modsecurity modsecurity-crs \
      certbot python3-certbot-dns-digitalocean python3-systemd unattended-upgrades
  # Docker من مستودعه الرسمي
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  done_ packages; ok "الحزم جاهزة"
fi

# Docker يتجاوز ufw: اربط كل منفذ منشور بالعنوان المحلي فقط
cat > /etc/docker/daemon.json <<'EOF'
{
  "ip": "127.0.0.1",
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl enable --now docker >/dev/null 2>&1 || true
systemctl restart docker

# ───────────────── 4) المستخدم ─────────────────
if ! id "$ADMIN" >/dev/null 2>&1; then
  say "إنشاء المستخدم $ADMIN"
  useradd -m -s /bin/bash -G sudo,docker "$ADMIN"
  PW=""; PW2="x"
  while [ ${#PW} -lt 12 ] || [ "$PW" != "$PW2" ]; do
    read -r -s -p "كلمة مرور $ADMIN (12 حرفًا فأكثر — للدخول و sudo): " PW </dev/tty; echo
    read -r -s -p "أعدها للتأكيد: " PW2 </dev/tty; echo
    [ "$PW" = "$PW2" ] || echo "غير متطابقتين"
  done
  printf '%s:%s\n' "$ADMIN" "$PW" | chpasswd; unset PW PW2
  ok "أُنشئ"
else
  usermod -aG sudo,docker "$ADMIN"
fi

# ───────────────── 5) هيكل المشروع ─────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  say "تهيئة مستودع المشروع"
  install -d -o "$ADMIN" -g "$ADMIN" "$APP_DIR"
  sudo -u "$ADMIN" git -C "$APP_DIR" init -q -b main
  sudo -u "$ADMIN" git config --global init.defaultBranch main
  sudo -u "$ADMIN" git config --global core.autocrlf input
  sudo -u "$ADMIN" git config --global user.name  "$ADMIN"
  sudo -u "$ADMIN" git config --global user.email "$EMAIL"
  ok "مستودع فارغ في $APP_DIR"
fi
# انسخ ملفات السكربتات إلى المشروع إن شُغّل من مجلد آخر
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$SRC" != "$APP_DIR" ] && [ -d "$SRC/scripts" ]; then
  sudo -u "$ADMIN" cp -r "$SRC/scripts" "$SRC/deploy" "$APP_DIR/" 2>/dev/null || true
fi
install -m 755 "$APP_DIR/scripts/task" /usr/local/bin/task 2>/dev/null || true
sed -i "s|^APP_DIR=\"\${TASK_APP_DIR:-.*}\"|APP_DIR=\"\${TASK_APP_DIR:-$APP_DIR}\"|" /usr/local/bin/task 2>/dev/null || true

# ───────────────── 6) تعطيل IPv6 ─────────────────
cat > /etc/sysctl.d/99-task-no-ipv6.conf <<'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
EOF
sysctl -q --system >/dev/null 2>&1 || true

# ───────────────── 7) الحصر الجغرافي للسعودية ─────────────────
say "الحصر الجغرافي (عناوين السعودية فقط)"
install -d -m 755 "$GEO_DIR"
[ -f "$GEO_DIR/allow-extra.txt" ] || cat > "$GEO_DIR/allow-extra.txt" <<'EOF'
# نطاقات إضافية مسموحة من خارج السعودية (سطر لكل نطاق: 203.0.113.7/32)
# بعد التعديل:  sudo task-geo-update
EOF
cat > /usr/local/sbin/task-geo-update <<'GEOEOF'
#!/bin/bash
# تحديث مجموعة عناوين السعودية.  --boot = تحميل من الملف المحفوظ بلا إنترنت
set -uo pipefail
SET=geo_sa; TMP=geo_sa_tmp; ZONE=/etc/task-geo/sa.zone; EXTRA=/etc/task-geo/allow-extra.txt
URL=https://www.ipdeny.com/ipblocks/data/aggregated/sa-aggregated.zone; MIN=300
log(){ logger -t task-geo "$*"; echo "$*"; }
cnt(){ grep -cE '^[0-9]' "$1" 2>/dev/null || echo 0; }
valid(){ local t o; t=$(cnt "$1"); o=$(grep -cE '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' "$1" 2>/dev/null||echo 0); [ "$t" -ge "$MIN" ] && [ "$o" -eq "$t" ]; }
load(){ { echo "create $SET hash:net family inet hashsize 4096 maxelem 65536"
          echo "create $TMP hash:net family inet hashsize 4096 maxelem 65536"; echo "flush $TMP"
          grep -E '^[0-9]' "$1" | sed "s|^|add $TMP |"
          [ -f "$EXTRA" ] && grep -E '^[0-9]' "$EXTRA" | sed "s|^|add $TMP |"
        } | ipset restore -exist || return 1
        ipset swap "$TMP" "$SET" && ipset destroy "$TMP"; }
ipset create "$SET" hash:net family inet hashsize 4096 maxelem 65536 -exist
if [ "${1:-}" = --boot ]; then
  valid "$ZONE" && load "$ZONE" && { log "boot: $(cnt "$ZONE") نطاقًا"; exit 0; }
  log "boot: الملف $ZONE مفقود أو غير صالح"; exit 1
fi
NEW=$(mktemp); trap 'rm -f "$NEW"' EXIT
curl -fsSL --max-time 60 "$URL" -o "$NEW" || { log "فشل التنزيل — أُبقيت القائمة الحالية"; exit 1; }
valid "$NEW" || { log "قائمة غير صالحة — أُبقيت الحالية"; exit 1; }
load "$NEW" && install -m 644 "$NEW" "$ZONE" && log "حُدِّثت: $(cnt "$NEW") نطاقًا"
GEOEOF
chmod 755 /usr/local/sbin/task-geo-update
cat > /etc/systemd/system/task-geo.service <<'EOF'
[Unit]
Description=Load Saudi geo_sa ipset before firewall
DefaultDependencies=no
Before=ufw.service network-pre.target
After=local-fs.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/task-geo-update --boot
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/task-geo-update.service <<'EOF'
[Unit]
Description=Weekly refresh of geo_sa ipset
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/task-geo-update
EOF
cat > /etc/systemd/system/task-geo-update.timer <<'EOF'
[Unit]
Description=Weekly refresh of geo_sa ipset
[Timer]
OnCalendar=Sun *-*-* 03:00:00
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
/usr/local/sbin/task-geo-update || die "تعذّر تنزيل قائمة عناوين السعودية — أعد المحاولة"
systemctl enable task-geo.service task-geo-update.timer >/dev/null
systemctl start task-geo-update.timer
ok "$(ipset list geo_sa | sed -n 's/^Number of entries: //p') نطاقًا محمّلًا"

# ───────────────── 8) الجدار الناري ─────────────────
say "الجدار الناري (2244 + 443 فقط، ومن السعودية فقط)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow $SSH_PORT/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 22/tcp >/dev/null          # مؤقت — يُغلق بـ: sudo task harden --finish
BR=/etc/ufw/before.rules
[ -f "$BR.orig" ] || cp "$BR" "$BR.orig"
sed -i '/task-geo/d' "$BR"
sed -i "/^# quickly process packets for which we already have a connection/i\\
-A ufw-before-input -p tcp -m multiport --dports $SSH_PORT,443 -m set --match-set geo_sa src -m comment --comment task-geo -j ACCEPT\\
-A ufw-before-input -p tcp -m multiport --dports $SSH_PORT,443 -m comment --comment task-geo -j DROP" "$BR"
grep -q task-geo "$BR" || die "لم أجد موضع الإدراج في $BR"
iptables-restore --test < "$BR" || { cp "$BR.orig" "$BR"; die "قواعد الجدار غير صالحة — أُعيد الأصل"; }
ufw --force enable >/dev/null && ufw reload >/dev/null
ok "مفعّل (المنفذ 22 مفتوح مؤقتًا)"

# ───────────────── 9) fail2ban ─────────────────
say "fail2ban"
cat > /etc/fail2ban/filter.d/nginx-modsecurity.conf <<'EOF'
[Definition]
failregex = ModSecurity: Access denied .*, client: <HOST>,
ignoreregex =
EOF
cat > /etc/fail2ban/jail.d/task.local <<EOF
[DEFAULT]
banaction = nftables-multiport
findtime  = 10m
bantime   = 1h
bantime.increment = true
bantime.maxtime   = 1w
ignoreip  = 127.0.0.1/8

[sshd]
enabled  = true
port     = 22,$SSH_PORT
backend  = systemd
maxretry = 4

[nginx-modsecurity]
enabled  = true
port     = 443
filter   = nginx-modsecurity
logpath  = /var/log/nginx/error.log
maxretry = 5
EOF
systemctl enable fail2ban >/dev/null; systemctl restart fail2ban
ok "مفعّل"

# ───────────────── 10) شهادة HTTPS عبر DNS-01 ─────────────────
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  if [ ! -s "$DO_INI" ]; then
    echo
    echo "الشهادة تُصدر عبر DNS (لا نفتح المنفذ 80). تحتاج مفتاح API من DigitalOcean بصلاحية domain فقط."
    echo "(API ← Generate New Token ← Custom Scopes ← domain: create/read/update/delete)"
    DO_TOKEN=""
    while [ ${#DO_TOKEN} -lt 20 ]; do
      read -r -s -p "الصق المفتاح (لن يظهر): " DO_TOKEN </dev/tty; echo
    done
    install -d -m 700 /root/.secrets /root/.secrets/certbot
    ( umask 077; printf 'dns_digitalocean_token = %s\n' "$DO_TOKEN" > "$DO_INI" )
    unset DO_TOKEN
  fi
  chmod 600 "$DO_INI"
  say "إصدار شهادة $DOMAIN (دقيقة إلى دقيقتين)"
  certbot certonly --non-interactive --agree-tos -m "$EMAIL" \
    --dns-digitalocean --dns-digitalocean-credentials "$DO_INI" \
    --dns-digitalocean-propagation-seconds 60 --key-type ecdsa -d "$DOMAIN" \
    || die "فشل إصدار الشهادة. تأكد أن نطاق ${DOMAIN#*.} مُدار في DigitalOcean (Networking ← Domains)"
  ok "صدرت"
fi
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# ───────────────── 11) nginx + جدار حماية الويب ─────────────────
say "nginx + ModSecurity/OWASP CRS"
install -d -m 755 /etc/nginx/modsec
cat > /etc/nginx/modsec/main.conf <<'EOF'
Include /etc/nginx/modsecurity.conf
Include /etc/modsecurity/crs/crs-setup.conf
Include /etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
Include /usr/share/modsecurity-crs/rules/*.conf
EOF
[ -f /etc/nginx/modsecurity.conf ] || cp /etc/modsecurity/modsecurity.conf-recommended /etc/nginx/modsecurity.conf 2>/dev/null || true
sed -i 's/^SecRuleEngine .*/SecRuleEngine On/' /etc/nginx/modsecurity.conf
grep -q '^SecUnicodeMapFile' /etc/nginx/modsecurity.conf || echo 'SecUnicodeMapFile /etc/nginx/unicode.mapping 20127' >> /etc/nginx/modsecurity.conf
if [ ! -f /etc/nginx/unicode.mapping ]; then
  UM="$(find /etc/modsecurity /usr/share -name unicode.mapping -print -quit 2>/dev/null || true)"
  [ -n "$UM" ] && cp "$UM" /etc/nginx/unicode.mapping || die "لم أجد unicode.mapping — أرسل لي ناتج: find / -name unicode.mapping"
fi
install -d -m 755 /etc/modsecurity/crs
[ -f /etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf ] || \
  cp /usr/share/modsecurity-crs/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example \
     /etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf 2>/dev/null || \
  touch /etc/modsecurity/crs/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
cat > /etc/nginx/snippets/tls-params.conf <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
EOF
echo 'server_tokens off;' > /etc/nginx/conf.d/security.conf
rm -f /etc/nginx/sites-enabled/default
install -d -m 755 /var/www/taskapp
[ -f /var/www/taskapp/index.html ] || echo '<!doctype html><meta charset=utf-8><title>task</title><h1>الخادم جاهز</h1>' > /var/www/taskapp/index.html
# الموقع: صفحة مؤقتة الآن؛ المرحلة 1 تستبدله بتوجيه للتطبيق عبر: sudo task nginx
if [ ! -f /etc/nginx/sites-available/taskapp ]; then
  cat > /etc/nginx/sites-available/taskapp <<EOF
server { listen 443 ssl default_server; server_name _;
  include snippets/tls-params.conf; ssl_reject_handshake on; }

server {
    listen 443 ssl; http2 on;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include snippets/tls-params.conf;
    add_header Strict-Transport-Security "max-age=86400" always;
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
systemctl enable nginx >/dev/null; systemctl restart nginx
ok "يعمل على 443"

# ───────────────── 12) SSH (آخر خطوة) ─────────────────
say "تأمين SSH — المنفذ $SSH_PORT (المنفذ 22 يبقى مؤقتًا)"
cat > "$SSHD_CONF" <<EOF
# المنفذ 22 مؤقت حتى:  sudo task harden --finish
Port 22
Port $SSH_PORT
AddressFamily inet
ListenAddress 0.0.0.0
PermitRootLogin no
AllowUsers $ADMIN
MaxAuthTries 3
LoginGraceTime 30
PasswordAuthentication yes
KbdInteractiveAuthentication no
PermitEmptyPasswords no
X11Forwarding no
EOF
chmod 644 "$SSHD_CONF"; install -d -m 755 /run/sshd
sshd -t || die "إعداد SSH غير صالح — لم يُطبَّق"
systemctl daemon-reload
systemctl restart ssh.socket 2>/dev/null || true
systemctl restart ssh.service 2>/dev/null || true
sleep 1
ss -ltn | grep -q ":$SSH_PORT " || die "SSH لا يستمع على $SSH_PORT"
done_ server
IP="$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')"

echo
ok "تجهيز الخادم اكتمل"
cat <<EOF

  الموقع:   https://$DOMAIN      (يعرض صفحة مؤقتة حتى المرحلة 1)
  المشروع:  $APP_DIR

  الخطوة التالية — من جهازك (وأنت داخل السعودية):
     1) ssh -p $SSH_PORT $ADMIN@$IP          ← تأكد أن الدخول يعمل
     2) sudo task harden --finish            ← من نفس النافذة، يغلق المنفذ 22
     3) task deploy-key                      ← لربط المستودع بـ GitHub
     4) task verify                          ← فحص شامل

  الطوارئ: لوحة DigitalOcean ← Droplet ← Access ← Recovery Console (لا يمر بالجدار الناري)
EOF
