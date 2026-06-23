import { BadRequestException, NotFoundException } from "@nestjs/common";

export class UserNotFoundException extends NotFoundException {
    constructor(id: string) {
        super(`User with id ${id} not found`);
    }
}
export class UserNameToShortException extends BadRequestException {
    constructor(message = 'invalid user data') {
        super(message);
    }
}