import { Module } from '@nestjs/common';
import { ConfigModule } from '@Nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from './users/users.module';
import { User } from './users/models/users.model';
import { AddressModule } from './address/address.module';
import { Address } from './address/address.model';
import { Role } from './role/role.model';
import { RoleModule } from './role/role/role.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true
  }),
  SequelizeModule.forRoot({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    models: [User, Address, Role], // rejestracja modelu User
    autoLoadModels: true, // automatyczne ładowanie modeli
    synchronize: true, // synchronizacja bazy danych z modelami (nie zalecane w produkcji)
  }),
    UsersModule,
    AddressModule,
  RoleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
