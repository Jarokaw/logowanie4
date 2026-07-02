import { AddressMapper } from "src/address/address.mapper";
import { ReturnUserDto } from "../dto/users.dto";
import { User } from "../models/users.model";
import { RoleMapper } from "src/role/mappers/role.mapper";



export class UserMapper {
    static fromDocToDto(doc: User): ReturnUserDto {
        if (!doc) {
            return null;
        }
        const returnUser: ReturnUserDto = {
            id: doc.id,
            name: doc.name,
            address: AddressMapper.fromDocToDto(doc.address),
            role: RoleMapper.fromDocToList(doc.role),
            password: doc.password
        };
        return returnUser;
    }

    static fromDoctoDtoList(docs: User[]): ReturnUserDto[] {
        if (!docs || (docs.length && docs.every(d => !d.id))) {
            return null;
        }
        return docs.map((doc:User) => UserMapper.fromDocToDto(doc));
        }


    }