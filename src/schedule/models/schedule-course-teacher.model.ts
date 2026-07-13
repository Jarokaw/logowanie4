import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ScheduleAcademicGroup } from './schedule-academic-group.model';
import { ScheduleTeacher } from './schedule-teacher.model';

@Table({ tableName: 'schedule_course_teachers' })
export class ScheduleCourseTeacher extends Model<ScheduleCourseTeacher> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => ScheduleAcademicGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare courseId: string;

  @ForeignKey(() => ScheduleTeacher)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare teacherId: string;

  @BelongsTo(() => ScheduleAcademicGroup, 'courseId')
  declare course: ScheduleAcademicGroup;

  @BelongsTo(() => ScheduleTeacher, 'teacherId')
  declare teacher: ScheduleTeacher;
}
