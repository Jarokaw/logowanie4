import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateAddressDto, EditAddressDto, ReturnAddressDto } from './address.dto';
import { AddressService } from './address.service';

@Controller('address')
@ApiTags('Address API')
export class AddressController {
    constructor(private readonly addressService:AddressService) {}

    @Get()
    @ApiOperation({
        summary: 'Get all address from DB'
    })
    @ApiResponse({
        status: 201,
        type: ReturnAddressDto
    })
    async findAll(): Promise<ReturnAddressDto[]> {
        return await this.addressService.findAll();
    }

    @Get(':id')
    @ApiResponse({
        status: 201,
        type: ReturnAddressDto
    })
    async findOne(@Param('id') id: string): Promise<ReturnAddressDto> {
        return await this.addressService.findOne(id);
    }

    @Post('create')
    @ApiOperation({
        summary: 'Create new address in DB'
    })
    async createAddress(@Body() dto: CreateAddressDto): Promise<ReturnAddressDto> {
        return this.addressService.createAddress(dto);
    }
    @Put(':id')
    @ApiResponse({
        status: 201,
        type: ReturnAddressDto
    })
    async updateAddress(@Param('id') id: string, @Body() dto: EditAddressDto): Promise<ReturnAddressDto> {
        return this.addressService.updateAddress(id,dto);
    }


}
