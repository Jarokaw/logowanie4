import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { ScheduleSubject } from './schedule-subject.model';
import { ScheduleTeacher } from './schedule-teacher.model';

@Table({ tableName: 'schedule_teacher_subjects' })
export class ScheduleTeacherSubject extends Model<ScheduleTeacherSubject> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

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
}
