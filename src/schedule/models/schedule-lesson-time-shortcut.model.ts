import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'schedule_lesson_time_shortcuts',
  indexes: [
    {
      name: 'schedule_lesson_time_shortcuts_unique_time',
      unique: true,
      fields: ['startHour', 'startMinute', 'lessonHours'],
    },
  ],
})
export class ScheduleLessonTimeShortcut extends Model<ScheduleLessonTimeShortcut> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

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

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare sortOrder: number;
}
