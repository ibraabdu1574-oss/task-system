/**
 * بيانات تجريبية — مستخدم لكل دور وهيكل يطابق prototype.html.
 * آمن للتكرار (upsert). بيئة التطوير فقط.
 * كلمة المرور لكل الحسابات من SEED_PASSWORD (يولّدها السكربت في .env).
 *
 *   npx prisma db seed     (أو: task seed)
 */
import { PrismaClient, Role, type AssigneeType, type SizePreset } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD || PASSWORD.length < 12) {
  console.error('✗ SEED_PASSWORD غير موجود أو أقصر من 12 خانة — شغّل: task env');
  process.exit(1);
}

async function ga(name: string) {
  return prisma.generalAdministration.upsert({ where: { name }, update: {}, create: { name } });
}
async function admin(generalAdminId: string, name: string) {
  return prisma.administration.upsert({
    where: { generalAdminId_name: { generalAdminId, name } },
    update: {},
    create: { generalAdminId, name },
  });
}
async function section(administrationId: string, name: string) {
  return prisma.section.upsert({
    where: { administrationId_name: { administrationId, name } },
    update: {},
    create: { administrationId, name },
  });
}

interface SeedUser {
  employeeNo: string;
  name: string;
  email: string;
  role: Role;
  generalAdminId?: string | null;
  administrationId?: string | null;
  sectionId?: string | null;
}

async function user(u: SeedUser, passwordHash: string) {
  const data = {
    name: u.name,
    email: u.email,
    role: u.role,
    generalAdminId: u.generalAdminId ?? null,
    administrationId: u.administrationId ?? null,
    sectionId: u.sectionId ?? null,
    authSource: 'local' as const,
    isActive: true,
  };
  return prisma.user.upsert({
    where: { employeeNo: u.employeeNo },
    update: data, // يُعيد المواقع والأدوار إلى المرجع لكن لا يلمس كلمة المرور الحالية
    create: { ...data, employeeNo: u.employeeNo, passwordHash },
  });
}

