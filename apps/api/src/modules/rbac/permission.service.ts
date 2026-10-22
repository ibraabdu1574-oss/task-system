import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Action, OrgLevel, OrgPosition, Role, Scope, SessionUser } from '@task/shared';

/**
 * محرك الصلاحيات الهرمي (PLAN القسم 6).
 *
 * الفكرة: الصلاحية = (الدور يسمح بالإجراء) ∧ (المورد داخل نطاق الفاعل في الشجرة).
 * النطاق يُحسب من موقع الفاعل لا من مسمّاه وحده؛ ومسؤول المتابعة يُوسَّع نطاقه إلى إدارته كاملةً.
 * المنع هو الافتراضي — لا يُسمح إلا بما ذُكر صراحةً هنا.
 *
 * بلا أي تبعية على قاعدة البيانات: دوال نقية قابلة للاختبار بالوحدة.
 */

/** الإجراءات المسموحة لكل دور (قبل فحص الموقع في الشجرة) */
/** إجراءات المهام (المرحلة 2): الكل يقرأ وينشئ ويعدّل ويعلّق ويرفق ضمن نطاقه؛ الإسناد لغير الموظف */
const TASK_ACTIONS: Action[] = ['tasks.read', 'tasks.create', 'tasks.update', 'tasks.comment', 'tasks.attach'];
const TASK_ACTIONS_MANAGER: Action[] = [...TASK_ACTIONS, 'tasks.assign'];

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  ceo: new Set<Action>([
    'self', 'org.read', 'org.manage', 'users.read', 'users.manage',
    'holidays.read', 'holidays.manage', 'leaves.read', 'leaves.manage', 'audit.read',
    ...TASK_ACTIONS_MANAGER,
  ]),
  generalAdminManager: new Set<Action>([
    'self', 'org.read', 'org.manage', 'users.read', 'users.manage', 'holidays.read', 'leaves.read', 'leaves.manage',
    ...TASK_ACTIONS_MANAGER,
  ]),
  adminManager: new Set<Action>([
    'self', 'org.read', 'org.manage', 'users.read', 'users.manage', 'holidays.read', 'leaves.read', 'leaves.manage',
    ...TASK_ACTIONS_MANAGER,
  ]),
  followUpOfficer: new Set<Action>(['self', 'org.read', 'users.read', 'holidays.read', 'leaves.read', 'leaves.manage', ...TASK_ACTIONS_MANAGER]),
  supervisor: new Set<Action>(['self', 'org.read', 'users.read', 'holidays.read', 'leaves.read', 'leaves.manage', ...TASK_ACTIONS_MANAGER]),
  employee: new Set<Action>(['self', 'org.read', 'users.read', 'holidays.read', 'leaves.read', 'leaves.manage', ...TASK_ACTIONS]),
};

const LEVEL_RANK: Record<OrgLevel, number> = {
  organization: 0,
  generalAdmin: 1,
  administration: 2,
  section: 3,
  user: 4,
};

@Injectable()
export class PermissionService {
  /** نطاق الفاعل: يُستنتج من دوره وموقعه. دور بلا موقع مكتمل ⇒ ينكمش إلى "نفسه فقط" (أقل صلاحية). */
  resolveScope(actor: Pick<SessionUser, 'id' | 'role' | 'generalAdminId' | 'administrationId' | 'sectionId'>): Scope {
    const self: Scope = { level: 'user', userId: actor.id, generalAdminId: actor.generalAdminId, administrationId: actor.administrationId, sectionId: actor.sectionId };
    switch (actor.role) {
      case 'ceo':
        return { level: 'organization' };
      case 'generalAdminManager':
        return actor.generalAdminId ? { level: 'generalAdmin', generalAdminId: actor.generalAdminId } : self;
      case 'adminManager':
        return actor.administrationId
          ? { level: 'administration', generalAdminId: actor.generalAdminId, administrationId: actor.administrationId }
          : self;
      case 'followUpOfficer':
        // صلاحية كاملة على إدارته بغضّ النظر عن مستواه الوظيفي
        return actor.administrationId
          ? { level: 'administration', generalAdminId: actor.generalAdminId, administrationId: actor.administrationId, followUpOfficer: true }
          : self;
      case 'supervisor':
        return actor.sectionId
          ? { level: 'section', generalAdminId: actor.generalAdminId, administrationId: actor.administrationId, sectionId: actor.sectionId }
          : self;
      case 'employee':
      default:
        return self;
    }
  }

  /** هل الموقع داخل النطاق؟ */
  contains(scope: Scope, pos: OrgPosition): boolean {
    switch (scope.level) {
      case 'organization':
        return true;
      case 'generalAdmin':
        return !!scope.generalAdminId && pos.generalAdminId === scope.generalAdminId;
      case 'administration':
        return !!scope.administrationId && pos.administrationId === scope.administrationId;
      case 'section':
        return !!scope.sectionId && pos.sectionId === scope.sectionId;
      case 'user':
        return !!scope.userId && pos.userId === scope.userId;
    }
  }

  /** هل يسمح الدور بالإجراء أصلًا؟ (الفحص الخشن الذي يطبّقه الحارس على كل مسار) */
  roleAllows(role: Role, action: Action): boolean {
    return ROLE_ACTIONS[role]?.has(action) ?? false;
  }

  /**
   * الفحص الكامل: الدور يسمح ∧ (لا مورد محدّد ∨ المورد داخل النطاق).
   * للقراءة: الاحتواء يكفي. للإدارة (manage) على وحدة تنظيمية: يجب أن تكون الوحدة
   * **أدنى** من مستوى نطاق الفاعل (المدير العام يدير إداراته وأقسامه لا إدارته العامة نفسها؛
   * الرئيس التنفيذي يدير كل شيء). استثناء: الموظف يدير بياناته الخاصة (إجازاته).
   */
  can(actor: SessionUser, action: Action, target?: OrgPosition, targetLevel?: OrgLevel): boolean {
    if (!actor?.isActive) return false;
    if (!this.roleAllows(actor.role, action)) return false;
    if (!target) return true;

    const scope = this.resolveScope(actor);
    if (!this.contains(scope, target)) return false;

    if (action.endsWith('.manage') && targetLevel && targetLevel !== 'user') {
      if (scope.level === 'user') return false;
      return LEVEL_RANK[targetLevel] > LEVEL_RANK[scope.level];
    }
    if (action === 'users.manage' && scope.level === 'user') return false; // الموظف لا يعدّل حسابه بهذا المسار
    return true;
  }

  /** مثل can لكنه يرمي 403 برسالة عربية */
  assert(actor: SessionUser, action: Action, target?: OrgPosition, targetLevel?: OrgLevel): void {
    if (!this.can(actor, action, target, targetLevel)) {
      throw new ForbiddenException('ليست لديك صلاحية على هذا المورد');
    }
  }

  /** قيد Prisma `where` يحصر الاستعلام في نطاق الفاعل (للقوائم) */
  scopeWhere(actor: SessionUser): Record<string, unknown> {
    const s = this.resolveScope(actor);
    switch (s.level) {
      case 'organization': return {};
      case 'generalAdmin': return { generalAdminId: s.generalAdminId };
      case 'administration': return { administrationId: s.administrationId };
      case 'section': return { sectionId: s.sectionId };
      case 'user': return { id: s.userId };
    }
  }
}
