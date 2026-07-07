import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from 'src/users/users.service';
import { LoginDto, RefreshTokenDto } from './auth.dto';
import { ReturnUserDto } from 'src/users/dto/users.dto';

@Injectable()
export class AuthService {    
    constructor(
         private readonly userService: UsersService,
        private readonly jwtService: JwtService
    ) {}

    async validateUser(name: string, password: string): Promise<ReturnUserDto> {
        const user = await this.userService.findOneByName(name);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        const match = await bcrypt.compare(password, user.password);
        if (!match) throw new UnauthorizedException('Invalid credentials');        
        return user;
    }

    async login(dto: LoginDto) {
        const user: ReturnUserDto = await this.validateUser(dto.name, dto.password);        
        const payload = { sub: user.id, name: user.name }                   
        return {
            accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
            refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' })
        };
    };




    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.userService.findOneByName(payload.name);
            if (!user) throw new UnauthorizedException('User not found');

            const newPayload = { sub: user.id, name: user.name }
            return {
                accessToken: this.jwtService.sign(newPayload, { expiresIn: '15m' })                
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }
}

