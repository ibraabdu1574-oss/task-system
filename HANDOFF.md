# HANDOFF — نظام إدارة المهام الداخلي

> ملف التسليم بين المحادثات. **مخرجات كل محادثة = بذرة المحادثة التالية.**
> **الإصدار 2.3 (2026-10-20)** — **كود المرحلة 1 مكتوب ومسلَّم** (Monorepo + Prisma + مصادقة + RBAC هرمي + هيكل + سعة + تدقيق + واجهة دخول/هيكل) · `01-foundation.sh` يبني ويرحّل ويبذر **ويشغّل الاختبارات داخل الحاويات** ثم يفحص القبول · بانتظار التشغيل على الخادم.

---

## 1. كيف تستخدم هذا الملف

1. افتح محادثة جديدة داخل نفس المشروع.
2. ارفع: `HANDOFF.md` (هذا الملف) + `PLAN.md` + `prototype.html`. **الكود لا يُرفع** — صار على GitHub (وتستطيع لصق رابط المستودع).
3. الصق prompt المرحلة من القسم 7.
4. في نهاية المحادثة تستلم: ملفات الكود + سكربت المرحلة + `HANDOFF.md` محدّثًا.

---

## 2. حالة المشروع الآن

- **مكتمل:** التخطيط (`PLAN.md` 1.2) + النموذج البصري (`prototype.html`) + **المرحلة 0** (خادم التطوير مجهّز ومحصّن).
- **المرحلة 1 — مكتوبة بالكامل، لم تُشغَّل بعد على الخادم.** الكود في `apps/api` و`apps/web` و`packages/shared` + `docker-compose.yml` + `scripts/phases/01-foundation.sh` + تحديث `scripts/task` (`task env` صار يولّد كل أسرار المرحلة، وأُضيف `task test`).
- **الخادم:** DigitalOcean، Ubuntu 24.04، النطاق **`iat.sa`**، الدخول `ssh -p 2244 devadmin@iat.sa`. `sudo task verify` ينجح (المرحلة 0). nginx يعرض الصفحة المؤقتة حتى يُشغَّل `sudo task phase 1`.
- **الكود:** المستودع الخاص **`ibraabdu1574-oss/task-system`** مربوط بالخادم (`/home/devadmin/task-system`، فرع `main`) بمفتاح نشر للقراءة فقط. آخر commit مسجّل: `7380f4a` (قبل رفع المرحلة 1).
- **`.env`:** يُولَّد كاملًا عند أول `sudo task phase 1` (قاعدة البيانات، JWT، `SEED_PASSWORD`).
- **الخطوة القادمة:** رفع ملفات المرحلة 1 إلى GitHub ثم على الخادم: **`task deploy && sudo task phase 1`** (أو `sudo task phase 1` وحده — فهو يسحب الكود بنفسه). ثم إلصاق الناتج في محادثة جديدة إن فشل شيء، أو الانتقال إلى **المرحلة 2** (القسم 7.ج).

> **ما تغيّر في 2.3:** كود المرحلة 1 كُتب كاملًا. بيئة المساعد لم تستطع تثبيت حزم npm (سجل npm محجوب هناك)، فلم تُشغَّل الاختبارات قبل التسليم؛ **التعويض:** السكربت يشغّل داخل الحاويات `prisma validate` ثم فحص **مطابقة قاعدة البيانات للمخطط** (`prisma migrate diff --exit-code`) ثم `tsc` للـapi والـweb ثم **Jest** (وحدة RBAC) و**Supertest** (16 اختبار تكامل للمصادقة والصلاحيات) — فأي خطأ يظهر في أول تشغيل برسالة تقول ما العمل. ما تحقّقنا منه فعلًا قبل التسليم: SQL الترحيل طُبّق على PostgreSQL 16 حقيقي بنجاح، صلاحية YAML/JSON، وصياغة TypeScript والـbash.

## 3. أسلوب التنفيذ (القاعدة الحاكمة — حلّت محل «خطوة بخطوة»)

