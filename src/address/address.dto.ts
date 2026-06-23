import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class AddressDto {
    @ApiProperty()
    @IsString()
    city: string;

    @ApiProperty()
    @IsString()
    street: string;

    @ApiProperty()
    @IsString()
    buildingNumber: string;

    @ApiProperty()
    @IsString()
    apartmentNumber: string;

    @ApiProperty()
    @IsString()
    idUser: string;
}

export class CreateAddressDto extends AddressDto {}

export class ReturnAddressDto extends AddressDto {
    @ApiProperty()
    @IsString()
    id: string;
}
export class EditAddressDto {
    @ApiProperty()
    @IsString()
    street: string;

    @ApiProperty()
    @IsString()
    buildingNumber: string;

    @ApiProperty()
    @IsString()
    apartmentNumber: string;

}