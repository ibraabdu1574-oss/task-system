import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';

@Module({
  imports: [UsersModule],
  controllers: [CapacityController],
  providers: [CapacityService],
})
export class CapacityModule {}
