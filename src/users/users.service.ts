import { Injectable } from '@nestjs/common';
import { UserInterface } from './interfarce/users.interface';
import { CreateUserDto, DeleteUserDto, EditUserDto, ReturnUserDto, UsersDto } from './dto/users.dto';
import { UserNameToShortException, UserNotFoundException } from './errors/users.exception';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './models/users.model';
import { UserRepository } from './repositories/user.repositories';

@Injectable()
export class UsersService {
    constructor(private readonly userRepository: UserRepository) {}
    
    async findAll(): Promise<ReturnUserDto[]> {
        try {
            const users: User[] = await this.userRepository.findAll();
            return users;
        }
         catch (error) {
        }
    }
    async findOne(id: string):Promise<ReturnUserDto> {
        try {
            const user = await this.userRepository.findOne(id);
            return user;
        } catch(error) {
            throw error;
        }
    }
    async createUser(dto: CreateUserDto):Promise<ReturnUserDto> {
        try {
            const user = await this.userRepository.create(dto);
            return user;
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
            user.name = dto.name;
            await user.save();
            return user;
        } catch(error) {
            throw error;
        }
    }
}
