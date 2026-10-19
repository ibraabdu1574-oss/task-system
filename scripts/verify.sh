#!/usr/bin/env bash
# verify.sh — الفحص الشامل. يُشغَّل بعد أي تغيير أو إعادة تشغيل:  task verify
# يخرج بـ 0 إن نجح كل شيء، وبـ 1 إن فشل فحص واحد على الأقل.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$APP_DIR/scripts/lib.sh"
set +e   # نكمل كل الفحوص ثم نلخّص

FAIL=0
check() { # check "الوصف" "الأمر" "المتوقع"
  local desc="$1" out
  out="$(eval "$2" 2>/dev/null)"
  if [ -n "${3:-}" ] && [ "$out" != "$3" ]; then
    echo -e "$(_c '1;31')✗$(_c 0) $desc  — وجدت: ${out:-لا شيء}  (المتوقع: $3)"; FAIL=1
  elif [ -z "${3:-}" ] && [ -z "$out" ]; then
    echo -e "$(_c '1;31')✗$(_c 0) $desc — لا نتيجة"; FAIL=1
  else
    echo -e "$(_c '1;32')✓$(_c 0) $desc  ${out:+→ $out}"
  fi
}
soft() { # فحص لا يُفشل الإجمالي (ميزة قد لا تكون بُنيت بعد)
  local desc="$1" out; out="$(eval "$2" 2>/dev/null)"
  [ -n "$out" ] && echo -e "$(_c '1;32')✓$(_c 0) $desc → $out" \
                || echo -e "$(_c '1;33')—$(_c 0) $desc (لم يُبنَ بعد)"
}

say "1) التحصين (scripts/00-server.sh --status)"
if is_root; then bash "$APP_DIR/scripts/00-server.sh" --status || FAIL=1
else warn "شغّل بـ sudo لفحص التحصين كاملًا (sudo task verify)"; fi

say "2) الحاويات"
if docker info >/dev/null 2>&1; then
  dc ps --format "table {{.Service}}\t{{.Status}}" 2>/dev/null | sed 's/^/   /'
  for s in postgres redis api web; do
    svc_defined "$s" || continue
    if svc_healthy "$s"; then echo -e "$(_c '1;32')✓$(_c 0) $s سليمة"
    else echo -e "$(_c '1;31')✗$(_c 0) $s غير سليمة — task logs $s"; FAIL=1; fi
  done
else
  echo -e "$(_c '1;31')✗$(_c 0) لا وصول إلى docker"; FAIL=1
fi

say "3) الموقع وجدار حماية الويب"
R="--resolve $DOMAIN:443:127.0.0.1"   # عنوان الخادم ليس سعوديًا فيُحجب جغرافيًا من داخله
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 $R "$1" 2>/dev/null; }
c="$(code "https://$DOMAIN/")"
[ "$c" = 200 ] && echo -e "$(_c '1;32')✓$(_c 0) الصفحة الرئيسية → 200" \
               || { echo -e "$(_c '1;31')✗$(_c 0) الصفحة الرئيسية → ${c:-لا استجابة}"; FAIL=1; }
c="$(code "https://$DOMAIN/?id=1%27%20OR%20%271%27=%271")"
[ "$c" = 403 ] && echo -e "$(_c '1;32')✓$(_c 0) WAF يحجب حقن SQL → 403" \
               || { echo -e "$(_c '1;31')✗$(_c 0) WAF لم يحجب الهجوم → ${c:-لا استجابة}"; FAIL=1; }
check "الشهادة" "certbot certificates 2>/dev/null | sed -n 's/.*Expiry Date: //p' | head -1 | cut -d' ' -f1"

say "4) التطبيق"
soft "صحة الـ API"  "curl -s --max-time 5 http://127.0.0.1:$API_PORT/api/v1/health 2>/dev/null | head -c 60"
soft "واجهة الويب"  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$WEB_PORT/ 2>/dev/null | grep -v '^000'"

say "5) الكود والأسرار"
if [ -f "$ENV_FILE" ]; then
  check "صلاحية .env"      "stat -c %a '$ENV_FILE' 2>/dev/null" "600"
  check ".env خارج git"    "git -C '$APP_DIR' check-ignore .env >/dev/null 2>&1 && echo yes" "yes"
else
  echo -e "$(_c '1;33')—$(_c 0) .env غير موجود بعد (يُولَّد في المرحلة 1: task env)"
fi
if git -C "$APP_DIR" remote get-url origin >/dev/null 2>&1; then
  check "آخر commit"       "git -C '$APP_DIR' log --oneline -1 2>/dev/null"
  U="$(git -C "$APP_DIR" status --porcelain 2>/dev/null | wc -l)"
  [ "$U" = 0 ] && echo -e "$(_c '1;32')✓$(_c 0) لا تغييرات غير محفوظة" \
               || echo -e "$(_c '1;33')!$(_c 0) $U ملفًا غير محفوظ في git"
else
  echo -e "$(_c '1;33')—$(_c 0) المستودع غير مربوط بـ GitHub بعد (task deploy-key)"
fi

echo
if [ "$FAIL" = 0 ]; then ok "كل الفحوص نجحت"; exit 0
else echo -e "$(_c '1;31')✗ فشل فحص واحد على الأقل — راجع أعلاه$(_c 0)"; exit 1; fi
