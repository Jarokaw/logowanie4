import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { DataTypes, Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  CreateScheduleAcademicGroupDto,
  CreateScheduleAcademicYearDto,
  CreateScheduleClassTypeDto,
  CreateScheduleLessonDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  ScheduleLessonFilters,
  UpdateScheduleAcademicGroupDto,
  UpdateScheduleAcademicYearDto,
  UpdateScheduleClassTypeDto,
  UpdateScheduleLessonDto,
  UpdateScheduleLocationDto,
  UpdateScheduleNoteDto,
  UpdateScheduleSubjectDto,
  UpdateScheduleTeacherDto,
} from './dto/schedule.dto';
import {
  ScheduleAcademicGroup,
  ScheduleGroupLevel,
} from './models/schedule-academic-group.model';
import { ScheduleAcademicYear } from './models/schedule-academic-year.model';
import { ScheduleClassType } from './models/schedule-class-type.model';
import {
  ScheduleLocation,
  ScheduleLocationType,
} from './models/schedule-location.model';
import { ScheduleNote } from './models/schedule-note.model';
import { ScheduleLesson } from './models/schedule-lesson.model';
import { ScheduleSubject } from './models/schedule-subject.model';
import { ScheduleTeacherSubject } from './models/schedule-teacher-subject.model';
import { ScheduleTeacher } from './models/schedule-teacher.model';

type LessonLike = Pick<
  CreateScheduleLessonDto,
  | 'date'
  | 'startHour'
  | 'startMinute'
  | 'lessonHours'
  | 'teacherId'
  | 'subjectId'
  | 'roomId'
  | 'groupId'
  | 'classTypeId'
  | 'noteId'
>;

type LocationLike = Pick<CreateScheduleLocationDto, 'name' | 'type' | 'parentId'>;
type AcademicGroupLike = Pick<CreateScheduleAcademicGroupDto, 'name' | 'level' | 'parentId'>;
type ScheduleDatabaseModels = {
  subjectModel: any;
  teacherModel: any;
  teacherSubjectModel: any;
  classTypeModel: any;
  noteModel: any;
  locationModel: any;
  groupModel: any;
  lessonModel: any;
};

