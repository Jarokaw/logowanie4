import { Module } from '@nestjs/common';
import { Role } from '../role.model';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { RoleRepository } from '../repositories/role.repository';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [SequelizeModule.forFeature([Role])],
  controllers: [RoleController],
  providers: [RoleService, RoleRepository],
})
export class RoleModule {}

