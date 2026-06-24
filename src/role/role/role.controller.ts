import { Controller, Get } from '@nestjs/common';
import { ReturnRoleDto } from '../role.dto';
import { RoleService } from './role.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('Role')
@ApiTags('Role API')
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    @ApiResponse({
        status: 201,
        type: ReturnRoleDto
    })
    async findAll():Promise<ReturnRoleDto[]> {
        return await this.roleService.findAll();
    }
}