type CachedScheduleDatabase = {
  sequelize: Sequelize;
  models: ScheduleDatabaseModels;
};

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly lessonMinutes = 45;
  private readonly academicYearDatabases = new Map<string, CachedScheduleDatabase>();

  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @InjectModel(ScheduleSubject)
    private readonly subjectModel: typeof ScheduleSubject,
    @InjectModel(ScheduleTeacher)
    private readonly teacherModel: typeof ScheduleTeacher,
    @InjectModel(ScheduleTeacherSubject)
    private readonly teacherSubjectModel: typeof ScheduleTeacherSubject,
    @InjectModel(ScheduleClassType)
    private readonly classTypeModel: typeof ScheduleClassType,
    @InjectModel(ScheduleNote)
    private readonly noteModel: typeof ScheduleNote,
    @InjectModel(ScheduleLocation)
    private readonly locationModel: typeof ScheduleLocation,
    @InjectModel(ScheduleAcademicGroup)
    private readonly groupModel: typeof ScheduleAcademicGroup,
    @InjectModel(ScheduleAcademicYear)
    private readonly academicYearModel: typeof ScheduleAcademicYear,
    @InjectModel(ScheduleLesson)
    private readonly lessonModel: typeof ScheduleLesson,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAcademicYearActivityColumns();
    await this.seedDefaultDictionaries();
  }

  async findDictionaries() {
    const models = await this.getScheduleModels();
    const [
      subjects,
      teachers,
      classTypes,
      notes,
      locations,
      groups,
      academicYears,
    ] = await Promise.all([
      models.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      models.teacherModel.findAll({
        where: { active: true },
        order: [
          ['lastName', 'ASC'],
          ['firstName', 'ASC'],
        ],
      }),
      models.classTypeModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      models.noteModel.findAll({ where: { active: true }, order: [['text', 'ASC']] }),
      models.locationModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      models.groupModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      this.academicYearModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
    ]);

    return {
      subjects,
      teachers: teachers.map((teacher) => this.mapTeacher(teacher)),
      classTypes,
      notes,
      buildings: locations.filter((location) => location.type === ScheduleLocationType.BUILDING),
      rooms: locations.filter((location) => location.type === ScheduleLocationType.ROOM),
      groups,
      academicYears,
      timeSlots: {
        hours: this.range(6, 22),
        minutes: this.range(0, 55, 5).map((minute) => minute.toString().padStart(2, '0')),
        lessonHours: this.range(1, 12),
      },
    };
  }

  async findSummary() {
    const models = await this.getScheduleModels();
    const [lessons, subjects, teachers, rooms, groups] = await Promise.all([
      models.lessonModel.count(),
      models.subjectModel.count({ where: { active: true } }),
      models.teacherModel.count({ where: { active: true } }),
      models.locationModel.count({
        where: { active: true, type: ScheduleLocationType.ROOM },
      }),
      models.groupModel.count({ where: { active: true } }),
    ]);

    return { lessons, subjects, teachers, rooms, groups };
  }

  async findSubjects(teacherId?: string): Promise<ScheduleSubject[]> {
    const models = await this.getScheduleModels();
    if (!teacherId) {
      return models.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] });
    }

    const links = await models.teacherSubjectModel.findAll({ where: { teacherId } });
    const subjectIds = links.map((link) => link.subjectId);
    if (!subjectIds.length) {
      return models.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] });
    }

    return models.subjectModel.findAll({
      where: { active: true, id: { [Op.in]: subjectIds } },
      order: [['name', 'ASC']],
    });
  }

  async findAcademicYears(): Promise<ScheduleAcademicYear[]> {
    return this.academicYearModel.findAll({
      where: { active: true },
      order: [['name', 'ASC']],
    });
  }

  async findRooms(params: {
    buildingId?: string;
    date?: string;
    startHour?: number;
    startMinute?: number;
    lessonHours?: number;
  }) {
    const models = await this.getScheduleModels();
    const where: any = {
      active: true,
      type: ScheduleLocationType.ROOM,
    };
    if (params.buildingId) {
      where.parentId = params.buildingId;
    }

    const rooms = await models.locationModel.findAll({ where, order: [['name', 'ASC']] });
    if (
      !params.date ||
      params.startHour === undefined ||
      params.startMinute === undefined ||
      params.lessonHours === undefined
    ) {
      return rooms.map((room) => ({ ...room.toJSON(), occupied: false }));
    }

    const occupiedIds = await this.findOccupiedRoomIds(
      models,
      params.date,
      params.startHour,
      params.startMinute,
      params.lessonHours,
    );

    return rooms.map((room) => ({
      ...room.toJSON(),
      occupied: occupiedIds.has(room.id),
    }));
  }

  async findLessons(filters: ScheduleLessonFilters = {}) {
    const models = await this.getScheduleModels();
    const where: any = {};
    if (filters.from || filters.to) {
      where.date = {
        [Op.between]: [filters.from ?? '0001-01-01', filters.to ?? '9999-12-31'],
      };
    }
    if (filters.teacherId) {
      where.teacherId = filters.teacherId;
    }
    if (filters.buildingId) {
      const roomWhere: any = {
        parentId: filters.buildingId,
        type: ScheduleLocationType.ROOM,
      };

      if (filters.roomId) {
        roomWhere.id = filters.roomId;
      }

      const rooms = await models.locationModel.findAll({ where: roomWhere });
      where.roomId = { [Op.in]: rooms.map((room) => room.id) };
    } else if (filters.roomId) {
      where.roomId = filters.roomId;
    }
    if (filters.groupId) {
      where.groupId = { [Op.in]: await this.getGroupAndDescendantIds(models, filters.groupId) };
    }

    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 5000);

    const lessons = await models.lessonModel.findAll({
      where,
      include: this.lessonIncludes(models),
      order: [
        ['date', 'ASC'],
        ['startHour', 'ASC'],
        ['startMinute', 'ASC'],
      ],
      limit,
    });

    return lessons.map((lesson) => this.mapLesson(lesson));
  }

  async createSubject(dto: CreateScheduleSubjectDto) {
    const models = await this.getScheduleModels();
    await this.validateUniqueSubjectName(models, dto.name);
    return models.subjectModel.create(dto);
  }

  async createAcademicYear(dto: CreateScheduleAcademicYearDto) {
    const name = this.validateAcademicYearDatabaseName(dto.name);

    await this.validateUniqueAcademicYearName(name);
    await this.validateAcademicYearDatabaseDoesNotExist(name);
    await this.createAcademicYearDatabase(name);

    try {
      await this.syncAcademicYearScheduleTables(name);
      return this.academicYearModel.create({ ...dto, name });
    } catch {
      await this.dropAcademicYearDatabase(name);
      throw new BadRequestException('Nie udalo sie utworzyc tabel planu zajec dla tego rocznika.');
    }
  }

  async updateAcademicYear(id: string, dto: UpdateScheduleAcademicYearDto) {
    const academicYear = await this.academicYearModel.findByPk(id);
    if (!academicYear) {
      throw new NotFoundException('Nie znaleziono rocznika nauczania.');
    }

    const nextName = this.validateAcademicYearDatabaseName(dto.name ?? academicYear.name);
    if (nextName !== academicYear.name) {
      await this.validateUniqueAcademicYearName(nextName, id);
      await this.validateAcademicYearDatabaseDoesNotExist(nextName);
      await this.renameAcademicYearDatabase(academicYear.name, nextName);
    } else {
      await this.validateUniqueAcademicYearName(nextName, id);
    }

    await academicYear.update({ ...dto, name: nextName });
    return academicYear;
  }

  async activateAcademicYearForDesigner(id: string) {
    const academicYear = await this.findActiveAcademicYear(id);
    await this.syncAcademicYearScheduleTables(academicYear.name);
    await this.academicYearModel.update(
      { activeForDesigner: false },
      { where: { active: true } },
    );
    await academicYear.update({ activeForDesigner: true });
    return academicYear.reload();
  }

  async activateAcademicYearForStudent(id: string) {
    const academicYear = await this.findActiveAcademicYear(id);
    await this.academicYearModel.update(
      { activeForStudent: false },
      { where: { active: true } },
    );
    await academicYear.update({ activeForStudent: true });
    return academicYear.reload();
  }

  async updateSubject(id: string, dto: UpdateScheduleSubjectDto) {
    const models = await this.getScheduleModels();
    const subject = await models.subjectModel.findByPk(id);
    if (!subject) {
      throw new NotFoundException('Nie znaleziono przedmiotu.');
    }

    await this.validateUniqueSubjectName(models, dto.name ?? subject.name, id);
    await subject.update(dto);
    return subject;
  }

  async createTeacher(dto: CreateScheduleTeacherDto) {
    const models = await this.getScheduleModels();
    return models.teacherModel.create(dto);
  }

  async updateTeacher(id: string, dto: UpdateScheduleTeacherDto) {
    const models = await this.getScheduleModels();
    const teacher = await models.teacherModel.findByPk(id);
    if (!teacher) {
      throw new NotFoundException('Nie znaleziono wykładowcy.');
    }

    await teacher.update(dto);
    return this.mapTeacher(teacher);
  }

  async createClassType(dto: CreateScheduleClassTypeDto) {
    const models = await this.getScheduleModels();
    await this.validateUniqueClassTypeName(models, dto.name);
    return models.classTypeModel.create(dto);
  }

  async updateClassType(id: string, dto: UpdateScheduleClassTypeDto) {
    const models = await this.getScheduleModels();
    const classType = await models.classTypeModel.findByPk(id);
    if (!classType) {
      throw new NotFoundException('Nie znaleziono formy zajec.');
    }

    await this.validateUniqueClassTypeName(models, dto.name ?? classType.name, id);
    await classType.update(dto);
    return classType;
  }

  async createNote(dto: CreateScheduleNoteDto) {
    const models = await this.getScheduleModels();
    await this.validateUniqueNoteText(models, dto.text);
    return models.noteModel.create(dto);
  }

  async updateNote(id: string, dto: UpdateScheduleNoteDto) {
    const models = await this.getScheduleModels();
    const note = await models.noteModel.findByPk(id);
    if (!note) {
      throw new NotFoundException('Nie znaleziono uwagi.');
    }

    await this.validateUniqueNoteText(models, dto.text ?? note.text, id);
    await note.update(dto);
    return note;
  }

  async createLocation(dto: CreateScheduleLocationDto) {
    const models = await this.getScheduleModels();
    await this.validateParentLocation(models, dto);
    await this.validateUniqueBuildingName(models, dto);
    await this.validateUniqueRoomName(models, dto);
    return models.locationModel.create(dto);
  }

  async updateLocation(id: string, dto: UpdateScheduleLocationDto) {
    const models = await this.getScheduleModels();
    const location = await models.locationModel.findByPk(id);
    if (!location) {
      throw new NotFoundException('Nie znaleziono lokalizacji.');
    }

    const nextLocation: LocationLike = {
      name: dto.name ?? location.name,
      type: dto.type ?? location.type,
      parentId: dto.parentId ?? location.parentId ?? undefined,
    };

    await this.validateParentLocation(models, nextLocation);
    await this.validateUniqueBuildingName(models, nextLocation, id);
    await this.validateUniqueRoomName(models, nextLocation, id);
    await location.update(dto);
    return location;
  }

  async createGroup(dto: CreateScheduleAcademicGroupDto) {
    const models = await this.getScheduleModels();
    await this.validateParentGroup(models, dto);
    await this.validateUniqueAcademicGroupName(models, dto);
    return models.groupModel.create(dto);
  }

  async updateGroup(id: string, dto: UpdateScheduleAcademicGroupDto) {
    const models = await this.getScheduleModels();
    const group = await models.groupModel.findByPk(id);
    if (!group) {
      throw new NotFoundException('Nie znaleziono kierunku, specjalnosci albo grupy.');
    }

    const nextGroup: AcademicGroupLike = {
      name: dto.name ?? group.name,
      level: group.level,
      parentId: group.parentId ?? undefined,
    };

    await this.validateParentGroup(models, nextGroup);
    await this.validateUniqueAcademicGroupName(models, nextGroup, id);
    await group.update(dto);
    return group;
  }

  async createLesson(dto: CreateScheduleLessonDto) {
    const models = await this.getScheduleModels();
    await this.validateLessonReferences(models, dto);
    await this.assertNoLessonConflicts(models, dto);
    const lesson = await models.lessonModel.create(dto);
    return this.findLesson(lesson.id);
  }

  async updateLesson(id: string, dto: UpdateScheduleLessonDto) {
    const models = await this.getScheduleModels();
    const lesson = await models.lessonModel.findByPk(id);
    if (!lesson) {
      throw new NotFoundException('Nie znaleziono zajęć.');
    }

    const nextLesson: LessonLike = {
      date: dto.date ?? lesson.date,
      startHour: dto.startHour ?? lesson.startHour,
      startMinute: dto.startMinute ?? lesson.startMinute,
      lessonHours: dto.lessonHours ?? lesson.lessonHours,
      teacherId: dto.teacherId ?? lesson.teacherId,
      subjectId: dto.subjectId ?? lesson.subjectId,
      roomId: dto.roomId ?? lesson.roomId,
      groupId: dto.groupId ?? lesson.groupId,
      classTypeId: dto.classTypeId ?? lesson.classTypeId,
      noteId: dto.noteId ?? lesson.noteId,
    };

    await this.validateLessonReferences(models, nextLesson);
    await this.assertNoLessonConflicts(models, nextLesson, id);
    await lesson.update(dto);
    return this.findLesson(id);
  }

  async deleteLesson(id: string) {
    const models = await this.getScheduleModels();
    const lesson = await models.lessonModel.findByPk(id);
    if (!lesson) {
      throw new NotFoundException('Nie znaleziono zajęć.');
    }
    await lesson.destroy();
    return { deleted: true, id };
  }

  async findLesson(id: string) {
    const models = await this.getScheduleModels();
    const lesson = await models.lessonModel.findByPk(id, { include: this.lessonIncludes(models) });
    if (!lesson) {
      throw new NotFoundException('Nie znaleziono zajęć.');
    }
    return this.mapLesson(lesson);
  }

  private lessonIncludes(models: ScheduleDatabaseModels) {
    return [
      { model: models.teacherModel, as: 'teacher' },
      { model: models.subjectModel, as: 'subject' },
      { model: models.locationModel, as: 'room' },
      { model: models.groupModel, as: 'group' },
      { model: models.classTypeModel, as: 'classType' },
      { model: models.noteModel, as: 'note' },
    ];
  }

  private async validateLessonReferences(models: ScheduleDatabaseModels, dto: LessonLike): Promise<void> {
    const [teacher, subject, room, group, classType, note] = await Promise.all([
      models.teacherModel.findByPk(dto.teacherId),
      models.subjectModel.findByPk(dto.subjectId),
      models.locationModel.findByPk(dto.roomId),
      models.groupModel.findByPk(dto.groupId),
      models.classTypeModel.findByPk(dto.classTypeId),
      dto.noteId ? models.noteModel.findByPk(dto.noteId) : Promise.resolve(true),
    ]);

    if (!teacher || !subject || !room || !group || !classType || !note) {
      throw new NotFoundException('Jedna z wybranych pozycji słownikowych nie istnieje.');
    }
    if (room.type !== ScheduleLocationType.ROOM) {
      throw new ConflictException('Wybrana lokalizacja nie jest salą.');
    }
  }

  private async validateParentLocation(models: ScheduleDatabaseModels, dto: LocationLike): Promise<void> {
    if (dto.type === ScheduleLocationType.BUILDING && dto.parentId) {
      throw new ConflictException('Budynek nie może mieć budynku nadrzędnego.');
    }
    if (dto.type === ScheduleLocationType.ROOM && !dto.parentId) {
      throw new ConflictException('Sala musi mieć wskazany budynek.');
    }
    if (dto.parentId) {
      const parent = await models.locationModel.findByPk(dto.parentId);
      if (!parent || parent.type !== ScheduleLocationType.BUILDING) {
        throw new NotFoundException('Nie znaleziono budynku nadrzędnego.');
      }
    }
  }

  private async validateUniqueBuildingName(
    models: ScheduleDatabaseModels,
    dto: LocationLike,
    ignoredLocationId?: string,
  ): Promise<void> {
    if (dto.type !== ScheduleLocationType.BUILDING) {
      return;
    }

    const existingBuilding = await models.locationModel.findOne({
      where: {
        ...(ignoredLocationId ? { id: { [Op.ne]: ignoredLocationId } } : {}),
        name: dto.name,
        type: ScheduleLocationType.BUILDING,
        active: true,
      },
    });

    if (existingBuilding) {
      throw new ConflictException('Budynek o podanej nazwie już istnieje.');
    }
  }

  private async validateUniqueRoomName(
    models: ScheduleDatabaseModels,
    dto: LocationLike,
    ignoredLocationId?: string,
  ): Promise<void> {
    if (dto.type !== ScheduleLocationType.ROOM || !dto.parentId) {
      return;
    }

    const existingRoom = await models.locationModel.findOne({
      where: {
        ...(ignoredLocationId ? { id: { [Op.ne]: ignoredLocationId } } : {}),
        name: dto.name,
        type: ScheduleLocationType.ROOM,
        parentId: dto.parentId,
        active: true,
      },
    });

    if (existingRoom) {
      throw new ConflictException('Sala o podanej nazwie juz istnieje w tym budynku.');
    }
  }

  private async validateUniqueClassTypeName(
    models: ScheduleDatabaseModels,
    name: string,
    ignoredClassTypeId?: string,
  ): Promise<void> {
    const existingClassType = await models.classTypeModel.findOne({
      where: {
        ...(ignoredClassTypeId ? { id: { [Op.ne]: ignoredClassTypeId } } : {}),
        name,
        active: true,
      },
    });

    if (existingClassType) {
      throw new ConflictException('Forma zajec o podanej nazwie juz istnieje.');
    }
  }

  private async validateUniqueSubjectName(
    models: ScheduleDatabaseModels,
    name: string,
    ignoredSubjectId?: string,
  ): Promise<void> {
    const existingSubject = await models.subjectModel.findOne({
      where: {
        ...(ignoredSubjectId ? { id: { [Op.ne]: ignoredSubjectId } } : {}),
        name,
        active: true,
      },
    });

    if (existingSubject) {
      throw new ConflictException('Przedmiot o podanej nazwie juz istnieje.');
    }
  }

  private async validateUniqueAcademicYearName(
    name: string,
    ignoredAcademicYearId?: string,
  ): Promise<void> {
    const existingAcademicYear = await this.academicYearModel.findOne({
      where: {
        ...(ignoredAcademicYearId ? { id: { [Op.ne]: ignoredAcademicYearId } } : {}),
        name,
        active: true,
      },
    });

    if (existingAcademicYear) {
      throw new ConflictException('Rocznik nauczania o podanej nazwie juz istnieje.');
    }
  }

  private validateAcademicYearDatabaseName(name: string): string {
    const databaseName = name.trim();
    if (!databaseName) {
      throw new BadRequestException('Podaj nazwe rocznika nauczania.');
    }
    if (databaseName.length > 63) {
      throw new BadRequestException('Nazwa rocznika nauczania moze miec maksymalnie 63 znaki.');
    }
    if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
      throw new BadRequestException(
        'Nazwa rocznika nauczania moze zawierac tylko litery, cyfry i znak podkreslenia.',
      );
    }

    return databaseName;
  }

  private async validateAcademicYearDatabaseDoesNotExist(databaseName: string): Promise<void> {
    const existingDatabases = await this.sequelize.query<{ exists: number }>(
      'SELECT 1 AS "exists" FROM pg_database WHERE datname = :databaseName LIMIT 1',
      {
        replacements: { databaseName },
        type: QueryTypes.SELECT,
      },
    );

    if (existingDatabases.length > 0) {
      throw new ConflictException('Baza danych dla tego rocznika nauczania juz istnieje.');
    }
  }

  private async createAcademicYearDatabase(databaseName: string): Promise<void> {
    try {
      await this.sequelize.query(`CREATE DATABASE ${this.quoteDatabaseIdentifier(databaseName)}`);
    } catch {
      throw new BadRequestException(
        'Nie udalo sie utworzyc bazy danych dla rocznika. Sprawdz uprawnienia PostgreSQL.',
      );
    }
  }

  private async renameAcademicYearDatabase(fromName: string, toName: string): Promise<void> {
    try {
      await this.sequelize.query(
        `ALTER DATABASE ${this.quoteDatabaseIdentifier(fromName)} RENAME TO ${this.quoteDatabaseIdentifier(toName)}`,
      );
    } catch {
      throw new BadRequestException('Nie udalo sie zmienic nazwy bazy danych rocznika.');
    }
  }

  private async dropAcademicYearDatabase(databaseName: string): Promise<void> {
    try {
      await this.sequelize.query(`DROP DATABASE IF EXISTS ${this.quoteDatabaseIdentifier(databaseName)}`);
    } catch {
      return;
    }
  }

  private async syncAcademicYearScheduleTables(databaseName: string): Promise<void> {
    const scheduleDatabase = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      logging: false,
    });

    try {
      this.defineScheduleModels(scheduleDatabase);
      await scheduleDatabase.authenticate();
      await scheduleDatabase.sync();
    } finally {
      await scheduleDatabase.close();
    }
  }

  private quoteDatabaseIdentifier(databaseName: string): string {
    return `"${databaseName.replace(/"/g, '""')}"`;
  }

  private async ensureAcademicYearActivityColumns(): Promise<void> {
    await this.sequelize.query(
      'ALTER TABLE "schedule_academic_years" ADD COLUMN IF NOT EXISTS "activeForDesigner" BOOLEAN NOT NULL DEFAULT false',
    );
    await this.sequelize.query(
      'ALTER TABLE "schedule_academic_years" ADD COLUMN IF NOT EXISTS "activeForStudent" BOOLEAN NOT NULL DEFAULT false',
    );
  }

  private mainScheduleModels(): ScheduleDatabaseModels {
    return {
      subjectModel: this.subjectModel,
      teacherModel: this.teacherModel,
      teacherSubjectModel: this.teacherSubjectModel,
      classTypeModel: this.classTypeModel,
      noteModel: this.noteModel,
      locationModel: this.locationModel,
      groupModel: this.groupModel,
      lessonModel: this.lessonModel,
    };
  }

  private async getScheduleModels(): Promise<ScheduleDatabaseModels> {
    const activeAcademicYear = await this.academicYearModel.findOne({
      where: { active: true, activeForDesigner: true },
      order: [['updatedAt', 'DESC']],
    });

    if (!activeAcademicYear) {
      return this.mainScheduleModels();
    }

    return this.getAcademicYearScheduleModels(activeAcademicYear.name);
  }

  private async getAcademicYearScheduleModels(databaseName: string): Promise<ScheduleDatabaseModels> {
    const cachedDatabase = this.academicYearDatabases.get(databaseName);
    if (cachedDatabase) {
      return cachedDatabase.models;
    }

    const sequelize = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      logging: false,
    });
    const models = this.defineScheduleModels(sequelize);
    await sequelize.authenticate();
    this.academicYearDatabases.set(databaseName, { sequelize, models });
    return models;
  }

  private defineScheduleModels(sequelize: Sequelize): ScheduleDatabaseModels {
    const uuidPrimaryKey = () => ({
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      unique: true,
      defaultValue: DataTypes.UUIDV4,
    });
    const activeColumn = {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    };

    const subjectModel = sequelize.define(
      'ScheduleSubject',
      {
        id: uuidPrimaryKey(),
        name: { type: DataTypes.STRING(160), allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_subjects' },
    );
    const teacherModel = sequelize.define(
      'ScheduleTeacher',
      {
        id: uuidPrimaryKey(),
        title: { type: DataTypes.STRING(40), allowNull: true },
        firstName: { type: DataTypes.STRING(80), allowNull: false },
        lastName: { type: DataTypes.STRING(100), allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_teachers' },
    );
    const teacherSubjectModel = sequelize.define(
      'ScheduleTeacherSubject',
      {
        id: uuidPrimaryKey(),
        teacherId: { type: DataTypes.UUID, allowNull: false },
        subjectId: { type: DataTypes.UUID, allowNull: false },
      },
      { tableName: 'schedule_teacher_subjects' },
    );
    const classTypeModel = sequelize.define(
      'ScheduleClassType',
      {
        id: uuidPrimaryKey(),
        name: { type: DataTypes.STRING(80), allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_class_types' },
    );
    const noteModel = sequelize.define(
      'ScheduleNote',
      {
        id: uuidPrimaryKey(),
        text: { type: DataTypes.STRING(200), allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_notes' },
    );
    const locationModel = sequelize.define(
      'ScheduleLocation',
      {
        id: uuidPrimaryKey(),
        name: { type: DataTypes.STRING(140), allowNull: false },
        type: { type: DataTypes.STRING(20), allowNull: false },
        parentId: { type: DataTypes.UUID, allowNull: true },
        active: activeColumn,
      },
      { tableName: 'schedule_locations' },
    );
    const groupModel = sequelize.define(
      'ScheduleAcademicGroup',
      {
        id: uuidPrimaryKey(),
        name: { type: DataTypes.STRING(220), allowNull: false },
        level: { type: DataTypes.STRING(30), allowNull: false },
        parentId: { type: DataTypes.UUID, allowNull: true },
        active: activeColumn,
      },
      { tableName: 'schedule_academic_groups' },
    );
    const lessonModel = sequelize.define(
      'ScheduleLesson',
      {
        id: uuidPrimaryKey(),
        date: { type: DataTypes.DATEONLY, allowNull: false },
        startHour: { type: DataTypes.INTEGER, allowNull: false },
        startMinute: { type: DataTypes.INTEGER, allowNull: false },
        lessonHours: { type: DataTypes.INTEGER, allowNull: false },
        teacherId: { type: DataTypes.UUID, allowNull: false },
        subjectId: { type: DataTypes.UUID, allowNull: false },
        roomId: { type: DataTypes.UUID, allowNull: false },
        groupId: { type: DataTypes.UUID, allowNull: false },
        classTypeId: { type: DataTypes.UUID, allowNull: false },
        noteId: { type: DataTypes.UUID, allowNull: true },
      },
      { tableName: 'schedule_lessons' },
    );

    teacherSubjectModel.belongsTo(teacherModel, { foreignKey: 'teacherId', as: 'teacher' });
    teacherSubjectModel.belongsTo(subjectModel, { foreignKey: 'subjectId', as: 'subject' });
    locationModel.belongsTo(locationModel, { foreignKey: 'parentId', as: 'parent' });
    locationModel.hasMany(locationModel, { foreignKey: 'parentId', as: 'children' });
    groupModel.belongsTo(groupModel, { foreignKey: 'parentId', as: 'parent' });
    groupModel.hasMany(groupModel, { foreignKey: 'parentId', as: 'children' });
    lessonModel.belongsTo(teacherModel, { foreignKey: 'teacherId', as: 'teacher' });
    lessonModel.belongsTo(subjectModel, { foreignKey: 'subjectId', as: 'subject' });
    lessonModel.belongsTo(locationModel, { foreignKey: 'roomId', as: 'room' });
    lessonModel.belongsTo(groupModel, { foreignKey: 'groupId', as: 'group' });
    lessonModel.belongsTo(classTypeModel, { foreignKey: 'classTypeId', as: 'classType' });
    lessonModel.belongsTo(noteModel, { foreignKey: 'noteId', as: 'note' });

    return {
      subjectModel,
      teacherModel,
      teacherSubjectModel,
      classTypeModel,
      noteModel,
      locationModel,
      groupModel,
      lessonModel,
    };
  }

  private async findActiveAcademicYear(id: string): Promise<ScheduleAcademicYear> {
    const academicYear = await this.academicYearModel.findOne({
      where: { id, active: true },
    });

    if (!academicYear) {
      throw new NotFoundException('Nie znaleziono rocznika nauczania.');
    }

    return academicYear;
  }

  private async validateUniqueNoteText(
    models: ScheduleDatabaseModels,
    text: string,
    ignoredNoteId?: string,
  ): Promise<void> {
    const existingNote = await models.noteModel.findOne({
      where: {
        ...(ignoredNoteId ? { id: { [Op.ne]: ignoredNoteId } } : {}),
        text,
        active: true,
      },
    });

    if (existingNote) {
      throw new ConflictException('Uwaga o podanej tresci juz istnieje.');
    }
  }

  private async validateParentGroup(models: ScheduleDatabaseModels, dto: AcademicGroupLike): Promise<void> {
    if (dto.level === ScheduleGroupLevel.COURSE && dto.parentId) {
      throw new ConflictException('Kierunek nie może mieć elementu nadrzędnego.');
    }
    if (dto.level !== ScheduleGroupLevel.COURSE && !dto.parentId) {
      throw new ConflictException('Specjalność albo grupa musi mieć element nadrzędny.');
    }
    if (!dto.parentId) {
      return;
    }

    const parent = await models.groupModel.findByPk(dto.parentId);
    if (!parent) {
      throw new NotFoundException('Nie znaleziono nadrzędnej pozycji kierunku.');
    }
    if (dto.level === ScheduleGroupLevel.SPECIALIZATION && parent.level !== ScheduleGroupLevel.COURSE) {
      throw new ConflictException('Specjalność musi należeć do kierunku.');
    }
    if (dto.level === ScheduleGroupLevel.GROUP && parent.level !== ScheduleGroupLevel.SPECIALIZATION) {
      throw new ConflictException('Grupa musi należeć do specjalności.');
    }
  }

  private async validateUniqueAcademicGroupName(
    models: ScheduleDatabaseModels,
    dto: AcademicGroupLike,
    ignoredGroupId?: string,
  ): Promise<void> {
    const where: any = {
      ...(ignoredGroupId ? { id: { [Op.ne]: ignoredGroupId } } : {}),
      name: dto.name,
      level: dto.level,
      active: true,
    };

    if (dto.level !== ScheduleGroupLevel.COURSE) {
      where.parentId = dto.parentId;
    }

    const existingGroup = await models.groupModel.findOne({ where });
    if (!existingGroup) {
      return;
    }

    if (dto.level === ScheduleGroupLevel.COURSE) {
      throw new ConflictException('Kierunek o podanej nazwie juz istnieje.');
    }
    if (dto.level === ScheduleGroupLevel.SPECIALIZATION) {
      throw new ConflictException('Specjalnosc o podanej nazwie juz istnieje w tym kierunku.');
    }

    throw new ConflictException('Grupa o podanej nazwie juz istnieje w tej specjalnosci.');
  }

  private async assertNoLessonConflicts(
    models: ScheduleDatabaseModels,
    dto: LessonLike,
    ignoredLessonId?: string,
  ): Promise<void> {
    const lessons = await models.lessonModel.findAll({
      where: {
        date: dto.date,
        ...(ignoredLessonId ? { id: { [Op.ne]: ignoredLessonId } } : {}),
      },
      include: this.lessonIncludes(models),
    });
    const start = this.toMinutes(dto.startHour, dto.startMinute);
    const end = start + dto.lessonHours * this.lessonMinutes;
    const relatedGroupIds = await this.getGroupConflictIds(models, dto.groupId);

    const conflicts = {
      teacher: [],
      room: [],
      group: [],
    };

    for (const lesson of lessons) {
      const lessonStart = this.toMinutes(lesson.startHour, lesson.startMinute);
      const lessonEnd = lessonStart + lesson.lessonHours * this.lessonMinutes;
      if (!this.overlaps(start, end, lessonStart, lessonEnd)) {
        continue;
      }

      if (lesson.teacherId === dto.teacherId) {
        conflicts.teacher.push(this.mapConflict(lesson));
      }
      if (lesson.roomId === dto.roomId) {
        conflicts.room.push(this.mapConflict(lesson));
      }
      if (relatedGroupIds.has(lesson.groupId)) {
        conflicts.group.push(this.mapConflict(lesson));
      }
    }

    if (conflicts.teacher.length || conflicts.room.length || conflicts.group.length) {
      throw new ConflictException({
        message: 'Termin koliduje z istniejącymi zajęciami.',
        conflicts,
      });
    }
  }

  private async findOccupiedRoomIds(
    models: ScheduleDatabaseModels,
    date: string,
    startHour: number,
    startMinute: number,
    lessonHours: number,
  ): Promise<Set<string>> {
    const lessons = await models.lessonModel.findAll({ where: { date } });
    const start = this.toMinutes(startHour, startMinute);
    const end = start + lessonHours * this.lessonMinutes;

    return lessons.reduce((ids, lesson) => {
      const lessonStart = this.toMinutes(lesson.startHour, lesson.startMinute);
      const lessonEnd = lessonStart + lesson.lessonHours * this.lessonMinutes;
      if (this.overlaps(start, end, lessonStart, lessonEnd)) {
        ids.add(lesson.roomId);
      }
      return ids;
    }, new Set<string>());
  }

  private mapLesson(lesson: ScheduleLesson) {
    const startTime = this.formatTime(lesson.startHour, lesson.startMinute);
    const endTime = this.addLessonHours(lesson.startHour, lesson.startMinute, lesson.lessonHours);

    return {
      id: lesson.id,
      date: lesson.date,
      weekday: this.weekday(lesson.date),
      startHour: lesson.startHour,
      startMinute: lesson.startMinute,
      lessonHours: lesson.lessonHours,
      startTime,
      endTime,
      teacherId: lesson.teacherId,
      subjectId: lesson.subjectId,
      roomId: lesson.roomId,
      groupId: lesson.groupId,
      classTypeId: lesson.classTypeId,
      noteId: lesson.noteId,
      teacher: lesson.teacher ? this.mapTeacher(lesson.teacher) : null,
      subject: lesson.subject,
      room: lesson.room,
      group: lesson.group,
      classType: lesson.classType,
      note: lesson.note,
    };
  }

  private mapTeacher(teacher: ScheduleTeacher) {
    const fullName = [teacher.title, teacher.firstName, teacher.lastName]
      .filter(Boolean)
      .join(' ');
    return { ...teacher.toJSON(), fullName };
  }

  private mapConflict(lesson: ScheduleLesson) {
    return {
      id: lesson.id,
      date: lesson.date,
      time: `${this.formatTime(lesson.startHour, lesson.startMinute)}-${this.addLessonHours(
        lesson.startHour,
        lesson.startMinute,
        lesson.lessonHours,
      )}`,
      teacher: lesson.teacher ? this.mapTeacher(lesson.teacher).fullName : null,
      subject: lesson.subject?.name ?? null,
      room: lesson.room?.name ?? null,
      group: lesson.group?.name ?? null,
    };
  }

  private async getGroupConflictIds(
    models: ScheduleDatabaseModels,
    groupId: string,
  ): Promise<Set<string>> {
    const groups: any[] = await models.groupModel.findAll({ where: { active: true } });
    const byId = new Map(groups.map((group) => [group.id, group]));
    const ids = new Set<string>([groupId]);

    let current = byId.get(groupId);
    while (current?.parentId) {
      ids.add(current.parentId);
      current = byId.get(current.parentId);
    }

    for (const id of this.findDescendantIds(groupId, groups)) {
      ids.add(id);
    }

    return ids;
  }

  private async getGroupAndDescendantIds(
    models: ScheduleDatabaseModels,
    groupId: string,
  ): Promise<string[]> {
    const groups: any[] = await models.groupModel.findAll({ where: { active: true } });
    return [groupId, ...this.findDescendantIds(groupId, groups)];
  }

  private findDescendantIds(groupId: string, groups: any[]): string[] {
    const direct = groups.filter((group) => group.parentId === groupId);
    return direct.flatMap((group) => [group.id, ...this.findDescendantIds(group.id, groups)]);
  }

  private toMinutes(hour: number, minute: number): number {
    return hour * 60 + minute;
  }

  private overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && end > otherStart;
  }

  private addLessonHours(hour: number, minute: number, lessonHours: number): string {
    const total = this.toMinutes(hour, minute) + lessonHours * this.lessonMinutes;
    return this.formatTime(Math.floor(total / 60), total % 60);
  }

  private formatTime(hour: number, minute: number): string {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  private weekday(date: string): string {
    const labels = [
      'Niedziela',
      'Poniedziałek',
      'Wtorek',
      'Środa',
      'Czwartek',
      'Piątek',
      'Sobota',
    ];
    return labels[new Date(`${date}T00:00:00`).getDay()];
  }

  private range(from: number, to: number, step = 1): number[] {
    const values = [];
    for (let value = from; value <= to; value += step) {
      values.push(value);
    }
    return values;
  }

  private async seedDefaultDictionaries(): Promise<void> {
    const count = await this.subjectModel.count();
    if (count > 0) {
      return;
    }

    const [lecture, exercises, lab] = await Promise.all([
      this.classTypeModel.create({ name: 'wykład' }),
      this.classTypeModel.create({ name: 'ćwiczenia audytoryjne' }),
      this.classTypeModel.create({ name: 'laboratorium' }),
    ]);
    const note = await this.noteModel.create({ text: 'bez uwag' });

    const [technology, pedagogy, psychology] = await Promise.all([
      this.subjectModel.create({ name: 'Technologie informacyjne' }),
      this.subjectModel.create({ name: 'Pedagogika ogólna' }),
      this.subjectModel.create({ name: 'Psychologia ogólna' }),
    ]);

    const [teacherOne, teacherTwo] = await Promise.all([
      this.teacherModel.create({
        title: 'dr',
        firstName: 'Anna',
        lastName: 'Bajorek',
      }),
      this.teacherModel.create({
        title: 'mgr',
        firstName: 'Piotr',
        lastName: 'Karaś',
      }),
    ]);

    await Promise.all([
      this.teacherSubjectModel.create({ teacherId: teacherOne.id, subjectId: technology.id }),
      this.teacherSubjectModel.create({ teacherId: teacherOne.id, subjectId: pedagogy.id }),
      this.teacherSubjectModel.create({ teacherId: teacherTwo.id, subjectId: psychology.id }),
    ]);

    const [buildingOne, buildingTwo] = await Promise.all([
      this.locationModel.create({
        name: 'Ul. Ks. Jałowego 24',
        type: ScheduleLocationType.BUILDING,
      }),
      this.locationModel.create({
        name: 'ul. Kasprowicza 1',
        type: ScheduleLocationType.BUILDING,
      }),
    ]);

    const [room109, room110] = await Promise.all([
      this.locationModel.create({
        name: '109',
        type: ScheduleLocationType.ROOM,
        parentId: buildingOne.id,
      }),
      this.locationModel.create({
        name: '110',
        type: ScheduleLocationType.ROOM,
        parentId: buildingOne.id,
      }),
      this.locationModel.create({
        name: 'sala 2',
        type: ScheduleLocationType.ROOM,
        parentId: buildingTwo.id,
      }),
    ]);

    const course = await this.groupModel.create({
      name: 'Pedagogika I stopnia st. stacjonarne',
      level: ScheduleGroupLevel.COURSE,
    });
    const specialization = await this.groupModel.create({
      name: 'Pedagogika opiekuńczo-wychowawcza',
      level: ScheduleGroupLevel.SPECIALIZATION,
      parentId: course.id,
    });
    const group = await this.groupModel.create({
      name: 'Grupa 1',
      level: ScheduleGroupLevel.GROUP,
      parentId: specialization.id,
    });

    const existingLessonCount = await this.lessonModel.count();
    if (existingLessonCount === 0) {
      await Promise.all([
        this.lessonModel.create({
          date: '2026-10-05',
          startHour: 8,
          startMinute: 0,
          lessonHours: 2,
          teacherId: teacherOne.id,
          subjectId: technology.id,
          roomId: room109.id,
          groupId: specialization.id,
          classTypeId: lab.id,
          noteId: note.id,
        }),
        this.lessonModel.create({
          date: '2026-10-05',
          startHour: 9,
          startMinute: 45,
          lessonHours: 2,
          teacherId: teacherTwo.id,
          subjectId: psychology.id,
          roomId: room110.id,
          groupId: group.id,
          classTypeId: lecture.id,
          noteId: note.id,
        }),
        this.lessonModel.create({
          date: '2026-10-06',
          startHour: 11,
          startMinute: 30,
          lessonHours: 2,
          teacherId: teacherOne.id,
          subjectId: pedagogy.id,
          roomId: room109.id,
          groupId: group.id,
          classTypeId: exercises.id,
          noteId: note.id,
        }),
      ]);
    }
  }
}
