import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleAcademicGroup } from './models/schedule-academic-group.model';
import { ScheduleAcademicYear } from './models/schedule-academic-year.model';
import { ScheduleClassType } from './models/schedule-class-type.model';
import { ScheduleHoliday } from './models/schedule-holiday.model';
import { ScheduleLesson } from './models/schedule-lesson.model';
import { ScheduleLessonDateShortcut } from './models/schedule-lesson-date-shortcut.model';
import { ScheduleLessonTimeShortcut } from './models/schedule-lesson-time-shortcut.model';
import { ScheduleLocation } from './models/schedule-location.model';
import { ScheduleNote } from './models/schedule-note.model';
import { ScheduleCourseTeacher } from './models/schedule-course-teacher.model';
import { ScheduleStudyTrack } from './models/schedule-study-track.model';
import { ScheduleStudyTrackSpecialization } from './models/schedule-study-track-specialization.model';
import { ScheduleSubject } from './models/schedule-subject.model';
import { ScheduleTeacherSubject } from './models/schedule-teacher-subject.model';
import { ScheduleTeacher } from './models/schedule-teacher.model';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { StudentScheduleController } from './student-schedule.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ScheduleSubject,
      ScheduleTeacher,
      ScheduleCourseTeacher,
      ScheduleTeacherSubject,
      ScheduleClassType,
      ScheduleHoliday,
      ScheduleNote,
      ScheduleLocation,
      ScheduleAcademicGroup,
      ScheduleStudyTrack,
      ScheduleStudyTrackSpecialization,
      ScheduleAcademicYear,
      ScheduleLesson,
      ScheduleLessonDateShortcut,
      ScheduleLessonTimeShortcut,
    ]),
  ],
  controllers: [ScheduleController, StudentScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
