import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ScheduleAcademicGroup } from './schedule-academic-group.model';
import { ScheduleClassType } from './schedule-class-type.model';
import { ScheduleLocation } from './schedule-location.model';
import { ScheduleNote } from './schedule-note.model';
import { ScheduleSubject } from './schedule-subject.model';
import { ScheduleTeacher } from './schedule-teacher.model';

@Table({ tableName: 'schedule_lessons' })
export class ScheduleLesson extends Model<ScheduleLesson> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  declare date: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare startHour: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare startMinute: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare lessonHours: number;

  @ForeignKey(() => ScheduleTeacher)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare teacherId: string;

  @ForeignKey(() => ScheduleSubject)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare subjectId: string;

  @ForeignKey(() => ScheduleLocation)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare roomId: string;

  @ForeignKey(() => ScheduleAcademicGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare groupId: string;

  @ForeignKey(() => ScheduleClassType)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare classTypeId: string;

  @ForeignKey(() => ScheduleNote)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare noteId: string;

  @BelongsTo(() => ScheduleTeacher, 'teacherId')
  declare teacher: ScheduleTeacher;

  @BelongsTo(() => ScheduleSubject, 'subjectId')
  declare subject: ScheduleSubject;

  @BelongsTo(() => ScheduleLocation, 'roomId')
  declare room: ScheduleLocation;

  @BelongsTo(() => ScheduleAcademicGroup, 'groupId')
  declare group: ScheduleAcademicGroup;

  @BelongsTo(() => ScheduleClassType, 'classTypeId')
  declare classType: ScheduleClassType;

  @BelongsTo(() => ScheduleNote, 'noteId')
  declare note: ScheduleNote;
}
