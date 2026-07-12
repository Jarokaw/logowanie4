import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ScheduleAcademicGroup } from './schedule-academic-group.model';
import { ScheduleStudyTrack } from './schedule-study-track.model';

@Table({ tableName: 'schedule_study_track_specializations' })
export class ScheduleStudyTrackSpecialization extends Model<ScheduleStudyTrackSpecialization> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => ScheduleStudyTrack)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare studyTrackId: string;

  @ForeignKey(() => ScheduleAcademicGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare specializationId: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @BelongsTo(() => ScheduleStudyTrack, 'studyTrackId')
  declare studyTrack: ScheduleStudyTrack;

  @BelongsTo(() => ScheduleAcademicGroup, 'specializationId')
  declare specialization: ScheduleAcademicGroup;
}
