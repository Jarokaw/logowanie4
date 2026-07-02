import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
    @ApiProperty()
    name: string;

    @ApiProperty()
    password: string;
}

export class AuthResponseDto {
    @ApiProperty()
    accessToken: string;

    @ApiProperty()
    refreshToken: string;
}

export class RefreshTokenDto {
    @ApiProperty()
    refreshToken: string;
}
