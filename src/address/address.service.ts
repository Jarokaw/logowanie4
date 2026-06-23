import { Injectable } from '@nestjs/common';
import { CreateAddressDto, EditAddressDto, ReturnAddressDto } from './address.dto';
import { AddressRepository } from './address.repository';
import { AddressMapper } from './address.mapper';
import { Address } from './address.model';


@Injectable()
export class AddressService {    
    constructor(private readonly addressRepository:AddressRepository) {}

    async findAll(): Promise<ReturnAddressDto[]> {
        try {
            const address: Address[] =  await this.addressRepository.findAll();            
            return AddressMapper.fromDocToList(address);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
    async findOne(id: string): Promise<ReturnAddressDto> {
        try {
            const address: Address = await this.addressRepository.findOne(id);
            return AddressMapper.fromDocToDto(address);
        } catch(error) {
            console.log(error);

        }
    }
    async createAddress(dto: CreateAddressDto): Promise<ReturnAddressDto> {
        try {
            const doc: Address = await this.addressRepository.create(dto);
            return AddressMapper.fromDocToDto(doc);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
    async updateAddress(id: string, dto: EditAddressDto): Promise<ReturnAddressDto> {
        try {
            const address: Address = await this.addressRepository.updateAddress(id,dto);
            return AddressMapper.fromDocToDto(address);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
}
