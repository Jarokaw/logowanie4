import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { ScheduleLesson } from './schedule-lesson.model';

@Table({ tableName: 'schedule_teachers' })
export class ScheduleTeacher extends Model<ScheduleTeacher> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(40),
    allowNull: true,
  })
  declare title: string;

  @Column({
    type: DataType.STRING(80),
    allowNull: false,
  })
  declare firstName: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare lastName: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @HasMany(() => ScheduleLesson, 'teacherId')
  declare lessons: ScheduleLesson[];
}
