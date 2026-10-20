import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGeneralAdminDto {
  @ApiProperty({ example: 'الإدارة العامة للتقنية' }) @IsString() @IsNotEmpty() @MaxLength(150)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  managerId?: string | null;
}
export class UpdateGeneralAdminDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  name?: string;
}

export class CreateAdministrationDto {
  @ApiProperty() @IsUUID()
  generalAdminId!: string;
  @ApiProperty({ example: 'إدارة الأنظمة' }) @IsString() @IsNotEmpty() @MaxLength(150)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  managerId?: string | null;
}
export class UpdateAdministrationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  name?: string;
}

export class CreateSectionDto {
  @ApiProperty() @IsUUID()
  administrationId!: string;
  @ApiProperty({ example: 'الدعم الفني' }) @IsString() @IsNotEmpty() @MaxLength(150)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  supervisorId?: string | null;
}
export class UpdateSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)
  name?: string;
}

/** تعيين مدير/مشرف — userId فارغ = إزالة التعيين */
export class AssignDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID()
  userId?: string | null;
}
