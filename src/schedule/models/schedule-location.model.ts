import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { ScheduleLesson } from './schedule-lesson.model';

export enum ScheduleLocationType {
  BUILDING = 'BUILDING',
  ROOM = 'ROOM',
}

@Table({ tableName: 'schedule_locations' })
export class ScheduleLocation extends Model<ScheduleLocation> {
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(140),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.ENUM(...Object.values(ScheduleLocationType)),
    allowNull: false,
  })
  declare type: ScheduleLocationType;

  @ForeignKey(() => ScheduleLocation)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare parentId: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare active: boolean;

  @BelongsTo(() => ScheduleLocation, 'parentId')
  declare parent: ScheduleLocation;

  @HasMany(() => ScheduleLocation, 'parentId')
  declare children: ScheduleLocation[];

  @HasMany(() => ScheduleLesson, 'roomId')
  declare lessons: ScheduleLesson[];
}