```text
قاعدة التنفيذ (مهمة، التزم بها طوال المحادثة):

1. اكتب ملفات المرحلة **كاملة دفعة واحدة** — لا رسالة لكل خطوة، ولا انتظار تأكيد بين الملفات.
2. أنتج لكل مرحلة **سكربت واحد** في scripts/phases/NN-اسم.sh ينفّذ كل تهيئتها، ويكون:
   - آمنًا للتكرار (idempotent): إعادة تشغيله لا تكسر شيئًا، وتتخطّى ما اكتمل.
   - يتحقق قبل أن يطبّق (nginx -t، sshd -t، docker compose config).
   - يفشل برسالة عربية واضحة تقول ما العمل، لا بصمت.
   - ينتهي بفحص يثبت «معايير القبول» من PLAN.md.
3. أعطني في النهاية **أمر تشغيل واحد** + الناتج المتوقع، لا قائمة خطوات.
4. أنا أشغّله وألصق لك الناتج. نصلح ما فشل ونعيد التشغيل (لا نتراجع عن خطوات).
5. الكود يصل للخادم عبر git — لا scp ولا zip.
```

**فائدة الـ idempotency:** لو فشل السكربت عند السطر 120، تصلح وتعيد التشغيل. لا حاجة للتراجع عن 119 خطوة.

---

## 4. البنية والأدوات

### 4.أ البيئات

| البيئة | الوصف | الوصول |
|---|---|---|
| **التطوير** | DigitalOcean (سحابي) — **بيانات تجريبية فقط** | `ssh -p 2244 devadmin@<IP>` · `https://<النطاق>` |
| **الإنتاج** | خادم **داخلي**، يُوصل إليه من الشبكة الداخلية فقط، **لكنه متصل بالإنترنت ويصل إلى GitHub** | شبكة الجهة |

### 4.ب نقل الكود — GitHub (مستودع خاص) · **بلا git على ويندوز**

```
الملفات المسلَّمة  →  ترفعها في GitHub من المتصفح  →  GitHub (مستودع خاص)
                                                          │
                                   ┌──────────────────────┴──────────────────┐
                                   ↓ pull (main)                             ↓ pull (tag)
                           خادم التطوير                            خادم الإنتاج الداخلي
```

**ويندوز ليس عميل git** — هو مجرد طرفية. ما يبقى عليه أمران فقط، وكلاهما مدمج في ويندوز:
- `scp` — **مرة واحدة فقط** لتسليم سكربتات المرحلة 0 لخادم جديد (قبل وجود مفتاح النشر). بعدها لا تحتاجه أبدًا.
- `ssh` — للدخول وتشغيل `task deploy` و`task verify`.

**كيف يصل الكود إلى GitHub:** في صفحة المستودع ← `Add file` ← `Upload files` ← اسحب الملفات أو المجلد وأفلته ← Commit. يحفظ بنية المجلدات.

**أين تحرّر الكود:** اضغط زر **النقطة `.`** في صفحة المستودع (أو بدّل `github.com` إلى `github.dev`) — يفتح **VS Code كامل في المتصفح**: تحرير وبحث وإنشاء ملفات وcommit مباشرةً، بلا تثبيت شيء على ويندوز.

**ميزة أمنية:** `.env` لا يوجد على جهازك إطلاقًا — يُولَّد على الخادم بصلاحية 600 ولا يغادره.

- **مفتاح نشر للقراءة فقط** (Deploy Key) على كل خادم — لا رمز حسابك الشخصي. لو تسرّب، أقصى ضرره قراءة مستودع واحد.
- **التطوير** يسحب فرع `main`. **الإنتاج يسحب إصدارًا موسومًا (tag) فقط** — حتى لا تهبط تجاربك على الإنتاج بالخطأ.
- `.env` **لا يدخل git أبدًا** — السكربتات تتحقق من ذلك وتتوقف إن خالفت.
- النشر دائمًا **سحب من الخادم** لا دفع إليه: الحصر الجغرافي يمنع GitHub Actions والـ webhooks من الوصول لخادمك.

### 4.ج أمر `task` — واجهة واحدة لكل شيء

يُثبَّت في `/usr/local/bin/task` ويعمل من أي مجلد:

