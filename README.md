# نظام إدارة المهام — سكربتات التشغيل

## الملفات

| الملف | الغرض |
|---|---|
| `scripts/00-server.sh` | تجهيز وتحصين الخادم (المرحلة 0) — مرحلتان + `--status` |
| `scripts/task` | أمر الإدارة — `task deploy` · `task verify` · `task phase N` · `task harden --finish` |
| `scripts/lib.sh` | دوال مشتركة (لا يُشغَّل مباشرة) |
| `scripts/bootstrap.sh` | تهيئة المشروع على خادم جاهز |
| `scripts/verify.sh` | الفحص الشامل (تحصين + حاويات + تطبيق) |
| `scripts/phases/01-foundation.sh` | سكربت المرحلة 1 — قالب لبقية المراحل |
| `deploy/nginx/taskapp.conf.tmpl` | قالب موقع nginx (يُطبَّق في المرحلة 1) |
| `deploy/waf/task-exclusions.conf` | استثناءات ModSecurity |
| `.gitignore` | يمنع رفع `.env` — **ارفعه في أول رفعة** |

## ما يفعله `00-server.sh`

| القسم | المحتوى |
|---|---|
| فحوص قبل التشغيل | Ubuntu 24.04 فقط · تحذير من شهادات بغير DNS-01 · تذكير بـ Recovery Console |
| Docker | `daemon.json` يربط كل منفذ منشور بـ 127.0.0.1 (Docker يتجاوز ufw) |
| المستخدم | `devadmin` في sudo و docker، كلمة مرور 16 حرفًا فأكثر تُقرأ من `/dev/tty` |
| Swap | 2G إن كانت الذاكرة ≤ 4GB، مع `findmnt --verify` |
| IPv6 | معطّل بـ sysctl (لا GRUB)، و `IPV6=yes` في ufw |
| الحصر الجغرافي | ipset `geo_sa` (ipdeny + iCloud Private Relay + `allow-extra.txt`)، تحميل عند الإقلاع قبل ufw، تحديث أسبوعي، القاعدتان آخر `ufw-before-input`، نسخة `before.rules.bak` + تراجع تلقائي بعد 5 دقائق |
| ufw | منع الوارد عدا 2244 و443 (+22 مؤقتًا)، لا منفذ 80 |
| fail2ban | nftables، حظر متصاعد حتى أسبوع، سجون sshd + nginx-modsecurity + nginx-limit-req، اختبار حظر/فكّ |
| HTTPS | Let's Encrypt عبر DNS-01 بمفتاح DigitalOcean (صلاحية domain فقط) |
| nginx + WAF | 443 فقط، `ssl_reject_handshake` للأسماء الأخرى، ModSecurity + OWASP CRS (لا يُعطَّل)، تدوير سجل التدقيق |
| SSH (آخر خطوة) | 2244، IPv4 فقط، بلا root، `AllowUsers devadmin`، عبر `ssh.socket` |

للإنتاج الداخلي: `ENV=internal-prod CERT_FILE=… KEY_FILE=… INTERNAL_NETS="10.0.0.0/8" sudo bash scripts/00-server.sh` — بلا حصر جغرافي ولا certbot؛ السماح من الشبكات الداخلية فقط.

## قبل البدء

1. أنشئ **مستودعًا خاصًا** على GitHub وارفع فيه محتويات هذه الحزمة من المتصفح (`Add file ← Upload files`).
2. أنشئ Droplet بـ Ubuntu 24.04، وسجّل النطاق في **DigitalOcean ← Networking ← Domains**، وجهّز توكن API بصلاحية `domain` فقط.
3. **اختبر Recovery Console** في لوحة DigitalOcean (Droplet ← Access ← Recovery Console).

## التشغيل خطوة بخطوة

```powershell
# 1) من PowerShell في مجلد الحزمة (استبدل العنوان بعنوان خادمك)
scp -r scripts deploy root@143.198.0.0:/root/
ssh root@143.198.0.0
```
```bash
# 2) داخل الخادم — المرحلة 1 (يسألك: النطاق · البريد · كلمة مرور devadmin · توكن DO)
bash /root/scripts/00-server.sh
```
```powershell
# 3) من نافذة PowerShell جديدة (لا تغلق الأولى) — خلال 5 دقائق
ssh -p 2244 devadmin@143.198.0.0
```
```bash
# 4) من النافذة الجديدة — المرحلة 2
sudo task harden --finish
sudo task verify              # 5) فحص شامل
sudo reboot                   # 6) ثم ادخل مجددًا و: sudo task verify
task deploy-key               # 7) أضف المفتاح في GitHub ← Deploy keys (بلا Allow write access)
git -C ~/task-system remote add origin git@github.com-task:<حسابك>/task-system.git
task deploy
```

## الطوارئ

| الحالة | الحل |
|---|---|
| أُقفلت خارج الخادم | DigitalOcean ← Droplet ← Access ← **Recovery Console** (لا يمر بالجدار) ← ادخل بكلمة مرور devadmin |
| fail2ban حظر عنوانك | `sudo fail2ban-client set sshd unbanip <IP>` |
| عنوانك خارج القائمة الجغرافية | أضفه في `/etc/task-geo/allow-extra.txt` ثم `sudo task-geo-update` |
| إعادة `before.rules` الأصلي | `sudo cp /etc/ufw/before.rules.bak /etc/ufw/before.rules && sudo ufw reload` |
| القائمة الجغرافية فارغة بعد الإقلاع | `sudo task-geo-update` (أو من Recovery Console إن حُجبت) |
| إعادة المرحلة 1 بعد اكتمال التحصين | `sudo bash ~/task-system/scripts/00-server.sh --force` |

## بعدها

| الأمر | متى |
|---|---|
| `task deploy` | بعد كل رفعة على GitHub |
| `sudo task verify` | بعد أي تغيير أو إعادة تشغيل |
| `task logs api` | عند وجود خطأ |
| `task doctor` | عند أي سلوك غريب |

**للتحرير:** اضغط `.` في صفحة المستودع على GitHub → VS Code في المتصفح.
