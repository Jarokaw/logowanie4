import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Role } from "../role.model";
import { CreateRoleDto } from "../role.dto";



@Injectable()
export class RoleRepository {
    constructor(
        @InjectModel(Role)
        private roleModel: typeof Role
    ) {}
    async findAll(): Promise<Role[]> {
        return await this.roleModel.findAll();
    }
    
    async findOne(id: string): Promise<Role> {
        return await this.roleModel.findByPk(id);
    }

    async createRole(dto: CreateRoleDto): Promise<Role> {
        return await this.roleModel.create(dto);
    }
}