| الأمر | ماذا يفعل |
|---|---|
| `task deploy` | **الأمر اليومي** — يسحب الكود، يبني، يرحّل قاعدة البيانات، يتحقق |
| `task verify` | فحص شامل (أمان، حاويات، HTTPS، WAF، صحة التطبيق، git) |
| `task phase 1` | يشغّل سكربت تهيئة المرحلة 1 |
| `task logs [خدمة]` · `task status` · `task doctor` | متابعة وتشخيص |
| `task migrate` · `task seed` · `task psql` | قاعدة البيانات |
| `task backup` · `task restore <ملف>` | النسخ الاحتياطي |
| `task env` · `task nginx` · `task deploy-key` | الإعداد |
| `sudo task harden --finish` | إغلاق المنفذ 22 بعد إثبات الدخول على 2244 (يستدعي `00-server.sh --finish`) |
| `sudo task security` | فحص التحصين فقط (`00-server.sh --status`) |

### 4.د هيكل السكربتات

```
scripts/
├─ 00-server.sh          تجهيز وتحصين الخادم (المرحلة 0): بلا خيار=المرحلة 1 · --finish · --status · --force
├─ lib.sh                دوال مشتركة: say/ok/die، idempotency، فحص الحاويات
├─ task                  أمر الإدارة (يُثبَّت في /usr/local/bin)
├─ bootstrap.sh          تهيئة المشروع على خادم جاهز
├─ verify.sh             الفحص الشامل
└─ phases/
   ├─ 01-foundation.sh   المرحلة 1  ← قالب لبقية المراحل
   └─ NN-….sh            مرحلة لكل سكربت
deploy/
├─ nginx/taskapp.conf.tmpl   قالب الموقع (توجيه + حدّ محاولات الدخول + WebSocket)
└─ waf/task-exclusions.conf  استثناءات ModSecurity للتطبيق
```

### 4.هـ هيكل الكود (المرحلة 1)

```
package.json               npm workspaces: packages/shared · apps/api · apps/web
docker-compose.yml         postgres:16 · redis:7 · api (3001) · web (3000) — كلها على 127.0.0.1
packages/shared/src/       الأدوار والإجراءات والأنواع المشتركة + سياسات كلمة المرور والقفل (مصدر الحقيقة الوحيد)
apps/api/                  NestJS — Dockerfile (hot reload) · prisma/ (schema + migrations + seed.ts) · test/ (e2e)
  src/common/              guards (JwtAuth + Permissions) · interceptors (Audit) · decorators (@Public @Require @Audit @CurrentUser) · filter الأخطاء
  src/modules/auth/        AuthStrategy مجرّدة → LocalStrategy (argon2id) · LdapStrategy مكان محجوز · JwtStrategy · تدوير refresh + كشف إعادة الاستخدام · قفل 5×15د · سياسة كلمات المرور + منع إعادة آخر 5
  src/modules/rbac/        PermissionService — النطاق من موقع الفاعل في الشجرة، followUpOfficer يُوسَّع لإدارته، منع افتراضي (+ spec)
  src/modules/org/         الهيكل: CRUD إدارات عامة/إدارات/أقسام + تعيين المدراء والمشرفين + /org/tree مقصورة على النطاق
  src/modules/users/       المستخدمون ضمن النطاق + فكّ القفل + حقول السعة (dailyCapacityHours، workingDays)
  src/modules/capacity/    العطل (CEO) والإجازات (ضمن النطاق) — التقاط فقط، بلا حساب
  src/modules/audit/       سجل التدقيق (كل طلب معدِّل + أحداث المصادقة) · GET /audit للرئيس
apps/web/                  Next.js 14 App Router + Tailwind — هوية prototype.html (رموز CSS، 3 أنماط، داكن، RTL)
  src/app/ (login) · (app)/dashboard · (app)/org (شجرة + إنشاء/تعديل/حذف/تعيين حسب الصلاحية)
  src/lib/api.ts (عميل + تجديد access تلقائي) · auth.tsx · theme.tsx
```

---

## 5. القرارات الثابتة

