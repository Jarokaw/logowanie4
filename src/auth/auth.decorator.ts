import { applyDecorators, UseGuards } from "@nestjs/common";
import { JWTAuthGuard } from "./auth.guard";


export function Auth() {
    return applyDecorators(
        UseGuards(JWTAuthGuard));
}