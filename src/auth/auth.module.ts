import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from 'src/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { Module } from '@nestjs/common';

@Module({
    imports: [
        UsersModule,
        JwtModule.register({
            secret: 'TAJNY_KLUICZ', // process.env.JWT_SECRET,
            signOptions: { expiresIn: '1h' }
        }),
        PassportModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    exports: [AuthService]
})
export class AuthModule {}
