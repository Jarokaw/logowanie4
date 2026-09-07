import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { ScheduleStudyMode } from './schedule-academic-group.model';

@Table({ tableName: 'schedule_lesson_time_shortcuts' })
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
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: ScheduleStudyMode.FULL_TIME,
  })
  declare studyMode: ScheduleStudyMode;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare sortOrder: number;
}
