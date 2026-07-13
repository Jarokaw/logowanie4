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
  CreateScheduleCourseTeacherDto,
  CreateScheduleLessonDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleStudyTrackDto,
  CreateScheduleStudyTrackSpecializationDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  CreateScheduleTeacherSubjectDto,
  ImportScheduleAcademicYearBackupDto,
  ScheduleLessonFilters,
  UpdateScheduleAcademicGroupDto,
  UpdateScheduleAcademicYearDto,
  UpdateScheduleClassTypeDto,
  UpdateScheduleLessonDto,
  UpdateScheduleLocationDto,
  UpdateScheduleNoteDto,
  UpdateScheduleStudyTrackDto,
  UpdateScheduleSubjectDto,
  UpdateScheduleTeacherDto,
} from './dto/schedule.dto';
import {
  ScheduleAcademicGroup,
  ScheduleGroupLevel,
  ScheduleStudyMode,
} from './models/schedule-academic-group.model';
import { ScheduleAcademicYear } from './models/schedule-academic-year.model';
import { ScheduleClassType } from './models/schedule-class-type.model';
import {
  ScheduleLocation,
  ScheduleLocationType,
} from './models/schedule-location.model';
import { ScheduleNote } from './models/schedule-note.model';
import { ScheduleCourseTeacher } from './models/schedule-course-teacher.model';
import { ScheduleStudyTrack } from './models/schedule-study-track.model';
import { ScheduleStudyTrackSpecialization } from './models/schedule-study-track-specialization.model';
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
type StudyTrackLike = Pick<CreateScheduleStudyTrackDto, 'name' | 'courseId'>;
type ScheduleDatabaseModels = {
  subjectModel: any;
  teacherModel: any;
  courseTeacherModel: any;
  teacherSubjectModel: any;
  classTypeModel: any;
  noteModel: any;
  locationModel: any;
  groupModel: any;
  studyTrackModel: any;
  studyTrackSpecializationModel: any;
  lessonModel: any;
};

type CachedScheduleDatabase = {
  sequelize: Sequelize;
  models: ScheduleDatabaseModels;
};

type BackupTableColumn = {
  columnName: string;
  dataType: string;
  udtSchema: string;
  udtName: string;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: 'YES' | 'NO';
  columnDefault: string | null;
};

type BackupTable = {
  tableName: string;
};

type BackupPrimaryKeyColumn = {
  columnName: string;
};

type BackupSequence = {
  sequenceName: string;
};

type BackupSequenceState = {
  lastValue: string | number;
  isCalled: boolean;
};

