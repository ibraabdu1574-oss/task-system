# نظام إدارة المهام — سكربتات التشغيل

## الملفات

| الملف | الغرض |
|---|---|
| `scripts/00-server.sh` | تجهيز خادم كامل من الصفر (المرحلة 0) |
| `scripts/task` | أمر الإدارة — `task deploy` · `task verify` · `task phase N` |
| `scripts/lib.sh` | دوال مشتركة (لا يُشغَّل مباشرة) |
| `scripts/bootstrap.sh` | تهيئة المشروع على خادم جاهز |
| `scripts/verify.sh` | الفحص الشامل |
| `scripts/phases/01-foundation.sh` | سكربت المرحلة 1 — قالب لبقية المراحل |
| `deploy/nginx/taskapp.conf.tmpl` | قالب موقع nginx |
| `deploy/waf/task-exclusions.conf` | استثناءات ModSecurity |
| `.gitignore` | يمنع رفع `.env` وغيره — **ارفعه في أول رفعة** |

## قبل البدء

1. أنشئ **مستودعًا خاصًا** على GitHub (فارغًا).
2. ارفع فيه محتويات هذه الحزمة من المتصفح: `Add file ← Upload files` ← اسحب وأفلت ← Commit.
3. أنشئ Droplet بـ Ubuntu 24.04، وسجّل النطاق في **DigitalOcean ← Networking ← Domains**.

## تجهيز الخادم (المرحلة 0)

من PowerShell في مجلد هذه الحزمة — **خطوتان منفصلتان**:

```powershell
# 1) انسخ السكربتات (استبدل العنوان بعنوان خادمك الفعلي)
scp -r scripts deploy root@143.198.0.0:/root/

# 2) ادخل الخادم
ssh root@143.198.0.0
```

ثم **من داخل الخادم**:

```bash
bash /root/scripts/00-server.sh
```

> السكربت يسألك أسئلة، لذا شغّله من جلسة SSH حقيقية.
> لو أردت أمرًا واحدًا، لا بد من `-t`:  `ssh -t root@<IP> "bash /root/scripts/00-server.sh"`

يسألك عن: النطاق · بريدك · كلمة مرور `devadmin` · مفتاح DigitalOcean API (صلاحية `domain` فقط).

## بعد نجاحه

```bash
ssh -p 2244 devadmin@143.198.0.0     # تأكد أن الدخول يعمل — لا تغلق النافذة الأولى
sudo task harden --finish            # من نفس النافذة — يغلق المنفذ 22
task deploy-key                      # يطبع مفتاح النشر
```

أضف المفتاح في GitHub: **Settings ← Deploy keys ← Add deploy key**، و**اترك «Allow write access» فارغة**.

```bash
git -C ~/task-system remote add origin git@github.com-task:<حسابك>/task-system.git
task deploy
task verify
```

## بعدها

| الأمر | متى |
|---|---|
| `task deploy` | بعد كل رفعة على GitHub |
| `task verify` | بعد أي تغيير أو إعادة تشغيل |
| `task logs api` | عند وجود خطأ |
| `task doctor` | عند أي سلوك غريب |

**للتحرير:** اضغط `.` في صفحة المستودع على GitHub → VS Code في المتصفح.

التفاصيل الكاملة في `HANDOFF.md`.
