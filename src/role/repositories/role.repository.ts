import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Role } from "../role.model";

@Injectable()
export class RoleRepository {
    constructor(
        @InjectModel(Role)
        private roleModel: typeof Role
    ) {}
    async findAll(): Promise<Role[]> {
        return await this.roleModel.findAll();
    }
}