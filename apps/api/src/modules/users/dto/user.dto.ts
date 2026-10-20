import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ROLES, type Role } from '@task/shared';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '1042' }) @IsString() @Matches(/^[A-Za-z0-9._-]{1,40}$/, { message: 'الرقم الوظيفي: حروف وأرقام فقط' })
  employeeNo!: string;

  @ApiProperty() @IsEmail({}, { message: 'بريد غير صالح' }) @MaxLength(200)
  email!: string;

  @ApiProperty({ enum: ROLES }) @IsIn(ROLES as readonly string[])
  role!: Role;

  @ApiPropertyOptional({ description: 'كلمة المرور الابتدائية (محلي فقط)' })
  @IsOptional() @IsString() @MaxLength(200)
  password?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  generalAdminId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  administrationId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({ default: 6 }) @IsOptional() @IsNumber() @Min(0.5) @Max(16)
  dailyCapacityHours?: number;

  @ApiPropertyOptional({ default: [0, 1, 2, 3, 4], description: '0=الأحد … 6=السبت' })
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  workingDays?: number[];
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ListUsersDto {
  @IsOptional() @IsUUID() generalAdminId?: string;
  @IsOptional() @IsUUID() administrationId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsInt() @Min(0) skip?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) take?: number;
}
