import { Column, DataType, Model, Table } from 'sequelize-typescript';

export enum ScheduleAcademicSemester {
  WINTER = 'WINTER',
  SUMMER = 'SUMMER',
}

@Table({ tableName: 'schedule_academic_years' })
export class ScheduleAcademicYear extends Model<ScheduleAcademicYear> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(63),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(6),
    allowNull: true,
  })
  declare semester: ScheduleAcademicSemester | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare activeForDesigner: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare activeForStudent: boolean;
}
