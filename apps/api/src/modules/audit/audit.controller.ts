import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Require } from '../../common/decorators/require.decorator';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsOptional() @IsInt() @Min(0) skip?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) take?: number;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() action?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** سجل التدقيق — للرئيس التنفيذي فقط في المرحلة 1 */
  @Get()
  @Require('audit.read')
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
