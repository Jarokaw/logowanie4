import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleAcademicGroup } from './models/schedule-academic-group.model';
import { ScheduleClassType } from './models/schedule-class-type.model';
import { ScheduleLesson } from './models/schedule-lesson.model';
import { ScheduleLocation } from './models/schedule-location.model';
import { ScheduleNote } from './models/schedule-note.model';
import { ScheduleSubject } from './models/schedule-subject.model';
import { ScheduleTeacherSubject } from './models/schedule-teacher-subject.model';
import { ScheduleTeacher } from './models/schedule-teacher.model';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ScheduleSubject,
      ScheduleTeacher,
      ScheduleTeacherSubject,
      ScheduleClassType,
      ScheduleNote,
      ScheduleLocation,
      ScheduleAcademicGroup,
      ScheduleLesson,
    ]),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
