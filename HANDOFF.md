# HANDOFF — نظام إدارة المهام الداخلي

> ملف التسليم بين المحادثات. **مخرجات كل محادثة = بذرة المحادثة التالية.**
> **الإصدار 2.4 (2026-10-21)** — **كود المرحلة 2 مكتوب ومسلَّم** (المهام: CRUD ضمن النطاق + إسناد متعدد الأنواع + فرعية بإسناد مستقل + تعليقات + مرفقات + سجل نشاط + الحجم والتوقيت + أحجام قابلة للضبط لكل إدارة + واجهة قائمة/تفاصيل/إنشاء) · `02-tasks.sh` يرحّل ويبذر ويشغّل tsc/Jest/Supertest داخل الحاويات ثم يفحص القبول عبر HTTPS · بانتظار `sudo task phase 2`.

---

## 1. كيف تستخدم هذا الملف

1. افتح محادثة جديدة داخل نفس المشروع.
2. ارفع: `HANDOFF.md` (هذا الملف) + `PLAN.md` + `prototype.html`. **الكود لا يُرفع** — صار على GitHub (وتستطيع لصق رابط المستودع).
3. الصق prompt المرحلة من القسم 7.
4. في نهاية المحادثة تستلم: ملفات الكود + سكربت المرحلة + `HANDOFF.md` محدّثًا.

---

## 2. حالة المشروع الآن

- **مكتمل:** التخطيط (`PLAN.md` 1.2) + النموذج البصري (`prototype.html`) + **المرحلة 0** (خادم التطوير مجهّز ومحصّن).
- **المرحلة 1 — منفَّذة ومقبولة (2026-10-21):** `sudo task phase 1` نجح كاملًا (tsc ×2، 8 وحدة، 18 تكامل، قبول HTTPS، verify). الدخول والهيكل يعملان على https://iat.sa.
- **المرحلة 2 — الكود مسلَّم (2026-10-21)، بانتظار التشغيل:** ملفات المرحلة (القسم 4.و) تُرفع إلى GitHub ثم `task deploy && sudo task phase 2`. السكربت: ترحيل `20261021000000_phase2_tasks` + بذرة (أحجام 4/16/40 + 9 مهام تجريبية بفرعية وتعليقات) + tsc ×2 + Jest (17 وحدة) + Supertest (18 + 11 تكامل) + قبول عبر HTTPS (إسناد لثلاث جهات، فرعية، حالة/توقيت، تعليق، رفع/تنزيل مرفق عبر WAF، نطاق الرؤية) + verify.
- **الخادم:** DigitalOcean، Ubuntu 24.04، النطاق **`iat.sa`**، الدخول `ssh -p 2244 devadmin@iat.sa`. `sudo task verify` ينجح (المرحلة 0). nginx يعرض الصفحة المؤقتة حتى يُشغَّل `sudo task phase 1`.
- **الكود:** المستودع الخاص **`ibraabdu1574-oss/task-system`** مربوط بالخادم (`/home/devadmin/task-system`، فرع `main`) بمفتاح نشر للقراءة فقط. آخر commit مسجّل: `7380f4a` (قبل رفع المرحلة 1).
- **`.env`:** يُولَّد كاملًا عند أول `sudo task phase 1` (قاعدة البيانات، JWT، `SEED_PASSWORD`).
- **الخطوة القادمة:** تشغيل `sudo task phase 2` على الخادم ولصق الناتج؛ بعد نجاحه → **المرحلة 3 — التصنيف والحالات** (القسم 7.د). الحسابات التجريبية: 1001/1002/1003/1015/1020/1042/1051 وكلمة المرور في `.env` (`SEED_PASSWORD`).

> **ما تغيّر في 2.4:** كود المرحلة 2 كُتب كاملًا فوق أنماط المرحلة 1. بيئة المساعد ما زالت بلا سجل npm، فتحقّقنا محليًا من: SQL الترحيل على PostgreSQL 16 حقيقي (بعد ترحيل المرحلة 1)، صلاحية YAML/bash، وصياغة TypeScript مع حل `@task/shared` من المصدر؛ أما الأنواع المولّدة (Prisma/Nest/React) فيفحصها `tsc` داخل الحاويات في الخطوة 6 من السكربت. **اختلاف واحد عن PLAN:** حالة المهمة في المرحلة 2 = الفئة السلوكية فقط (`TaskState: not_started/in_progress/done`)؛ `TaskStatus` القابلة للتخصيص لكل إدارة تُضاف في المرحلة 3 وتُربط بهذه الفئة (القسم 5).
>
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

