import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'schedule_lesson_cycle_ranges' })
export class ScheduleLessonRange extends Model<ScheduleLessonRange> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    unique: true,
    defaultValue: 'DEFAULT',
  })
  declare key: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  declare startDate: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  declare endDate: string;

}
