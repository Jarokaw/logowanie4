import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { ScheduleLesson } from './schedule-lesson.model';

@Table({ tableName: 'schedule_class_types' })
export class ScheduleClassType extends Model<ScheduleClassType> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(80),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @HasMany(() => ScheduleLesson, 'classTypeId')
  declare lessons: ScheduleLesson[];
}
