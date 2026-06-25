import { Injectable } from '@nestjs/common';
import { RoleRepository } from '../repositories/role.repository';
import { CreateRoleDto, ReturnRoleDto } from '../role.dto';
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

    async findOne(id: string): Promise<ReturnRoleDto> {
        try {
            const role: Role = await this.roleRepository.findOne(id);
            return RoleMapper.fromDocToDto(role);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }

    async createRole(dto: CreateRoleDto): Promise<ReturnRoleDto> {
        try {
            const doc: Role = await this.roleRepository.createRole(dto);
            return RoleMapper.fromDocToDto(doc);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
}
