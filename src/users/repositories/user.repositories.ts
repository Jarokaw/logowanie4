import { Injectable } from "@nestjs/common";
import { User } from "../models/users.model";
import { InjectModel } from "@nestjs/sequelize";
import { CreateUserDto, EditUserDto } from "../dto/users.dto";
import { Address } from "src/address/address.model";
import { Role } from "src/role/role.model";
import { Op } from "sequelize";


@Injectable()
export class UserRepository {
    constructor(@InjectModel(User) private userModel: typeof User) {
        
    }
    async findAll(): Promise<User[]> {
        return await this.userModel.findAll(
            {
                include: [
                    {
                        model: Address
                    },
                    {
                        model: Role
                    }
                ]
            }
        );
    }
    async findOne(id: string): Promise<User> {
        return await this.userModel.findByPk(id, {
            include: [
                {
                    model: Address
                },
                {
                    model: Role
                }
            ]
        });
    }
    
    async findOneByName(name: string): Promise<User> {
        return await this.userModel.findOne({
            where: {
                name: {
                    [Op.iLike]: name
                }
            },
            include: [
                {
                    model: Address
                },
                {
                    model: Role
                }
            ]
        });
    }

    async create(dto: CreateUserDto): Promise<User> {
        return await this.userModel.create(dto);
    }
    async update(user:User,dto: EditUserDto): Promise<User> {
        user.name = dto.name;
        await user.save();
        return user;
    }
    async delete(user:User): Promise<User> {
        await user.destroy()
        return user;
    }

}
