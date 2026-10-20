import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@task/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { CapacityService } from './capacity.service';
import { CreateHolidayDto, CreateLeaveDto, HolidayQueryDto, LeaveQueryDto, UpdateHolidayDto, UpdateLeaveDto } from './dto/capacity.dto';

@ApiTags('capacity')
@ApiBearerAuth()
@Controller()
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  // ── العطل الرسمية ──
  @Get('holidays') @Require('holidays.read')
  listHolidays(@Query() q: HolidayQueryDto) { return this.capacity.listHolidays(q); }

  @Post('holidays') @Require('holidays.manage') @Audit({ action: 'holidays.create', entity: 'Holiday' })
  createHoliday(@Body() dto: CreateHolidayDto) { return this.capacity.createHoliday(dto); }

  @Patch('holidays/:id') @Require('holidays.manage') @Audit({ action: 'holidays.update', entity: 'Holiday' })
  updateHoliday(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHolidayDto) { return this.capacity.updateHoliday(id, dto); }

  @Delete('holidays/:id') @Require('holidays.manage') @Audit({ action: 'holidays.delete', entity: 'Holiday' })
  deleteHoliday(@Param('id', ParseUUIDPipe) id: string) { return this.capacity.deleteHoliday(id); }

  // ── الإجازات ──
  @Get('leaves') @Require('leaves.read')
  listLeaves(@CurrentUser() actor: SessionUser, @Query() q: LeaveQueryDto) { return this.capacity.listLeaves(actor, q); }

  @Post('leaves') @Require('leaves.manage') @Audit({ action: 'leaves.create', entity: 'Leave' })
  createLeave(@CurrentUser() actor: SessionUser, @Body() dto: CreateLeaveDto) { return this.capacity.createLeave(actor, dto); }

  @Patch('leaves/:id') @Require('leaves.manage') @Audit({ action: 'leaves.update', entity: 'Leave' })
  updateLeave(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveDto) { return this.capacity.updateLeave(actor, id, dto); }

  @Delete('leaves/:id') @Require('leaves.manage') @Audit({ action: 'leaves.delete', entity: 'Leave' })
  deleteLeave(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) { return this.capacity.deleteLeave(actor, id); }
}
