import type { Prisma } from '@prisma/client';
import type { AssigneeType, Scope, SessionUser } from '@task/shared';

/**
 * نطاق رؤية المهام (PLAN القسم 6 + المرحلة 2).
 *
 * المهمة مرئية للفاعل إذا تحقق أحد ثلاثة:
 *   1. موقع المهمة في الشجرة (من منشئها) داخل نطاقه — للمستويات الإدارية فقط (لا للموظف).
 *   2. هو منشئها.
 *   3. مسندة إليه: مباشرةً، أو إلى وحدة ينتمي إليها (قسمه/إدارته/إدارته العامة)،
 *      أو — للمستويات الإدارية — إلى جهة داخل نطاقه أو إلى وحدة أعلى تحتويه.
 *
 * الموظف يرى المسند إليه فقط؛ مسؤول المتابعة يرى كل مهام إدارته (نطاقه = الإدارة).
 * دوال نقية بلا قاعدة بيانات: `visibleTasksWhere` تُنتج قيد Prisma للقوائم،
 * و`canSeeTask` تطبّق القاعدة نفسها على مهمة محمّلة (للتحقق الموضعي) — وتختبرهما الوحدة معًا.
 */

export interface TaskPositionLike {
  generalAdminId: string | null;
  administrationId: string | null;
  sectionId: string | null;
  createdById: string;
  assignments: AssignmentPositionLike[];
}

export interface AssignmentPositionLike {
  assigneeType: AssigneeType;
  generalAdminId: string | null;
  administrationId: string | null;
  sectionId: string | null;
  userId: string | null;
}

type Actor = Pick<SessionUser, 'id' | 'role' | 'generalAdminId' | 'administrationId' | 'sectionId'>;

/** قيد Prisma: المهام المرئية للفاعل */
export function visibleTasksWhere(actor: Actor, scope: Scope): Prisma.TaskWhereInput {
  const mine = { createdById: actor.id };
  switch (scope.level) {
    case 'organization':
      return {};
    case 'generalAdmin':
      return {
        OR: [
          { generalAdminId: scope.generalAdminId },
          mine,
          { assignments: { some: { generalAdminId: scope.generalAdminId } } },
        ],
      };
    case 'administration':
      return {
        OR: [
          { administrationId: scope.administrationId },
          mine,
          {
            assignments: {
              some: {
                OR: [
                  { administrationId: scope.administrationId },
                  { assigneeType: 'generalAdmin', generalAdminId: scope.generalAdminId ?? '-' },
                ],
              },
            },
          },
        ],
      };
    case 'section':
      return {
        OR: [
          { sectionId: scope.sectionId },
          mine,
          {
            assignments: {
              some: {
                OR: [
                  { sectionId: scope.sectionId },
                  { assigneeType: 'administration', administrationId: scope.administrationId ?? '-' },
                  { assigneeType: 'generalAdmin', generalAdminId: scope.generalAdminId ?? '-' },
                ],
              },
            },
          },
        ],
      };
    case 'user':
    default: {
      const units: Prisma.TaskAssignmentWhereInput[] = [{ userId: actor.id }];
      if (actor.sectionId) units.push({ assigneeType: 'section', sectionId: actor.sectionId });
      if (actor.administrationId) units.push({ assigneeType: 'administration', administrationId: actor.administrationId });
      if (actor.generalAdminId) units.push({ assigneeType: 'generalAdmin', generalAdminId: actor.generalAdminId });
      return { OR: [mine, { assignments: { some: { OR: units } } }] };
    }
  }
}

/** القاعدة نفسها على مهمة محمّلة مع إسناداتها */
export function canSeeTask(actor: Actor, scope: Scope, task: TaskPositionLike): boolean {
  if (scope.level === 'organization') return true;
  if (task.createdById === actor.id) return true;
  const a = task.assignments;
  switch (scope.level) {
    case 'generalAdmin':
      return task.generalAdminId === scope.generalAdminId || a.some((x) => x.generalAdminId === scope.generalAdminId);
    case 'administration':
      return (
        task.administrationId === scope.administrationId ||
        a.some((x) => x.administrationId === scope.administrationId || (x.assigneeType === 'generalAdmin' && !!scope.generalAdminId && x.generalAdminId === scope.generalAdminId))
      );
    case 'section':
      return (
        task.sectionId === scope.sectionId ||
        a.some(
          (x) =>
            x.sectionId === scope.sectionId ||
            (x.assigneeType === 'administration' && !!scope.administrationId && x.administrationId === scope.administrationId) ||
            (x.assigneeType === 'generalAdmin' && !!scope.generalAdminId && x.generalAdminId === scope.generalAdminId),
        )
      );
    case 'user':
    default:
      return a.some(
        (x) =>
          x.userId === actor.id ||
          (x.assigneeType === 'section' && !!actor.sectionId && x.sectionId === actor.sectionId) ||
          (x.assigneeType === 'administration' && !!actor.administrationId && x.administrationId === actor.administrationId) ||
          (x.assigneeType === 'generalAdmin' && !!actor.generalAdminId && x.generalAdminId === actor.generalAdminId),
      );
  }
}

/**
 * إدارة المهمة (تعديل بياناتها، إسنادها، حذفها): منشئها، أو مستوى إداري
 * يحتوي موقع المهمة نفسه (لا مجرد رؤيتها عبر إسناد).
 */
export function canManageTask(actor: Actor, scope: Scope, task: TaskPositionLike): boolean {
  if (task.createdById === actor.id) return true;
  switch (scope.level) {
    case 'organization':
      return true;
    case 'generalAdmin':
      return !!scope.generalAdminId && task.generalAdminId === scope.generalAdminId;
    case 'administration':
      return !!scope.administrationId && task.administrationId === scope.administrationId;
    case 'section':
      return !!scope.sectionId && task.sectionId === scope.sectionId;
    case 'user':
    default:
      return false;
  }
}
