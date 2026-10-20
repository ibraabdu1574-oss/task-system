import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@task/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Require('users.read')
  list(@CurrentUser() actor: SessionUser, @Query() q: ListUsersDto) {
    return this.users.list(actor, q);
  }

  @Get(':id')
  @Require('users.read')
  get(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @Require('users.manage')
  @Audit({ action: 'users.create', entity: 'User' })
  create(@CurrentUser() actor: SessionUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @Require('users.manage')
  @Audit({ action: 'users.update', entity: 'User' })
  update(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/unlock')
  @Require('users.manage')
  @Audit({ action: 'users.unlock', entity: 'User' })
  unlock(@CurrentUser() actor: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.unlock(actor, id);
  }
}
