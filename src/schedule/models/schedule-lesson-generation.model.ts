import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'schedule_lesson_generations' })
export class ScheduleLessonGeneration extends Model<ScheduleLessonGeneration> {
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
  declare sourceWeekOneDate: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  declare sourceWeekTwoDate: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare lastAppliedAt: Date | null;
}