- **الخلفية:** NestJS + TypeScript · **الويب:** Next.js (App Router) + Tailwind، RTL + Dark.
- **قاعدة البيانات:** PostgreSQL + Prisma · **الطوابير:** Redis + BullMQ.
- **المصادقة:** محلية (JWT access+refresh، argon2). LDAP مؤجّل — الطبقة مجهّزة (`authSource`).
- **PLAN المرجعي:** الإصدار **1.2**.
- **الإشعارات:** المرحلة 5 = In-App + Email. **Web Push (مفاتيح VAPID) معتمد في المرحلة 7 مع PWA** — بلا FCM/APNs ولا حساب خارجي؛ خادمك يتصل صادرًا فقط والحمولة مشفّرة طرفًا لطرف. WhatsApp وTelegram مؤجّلان.
- **الجوال = PWA لا تطبيق أصلي:** تطبيق الويب نفسه يُثبَّت على الشاشة الرئيسية (manifest + service worker + عمل جزئي بلا اتصال). كود واحد، بلا متاجر، والتحديث فوري. ألغى React Native من الخطة.
- **⚠️ شهادة خادم الإنتاج (شرط لعمل PWA):** الـservice worker لا يُسجَّل إلا بشهادة **موثوقة**. بما أن الإنتاج يصل إلى الإنترنت صادرًا، نمنحه **نطاقًا حقيقيًا** (مثل `tasks.iat.sa`) سجلّه يشير إلى **عنوانه الداخلي**، وشهادة **Let's Encrypt عبر DNS-01**. لا شهادة ذاتية التوقيع ولا توزيع CA على الأجهزة.
- **الإنتاج يسحب tag لا main:** حتى لا تهبط تجارب التطوير على الإنتاج.
- **الصلاحيات:** RBAC هرمي محسوب من موقع الشخص في الشجرة، ومعالجة خاصة لـ`followUpOfficer`، وفحص في كل طلب على الخلفية.
- **حالات التسليم:** `TaskStatus` قابل للتخصيص لكل إدارة، بفئة سلوكية + `latenessKind` (داخلي/خارجي).
- **محرك الانحراف (الميزة المحورية — PLAN القسم 9):** حتمي قائم على السعة. استباقي («ماذا لو»: استهلاك السعة · المهام المنزاحة · **المهام المهدّدة بالأسماء**) وارتجاعي. التقدير **بالحجم** لا بالساعات، والوقت الفعلي **مشتق** من انتقالات الحالة.
- **التقاط البيانات مبكرًا:** حقول السعة (م1)، الحجم والتوقيت (م2)، «الفتيل القصير» والـWorkLog المشتق (م3) — والمحرك يُبنى في م6.
- **سياسة التخصيص:** المستوى 2 أساس؛ المستوى 3 جاهز للتفعيل لاحقًا؛ 4 و5 مستبعدان.
- **النسخ والتصدير:** نسخة كاملة للنظام + تصدير بيانات ضمن نطاق الصلاحية (م6).
- **الحجم:** ~150 مستخدمًا → خادم إنتاج واحد.
- **(م1) حزمة `@task/shared`** تُبنى إلى `dist` وتُستهلك كحزمة عادية في الـapi والـweb؛ الحاويتان تبنيانها عند الإقلاع من المصدر المثبّت.
- **(م1) الصور بـ `npm install` لا `npm ci`:** لا `package-lock.json` في المستودع بعد (لم يمكن توليده). عند استقرار الحزم: `docker compose exec api cat /app/package-lock.json` ← ارفعه إلى المستودع وبدّل Dockerfile إلى `npm ci`.
- **(م1) hot reload:** تُربط مجلدات المصدر فقط (`src`، `prisma`، `test`) لا المجلد كله — حتى تبقى `node_modules` داخل الصورة وتتجدّد مع `task deploy`.
- **(م1) الرموز في الواجهة:** access (15د) + refresh (7 أيام، دوّار، تجزئته فقط في DB، إعادة استخدام رمز مُبطَل تُنهي كل الجلسات) محفوظان في `localStorage` — مقبول للتطوير؛ يُراجَع مع CSP في مرحلة التصليب قبل الإنتاج.
- **(م1) المسار المحمي بلا `@Require()` يُرفض** (403) — فلا يُنسى إعلان الصلاحية على مسار جديد. المسارات الذاتية تُعلَّم `@Require('self')`.
- **(م1) الإجراءات:** `org.read/manage` · `users.read/manage` · `holidays.read/manage` · `leaves.read/manage` · `audit.read` · `self`. قاعدة الإدارة: الفاعل يدير وحدة **أدنى** من مستوى نطاقه فقط (المدير العام يدير إداراته لا إدارته العامة نفسها؛ الرئيس يدير الكل).

