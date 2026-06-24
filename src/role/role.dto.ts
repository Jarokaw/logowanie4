import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString } from "class-validator";
import { RoleEnum } from "./role.enum";

export class RoleDto {
    @ApiProperty({ enum: RoleEnum })
    @IsString()
    @IsEnum(RoleEnum)
    role: RoleEnum;

    @ApiProperty()
    @IsString()
    idUser: string;
}
export class CreateRoleDto extends RoleDto {}


export class ReturnRoleDto extends RoleDto {
    @ApiProperty()
    @IsString()
    id: string;
}