import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateRoleDto, ReturnRoleDto } from '../role.dto';
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
    
    @Get(':id')
    @ApiResponse({
        status: 201,
        type: ReturnRoleDto
    })
    async findOne(@Param('id') id: string): Promise<ReturnRoleDto> {
        return await this.roleService.findOne(id);
    }

    @Post('create')
    @ApiOperation({
        summary: 'Create new Role from user'
    })
    @ApiResponse({
        status: 201,
        type: ReturnRoleDto
    })
    async createRole(@Body() dto: CreateRoleDto): Promise<ReturnRoleDto> {
        return await this.roleService.createRole(dto);
    }


    
}