### 5.أ التأمين المطبَّق على خادم التطوير (`scripts/00-server.sh` — مطابق لمواصفات التحصين المعتمدة لدى المستخدم)

- **SSH:** 2244، `AddressFamily inet`، بلا root، `AllowUsers devadmin`، 3 محاولات، ملف `sshd_config.d/10-hardening.conf` (10 ليُقرأ قبل cloud-init)، التطبيق عبر `daemon-reload` + `restart ssh.socket`. آخر خطوة في المرحلة 1.
- **IPv6** معطّل بـ sysctl (لا GRUB) و`IPV6=yes` في ufw · **ufw** `ENABLED=yes` + enable، منع الوارد عدا 2244 و443، لا منفذ 80، بلا `from 0.0.0.0/0`.
- **الحصر الجغرافي للسعودية:** ipset `geo_sa` (hash:net، 4096/65536) من ipdeny + iCloud Private Relay (SA) + `/etc/task-geo/allow-extra.txt`؛ تحقق (≥300 نطاق، CIDR صالح) ثم `ipset swap` ذري وحفظ على القرص؛ تحميل عند الإقلاع قبل ufw (`--boot`، المجموعة تُنشأ ولو فارغة)؛ تحديث أسبوعي الأحد 03:00 UTC. القاعدتان (ACCEPT لـ geo_sa ثم DROP) **آخر `ufw-before-input` قبل COMMIT** بوسم `task-geo`، مع `before.rules.bak` و`iptables-restore --test` و**تراجع تلقائي بعد 5 دقائق** (`systemd-run`) يُلغى في `--finish`. المنفذ 22 المؤقت غير محصور.
- **fail2ban:** `nftables-multiport` (يعمل قبل ufw فيصيب المهاجم السعودي أيضًا)، 1h × تصاعد حتى أسبوع، سجون `sshd` (systemd) + `nginx-modsecurity` + `nginx-limit-req`، `fail2ban-client -t` واختبار حظر/فكّ لعنوان وهمي.
- **Docker** على 127.0.0.1 في `daemon.json` (يتجاوز ufw) — واكتب `127.0.0.1:` صراحةً في كل `ports` داخل compose.
- **nginx:** 443 فقط، `listen 443 ssl http2` (nginx 1.24 لا يعرف `http2 on;`)، `ssl_reject_handshake` للأسماء الأخرى، TLS 1.2/1.3، HSTS يوم (سنة للإنتاج)، `server_tokens off`. **WAF** ModSecurity v3 + OWASP CRS، الإعداد في `/etc/nginx/modsecurity.conf`، `SecRuleEngine On`، الاستثناءات في REQUEST-900 فقط، تدوير `modsec_audit.log` أسبوعيًا. الصفحة المؤقتة تخدم ملفًا (لا `return` — يتجاوز WAF).
- **HTTPS:** Let's Encrypt عبر DNS-01 بمفتاح DigitalOcean (صلاحية `domain` فقط) في `/root/.secrets/certbot/` (700/600)، hook يعيد تحميل nginx.
- **الإنتاج الداخلي:** `ENV=internal-prod CERT_FILE=… KEY_FILE=… INTERNAL_NETS=…` → بلا حصر جغرافي ولا certbot؛ السماح من الشبكات الداخلية فقط؛ `ignoreip` يشمل بوابات NAT؛ HSTS سنة.
- **الطوارئ:** Recovery Console في DigitalOcean (لا Droplet Console — يمر عبر SSH فيُحجب). جدول الطوارئ في README.

