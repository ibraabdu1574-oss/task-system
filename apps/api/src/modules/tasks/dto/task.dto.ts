import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import {
  ASSIGNEE_TYPES, SIZE_PRESETS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATES,
  type AssigneeType, type SizePreset, type TaskCategory, type TaskPriority, type TaskState,
} from '@task/shared';

/** يحوّل 'true'/'1' إلى true و'false'/'0' إلى false (التحويل الضمني يجعل 'false' صحيحة) */
const toBool = () => Transform(({ value }: { value: unknown }) => (value === true || value === 'true' || value === '1' ? true : value === false || value === 'false' || value === '0' ? false : value));

export class AssignmentInputDto {
  @ApiProperty({ enum: ASSIGNEE_TYPES }) @IsIn(ASSIGNEE_TYPES as readonly string[])
  assigneeType!: AssigneeType;
  @ApiProperty() @IsUUID()
  assigneeId!: string;
}

export class CreateTaskDto {
  @ApiProperty({ example: 'مراجعة صلاحيات نظام المشتريات' }) @IsString() @IsNotEmpty() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: TASK_CATEGORIES }) @IsIn(TASK_CATEGORIES as readonly string[])
  category!: TaskCategory;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, default: 'medium' }) @IsOptional() @IsIn(TASK_PRIORITIES as readonly string[])
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @IsDateString({ strict: true })
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: SIZE_PRESETS, description: 'الحجم — يُشتق منه estimatedHours إن لم يُحدَّد' })
  @IsOptional() @IsIn(SIZE_PRESETS as readonly string[])
  sizePreset?: SizePreset | null;

  @ApiPropertyOptional({ description: 'تجاوز يدوي لساعات التقدير' }) @IsOptional() @IsNumber() @Min(0.25) @Max(2000)
  estimatedHours?: number | null;

  @ApiPropertyOptional({ description: 'مهمة فرعية من هذه المهمة (مستوى واحد)' }) @IsOptional() @IsUUID()
  parentTaskId?: string;

  @ApiPropertyOptional({ type: [AssignmentInputDto], description: 'الإسناد الابتدائي (الموظف: نفسه فقط)' })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AssignmentInputDto)
  assignments?: AssignmentInputDto[];

  // ── موقع المهمة في الشجرة (اختياري؛ الافتراضي موقع المنشئ، ويجب أن يبقى داخل نطاقه) ──
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  generalAdminId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  administrationId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  sectionId?: string | null;
}

/** تعديل بيانات المهمة — بلا الإسناد والموقع والأم (لها مساراتها) */
export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string | null;
  @ApiPropertyOptional({ enum: TASK_CATEGORIES }) @IsOptional() @IsIn(TASK_CATEGORIES as readonly string[])
  category?: TaskCategory;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES as readonly string[])
  priority?: TaskPriority;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString({ strict: true })
  dueDate?: string | null;
  @ApiPropertyOptional({ enum: SIZE_PRESETS, nullable: true }) @IsOptional() @IsIn(SIZE_PRESETS as readonly string[])
  sizePreset?: SizePreset | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0.25) @Max(2000)
  estimatedHours?: number | null;
}

export class ChangeStateDto {
  @ApiProperty({ enum: TASK_STATES }) @IsIn(TASK_STATES as readonly string[])
  state!: TaskState;
}

export class AssignDto {
  @ApiProperty({ type: [AssignmentInputDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AssignmentInputDto)
  assignments!: AssignmentInputDto[];
}

export class CreateCommentDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(5000)
  content!: string;
}

export class ListTasksDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(TASK_STATES as readonly string[]) state?: TaskState;
  @IsOptional() @IsIn(TASK_CATEGORIES as readonly string[]) category?: TaskCategory;
  @IsOptional() @IsIn(TASK_PRIORITIES as readonly string[]) priority?: TaskPriority;
  /** المسندة إلى هذا الموظف مباشرةً */
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsUUID() administrationId?: string;
  @IsOptional() @IsUUID() generalAdminId?: string;
  @IsOptional() @IsUUID() parentTaskId?: string;
  /** المتأخرة فقط (موعدها فات ولم تكتمل) */
  @IsOptional() @toBool() @IsBoolean() overdue?: boolean;
  /** المسندة إليّ مباشرةً فقط */
  @IsOptional() @toBool() @IsBoolean() mine?: boolean;
  /** المهام الرئيسية فقط (بلا فرعية) — الافتراضي true */
  @IsOptional() @toBool() @IsBoolean() top?: boolean;
  @IsOptional() @IsInt() @Min(0) skip?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) take?: number;
}

export class SizePresetsQueryDto {
  @ApiPropertyOptional({ description: 'الإدارة — بدونها يعود الافتراضي العام' }) @IsOptional() @IsUUID()
  administrationId?: string;
}

export class SizePresetRowDto {
  @ApiProperty({ enum: SIZE_PRESETS }) @IsIn(SIZE_PRESETS as readonly string[])
  size!: SizePreset;
  @ApiProperty({ example: 16 }) @IsNumber() @Min(0.25) @Max(2000)
  hours!: number;
}

export class UpsertSizePresetsDto {
  @ApiPropertyOptional({ description: 'الإدارة — null/غياب = الافتراضي العام (الرئيس التنفيذي فقط)' }) @IsOptional() @IsUUID()
  administrationId?: string | null;
  @ApiProperty({ type: [SizePresetRowDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SizePresetRowDto)
  presets!: SizePresetRowDto[];
}
