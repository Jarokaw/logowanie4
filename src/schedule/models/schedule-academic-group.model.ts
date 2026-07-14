import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { ScheduleLesson } from './schedule-lesson.model';

export enum ScheduleGroupLevel {
  COURSE = 'COURSE',
  SPECIALIZATION = 'SPECIALIZATION',
  GROUP = 'GROUP',
  WORKSHOP = 'WORKSHOP',
}

export enum ScheduleStudyMode {
  UNASSIGNED = 'UNASSIGNED',
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  POSTGRADUATE = 'POSTGRADUATE',
}

@Table({ tableName: 'schedule_academic_groups' })
export class ScheduleAcademicGroup extends Model<ScheduleAcademicGroup> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(220),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.ENUM(...Object.values(ScheduleGroupLevel)),
    allowNull: false,
  })
  declare level: ScheduleGroupLevel;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: ScheduleStudyMode.UNASSIGNED,
  })
  declare studyMode: ScheduleStudyMode;

  @ForeignKey(() => ScheduleAcademicGroup)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare parentId: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @BelongsTo(() => ScheduleAcademicGroup, 'parentId')
  declare parent: ScheduleAcademicGroup;

  @HasMany(() => ScheduleAcademicGroup, 'parentId')
  declare children: ScheduleAcademicGroup[];

  @HasMany(() => ScheduleLesson, 'groupId')
  declare lessons: ScheduleLesson[];
}
