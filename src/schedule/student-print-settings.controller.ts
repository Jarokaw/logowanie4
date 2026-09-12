import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Auth } from 'src/auth/auth.decorator';
import { StudentPrintSettingsScopeDto, UpdateStudentPrintSettingsDto } from './dto/student-print-settings.dto';
import { StudentPrintSettingsService } from './student-print-settings.service';

type AuthenticatedRequest = Request & { user: { userId: string } };

@Controller('schedule/student-print-settings')
@ApiTags('Schedule API')
@ApiBearerAuth('JWT-auth')
@Auth()
export class StudentPrintSettingsController {
  constructor(private readonly settingsService: StudentPrintSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user student PDF columns' })
  find(@Req() request: AuthenticatedRequest, @Query() scope: StudentPrintSettingsScopeDto) {
    return this.settingsService.findForUser(request.user.userId, scope.printType, scope.studyMode);
  }

  @Put()
  @ApiOperation({ summary: 'Save the current user student PDF columns in display order' })
  save(@Req() request: AuthenticatedRequest, @Body() dto: UpdateStudentPrintSettingsDto) {
    return this.settingsService.saveForUser(request.user.userId, dto);
  }
}
