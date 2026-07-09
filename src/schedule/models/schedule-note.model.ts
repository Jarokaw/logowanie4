import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { ScheduleLesson } from './schedule-lesson.model';

@Table({ tableName: 'schedule_notes' })
export class ScheduleNote extends Model<ScheduleNote> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(160),
    allowNull: false,
  })
  declare text: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @HasMany(() => ScheduleLesson, 'noteId')
  declare lessons: ScheduleLesson[];
}
