import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateRoleDto, EditRoleDto, ReturnRoleDto } from '../role.dto';
import { RoleService } from './role.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/auth.decorator';


@Controller('Role')
@ApiTags('Role API')
@ApiBearerAuth('JWT-auth')
@Auth()
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

    @Patch('/:id')
    @ApiOperation({
        summary: 'Change role'
    })
    @ApiResponse({
        status: 201,
        type: ReturnRoleDto
    })
    async updateRole(@Param('id') id: string, @Body() dto: EditRoleDto): Promise<ReturnRoleDto> {
        return await this.roleService.updateRole(id, dto);
    }



    
}
