import type { SessionUser } from '@task/shared';
import { PermissionService } from '../rbac/permission.service';
import { canManageTask, canSeeTask, visibleTasksWhere, type AssignmentPositionLike, type TaskPositionLike } from './task-scope';

const base: Omit<SessionUser, 'id' | 'role' | 'generalAdminId' | 'administrationId' | 'sectionId'> = {
  name: 'x', employeeNo: '0', email: 'x@x', authSource: 'local', dailyCapacityHours: 6, workingDays: [0, 1, 2, 3, 4], isActive: true,
};
const u = (p: Partial<SessionUser> & Pick<SessionUser, 'id' | 'role'>): SessionUser =>
  ({ ...base, generalAdminId: null, administrationId: null, sectionId: null, ...p } as SessionUser);

const GA = 'ga-tech', AD = 'ad-systems', SEC = 'sec-support', SEC2 = 'sec-db', AD2 = 'ad-cyber', GA2 = 'ga-hr';
const ceo = u({ id: 'ceo', role: 'ceo' });
const gm = u({ id: 'gm', role: 'generalAdminManager', generalAdminId: GA });
const mgr = u({ id: 'mgr', role: 'adminManager', generalAdminId: GA, administrationId: AD });
const cyberMgr = u({ id: 'cyber', role: 'adminManager', generalAdminId: GA, administrationId: AD2 });
const fuo = u({ id: 'fuo', role: 'followUpOfficer', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const sup = u({ id: 'sup', role: 'supervisor', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const dbSup = u({ id: 'dbsup', role: 'supervisor', generalAdminId: GA, administrationId: AD, sectionId: SEC2 });
const sara = u({ id: 'sara', role: 'employee', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const fahad = u({ id: 'fahad', role: 'employee', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const reem = u({ id: 'reem', role: 'employee', generalAdminId: GA, administrationId: AD, sectionId: SEC2 });
const noura = u({ id: 'noura', role: 'employee', generalAdminId: GA2, administrationId: 'ad-hr', sectionId: 'sec-pay' });

const toUser = (x: SessionUser): AssignmentPositionLike => ({ assigneeType: 'user', generalAdminId: x.generalAdminId, administrationId: x.administrationId, sectionId: x.sectionId, userId: x.id });
const toSection = (ga: string, ad: string, sec: string): AssignmentPositionLike => ({ assigneeType: 'section', generalAdminId: ga, administrationId: ad, sectionId: sec, userId: null });
const toAdmin = (ga: string, ad: string): AssignmentPositionLike => ({ assigneeType: 'administration', generalAdminId: ga, administrationId: ad, sectionId: null, userId: null });
const toGa = (ga: string): AssignmentPositionLike => ({ assigneeType: 'generalAdmin', generalAdminId: ga, administrationId: null, sectionId: null, userId: null });

/** مهمة أنشأها مدير الأنظمة (موقعها: الإدارة بلا قسم) */
const task = (assignments: AssignmentPositionLike[], createdBy = mgr): TaskPositionLike => ({
  generalAdminId: createdBy.generalAdminId, administrationId: createdBy.administrationId, sectionId: createdBy.sectionId, createdById: createdBy.id, assignments,
});

describe('نطاق رؤية المهام (المرحلة 2)', () => {
  const p = new PermissionService();
  const sees = (actor: SessionUser, t: TaskPositionLike) => canSeeTask(actor, p.resolveScope(actor), t);
  const manages = (actor: SessionUser, t: TaskPositionLike) => canManageTask(actor, p.resolveScope(actor), t);

  // مهمة مسندة لثلاث جهات: سارة (موظفة) + قسم قواعد البيانات + إدارة الأمن السيبراني
  const multi = task([toUser(sara), toSection(GA, AD, SEC2), toAdmin(GA, AD2)]);

  it('الموظف: يرى المسند إليه مباشرةً فقط', () => {
    expect(sees(sara, multi)).toBe(true);
    expect(sees(fahad, multi)).toBe(false); // زميلها في القسم نفسه لكن غير مسند
    expect(sees(noura, multi)).toBe(false);
  });

  it('الموظف: يرى ما أُسند إلى قسمه أو إدارته أو إدارته العامة', () => {
    expect(sees(reem, multi)).toBe(true); // قسم قواعد البيانات مسند
    expect(sees(fahad, task([toAdmin(GA, AD)]))).toBe(true);
    expect(sees(fahad, task([toGa(GA)]))).toBe(true);
    expect(sees(noura, task([toGa(GA)]))).toBe(false);
  });

  it('الموظف: يرى ما أنشأه هو ولا يدير إلا ما أنشأه', () => {
    const own = task([toUser(fahad)], sara);
    expect(sees(sara, own)).toBe(true);
    expect(manages(sara, own)).toBe(true);
    expect(manages(sara, multi)).toBe(false);
  });

  it('المشرف: مهام قسمه + المسند إلى قسمه أو أحد موظفيه + المسند إلى إدارته كلها', () => {
    expect(sees(sup, multi)).toBe(true); // سارة في قسمه
    expect(sees(dbSup, multi)).toBe(true); // قسمه مسند
    expect(sees(sup, task([toUser(reem)]))).toBe(false); // موظف من قسم آخر
    expect(sees(sup, task([toAdmin(GA, AD)]))).toBe(true);
    expect(sees(sup, task([toAdmin(GA, AD2)]))).toBe(false);
    // يدير فقط ما موقعه قسمه (أو ما أنشأه)
    expect(manages(sup, multi)).toBe(false);
    expect(manages(sup, task([toUser(reem)], sara))).toBe(true); // أنشأتها سارة من قسمه
  });

  it('مدير الإدارة ومسؤول المتابعة: كل مهام الإدارة وما أُسند إلى جهاتها', () => {
    for (const a of [mgr, fuo]) {
      expect(sees(a, multi)).toBe(true);
      expect(sees(a, task([toUser(reem)], sara))).toBe(true);
      expect(sees(a, task([toUser(noura)], noura))).toBe(false);
      expect(sees(a, task([toUser(sara)], noura))).toBe(true); // مهمة من إدارة أخرى مسندة لموظفه
      expect(sees(a, task([toGa(GA)], gm))).toBe(true); // مسندة لإدارته العامة
      expect(manages(a, task([toUser(reem)], sara))).toBe(true);
      expect(manages(a, task([toUser(sara)], noura))).toBe(false); // يراها لكن لا يديرها
    }
  });

  it('مدير إدارة أخرى: يرى ما أُسند إلى إدارته فقط', () => {
    expect(sees(cyberMgr, multi)).toBe(true); // إدارة الأمن السيبراني مسندة
    expect(sees(cyberMgr, task([toUser(sara)]))).toBe(false);
    expect(manages(cyberMgr, multi)).toBe(false);
  });

  it('المدير العام والرئيس التنفيذي', () => {
    expect(sees(gm, multi)).toBe(true);
    expect(sees(gm, task([toUser(noura)], noura))).toBe(false);
    expect(manages(gm, multi)).toBe(true);
    expect(sees(ceo, task([toUser(noura)], noura))).toBe(true);
    expect(manages(ceo, task([toUser(noura)], noura))).toBe(true);
  });

  it('مهمة بلا إسناد: يراها منشئها ومن يحتوي موقعها فقط', () => {
    const t = task([]);
    expect(sees(mgr, t)).toBe(true);
    expect(sees(fuo, t)).toBe(true);
    expect(sees(gm, t)).toBe(true);
    expect(sees(sup, t)).toBe(false);
    expect(sees(sara, t)).toBe(false);
  });

  it('قيد Prisma يطابق القاعدة شكلًا: الرئيس بلا قيد، والموظف بلا قيد موقع', () => {
    expect(visibleTasksWhere(ceo, p.resolveScope(ceo))).toEqual({});
    const w = visibleTasksWhere(sara, p.resolveScope(sara)) as { OR: Record<string, unknown>[] };
    expect(w.OR).toHaveLength(2); // منشئها أو مسندة إليه — لا قيد موقع على المهمة نفسها
    expect(w.OR[0]).toEqual({ createdById: 'sara' });
    expect(w.OR[1]).toHaveProperty('assignments');
    const ws = visibleTasksWhere(sup, p.resolveScope(sup)) as { OR: Record<string, unknown>[] };
    expect(ws.OR[0]).toEqual({ sectionId: SEC });
    const wa = visibleTasksWhere(fuo, p.resolveScope(fuo)) as { OR: Record<string, unknown>[] };
    expect(wa.OR[0]).toEqual({ administrationId: AD });
  });
});
