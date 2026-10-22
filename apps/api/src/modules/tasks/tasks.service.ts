import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type TaskAssignment } from '@prisma/client';
import {
  ASSIGNEE_TYPE_LABELS, DEFAULT_SIZE_PRESET_HOURS, ROLE_LABELS, SIZE_PRESETS,
  type AssignmentInput, type Scope, type SessionUser, type SizePreset, type SizePresetRow, type TaskActivityType, type TaskAssignmentView,
  type TaskDetail, type TaskListResponse, type TaskStats, type TaskSummary, type UserRef,
} from '@task/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import { UsersService } from '../users/users.service';
import { canManageTask, canSeeTask, visibleTasksWhere } from './task-scope';
import type { ChangeStateDto, CreateTaskDto, ListTasksDto, UpdateTaskDto, UpsertSizePresetsDto } from './dto/task.dto';

const USER_REF = { select: { id: true, name: true, employeeNo: true } } as const;

/** ما نحمّله للملخّص (القوائم والفرعية) */
const SUMMARY_INCLUDE = {
  createdBy: USER_REF,
  assignments: true,
  subtasks: { select: { state: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

/** موقع جهة إسناد في الشجرة مع اسمها (بعد الحل من قاعدة البيانات) */
interface ResolvedAssignee extends AssignmentInput {
  generalAdminId: string | null;
  administrationId: string | null;
  sectionId: string | null;
  userId: string | null;
  name: string;
  detail: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const asDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const today = () => asDate(new Date().toISOString());

/**
 * المهام — المرحلة 2: CRUD ضمن النطاق، إسناد متعدد الأنواع، فرعية بإسناد مستقل، تعليقات،
 * سجل نشاط لكل تغيير، والتقاط الحجم/التوقيت (بلا محرك).
 * كل فحص صلاحية يتكرر هنا على الخلفية بغضّ النظر عن الواجهة.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService, private readonly perm: PermissionService, private readonly users: UsersService) {}

  // ───────────────────────── أدوات النطاق ─────────────────────────

  private scope(actor: SessionUser): Scope {
    return this.perm.resolveScope(actor);
  }

  /** يحمّل المهمة مع إسناداتها ويرفض (404) ما ليس في نطاق الرؤية — بلا تسريب وجودها */
  async getVisible(actor: SessionUser, id: string): Promise<TaskRow> {
    const task = await this.prisma.task.findUnique({ where: { id }, include: SUMMARY_INCLUDE });
    if (!task || !canSeeTask(actor, this.scope(actor), task)) throw new NotFoundException('المهمة غير موجودة أو خارج نطاقك');
    return task;
  }

  /** إدارة المهمة (تعديل/إسناد/حذف): منشئها أو مستوى إداري يحتوي موقعها */
  assertManage(actor: SessionUser, task: TaskRow): void {
    if (!canManageTask(actor, this.scope(actor), task)) throw new ForbiddenException('ليست لديك صلاحية إدارة هذه المهمة');
  }

  private canManage(actor: SessionUser, task: TaskRow): boolean {
    return canManageTask(actor, this.scope(actor), task);
  }

  // ───────────────────────── حلّ جهات الإسناد ─────────────────────────

  private async resolveAssignee(a: AssignmentInput): Promise<ResolvedAssignee> {
    switch (a.assigneeType) {
      case 'user': {
        const u = await this.prisma.user.findUnique({ where: { id: a.assigneeId }, include: { section: { select: { name: true } }, administration: { select: { name: true } } } });
        if (!u || !u.isActive) throw new BadRequestException('الموظف غير موجود أو معطّل');
        const unit = u.section?.name ?? u.administration?.name ?? '';
        return { ...a, generalAdminId: u.generalAdminId, administrationId: u.administrationId, sectionId: u.sectionId, userId: u.id, name: u.name, detail: `${ROLE_LABELS[u.role]}${unit ? `، ${unit}` : ''}` };
      }
      case 'section': {
        const s = await this.prisma.section.findUnique({ where: { id: a.assigneeId }, include: { administration: { select: { generalAdminId: true } } } });
        if (!s) throw new BadRequestException('القسم غير موجود');
        return { ...a, generalAdminId: s.administration.generalAdminId, administrationId: s.administrationId, sectionId: s.id, userId: null, name: s.name, detail: 'كل موظفي القسم' };
      }
      case 'administration': {
        const ad = await this.prisma.administration.findUnique({ where: { id: a.assigneeId } });
        if (!ad) throw new BadRequestException('الإدارة غير موجودة');
        return { ...a, generalAdminId: ad.generalAdminId, administrationId: ad.id, sectionId: null, userId: null, name: ad.name, detail: 'كل موظفي الإدارة' };
      }
      case 'generalAdmin': {
        const ga = await this.prisma.generalAdministration.findUnique({ where: { id: a.assigneeId } });
        if (!ga) throw new BadRequestException('الإدارة العامة غير موجودة');
        return { ...a, generalAdminId: ga.id, administrationId: null, sectionId: null, userId: null, name: ga.name, detail: 'كل موظفي الإدارة العامة' };
      }
      default:
        throw new BadRequestException('نوع جهة غير معروف');
    }
  }

  /**
   * يحلّ قائمة إسناد ويتحقق أنها داخل نطاق الفاعل.
   * الموظف (بلا tasks.assign) لا يُسند إلا لنفسه.
   */
  private async resolveAssignments(actor: SessionUser, inputs: AssignmentInput[]): Promise<ResolvedAssignee[]> {
    const scope = this.scope(actor);
    const canAssign = this.perm.roleAllows(actor.role, 'tasks.assign');
    const out: ResolvedAssignee[] = [];
    const seen = new Set<string>();
    for (const a of inputs) {
      const key = `${a.assigneeType}:${a.assigneeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!canAssign && !(a.assigneeType === 'user' && a.assigneeId === actor.id)) {
        throw new ForbiddenException('لا يمكنك الإسناد إلا لنفسك');
      }
      const r = await this.resolveAssignee(a);
      if (canAssign && !this.perm.contains(scope, { generalAdminId: r.generalAdminId, administrationId: r.administrationId, sectionId: r.sectionId, userId: r.userId })) {
        throw new ForbiddenException(`الجهة «${r.name}» خارج نطاقك`);
      }
      out.push(r);
    }
    return out;
  }

  /** يُلحق الأسماء بالإسنادات المحمّلة (استعلام واحد لكل نوع مهما كان عدد المهام) */
  private async hydrateAssignments(rows: TaskAssignment[]): Promise<Map<string, TaskAssignmentView>> {
    const ids = (t: TaskAssignment['assigneeType']) => [...new Set(rows.filter((r) => r.assigneeType === t).map((r) => r.assigneeId))];
    const [users, sections, admins, gas] = await Promise.all([
      ids('user').length ? this.prisma.user.findMany({ where: { id: { in: ids('user') } }, select: { id: true, name: true, role: true, section: { select: { name: true } }, administration: { select: { name: true } } } }) : [],
      ids('section').length ? this.prisma.section.findMany({ where: { id: { in: ids('section') } }, select: { id: true, name: true } }) : [],
      ids('administration').length ? this.prisma.administration.findMany({ where: { id: { in: ids('administration') } }, select: { id: true, name: true } }) : [],
      ids('generalAdmin').length ? this.prisma.generalAdministration.findMany({ where: { id: { in: ids('generalAdmin') } }, select: { id: true, name: true } }) : [],
    ]);
    const names = new Map<string, { name: string; detail: string }>();
    for (const u of users) names.set(`user:${u.id}`, { name: u.name, detail: `${ROLE_LABELS[u.role]}${u.section?.name ? `، ${u.section.name}` : u.administration?.name ? `، ${u.administration.name}` : ''}` });
    for (const s of sections) names.set(`section:${s.id}`, { name: s.name, detail: 'كل موظفي القسم' });
    for (const a of admins) names.set(`administration:${a.id}`, { name: a.name, detail: 'كل موظفي الإدارة' });
    for (const g of gas) names.set(`generalAdmin:${g.id}`, { name: g.name, detail: 'كل موظفي الإدارة العامة' });
    const out = new Map<string, TaskAssignmentView>();
    for (const r of rows) {
      const n = names.get(`${r.assigneeType}:${r.assigneeId}`) ?? { name: `${ASSIGNEE_TYPE_LABELS[r.assigneeType]} محذوف`, detail: '' };
      out.set(r.id, { id: r.id, assigneeType: r.assigneeType, assigneeId: r.assigneeId, name: n.name, detail: n.detail, createdAt: r.createdAt.toISOString() });
    }
    return out;
  }

  private toSummary(t: TaskRow, names: Map<string, TaskAssignmentView>): TaskSummary {
    return {
      id: t.id, seq: t.seq, title: t.title, category: t.category, priority: t.priority, state: t.state,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      sizePreset: t.sizePreset, estimatedHours: t.estimatedHours, startedAt: iso(t.startedAt), completedAt: iso(t.completedAt),
      parentTaskId: t.parentTaskId, createdBy: t.createdBy, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
      assignments: t.assignments.map((a) => names.get(a.id)!).filter(Boolean),
      subtaskCount: t.subtasks.length, subtaskDoneCount: t.subtasks.filter((s) => s.state === 'done').length,
      commentCount: t._count.comments, attachmentCount: t._count.attachments,
    };
  }

  private async summaries(rows: TaskRow[]): Promise<TaskSummary[]> {
    const names = await this.hydrateAssignments(rows.flatMap((r) => r.assignments));
    return rows.map((r) => this.toSummary(r, names));
  }

  // ───────────────────────── سجل النشاط ─────────────────────────

  private activity(tx: Prisma.TransactionClient, taskId: string, actorId: string, type: TaskActivityType, data?: Prisma.InputJsonValue) {
    return tx.taskActivity.create({ data: { taskId, actorId, type, data: data ?? undefined } });
  }

  // ───────────────────────── القوائم والإحصاءات ─────────────────────────

  async list(actor: SessionUser, q: ListTasksDto): Promise<TaskListResponse> {
    const and: Prisma.TaskWhereInput[] = [visibleTasksWhere(actor, this.scope(actor))];
    if (q.parentTaskId) and.push({ parentTaskId: q.parentTaskId });
    else if (q.top !== false) and.push({ parentTaskId: null });
    if (q.state) and.push({ state: q.state });
    if (q.category) and.push({ category: q.category });
    if (q.priority) and.push({ priority: q.priority });
    if (q.sectionId) and.push({ OR: [{ sectionId: q.sectionId }, { assignments: { some: { sectionId: q.sectionId } } }] });
    if (q.administrationId) and.push({ OR: [{ administrationId: q.administrationId }, { assignments: { some: { administrationId: q.administrationId } } }] });
    if (q.generalAdminId) and.push({ OR: [{ generalAdminId: q.generalAdminId }, { assignments: { some: { generalAdminId: q.generalAdminId } } }] });
    if (q.assigneeUserId) and.push({ assignments: { some: { userId: q.assigneeUserId } } });
    if (q.mine) and.push({ assignments: { some: { userId: actor.id } } });
    if (q.overdue) and.push({ dueDate: { lt: today() }, state: { not: 'done' } });
    if (q.q) {
      const or: Prisma.TaskWhereInput[] = [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }];
      const n = Number(q.q.replace(/^#/, ''));
      if (Number.isInteger(n) && n > 0) or.push({ seq: n });
      and.push({ OR: or });
    }
    const where: Prisma.TaskWhereInput = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, include: SUMMARY_INCLUDE, orderBy: [{ seq: 'desc' }], skip: q.skip ?? 0, take: Math.min(q.take ?? 50, 200) }),
      this.prisma.task.count({ where }),
    ]);
    return { items: await this.summaries(rows), total };
  }

  async stats(actor: SessionUser): Promise<TaskStats> {
    const visible = visibleTasksWhere(actor, this.scope(actor));
    const count = (extra: Prisma.TaskWhereInput) => this.prisma.task.count({ where: { AND: [visible, extra] } });
    const [total, notStarted, inProgress, done, overdue, mine] = await Promise.all([
      count({}), count({ state: 'not_started' }), count({ state: 'in_progress' }), count({ state: 'done' }),
      count({ dueDate: { lt: today() }, state: { not: 'done' } }),
      count({ state: { not: 'done' }, assignments: { some: { userId: actor.id } } }),
    ]);
    return { total, notStarted, inProgress, done, overdue, mine };
  }

  // ───────────────────────── التفاصيل ─────────────────────────

  async get(actor: SessionUser, id: string): Promise<TaskDetail> {
    const t = await this.getVisible(actor, id);
    const [full, subtasks] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { id },
        include: {
          parent: { select: { id: true, seq: true, title: true } },
          comments: { orderBy: { createdAt: 'asc' }, include: { author: USER_REF } },
          attachments: { orderBy: { createdAt: 'asc' }, include: { uploadedBy: USER_REF } },
          activities: { orderBy: { createdAt: 'desc' }, take: 100, include: { actor: USER_REF } },
        },
      }),
      this.prisma.task.findMany({ where: { parentTaskId: id }, include: SUMMARY_INCLUDE, orderBy: { seq: 'asc' } }),
    ]);
    const [summary] = await this.summaries([t]);
    const subs = await this.summaries(subtasks);
    const manage = this.canManage(actor, t);
    return {
      ...summary,
      description: full.description,
      generalAdminId: t.generalAdminId, administrationId: t.administrationId, sectionId: t.sectionId,
      parent: full.parent,
      subtasks: subs,
      comments: full.comments.map((c) => ({ id: c.id, content: c.content, author: c.author, createdAt: c.createdAt.toISOString() })),
      attachments: full.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, uploadedBy: a.uploadedBy, createdAt: a.createdAt.toISOString() })),
      activities: full.activities.map((a) => ({ id: a.id, type: a.type as TaskActivityType, data: (a.data as unknown as Record<string, unknown> | null) ?? null, actor: a.actor, createdAt: a.createdAt.toISOString() })),
      can: { manage, assign: manage && this.perm.roleAllows(actor.role, 'tasks.assign'), act: true },
    };
  }

  // ───────────────────────── الإنشاء والتعديل ─────────────────────────

  async create(actor: SessionUser, dto: CreateTaskDto): Promise<TaskDetail> {
    const scope = this.scope(actor);
    let parent: TaskRow | null = null;
    let position: { generalAdminId: string | null; administrationId: string | null; sectionId: string | null };

    if (dto.parentTaskId) {
      parent = await this.getVisible(actor, dto.parentTaskId); // من يرى المهمة يستطيع تقسيمها
      if (parent.parentTaskId) throw new BadRequestException('المهام الفرعية مستوى واحد فقط — لا فرعية من فرعية');
      position = { generalAdminId: parent.generalAdminId, administrationId: parent.administrationId, sectionId: parent.sectionId };
    } else if (dto.generalAdminId !== undefined || dto.administrationId !== undefined || dto.sectionId !== undefined) {
      position = await this.users.normalizePosition(dto);
      if (!this.perm.contains(scope, position)) throw new ForbiddenException('موقع المهمة خارج نطاقك');
    } else {
      position = { generalAdminId: actor.generalAdminId, administrationId: actor.administrationId, sectionId: actor.sectionId };
    }

    let inputs = dto.assignments ?? [];
    if (!inputs.length && !this.perm.roleAllows(actor.role, 'tasks.assign')) inputs = [{ assigneeType: 'user', assigneeId: actor.id }]; // الموظف: مهمته لنفسه
    const assignees = await this.resolveAssignments(actor, inputs);

    const estimatedHours = await this.deriveHours(dto.sizePreset ?? null, dto.estimatedHours ?? null, position.administrationId);

    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          title: dto.title.trim(), description: dto.description?.trim() || null, category: dto.category, priority: dto.priority ?? 'medium',
          dueDate: dto.dueDate ? asDate(dto.dueDate) : null, sizePreset: dto.sizePreset ?? null, estimatedHours,
          parentTaskId: parent?.id ?? null, ...position, createdById: actor.id,
          assignments: {
            create: assignees.map((a) => ({ assigneeType: a.assigneeType, assigneeId: a.assigneeId, generalAdminId: a.generalAdminId, administrationId: a.administrationId, sectionId: a.sectionId, userId: a.userId, assignedById: actor.id })),
          },
        },
      });
      await this.activity(tx, t.id, actor.id, 'created', { title: t.title, category: t.category, sizePreset: t.sizePreset, estimatedHours: t.estimatedHours, assignees: assignees.map((a) => a.name) });
      if (parent) await this.activity(tx, parent.id, actor.id, 'subtask_created', { subtaskId: t.id, seq: t.seq, title: t.title, assignees: assignees.map((a) => a.name) });
      return t;
    });
    return this.get(actor, created.id);
  }

  async update(actor: SessionUser, id: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    const t = await this.getVisible(actor, id);
    this.assertManage(actor, t);
    const data: Prisma.TaskUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = (k: keyof UpdateTaskDto, from: unknown, to: unknown, value: unknown) => {
      if (JSON.stringify(from) === JSON.stringify(to)) return;
      changes[k] = { from, to };
      (data as Record<string, unknown>)[k] = value;
    };
    if (dto.title !== undefined) set('title', t.title, dto.title.trim(), dto.title.trim());
    if (dto.description !== undefined) set('description', t.description, dto.description?.trim() || null, dto.description?.trim() || null);
    if (dto.category !== undefined) set('category', t.category, dto.category, dto.category);
    if (dto.priority !== undefined) set('priority', t.priority, dto.priority, dto.priority);
    if (dto.dueDate !== undefined) set('dueDate', t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null, dto.dueDate ?? null, dto.dueDate ? asDate(dto.dueDate) : null);
    if (dto.sizePreset !== undefined) set('sizePreset', t.sizePreset, dto.sizePreset ?? null, dto.sizePreset ?? null);
    if (dto.estimatedHours !== undefined) set('estimatedHours', t.estimatedHours, dto.estimatedHours ?? null, dto.estimatedHours ?? null);
    // تغيّر الحجم بلا ساعات صريحة ⇒ تُشتق الساعات من الحجم الجديد
    if (dto.sizePreset !== undefined && dto.estimatedHours === undefined && dto.sizePreset !== t.sizePreset) {
      const hours = await this.deriveHours(dto.sizePreset ?? null, null, t.administrationId);
      set('estimatedHours', t.estimatedHours, hours, hours);
    }
    if (!Object.keys(changes).length) return this.get(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data });
      await this.activity(tx, id, actor.id, 'updated', { changes } as unknown as Prisma.InputJsonValue);
    });
    return this.get(actor, id);
  }

  /** انتقال الحالة — من يرى المهمة (مسند إليه أو مدير) يحرّكها؛ التوقيت يُشتق من الانتقال (PLAN 9.4) */
  async changeState(actor: SessionUser, id: string, dto: ChangeStateDto): Promise<TaskDetail> {
    const t = await this.getVisible(actor, id);
    if (t.state === dto.state) return this.get(actor, id);
    const now = new Date();
    const data: Prisma.TaskUpdateInput = { state: dto.state };
    if (dto.state === 'in_progress' && !t.startedAt) data.startedAt = now;
    if (dto.state === 'done') { data.completedAt = now; if (!t.startedAt) data.startedAt = now; }
    if (dto.state !== 'done' && t.completedAt) data.completedAt = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data });
      await this.activity(tx, id, actor.id, 'state_changed', { from: t.state, to: dto.state });
    });
    return this.get(actor, id);
  }

  async remove(actor: SessionUser, id: string): Promise<{ ok: true; removedFiles: string[] }> {
    const t = await this.getVisible(actor, id);
    this.assertManage(actor, t);
    // ملفات المرفقات (للمهمة وفرعياتها) تُحذف من القرص بعد حذف السجلات (cascade)
    const files = await this.prisma.attachment.findMany({ where: { OR: [{ taskId: id }, { task: { parentTaskId: id } }] }, select: { storedName: true } });
    await this.prisma.task.delete({ where: { id } });
    return { ok: true, removedFiles: files.map((f) => f.storedName) };
  }

  // ───────────────────────── الإسناد ─────────────────────────

  async addAssignments(actor: SessionUser, id: string, inputs: AssignmentInput[]): Promise<TaskDetail> {
    const t = await this.getVisible(actor, id);
    this.assertManage(actor, t);
    const existing = new Set(t.assignments.map((a) => `${a.assigneeType}:${a.assigneeId}`));
    const fresh = (await this.resolveAssignments(actor, inputs)).filter((a) => !existing.has(`${a.assigneeType}:${a.assigneeId}`));
    if (!fresh.length) return this.get(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.createMany({
        data: fresh.map((a) => ({ taskId: id, assigneeType: a.assigneeType, assigneeId: a.assigneeId, generalAdminId: a.generalAdminId, administrationId: a.administrationId, sectionId: a.sectionId, userId: a.userId, assignedById: actor.id })),
        skipDuplicates: true,
      });
      await this.activity(tx, id, actor.id, 'assigned', { assignees: fresh.map((a) => `${a.name} (${ASSIGNEE_TYPE_LABELS[a.assigneeType]})`) });
    });
    return this.get(actor, id);
  }

  async removeAssignment(actor: SessionUser, id: string, assignmentId: string): Promise<TaskDetail> {
    const t = await this.getVisible(actor, id);
    this.assertManage(actor, t);
    const a = t.assignments.find((x) => x.id === assignmentId);
    if (!a) throw new NotFoundException('الإسناد غير موجود');
    const names = await this.hydrateAssignments([a]);
    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.delete({ where: { id: assignmentId } });
      await this.activity(tx, id, actor.id, 'unassigned', { assignee: names.get(a.id)?.name ?? a.assigneeId, assigneeType: a.assigneeType });
    });
    return this.get(actor, id);
  }

  // ───────────────────────── التعليقات ─────────────────────────

  async addComment(actor: SessionUser, id: string, content: string) {
    await this.getVisible(actor, id);
    const c = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({ data: { taskId: id, authorId: actor.id, content: content.trim() }, include: { author: USER_REF } });
      await this.activity(tx, id, actor.id, 'comment_added', { commentId: created.id, excerpt: created.content.slice(0, 80) });
      return created;
    });
    return { id: c.id, content: c.content, author: c.author, createdAt: c.createdAt.toISOString() };
  }

  async deleteComment(actor: SessionUser, id: string, commentId: string) {
    const t = await this.getVisible(actor, id);
    const c = await this.prisma.comment.findFirst({ where: { id: commentId, taskId: id } });
    if (!c) throw new NotFoundException('التعليق غير موجود');
    if (c.authorId !== actor.id && !this.canManage(actor, t)) throw new ForbiddenException('لا يمكنك حذف تعليق غيرك');
    await this.prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: commentId } });
      await this.activity(tx, id, actor.id, 'comment_deleted', { commentId, excerpt: c.content.slice(0, 80) });
    });
    return { ok: true };
  }

  /** تسجيل نشاط من خدمة المرفقات (الفحص الموضعي يتم هناك) */
  logActivity(taskId: string, actorId: string, type: TaskActivityType, data?: Prisma.InputJsonValue) {
    return this.activity(this.prisma, taskId, actorId, type, data);
  }

  // ───────────────────────── أحجام المهام → ساعات ─────────────────────────

  /** الساعات الفعلية للإدارة: ضبط الإدارة ← الافتراضي العام في قاعدة البيانات ← الثوابت */
  async effectivePresets(administrationId: string | null): Promise<SizePresetRow[]> {
    const rows = await this.prisma.sizePresetConfig.findMany({ where: { OR: [{ administrationId: null }, ...(administrationId ? [{ administrationId }] : [])] } });
    return SIZE_PRESETS.map((size) => {
      const own = administrationId ? rows.find((r) => r.administrationId === administrationId && r.size === size) : undefined;
      const global = rows.find((r) => r.administrationId === null && r.size === size);
      const pick = own ?? global;
      return { size, hours: pick?.hours ?? DEFAULT_SIZE_PRESET_HOURS[size], administrationId: pick?.administrationId ?? null };
    });
  }

  private async deriveHours(size: SizePreset | null, explicit: number | null, administrationId: string | null): Promise<number | null> {
    if (explicit != null) return explicit;
    if (!size) return null;
    return (await this.effectivePresets(administrationId)).find((p) => p.size === size)!.hours;
  }

  /** ضبط الساعات: الرئيس التنفيذي للافتراضي العام؛ المستوى الإداري المحتوي للإدارة */
  async upsertPresets(actor: SessionUser, dto: UpsertSizePresetsDto): Promise<SizePresetRow[]> {
    const administrationId = dto.administrationId ?? null;
    const scope = this.scope(actor);
    if (!administrationId) {
      if (scope.level !== 'organization') throw new ForbiddenException('الافتراضي العام يضبطه الرئيس التنفيذي فقط');
    } else {
      const ad = await this.prisma.administration.findUnique({ where: { id: administrationId } });
      if (!ad) throw new BadRequestException('الإدارة غير موجودة');
      if (scope.level === 'user' || scope.level === 'section' || !this.perm.contains(scope, { generalAdminId: ad.generalAdminId, administrationId: ad.id })) {
        throw new ForbiddenException('ضبط أحجام هذه الإدارة خارج نطاقك');
      }
    }
    // القيد الفريد (administrationId, size) لا يلتقط null في PostgreSQL ⇒ بحث ثم تحديث/إنشاء داخل معاملة
    await this.prisma.$transaction(async (tx) => {
      for (const p of dto.presets) {
        const row = await tx.sizePresetConfig.findFirst({ where: { administrationId, size: p.size } });
        if (row) await tx.sizePresetConfig.update({ where: { id: row.id }, data: { hours: p.hours } });
        else await tx.sizePresetConfig.create({ data: { administrationId, size: p.size, hours: p.hours } });
      }
    });
    return this.effectivePresets(administrationId);
  }
}