**دروس المرحلة 1 (التسليم):** أطلب من المساعد دائمًا أن يبني سكربت المرحلة بحيث يشغّل `tsc` و`jest` و`e2e` داخل الحاويات قبل القبول — فبيئته قد لا تصل إلى سجل npm. · ترحيلات Prisma تُكتب يدويًا بنمط Prisma ثم يثبتها `migrate diff --exit-code` على الخادم. · سكربت المرحلة يعمل بـ sudo لكنه يسحب git بصفة مالك المجلد (`devadmin`) حتى لا تتلوّث ملفات `.git` بملكية root.

**دروس المرحلة 0:** `grep` بلا نتائج داخل `pipefail` يُسقط العملية كلها → `|| true` · لا تُنشئ ipset بـ `-exist` إن اختلفت المعاملات عن مجموعة قائمة → افحص `ipset list -n` أولًا · nginx 1.24: `http2` داخل `listen` · عند حذف الخادم وإعادة إنشائه بنفس النطاق: `ssh-keygen -R "[iat.sa]:2244"` على ويندوز.

## 6. خريطة المراحل

| # | المرحلة | المخرَج | الأمر |
|---|---|---|---|
| **0** | **تجهيز الخادم** ✅ منفَّذة | خادم مؤمَّن + HTTPS + WAF + Docker | `sudo bash scripts/00-server.sh` ثم `--finish` ثم `--status` |
| **1** | الأساس 🟡 مكتوبة — بانتظار التشغيل | Monorepo + مصادقة + هيكل تنظيمي + RBAC + حقول السعة | `task deploy && sudo task phase 1` |
| **2** | المهام | CRUD + إسناد متعدد + فرعية + تعليقات + مرفقات + الحجم والتوقيت | `sudo task phase 2` |
| **3** | التصنيف والحالات | أنواع + حالات لكل إدارة + عرضي/دوري + الفتيل القصير + WorkLog مشتق | `sudo task phase 3` |
| **4** | العروض | Kanban + قائمة + تقويم + فلاتر + WebSocket | `sudo task phase 4` |
| **5** | الإشعارات | BullMQ + In-App + Email + التفضيلات | `sudo task phase 5` |
| **6** | الانحراف والتقارير | **محرك الانحراف** + داشبوردات + تقرير الأثر + تدقيق + نسخ وتصدير | `sudo task phase 6` |
| **6.ب** | الإنتاج | الخادم الداخلي بنطاق حقيقي وشهادة Let's Encrypt (DNS-01) + نشر إصدار موسوم | `sudo bash scripts/00-server.sh --prod` |
| **7** | **PWA + Web Push** | manifest + service worker + عمل بلا اتصال + تثبيت على الشاشة الرئيسية + Web Push (VAPID) | `sudo task phase 7` |
| **8** | Insights | تحليلات إحصائية داخلية | `sudo task phase 8` |

لا تنتقل لمرحلة قبل نجاح «معايير القبول» في `PLAN.md` — وسكربت كل مرحلة يفحصها تلقائيًا في نهايته.

---

## 7. الـ prompts الجاهزة

### 7.أ المرحلة 0 — تجهيز الخادم ✅ (منفَّذة؛ للمرجع ولخادم جديد)

> 1) `scp -r scripts deploy root@<IP>:/root/` ثم `ssh root@<IP>` ثم `bash /root/scripts/00-server.sh` (يسأل: النطاق · البريد · كلمة مرور devadmin · توكن DO).
> 2) من نافذة جديدة خلال 5 دقائق: `ssh -p 2244 devadmin@<IP>` ثم `sudo task harden --finish` ثم `sudo task verify`.
> 3) ربط GitHub: `task deploy-key` ← أضف المفتاح في **Deploy keys** بلا كتابة ← `git -C ~/task-system remote add origin git@github.com-task:<حسابك>/task-system.git && git -C ~/task-system fetch origin && git -C ~/task-system reset --hard origin/main`.

### 7.ب المرحلة 1 — الأساس 🟡 (الكود مسلَّم؛ هذا الـprompt للمرجع)

