import { Module } from '@nestjs/common';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Address } from './address.model';
import { AddressRepository } from './address.repository';

@Module({
  imports: [SequelizeModule.forFeature([Address])],
  controllers: [AddressController],
  providers: [AddressService, AddressRepository]
})
export class AddressModule {}
