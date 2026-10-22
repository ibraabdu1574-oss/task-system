/**
 * @task/shared — أنواع وثوابت مشتركة بين الخلفية (NestJS) والواجهة (Next.js).
 * لا منطق هنا: تعريفات فقط، حتى تبقى الحزمة بلا تبعيات.
 */

/** الأدوار — مطابقة لـ enum Role في Prisma */
export const ROLES = [
  'ceo',
  'generalAdminManager',
  'followUpOfficer',
  'adminManager',
  'supervisor',
  'employee',
] as const;
export type Role = (typeof ROLES)[number];

/** أسماء الأدوار بالعربية للعرض */
export const ROLE_LABELS: Record<Role, string> = {
  ceo: 'الرئيس التنفيذي',
  generalAdminManager: 'مدير عام',
  followUpOfficer: 'مسؤول متابعة',
  adminManager: 'مدير إدارة',
  supervisor: 'مشرف',
  employee: 'موظف',
};

export const AUTH_SOURCES = ['local', 'ldap'] as const;
export type AuthSource = (typeof AUTH_SOURCES)[number];

/** الإجراءات التي يفهمها محرك الصلاحيات في المرحلة 1 */
export const ACTIONS = [
  'self',            // عمليات المستخدم على حسابه هو (جلسته، كلمة مروره)
  'org.read',
  'org.manage',      // إنشاء/تعديل/حذف وحدات الهيكل + تعيين المدراء
  'users.read',
  'users.manage',
  'holidays.read',
  'holidays.manage',
  'leaves.read',
  'leaves.manage',
  'audit.read',
  // ── المرحلة 2: المهام ──
  'tasks.read',    // قراءة المهام ضمن نطاق الرؤية (الموظف: المسند إليه فقط)
  'tasks.create',  // إنشاء مهمة (الموظف: لنفسه أو فرعية من مهمة يراها)
  'tasks.update',  // تعديل بيانات المهمة وحالتها، وضبط ساعات الأحجام
  'tasks.assign',  // الإسناد لعدة جهات (ليس للموظف)
  'tasks.comment', // التعليقات
  'tasks.attach',  // المرفقات
] as const;
export type Action = (typeof ACTIONS)[number];

/** مستويات الشجرة التنظيمية */
export type OrgLevel = 'organization' | 'generalAdmin' | 'administration' | 'section' | 'user';

/** موقع كيان في الشجرة — يُستخدم لحساب النطاق */
export interface OrgPosition {
  generalAdminId?: string | null;
  administrationId?: string | null;
  sectionId?: string | null;
  /** للمستخدمين: معرّف المستخدم نفسه (لنطاق "مهامه فقط") */
  userId?: string | null;
}

/** نطاق صلاحية محسوب للفاعل */
export interface Scope {
  level: OrgLevel;
  generalAdminId?: string | null;
  administrationId?: string | null;
  sectionId?: string | null;
  userId?: string | null;
  /** مسؤول المتابعة: نطاق موسّع داخل إدارته بغض النظر عن مستواه */
  followUpOfficer?: boolean;
}

/** سياسة كلمات المرور (مصدر الحقيقة الوحيد — تُعرض في الواجهة وتُفرض في الخلفية) */
export const PASSWORD_POLICY = {
  minLength: 12,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: true,
  historySize: 5,
} as const;

/** قفل الحساب */
export const LOCKOUT_POLICY = {
  maxFailedLogins: 5,
  lockMinutes: 15,
} as const;

/** أيام العمل الافتراضية: 0=الأحد … 4=الخميس */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4] as const;
export const DEFAULT_DAILY_CAPACITY_HOURS = 6;

export const WEEKDAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