```text
مرفق PLAN.md (1.2) و HANDOFF.md (2.2) و prototype.html. الخادم جاهز ومحصّن (المرحلة 0 منفّذة ومُتحقَّق منها بـ task verify) على iat.sa، والمستودع على GitHub.
نبني المرحلة 1 فقط.

التزم بقاعدة التنفيذ في القسم 3 من HANDOFF: اكتب كل الملفات دفعة واحدة، وأعطني أمر
تشغيل واحد في النهاية — لا خطوة في كل رسالة.

المطلوب:
- Monorepo: apps/api (NestJS+TS)، apps/web (Next.js App Router + Tailwind + RTL + Dark)،
  packages/shared. و Dockerfile لكل منهما (dev: hot reload) وخدمتاهما في docker-compose.yml
  مربوطتين بـ 127.0.0.1 فقط (web:3000، api:3001) وتعتمدان على صحة postgres/redis.
- Prisma: User (role، generalAdminId/administrationId/sectionId القابلة للفراغ، authSource،
  dailyCapacityHours، workingDays) + GeneralAdministration + Administration + Section
  + Holiday + Leave + AuditLog. Migrations + seed بمستخدم لكل دور.
- مصادقة محلية: دخول/خروج/تحديث التوكن، JWT access+refresh، argon2، سياسة كلمات مرور،
  قفل بعد محاولات فاشلة. AuthModule بواجهة استراتيجية مجرّدة (LocalStrategy الآن،
  مكان LdapStrategy بلا تفعيل).
- RBAC هرمي: Guard يحسب الصلاحية من موقع الفاعل في الشجرة، معالجة خاصة لـfollowUpOfficer،
  مبدأ أقل صلاحية، فحص في كل طلب على الخلفية.
- CRUD للهيكل التنظيمي + تعيين المدراء والمشرفين + CRUD بسيط للعطل والإجازات.
- واجهات: تسجيل الدخول + شجرة الهيكل + تخطيط RTL/Dark — **بهوية prototype.html المرفق**.
- سجل تدقيق (Interceptor) + اختبارات (Jest + Supertest) للمصادقة والصلاحيات.
- وحدّث scripts/phases/01-foundation.sh ليطابق ما بنيته فعلًا.
- سلّم الملفات في المحادثة مباشرة (zip عبر SendUserFile) لأرفعها من متصفح GitHub، ثم أمر واحد على الخادم: task deploy && sudo task phase 1.
- السكربتات السابقة أخطأت لأنها لم تُجرَّب: افحص كل ملف إعداد بأداته (nginx -t، docker compose config، prisma validate) قبل تسليمه.

قيود البيئة: أي منفذ حاوية على 127.0.0.1 فقط؛ الوصول الخارجي عبر nginx/443؛ لا تعطيل
لـWAF (أي حجب خاطئ → استثناء محدّد في deploy/waf/task-exclusions.conf)؛ لا أسرار في git.

معايير القبول: دخول آمن عبر https://<النطاق>؛ CRUD للهيكل؛ صلاحيات هرمية فعّالة على
الخلفية؛ `task verify` ينجح بالكامل.
```

### 7.ج المرحلة 2 — المهام (الـprompt الجاهز)

