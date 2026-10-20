/**
 * اختبارات تكامل — المصادقة والصلاحيات الهرمية على مستوى الطلب.
 * تعمل على قاعدة بيانات التطوير بعد البذرة (SEED_PASSWORD من البيئة):
 *   task phase 1  (يشغّلها تلقائيًا)   أو   docker compose exec api npm run test:e2e
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const PASSWORD = process.env.SEED_PASSWORD!;
const api = (app: INestApplication) => request(app.getHttpServer());
const uniq = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('المصادقة والصلاحيات (e2e)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const login = async (employeeNo: string) => {
    const res = await api(app).post('/api/v1/auth/login').send({ identifier: employeeNo, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; refreshToken: string; user: { id: string; role: string; administrationId: string } };
  };
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    expect(PASSWORD).toBeTruthy();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    for (const [who, no] of Object.entries({ ceo: '1001', gm: '1002', mgr: '1003', cyberMgr: '1004', fuo: '1015', sup: '1020', emp: '1042' })) {
      tokens[who] = (await login(no)).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ───────── المصادقة ─────────
  describe('المصادقة', () => {
    it('الصحة متاحة بلا مصادقة', async () => {
      const res = await api(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('بيانات خاطئة ⇒ 401 بلا تسريب', async () => {
      const res = await api(app).post('/api/v1/auth/login').send({ identifier: '1042', password: 'wrong-password-123' });
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
    });

    it('جسم ناقص ⇒ 400', async () => {
      const res = await api(app).post('/api/v1/auth/login').send({ identifier: '1042' });
      expect(res.status).toBe(400);
    });

    it('مسار محمي بلا رمز ⇒ 401', async () => {
      expect((await api(app).get('/api/v1/auth/me')).status).toBe(401);
      expect((await api(app).get('/api/v1/org/tree')).status).toBe(401);
    });

    it('/auth/me يعيد الجلسة', async () => {
      const res = await api(app).get('/api/v1/auth/me').set(auth('emp'));
      expect(res.status).toBe(200);
      expect(res.body.employeeNo).toBe('1042');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('تدوير رمز التحديث: القديم يُبطَل ويُكشف إعادة استخدامه', async () => {
      const first = await login('1051');
      const r1 = await api(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
      expect(r1.status).toBe(200);
      expect(r1.body.accessToken).toBeTruthy();
      const reuse = await api(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken });
      expect(reuse.status).toBe(401);
      // بعد كشف إعادة الاستخدام تُبطَل كل الجلسات — حتى الرمز الجديد
      const r2 = await api(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
      expect(r2.status).toBe(401);
    });

    it('القفل بعد 5 محاولات فاشلة', async () => {
      // موظف الموارد البشرية (2001) لا يُستخدم في بقية الاختبارات
      for (let i = 0; i < 5; i++) {
        await api(app).post('/api/v1/auth/login').send({ identifier: '2001', password: 'bad-password-xx1' });
      }
      const locked = await api(app).post('/api/v1/auth/login').send({ identifier: '2001', password: PASSWORD });
      expect(locked.status).toBe(401);
      expect(locked.body.message).toMatch(/مقفل/);
      // الرئيس يفكّ القفل
      const users = await api(app).get('/api/v1/users').query({ q: '2001' }).set(auth('ceo'));
      const id = users.body.items.find((u: { employeeNo: string }) => u.employeeNo === '2001').id;
      expect((await api(app).post(`/api/v1/users/${id}/unlock`).set(auth('ceo'))).status).toBe(201);
      expect((await api(app).post('/api/v1/auth/login').send({ identifier: '2001', password: PASSWORD })).status).toBe(200);
    });

    it('سياسة كلمة المرور تُفرض عند التغيير', async () => {
      const res = await api(app).post('/api/v1/auth/change-password').set(auth('emp')).send({ currentPassword: PASSWORD, newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/السياسة/);
    });

    it('الخروج يُبطل رمز التحديث', async () => {
      const s = await login('1077');
      const out = await api(app).post('/api/v1/auth/logout').set({ Authorization: `Bearer ${s.accessToken}` }).send({ refreshToken: s.refreshToken });
      expect(out.status).toBe(200);
      expect((await api(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
    });
  });

  // ───────── الصلاحيات الهرمية ─────────
  describe('الصلاحيات الهرمية', () => {
    let techId: string;
    let systemsId: string;
    let cyberId: string;

    beforeAll(async () => {
      const tree = await api(app).get('/api/v1/org/tree').set(auth('ceo'));
      expect(tree.status).toBe(200);
      const tech = tree.body.generalAdmins.find((g: { name: string }) => g.name === 'الإدارة العامة للتقنية');
      techId = tech.id;
      systemsId = tech.administrations.find((a: { name: string }) => a.name === 'إدارة الأنظمة').id;
      cyberId = tech.administrations.find((a: { name: string }) => a.name === 'إدارة الأمن السيبراني').id;
    });

    it('شجرة كل دور مقصورة على نطاقه', async () => {
      const ceo = (await api(app).get('/api/v1/org/tree').set(auth('ceo'))).body;
      expect(ceo.generalAdmins.length).toBeGreaterThanOrEqual(3);

      const gm = (await api(app).get('/api/v1/org/tree').set(auth('gm'))).body;
      expect(gm.generalAdmins.map((g: { id: string }) => g.id)).toEqual([techId]);

      const mgr = (await api(app).get('/api/v1/org/tree').set(auth('mgr'))).body;
      expect(mgr.generalAdmins[0].administrations.map((a: { id: string }) => a.id)).toEqual([systemsId]);

      const fuo = (await api(app).get('/api/v1/org/tree').set(auth('fuo'))).body;
      expect(fuo.generalAdmins[0].administrations[0].id).toBe(systemsId);
      expect(fuo.generalAdmins[0].administrations[0].sections.length).toBe(3); // الإدارة كاملة رغم كونه في قسم

      const sup = (await api(app).get('/api/v1/org/tree').set(auth('sup'))).body;
      expect(sup.generalAdmins[0].administrations[0].sections.length).toBe(1);

      const emp = (await api(app).get('/api/v1/org/tree').set(auth('emp'))).body;
      const users = emp.generalAdmins[0].administrations[0].sections[0].users;
      expect(users.length).toBe(1);
      expect(users[0].employeeNo).toBe('1042');
    });

    it('الموظف لا يدير الهيكل ولا يقرأ التدقيق (403)', async () => {
      expect((await api(app).post('/api/v1/org/sections').set(auth('emp')).send({ administrationId: systemsId, name: uniq() })).status).toBe(403);
      expect((await api(app).get('/api/v1/audit').set(auth('emp'))).status).toBe(403);
      expect((await api(app).post('/api/v1/holidays').set(auth('emp')).send({ date: '2030-01-01', name: 'x' })).status).toBe(403);
    });

    it('مدير الإدارة: ينشئ قسمًا في إدارته، لا في إدارة أخرى، ولا يعدّل إدارته نفسها', async () => {
      const mine = await api(app).post('/api/v1/org/sections').set(auth('mgr')).send({ administrationId: systemsId, name: uniq() });
      expect(mine.status).toBe(201);
      const other = await api(app).post('/api/v1/org/sections').set(auth('mgr')).send({ administrationId: cyberId, name: uniq() });
      expect(other.status).toBe(403);
      expect((await api(app).patch(`/api/v1/org/administrations/${systemsId}`).set(auth('mgr')).send({ name: uniq() })).status).toBe(403);
      // تنظيف
      expect((await api(app).delete(`/api/v1/org/sections/${mine.body.id}`).set(auth('mgr'))).status).toBe(200);
    });

    it('المدير العام: ينشئ إدارة في إدارته العامة ويعدّلها، لكن لا يعدّل الإدارة العامة نفسها', async () => {
      const created = await api(app).post('/api/v1/org/administrations').set(auth('gm')).send({ generalAdminId: techId, name: uniq() });
      expect(created.status).toBe(201);
      expect((await api(app).patch(`/api/v1/org/administrations/${created.body.id}`).set(auth('gm')).send({ name: uniq() })).status).toBe(200);
      expect((await api(app).patch(`/api/v1/org/general-admins/${techId}`).set(auth('gm')).send({ name: uniq() })).status).toBe(403);
      expect((await api(app).delete(`/api/v1/org/administrations/${created.body.id}`).set(auth('gm'))).status).toBe(200);
    });

    it('الرئيس التنفيذي: CRUD كامل على إدارة عامة', async () => {
      const name = uniq();
      const c = await api(app).post('/api/v1/org/general-admins').set(auth('ceo')).send({ name });
      expect(c.status).toBe(201);
      expect((await api(app).patch(`/api/v1/org/general-admins/${c.body.id}`).set(auth('ceo')).send({ name: `${name}-2` })).status).toBe(200);
      expect((await api(app).delete(`/api/v1/org/general-admins/${c.body.id}`).set(auth('ceo'))).status).toBe(200);
      // التدقيق سجّل الإنشاء
      const audit = await api(app).get('/api/v1/audit').query({ action: 'org.generalAdmin' }).set(auth('ceo'));
      expect(audit.status).toBe(200);
      expect(audit.body.some((a: { entityId: string }) => a.entityId === c.body.id)).toBe(true);
    });

    it('مسؤول المتابعة: يقرأ موظفي إدارته كلها ولا يدير الهيكل', async () => {
      const list = await api(app).get('/api/v1/users').query({ administrationId: systemsId }).set(auth('fuo'));
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThanOrEqual(7);
      expect((await api(app).post('/api/v1/org/sections').set(auth('fuo')).send({ administrationId: systemsId, name: uniq() })).status).toBe(403);
    });

    it('المشرف: يرى قسمه فقط، ومدير إدارة أخرى لا يرى موظفي الأنظمة', async () => {
      const supList = await api(app).get('/api/v1/users').set(auth('sup'));
      expect(supList.body.items.every((u: { sectionId: string }) => u.sectionId === supList.body.items[0].sectionId)).toBe(true);
      const cyberList = await api(app).get('/api/v1/users').set(auth('cyberMgr'));
      expect(cyberList.body.items.every((u: { administrationId: string }) => u.administrationId === cyberId)).toBe(true);
      const sara = (await api(app).get('/api/v1/users').query({ q: '1042' }).set(auth('ceo'))).body.items[0];
      expect((await api(app).get(`/api/v1/users/${sara.id}`).set(auth('cyberMgr'))).status).toBe(403);
      expect((await api(app).get(`/api/v1/users/${sara.id}`).set(auth('sup'))).status).toBe(200);
    });

    it('الإجازات: الموظف يدير إجازاته فقط، والمشرف إجازات قسمه', async () => {
      const own = await api(app).post('/api/v1/leaves').set(auth('emp')).send({ startAt: '2031-01-05', endAt: '2031-01-07', reason: 'e2e' });
      expect(own.status).toBe(201);
      const fahad = (await api(app).get('/api/v1/users').query({ q: '1051' }).set(auth('ceo'))).body.items[0];
      expect((await api(app).post('/api/v1/leaves').set(auth('emp')).send({ userId: fahad.id, startAt: '2031-02-01', endAt: '2031-02-02' })).status).toBe(403);
      const bySup = await api(app).post('/api/v1/leaves').set(auth('sup')).send({ userId: fahad.id, startAt: '2031-02-01', endAt: '2031-02-02' });
      expect(bySup.status).toBe(201);
      expect((await api(app).delete(`/api/v1/leaves/${own.body.id}`).set(auth('emp'))).status).toBe(200);
      expect((await api(app).delete(`/api/v1/leaves/${bySup.body.id}`).set(auth('sup'))).status).toBe(200);
    });

    it('حقول غير معروفة تُرفض (whitelist)', async () => {
      const res = await api(app).post('/api/v1/org/sections').set(auth('ceo')).send({ administrationId: systemsId, name: uniq(), isAdmin: true });
      expect(res.status).toBe(400);
    });
  });
});
