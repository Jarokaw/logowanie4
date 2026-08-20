import { Column, DataType, Model, Table } from 'sequelize-typescript';

export enum ScheduleHolidaySource {
  AUTOMATIC = 'AUTOMATIC',
  MANUAL = 'MANUAL',
}

@Table({ tableName: 'schedule_holidays' })
export class ScheduleHoliday extends Model<ScheduleHoliday> {
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
    type: DataType.STRING(160),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: ScheduleHolidaySource.AUTOMATIC,
  })
  declare source: ScheduleHolidaySource;
}
