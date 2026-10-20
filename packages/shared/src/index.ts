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
