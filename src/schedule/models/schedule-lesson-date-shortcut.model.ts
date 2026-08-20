import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'schedule_lesson_date_shortcuts',
  indexes: [
    {
      name: 'schedule_lesson_date_shortcuts_unique_date_week',
      unique: true,
      fields: ['date', 'week'],
    },
  ],
})
export class ScheduleLessonDateShortcut extends Model<ScheduleLessonDateShortcut> {
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
  declare week: number;
}
