import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-09-23' }) @IsDateString({ strict: true })
  date!: string;
  @ApiProperty({ example: 'اليوم الوطني' }) @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
}
export class UpdateHolidayDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true })
  date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
}
export class HolidayQueryDto {
  @ApiPropertyOptional({ example: 2026 }) @IsOptional() @IsInt() @Min(2000) @Max(2100)
  year?: number;
}

export class CreateLeaveDto {
  @ApiPropertyOptional({ description: 'افتراضيًا المستخدم الحالي' }) @IsOptional() @IsUUID()
  userId?: string;
  @ApiProperty({ example: '2026-11-01' }) @IsDateString({ strict: true })
  startAt!: string;
  @ApiProperty({ example: '2026-11-05' }) @IsDateString({ strict: true })
  endAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
export class UpdateLeaveDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true })
  startAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true })
  endAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
export class LeaveQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
}
