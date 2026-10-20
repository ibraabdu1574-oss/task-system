/**
 * بيانات تجريبية — مستخدم لكل دور وهيكل يطابق prototype.html.
 * آمن للتكرار (upsert). بيئة التطوير فقط.
 * كلمة المرور لكل الحسابات من SEED_PASSWORD (يولّدها السكربت في .env).
 *
 *   npx prisma db seed     (أو: task seed)
 */
import { PrismaClient, Role } from '@prisma/client';
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

main()
  .catch((e) => {
    console.error('✗ فشلت البذرة:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
