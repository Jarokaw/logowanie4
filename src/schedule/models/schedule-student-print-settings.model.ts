import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { StudentPrintColumnSetting } from '../student-print-settings.types';

@Table({ tableName: 'schedule_student_print_settings' })
export class ScheduleStudentPrintSettings extends Model<ScheduleStudentPrintSettings> {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  })
  declare userId: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare columns: StudentPrintColumnSetting[];
}
