import { ApiProperty } from "@nestjs/swagger";
import { UserInterface } from "../interfarce/users.interface";
import { IsString, Length } from "class-validator";
import { ReturnAddressDto } from "src/address/address.dto";
import { ReturnRoleDto } from "src/role/role.dto";

export class UsersDto implements UserInterface {
   
    @ApiProperty()
    @IsString()
    @Length(3)  // walidacja długości nazwy użytkownika
    name: string;
}   

export class CreateUserDto extends UsersDto {}
export class DeleteUserDto extends UsersDto {}

export class EditUserDto {
    @ApiProperty()
    @IsString()
    name: string;
}

export class ReturnUserDto  {
    @ApiProperty()
    @IsString()
    id: string;
    @ApiProperty()
    @IsString()
    name: string;
    address: ReturnAddressDto;
    role: ReturnRoleDto[];
}