async function main() {
  const hash = await argon2.hash(PASSWORD!, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  // ── الهيكل ──
  const tech = await ga('الإدارة العامة للتقنية');
  const hr = await ga('الإدارة العامة للموارد البشرية');
  const fin = await ga('الإدارة العامة للمالية');

  const systems = await admin(tech.id, 'إدارة الأنظمة');
  const cyber = await admin(tech.id, 'إدارة الأمن السيبراني');
  await admin(tech.id, 'إدارة التطبيقات');
  const hrOps = await admin(hr.id, 'إدارة شؤون الموظفين');
  await admin(fin.id, 'إدارة الحسابات');

  const support = await section(systems.id, 'الدعم الفني');
  const db = await section(systems.id, 'قواعد البيانات');
  const net = await section(systems.id, 'الشبكات');
  const payroll = await section(hrOps.id, 'الرواتب');

  // ── مستخدم لكل دور ──
  const ceo = await user({ employeeNo: '1001', name: 'د. عبدالله السالم', email: 'ceo@iat.sa', role: Role.ceo }, hash);
  const gm = await user({ employeeNo: '1002', name: 'م. ناصر القحطاني', email: 'nasser@iat.sa', role: Role.generalAdminManager, generalAdminId: tech.id }, hash);
  const mgr = await user({ employeeNo: '1003', name: 'م. خالد الحربي', email: 'khalid@iat.sa', role: Role.adminManager, generalAdminId: tech.id, administrationId: systems.id }, hash);
  const cyberMgr = await user({ employeeNo: '1004', name: 'م. ريم الفهد', email: 'reem@iat.sa', role: Role.adminManager, generalAdminId: tech.id, administrationId: cyber.id }, hash);
  const fuo = await user({ employeeNo: '1015', name: 'منى الدوسري', email: 'mona@iat.sa', role: Role.followUpOfficer, generalAdminId: tech.id, administrationId: systems.id, sectionId: support.id }, hash);
  const sup = await user({ employeeNo: '1020', name: 'عمر الشهري', email: 'omar@iat.sa', role: Role.supervisor, generalAdminId: tech.id, administrationId: systems.id, sectionId: support.id }, hash);
  const dbSup = await user({ employeeNo: '1021', name: 'هند العمري', email: 'hind@iat.sa', role: Role.supervisor, generalAdminId: tech.id, administrationId: systems.id, sectionId: db.id }, hash);
  const netSup = await user({ employeeNo: '1022', name: 'بدر الغامدي', email: 'badr@iat.sa', role: Role.supervisor, generalAdminId: tech.id, administrationId: systems.id, sectionId: net.id }, hash);
  await user({ employeeNo: '1042', name: 'سارة المطيري', email: 'sara@iat.sa', role: Role.employee, generalAdminId: tech.id, administrationId: systems.id, sectionId: support.id }, hash);
  await user({ employeeNo: '1051', name: 'فهد العتيبي', email: 'fahad@iat.sa', role: Role.employee, generalAdminId: tech.id, administrationId: systems.id, sectionId: support.id }, hash);
  await user({ employeeNo: '1077', name: 'أحمد الزهراني', email: 'ahmed@iat.sa', role: Role.employee, generalAdminId: tech.id, administrationId: systems.id, sectionId: support.id }, hash);
  await user({ employeeNo: '1090', name: 'ريم القحطاني', email: 'reem.q@iat.sa', role: Role.employee, generalAdminId: tech.id, administrationId: systems.id, sectionId: db.id }, hash);
  await user({ employeeNo: '2001', name: 'نورة العنزي', email: 'noura@iat.sa', role: Role.employee, generalAdminId: hr.id, administrationId: hrOps.id, sectionId: payroll.id }, hash);

  // ── تعيين المدراء والمشرفين ──
  await prisma.generalAdministration.update({ where: { id: tech.id }, data: { managerId: gm.id } });
  await prisma.administration.update({ where: { id: systems.id }, data: { managerId: mgr.id } });
  await prisma.administration.update({ where: { id: cyber.id }, data: { managerId: cyberMgr.id } });
  await prisma.section.update({ where: { id: support.id }, data: { supervisorId: sup.id } });
  await prisma.section.update({ where: { id: db.id }, data: { supervisorId: dbSup.id } });
  await prisma.section.update({ where: { id: net.id }, data: { supervisorId: netSup.id } });

  // ── عطل رسمية ──
  for (const h of [
    { date: '2026-09-23', name: 'اليوم الوطني' },
    { date: '2027-02-22', name: 'يوم التأسيس' },
  ]) {
    const date = new Date(`${h.date}T00:00:00.000Z`);
    await prisma.holiday.upsert({ where: { date }, update: { name: h.name }, create: { date, name: h.name } });
  }

  // ═══════════ المرحلة 2: أحجام المهام الافتراضية + مهام تجريبية ═══════════
  await seedSizePresets();
  await seedTasks({ systemsId: systems.id, cyberId: cyber.id, dbSectionId: db.id, supportId: support.id, techId: tech.id });

  console.log('✓ البذرة جاهزة — الحسابات التجريبية (كلمة المرور نفسها للجميع = SEED_PASSWORD):');
  console.table([
    { الدور: 'الرئيس التنفيذي', الرقم: ceo.employeeNo, الاسم: ceo.name },
    { الدور: 'مدير عام (التقنية)', الرقم: gm.employeeNo, الاسم: gm.name },
    { الدور: 'مدير إدارة (الأنظمة)', الرقم: mgr.employeeNo, الاسم: mgr.name },
    { الدور: 'مسؤول متابعة (الأنظمة)', الرقم: fuo.employeeNo, الاسم: fuo.name },
    { الدور: 'مشرف (الدعم الفني)', الرقم: sup.employeeNo, الاسم: sup.name },
    { الدور: 'موظف (الدعم الفني)', الرقم: '1042', الاسم: 'سارة المطيري' },
  ]);
}

/** الافتراضي العام لترجمة الحجم إلى ساعات (PLAN 9.1): 4 / 16 / 40 — يُضاف إن لم يوجد ولا يُغيَّر إن ضُبط يدويًا */
async function seedSizePresets() {
  const defaults: { size: SizePreset; hours: number }[] = [{ size: 'daily', hours: 4 }, { size: 'weekly', hours: 16 }, { size: 'long', hours: 40 }];
  for (const d of defaults) {
    const exists = await prisma.sizePresetConfig.findFirst({ where: { administrationId: null, size: d.size } });
    if (!exists) await prisma.sizePresetConfig.create({ data: { administrationId: null, size: d.size, hours: d.hours } });
  }
}

/** مهام تجريبية تطابق prototype.html — تُضاف مرة واحدة فقط (إن لم توجد أي مهمة) */
async function seedTasks(ids: { systemsId: string; cyberId: string; dbSectionId: string; supportId: string; techId: string }) {
  if ((await prisma.task.count()) > 0) return;
  const byNo = async (no: string) => (await prisma.user.findUniqueOrThrow({ where: { employeeNo: no } }));
  const khalid = await byNo('1003'), mona = await byNo('1015'), omar = await byNo('1020'), sara = await byNo('1042'), fahad = await byNo('1051'), ahmed = await byNo('1077');
  const presets = await prisma.sizePresetConfig.findMany({ where: { administrationId: null } });
  const hours = (size: SizePreset | null) => (size ? presets.find((p) => p.size === size)?.hours ?? null : null);
  const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
  type Who = { type: AssigneeType; id: string };
  const asg = async (w: Who) => {
    if (w.type === 'user') { const u = await prisma.user.findUniqueOrThrow({ where: { id: w.id } }); return { assigneeType: w.type, assigneeId: u.id, generalAdminId: u.generalAdminId, administrationId: u.administrationId, sectionId: u.sectionId, userId: u.id }; }
    if (w.type === 'section') { const sec = await prisma.section.findUniqueOrThrow({ where: { id: w.id }, include: { administration: true } }); return { assigneeType: w.type, assigneeId: sec.id, generalAdminId: sec.administration.generalAdminId, administrationId: sec.administrationId, sectionId: sec.id, userId: null }; }
    if (w.type === 'administration') { const ad = await prisma.administration.findUniqueOrThrow({ where: { id: w.id } }); return { assigneeType: w.type, assigneeId: ad.id, generalAdminId: ad.generalAdminId, administrationId: ad.id, sectionId: null, userId: null }; }
    return { assigneeType: w.type, assigneeId: w.id, generalAdminId: w.id, administrationId: null, sectionId: null, userId: null };
  };
  interface Demo { title: string; description?: string; category: 'routine' | 'adhoc'; priority: 'low' | 'medium' | 'high'; state: 'not_started' | 'in_progress' | 'done'; due: number; size: SizePreset | null; by: { id: string; generalAdminId: string | null; administrationId: string | null; sectionId: string | null }; to: Who[]; subs?: { title: string; state: 'not_started' | 'in_progress' | 'done'; to: Who[] }[] }
  const demos: Demo[] = [
    { title: 'تحديث سياسة كلمات المرور في نظام الموارد البشرية', description: 'طلب وارد من إدارة الأمن السيبراني بتطبيق سياسة كلمات مرور جديدة (12 خانة، انتهاء كل 90 يومًا) على نظام الموارد البشرية قبل نهاية الربع. يتطلب تعديل الإعدادات، واختبارًا على بيئة التجربة، وتعميمًا للموظفين.', category: 'adhoc', priority: 'high', state: 'in_progress', due: 8, size: 'weekly', by: khalid, to: [{ type: 'user', id: sara.id }, { type: 'section', id: ids.dbSectionId }, { type: 'administration', id: ids.cyberId }],
      subs: [
        { title: 'تعديل إعدادات السياسة على بيئة التجربة', state: 'done', to: [{ type: 'user', id: sara.id }] },
        { title: 'مراجعة الأمن السيبراني للإعدادات', state: 'done', to: [{ type: 'administration', id: ids.cyberId }] },
        { title: 'تطبيق السياسة على بيئة الإنتاج', state: 'in_progress', to: [{ type: 'section', id: ids.dbSectionId }] },
        { title: 'تعميم على الموظفين عبر البريد', state: 'not_started', to: [] },
      ] },
    { title: 'مراجعة سجلات الوصول الشهرية', category: 'routine', priority: 'medium', state: 'in_progress', due: -3, size: 'daily', by: mona, to: [{ type: 'user', id: fahad.id }] },
    { title: 'ترخيص برنامج الحماية', category: 'adhoc', priority: 'high', state: 'not_started', due: -7, size: 'daily', by: khalid, to: [{ type: 'user', id: ahmed.id }] },
    { title: 'بطء في نظام الأرشفة', category: 'adhoc', priority: 'high', state: 'in_progress', due: 2, size: 'weekly', by: omar, to: [{ type: 'user', id: fahad.id }] },
    { title: 'النسخ الاحتياطي الأسبوعي', category: 'routine', priority: 'medium', state: 'not_started', due: 4, size: 'daily', by: khalid, to: [{ type: 'section', id: ids.dbSectionId }] },
    { title: 'طلب صلاحية جديدة لنظام المشتريات', category: 'adhoc', priority: 'low', state: 'not_started', due: 3, size: 'daily', by: omar, to: [{ type: 'user', id: ahmed.id }] },
    { title: 'تقرير أداء الخوادم الأسبوعي', category: 'routine', priority: 'medium', state: 'done', due: -1, size: 'daily', by: mona, to: [{ type: 'user', id: sara.id }] },
    { title: 'استعادة حساب موظف', category: 'adhoc', priority: 'high', state: 'done', due: -2, size: 'daily', by: omar, to: [{ type: 'user', id: fahad.id }] },
    { title: 'جرد أصول إدارة الأنظمة', category: 'routine', priority: 'low', state: 'not_started', due: 20, size: 'long', by: khalid, to: [{ type: 'administration', id: ids.systemsId }] },
  ];
  for (const d of demos) {
    const started = d.state === 'not_started' ? null : day(-2);
    const completed = d.state === 'done' ? day(-1) : null;
    const t = await prisma.task.create({
      data: {
        title: d.title, description: d.description ?? null, category: d.category, priority: d.priority, state: d.state, dueDate: day(d.due),
        sizePreset: d.size, estimatedHours: hours(d.size), startedAt: started, completedAt: completed,
        generalAdminId: d.by.generalAdminId, administrationId: d.by.administrationId, sectionId: d.by.sectionId, createdById: d.by.id,
        assignments: { create: await Promise.all(d.to.map((w) => asg(w).then((a) => ({ ...a, assignedById: d.by.id })))) },
        activities: { create: [{ actorId: d.by.id, type: 'created', data: { title: d.title, category: d.category, seed: true } }] },
      },
    });
    for (const s of d.subs ?? []) {
      await prisma.task.create({
        data: {
          title: s.title, category: d.category, priority: d.priority, state: s.state, dueDate: day(d.due), sizePreset: 'daily', estimatedHours: hours('daily'),
          startedAt: s.state === 'not_started' ? null : day(-2), completedAt: s.state === 'done' ? day(-1) : null,
          parentTaskId: t.id, generalAdminId: d.by.generalAdminId, administrationId: d.by.administrationId, sectionId: d.by.sectionId, createdById: d.by.id,
          assignments: { create: await Promise.all(s.to.map((w) => asg(w).then((a) => ({ ...a, assignedById: d.by.id })))) },
          activities: { create: [{ actorId: d.by.id, type: 'created', data: { title: s.title, seed: true } }] },
        },
      });
    }
    if (d.title.startsWith('تحديث سياسة')) {
      await prisma.comment.createMany({ data: [
        { taskId: t.id, authorId: sara.id, content: 'تم الاختبار على التجربة بنجاح. أحتاج موافقة على نافذة تطبيق يوم الخميس مساءً.' },
        { taskId: t.id, authorId: khalid.id, content: 'موافق. نسّقي مع قسم قواعد البيانات على النسخ الاحتياطي قبلها.' },
      ] });
    }
  }
  console.log(`✓ أُضيفت ${demos.length} مهام تجريبية (مع فرعية وتعليقات)`);
}

main()
  .catch((e) => {
    console.error('✗ فشلت البذرة:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
