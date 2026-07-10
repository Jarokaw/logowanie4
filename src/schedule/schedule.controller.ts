import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/auth.decorator';
import {
  CreateScheduleAcademicGroupDto,
  CreateScheduleClassTypeDto,
  CreateScheduleLessonDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  ScheduleLessonFilters,
  UpdateScheduleLessonDto,
  UpdateScheduleLocationDto,
  UpdateScheduleTeacherDto,
} from './dto/schedule.dto';
import { ScheduleService } from './schedule.service';

@Controller('schedule')
@ApiTags('Schedule API')
@ApiBearerAuth('JWT-auth')
@Auth()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('dictionaries')
  @ApiOperation({ summary: 'Get schedule dictionaries' })
  findDictionaries() {
    return this.scheduleService.findDictionaries();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get schedule counters' })
  findSummary() {
    return this.scheduleService.findSummary();
  }

  @Get('subjects')
  @ApiOperation({ summary: 'Get subjects, optionally assigned to teacher' })
  findSubjects(@Query('teacherId') teacherId?: string) {
    return this.scheduleService.findSubjects(teacherId);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get rooms with optional occupancy marker' })
  findRooms(
    @Query('buildingId') buildingId?: string,
    @Query('date') date?: string,
    @Query('startHour') startHour?: string,
    @Query('startMinute') startMinute?: string,
    @Query('lessonHours') lessonHours?: string,
  ) {
    return this.scheduleService.findRooms({
      buildingId,
      date,
      startHour: startHour !== undefined ? Number(startHour) : undefined,
      startMinute: startMinute !== undefined ? Number(startMinute) : undefined,
      lessonHours: lessonHours !== undefined ? Number(lessonHours) : undefined,
    });
  }

  @Get('lessons')
  @ApiOperation({ summary: 'Get filtered lessons' })
  findLessons(@Query() query: Record<string, string>) {
    const filters: ScheduleLessonFilters = {
      from: query.from,
      to: query.to,
      teacherId: query.teacherId,
      buildingId: query.buildingId,
      roomId: query.roomId,
      groupId: query.groupId,
      limit: query.limit ? Number(query.limit) : undefined,
    };
    return this.scheduleService.findLessons(filters);
  }

  @Get('lessons/:id')
  @ApiOperation({ summary: 'Get lesson by id' })
  findLesson(@Param('id') id: string) {
    return this.scheduleService.findLesson(id);
  }

  @Post('subjects')
  createSubject(@Body() dto: CreateScheduleSubjectDto) {
    return this.scheduleService.createSubject(dto);
  }

  @Post('teachers')
  createTeacher(@Body() dto: CreateScheduleTeacherDto) {
    return this.scheduleService.createTeacher(dto);
  }

  @Put('teachers/:id')
  updateTeacher(@Param('id') id: string, @Body() dto: UpdateScheduleTeacherDto) {
    return this.scheduleService.updateTeacher(id, dto);
  }

  @Patch('teachers/:id')
  patchTeacher(@Param('id') id: string, @Body() dto: UpdateScheduleTeacherDto) {
    return this.scheduleService.updateTeacher(id, dto);
  }

  @Post('class-types')
  createClassType(@Body() dto: CreateScheduleClassTypeDto) {
    return this.scheduleService.createClassType(dto);
  }

  @Post('notes')
  createNote(@Body() dto: CreateScheduleNoteDto) {
    return this.scheduleService.createNote(dto);
  }

  @Post('locations')
  createLocation(@Body() dto: CreateScheduleLocationDto) {
    return this.scheduleService.createLocation(dto);
  }

  @Put('locations/:id')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateScheduleLocationDto) {
    return this.scheduleService.updateLocation(id, dto);
  }

  @Patch('locations/:id')
  patchLocation(@Param('id') id: string, @Body() dto: UpdateScheduleLocationDto) {
    return this.scheduleService.updateLocation(id, dto);
  }

  @Post('groups')
  createGroup(@Body() dto: CreateScheduleAcademicGroupDto) {
    return this.scheduleService.createGroup(dto);
  }

  @Post('lessons')
  @ApiOperation({ summary: 'Create lesson with conflict validation' })
  createLesson(@Body() dto: CreateScheduleLessonDto) {
    return this.scheduleService.createLesson(dto);
  }

  @Put('lessons/:id')
  updateLesson(@Param('id') id: string, @Body() dto: UpdateScheduleLessonDto) {
    return this.scheduleService.updateLesson(id, dto);
  }

  @Patch('lessons/:id')
  patchLesson(@Param('id') id: string, @Body() dto: UpdateScheduleLessonDto) {
    return this.scheduleService.updateLesson(id, dto);
  }

  @Delete('lessons/:id')
  deleteLesson(@Param('id') id: string) {
    return this.scheduleService.deleteLesson(id);
  }
}