### 4.و هيكل الكود (المرحلة 2 — ما أُضيف أو عُدّل)

```
packages/shared/src/index.ts        + إجراءات tasks.read/create/update/assign/comment/attach · أنواع المهام (TaskSummary/TaskDetail/…) · ثوابت الأحجام 4/16/40 · سياسة المرفقات
apps/api/prisma/schema.prisma       + Task (ذاتية المرجع، seq، category، priority، state، dueDate، sizePreset/estimatedHours/startedAt/completedAt، موقع في الشجرة)
                                      + TaskAssignment (متعدد الأنواع + موقع الجهة محفوظ معه) + SizePresetConfig + Comment + Attachment + TaskActivity
apps/api/prisma/migrations/20261021000000_phase2_tasks/   SQL يدوي بنمط Prisma (مُجرَّب على PostgreSQL 16)
apps/api/prisma/seed.ts             + الأحجام الافتراضية + 9 مهام تجريبية تطابق prototype.html (تُضاف مرة واحدة)
apps/api/src/modules/tasks/
  task-scope.ts (+spec)             نطاق رؤية المهام — دوال نقية: visibleTasksWhere (قيد Prisma) · canSeeTask · canManageTask
  tasks.service.ts                  CRUD + إسناد + فرعية + تعليقات + سجل نشاط + أحجام→ساعات (كل فحص صلاحية يتكرر هنا)
  attachments.service.ts            تخزين خارج الجذر العام (ATTACHMENTS_DIR) بأسماء عشوائية + تحقق امتداد/توقيع/حجم + فحص الصلاحية قبل التنزيل
  tasks.controller.ts · dto/task.dto.ts · tasks.module.ts
apps/api/src/modules/rbac/permission.service.ts   + إجراءات المهام لكل دور (tasks.assign لغير الموظف)
apps/api/src/config/config.ts       + attachmentsDir · app.module.ts + TasksModule · main.ts (إصدار Swagger) · package.json + @types/multer
apps/api/test/tasks.e2e-spec.ts     11 اختبار تكامل: إسناد متعدد، نطاق الرؤية، فرعية، حالة/توقيت، تعليقات، مرفقات، أحجام، فلاتر، تدقيق
apps/web/src/app/(app)/tasks/       page.tsx (قائمة + فلاتر) · new/page.tsx (نموذج + اختيار الحجم + إسناد متعدد) · [id]/page.tsx (التفاصيل)
apps/web/src/components/tasks/      bits.tsx (شارات/تنسيق/نص النشاط) · AssigneePicker.tsx (من /org/tree) · SizePicker.tsx (من /tasks/size-presets)
apps/web/src/app/globals.css        + مكوّنات page-tasks/page-task/page-new · Shell.tsx (تفعيل «المهام» + بحث) · dashboard (إحصاءات المهام) · lib/api.ts (upload/download)
docker-compose.yml                  + volume attachments:/app/data/attachments + ATTACHMENTS_DIR · .env.example (تعليق) · deploy/nginx/taskapp.conf.tmpl بلا تغيير
deploy/waf/task-exclusions.conf     القاعدة 9000110 صارت لمسار POST /api/v1/tasks/<uuid>/attachments (200002/200004 + إزالة أهداف FILES/FILES_NAMES من قواعد الحقن) · 9000120 تبقى لـ /_next/static
scripts/task                        نص المساعدة + task test (لا تغيير في منطق nginx؛ القالب فيه client_max_body_size 25m أصلًا)
scripts/phases/02-tasks.sh          سكربت المرحلة
```

