import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Address } from "./address.model";
import { AddressNotFoundException } from "./address.exception";
import { CreateAddressDto, EditAddressDto, ReturnAddressDto } from "./address.dto";
import { AddressModule } from "./address.module";


@Injectable()
export class AddressRepository {
    constructor(
        @InjectModel(Address) private addressModel: typeof Address
    ) {}
    async findAll(): Promise<Address[]> {
        return await this.addressModel.findAll();
    }
    async findOne(id: string): Promise<Address> {
        return await this.addressModel.findByPk(id);
    }
    async create(dto: CreateAddressDto): Promise<Address> {
        console.log(dto);
        return await this.addressModel.create(dto);
    }
    async updateAddress(id:string, dto: EditAddressDto): Promise<Address> {
        const [rowsCount, [updateAddress]] = await this.addressModel.update(
            {...dto},
            {where: { id }, 
            returning: true
            }
        );
        if (rowsCount ===0) {
            throw new AddressNotFoundException(id);
        }
        return updateAddress;
    }
}