type BackupEnumRow = {
  enumSchema: string;
  enumName: string;
  enumLabel: string;
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
    @InjectModel(ScheduleCourseTeacher)
    private readonly courseTeacherModel: typeof ScheduleCourseTeacher,
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
    @InjectModel(ScheduleStudyTrack)
    private readonly studyTrackModel: typeof ScheduleStudyTrack,
    @InjectModel(ScheduleStudyTrackSpecialization)
    private readonly studyTrackSpecializationModel: typeof ScheduleStudyTrackSpecialization,
    @InjectModel(ScheduleAcademicYear)
    private readonly academicYearModel: typeof ScheduleAcademicYear,
    @InjectModel(ScheduleLesson)
    private readonly lessonModel: typeof ScheduleLesson,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAcademicYearActivityColumns();
    await this.ensureScheduleAcademicGroupStudyModeColumn(this.sequelize);
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
      studyTracks,
      studyTrackSpecializations,
      courseTeachers,
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
      models.studyTrackModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      models.studyTrackSpecializationModel.findAll({
        where: { active: true },
        include: [{ model: models.groupModel, as: 'specialization' }],
        order: [['createdAt', 'ASC']],
      }),
      models.courseTeacherModel.findAll({
        include: [
          {
            model: models.groupModel,
            as: 'course',
            where: { active: true, level: ScheduleGroupLevel.COURSE },
          },
          { model: models.teacherModel, as: 'teacher', where: { active: true } },
        ],
        order: [['createdAt', 'ASC']],
      }),
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
      studyTracks,
      studyTrackSpecializations,
      courseTeachers: courseTeachers.map((link) => this.mapCourseTeacher(link)),
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

  async findTeacherSubjects(teacherId: string) {
    const models = await this.getScheduleModels();
    await this.findActiveTeacher(models, teacherId);

    const links = await models.teacherSubjectModel.findAll({
      where: { teacherId },
      include: [{ model: models.subjectModel, as: 'subject', where: { active: true } }],
    });

    return this.sortTeacherSubjectLinks(links).map((link) => this.mapTeacherSubject(link));
  }

  async findCourseTeachers(courseId: string) {
    const models = await this.getScheduleModels();
    await this.findActiveCourse(models, courseId);

    const links = await models.courseTeacherModel.findAll({
      where: { courseId },
      include: [{ model: models.teacherModel, as: 'teacher', where: { active: true } }],
    });

    return this.sortCourseTeacherLinks(links).map((link) => this.mapCourseTeacher(link));
  }

  async findAcademicYears(): Promise<ScheduleAcademicYear[]> {
    return this.academicYearModel.findAll({
      where: { active: true },
      order: [['name', 'ASC']],
    });
  }

  async backupAcademicYearDatabase(id: string): Promise<{ fileName: string; sql: string }> {
    const academicYear = await this.findActiveAcademicYear(id);
    const databaseName = this.validateAcademicYearDatabaseName(academicYear.name);
    const backupDatabase = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      logging: false,
    });

    try {
      await backupDatabase.authenticate();
      const sql = await this.createDatabaseBackupSql(backupDatabase, databaseName);
      return {
        fileName: `${databaseName}_backup_${this.backupTimestamp()}.sql`,
        sql,
      };
    } catch {
      throw new BadRequestException('Nie udalo sie przygotowac backupu bazy rocznika.');
    } finally {
      await backupDatabase.close();
    }
  }

  async importAcademicYearDatabase(
    id: string,
    dto: ImportScheduleAcademicYearBackupDto,
  ): Promise<ScheduleAcademicYear> {
    const academicYear = await this.findActiveAcademicYear(id);
    const databaseName = this.validateAcademicYearDatabaseName(academicYear.name);
    const backupSql = this.validateAcademicYearBackupSql(dto.sql);

    await this.closeCachedAcademicYearDatabase(databaseName);

    const importDatabase = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      logging: false,
    });

    let transaction: any = null;
    try {
      await importDatabase.authenticate();
      transaction = await importDatabase.transaction();
      await importDatabase.query(backupSql, { transaction });
      await transaction.commit();
      transaction = null;
      await this.ensureScheduleAcademicGroupStudyModeColumn(importDatabase);
      await this.closeCachedAcademicYearDatabase(databaseName);
      return academicYear.reload();
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      throw new BadRequestException(
        `Nie udalo sie zaimportowac backupu rocznika. ${this.databaseErrorText(error)}`,
      );
    } finally {
      await importDatabase.close();
    }
  }

  async findStudyTracks(courseId?: string): Promise<ScheduleStudyTrack[]> {
    const models = await this.getScheduleModels();
    const where: any = { active: true };
    if (courseId) {
      where.courseId = courseId;
    }

    return models.studyTrackModel.findAll({
      where,
      include: [{ model: models.groupModel, as: 'course' }],
      order: [['name', 'ASC']],
    });
  }

  async findStudyTrackSpecializations(studyTrackId: string) {
    const models = await this.getScheduleModels();
    await this.findActiveStudyTrack(models, studyTrackId);

    return models.studyTrackSpecializationModel.findAll({
      where: { studyTrackId, active: true },
      include: [{ model: models.groupModel, as: 'specialization' }],
      order: [['createdAt', 'ASC']],
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

  async createTeacherSubject(dto: CreateScheduleTeacherSubjectDto) {
    const models = await this.getScheduleModels();
    await Promise.all([
      this.findActiveTeacher(models, dto.teacherId),
      this.findActiveSubject(models, dto.subjectId),
    ]);

    const existingLink = await models.teacherSubjectModel.findOne({
      where: { teacherId: dto.teacherId, subjectId: dto.subjectId },
    });

    if (existingLink) {
      return this.findTeacherSubjectById(models, existingLink.id);
    }

    const link = await models.teacherSubjectModel.create(dto);
    return this.findTeacherSubjectById(models, link.id);
  }

  async deleteTeacherSubject(id: string) {
    const models = await this.getScheduleModels();
    const link = await models.teacherSubjectModel.findByPk(id);
    if (!link) {
      throw new NotFoundException('Nie znaleziono powiązania wykładowcy z przedmiotem.');
    }

    const teacherId = link.teacherId;
    const subjectId = link.subjectId;
    await link.destroy();
    return { deleted: true, id, teacherId, subjectId };
  }

  async createCourseTeacher(dto: CreateScheduleCourseTeacherDto) {
    const models = await this.getScheduleModels();
    await Promise.all([
      this.findActiveCourse(models, dto.courseId),
      this.findActiveTeacher(models, dto.teacherId),
    ]);

    const existingLink = await models.courseTeacherModel.findOne({
      where: { courseId: dto.courseId, teacherId: dto.teacherId },
    });

    if (existingLink) {
      return this.findCourseTeacherById(models, existingLink.id);
    }

    const link = await models.courseTeacherModel.create(dto);
    return this.findCourseTeacherById(models, link.id);
  }

  async deleteCourseTeacher(id: string) {
    const models = await this.getScheduleModels();
    const link = await models.courseTeacherModel.findByPk(id);
    if (!link) {
      throw new NotFoundException('Nie znaleziono powiązania kierunku z wykładowcą.');
    }

    const courseId = link.courseId;
    const teacherId = link.teacherId;
    await link.destroy();
    return { deleted: true, id, courseId, teacherId };
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

  async createStudyTrack(dto: CreateScheduleStudyTrackDto) {
    const models = await this.getScheduleModels();
    await this.validateStudyTrackCourse(models, dto.courseId);
    await this.validateUniqueStudyTrackName(models, dto);
    return models.studyTrackModel.create(dto);
  }

  async updateStudyTrack(id: string, dto: UpdateScheduleStudyTrackDto) {
    const models = await this.getScheduleModels();
    const studyTrack = await models.studyTrackModel.findByPk(id);
    if (!studyTrack) {
      throw new NotFoundException('Nie znaleziono toku.');
    }

    const nextStudyTrack: StudyTrackLike = {
      name: dto.name ?? studyTrack.name,
      courseId: dto.courseId ?? studyTrack.courseId,
    };

    await this.validateStudyTrackCourse(models, nextStudyTrack.courseId);
    await this.validateUniqueStudyTrackName(models, nextStudyTrack, id);
    await studyTrack.update(dto);
    return studyTrack;
  }

  async addStudyTrackSpecialization(
    studyTrackId: string,
    dto: CreateScheduleStudyTrackSpecializationDto,
  ) {
    const models = await this.getScheduleModels();
    const studyTrack = await this.findActiveStudyTrack(models, studyTrackId);
    await this.validateStudyTrackSpecialization(models, studyTrack, dto.specializationId);

    const existingLink = await models.studyTrackSpecializationModel.findOne({
      where: { studyTrackId, specializationId: dto.specializationId },
    });

    if (existingLink) {
      if (!existingLink.active) {
        await existingLink.update({ active: true });
      }

      return models.studyTrackSpecializationModel.findByPk(existingLink.id, {
        include: [{ model: models.groupModel, as: 'specialization' }],
      });
    }

    const link = await models.studyTrackSpecializationModel.create({
      studyTrackId,
      specializationId: dto.specializationId,
    });

    return models.studyTrackSpecializationModel.findByPk(link.id, {
      include: [{ model: models.groupModel, as: 'specialization' }],
    });
  }

  async removeStudyTrackSpecialization(studyTrackId: string, specializationId: string) {
    const models = await this.getScheduleModels();
    await this.findActiveStudyTrack(models, studyTrackId);

    const link = await models.studyTrackSpecializationModel.findOne({
      where: { studyTrackId, specializationId, active: true },
    });

    if (!link) {
      throw new NotFoundException('Nie znaleziono specjalnosci przypisanej do tego toku.');
    }

    await link.update({ active: false });
    return { deleted: true, studyTrackId, specializationId };
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

  private teacherSubjectIncludes(models: ScheduleDatabaseModels) {
    return [{ model: models.subjectModel, as: 'subject' }];
  }

  private courseTeacherIncludes(models: ScheduleDatabaseModels) {
    return [
      { model: models.groupModel, as: 'course' },
      { model: models.teacherModel, as: 'teacher' },
    ];
  }

  private async findTeacherSubjectById(models: ScheduleDatabaseModels, id: string) {
    const link = await models.teacherSubjectModel.findByPk(id, {
      include: this.teacherSubjectIncludes(models),
    });
    if (!link) {
      throw new NotFoundException('Nie znaleziono powiązania wykładowcy z przedmiotem.');
    }

    return this.mapTeacherSubject(link);
  }

  private async findCourseTeacherById(models: ScheduleDatabaseModels, id: string) {
    const link = await models.courseTeacherModel.findByPk(id, {
      include: this.courseTeacherIncludes(models),
    });
    if (!link) {
      throw new NotFoundException('Nie znaleziono powiązania kierunku z wykładowcą.');
    }

    return this.mapCourseTeacher(link);
  }

  private async findActiveTeacher(models: ScheduleDatabaseModels, teacherId: string) {
    const teacher = await models.teacherModel.findByPk(teacherId);
    if (!teacher || !teacher.active) {
      throw new NotFoundException('Nie znaleziono wykładowcy.');
    }

    return teacher;
  }

  private async findActiveCourse(models: ScheduleDatabaseModels, courseId: string) {
    const course = await models.groupModel.findByPk(courseId);
    if (!course || !course.active || course.level !== ScheduleGroupLevel.COURSE) {
      throw new NotFoundException('Nie znaleziono kierunku.');
    }

    return course;
  }

  private async findActiveSubject(models: ScheduleDatabaseModels, subjectId: string) {
    const subject = await models.subjectModel.findByPk(subjectId);
    if (!subject || !subject.active) {
      throw new NotFoundException('Nie znaleziono przedmiotu.');
    }

    return subject;
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
      await this.sequelize.query(
        `CREATE DATABASE ${this.quoteDatabaseIdentifier(databaseName)} WITH TEMPLATE template0`,
      );
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
      await this.ensureScheduleAcademicGroupStudyModeColumn(scheduleDatabase);
    } finally {
      await scheduleDatabase.close();
    }
  }

  private async createDatabaseBackupSql(
    sequelize: Sequelize,
    databaseName: string,
  ): Promise<string> {
    const tables = await sequelize.query<BackupTable>(
      `SELECT table_name AS "tableName"
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      { type: QueryTypes.SELECT },
    );
    const lines = [
      `-- Backup bazy ${databaseName}`,
      `-- Wygenerowano: ${new Date().toISOString()}`,
      "SET client_encoding = 'UTF8';",
      'SET standard_conforming_strings = on;',
      'CREATE SCHEMA IF NOT EXISTS "public";',
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
      '',
    ];

    await this.appendBackupEnumDefinitions(sequelize, lines);
    await this.appendBackupSequenceDefinitions(sequelize, lines);

    if (tables.length === 0) {
      lines.push('-- Baza nie zawiera tabel w schemacie public.');
      return `${lines.join('\n')}\n`;
    }

    for (const table of tables) {
      await this.appendBackupTableSql(sequelize, table.tableName, lines);
    }

    await this.appendBackupSequenceValues(sequelize, lines);
    return `${lines.join('\n')}\n`;
  }

  private validateAcademicYearBackupSql(sql: string): string {
    const backupSql = (sql ?? '').replace(/^\uFEFF/, '').trim();
    if (!backupSql) {
      throw new BadRequestException('Wybierz niepusty plik backupu SQL.');
    }

    if (!backupSql.startsWith('-- Backup bazy ')) {
      throw new BadRequestException('Plik nie wyglada na backup wygenerowany przez aplikacje.');
    }

    if (!/CREATE\s+TABLE\s+"public"\."schedule_subjects"/i.test(backupSql)) {
      throw new BadRequestException('Backup nie zawiera wymaganych tabel planu zajec.');
    }

    const forbiddenPatterns = [
      /\bCREATE\s+DATABASE\b/i,
      /\bDROP\s+DATABASE\b/i,
      /\bALTER\s+DATABASE\b/i,
      /\bCOMMIT\b/i,
      /\bROLLBACK\b/i,
      /\bCOPY\b[\s\S]*\bFROM\s+PROGRAM\b/i,
      /\\connect\b/i,
      /\\c\b/i,
    ];
    if (forbiddenPatterns.some((pattern) => pattern.test(backupSql))) {
      throw new BadRequestException('Backup zawiera niedozwolone polecenia SQL.');
    }

    return backupSql;
  }

  private async closeCachedAcademicYearDatabase(databaseName: string): Promise<void> {
    const cachedDatabase = this.academicYearDatabases.get(databaseName);
    if (!cachedDatabase) {
      return;
    }

    this.academicYearDatabases.delete(databaseName);
    try {
      await cachedDatabase.sequelize.close();
    } catch {
      return;
    }
  }

  private databaseErrorText(error: unknown): string {
    const databaseError = error as {
      parent?: { message?: string };
      original?: { message?: string };
      message?: string;
    };

    return databaseError.parent?.message ?? databaseError.original?.message ?? databaseError.message ?? '';
  }

  private async appendBackupEnumDefinitions(
    sequelize: Sequelize,
    lines: string[],
  ): Promise<void> {
    const enumRows = await sequelize.query<BackupEnumRow>(
      `SELECT namespace.nspname AS "enumSchema",
              enum_type.typname AS "enumName",
              enum_value.enumlabel AS "enumLabel"
       FROM pg_type enum_type
       JOIN pg_enum enum_value ON enum_value.enumtypid = enum_type.oid
       JOIN pg_namespace namespace ON namespace.oid = enum_type.typnamespace
       WHERE namespace.nspname = 'public'
       ORDER BY namespace.nspname, enum_type.typname, enum_value.enumsortorder`,
      { type: QueryTypes.SELECT },
    );

    if (enumRows.length === 0) {
      return;
    }

    const enums = new Map<string, BackupEnumRow[]>();
    for (const enumRow of enumRows) {
      const key = `${enumRow.enumSchema}.${enumRow.enumName}`;
      enums.set(key, [...(enums.get(key) ?? []), enumRow]);
    }

    lines.push('-- Typy ENUM');
    for (const enumValues of enums.values()) {
      const [firstValue] = enumValues;
      const enumIdentifier = this.qualifiedSqlIdentifier(
        firstValue.enumSchema,
        firstValue.enumName,
      );
      const labels = enumValues.map((enumValue) => this.sqlLiteral(enumValue.enumLabel));
      lines.push(
        `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type enum_type
    JOIN pg_namespace namespace ON namespace.oid = enum_type.typnamespace
    WHERE enum_type.typname = ${this.sqlLiteral(firstValue.enumName)}
      AND namespace.nspname = ${this.sqlLiteral(firstValue.enumSchema)}
  ) THEN
    CREATE TYPE ${enumIdentifier} AS ENUM (${labels.join(', ')});
  END IF;
END $$;`,
      );
    }
    lines.push('');
  }

  private async appendBackupSequenceDefinitions(
    sequelize: Sequelize,
    lines: string[],
  ): Promise<void> {
    const sequences = await this.findBackupSequences(sequelize);
    if (sequences.length === 0) {
      return;
    }

    lines.push('-- Sekwencje');
    for (const sequence of sequences) {
      const sequenceIdentifier = this.qualifiedSqlIdentifier('public', sequence.sequenceName);
      lines.push(`DROP SEQUENCE IF EXISTS ${sequenceIdentifier} CASCADE;`);
      lines.push(`CREATE SEQUENCE ${sequenceIdentifier};`);
    }
    lines.push('');
  }

  private async appendBackupTableSql(
    sequelize: Sequelize,
    tableName: string,
    lines: string[],
  ): Promise<void> {
    const columns = await this.findBackupTableColumns(sequelize, tableName);
    if (columns.length === 0) {
      return;
    }

    const tableIdentifier = this.qualifiedSqlIdentifier('public', tableName);
    const primaryKeyColumns = await this.findBackupPrimaryKeyColumns(sequelize, tableName);
    const columnDefinitions = columns.map((column) => {
      const defaultDefinition = column.columnDefault
        ? ` DEFAULT ${column.columnDefault}`
        : '';
      const nullableDefinition = column.isNullable === 'NO' ? ' NOT NULL' : '';
      return `  ${this.quoteSqlIdentifier(column.columnName)} ${this.backupColumnType(
        column,
      )}${defaultDefinition}${nullableDefinition}`;
    });

    lines.push(`-- Tabela ${tableName}`);
    lines.push(`DROP TABLE IF EXISTS ${tableIdentifier} CASCADE;`);
    lines.push(`CREATE TABLE ${tableIdentifier} (`);
    lines.push(columnDefinitions.join(',\n'));
    lines.push(');');

    if (primaryKeyColumns.length > 0) {
      const primaryKeyIdentifier = this.quoteSqlIdentifier(`${tableName}_pkey`);
      const primaryKeyColumnList = primaryKeyColumns
        .map((column) => this.quoteSqlIdentifier(column.columnName))
        .join(', ');
      lines.push(
        `ALTER TABLE ${tableIdentifier} ADD CONSTRAINT ${primaryKeyIdentifier} PRIMARY KEY (${primaryKeyColumnList});`,
      );
    }

    await this.appendBackupTableRows(sequelize, tableName, columns, lines);
    lines.push('');
  }

  private async appendBackupTableRows(
    sequelize: Sequelize,
    tableName: string,
    columns: BackupTableColumn[],
    lines: string[],
  ): Promise<void> {
    const tableIdentifier = this.qualifiedSqlIdentifier('public', tableName);
    const columnNames = columns.map((column) => column.columnName);
    const columnList = columnNames.map((columnName) => this.quoteSqlIdentifier(columnName)).join(', ');
    const primaryKeyColumns = await this.findBackupPrimaryKeyColumns(sequelize, tableName);
    const orderBy = primaryKeyColumns.length
      ? ` ORDER BY ${primaryKeyColumns
          .map((column) => this.quoteSqlIdentifier(column.columnName))
          .join(', ')}`
      : '';
    const rows = await sequelize.query<Record<string, unknown>>(
      `SELECT ${columnList} FROM ${tableIdentifier}${orderBy}`,
      { type: QueryTypes.SELECT },
    );

    if (rows.length === 0) {
      lines.push(`-- Brak danych w tabeli ${tableName}.`);
      return;
    }

    for (const row of rows) {
      const values = columnNames.map((columnName) => this.sqlLiteral(row[columnName]));
      lines.push(`INSERT INTO ${tableIdentifier} (${columnList}) VALUES (${values.join(', ')});`);
    }
  }

  private async appendBackupSequenceValues(
    sequelize: Sequelize,
    lines: string[],
  ): Promise<void> {
    const sequences = await this.findBackupSequences(sequelize);
    if (sequences.length === 0) {
      return;
    }

    lines.push('-- Wartosci sekwencji');
    for (const sequence of sequences) {
      const sequenceIdentifier = this.qualifiedSqlIdentifier('public', sequence.sequenceName);
      const [state] = await sequelize.query<BackupSequenceState>(
        `SELECT last_value AS "lastValue", is_called AS "isCalled" FROM ${sequenceIdentifier}`,
        { type: QueryTypes.SELECT },
      );
      if (!state) {
        continue;
      }

      lines.push(
        `SELECT setval(${this.sqlLiteral(`public.${sequence.sequenceName}`)}, ${state.lastValue}, ${
          state.isCalled ? 'true' : 'false'
        });`,
      );
    }
    lines.push('');
  }

  private findBackupTableColumns(
    sequelize: Sequelize,
    tableName: string,
  ): Promise<BackupTableColumn[]> {
    return sequelize.query<BackupTableColumn>(
      `SELECT column_name AS "columnName",
              data_type AS "dataType",
              udt_schema AS "udtSchema",
              udt_name AS "udtName",
              character_maximum_length AS "characterMaximumLength",
              numeric_precision AS "numericPrecision",
              numeric_scale AS "numericScale",
              is_nullable AS "isNullable",
              column_default AS "columnDefault"
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = :tableName
       ORDER BY ordinal_position`,
      {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      },
    );
  }

  private findBackupPrimaryKeyColumns(
    sequelize: Sequelize,
    tableName: string,
  ): Promise<BackupPrimaryKeyColumn[]> {
    return sequelize.query<BackupPrimaryKeyColumn>(
      `SELECT attribute.attname AS "columnName"
       FROM pg_class table_class
       JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
       JOIN pg_index index_info ON index_info.indrelid = table_class.oid
       JOIN pg_attribute attribute
         ON attribute.attrelid = table_class.oid
        AND attribute.attnum = ANY(index_info.indkey)
       WHERE namespace.nspname = 'public'
         AND table_class.relname = :tableName
         AND index_info.indisprimary
       ORDER BY array_position(index_info.indkey, attribute.attnum)`,
      {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      },
    );
  }

  private findBackupSequences(sequelize: Sequelize): Promise<BackupSequence[]> {
    return sequelize.query<BackupSequence>(
      `SELECT sequence_name AS "sequenceName"
       FROM information_schema.sequences
       WHERE sequence_schema = 'public'
       ORDER BY sequence_name`,
      { type: QueryTypes.SELECT },
    );
  }

  private backupColumnType(column: BackupTableColumn): string {
    if (column.dataType === 'USER-DEFINED') {
      return this.qualifiedSqlIdentifier(column.udtSchema, column.udtName);
    }

    if (column.dataType === 'character varying' && column.characterMaximumLength) {
      return `character varying(${column.characterMaximumLength})`;
    }

    if (column.dataType === 'character' && column.characterMaximumLength) {
      return `character(${column.characterMaximumLength})`;
    }

    if (column.dataType === 'numeric' && column.numericPrecision) {
      return column.numericScale
        ? `numeric(${column.numericPrecision}, ${column.numericScale})`
        : `numeric(${column.numericPrecision})`;
    }

    return column.dataType;
  }

  private backupTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  private qualifiedSqlIdentifier(schemaName: string, identifier: string): string {
    return `${this.quoteSqlIdentifier(schemaName)}.${this.quoteSqlIdentifier(identifier)}`;
  }

  private quoteSqlIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private sqlLiteral(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (value instanceof Date) {
      return `'${value.toISOString().replace(/'/g, "''")}'`;
    }

    if (Buffer.isBuffer(value)) {
      return `decode('${value.toString('hex')}', 'hex')`;
    }

    if (Array.isArray(value)) {
      return `ARRAY[${value.map((item) => this.sqlLiteral(item)).join(', ')}]`;
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : 'NULL';
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'object') {
      return this.sqlLiteral(JSON.stringify(value));
    }

    return `'${String(value).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
  }

  private quoteDatabaseIdentifier(databaseName: string): string {
    return this.quoteSqlIdentifier(databaseName);
  }

  private async ensureAcademicYearActivityColumns(): Promise<void> {
    await this.sequelize.query(
      'ALTER TABLE "schedule_academic_years" ADD COLUMN IF NOT EXISTS "activeForDesigner" BOOLEAN NOT NULL DEFAULT false',
    );
    await this.sequelize.query(
      'ALTER TABLE "schedule_academic_years" ADD COLUMN IF NOT EXISTS "activeForStudent" BOOLEAN NOT NULL DEFAULT false',
    );
  }

  private async ensureScheduleAcademicGroupStudyModeColumn(sequelize: Sequelize): Promise<void> {
    await sequelize.query(
      `ALTER TABLE "schedule_academic_groups"
       ADD COLUMN IF NOT EXISTS "studyMode" VARCHAR(30) NOT NULL DEFAULT '${ScheduleStudyMode.UNASSIGNED}'`,
    );
    await sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'schedule_academic_groups_study_mode_allowed'
         ) THEN
           ALTER TABLE "schedule_academic_groups"
           ADD CONSTRAINT "schedule_academic_groups_study_mode_allowed"
           CHECK ("studyMode" IN (
             '${ScheduleStudyMode.UNASSIGNED}',
             '${ScheduleStudyMode.FULL_TIME}',
             '${ScheduleStudyMode.PART_TIME}',
             '${ScheduleStudyMode.POSTGRADUATE}'
           ));
         END IF;
       END $$`,
    );
    await sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'schedule_academic_groups_study_mode_course_only'
         ) THEN
           ALTER TABLE "schedule_academic_groups"
           ADD CONSTRAINT "schedule_academic_groups_study_mode_course_only"
           CHECK ("level" = '${ScheduleGroupLevel.COURSE}' OR "studyMode" = '${ScheduleStudyMode.UNASSIGNED}');
         END IF;
       END $$`,
    );
  }

  private mainScheduleModels(): ScheduleDatabaseModels {
    return {
      subjectModel: this.subjectModel,
      teacherModel: this.teacherModel,
      courseTeacherModel: this.courseTeacherModel,
      teacherSubjectModel: this.teacherSubjectModel,
      classTypeModel: this.classTypeModel,
      noteModel: this.noteModel,
      locationModel: this.locationModel,
      groupModel: this.groupModel,
      studyTrackModel: this.studyTrackModel,
      studyTrackSpecializationModel: this.studyTrackSpecializationModel,
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
    await sequelize.sync();
    await this.ensureScheduleAcademicGroupStudyModeColumn(sequelize);
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
    const courseTeacherModel = sequelize.define(
      'ScheduleCourseTeacher',
      {
        id: uuidPrimaryKey(),
        courseId: { type: DataTypes.UUID, allowNull: false },
        teacherId: { type: DataTypes.UUID, allowNull: false },
      },
      { tableName: 'schedule_course_teachers' },
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
        studyMode: {
          type: DataTypes.STRING(30),
          allowNull: false,
          defaultValue: ScheduleStudyMode.UNASSIGNED,
        },
        parentId: { type: DataTypes.UUID, allowNull: true },
        active: activeColumn,
      },
      { tableName: 'schedule_academic_groups' },
    );
    const studyTrackModel = sequelize.define(
      'ScheduleStudyTrack',
      {
        id: uuidPrimaryKey(),
        name: { type: DataTypes.STRING(160), allowNull: false },
        courseId: { type: DataTypes.UUID, allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_study_tracks' },
    );
    const studyTrackSpecializationModel = sequelize.define(
      'ScheduleStudyTrackSpecialization',
      {
        id: uuidPrimaryKey(),
        studyTrackId: { type: DataTypes.UUID, allowNull: false },
        specializationId: { type: DataTypes.UUID, allowNull: false },
        active: activeColumn,
      },
      { tableName: 'schedule_study_track_specializations' },
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
    courseTeacherModel.belongsTo(groupModel, { foreignKey: 'courseId', as: 'course' });
    courseTeacherModel.belongsTo(teacherModel, { foreignKey: 'teacherId', as: 'teacher' });
    locationModel.belongsTo(locationModel, { foreignKey: 'parentId', as: 'parent' });
    locationModel.hasMany(locationModel, { foreignKey: 'parentId', as: 'children' });
    groupModel.belongsTo(groupModel, { foreignKey: 'parentId', as: 'parent' });
    groupModel.hasMany(groupModel, { foreignKey: 'parentId', as: 'children' });
    studyTrackModel.belongsTo(groupModel, { foreignKey: 'courseId', as: 'course' });
    groupModel.hasMany(studyTrackModel, { foreignKey: 'courseId', as: 'studyTracks' });
    studyTrackSpecializationModel.belongsTo(studyTrackModel, {
      foreignKey: 'studyTrackId',
      as: 'studyTrack',
    });
    studyTrackModel.hasMany(studyTrackSpecializationModel, {
      foreignKey: 'studyTrackId',
      as: 'specializations',
    });
    studyTrackSpecializationModel.belongsTo(groupModel, {
      foreignKey: 'specializationId',
      as: 'specialization',
    });
    groupModel.hasMany(studyTrackSpecializationModel, {
      foreignKey: 'specializationId',
      as: 'studyTrackLinks',
    });
    lessonModel.belongsTo(teacherModel, { foreignKey: 'teacherId', as: 'teacher' });
    lessonModel.belongsTo(subjectModel, { foreignKey: 'subjectId', as: 'subject' });
    lessonModel.belongsTo(locationModel, { foreignKey: 'roomId', as: 'room' });
    lessonModel.belongsTo(groupModel, { foreignKey: 'groupId', as: 'group' });
    lessonModel.belongsTo(classTypeModel, { foreignKey: 'classTypeId', as: 'classType' });
    lessonModel.belongsTo(noteModel, { foreignKey: 'noteId', as: 'note' });

    return {
      subjectModel,
      teacherModel,
      courseTeacherModel,
      teacherSubjectModel,
      classTypeModel,
      noteModel,
      locationModel,
      groupModel,
      studyTrackModel,
      studyTrackSpecializationModel,
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

  private async validateStudyTrackCourse(
    models: ScheduleDatabaseModels,
    courseId: string,
  ): Promise<void> {
    const course = await models.groupModel.findByPk(courseId);
    if (!course || !course.active || course.level !== ScheduleGroupLevel.COURSE) {
      throw new BadRequestException('Wybierz prawidlowy kierunek.');
    }
  }

  private async validateUniqueStudyTrackName(
    models: ScheduleDatabaseModels,
    dto: StudyTrackLike,
    ignoredStudyTrackId?: string,
  ): Promise<void> {
    const existingStudyTrack = await models.studyTrackModel.findOne({
      where: {
        ...(ignoredStudyTrackId ? { id: { [Op.ne]: ignoredStudyTrackId } } : {}),
        name: dto.name,
        courseId: dto.courseId,
        active: true,
      },
    });

    if (existingStudyTrack) {
      throw new ConflictException('Tok o podanej nazwie juz istnieje dla tego kierunku.');
    }
  }

  private async findActiveStudyTrack(
    models: ScheduleDatabaseModels,
    studyTrackId: string,
  ): Promise<any> {
    const studyTrack = await models.studyTrackModel.findByPk(studyTrackId);
    if (!studyTrack || !studyTrack.active) {
      throw new NotFoundException('Nie znaleziono toku.');
    }

    return studyTrack;
  }

  private async validateStudyTrackSpecialization(
    models: ScheduleDatabaseModels,
    studyTrack: any,
    specializationId: string,
  ): Promise<void> {
    const specialization = await models.groupModel.findByPk(specializationId);
    if (
      !specialization ||
      !specialization.active ||
      specialization.level !== ScheduleGroupLevel.SPECIALIZATION
    ) {
      throw new BadRequestException('Wybierz prawidlowa specjalnosc.');
    }

    if (specialization.parentId !== studyTrack.courseId) {
      throw new ConflictException('Specjalnosc musi nalezec do kierunku wybranego toku.');
    }
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

  private sortTeacherSubjectLinks(links: any[]) {
    return [...links].sort((first, second) =>
      (first.subject?.name ?? '').localeCompare(second.subject?.name ?? '', 'pl'),
    );
  }

  private sortCourseTeacherLinks(links: any[]) {
    return [...links].sort((first, second) => {
      const firstName = first.teacher ? this.mapTeacher(first.teacher).fullName : '';
      const secondName = second.teacher ? this.mapTeacher(second.teacher).fullName : '';
      return firstName.localeCompare(secondName, 'pl');
    });
  }

  private mapTeacherSubject(link: any) {
    return {
      id: link.id,
      teacherId: link.teacherId,
      subjectId: link.subjectId,
      subject: link.subject
        ? {
            id: link.subject.id,
            name: link.subject.name,
            active: link.subject.active,
          }
        : null,
    };
  }

  private mapCourseTeacher(link: any) {
    return {
      id: link.id,
      courseId: link.courseId,
      teacherId: link.teacherId,
      course: link.course
        ? {
            id: link.course.id,
            name: link.course.name,
            level: link.course.level,
            studyMode: link.course.studyMode,
            parentId: link.course.parentId,
            active: link.course.active,
          }
        : null,
      teacher: link.teacher ? this.mapTeacher(link.teacher) : null,
    };
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