/** ما تعيده الخلفية عن المستخدم الحالي */
export interface SessionUser {
  id: string;
  name: string;
  employeeNo: string;
  email: string;
  role: Role;
  authSource: AuthSource;
  generalAdminId: string | null;
  administrationId: string | null;
  sectionId: string | null;
  dailyCapacityHours: number;
  workingDays: number[];
  isActive: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

/** عقدة شجرة الهيكل كما تعيدها /org/tree */
export interface OrgTreeUser {
  id: string;
  name: string;
  employeeNo: string;
  role: Role;
  isActive: boolean;
}
export interface OrgTreeSection {
  id: string;
  name: string;
  supervisor: OrgTreeUser | null;
  users: OrgTreeUser[];
}
export interface OrgTreeAdministration {
  id: string;
  name: string;
  manager: OrgTreeUser | null;
  followUpOfficers: OrgTreeUser[];
  sections: OrgTreeSection[];
  /** موظفون منتمون للإدارة بلا قسم */
  users: OrgTreeUser[];
}
export interface OrgTreeGeneralAdmin {
  id: string;
  name: string;
  manager: OrgTreeUser | null;
  administrations: OrgTreeAdministration[];
  /** موظفون منتمون للإدارة العامة بلا إدارة */
  users: OrgTreeUser[];
}
export interface OrgTree {
  generalAdmins: OrgTreeGeneralAdmin[];
  /** مستخدمون بلا موقع (مثل الرئيس التنفيذي) */
  unassigned: OrgTreeUser[];
  counts: { generalAdmins: number; administrations: number; sections: number; users: number };
}

/* ═══════════════════════════ المرحلة 2 — المهام ═══════════════════════════ */

export const TASK_CATEGORIES = ['routine', 'adhoc'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = { routine: 'دورية', adhoc: 'عرضية' };

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' };

/**
 * حالة المهمة في المرحلة 2 = الفئة السلوكية فقط (PLAN 9.أ).
 * الحالات القابلة للتخصيص لكل إدارة (TaskStatus) تُضاف في المرحلة 3 وتُربط بهذه الفئات.
 */
export const TASK_STATES = ['not_started', 'in_progress', 'done'] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const TASK_STATE_LABELS: Record<TaskState, string> = { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', done: 'مكتملة' };

/** حجم المهمة → ساعات افتراضية (PLAN 9.1) — التقاط مبكّر بلا محرك */
export const SIZE_PRESETS = ['daily', 'weekly', 'long'] as const;
export type SizePreset = (typeof SIZE_PRESETS)[number];
export const SIZE_PRESET_LABELS: Record<SizePreset, string> = { daily: 'يومية', weekly: 'أسبوع أو نصفه', long: 'أكثر من أسبوع' };
export const DEFAULT_SIZE_PRESET_HOURS: Record<SizePreset, number> = { daily: 4, weekly: 16, long: 40 };

export const ASSIGNEE_TYPES = ['user', 'section', 'administration', 'generalAdmin'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];
export const ASSIGNEE_TYPE_LABELS: Record<AssigneeType, string> = { user: 'موظف', section: 'قسم', administration: 'إدارة', generalAdmin: 'إدارة عامة' };

/** سياسة المرفقات (تُعرض في الواجهة وتُفرض في الخلفية) */
export const ATTACHMENT_POLICY = {
  maxSizeMb: 10,
  /** الامتدادات المسموحة (صغيرة الحروف) */
  allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv', 'md', 'docx', 'xlsx', 'pptx', 'zip'],
} as const;

export const TASK_ACTIVITY_TYPES = [
  'created', 'updated', 'state_changed', 'assigned', 'unassigned',
  'subtask_created', 'comment_added', 'comment_deleted', 'attachment_added', 'attachment_deleted', 'deleted',
] as const;
export type TaskActivityType = (typeof TASK_ACTIVITY_TYPES)[number];

export interface UserRef {
  id: string;
  name: string;
  employeeNo: string;
}

export interface AssignmentInput {
  assigneeType: AssigneeType;
  assigneeId: string;
}

export interface TaskAssignmentView extends AssignmentInput {
  id: string;
  /** اسم الجهة بعد الحل (موظف/قسم/إدارة/إدارة عامة) */
  name: string;
  /** سطر وصفي: دور الموظف وقسمه، أو «كل موظفي القسم»… */
  detail: string;
  createdAt: string;
}

export interface TaskSummary {
  id: string;
  seq: number;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  state: TaskState;
  dueDate: string | null;
  sizePreset: SizePreset | null;
  estimatedHours: number | null;
  startedAt: string | null;
  completedAt: string | null;
  parentTaskId: string | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
  assignments: TaskAssignmentView[];
  subtaskCount: number;
  subtaskDoneCount: number;
  commentCount: number;
  attachmentCount: number;
}

export interface CommentView {
  id: string;
  content: string;
  author: UserRef;
  createdAt: string;
}

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: UserRef;
  createdAt: string;
}

export interface TaskActivityView {
  id: string;
  type: TaskActivityType;
  data: Record<string, unknown> | null;
  actor: UserRef | null;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  generalAdminId: string | null;
  administrationId: string | null;
  sectionId: string | null;
  parent: { id: string; seq: number; title: string } | null;
  subtasks: TaskSummary[];
  comments: CommentView[];
  attachments: AttachmentView[];
  activities: TaskActivityView[];
  /** ما يستطيعه الفاعل الحالي على هذه المهمة (للواجهة فقط — الخلفية تعيد الفحص) */
  can: { manage: boolean; assign: boolean; act: boolean };
}

export interface TaskListResponse {
  items: TaskSummary[];
  total: number;
}

export interface TaskStats {
  total: number;
  notStarted: number;
  inProgress: number;
  done: number;
  overdue: number;
  /** المسندة إلى الفاعل مباشرةً */
  mine: number;
}

export interface SizePresetRow {
  size: SizePreset;
  hours: number;
  /** null = الافتراضي العام */
  administrationId: string | null;
}
