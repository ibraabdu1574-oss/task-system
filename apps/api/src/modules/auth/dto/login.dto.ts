import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'الرقم الوظيفي أو البريد', example: '1003' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  identifier!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ required: false, description: 'رمز التحديث لإبطاله؛ بدونه تُبطَل كل جلسات المستخدم' })
  @IsOptional() @IsString() @IsNotEmpty()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200)
  currentPassword!: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200)
  newPassword!: string;
}
