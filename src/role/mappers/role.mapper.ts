import { ReturnRoleDto } from "../role.dto";
import { Role } from "../role.model";

export class RoleMapper {
    static fromDocToDto(doc: Partial<Role>): ReturnRoleDto {
        if (!doc) {
            return null;
        }
        const returnUser: ReturnRoleDto = {
            id: doc.id,
            role: doc.role,
            idUser: doc.idUser
        };
        return returnUser;
    }

    static fromDocToList(docs:Role[]): ReturnRoleDto[] {
        if (!docs || docs.length && docs.every(d => !d.id)) {
            return null;
        }
        return docs.map((doc: Role) => RoleMapper.fromDocToDto(doc));
    }
}