**واجهة المهام (API):** `GET/POST /tasks` · `GET/PATCH/DELETE /tasks/:id` · `POST /tasks/:id/state` · `POST /tasks/:id/assignments` · `DELETE /tasks/:id/assignments/:aid` · `POST /tasks/:id/comments` · `DELETE …/comments/:cid` · `POST /tasks/:id/attachments` (multipart `file`) · `GET …/attachments/:aid/download` · `DELETE …/attachments/:aid` · `GET /tasks/stats` · `GET/PUT /tasks/size-presets`.

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
- **(م2) حالة المهمة = الفئة السلوكية:** `Task.state: not_started | in_progress | done` فقط. المرحلة 3 تضيف `TaskStatus` القابلة للتخصيص لكل إدارة (اسم/لون/ترتيب + `category` + `latenessKind`) وتربط `Task.statusId` بها، وتبقى `state` مشتقة من فئة الحالة. «متأخرة» تُحسب من `dueDate` لا تُخزَّن.
- **(م2) نطاق رؤية المهام (`task-scope.ts`):** المهمة مرئية إن كان موقعها (من منشئها) داخل نطاق الفاعل الإداري، أو أنشأها هو، أو أُسندت إليه/إلى وحدة ينتمي إليها/إلى جهة داخل نطاقه. الموظف يرى المسند إليه فقط؛ مسؤول المتابعة يرى كل مهام إدارته. **الإدارة** (تعديل/إسناد/حذف) لمنشئها أو لمستوى إداري يحتوي موقعها — من يراها عبر إسناد فقط يعلّق ويرفق ويحرّك حالتها ولا يعدّل بياناتها. غير المرئي يعيد **404** (بلا تسريب وجوده).
- **(م2) الإسناد ضمن النطاق:** الجهة المسندة يجب أن تكون داخل نطاق الفاعل (مدير إدارة لا يُسند لإدارة أخرى ولا لإدارته العامة كوحدة). التوزيع عبر الإدارات = المرحلة 3. الموظف بلا `tasks.assign`: يُسند لنفسه فقط (مهمته أو فرعية من مهمة يراها). موقع جهة الإسناد يُحفظ مع الإسناد (`TaskAssignment.generalAdminId/administrationId/sectionId/userId`) ليُحسب النطاق باستعلام واحد.
- **(م2) الفرعية مستوى واحد** (لا فرعية من فرعية)، موقعها موقع الأم وإسنادها مستقل، وحذف الأم يحذفها (cascade).
- **(م2) الحجم والتوقيت:** `estimatedHours` يُشتق من `sizePreset` عبر `SizePresetConfig` (ضبط الإدارة ← الافتراضي العام في DB ← الثوابت 4/16/40) ويمكن تجاوزه يدويًا؛ تغيير الحجم بلا ساعات صريحة يعيد الاشتقاق. `startedAt` عند أول `in_progress`، `completedAt` عند `done` (يُمسح عند الرجوع). ضبط الأحجام: الرئيس للعام، والمستوى الإداري المحتوي للإدارة.
- **(م2) المرفقات:** volume `attachments` على `/app/data/attachments` (خارج أي جذر عام، لا يُخدَم مباشرةً)، اسم مخزَّن عشوائي (uuid.ext)، الامتدادات المسموحة في `ATTACHMENT_POLICY` (pdf/صور/نصوص/office/zip، ≤10 MB)، تحقق من توقيع الملف لا من نوع MIME المرسل، تنزيل بـ `Content-Disposition` آمن (RFC 5987 للعربية) وبعد فحص الرؤية. أسماء الملفات العربية من multer 1.x تُصحَّح من latin1. قالب nginx فيه `client_max_body_size 25m` (أكبر من حدّ الـ API 10 MB وأقل من `SecRequestBodyLimit`). استثناء WAF للمرفقات = القاعدة **9000110** في `task-exclusions.conf` (مسار `/tasks/<uuid>/attachments`؛ معرّفات 9000110–9000111 للمرفقات، 9000120 للملفات الثابتة — لا تكرّر معرّفًا). النسخ الاحتياطي (`task backup`) يغطي قاعدة البيانات فقط — ملفات المرفقات في volume `taskapp_attachments` (تُضاف إلى النسخة الكاملة في المرحلة 6).
- **(م2) سجل نشاط المهمة (`TaskActivity`)** يُكتب في نفس معاملة التغيير: created/updated(+diff)/state_changed/assigned/unassigned/subtask_created/comment_added/comment_deleted/attachment_added/attachment_deleted. سجل التدقيق العام (`AuditLog`) يبقى على مستوى الطلب.
- **(م2) `Task.seq`** رقم متسلسل قصير للعرض (#1048) إلى جانب uuid.

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

**دروس المرحلة 1 (التشغيل):** `task deploy` يفشل قبل أول `task phase 1` لأن compose يرفض العمل بلا `.env` — طبيعي؛ السكربت يولّده. · WAF حجب PUT/PATCH/DELETE (CRS 911100) → استثناء 9000105 يوسّع `tx.allowed_methods` على `/api/` فقط. · كل حجب WAF يُحتسب في fail2ban (5/10د) → `sudo fail2ban-client unban --all`. · سجل ModSecurity (`SecAuditEngine RelevantOnly` → `/var/log/modsec_audit.log`) مفعّل يدويًا على الخادم لتشخيص الحجب — أضفه إلى `00-server.sh` عند أول تعديل عليه.

**دروس المرحلة 2 (التسليم):** الاختبارات تُكتب لتعمل على البذرة نفسها (الحسابات 1001–1090/2001 والهيكل التجريبي) وتنظّف ما تنشئه · **ارفع مع كل مرحلة كل ملفات `deploy/` و`scripts/`** (أو zip المستودع كاملًا) حتى لا يعيد المساعد كتابة ملف لم يره — في 2.4 كاد يتكرر معرّف WAF 9000120 · `sudo task phase N` يحدّث `/usr/local/bin/task` من المستودع تلقائيًا إن اختلف.

**دروس المرحلة 1 (التسليم):** أطلب من المساعد دائمًا أن يبني سكربت المرحلة بحيث يشغّل `tsc` و`jest` و`e2e` داخل الحاويات قبل القبول — فبيئته قد لا تصل إلى سجل npm. · ترحيلات Prisma تُكتب يدويًا بنمط Prisma ثم يثبتها `migrate diff --exit-code` على الخادم. · سكربت المرحلة يعمل بـ sudo لكنه يسحب git بصفة مالك المجلد (`devadmin`) حتى لا تتلوّث ملفات `.git` بملكية root.

**دروس المرحلة 0:** `grep` بلا نتائج داخل `pipefail` يُسقط العملية كلها → `|| true` · لا تُنشئ ipset بـ `-exist` إن اختلفت المعاملات عن مجموعة قائمة → افحص `ipset list -n` أولًا · nginx 1.24: `http2` داخل `listen` · عند حذف الخادم وإعادة إنشائه بنفس النطاق: `ssh-keygen -R "[iat.sa]:2244"` على ويندوز.

## 6. خريطة المراحل

| # | المرحلة | المخرَج | الأمر |
|---|---|---|---|
| **0** | **تجهيز الخادم** ✅ منفَّذة | خادم مؤمَّن + HTTPS + WAF + Docker | `sudo bash scripts/00-server.sh` ثم `--finish` ثم `--status` |
| **1** | الأساس ✅ منفَّذة | Monorepo + مصادقة + هيكل تنظيمي + RBAC + حقول السعة | `task deploy && sudo task phase 1` |
| **2** | المهام 🟡 الكود مسلَّم | CRUD + إسناد متعدد + فرعية + تعليقات + مرفقات + الحجم والتوقيت | `task deploy && sudo task phase 2` |
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

### 7.ج المرحلة 2 — المهام 🟡 (الكود مسلَّم؛ هذا الـprompt للمرجع)

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

### 7.د المرحلة 3 — التصنيف والحالات القابلة للتخصيص (الـprompt الجاهز)

```text
مرفق PLAN.md (1.2) و HANDOFF.md (2.4) و prototype.html. المرحلتان 1 و2 منفَّذتان على iat.sa (sudo task phase 2 نجح
و task verify ينجح). الكود على GitHub (ibraabdu1574-oss/task-system). نبني المرحلة 3 فقط.

التزم بقاعدة التنفيذ (HANDOFF القسم 3): كل الملفات دفعة واحدة + أمر تشغيل واحد.
ابنِ فوق HANDOFF القسمين 4.هـ و4.و والقرارات (م2) في القسم 5 (نفس الأنماط: @Require + فحص موضعي في الخدمة،
@Audit، DTOs بـ class-validator، الأنواع في packages/shared، task-scope.ts لنطاق الرؤية، هوية prototype.html).

المطلوب (PLAN القسم 18 — المرحلة 3):
- Prisma: TaskType (عام أو لكل إدارة، يديره مسؤول المتابعة) + TaskStatus القابلة للتخصيص لكل إدارة
  (nameAr/nameEn/color/order/category/isActive + latenessKind للحالات من فئة overdue) + Task.taskTypeId و Task.statusId
  و Task.latenessKind؛ تبقى Task.state مشتقة من فئة الحالة. مجموعة حالات افتراضية عامة تُبذر وتُنسخ لأي إدارة عند أول تخصيص.
  + WorkLog (userId/taskId/category/hours/logDate/source) + ترحيل يدوي بنمط Prisma + ترحيل بيانات للمهام القائمة (state → statusId).
- API: CRUD للأنواع والحالات (مسؤول المتابعة/مدير الإدارة ضمن إدارته، الرئيس للعام)، تغيير حالة المهمة عبر statusId
  (مع تحديث state/startedAt/completedAt وتعبئة WorkLog مشتق source=derived عند الانتقال من in_progress)،
  توزيع المهام عبر الإدارات (الإسناد لجهة خارج نطاق الفاعل يُسمح للمدير العام/الرئيس، وتتبّع مسار المهمة بين الجهات)،
  «كل جهة ترى الموجّه إليها فقط» (مراجعة task-scope.ts)، اقتراح «الفتيل القصير» (dueDate − اليوم < عتبة الإدارة ⇒ adhoc)
  كاقتراح يعيده GET /tasks/suggest-category ويُثبّته المستخدم أو يغيّره. إجراءات جديدة في shared: taskTypes.manage · taskStatuses.manage · worklog.read.
- الواجهة: إعدادات الأنواع والحالات لكل إدارة (#page-settings)، فلترة المهام بالنوع/الحالة، تغيير الحالة من قائمة حالات الإدارة
  بألوانها، شارة «متأخر داخلي/خارجي»، اقتراح التصنيف في نموذج الإنشاء.
- اختبارات: وحدة لاشتقاق state/WorkLog من انتقالات الحالة والفتيل القصير + e2e لإدارة الحالات ضمن الإدارة وتوزيع المهام بين الإدارات.
- scripts/phases/03-statuses.sh على غرار 02-tasks.sh (ترحيل + ترحيل بيانات + بذرة حالات + tsc + jest + e2e + قبول HTTPS + verify).

قيود البيئة: أي منفذ حاوية على 127.0.0.1 فقط؛ لا تعطيل للـWAF؛ لا أسرار في git؛ لا package-lock بعد.

معايير القبول (PLAN): مسؤول المتابعة يضيف/يعدّل الأنواع والحالات (لكل إدارة حالاتها)، النظام يفرّق بين المتأخر الداخلي
والخارجي، كل جهة ترى الموجّه إليها فقط، اقتراح تصنيف العرضي تلقائيًا مع إمكانية التغيير، و`sudo task verify` ينجح.
```

### 7.هـ قالب أي مرحلة تالية

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

*آخر تحديث: 2026-10-21 — الإصدار 2.4: كود المرحلة 2 مسلَّم، بانتظار `sudo task phase 2`. الإصدار 2.3: كود المرحلة 1 مسلَّم. الإصدار 2.2: المرحلة 0 منفَّذة؛ `00-server.sh` على مواصفات التحصين المعتمدة. الإصدار 2.1: PWA بدل التطبيق الأصلي · Web Push بمفاتيح VAPID · خادم الإنتاج بنطاق حقيقي وشهادة موثوقة (شرط PWA) · نقل الكود عبر متصفح GitHub و`github.dev` بلا git على ويندوز.*
