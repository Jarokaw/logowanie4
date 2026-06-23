import { ReturnUserDto } from "../dto/users.dto";
import { User } from "../models/users.model";


export class UserMapper {
    static fromDocToDto(doc: User): ReturnUserDto {
        if (!doc) {
            return null;
        }
        const returnUser: ReturnUserDto = {
            id: doc.id,
            name: doc.name,
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