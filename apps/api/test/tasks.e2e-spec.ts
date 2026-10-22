/**
 * اختبارات تكامل — المرحلة 2: المهام (إسناد متعدد، فرعية بإسناد مستقل، نطاق الرؤية،
 * صلاحيات التعليق والمرفق، سجل النشاط، الحجم والتوقيت).
 * تعمل على قاعدة التطوير بعد البذرة (SEED_PASSWORD من البيئة):
 *   sudo task phase 2  (يشغّلها تلقائيًا)   أو   task test
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const PASSWORD = process.env.SEED_PASSWORD!;
const api = (app: INestApplication) => request(app.getHttpServer());
const uniq = () => `e2e-task-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

interface U { id: string; employeeNo: string; sectionId: string | null; administrationId: string | null }

describe('المهام (e2e)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const users: Record<string, U> = {};
  let systemsId: string, cyberId: string, dbSectionId: string, supportId: string;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const login = async (employeeNo: string) => {
    const res = await api(app).post('/api/v1/auth/login').send({ identifier: employeeNo, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; user: U };
  };

  beforeAll(async () => {
    expect(PASSWORD).toBeTruthy();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    // 1003 مدير الأنظمة · 1004 مدير الأمن السيبراني · 1015 مسؤول متابعة · 1020 مشرف الدعم · 1021 مشرف قواعد البيانات
    // 1042 سارة (دعم) · 1051 فهد (دعم) · 1090 ريم (قواعد بيانات) · 2001 نورة (موارد بشرية)
    for (const [who, no] of Object.entries({ ceo: '1001', gm: '1002', mgr: '1003', cyberMgr: '1004', fuo: '1015', sup: '1020', dbSup: '1021', sara: '1042', fahad: '1051', reem: '1090', noura: '2001' })) {
      const s = await login(no);
      tokens[who] = s.accessToken;
      users[who] = s.user;
    }
    const tree = (await api(app).get('/api/v1/org/tree').set(auth('ceo'))).body;
    const tech = tree.generalAdmins.find((g: { name: string }) => g.name === 'الإدارة العامة للتقنية');
    const systems = tech.administrations.find((a: { name: string }) => a.name === 'إدارة الأنظمة');
    systemsId = systems.id;
    cyberId = tech.administrations.find((a: { name: string }) => a.name === 'إدارة الأمن السيبراني').id;
    dbSectionId = systems.sections.find((s: { name: string }) => s.name === 'قواعد البيانات').id;
    supportId = systems.sections.find((s: { name: string }) => s.name === 'الدعم الفني').id;
  });

  afterAll(async () => {
    await app.close();
  });

  let taskId: string;
  let subtaskId: string;

  it('إسناد مهمة لعدة جهات (موظف + قسم + إدارة) مع اشتقاق الساعات من الحجم', async () => {
    // المدير العام ينشئها في إدارة الأنظمة ويُسندها لجهات من إدارتين (كلتاهما داخل نطاقه)
    const res = await api(app).post('/api/v1/tasks').set(auth('gm')).send({
      title: uniq(), description: 'e2e', category: 'adhoc', priority: 'high', dueDate: '2031-03-01', sizePreset: 'weekly', administrationId: systemsId,
      assignments: [
        { assigneeType: 'user', assigneeId: users.sara.id },
        { assigneeType: 'section', assigneeId: dbSectionId },
        { assigneeType: 'administration', assigneeId: cyberId },
      ],
    });
    expect(res.status).toBe(201);
    taskId = res.body.id;
    expect(res.body.seq).toBeGreaterThan(0);
    expect(res.body.assignments).toHaveLength(3);
    expect(res.body.assignments.map((a: { assigneeType: string }) => a.assigneeType).sort()).toEqual(['administration', 'section', 'user']);
    expect(res.body.estimatedHours).toBe(16); // weekly ⇒ 16 ساعة (الافتراضي العام)
    expect(res.body.state).toBe('not_started');
    expect(res.body.startedAt).toBeNull();
    expect(res.body.activities[0].type).toBe('created');
    expect(res.body.can.manage).toBe(true);
  });

  it('نطاق الرؤية: المسند إليه ومشرف القسم المسند ومدير الإدارة المسندة يرون المهمة؛ غيرهم لا', async () => {
    const get = (who: string) => api(app).get(`/api/v1/tasks/${taskId}`).set(auth(who));
    expect((await get('sara')).status).toBe(200); // مسندة مباشرةً
    expect((await get('reem')).status).toBe(200); // عضو في قسم قواعد البيانات المسند
    expect((await get('dbSup')).status).toBe(200); // مشرف القسم المسند
    expect((await get('cyberMgr')).status).toBe(200); // مدير الإدارة المسندة
    expect((await get('sup')).status).toBe(200); // مشرف سارة
    expect((await get('fuo')).status).toBe(200); // مسؤول متابعة الأنظمة
    expect((await get('gm')).status).toBe(200);
    expect((await get('fahad')).status).toBe(404); // زميل في القسم نفسه لكن غير مسند — بلا تسريب
    expect((await get('noura')).status).toBe(404);
    // القوائم مقصورة على النطاق نفسه
    const saraList = (await api(app).get('/api/v1/tasks').set(auth('sara'))).body;
    expect(saraList.items.some((t: { id: string }) => t.id === taskId)).toBe(true);
    const fahadList = (await api(app).get('/api/v1/tasks').set(auth('fahad'))).body;
    expect(fahadList.items.some((t: { id: string }) => t.id === taskId)).toBe(false);
    const nouraList = (await api(app).get('/api/v1/tasks').set(auth('noura'))).body;
    expect(nouraList.total).toBe(0);
  });

  it('الإدارة: مدير الإدارة المسندة يرى ولا يعدّل؛ الموظف لا يعدّل ولا يُسند؛ مسؤول المتابعة يعدّل', async () => {
    expect((await api(app).patch(`/api/v1/tasks/${taskId}`).set(auth('cyberMgr')).send({ priority: 'low' })).status).toBe(403);
    expect((await api(app).patch(`/api/v1/tasks/${taskId}`).set(auth('sara')).send({ priority: 'low' })).status).toBe(403);
    expect((await api(app).post(`/api/v1/tasks/${taskId}/assignments`).set(auth('sara')).send({ assignments: [{ assigneeType: 'user', assigneeId: users.fahad.id }] })).status).toBe(403);
    const r = await api(app).patch(`/api/v1/tasks/${taskId}`).set(auth('fuo')).send({ priority: 'medium', sizePreset: 'long' });
    expect(r.status).toBe(200);
    expect(r.body.priority).toBe('medium');
    expect(r.body.estimatedHours).toBe(40); // تغيّر الحجم ⇒ أُعيد اشتقاق الساعات
    expect(r.body.activities[0].type).toBe('updated');
    expect(r.body.activities[0].data.changes.priority).toEqual({ from: 'high', to: 'medium' });
  });

  it('الإسناد خارج النطاق مرفوض، وداخل النطاق يُضاف ويُزال مع تسجيل النشاط', async () => {
    // مدير الأنظمة لا يُسند لموظفة الموارد البشرية
    expect((await api(app).post(`/api/v1/tasks/${taskId}/assignments`).set(auth('mgr')).send({ assignments: [{ assigneeType: 'user', assigneeId: users.noura.id }] })).status).toBe(403);
    const add = await api(app).post(`/api/v1/tasks/${taskId}/assignments`).set(auth('mgr')).send({ assignments: [{ assigneeType: 'user', assigneeId: users.fahad.id }] });
    expect(add.status).toBe(201);
    expect(add.body.assignments).toHaveLength(4);
    expect((await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('fahad'))).status).toBe(200); // صار يراها
    const fa = add.body.assignments.find((a: { assigneeId: string }) => a.assigneeId === users.fahad.id);
    const rm = await api(app).delete(`/api/v1/tasks/${taskId}/assignments/${fa.id}`).set(auth('mgr'));
    expect(rm.status).toBe(200);
    expect(rm.body.assignments).toHaveLength(3);
    expect(rm.body.activities.map((a: { type: string }) => a.type).slice(0, 2)).toEqual(['unassigned', 'assigned']);
    expect((await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('fahad'))).status).toBe(404);
  });

  it('مهمة فرعية بإسناد مستقل: المسند إليها يراها دون الأم، ولا فرعية من فرعية', async () => {
    const res = await api(app).post('/api/v1/tasks').set(auth('sara')).send({
      title: uniq(), category: 'adhoc', parentTaskId: taskId, sizePreset: 'daily',
      assignments: [{ assigneeType: 'user', assigneeId: users.sara.id }],
    });
    expect(res.status).toBe(201); // سارة ترى الأم فتستطيع تقسيمها (لنفسها)
    subtaskId = res.body.id;
    expect(res.body.parent.id).toBe(taskId);
    expect(res.body.estimatedHours).toBe(4);
    // المدير يعيد إسناد الفرعية لفهد وحده
    const re = await api(app).post(`/api/v1/tasks/${subtaskId}/assignments`).set(auth('mgr')).send({ assignments: [{ assigneeType: 'user', assigneeId: users.fahad.id }] });
    expect(re.status).toBe(201);
    expect((await api(app).get(`/api/v1/tasks/${subtaskId}`).set(auth('fahad'))).status).toBe(200);
    expect((await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('fahad'))).status).toBe(404); // الأم ما زالت خارج نطاقه
    const parent = (await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('mgr'))).body;
    expect(parent.subtasks.map((s: { id: string }) => s.id)).toContain(subtaskId);
    expect(parent.subtaskCount).toBe(1);
    expect(parent.activities.some((a: { type: string }) => a.type === 'subtask_created')).toBe(true);
    // الموظف لا يُسند لغيره عند الإنشاء
    expect((await api(app).post('/api/v1/tasks').set(auth('sara')).send({ title: uniq(), category: 'adhoc', parentTaskId: taskId, assignments: [{ assigneeType: 'user', assigneeId: users.fahad.id }] })).status).toBe(403);
    // لا فرعية من فرعية
    expect((await api(app).post('/api/v1/tasks').set(auth('mgr')).send({ title: uniq(), category: 'adhoc', parentTaskId: subtaskId })).status).toBe(400);
    // القائمة الرئيسية لا تعرض الفرعية، وفلتر parentTaskId يعرضها
    const top = (await api(app).get('/api/v1/tasks').set(auth('mgr'))).body;
    expect(top.items.some((t: { id: string }) => t.id === subtaskId)).toBe(false);
    const subs = (await api(app).get('/api/v1/tasks').query({ parentTaskId: taskId }).set(auth('mgr'))).body;
    expect(subs.items.map((t: { id: string }) => t.id)).toEqual([subtaskId]);
  });

  it('انتقال الحالة يشتق التوقيت: in_progress ⇒ startedAt، done ⇒ completedAt', async () => {
    const s1 = await api(app).post(`/api/v1/tasks/${subtaskId}/state`).set(auth('fahad')).send({ state: 'in_progress' });
    expect(s1.status).toBe(201);
    expect(s1.body.startedAt).toBeTruthy();
    expect(s1.body.completedAt).toBeNull();
    const s2 = await api(app).post(`/api/v1/tasks/${subtaskId}/state`).set(auth('fahad')).send({ state: 'done' });
    expect(s2.body.completedAt).toBeTruthy();
    expect(s2.body.activities[0]).toMatchObject({ type: 'state_changed', data: { from: 'in_progress', to: 'done' } });
    const parent = (await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('mgr'))).body;
    expect(parent.subtaskDoneCount).toBe(1);
    // نورة لا ترى المهمة فلا تحرّكها
    expect((await api(app).post(`/api/v1/tasks/${subtaskId}/state`).set(auth('noura')).send({ state: 'not_started' })).status).toBe(404);
    expect((await api(app).post(`/api/v1/tasks/${subtaskId}/state`).set(auth('fahad')).send({ state: 'bogus' })).status).toBe(400);
  });

  it('التعليقات: من يرى المهمة يعلّق، وغيره لا؛ الحذف لصاحبه أو المدير', async () => {
    const c = await api(app).post(`/api/v1/tasks/${taskId}/comments`).set(auth('sara')).send({ content: 'تم الاختبار بنجاح' });
    expect(c.status).toBe(201);
    expect(c.body.author.employeeNo).toBe('1042');
    expect((await api(app).post(`/api/v1/tasks/${taskId}/comments`).set(auth('noura')).send({ content: 'x' })).status).toBe(404);
    expect((await api(app).post(`/api/v1/tasks/${taskId}/comments`).set(auth('sara')).send({ content: '' })).status).toBe(400);
    expect((await api(app).delete(`/api/v1/tasks/${taskId}/comments/${c.body.id}`).set(auth('reem'))).status).toBe(403); // تراها لكن ليس تعليقها
    const detail = (await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('mgr'))).body;
    expect(detail.comments.map((x: { id: string }) => x.id)).toContain(c.body.id);
    expect(detail.activities[0].type).toBe('comment_added');
    expect((await api(app).delete(`/api/v1/tasks/${taskId}/comments/${c.body.id}`).set(auth('mgr'))).status).toBe(200);
  });

  it('المرفقات: تحقق النوع والمحتوى، ورفع/تنزيل ضمن النطاق فقط، وحذف لصاحبه', async () => {
    const up = (who: string, name: string, content: Buffer, type: string) =>
      api(app).post(`/api/v1/tasks/${taskId}/attachments`).set(auth(who)).attach('file', content, { filename: name, contentType: type });
    expect((await up('sara', 'notes.exe', Buffer.from('MZ...'), 'application/octet-stream')).status).toBe(400); // امتداد ممنوع
    expect((await up('sara', 'fake.pdf', Buffer.from('not a pdf'), 'application/pdf')).status).toBe(400); // توقيع لا يطابق
    expect((await up('noura', 'notes.txt', Buffer.from('hello'), 'text/plain')).status).toBe(404); // خارج النطاق
    const ok = await up('sara', 'نتائج-الاختبار.txt', Buffer.from('نتائج الاختبار: ناجح'), 'text/plain');
    expect(ok.status).toBe(201);
    expect(ok.body.fileName).toBe('نتائج-الاختبار.txt');
    expect(ok.body.mimeType).toBe('text/plain');
    expect(JSON.stringify(ok.body)).not.toMatch(/storedName|\/app\//); // لا تسريب للمسار الداخلي
    const dl = await api(app).get(`/api/v1/tasks/${taskId}/attachments/${ok.body.id}/download`).set(auth('reem'));
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect(dl.text).toBe('نتائج الاختبار: ناجح');
    expect((await api(app).get(`/api/v1/tasks/${taskId}/attachments/${ok.body.id}/download`).set(auth('noura'))).status).toBe(404);
    expect((await api(app).get(`/api/v1/tasks/${taskId}/attachments/${ok.body.id}/download`)).status).toBe(401);
    expect((await api(app).delete(`/api/v1/tasks/${taskId}/attachments/${ok.body.id}`).set(auth('reem'))).status).toBe(403);
    expect((await api(app).delete(`/api/v1/tasks/${taskId}/attachments/${ok.body.id}`).set(auth('sara'))).status).toBe(200);
    const detail = (await api(app).get(`/api/v1/tasks/${taskId}`).set(auth('sara'))).body;
    expect(detail.attachments).toHaveLength(0);
    expect(detail.activities.map((a: { type: string }) => a.type).slice(0, 2)).toEqual(['attachment_deleted', 'attachment_added']);
  });

  it('أحجام المهام: الافتراضي العام 4/16/40، ومدير الإدارة يضبط إدارته فقط', async () => {
    const g = (await api(app).get('/api/v1/tasks/size-presets').set(auth('ceo'))).body;
    expect(g.map((p: { size: string; hours: number }) => [p.size, p.hours])).toEqual([['daily', 4], ['weekly', 16], ['long', 40]]);
    expect((await api(app).put('/api/v1/tasks/size-presets').set(auth('mgr')).send({ presets: [{ size: 'daily', hours: 5 }] })).status).toBe(403); // العام للرئيس فقط
    expect((await api(app).put('/api/v1/tasks/size-presets').set(auth('mgr')).send({ administrationId: cyberId, presets: [{ size: 'daily', hours: 5 }] })).status).toBe(403);
    const set = await api(app).put('/api/v1/tasks/size-presets').set(auth('mgr')).send({ administrationId: systemsId, presets: [{ size: 'daily', hours: 5 }] });
    expect(set.status).toBe(200);
    expect(set.body.find((p: { size: string }) => p.size === 'daily')).toMatchObject({ hours: 5, administrationId: systemsId });
    expect(set.body.find((p: { size: string }) => p.size === 'weekly')).toMatchObject({ hours: 16, administrationId: null });
    // مهمة جديدة في إدارة الأنظمة بحجم daily ⇒ 5 ساعات
    const t = await api(app).post('/api/v1/tasks').set(auth('sup')).send({ title: uniq(), category: 'routine', sizePreset: 'daily' });
    expect(t.status).toBe(201);
    expect(t.body.estimatedHours).toBe(5);
    expect((await api(app).delete(`/api/v1/tasks/${t.body.id}`).set(auth('sup'))).status).toBe(200);
    // إعادة الافتراضي
    expect((await api(app).put('/api/v1/tasks/size-presets').set(auth('mgr')).send({ administrationId: systemsId, presets: [{ size: 'daily', hours: 4 }] })).status).toBe(200);
  });

  it('الإحصاءات والفلاتر ضمن النطاق', async () => {
    const st = (await api(app).get('/api/v1/tasks/stats').set(auth('sara'))).body;
    expect(st.total).toBeGreaterThanOrEqual(1);
    expect(st.mine).toBeGreaterThanOrEqual(1);
    const q = (await api(app).get('/api/v1/tasks').query({ q: 'e2e-task', category: 'adhoc', priority: 'medium' }).set(auth('mgr'))).body;
    expect(q.items.some((t: { id: string }) => t.id === taskId)).toBe(true);
    const bySection = (await api(app).get('/api/v1/tasks').query({ sectionId: supportId, mine: 'true' }).set(auth('sara'))).body;
    expect(bySection.items.every((t: { assignments: { assigneeId: string }[] }) => t.assignments.some((a) => a.assigneeId === users.sara.id))).toBe(true);
    expect((await api(app).get('/api/v1/tasks').query({ state: 'weird' }).set(auth('mgr'))).status).toBe(400);
    expect((await api(app).get('/api/v1/tasks').query({ hack: 1 }).set(auth('mgr'))).status).toBe(400);
  });

  it('التدقيق يسجّل إنشاء المهمة، والحذف (مع الفرعية) للمدير فقط', async () => {
    const audit = await api(app).get('/api/v1/audit').query({ action: 'tasks.create' }).set(auth('ceo'));
    expect(audit.status).toBe(200);
    expect(audit.body.some((a: { entityId: string }) => a.entityId === taskId)).toBe(true);
    expect((await api(app).delete(`/api/v1/tasks/${taskId}`).set(auth('sara'))).status).toBe(403);
    expect((await api(app).delete(`/api/v1/tasks/${taskId}`).set(auth('mgr'))).status).toBe(200);
    expect((await api(app).get(`/api/v1/tasks/${subtaskId}`).set(auth('mgr'))).status).toBe(404);
  });
});
