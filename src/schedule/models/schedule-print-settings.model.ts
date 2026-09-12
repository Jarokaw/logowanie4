import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { StudentPrintColumnSetting, StudentPrintStudyMode, StudentPrintType } from '../student-print-settings.types';

@Table({
  tableName: 'schedule_print_settings',
  indexes: [
    {
      name: 'schedule_print_settings_scope_unique',
      unique: true,
      fields: ['userId', 'printType', 'studyMode']
    }
  ]
})
export class SchedulePrintSettings extends Model<SchedulePrintSettings> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id: string;

  @Column({
    type: DataType.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  })
  declare userId: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare printType: StudentPrintType;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare studyMode: StudentPrintStudyMode;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare columns: StudentPrintColumnSetting[];
}
