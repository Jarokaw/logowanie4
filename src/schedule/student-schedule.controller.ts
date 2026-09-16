import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduleLessonFilters } from './dto/schedule.dto';
import { ScheduleStudyMode } from './models/schedule-academic-group.model';
import { ScheduleService } from './schedule.service';

@Controller('student-schedule')
@ApiTags('Student Schedule API')
export class StudentScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('dictionaries')
  @ApiOperation({ summary: 'Get public student schedule dictionaries' })
  findDictionaries() {
    return this.scheduleService.findStudentDictionaries();
  }

  @Get('lessons')
  @ApiOperation({ summary: 'Get public student lessons' })
  findLessons(@Query() query: Record<string, string>) {
    const studyMode = Object.values(ScheduleStudyMode).includes(
      query.studyMode as ScheduleStudyMode,
    )
      ? (query.studyMode as ScheduleStudyMode)
      : undefined;
    const filters: ScheduleLessonFilters = {
      from: query.from,
      to: query.to,
      studyMode,
      teacherId: query.teacherId,
      groupId: query.groupId,
      limit: query.limit ? Number(query.limit) : undefined,
    };
    return this.scheduleService.findStudentLessons(filters);
  }
}
