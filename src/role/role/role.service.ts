import { Injectable } from '@nestjs/common';
import { RoleRepository } from '../repositories/role.repository';
import { ReturnRoleDto } from '../role.dto';
import { Role } from '../role.model';
import { RoleMapper } from '../mappers/role.mapper';

@Injectable()
export class RoleService {
    constructor(private readonly roleRepository: RoleRepository) {}

    async findAll(): Promise<ReturnRoleDto[]> {
        try {
            const roles: Role[] = await this.roleRepository.findAll();
            return RoleMapper.fromDocToList(roles);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
}
