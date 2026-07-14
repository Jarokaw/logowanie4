import { ApiProperty } from "@nestjs/swagger";
import { UserInterface } from "../interfarce/users.interface";
import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { ReturnAddressDto } from "src/address/address.dto";
import { ReturnRoleDto } from "src/role/role.dto";
import { RoleEnum } from "src/role/role.enum";

export class UsersDto implements UserInterface {
   
    @ApiProperty()
    @IsString()
    @Length(3)  // walidacja długości nazwy użytkownika
    name: string;

    @ApiProperty()
    @IsString()
    password: string;
}   

export class CreateUserDto extends UsersDto {
    @ApiProperty({ enum: RoleEnum, required: false })
    @IsOptional()
    @IsEnum(RoleEnum)
    role?: RoleEnum;
}
export class DeleteUserDto extends UsersDto {}

export class EditUserDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Length(3)
    name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiProperty({ enum: RoleEnum, required: false })
    @IsOptional()
    @IsEnum(RoleEnum)
    role?: RoleEnum;
}

export class ReturnUserDto extends UsersDto {
    @ApiProperty()
    @IsString()
    id: string;
  
    address: ReturnAddressDto;
    role: ReturnRoleDto[];
}


