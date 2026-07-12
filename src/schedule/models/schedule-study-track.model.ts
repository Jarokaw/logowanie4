import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ScheduleAcademicGroup } from './schedule-academic-group.model';

@Table({ tableName: 'schedule_study_tracks' })
export class ScheduleStudyTrack extends Model<ScheduleStudyTrack> {
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
  declare name: string;

  @ForeignKey(() => ScheduleAcademicGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare courseId: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @BelongsTo(() => ScheduleAcademicGroup, 'courseId')
  declare course: ScheduleAcademicGroup;
}
