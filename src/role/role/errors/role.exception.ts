import { NotFoundException } from "@nestjs/common";

export class RoleFoundException extends NotFoundException {
    constructor(id: string) {
        super(`Role with ID ${id} not found!`);
    }
}