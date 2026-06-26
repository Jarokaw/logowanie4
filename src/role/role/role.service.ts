import { Injectable } from '@nestjs/common';
import { RoleRepository } from '../repositories/role.repository';
import { CreateRoleDto, EditRoleDto, ReturnRoleDto } from '../role.dto';
import { Role } from '../role.model';
import { RoleMapper } from '../mappers/role.mapper';
import { UserNotFoundException } from 'src/users/errors/users.exception';

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
    async updateRole(id: string, dto: EditRoleDto): Promise<ReturnRoleDto> {
        try {
            const doc: Role = await this.roleRepository.findOne(id);
            if (!doc) {
                throw new UserNotFoundException(id);
            }
            doc.role = dto.role;
            await doc.save();
            return doc;
            return RoleMapper.fromDocToDto(dto);
        } catch(error) {
            console.log(error);
            throw error;
        }
    }
}
