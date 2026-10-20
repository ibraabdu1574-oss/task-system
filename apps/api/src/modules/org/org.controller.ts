import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@task/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import {
  AssignDto, CreateAdministrationDto, CreateGeneralAdminDto, CreateSectionDto, UpdateAdministrationDto, UpdateGeneralAdminDto, UpdateSectionDto,
} from './dto/org.dto';
import { OrgService } from './org.service';

@ApiTags('org')
@ApiBearerAuth()
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('tree')
  @Require('org.read')
  @ApiOperation({ summary: 'شجرة الهيكل ضمن نطاق الفاعل' })
  tree(@CurrentUser() actor: SessionUser) {
    return this.org.tree(actor);
  }

  // ── الإدارات العامة ──
  @Get('general-admins') @Require('org.read')
  listGeneralAdmins(@CurrentUser() actor: SessionUser) { return this.org.listGeneralAdmins(actor); }

  @Post('general-admins') @Require('org.manage') @Audit({ action: 'org.generalAdmin.create', entity: 'GeneralAdministration' })
  createGa(@CurrentUser() actor: SessionUser, @Body() dto: CreateGeneralAdminDto) { return this.org.createGeneralAdmin(actor, dto); }

  @Patch('general-admins/:id') @Require('org.manage') @Audit({ action: 'org.generalAdmin.update', entity: 'GeneralAdministration' })
  updateGa(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGeneralAdminDto) { return this.org.updateGeneralAdmin(actor, id, dto); }

  @Delete('general-admins/:id') @Require('org.manage') @Audit({ action: 'org.generalAdmin.delete', entity: 'GeneralAdministration' })
  deleteGa(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) { return this.org.deleteGeneralAdmin(actor, id); }

  @Put('general-admins/:id/manager') @Require('org.manage') @Audit({ action: 'org.generalAdmin.assignManager', entity: 'GeneralAdministration' })
  assignGaManager(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) { return this.org.assignGaManager(actor, id, dto); }

  // ── الإدارات ──
  @Post('administrations') @Require('org.manage') @Audit({ action: 'org.administration.create', entity: 'Administration' })
  createAdmin(@CurrentUser() actor: SessionUser, @Body() dto: CreateAdministrationDto) { return this.org.createAdministration(actor, dto); }

  @Patch('administrations/:id') @Require('org.manage') @Audit({ action: 'org.administration.update', entity: 'Administration' })
  updateAdmin(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdministrationDto) { return this.org.updateAdministration(actor, id, dto); }

  @Delete('administrations/:id') @Require('org.manage') @Audit({ action: 'org.administration.delete', entity: 'Administration' })
  deleteAdmin(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) { return this.org.deleteAdministration(actor, id); }

  @Put('administrations/:id/manager') @Require('org.manage') @Audit({ action: 'org.administration.assignManager', entity: 'Administration' })
  assignAdminManager(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) { return this.org.assignAdminManager(actor, id, dto); }

  // ── الأقسام ──
  @Post('sections') @Require('org.manage') @Audit({ action: 'org.section.create', entity: 'Section' })
  createSection(@CurrentUser() actor: SessionUser, @Body() dto: CreateSectionDto) { return this.org.createSection(actor, dto); }

  @Patch('sections/:id') @Require('org.manage') @Audit({ action: 'org.section.update', entity: 'Section' })
  updateSection(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) { return this.org.updateSection(actor, id, dto); }

  @Delete('sections/:id') @Require('org.manage') @Audit({ action: 'org.section.delete', entity: 'Section' })
  deleteSection(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) { return this.org.deleteSection(actor, id); }

  @Put('sections/:id/supervisor') @Require('org.manage') @Audit({ action: 'org.section.assignSupervisor', entity: 'Section' })
  assignSupervisor(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) { return this.org.assignSupervisor(actor, id, dto); }
}
