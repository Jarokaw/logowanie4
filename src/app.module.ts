import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from './users/users.module';
import { User } from './users/models/users.model';
import { AddressModule } from './address/address.module';
import { Address } from './address/address.model';
import { Role } from './role/role.model';
import { RoleModule } from './role/role/role.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from './schedule/schedule.module';
import { ScheduleAcademicGroup } from './schedule/models/schedule-academic-group.model';
import { ScheduleAcademicYear } from './schedule/models/schedule-academic-year.model';
import { ScheduleClassType } from './schedule/models/schedule-class-type.model';
import { ScheduleLesson } from './schedule/models/schedule-lesson.model';
import { ScheduleLocation } from './schedule/models/schedule-location.model';
import { ScheduleNote } from './schedule/models/schedule-note.model';
import { ScheduleCourseTeacher } from './schedule/models/schedule-course-teacher.model';
import { ScheduleStudyTrack } from './schedule/models/schedule-study-track.model';
import { ScheduleStudyTrackSpecialization } from './schedule/models/schedule-study-track-specialization.model';
import { ScheduleSubject } from './schedule/models/schedule-subject.model';
import { ScheduleTeacherSubject } from './schedule/models/schedule-teacher-subject.model';
import { ScheduleTeacher } from './schedule/models/schedule-teacher.model';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true
  }),
  SequelizeModule.forRoot({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    models: [
      User,
      Address,
      Role,
      ScheduleSubject,
      ScheduleTeacher,
      ScheduleCourseTeacher,
      ScheduleTeacherSubject,
      ScheduleClassType,
      ScheduleNote,
      ScheduleLocation,
      ScheduleAcademicGroup,
      ScheduleStudyTrack,
      ScheduleStudyTrackSpecialization,
      ScheduleAcademicYear,
      ScheduleLesson,
    ], // rejestracja modeli
    autoLoadModels: true, // automatyczne ładowanie modeli
    synchronize: true, // synchronizacja bazy danych z modelami (nie zalecane w produkcji)
  }),
    UsersModule,
    AddressModule,
  RoleModule,
  AuthModule,
  ScheduleModule],
  controllers: [AppController, AuthController],
  providers: [AppService],
})
export class AppModule {}
