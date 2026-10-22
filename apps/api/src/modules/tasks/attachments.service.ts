import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ATTACHMENT_POLICY, type AttachmentView, type SessionUser } from '@task/shared';
import type { AppConfig } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from './tasks.service';

/** ملف مرفوع كما يسلّمه multer (memoryStorage) */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** الامتداد → نوع MIME المعتمد (ما يُرسله المتصفح لا يُوثق به؛ نخزّن ما نشتقّه نحن) */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

/** توقيعات (magic bytes) للأنواع الثنائية — النصية تُفحص أنها بلا بايتات صفرية */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  pdf: (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  xlsx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  pptx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  txt: (b) => !b.subarray(0, 8192).includes(0),
  csv: (b) => !b.subarray(0, 8192).includes(0),
  md: (b) => !b.subarray(0, 8192).includes(0),
};

/** multer 1.x يفكّ اسم الملف بترميز latin1 فتظهر الأسماء العربية مشوّهة — نعيد تفسيرها UTF-8 إن كانت كذلك */
function fixEncoding(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name) || /[\u0100-\uffff]/.test(name)) return name; // ASCII أو يونيكود سليم
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

/** اسم عرض آمن: بلا مسارات أو محارف تحكم، بطول معقول */
function safeDisplayName(name: string): string {
  const base = path.basename(fixEncoding(name).replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (base || 'file').slice(0, 150);
}

export const MAX_ATTACHMENT_BYTES = ATTACHMENT_POLICY.maxSizeMb * 1024 * 1024;

/**
 * المرفقات (PLAN القسم 7): تخزين خارج الجذر العام، أسماء عشوائية، تحقق من النوع (امتداد + توقيع) والحجم،
 * وفحص صلاحية الوصول قبل التنزيل. لا يُخدَم المجلد مباشرةً أبدًا.
 */
@Injectable()
export class AttachmentsService implements OnModuleInit {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly dir: string;

  constructor(private readonly prisma: PrismaService, private readonly tasks: TasksService, config: ConfigService) {
    this.dir = config.get<AppConfig>('app')!.attachmentsDir;
  }

  async onModuleInit() {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  /** يتحقق من الملف ويعيد الامتداد ونوع MIME المعتمد */
  validate(file: UploadedFile): { ext: string; mimeType: string } {
    if (!file?.buffer?.length) throw new BadRequestException('لم يُرفق ملف');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException(`حجم الملف يتجاوز ${ATTACHMENT_POLICY.maxSizeMb} ميغابايت`);
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ext || !(ATTACHMENT_POLICY.allowedExtensions as readonly string[]).includes(ext)) {
      throw new BadRequestException(`نوع الملف غير مسموح — المسموح: ${ATTACHMENT_POLICY.allowedExtensions.join('، ')}`);
    }
    if (!MAGIC[ext]?.(file.buffer)) throw new BadRequestException('محتوى الملف لا يطابق امتداده');
    return { ext, mimeType: MIME_BY_EXT[ext] };
  }

  async upload(actor: SessionUser, taskId: string, file: UploadedFile): Promise<AttachmentView> {
    await this.tasks.getVisible(actor, taskId); // من يرى المهمة يرفق
    const { ext, mimeType } = this.validate(file);
    const storedName = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(this.dir, storedName), file.buffer, { mode: 0o600, flag: 'wx' });
    try {
      const a = await this.prisma.attachment.create({
        data: { taskId, uploadedById: actor.id, fileName: safeDisplayName(file.originalname), storedName, mimeType, size: file.size },
        include: { uploadedBy: { select: { id: true, name: true, employeeNo: true } } },
      });
      await this.tasks.logActivity(taskId, actor.id, 'attachment_added', { attachmentId: a.id, fileName: a.fileName, size: a.size });
      return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, uploadedBy: a.uploadedBy, createdAt: a.createdAt.toISOString() };
    } catch (e) {
      await fs.unlink(path.join(this.dir, storedName)).catch(() => undefined);
      throw e;
    }
  }

  /** فحص الصلاحية ثم إرجاع مسار الملف على القرص — المتحكم يبثّه */
  async resolveForDownload(actor: SessionUser, taskId: string, attachmentId: string) {
    await this.tasks.getVisible(actor, taskId);
    const a = await this.prisma.attachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!a) throw new NotFoundException('المرفق غير موجود');
    const full = path.join(this.dir, path.basename(a.storedName)); // basename: لا خروج من المجلد مهما كان ما في القاعدة
    try {
      await fs.access(full);
    } catch {
      this.logger.error(`ملف المرفق مفقود من القرص: ${a.storedName}`);
      throw new NotFoundException('ملف المرفق غير موجود على الخادم');
    }
    return { path: full, fileName: a.fileName, mimeType: a.mimeType, size: a.size };
  }

  async remove(actor: SessionUser, taskId: string, attachmentId: string) {
    const t = await this.tasks.getVisible(actor, taskId);
    const a = await this.prisma.attachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!a) throw new NotFoundException('المرفق غير موجود');
    if (a.uploadedById !== actor.id) {
      try { this.tasks.assertManage(actor, t); } catch { throw new ForbiddenException('لا يمكنك حذف مرفق غيرك'); }
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.removeFiles([a.storedName]);
    await this.tasks.logActivity(taskId, actor.id, 'attachment_deleted', { attachmentId, fileName: a.fileName });
    return { ok: true };
  }

  /** حذف ملفات من القرص بعد حذف سجلاتها (مثل حذف مهمة كاملة) */
  async removeFiles(storedNames: string[]) {
    for (const n of storedNames) await fs.unlink(path.join(this.dir, path.basename(n))).catch(() => undefined);
  }
}
