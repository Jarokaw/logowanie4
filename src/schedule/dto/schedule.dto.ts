import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ScheduleGroupLevel } from '../models/schedule-academic-group.model';
import { ScheduleLocationType } from '../models/schedule-location.model';

export class CreateScheduleSubjectDto {
  @ApiProperty()
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleAcademicYearDto {
  @ApiProperty()
  @IsString()
  @Length(2, 63)
  @Matches(/^[A-Za-z0-9_]+$/)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleAcademicYearDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 63)
  @Matches(/^[A-Za-z0-9_]+$/)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleTeacherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 80)
  firstName: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleTeacherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleClassTypeDto {
  @ApiProperty()
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleClassTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleNoteDto {
  @ApiProperty()
  @IsString()
  @Length(2, 200)
  text: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleLocationDto {
  @ApiProperty()
  @IsString()
  @Length(1, 140)
  name: string;

  @ApiProperty({ enum: ScheduleLocationType })
  @IsEnum(ScheduleLocationType)
  type: ScheduleLocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 140)
  name?: string;

  @ApiPropertyOptional({ enum: ScheduleLocationType })
  @IsOptional()
  @IsEnum(ScheduleLocationType)
  type?: ScheduleLocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleAcademicGroupDto {
  @ApiProperty()
  @IsString()
  @Length(2, 220)
  name: string;

  @ApiProperty({ enum: ScheduleGroupLevel })
  @IsEnum(ScheduleGroupLevel)
  level: ScheduleGroupLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleAcademicGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 220)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleLessonDto {
  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(6)
  @Max(22)
  startHour: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(59)
  startMinute: number;

  @ApiProperty({ example: 2, description: 'Jedna jednostka trwa 45 minut.' })
  @IsInt()
  @Min(1)
  @Max(12)
  lessonHours: number;

  @ApiProperty()
  @IsUUID()
  teacherId: string;

  @ApiProperty()
  @IsUUID()
  subjectId: string;

  @ApiProperty()
  @IsUUID()
  roomId: string;

  @ApiProperty()
  @IsUUID()
  groupId: string;

  @ApiProperty()
  @IsUUID()
  classTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  noteId?: string;
}

export class UpdateScheduleLessonDto {
  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(22)
  startHour?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  startMinute?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  lessonHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  noteId?: string;
}

export interface ScheduleLessonFilters {
  from?: string;
  to?: string;
  teacherId?: string;
  buildingId?: string;
  roomId?: string;
  groupId?: string;
  limit?: number;
}
