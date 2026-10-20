import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';
export interface AuditMeta {
  action: string; // مثل org.section.create
  entity: string; // مثل Section
  /** اسم المعامل الذي يحمل معرّف الكيان (افتراضي: id) */
  idParam?: string;
}
/** يسجّل الطلب في سجل التدقيق عند نجاحه (الطلبات المعدِّلة تُسجَّل تلقائيًا حتى بلا هذا) */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
