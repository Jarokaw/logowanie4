import { Injectable } from '@nestjs/common';
import { UserInterface } from './interfarce/users.interface';
import { CreateUserDto, DeleteUserDto, EditUserDto, ReturnUserDto, UsersDto } from './dto/users.dto';
import { UserNameToShortException, UserNotFoundException } from './errors/users.exception';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './models/users.model';
import { UserRepository } from './repositories/user.repositories';
import { UserMapper } from './mappers/user.mapper';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/role/role.model';

@Injectable()
export class UsersService {
    constructor(
        private readonly userRepository: UserRepository,
        @InjectModel(Role) private readonly roleRepository: typeof Role
    ) {}
    
    async findAll(): Promise<ReturnUserDto[]> {
        try {
            const users: User[] = await this.userRepository.findAll();
            return UserMapper.fromDoctoDtoList(users);
        }
         catch (error) {
        }
    }
    async findOne(id: string):Promise<ReturnUserDto> {
        try {
            const user = await this.userRepository.findOne(id);           
            console.log(user);
            return UserMapper.fromDocToDto(user);
        } catch(error) {
            throw error;
        }
    }
    async findOneByName(name: string):Promise<ReturnUserDto> {
        try {
            const user = await this.userRepository.findOneByName(name);
            if (!user) {
                throw new UserNotFoundException(name);
            }
            return UserMapper.fromDocToDto(user);
        } catch(error){
            console.log(error);
            throw error
        }
    }

    

    async createUser(dto: CreateUserDto):Promise<ReturnUserDto> {
        try {
            const { role, ...userDto } = dto;
            const hashed = await bcrypt.hash(dto.password, 10);
            const user = await this.userRepository.create({ ...userDto, password: hashed });
            if (role) {
                await this.roleRepository.create({ role, idUser: user.id });
            }
            return this.findOne(user.id);
        } catch (error) {
            throw error;
        }

    }
    async createUserWithModel(dto: CreateUserDto):Promise<User> {
        try {
            const user = await this.userRepository.create(dto);
            return user;
        } catch (error) {
            throw error;
        }

    }
    async deleteUser(id: string):Promise<ReturnUserDto> { 
        try {
            const user = await this.userRepository.findOne(id);
            if (!user) {
                throw new UserNotFoundException(id);
            }
            await user.destroy();
            return user;
        } catch (error) {
            throw error;    
        }
    }
    async editUser(id: string, dto: EditUserDto):Promise<ReturnUserDto> {
        try {
            const user = await this.userRepository.findOne(id);
            if (!user) {
                throw new UserNotFoundException(id);
            }
            if (dto.name !== undefined) {
                user.name = dto.name;
            }
            if (dto.password) {
                user.password = await bcrypt.hash(dto.password, 10);
            }
            await user.save();
            if (dto.role) {
                const [role] = user.role ?? [];
                if (role) {
                    role.role = dto.role;
                    await role.save();
                } else {
                    await this.roleRepository.create({ role: dto.role, idUser: user.id });
                }
            }
            return this.findOne(id);
        } catch(error) {
            throw error;
        }
    }
}
