import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AttachmentsService } from './attachments.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/** المرحلة 2 — المهام: CRUD ضمن النطاق + إسناد متعدد + فرعية + تعليقات + مرفقات + سجل نشاط */
@Module({
  imports: [UsersModule],
  controllers: [TasksController],
  providers: [TasksService, AttachmentsService],
  exports: [TasksService],
})
export class TasksModule {}