```text
مرفق PLAN.md (1.2) و HANDOFF.md (2.3) و prototype.html. المرحلة 1 منفَّذة على iat.sa (sudo task phase 1 نجح
و task verify ينجح). الكود على GitHub (ibraabdu1574-oss/task-system). نبني المرحلة 2 فقط.

التزم بقاعدة التنفيذ (HANDOFF القسم 3): كل الملفات دفعة واحدة + أمر تشغيل واحد.
ابنِ فوق ما في HANDOFF القسم 4.هـ (نفس الأنماط: @Require + PermissionService.assert في الخدمة، @Audit، DTOs بـ class-validator،
الأنواع المشتركة في packages/shared، هوية prototype.html في الواجهة).

المطلوب (PLAN القسم 18 — المرحلة 2):
- Prisma: Task (ذاتية المرجع parentTaskId، priority، category عرضي/دوري، dueDate،
  sizePreset + estimatedHours + startedAt + completedAt — التقاط مبكّر بلا محرك) + TaskAssignment متعدد الأنواع
  + SizePresetConfig (افتراضي عام 4/16/40 ساعة، قابل للضبط لكل إدارة) + Comment + Attachment + TaskActivity (سجل نشاط المهمة).
  ترحيل جديد في prisma/migrations (SQL يدوي بنمط Prisma — السكربت يفحص المطابقة بـ migrate diff).
- API: CRUD للمهام ضمن النطاق (الموظف يرى المسند إليه فقط؛ مسؤول المتابعة كل مهام إدارته)، إسناد لعدة
  جهات (مستخدم/قسم/إدارة/إدارة عامة)، مهام فرعية بإسناد مستقل، تعليقات، مرفقات (خارج الجذر العام، أسماء عشوائية،
  تحقق نوع/حجم، فحص الصلاحية قبل التنزيل)، سجل نشاط لكل تغيير. إجراءات جديدة في shared: tasks.read/create/update/assign/comment/attach.
- الواجهة: قائمة المهام (فلاتر أساسية) + صفحة تفاصيل المهمة (الإسناد، الفرعية، المرفقات، التعليقات، سجل النشاط)
  + نموذج مهمة جديدة باختيار الحجم — بهوية prototype.html (#page-tasks، #page-task، #page-new).
- اختبارات: وحدة لنطاق رؤية المهام + e2e لإسناد متعدد وفرعية وصلاحيات التعليق/المرفق.
- استثناء WAF محدّد لرفع المرفقات إن حُجب (deploy/waf/task-exclusions.conf — القاعدة 9000110 موجودة).
- scripts/phases/02-tasks.sh على غرار 01-foundation.sh (ترحيل + بذرة مهام تجريبية + tsc + jest + e2e + قبول عبر HTTPS + verify).

قيود البيئة: أي منفذ حاوية على 127.0.0.1 فقط؛ لا تعطيل للـWAF؛ لا أسرار في git؛ لا package-lock بعد (npm install في الصور).

معايير القبول (PLAN): إسناد مهمة لعدة جهات/موظفين، تقسيمها لفرعية بإسناد مستقل، نقاش وتعليقات، تتبّع كل تغيير،
تسجيل الحجم والتوقيت لكل مهمة، و`sudo task verify` ينجح.
```

### 7.د قالب أي مرحلة تالية

```text
مرفق PLAN.md و HANDOFF.md. أكملنا حتى المرحلة <N-1>. نبني المرحلة <N> فقط.
التزم بقاعدة التنفيذ (HANDOFF القسم 3): كل الملفات دفعة واحدة + أمر تشغيل واحد.
المطلوب: <من PLAN.md القسم 18>
وأنتج scripts/phases/<NN>-<اسم>.sh على غرار 01-foundation.sh.
معايير القبول: <من PLAN.md> + `task verify` ينجح.
```

## 8. روتين نهاية كل محادثة

1. **الكود** → ارفع الملفات في GitHub من المتصفح (`Add file ← Upload files`) أو حرّر وcommit من `github.dev`
2. **سكربت المرحلة** → داخل المستودع في `scripts/phases/`
3. **`HANDOFF.md` محدّثًا** → القسم 2 (الحالة) + أي قرار جديد + prompt المرحلة التالية
4. **وسم الإصدار عند الاستقرار** → من GitHub: `Releases ← Draft a new release ← Create new tag` (الإنتاج يسحب الوسوم لا الفرع)

---

*آخر تحديث: 2026-10-20 — الإصدار 2.3: كود المرحلة 1 مسلَّم، بانتظار `sudo task phase 1`. الإصدار 2.2: المرحلة 0 منفَّذة؛ `00-server.sh` على مواصفات التحصين المعتمدة. الإصدار 2.1: PWA بدل التطبيق الأصلي · Web Push بمفاتيح VAPID · خادم الإنتاج بنطاق حقيقي وشهادة موثوقة (شرط PWA) · نقل الكود عبر متصفح GitHub و`github.dev` بلا git على ويندوز.*
