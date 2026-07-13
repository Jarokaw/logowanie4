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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/auth/auth.decorator';
import {
  CreateScheduleAcademicGroupDto,
  CreateScheduleAcademicYearDto,
  CreateScheduleClassTypeDto,
  CreateScheduleCourseTeacherDto,
  CreateScheduleLessonDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleStudyTrackDto,
  CreateScheduleStudyTrackSpecializationDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  CreateScheduleTeacherSubjectDto,
  ImportScheduleAcademicYearBackupDto,
  ScheduleLessonFilters,
  UpdateScheduleAcademicGroupDto,
  UpdateScheduleAcademicYearDto,
  UpdateScheduleClassTypeDto,
  UpdateScheduleLessonDto,
  UpdateScheduleLocationDto,
  UpdateScheduleNoteDto,
  UpdateScheduleStudyTrackDto,
  UpdateScheduleSubjectDto,
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

  @Get('teacher-subjects')
  @ApiOperation({ summary: 'Get subjects assigned to teacher' })
  findTeacherSubjects(@Query('teacherId') teacherId: string) {
    return this.scheduleService.findTeacherSubjects(teacherId);
  }

  @Post('teacher-subjects')
  @ApiOperation({ summary: 'Assign subject to teacher' })
  createTeacherSubject(@Body() dto: CreateScheduleTeacherSubjectDto) {
    return this.scheduleService.createTeacherSubject(dto);
  }

  @Delete('teacher-subjects/:id')
  @ApiOperation({ summary: 'Remove subject assignment from teacher' })
  deleteTeacherSubject(@Param('id') id: string) {
    return this.scheduleService.deleteTeacherSubject(id);
  }

  @Get('course-teachers')
  @ApiOperation({ summary: 'Get teachers assigned to course' })
  findCourseTeachers(@Query('courseId') courseId: string) {
    return this.scheduleService.findCourseTeachers(courseId);
  }

  @Post('course-teachers')
  @ApiOperation({ summary: 'Assign teacher to course' })
  createCourseTeacher(@Body() dto: CreateScheduleCourseTeacherDto) {
    return this.scheduleService.createCourseTeacher(dto);
  }

  @Delete('course-teachers/:id')
  @ApiOperation({ summary: 'Remove teacher assignment from course' })
  deleteCourseTeacher(@Param('id') id: string) {
    return this.scheduleService.deleteCourseTeacher(id);
  }

  @Get('academic-years')
  @ApiOperation({ summary: 'Get academic years' })
  findAcademicYears() {
    return this.scheduleService.findAcademicYears();
  }

  @Get('academic-years/:id/backup')
  @ApiOperation({ summary: 'Download academic year database backup' })
  async backupAcademicYear(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const backup = await this.scheduleService.backupAcademicYearDatabase(id);
    response.setHeader('Content-Type', 'application/sql; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.fileName}"; filename*=UTF-8''${encodeURIComponent(
        backup.fileName,
      )}`,
    );
    return backup.sql;
  }

  @Post('academic-years/:id/import')
  @ApiOperation({ summary: 'Import academic year database backup' })
  importAcademicYearBackup(
    @Param('id') id: string,
    @Body() dto: ImportScheduleAcademicYearBackupDto,
  ) {
    return this.scheduleService.importAcademicYearDatabase(id, dto);
  }

  @Get('study-tracks')
  @ApiOperation({ summary: 'Get study tracks' })
  findStudyTracks(@Query('courseId') courseId?: string) {
    return this.scheduleService.findStudyTracks(courseId);
  }

  @Get('study-tracks/:id/specializations')
  @ApiOperation({ summary: 'Get study track specializations' })
  findStudyTrackSpecializations(@Param('id') id: string) {
    return this.scheduleService.findStudyTrackSpecializations(id);
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

  @Put('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() dto: UpdateScheduleSubjectDto) {
    return this.scheduleService.updateSubject(id, dto);
  }

  @Patch('subjects/:id')
  patchSubject(@Param('id') id: string, @Body() dto: UpdateScheduleSubjectDto) {
    return this.scheduleService.updateSubject(id, dto);
  }

  @Post('academic-years')
  createAcademicYear(@Body() dto: CreateScheduleAcademicYearDto) {
    return this.scheduleService.createAcademicYear(dto);
  }

  @Patch('academic-years/:id/active-designer')
  activateAcademicYearForDesigner(@Param('id') id: string) {
    return this.scheduleService.activateAcademicYearForDesigner(id);
  }

  @Patch('academic-years/:id/active-student')
  activateAcademicYearForStudent(@Param('id') id: string) {
    return this.scheduleService.activateAcademicYearForStudent(id);
  }

  @Put('academic-years/:id')
  updateAcademicYear(@Param('id') id: string, @Body() dto: UpdateScheduleAcademicYearDto) {
    return this.scheduleService.updateAcademicYear(id, dto);
  }

  @Patch('academic-years/:id')
  patchAcademicYear(@Param('id') id: string, @Body() dto: UpdateScheduleAcademicYearDto) {
    return this.scheduleService.updateAcademicYear(id, dto);
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

  @Put('class-types/:id')
  updateClassType(@Param('id') id: string, @Body() dto: UpdateScheduleClassTypeDto) {
    return this.scheduleService.updateClassType(id, dto);
  }

  @Patch('class-types/:id')
  patchClassType(@Param('id') id: string, @Body() dto: UpdateScheduleClassTypeDto) {
    return this.scheduleService.updateClassType(id, dto);
  }

  @Post('notes')
  createNote(@Body() dto: CreateScheduleNoteDto) {
    return this.scheduleService.createNote(dto);
  }

  @Put('notes/:id')
  updateNote(@Param('id') id: string, @Body() dto: UpdateScheduleNoteDto) {
    return this.scheduleService.updateNote(id, dto);
  }

  @Patch('notes/:id')
  patchNote(@Param('id') id: string, @Body() dto: UpdateScheduleNoteDto) {
    return this.scheduleService.updateNote(id, dto);
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

  @Put('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateScheduleAcademicGroupDto) {
    return this.scheduleService.updateGroup(id, dto);
  }

  @Patch('groups/:id')
  patchGroup(@Param('id') id: string, @Body() dto: UpdateScheduleAcademicGroupDto) {
    return this.scheduleService.updateGroup(id, dto);
  }

  @Post('study-tracks')
  createStudyTrack(@Body() dto: CreateScheduleStudyTrackDto) {
    return this.scheduleService.createStudyTrack(dto);
  }

  @Put('study-tracks/:id')
  updateStudyTrack(@Param('id') id: string, @Body() dto: UpdateScheduleStudyTrackDto) {
    return this.scheduleService.updateStudyTrack(id, dto);
  }

  @Patch('study-tracks/:id')
  patchStudyTrack(@Param('id') id: string, @Body() dto: UpdateScheduleStudyTrackDto) {
    return this.scheduleService.updateStudyTrack(id, dto);
  }

  @Post('study-tracks/:id/specializations')
  addStudyTrackSpecialization(
    @Param('id') id: string,
    @Body() dto: CreateScheduleStudyTrackSpecializationDto,
  ) {
    return this.scheduleService.addStudyTrackSpecialization(id, dto);
  }

  @Delete('study-tracks/:id/specializations/:specializationId')
  removeStudyTrackSpecialization(
    @Param('id') id: string,
    @Param('specializationId') specializationId: string,
  ) {
    return this.scheduleService.removeStudyTrackSpecialization(id, specializationId);
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
