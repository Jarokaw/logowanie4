import { Body, Controller, Delete, Get, Param, Patch, Post,Put } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserInterface } from './interfarce/users.interface';
import { CreateUserDto, DeleteUserDto, EditUserDto, ReturnUserDto, UsersDto } from './dto/users.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/auth.decorator';

@Controller('users')
@ApiTags('Users API')
@ApiBearerAuth('JWT-auth')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    @Auth()
    @ApiOperation({ summary: 'Get all users ' })
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Return all users.'})
    async findAll(): Promise<ReturnUserDto[]> {
        return await this.usersService.findAll();
    }
    @Get('/:id')
    @ApiOperation({summary: 'Get user by id '})
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Return user by id.'})
    async findOne(@Param('id')id: string): Promise<ReturnUserDto> {
        return this.usersService.findOne(id);
    }
    @Post('create')
    @ApiOperation({summary: 'Create user '})
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Create user.'})  
         createUser(@Body() dto: CreateUserDto ): Promise<ReturnUserDto> {
            return this.usersService.createUser(dto);
         }
    @Delete('/:id')
    @ApiOperation({summary: 'Delete user by id '})
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Delete user by id.'})  
         deleteUser(@Param('id') id: string): Promise<ReturnUserDto> {
            return this.usersService.deleteUser(id);
         }
    @Put('/:id')
    @ApiOperation({summary: 'Update user by id '})
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Update user by id.'})  
         editUser(@Param('id') id: string, @Body() dto: EditUserDto): Promise<ReturnUserDto> {
            return this.usersService.editUser(id,dto);
         }
         @Patch('/:id')
    @ApiOperation({summary: 'Update user by id '})
    @ApiResponse({ status: 201,
        type: ReturnUserDto,
         description: 'Update user by id.'})  
         editUserPatch(@Param('id') id: string, @Body() dto: EditUserDto): Promise<ReturnUserDto> {
            return this.usersService.editUser(id,dto);
         }

}

