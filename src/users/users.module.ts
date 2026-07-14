import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './models/users.model';
import { UserRepository } from './repositories/user.repositories';
import { Role } from 'src/role/role.model';

@Module({
  imports: [
     SequelizeModule.forFeature([User, Role]),
   ],
  controllers: [UsersController],
  providers: [UsersService,UserRepository],
  exports: [UsersService],
})
export class UsersModule {}
