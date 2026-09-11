import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { DataTypes, Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  CreateScheduleAcademicGroupDto,
  CreateScheduleAcademicYearDto,
  CreateScheduleClassTypeDto,
  CreateScheduleCourseTeacherDto,
  CreateScheduleHolidayDto,
  CreateScheduleLessonDateShortcutDto,
  CreateScheduleLessonDto,
  CreateScheduleLessonRangeDto,
  CreateScheduleLessonTimeShortcutDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleStudyTrackDto,
  CreateScheduleStudyTrackSpecializationDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  CreateScheduleTeacherSubjectDto,
  ImportScheduleAcademicYearBackupDto,
  PreviewScheduleLessonRangeDto,
  ReorderScheduleLessonTimeShortcutsDto,
  ScheduleAcademicYearTransferSection,
  ScheduleLessonFilters,
  TransferScheduleAcademicYearDataDto,
  UpdateScheduleAcademicGroupDto,
  UpdateScheduleAcademicYearDto,
  UpdateScheduleClassTypeDto,
  UpdateScheduleLessonDateShortcutDto,
  UpdateScheduleLessonDto,
  UpdateScheduleLessonTimeShortcutDto,
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
import {
  ScheduleAcademicSemester,
  ScheduleAcademicYear,
} from './models/schedule-academic-year.model';
import { ScheduleClassType } from './models/schedule-class-type.model';
import {
  ScheduleHoliday,
  ScheduleHolidaySource,
} from './models/schedule-holiday.model';
import {
  ScheduleLocation,
  ScheduleLocationType,
} from './models/schedule-location.model';
import { ScheduleNote } from './models/schedule-note.model';
import { ScheduleCourseTeacher } from './models/schedule-course-teacher.model';
import { ScheduleStudyTrack } from './models/schedule-study-track.model';
import { ScheduleStudyTrackSpecialization } from './models/schedule-study-track-specialization.model';
import { ScheduleLesson, ScheduleLessonSource } from './models/schedule-lesson.model';
import { ScheduleLessonGeneration } from './models/schedule-lesson-generation.model';
import { ScheduleLessonRange } from './models/schedule-lesson-range.model';
import { ScheduleLessonDateShortcut } from './models/schedule-lesson-date-shortcut.model';
import { ScheduleLessonTimeShortcut } from './models/schedule-lesson-time-shortcut.model';
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

type LessonGenerationCandidate = LessonLike & {
  key: string;
  source: ScheduleLessonSource.LESSON_RANGE;
  generationId: string;
  sourceLessonId: string;
  detached: false;
  sourceLesson: any;
};

type LessonGenerationPlan = {
  range: any;
  generation: any | null;
  generationId: string;
  sourceWeekOneDate: string;
  sourceWeekTwoDate: string;
  sourceWeekOneCount: number;
  sourceWeekTwoCount: number;
  candidates: LessonGenerationCandidate[];
  toCreate: LessonGenerationCandidate[];
  toUpdate: Array<{ lesson: any; candidate: LessonGenerationCandidate }>;
  toDelete: any[];
  unchanged: LessonGenerationCandidate[];
  conflicts: any[];
  warnings: string[];
};

type LocationLike = Pick<CreateScheduleLocationDto, 'name' | 'type' | 'parentId'>;
type AcademicGroupLike = Pick<CreateScheduleAcademicGroupDto, 'name' | 'level' | 'parentId'>;
type StudyTrackLike = Pick<CreateScheduleStudyTrackDto, 'name' | 'courseId'>;
export type AcademicGroupDeletionChild = {
  id: string;
  name: string;
  level: ScheduleGroupLevel;
  studyMode: ScheduleStudyMode;
  parentId?: string;
  active: boolean;
  ownLessonCount: number;
  branchLessonCount: number;
  children: AcademicGroupDeletionChild[];
};
export type AcademicGroupDeletionCheck = {
  group: {
    id: string;
    name: string;
    level: ScheduleGroupLevel;
    studyMode: ScheduleStudyMode;
    parentId?: string;
    active: boolean;
  };
  children: AcademicGroupDeletionChild[];
  ownLessonCount: number;
  descendantLessonCount: number;
  totalLessonCount: number;
  descendantCount: number;
  hasChildren: boolean;
  canDelete: boolean;
};
export type AcademicGroupLessonDeletionStrategy = 'DELETE' | 'REASSIGN_UNASSIGNED';
export type ClassTypeDeletionCheck = {
  classType: {
    id: string;
    name: string;
    active: boolean;
  };
  lessonCount: number;
  canDelete: boolean;
};
export type ClassTypeLessonDeletionStrategy = 'DELETE' | 'REASSIGN_UNASSIGNED';
type ScheduleDatabaseModels = {
  subjectModel: any;
  teacherModel: any;
  courseTeacherModel: any;
  teacherSubjectModel: any;
  classTypeModel: any;
  holidayModel: any;
  noteModel: any;
  locationModel: any;
  groupModel: any;
  studyTrackModel: any;
  studyTrackSpecializationModel: any;
  lessonModel: any;
  lessonGenerationModel: any;
  lessonRangeModel: any;
  dateShortcutModel: any;
  shortcutModel: any;
};

type NagerHoliday = {
  date?: unknown;
  name?: unknown;
  countryCode?: unknown;
};

const POLISH_HOLIDAY_NAMES: Record<string, string> = {
  "New Year's Day": 'Nowy Rok',
  Epiphany: 'Święto Trzech Króli',
  'Easter Sunday': 'Wielkanoc',
  'Easter Monday': 'Poniedziałek Wielkanocny',
  'May Day': 'Święto Pracy',
  'Constitution Day': 'Święto Konstytucji 3 Maja',
  Pentecost: 'Zielone Świątki',
  'Corpus Christi': 'Boże Ciało',
  'Assumption Day': 'Wniebowzięcie Najświętszej Maryi Panny',
  "All Saints' Day": 'Wszystkich Świętych',
  'Independence Day': 'Narodowe Święto Niepodległości',
  'Christmas Eve': 'Wigilia Bożego Narodzenia',
  'Christmas Day': 'Boże Narodzenie',
  "St. Stephen's Day": 'Drugi dzień Bożego Narodzenia',
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

type AcademicYearTransferDefinition = {
  section: ScheduleAcademicYearTransferSection;
  label: string;
  tables: string[];
};

type AcademicYearTransferTableStatus = {
  section: ScheduleAcademicYearTransferSection;
  label: string;
  tableName: string;
  count: number;
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
    @InjectModel(ScheduleHoliday)
    private readonly holidayModel: typeof ScheduleHoliday,
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
    @InjectModel(ScheduleLessonGeneration)
    private readonly lessonGenerationModel: typeof ScheduleLessonGeneration,
    @InjectModel(ScheduleLessonRange)
    private readonly lessonRangeModel: typeof ScheduleLessonRange,
    @InjectModel(ScheduleLessonDateShortcut)
    private readonly dateShortcutModel: typeof ScheduleLessonDateShortcut,
    @InjectModel(ScheduleLessonTimeShortcut)
    private readonly shortcutModel: typeof ScheduleLessonTimeShortcut,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAcademicYearActivityColumns();
    await this.ensureAcademicYearSemesterColumn();
    await this.ensureScheduleAcademicGroupLevelSupportsWorkshop(this.sequelize);
    await this.ensureScheduleAcademicGroupStudyModeColumn(this.sequelize);
    await this.ensureScheduleLessonTimeShortcutSortOrderColumn(this.sequelize);
    await this.ensureScheduleLessonShortcutStudyModeColumns(this.sequelize);
    await this.ensureScheduleHolidaySourceColumn(this.sequelize);
    await this.ensureScheduleLessonGenerationColumns(this.sequelize);
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

  async findHolidays(year: number, refreshFromApi = false) {
    this.validateHolidayYear(year);
    const models = await this.getScheduleModels();

    if (!refreshFromApi) {
      return {
        year,
        source: 'DATABASE',
        updated: false,
        holidays: await this.findStoredHolidays(models.holidayModel, year),
      };
    }

    const downloadedHolidays = await this.downloadPolishHolidays(year);
    const updated = await this.synchronizeAutomaticHolidays(
      models.holidayModel,
      year,
      downloadedHolidays,
    );

    return {
      year,
      source: 'NAGER',
      updated,
      holidays: await this.findStoredHolidays(models.holidayModel, year),
    };
  }

  async createManualHoliday(dto: CreateScheduleHolidayDto) {
    this.validateManualHolidayDate(dto.date);
    const name = dto.name.trim();
    if (!name || name.length > 100) {
      throw new BadRequestException('Opis swieta musi zawierac od 1 do 100 znakow.');
    }

    const models = await this.getScheduleModels();
    const existingHoliday = await models.holidayModel.findOne({
      where: {
        date: dto.date,
        name: { [Op.iLike]: name },
      },
    });
    if (existingHoliday) {
      throw new ConflictException('Takie swieto jest juz zapisane dla wybranego dnia.');
    }

    try {
      return await models.holidayModel.create({
        date: dto.date,
        name,
        source: ScheduleHolidaySource.MANUAL,
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'SequelizeUniqueConstraintError') {
        throw new ConflictException('Takie swieto jest juz zapisane dla wybranego dnia.');
      }
      throw error;
    }
  }

  async deleteManualHoliday(id: string) {
    const models = await this.getScheduleModels();
    const holiday = await models.holidayModel.findOne({
      where: {
        id,
        source: ScheduleHolidaySource.MANUAL,
      },
    });
    if (!holiday) {
      throw new NotFoundException('Nie znaleziono recznie dodanego swieta.');
    }

    await holiday.destroy();
    return { deleted: true, id };
  }

  async findLessonRanges() {
    const models = await this.getScheduleModels();
    const groups: any[] = await models.groupModel.findAll({
      attributes: ['id', 'level', 'studyMode', 'parentId'],
      raw: true,
    });
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const fullTimeGroupIds = groups
      .filter((group) => {
        let current = group;
        const visited = new Set<string>();

        while (current && current.level !== ScheduleGroupLevel.COURSE) {
          if (!current.parentId || visited.has(current.id)) {
            return false;
          }
          visited.add(current.id);
          current = groupsById.get(current.parentId);
        }

        return current?.studyMode === ScheduleStudyMode.FULL_TIME;
      })
      .map((group) => group.id);

    const [lessons, range, holidays, generation, generatedLessonCount] = await Promise.all([
      fullTimeGroupIds.length
        ? models.lessonModel.findAll({
            attributes: ['date'],
            where: { groupId: { [Op.in]: fullTimeGroupIds } },
            raw: true,
          })
        : [],
      models.lessonRangeModel.findOne({
        attributes: ['id', 'startDate', 'endDate'],
        where: { key: 'DEFAULT' },
      }),
      models.holidayModel.findAll({
        attributes: ['id', 'date', 'name', 'source'],
        order: [
          ['date', 'ASC'],
          ['name', 'ASC'],
        ],
      }),
      models.lessonGenerationModel.findOne({
        attributes: ['id', 'sourceWeekOneDate', 'sourceWeekTwoDate', 'lastAppliedAt'],
        where: { key: 'DEFAULT' },
      }),
      models.lessonModel.count({
        where: { source: ScheduleLessonSource.LESSON_RANGE },
      }),
    ]);

    const lessonsByDate = new Map<string, number>();
    for (const lesson of lessons as Array<{ date: string }>) {
      lessonsByDate.set(lesson.date, (lessonsByDate.get(lesson.date) ?? 0) + 1);
    }

    return {
      lessonDates: Array.from(lessonsByDate, ([date, lessonCount]) => ({
        date,
        lessonCount,
      })).sort((first, second) => first.date.localeCompare(second.date)),
      range,
      generation,
      generatedLessonCount,
      holidays,
    };
  }

  async saveLessonRange(dto: CreateScheduleLessonRangeDto) {
    this.validateLessonRangeDate(dto.startDate);
    this.validateLessonRangeDate(dto.endDate);
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'Data końcowa zakresu nie może być wcześniejsza niż data początkowa.',
      );
    }

    const models = await this.getScheduleModels();
    const existingRange = await models.lessonRangeModel.findOne({
      where: { key: 'DEFAULT' },
    });
    if (existingRange) {
      await existingRange.update({
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
      return existingRange;
    }

    try {
      return await models.lessonRangeModel.create({
        key: 'DEFAULT',
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'SequelizeUniqueConstraintError') {
        const concurrentRange = await models.lessonRangeModel.findOne({
          where: { key: 'DEFAULT' },
        });
        if (concurrentRange) {
          await concurrentRange.update({
            startDate: dto.startDate,
            endDate: dto.endDate,
          });
          return concurrentRange;
        }
      }
      throw error;
    }
  }

  async previewLessonRange(dto: PreviewScheduleLessonRangeDto) {
    const models = await this.getScheduleModels();
    const plan = await this.buildLessonGenerationPlan(models, dto);
    return this.mapLessonGenerationPreview(plan);
  }

  async applyLessonRange(dto: PreviewScheduleLessonRangeDto) {
    const models = await this.getScheduleModels();
    const scheduleDatabase = models.lessonModel.sequelize as Sequelize;

    return scheduleDatabase.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (transaction) => {
        const plan = await this.buildLessonGenerationPlan(models, dto, transaction);
        const preview = this.mapLessonGenerationPreview(plan);
        if (plan.sourceWeekOneCount === 0 && plan.sourceWeekTwoCount === 0) {
          throw new BadRequestException({
            message: 'Wybrane tygodnie nie zawierają zajęć wzorcowych.',
            preview,
          });
        }
        if (plan.conflicts.length > 0) {
          throw new ConflictException({
            message: 'Nie naniesiono zajęć. Najpierw rozwiąż wykazane konflikty.',
            preview,
          });
        }

        if (plan.toDelete.length > 0) {
          await models.lessonModel.destroy({
            where: { id: { [Op.in]: plan.toDelete.map((lesson) => lesson.id) } },
            transaction,
          });
        }
        for (const { lesson, candidate } of plan.toUpdate) {
          await lesson.update(this.lessonGenerationPayload(candidate), { transaction });
        }
        if (plan.toCreate.length > 0) {
          await models.lessonModel.bulkCreate(
            plan.toCreate.map((candidate) => this.lessonGenerationPayload(candidate)),
            { transaction },
          );
        }

        const generationPayload = {
          key: 'DEFAULT',
          sourceWeekOneDate: plan.sourceWeekOneDate,
          sourceWeekTwoDate: plan.sourceWeekTwoDate,
          lastAppliedAt: new Date(),
        };
        let generation = plan.generation;
        if (generation) {
          await generation.update(generationPayload, { transaction });
        } else {
          generation = await models.lessonGenerationModel.create(
            { id: plan.generationId, ...generationPayload },
            { transaction },
          );
        }

        return {
          ...preview,
          applied: true,
          generation: {
            id: generation.id,
            sourceWeekOneDate: generation.sourceWeekOneDate,
            sourceWeekTwoDate: generation.sourceWeekTwoDate,
            lastAppliedAt: generation.lastAppliedAt,
          },
        };
      },
    );
  }

  async deleteLessonRangeLessons() {
    const models = await this.getScheduleModels();
    const deletedCount = await models.lessonModel.destroy({
      where: { source: ScheduleLessonSource.LESSON_RANGE },
    });
    return { deleted: true, deletedCount };
  }

  private async buildLessonGenerationPlan(
    models: ScheduleDatabaseModels,
    dto: PreviewScheduleLessonRangeDto,
    transaction?: Transaction,
  ): Promise<LessonGenerationPlan> {
    this.validateLessonRangeDate(dto.sourceWeekOneDate);
    this.validateLessonRangeDate(dto.sourceWeekTwoDate);

    const sourceWeekOneDate = this.getMondayDate(dto.sourceWeekOneDate);
    const sourceWeekTwoDate = this.getMondayDate(dto.sourceWeekTwoDate);
    const sourceWeekOneEnd = this.addDays(sourceWeekOneDate, 4);
    const sourceWeekTwoEnd = this.addDays(sourceWeekTwoDate, 4);
    const range = await models.lessonRangeModel.findOne({
      where: { key: 'DEFAULT' },
      transaction,
    });
    if (!range) {
      throw new BadRequestException('Najpierw zapisz zakres zajęć.');
    }

    const generation = await models.lessonGenerationModel.findOne({
      where: { key: 'DEFAULT' },
      transaction,
    });
    const generationId = generation?.id ?? randomUUID();
    const [groups, holidays, sourceLessons, managedLessons, targetLessons] = await Promise.all([
      models.groupModel.findAll({
        attributes: ['id', 'level', 'studyMode', 'parentId'],
        raw: true,
        transaction,
      }),
      models.holidayModel.findAll({
        attributes: ['date'],
        where: { date: { [Op.between]: [range.startDate, range.endDate] } },
        raw: true,
        transaction,
      }),
      models.lessonModel.findAll({
        where: {
          source: ScheduleLessonSource.MANUAL,
          [Op.or]: [
            { date: { [Op.between]: [sourceWeekOneDate, sourceWeekOneEnd] } },
            { date: { [Op.between]: [sourceWeekTwoDate, sourceWeekTwoEnd] } },
          ],
        },
        include: this.lessonIncludes(models),
        transaction,
      }),
      generation
        ? models.lessonModel.findAll({
            where: {
              source: ScheduleLessonSource.LESSON_RANGE,
              generationId,
              detached: false,
            },
            transaction,
          })
        : [],
      models.lessonModel.findAll({
        where: { date: { [Op.between]: [range.startDate, range.endDate] } },
        include: this.lessonIncludes(models),
        transaction,
      }),
    ]);

    const groupsById = new Map<string, any>(groups.map((group: any) => [group.id, group]));
    const isFullTimeGroup = (groupId: string): boolean => {
      let current = groupsById.get(groupId);
      const visited = new Set<string>();
      while (current && current.level !== ScheduleGroupLevel.COURSE) {
        if (!current.parentId || visited.has(current.id)) {
          return false;
        }
        visited.add(current.id);
        current = groupsById.get(current.parentId);
      }
      return current?.studyMode === ScheduleStudyMode.FULL_TIME;
    };

    const fullTimeSourceLessons = sourceLessons.filter((lesson: any) =>
      isFullTimeGroup(lesson.groupId),
    );
    const sourceWeekOneLessons = fullTimeSourceLessons.filter(
      (lesson: any) => lesson.date >= sourceWeekOneDate && lesson.date <= sourceWeekOneEnd,
    );
    const sourceWeekTwoLessons = fullTimeSourceLessons.filter(
      (lesson: any) => lesson.date >= sourceWeekTwoDate && lesson.date <= sourceWeekTwoEnd,
    );
    const holidaysByDate = new Set<string>(holidays.map((holiday: any) => holiday.date));
    const candidates: LessonGenerationCandidate[] = [];
    const cycleStartMonday = this.getCycleStartMondayDate(range.startDate);

    for (
      let targetDate = range.startDate;
      targetDate <= range.endDate;
      targetDate = this.addDays(targetDate, 1)
    ) {
      const weekday = this.getIsoWeekday(targetDate);
      if (weekday > 5 || holidaysByDate.has(targetDate)) {
        continue;
      }

      const targetMonday = this.getMondayDate(targetDate);
      const weekIndex = Math.round(
        (this.parseIsoDate(targetMonday).getTime() - this.parseIsoDate(cycleStartMonday).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      );
      const cycleWeek = ((weekIndex % 2) + 2) % 2 === 0 ? 1 : 2;
      const templates = cycleWeek === 1 ? sourceWeekOneLessons : sourceWeekTwoLessons;

      for (const sourceLesson of templates) {
        if (this.getIsoWeekday(sourceLesson.date) !== weekday || sourceLesson.date === targetDate) {
          continue;
        }
        candidates.push({
          key: `${sourceLesson.id}:${targetDate}`,
          date: targetDate,
          startHour: sourceLesson.startHour,
          startMinute: sourceLesson.startMinute,
          lessonHours: sourceLesson.lessonHours,
          teacherId: sourceLesson.teacherId,
          subjectId: sourceLesson.subjectId,
          roomId: sourceLesson.roomId,
          groupId: sourceLesson.groupId,
          classTypeId: sourceLesson.classTypeId,
          noteId: sourceLesson.noteId ?? null,
          source: ScheduleLessonSource.LESSON_RANGE,
          generationId,
          sourceLessonId: sourceLesson.id,
          detached: false,
          sourceLesson,
        });
      }
    }

    const managedByKey = new Map<string, any>(
      managedLessons.map((lesson: any) => [`${lesson.sourceLessonId}:${lesson.date}`, lesson]),
    );
    const desiredKeys = new Set(candidates.map((candidate) => candidate.key));
    const toCreate: LessonGenerationCandidate[] = [];
    const toUpdate: Array<{ lesson: any; candidate: LessonGenerationCandidate }> = [];
    const unchanged: LessonGenerationCandidate[] = [];
    for (const candidate of candidates) {
      const existingLesson = managedByKey.get(candidate.key);
      if (!existingLesson) {
        toCreate.push(candidate);
      } else if (this.lessonGenerationHasChanges(existingLesson, candidate)) {
        toUpdate.push({ lesson: existingLesson, candidate });
      } else {
        unchanged.push(candidate);
      }
    }
    const toDelete = managedLessons.filter(
      (lesson: any) => !desiredKeys.has(`${lesson.sourceLessonId}:${lesson.date}`),
    );

    const managedIds = new Set(managedLessons.map((lesson: any) => lesson.id));
    const blockingLessons = targetLessons.filter((lesson: any) => !managedIds.has(lesson.id));
    const conflicts = this.findLessonGenerationConflicts(candidates, blockingLessons, groups);
    const warnings: string[] = [];
    if (sourceWeekOneLessons.length === 0) {
      warnings.push(
        'W wybranym wzorcu Tygodnia 1 nie ma ręcznie dodanych zajęć stacjonarnych.',
      );
    }
    if (sourceWeekTwoLessons.length === 0) {
      warnings.push(
        'W wybranym wzorcu Tygodnia 2 nie ma ręcznie dodanych zajęć stacjonarnych.',
      );
    }

    return {
      range,
      generation,
      generationId,
      sourceWeekOneDate,
      sourceWeekTwoDate,
      sourceWeekOneCount: sourceWeekOneLessons.length,
      sourceWeekTwoCount: sourceWeekTwoLessons.length,
      candidates,
      toCreate,
      toUpdate,
      toDelete,
      unchanged,
      conflicts,
      warnings,
    };
  }

  private findLessonGenerationConflicts(
    candidates: LessonGenerationCandidate[],
    blockingLessons: any[],
    groups: any[],
  ): any[] {
    const conflictMap = new Map<
      string,
      {
        candidate: LessonGenerationCandidate;
        reasons: Set<string>;
        lessons: Map<string, any>;
      }
    >();
    const relatedGroups = new Map<string, Set<string>>();
    const blockingLessonsByDate = new Map<string, any[]>();
    for (const lesson of blockingLessons) {
      const dateLessons = blockingLessonsByDate.get(lesson.date) ?? [];
      dateLessons.push(lesson);
      blockingLessonsByDate.set(lesson.date, dateLessons);
    }
    const candidatesByDate = new Map<string, LessonGenerationCandidate[]>();
    for (const candidate of candidates) {
      if (!relatedGroups.has(candidate.groupId)) {
        relatedGroups.set(
          candidate.groupId,
          this.getGroupConflictIdsFromList(candidate.groupId, groups),
        );
      }
      const dateCandidates = candidatesByDate.get(candidate.date) ?? [];
      dateCandidates.push(candidate);
      candidatesByDate.set(candidate.date, dateCandidates);
    }

    const addConflict = (
      candidate: LessonGenerationCandidate,
      reasons: string[],
      lessonKey: string,
      lesson: any,
    ) => {
      let conflict = conflictMap.get(candidate.key);
      if (!conflict) {
        conflict = {
          candidate,
          reasons: new Set<string>(),
          lessons: new Map<string, any>(),
        };
        conflictMap.set(candidate.key, conflict);
      }
      reasons.forEach((reason) => conflict?.reasons.add(reason));
      conflict.lessons.set(lessonKey, lesson);
    };

    for (const candidate of candidates) {
      const candidateStart = this.toMinutes(candidate.startHour, candidate.startMinute);
      const candidateEnd = candidateStart + candidate.lessonHours * this.lessonMinutes;
      for (const lesson of blockingLessonsByDate.get(candidate.date) ?? []) {
        const lessonStart = this.toMinutes(lesson.startHour, lesson.startMinute);
        const lessonEnd = lessonStart + lesson.lessonHours * this.lessonMinutes;
        if (!this.overlaps(candidateStart, candidateEnd, lessonStart, lessonEnd)) {
          continue;
        }
        const reasons = this.getLessonConflictReasons(
          candidate,
          lesson,
          relatedGroups.get(candidate.groupId) ?? new Set([candidate.groupId]),
        );
        if (reasons.length > 0) {
          addConflict(candidate, reasons, lesson.id, this.mapConflict(lesson));
        }
      }
    }

    for (const dateCandidates of candidatesByDate.values()) {
      for (let firstIndex = 0; firstIndex < dateCandidates.length; firstIndex += 1) {
        const first = dateCandidates[firstIndex];
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < dateCandidates.length;
          secondIndex += 1
        ) {
          const second = dateCandidates[secondIndex];
          const firstStart = this.toMinutes(first.startHour, first.startMinute);
          const firstEnd = firstStart + first.lessonHours * this.lessonMinutes;
          const secondStart = this.toMinutes(second.startHour, second.startMinute);
          const secondEnd = secondStart + second.lessonHours * this.lessonMinutes;
          if (!this.overlaps(firstStart, firstEnd, secondStart, secondEnd)) {
            continue;
          }
          const reasons = this.getLessonConflictReasons(
            first,
            second,
            relatedGroups.get(first.groupId) ?? new Set([first.groupId]),
          );
          if (reasons.length > 0) {
            addConflict(first, reasons, second.key, this.mapLessonGenerationCandidate(second));
            addConflict(second, reasons, first.key, this.mapLessonGenerationCandidate(first));
          }
        }
      }
    }

    return Array.from(conflictMap.values())
      .map((conflict) => ({
        candidate: this.mapLessonGenerationCandidate(conflict.candidate),
        reasons: Array.from(conflict.reasons),
        lessons: Array.from(conflict.lessons.values()),
      }))
      .sort((first, second) =>
        `${first.candidate.date}-${first.candidate.time}`.localeCompare(
          `${second.candidate.date}-${second.candidate.time}`,
        ),
      );
  }

  private getLessonConflictReasons(
    lesson: LessonLike,
    otherLesson: LessonLike,
    relatedGroupIds: Set<string>,
  ): string[] {
    const reasons: string[] = [];
    if (lesson.teacherId === otherLesson.teacherId) {
      reasons.push('Prowadzący');
    }
    if (lesson.roomId === otherLesson.roomId) {
      reasons.push('Sala');
    }
    if (relatedGroupIds.has(otherLesson.groupId)) {
      reasons.push('Grupa');
    }
    return reasons;
  }

  private getGroupConflictIdsFromList(groupId: string, groups: any[]): Set<string> {
    const byId = new Map<string, any>(groups.map((group) => [group.id, group]));
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

  private lessonGenerationHasChanges(
    lesson: any,
    candidate: LessonGenerationCandidate,
  ): boolean {
    const fields: Array<keyof LessonLike> = [
      'date',
      'startHour',
      'startMinute',
      'lessonHours',
      'teacherId',
      'subjectId',
      'roomId',
      'groupId',
      'classTypeId',
      'noteId',
    ];
    return fields.some((field) => (lesson[field] ?? null) !== (candidate[field] ?? null));
  }

  private lessonGenerationPayload(candidate: LessonGenerationCandidate) {
    return {
      date: candidate.date,
      startHour: candidate.startHour,
      startMinute: candidate.startMinute,
      lessonHours: candidate.lessonHours,
      teacherId: candidate.teacherId,
      subjectId: candidate.subjectId,
      roomId: candidate.roomId,
      groupId: candidate.groupId,
      classTypeId: candidate.classTypeId,
      noteId: candidate.noteId ?? null,
      source: candidate.source,
      generationId: candidate.generationId,
      sourceLessonId: candidate.sourceLessonId,
      detached: false,
    };
  }

  private mapLessonGenerationCandidate(candidate: LessonGenerationCandidate) {
    const sourceLesson = candidate.sourceLesson;
    return {
      sourceLessonId: candidate.sourceLessonId,
      date: candidate.date,
      time: `${this.formatTime(candidate.startHour, candidate.startMinute)}-${this.addLessonHours(
        candidate.startHour,
        candidate.startMinute,
        candidate.lessonHours,
      )}`,
      teacher: sourceLesson.teacher ? this.mapTeacher(sourceLesson.teacher).fullName : null,
      subject: sourceLesson.subject?.name ?? null,
      room: sourceLesson.room?.name ?? null,
      group: sourceLesson.group?.name ?? null,
      classType: sourceLesson.classType?.name ?? null,
    };
  }

  private mapLessonGenerationPreview(plan: LessonGenerationPlan) {
    return {
      range: {
        id: plan.range.id,
        startDate: plan.range.startDate,
        endDate: plan.range.endDate,
      },
      generation: plan.generation
        ? {
            id: plan.generation.id,
            sourceWeekOneDate: plan.generation.sourceWeekOneDate,
            sourceWeekTwoDate: plan.generation.sourceWeekTwoDate,
            lastAppliedAt: plan.generation.lastAppliedAt,
          }
        : null,
      sourceWeeks: {
        weekOne: { date: plan.sourceWeekOneDate, lessonCount: plan.sourceWeekOneCount },
        weekTwo: { date: plan.sourceWeekTwoDate, lessonCount: plan.sourceWeekTwoCount },
      },
      summary: {
        create: plan.toCreate.length,
        update: plan.toUpdate.length,
        delete: plan.toDelete.length,
        unchanged: plan.unchanged.length,
        conflicts: plan.conflicts.length,
      },
      warnings: plan.warnings,
      conflicts: plan.conflicts,
      canApply:
        (plan.sourceWeekOneCount > 0 || plan.sourceWeekTwoCount > 0) &&
        plan.conflicts.length === 0,
    };
  }

  async findLessonTimeShortcuts(requestedStudyMode?: string) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(requestedStudyMode);
    return models.shortcutModel.findAll({
      where: { studyMode },
      order: [
        ['sortOrder', 'ASC'],
        ['startHour', 'ASC'],
        ['startMinute', 'ASC'],
        ['lessonHours', 'ASC'],
      ],
    });
  }

  async createLessonTimeShortcut(dto: CreateScheduleLessonTimeShortcutDto) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(dto.studyMode);
    const existingShortcut = await models.shortcutModel.findOne({
      where: {
        startHour: dto.startHour,
        startMinute: dto.startMinute,
        lessonHours: dto.lessonHours,
        studyMode,
      },
    });

    if (existingShortcut) {
      throw new ConflictException('Taki skrot czasu juz istnieje.');
    }

    const highestSortOrder = Number(
      (await models.shortcutModel.max('sortOrder', { where: { studyMode } })) ?? -1,
    );
    return models.shortcutModel.create({
      ...dto,
      studyMode,
      sortOrder: Number.isFinite(highestSortOrder) ? highestSortOrder + 1 : 0,
    });
  }

  async reorderLessonTimeShortcuts(dto: ReorderScheduleLessonTimeShortcutsDto) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(dto.studyMode);
    const shortcuts = await models.shortcutModel.findAll({
      attributes: ['id'],
      where: { studyMode },
    });
    const existingIds = new Set(shortcuts.map((shortcut) => shortcut.id));

    if (
      dto.shortcutIds.length !== shortcuts.length ||
      dto.shortcutIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException('Lista skrótów do uporządkowania jest nieprawidłowa.');
    }

    const transaction = await models.shortcutModel.sequelize.transaction();
    try {
      await Promise.all(
        dto.shortcutIds.map((id, sortOrder) =>
          models.shortcutModel.update(
            { sortOrder },
            { where: { id, studyMode }, transaction },
          ),
        ),
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return this.findLessonTimeShortcuts(studyMode);
  }

  async updateLessonTimeShortcut(
    id: string,
    dto: UpdateScheduleLessonTimeShortcutDto,
  ) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(dto.studyMode);
    const shortcut = await models.shortcutModel.findByPk(id);
    if (!shortcut) {
      throw new NotFoundException('Nie znaleziono skrótu czasu.');
    }

    const existingShortcut = await models.shortcutModel.findOne({
      where: {
        id: { [Op.ne]: id },
        startHour: dto.startHour,
        startMinute: dto.startMinute,
        lessonHours: dto.lessonHours,
        studyMode,
      },
    });

    if (existingShortcut) {
      throw new ConflictException('Taki skrót czasu już istnieje.');
    }

    await shortcut.update({ ...dto, studyMode });
    return shortcut;
  }

  async deleteLessonTimeShortcut(id: string) {
    const models = await this.getScheduleModels();
    const shortcut = await models.shortcutModel.findByPk(id);
    if (!shortcut) {
      throw new NotFoundException('Nie znaleziono skrótu czasu.');
    }

    await shortcut.destroy();
    return { deleted: true, id };
  }

  async findLessonDateShortcuts(requestedStudyMode?: string) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(requestedStudyMode);
    const shortcuts = await models.dateShortcutModel.findAll({ where: { studyMode } });
    return this.sortLessonDateShortcuts(shortcuts);
  }

  async createLessonDateShortcut(dto: CreateScheduleLessonDateShortcutDto) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(dto.studyMode);
    this.validateLessonDateShortcutDate(dto.date);
    await this.validateUniqueLessonDateShortcut(models, dto.date, dto.week, studyMode);
    return models.dateShortcutModel.create({ ...dto, studyMode });
  }

  async updateLessonDateShortcut(
    id: string,
    dto: UpdateScheduleLessonDateShortcutDto,
  ) {
    const models = await this.getScheduleModels();
    const studyMode = this.resolveShortcutStudyMode(dto.studyMode);
    const shortcut = await models.dateShortcutModel.findByPk(id);
    if (!shortcut) {
      throw new NotFoundException('Nie znaleziono skrótu daty.');
    }

    this.validateLessonDateShortcutDate(dto.date);
    await this.validateUniqueLessonDateShortcut(models, dto.date, dto.week, studyMode, id);
    await shortcut.update({ ...dto, studyMode });
    return shortcut;
  }

  async deleteLessonDateShortcut(id: string) {
    const models = await this.getScheduleModels();
    const shortcut = await models.dateShortcutModel.findByPk(id);
    if (!shortcut) {
      throw new NotFoundException('Nie znaleziono skrótu daty.');
    }

    await shortcut.destroy();
    return { deleted: true, id };
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

  async transferAcademicYearData(
    targetAcademicYearId: string,
    dto: TransferScheduleAcademicYearDataDto,
  ) {
    const targetAcademicYear = await this.findActiveAcademicYear(targetAcademicYearId);
    const sourceAcademicYear = await this.findActiveAcademicYear(dto.sourceAcademicYearId);
    if (sourceAcademicYear.id === targetAcademicYear.id) {
      throw new BadRequestException('Baza zrodlowa musi byc inna niz baza docelowa.');
    }

    const transferDefinitions = this.academicYearTransferDefinitionsFor(dto.sections);
    const sourceDatabaseName = this.validateAcademicYearDatabaseName(sourceAcademicYear.name);
    const targetDatabaseName = this.validateAcademicYearDatabaseName(targetAcademicYear.name);

    await Promise.all([
      this.syncAcademicYearScheduleTables(sourceDatabaseName),
      this.syncAcademicYearScheduleTables(targetDatabaseName),
    ]);
    await this.closeCachedAcademicYearDatabase(targetDatabaseName);

    const sourceDatabase = this.createAcademicYearSequelize(sourceDatabaseName);
    const targetDatabase = this.createAcademicYearSequelize(targetDatabaseName);
    let transaction: any = null;

    try {
      await Promise.all([sourceDatabase.authenticate(), targetDatabase.authenticate()]);
      const nonEmptyTables = await this.findNonEmptyAcademicYearTransferTables(
        targetDatabase,
        transferDefinitions,
      );
      if (nonEmptyTables.length > 0) {
        throw new ConflictException(
          `Nie wykonano transferu. Tabele docelowe nie sa puste: ${nonEmptyTables
            .map((table) => `${table.label} (${table.tableName}: ${table.count})`)
            .join(', ')}.`,
        );
      }

      transaction = await targetDatabase.transaction();
      const transferred = [];
      for (const definition of this.sortAcademicYearTransferDefinitions(transferDefinitions)) {
        let rows = 0;
        for (const tableName of definition.tables) {
          rows += await this.copyAcademicYearTransferTable(
            sourceDatabase,
            targetDatabase,
            tableName,
            transaction,
          );
        }

        transferred.push({
          section: definition.section,
          label: definition.label,
          tables: definition.tables,
          rows,
        });
      }

      await transaction.commit();
      transaction = null;
      await this.closeCachedAcademicYearDatabase(targetDatabaseName);

      return {
        sourceAcademicYear,
        targetAcademicYear,
        transferred,
        totalRows: transferred.reduce((sum, item) => sum + item.rows, 0),
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }

      throw new BadRequestException(
        `Nie udalo sie wykonac transferu danych. ${this.databaseErrorText(error)}`,
      );
    } finally {
      await sourceDatabase.close();
      await targetDatabase.close();
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
    return this.findLessonsForModels(models, filters);
  }

  async countLessonHours(filters: ScheduleLessonFilters = {}) {
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new BadRequestException('Data początkowa nie może być późniejsza niż data końcowa.');
    }

    const models = await this.getScheduleModels();
    const where = await this.buildLessonFilterWhere(models, filters, true);
    const [lessonCount, lessonHoursValue] = await Promise.all([
      models.lessonModel.count({ where }),
      models.lessonModel.sum('lessonHours', { where }),
    ]);
    const lessonHours = Number(lessonHoursValue ?? 0);

    return {
      lessonHours,
      lessonCount,
      minutes: lessonHours * 45,
    };
  }

  async findStudentDictionaries() {
    const models = await this.getStudentScheduleModels();
    const [groups, teachers] = await Promise.all([
      models.groupModel.findAll({
        where: { active: true },
        order: [['name', 'ASC']],
      }),
      models.teacherModel.findAll({
        where: { active: true },
        order: [
          ['lastName', 'ASC'],
          ['firstName', 'ASC'],
        ],
      }),
    ]);
    const studyModes = Array.from(
      new Set(
        groups
          .filter(
            (group) =>
              group.level === ScheduleGroupLevel.COURSE &&
              group.studyMode !== ScheduleStudyMode.UNASSIGNED,
          )
          .map((group) => group.studyMode),
      ),
    );

    return {
      groups,
      teachers: teachers.map((teacher) => this.mapTeacher(teacher)),
      studyModes,
    };
  }

  async findStudentLessons(filters: ScheduleLessonFilters = {}) {
    const models = await this.getStudentScheduleModels();
    return this.findLessonsForModels(models, filters);
  }

  private async findLessonsForModels(
    models: ScheduleDatabaseModels,
    filters: ScheduleLessonFilters = {},
  ) {
    const where = await this.buildLessonFilterWhere(models, filters);

    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 5000);

    const lessons = await models.lessonModel.findAll({
      where,
      include: this.lessonIncludes(models),
      order: filters.creationOrder
        ? [
            ['createdAt', filters.creationOrder === 'asc' ? 'ASC' : 'DESC'],
            ['id', filters.creationOrder === 'asc' ? 'ASC' : 'DESC'],
          ]
        : [
            ['date', 'ASC'],
            ['startHour', 'ASC'],
            ['startMinute', 'ASC'],
          ],
      limit,
    });

    return lessons.map((lesson) => this.mapLesson(lesson));
  }

  private async buildLessonFilterWhere(
    models: ScheduleDatabaseModels,
    filters: ScheduleLessonFilters,
    includeGroupAncestors = false,
  ): Promise<any> {
    const where: any = {};
    if (filters.from || filters.to) {
      where.date = {
        [Op.between]: [filters.from ?? '0001-01-01', filters.to ?? '9999-12-31'],
      };
    }
    if (filters.teacherId) {
      where.teacherId = filters.teacherId;
    }
    if (filters.subjectId) {
      where.subjectId = filters.subjectId;
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
      const groupIds = includeGroupAncestors
        ? Array.from(await this.getGroupConflictIds(models, filters.groupId))
        : await this.getGroupAndDescendantIds(models, filters.groupId);
      where.groupId = { [Op.in]: groupIds };
    }
    if (filters.classTypeId) {
      where.classTypeId = filters.classTypeId;
    }

    return where;
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

  async getClassTypeDeletionCheck(id: string): Promise<ClassTypeDeletionCheck> {
    const models = await this.getScheduleModels();
    return this.buildClassTypeDeletionCheck(models, id);
  }

  async deleteClassType(id: string, lessonStrategy?: string) {
    const models = await this.getScheduleModels();
    const deletionCheck = await this.buildClassTypeDeletionCheck(models, id);
    const allowedStrategies: ClassTypeLessonDeletionStrategy[] = [
      'DELETE',
      'REASSIGN_UNASSIGNED',
    ];
    const strategy = lessonStrategy as ClassTypeLessonDeletionStrategy | undefined;

    if (strategy && !allowedStrategies.includes(strategy)) {
      throw new BadRequestException('Nieprawidlowa strategia obslugi zajec.');
    }
    if (deletionCheck.lessonCount > 0 && !strategy) {
      throw new ConflictException({
        code: 'CLASS_TYPE_HAS_LESSONS',
        message: 'Forma zajec jest wykorzystywana w Planie zajec.',
        deletionCheck,
      });
    }

    const transaction = await models.classTypeModel.sequelize.transaction();
    let deletedLessons = 0;
    let reassignedLessons = 0;
    let unassignedClassTypeId: string | null = null;

    try {
      if (deletionCheck.lessonCount > 0 && strategy === 'DELETE') {
        deletedLessons = await models.lessonModel.destroy({
          where: { classTypeId: id },
          transaction,
        });
      }

      if (deletionCheck.lessonCount > 0 && strategy === 'REASSIGN_UNASSIGNED') {
        let unassignedClassType = await models.classTypeModel.findOne({
          where: {
            id: { [Op.ne]: id },
            name: 'Nieprzydzielone',
            active: true,
          },
          transaction,
        });

        if (!unassignedClassType) {
          unassignedClassType = await models.classTypeModel.create(
            { name: 'Nieprzydzielone', active: true },
            { transaction },
          );
        }

        unassignedClassTypeId = unassignedClassType.id;
        [reassignedLessons] = await models.lessonModel.update(
          { classTypeId: unassignedClassType.id },
          { where: { classTypeId: id }, transaction },
        );
      }

      await models.classTypeModel.update(
        { active: false },
        { where: { id, active: true }, transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return {
      deleted: true,
      id,
      deletedLessons,
      reassignedLessons,
      unassignedClassTypeId,
    };
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

  async getGroupDeletionCheck(id: string): Promise<AcademicGroupDeletionCheck> {
    const models = await this.getScheduleModels();
    return this.buildAcademicGroupDeletionCheck(models, id);
  }

  async deleteGroup(id: string) {
    const models = await this.getScheduleModels();
    const deletionCheck = await this.buildAcademicGroupDeletionCheck(models, id);

    if (deletionCheck.hasChildren) {
      throw new ConflictException({
        code: 'ACADEMIC_GROUP_HAS_CHILDREN',
        message: 'Pozycja ma aktywne elementy podrzedne i nie moze zostac usunieta.',
        deletionCheck,
      });
    }

    if (deletionCheck.totalLessonCount > 0) {
      throw new ConflictException({
        code: 'ACADEMIC_GROUP_HAS_LESSONS',
        message: 'Pozycja ma przypisane zajecia i nie moze zostac usunieta.',
        deletionCheck,
      });
    }

    const transaction = await models.groupModel.sequelize.transaction();
    try {
      if (deletionCheck.group.level === ScheduleGroupLevel.COURSE) {
        const studyTracks = await models.studyTrackModel.findAll({
          where: { courseId: id, active: true },
          attributes: ['id'],
          transaction,
        });
        const studyTrackIds = studyTracks.map((studyTrack) => studyTrack.id);

        if (studyTrackIds.length > 0) {
          await models.studyTrackSpecializationModel.update(
            { active: false },
            { where: { studyTrackId: { [Op.in]: studyTrackIds } }, transaction },
          );
          await models.studyTrackModel.update(
            { active: false },
            { where: { id: { [Op.in]: studyTrackIds } }, transaction },
          );
        }
      } else if (deletionCheck.group.level === ScheduleGroupLevel.SPECIALIZATION) {
        await models.studyTrackSpecializationModel.update(
          { active: false },
          { where: { specializationId: id }, transaction },
        );
      }

      await models.groupModel.update(
        { active: false },
        { where: { id, active: true }, transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return { deleted: true, id };
  }

  async deleteGroupTree(id: string, lessonStrategy?: string) {
    const models = await this.getScheduleModels();
    const deletionCheck = await this.buildAcademicGroupDeletionCheck(models, id);
    const allowedStrategies: AcademicGroupLessonDeletionStrategy[] = [
      'DELETE',
      'REASSIGN_UNASSIGNED',
    ];
    const strategy = lessonStrategy as AcademicGroupLessonDeletionStrategy | undefined;

    if (strategy && !allowedStrategies.includes(strategy)) {
      throw new BadRequestException('Nieprawidlowa strategia obslugi zajec.');
    }
    if (deletionCheck.totalLessonCount > 0 && !strategy) {
      throw new ConflictException({
        code: 'ACADEMIC_GROUP_TREE_HAS_LESSONS',
        message: 'Usuwana galaz ma przypisane zajecia. Wybierz sposob ich obslugi.',
        deletionCheck,
      });
    }

    const groupIds = [
      deletionCheck.group.id,
      ...this.collectAcademicGroupDeletionChildIds(deletionCheck.children),
    ];
    const transaction = await models.groupModel.sequelize.transaction();
    let deletedLessons = 0;
    let reassignedLessons = 0;
    let unassignedGroupId: string | null = null;

    try {
      if (deletionCheck.totalLessonCount > 0 && strategy === 'DELETE') {
        deletedLessons = await models.lessonModel.destroy({
          where: { groupId: { [Op.in]: groupIds } },
          transaction,
        });
      }

      if (deletionCheck.totalLessonCount > 0 && strategy === 'REASSIGN_UNASSIGNED') {
        let unassignedGroup = await models.groupModel.findOne({
          where: {
            id: { [Op.notIn]: groupIds },
            name: 'Nieprzydzielony',
            level: ScheduleGroupLevel.COURSE,
            active: true,
          },
          transaction,
        });

        if (!unassignedGroup) {
          unassignedGroup = await models.groupModel.create(
            {
              name: 'Nieprzydzielony',
              level: ScheduleGroupLevel.COURSE,
              studyMode: ScheduleStudyMode.UNASSIGNED,
              parentId: null,
              active: true,
            },
            { transaction },
          );
        } else if (unassignedGroup.studyMode !== ScheduleStudyMode.UNASSIGNED) {
          await unassignedGroup.update(
            { studyMode: ScheduleStudyMode.UNASSIGNED },
            { transaction },
          );
        }

        unassignedGroupId = unassignedGroup.id;
        [reassignedLessons] = await models.lessonModel.update(
          { groupId: unassignedGroup.id },
          { where: { groupId: { [Op.in]: groupIds } }, transaction },
        );
      }

      const studyTracks = await models.studyTrackModel.findAll({
        where: { courseId: { [Op.in]: groupIds }, active: true },
        attributes: ['id'],
        transaction,
      });
      const studyTrackIds = studyTracks.map((studyTrack) => studyTrack.id);
      if (studyTrackIds.length > 0) {
        await models.studyTrackSpecializationModel.update(
          { active: false },
          { where: { studyTrackId: { [Op.in]: studyTrackIds } }, transaction },
        );
        await models.studyTrackModel.update(
          { active: false },
          { where: { id: { [Op.in]: studyTrackIds } }, transaction },
        );
      }

      await models.studyTrackSpecializationModel.update(
        { active: false },
        { where: { specializationId: { [Op.in]: groupIds } }, transaction },
      );
      await models.groupModel.update(
        { active: false },
        { where: { id: { [Op.in]: groupIds }, active: true }, transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return {
      deleted: true,
      id,
      deletedGroupIds: groupIds,
      deletedLessons,
      reassignedLessons,
      unassignedGroupId,
    };
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
    await this.assertLessonDateIsNotHoliday(models, dto.date);
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
    const noteIdWasProvided = Object.prototype.hasOwnProperty.call(dto, 'noteId');
    const updatePayload: any = noteIdWasProvided ? { ...dto, noteId: dto.noteId || null } : dto;
    if (lesson.source === ScheduleLessonSource.LESSON_RANGE && !lesson.detached) {
      updatePayload.detached = true;
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
      noteId: noteIdWasProvided ? dto.noteId || null : lesson.noteId,
    };

    await this.validateLessonReferences(models, nextLesson);
    if (dto.date && dto.date !== lesson.date) {
      await this.assertLessonDateIsNotHoliday(models, nextLesson.date);
    }
    await this.assertNoLessonConflicts(models, nextLesson, id);
    await lesson.update(updatePayload);
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

  private async buildClassTypeDeletionCheck(
    models: ScheduleDatabaseModels,
    id: string,
  ): Promise<ClassTypeDeletionCheck> {
    const classType = await models.classTypeModel.findOne({
      where: { id, active: true },
    });
    if (!classType) {
      throw new NotFoundException('Nie znaleziono formy zajec.');
    }

    const lessonCount = await models.lessonModel.count({ where: { classTypeId: id } });
    return {
      classType: classType.get({ plain: true }),
      lessonCount,
      canDelete: lessonCount === 0,
    };
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
      await this.ensureScheduleLessonTimeShortcutSortOrderColumn(scheduleDatabase);
      await this.ensureScheduleLessonShortcutStudyModeColumns(scheduleDatabase);
      await this.ensureScheduleHolidaySourceColumn(scheduleDatabase);
      await this.ensureScheduleLessonGenerationColumns(scheduleDatabase);
    } finally {
      await scheduleDatabase.close();
    }
  }

  private createAcademicYearSequelize(databaseName: string): Sequelize {
    return new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      logging: false,
    });
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

  private academicYearTransferDefinitions(): AcademicYearTransferDefinition[] {
    return [
      {
        section: ScheduleAcademicYearTransferSection.LESSONS,
        label: 'Lista zajec',
        tables: [
          'schedule_lesson_generations',
          'schedule_lesson_cycle_ranges',
          'schedule_lessons',
        ],
      },
      {
        section: ScheduleAcademicYearTransferSection.STUDY_TRACKS,
        label: 'Toki',
        tables: ['schedule_study_tracks', 'schedule_study_track_specializations'],
      },
      {
        section: ScheduleAcademicYearTransferSection.TEACHER_SUBJECTS,
        label: 'Powiazania Wykladowca->przedmiot',
        tables: ['schedule_teacher_subjects'],
      },
      {
        section: ScheduleAcademicYearTransferSection.COURSE_TEACHERS,
        label: 'Powiazania Kierunek->wykladowca',
        tables: ['schedule_course_teachers'],
      },
      {
        section: ScheduleAcademicYearTransferSection.GROUPS,
        label: 'Kierunki i grupy',
        tables: ['schedule_academic_groups'],
      },
      {
        section: ScheduleAcademicYearTransferSection.SUBJECTS,
        label: 'Przedmioty',
        tables: ['schedule_subjects'],
      },
      {
        section: ScheduleAcademicYearTransferSection.NOTES,
        label: 'Uwagi',
        tables: ['schedule_notes'],
      },
      {
        section: ScheduleAcademicYearTransferSection.LOCATIONS,
        label: 'Budynki i sale',
        tables: ['schedule_locations'],
      },
      {
        section: ScheduleAcademicYearTransferSection.CLASS_TYPES,
        label: 'Forma zajec',
        tables: ['schedule_class_types'],
      },
      {
        section: ScheduleAcademicYearTransferSection.TEACHERS,
        label: 'Wykladowcy',
        tables: ['schedule_teachers'],
      },
    ];
  }

  private academicYearTransferDefinitionsFor(
    sections: ScheduleAcademicYearTransferSection[],
  ): AcademicYearTransferDefinition[] {
    const requestedSections = new Set(sections ?? []);
    const definitions = this.academicYearTransferDefinitions().filter((definition) =>
      requestedSections.has(definition.section),
    );

    if (definitions.length === 0) {
      throw new BadRequestException('Wybierz przynajmniej jedna sekcje do transferu.');
    }

    return definitions;
  }

  private sortAcademicYearTransferDefinitions(
    definitions: AcademicYearTransferDefinition[],
  ): AcademicYearTransferDefinition[] {
    const order = [
      ScheduleAcademicYearTransferSection.SUBJECTS,
      ScheduleAcademicYearTransferSection.TEACHERS,
      ScheduleAcademicYearTransferSection.CLASS_TYPES,
      ScheduleAcademicYearTransferSection.NOTES,
      ScheduleAcademicYearTransferSection.LOCATIONS,
      ScheduleAcademicYearTransferSection.GROUPS,
      ScheduleAcademicYearTransferSection.STUDY_TRACKS,
      ScheduleAcademicYearTransferSection.TEACHER_SUBJECTS,
      ScheduleAcademicYearTransferSection.COURSE_TEACHERS,
      ScheduleAcademicYearTransferSection.LESSONS,
    ];

    return [...definitions].sort(
      (first, second) => order.indexOf(first.section) - order.indexOf(second.section),
    );
  }

  private async findNonEmptyAcademicYearTransferTables(
    sequelize: Sequelize,
    definitions: AcademicYearTransferDefinition[],
  ): Promise<AcademicYearTransferTableStatus[]> {
    const nonEmptyTables: AcademicYearTransferTableStatus[] = [];
    for (const definition of definitions) {
      for (const tableName of definition.tables) {
        const [row] = await sequelize.query<{ count: string | number }>(
          `SELECT COUNT(*)::int AS "count" FROM ${this.qualifiedSqlIdentifier(
            'public',
            tableName,
          )}`,
          { type: QueryTypes.SELECT },
        );
        const count = Number(row?.count ?? 0);
        if (count > 0) {
          nonEmptyTables.push({
            section: definition.section,
            label: definition.label,
            tableName,
            count,
          });
        }
      }
    }

    return nonEmptyTables;
  }

  private async copyAcademicYearTransferTable(
    sourceDatabase: Sequelize,
    targetDatabase: Sequelize,
    tableName: string,
    transaction: any,
  ): Promise<number> {
    const columns = await this.findCommonTransferColumns(sourceDatabase, targetDatabase, tableName);
    if (columns.length === 0) {
      throw new BadRequestException(`Tabela ${tableName} nie ma kolumn do transferu.`);
    }

    const rows = await this.findTransferSourceRows(sourceDatabase, tableName, columns);
    if (rows.length === 0) {
      return 0;
    }

    if (columns.some((column) => column.columnName === 'parentId')) {
      await this.insertHierarchicalTransferRows(targetDatabase, tableName, columns, rows, transaction);
      return rows.length;
    }

    for (const row of rows) {
      await this.insertTransferRow(targetDatabase, tableName, columns, row, transaction);
    }

    return rows.length;
  }

  private async findCommonTransferColumns(
    sourceDatabase: Sequelize,
    targetDatabase: Sequelize,
    tableName: string,
  ): Promise<BackupTableColumn[]> {
    const [sourceColumns, targetColumns] = await Promise.all([
      this.findBackupTableColumns(sourceDatabase, tableName),
      this.findBackupTableColumns(targetDatabase, tableName),
    ]);
    if (sourceColumns.length === 0) {
      throw new BadRequestException(`Baza zrodlowa nie zawiera tabeli ${tableName}.`);
    }
    if (targetColumns.length === 0) {
      throw new BadRequestException(`Baza docelowa nie zawiera tabeli ${tableName}.`);
    }

    const sourceColumnNames = new Set(sourceColumns.map((column) => column.columnName));
    const columns = targetColumns.filter((column) => sourceColumnNames.has(column.columnName));
    const missingRequiredColumns = targetColumns.filter(
      (column) =>
        !sourceColumnNames.has(column.columnName) &&
        column.isNullable === 'NO' &&
        !column.columnDefault,
    );

    if (missingRequiredColumns.length > 0) {
      throw new BadRequestException(
        `Tabela ${tableName} w bazie zrodlowej nie zawiera wymaganych kolumn: ${missingRequiredColumns
          .map((column) => column.columnName)
          .join(', ')}.`,
      );
    }

    return columns;
  }

  private async findTransferSourceRows(
    sourceDatabase: Sequelize,
    tableName: string,
    columns: BackupTableColumn[],
  ): Promise<Record<string, unknown>[]> {
    const tableIdentifier = this.qualifiedSqlIdentifier('public', tableName);
    const columnList = columns
      .map((column) => this.quoteSqlIdentifier(column.columnName))
      .join(', ');
    const orderBy = this.transferTableOrderBy(columns);

    return sourceDatabase.query<Record<string, unknown>>(
      `SELECT ${columnList} FROM ${tableIdentifier}${orderBy}`,
      { type: QueryTypes.SELECT },
    );
  }

  private transferTableOrderBy(columns: BackupTableColumn[]): string {
    if (columns.some((column) => column.columnName === 'id')) {
      return ` ORDER BY ${this.quoteSqlIdentifier('id')}`;
    }
    if (columns.some((column) => column.columnName === 'createdAt')) {
      return ` ORDER BY ${this.quoteSqlIdentifier('createdAt')}`;
    }

    return '';
  }

  private async insertHierarchicalTransferRows(
    targetDatabase: Sequelize,
    tableName: string,
    columns: BackupTableColumn[],
    rows: Record<string, unknown>[],
    transaction: any,
  ): Promise<void> {
    const pendingRows = [...rows];
    const insertedIds = new Set<string>();

    while (pendingRows.length > 0) {
      const readyRows = pendingRows.filter((row) => {
        const parentId = row.parentId;
        return !parentId || insertedIds.has(String(parentId));
      });

      if (readyRows.length === 0) {
        throw new BadRequestException(
          `Nie udalo sie ustalic kolejnosci transferu tabeli ${tableName}. Sprawdz powiazania nadrzedne.`,
        );
      }

      const readyRowReferences = new Set(readyRows);
      for (const row of readyRows) {
        await this.insertTransferRow(targetDatabase, tableName, columns, row, transaction);
        if (row.id) {
          insertedIds.add(String(row.id));
        }
      }

      for (let index = pendingRows.length - 1; index >= 0; index -= 1) {
        if (readyRowReferences.has(pendingRows[index])) {
          pendingRows.splice(index, 1);
        }
      }
    }
  }

  private async insertTransferRow(
    targetDatabase: Sequelize,
    tableName: string,
    columns: BackupTableColumn[],
    row: Record<string, unknown>,
    transaction: any,
  ): Promise<void> {
    const tableIdentifier = this.qualifiedSqlIdentifier('public', tableName);
    const columnList = columns
      .map((column) => this.quoteSqlIdentifier(column.columnName))
      .join(', ');
    const values = columns.map((column) => this.sqlLiteral(row[column.columnName])).join(', ');
    await targetDatabase.query(
      `INSERT INTO ${tableIdentifier} (${columnList}) VALUES (${values})`,
      { transaction },
    );
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

  private async ensureAcademicYearSemesterColumn(): Promise<void> {
    await this.sequelize.query(
      'ALTER TABLE "schedule_academic_years" ADD COLUMN IF NOT EXISTS "semester" VARCHAR(6)',
    );
    await this.sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'schedule_academic_years_semester_allowed'
             AND conrelid = 'schedule_academic_years'::regclass
         ) THEN
           ALTER TABLE "schedule_academic_years"
           ADD CONSTRAINT "schedule_academic_years_semester_allowed"
           CHECK ("semester" IN ('${ScheduleAcademicSemester.WINTER}', '${ScheduleAcademicSemester.SUMMER}'));
         END IF;
       END $$`,
    );
  }

  private async ensureScheduleAcademicGroupLevelSupportsWorkshop(sequelize: Sequelize): Promise<void> {
    try {
      await sequelize.query(
        `ALTER TYPE "enum_schedule_academic_groups_level"
         ADD VALUE IF NOT EXISTS '${ScheduleGroupLevel.WORKSHOP}'`,
      );
    } catch (error) {
      const databaseError = error as { parent?: { code?: string }; original?: { code?: string } };
      const code = databaseError.parent?.code ?? databaseError.original?.code;
      if (code !== '42704') {
        throw error;
      }
    }
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

  private async ensureScheduleLessonTimeShortcutSortOrderColumn(
    sequelize: Sequelize,
  ): Promise<void> {
    await sequelize.query(
      `ALTER TABLE "schedule_lesson_time_shortcuts"
       ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0`,
    );
  }

  private async ensureScheduleLessonShortcutStudyModeColumns(
    sequelize: Sequelize,
  ): Promise<void> {
    const defaultStudyMode = ScheduleStudyMode.FULL_TIME;
    const allowedStudyModes = [
      ScheduleStudyMode.FULL_TIME,
      ScheduleStudyMode.PART_TIME,
      ScheduleStudyMode.POSTGRADUATE,
    ];
    const allowedValues = allowedStudyModes.map((value) => `'${value}'`).join(', ');

    for (const tableName of [
      'schedule_lesson_time_shortcuts',
      'schedule_lesson_date_shortcuts',
    ]) {
      await sequelize.query(
        `ALTER TABLE "${tableName}"
         ADD COLUMN IF NOT EXISTS "studyMode" VARCHAR(30) NOT NULL DEFAULT '${defaultStudyMode}'`,
      );
      await sequelize.query(
        `UPDATE "${tableName}"
         SET "studyMode" = '${defaultStudyMode}'
         WHERE "studyMode" IS NULL OR "studyMode" NOT IN (${allowedValues})`,
      );
      await sequelize.query(
        `ALTER TABLE "${tableName}"
         ALTER COLUMN "studyMode" SET DEFAULT '${defaultStudyMode}',
         ALTER COLUMN "studyMode" SET NOT NULL`,
      );
    }

    await sequelize.query('DROP INDEX IF EXISTS "schedule_lesson_time_shortcuts_unique_time"');
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_lesson_time_shortcuts_unique_time_mode"
       ON "schedule_lesson_time_shortcuts"
       ("startHour", "startMinute", "lessonHours", "studyMode")`,
    );
    await sequelize.query('DROP INDEX IF EXISTS "schedule_lesson_date_shortcuts_unique_date_week"');
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_lesson_date_shortcuts_unique_date_week_mode"
       ON "schedule_lesson_date_shortcuts" ("date", "week", "studyMode")`,
    );
  }

  private async ensureScheduleHolidaySourceColumn(sequelize: Sequelize): Promise<void> {
    await sequelize.query(
      `ALTER TABLE "schedule_holidays"
       ADD COLUMN IF NOT EXISTS "source" VARCHAR(20)`,
    );
    await sequelize.query(
      `UPDATE "schedule_holidays"
       SET "source" = '${ScheduleHolidaySource.AUTOMATIC}'
       WHERE "source" IS NULL`,
    );
    await sequelize.query(
      `ALTER TABLE "schedule_holidays"
       ALTER COLUMN "source" SET DEFAULT '${ScheduleHolidaySource.AUTOMATIC}',
       ALTER COLUMN "source" SET NOT NULL`,
    );
    await sequelize.query('DROP INDEX IF EXISTS "schedule_holidays_unique_date"');
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_holidays_unique_entry"
       ON "schedule_holidays" ("date", "name", "source")`,
    );
  }

  private async ensureScheduleLessonGenerationColumns(sequelize: Sequelize): Promise<void> {
    await sequelize.query(
      `ALTER TABLE "schedule_lessons"
       ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT '${ScheduleLessonSource.MANUAL}',
       ADD COLUMN IF NOT EXISTS "generationId" UUID,
       ADD COLUMN IF NOT EXISTS "sourceLessonId" UUID,
       ADD COLUMN IF NOT EXISTS "detached" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await sequelize.query(
      `UPDATE "schedule_lessons"
       SET "source" = '${ScheduleLessonSource.MANUAL}'
       WHERE "source" IS NULL`,
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_lessons_unique_generated_occurrence"
       ON "schedule_lessons" ("generationId", "sourceLessonId", "date")
       WHERE "source" = '${ScheduleLessonSource.LESSON_RANGE}' AND "detached" = FALSE`,
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS "schedule_lessons_source_idx"
       ON "schedule_lessons" ("source")`,
    );
  }

  private validateHolidayYear(year: number): void {
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new BadRequestException('Rok musi byc liczba od 1900 do 2100.');
    }
  }

  private validateManualHolidayDate(date: string): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
      throw new BadRequestException('Data swieta ma niepoprawny format.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    this.validateHolidayYear(year);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('Podany dzien nie istnieje w wybranym miesiacu.');
    }
  }

  private validateLessonRangeDate(date: string): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) {
      throw new BadRequestException('Data zakresu ma niepoprawny format.');
    }

    const selectedDate = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    if (
      selectedDate.getUTCFullYear() !== Number(match[1]) ||
      selectedDate.getUTCMonth() !== Number(match[2]) - 1 ||
      selectedDate.getUTCDate() !== Number(match[3])
    ) {
      throw new BadRequestException('Wybrana data zakresu nie istnieje.');
    }
  }

  private findStoredHolidays(holidayModel: any, year: number) {
    return holidayModel.findAll({
      attributes: ['id', 'date', 'name', 'source'],
      where: {
        date: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`],
        },
      },
      order: [['date', 'ASC']],
    });
  }

  private async synchronizeAutomaticHolidays(
    holidayModel: any,
    year: number,
    downloadedHolidays: Array<{ date: string; name: string }>,
  ): Promise<boolean> {
    const storedAutomaticHolidays = await holidayModel.findAll({
      where: {
        source: ScheduleHolidaySource.AUTOMATIC,
        date: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`],
        },
      },
      order: [['date', 'ASC']],
    });
    const downloadedByDate = new Map(
      downloadedHolidays.map((holiday) => [holiday.date, holiday]),
    );
    const storedByDate = new Map<string, any>();
    const idsToDelete: string[] = [];

    for (const storedHoliday of storedAutomaticHolidays) {
      const date = String(storedHoliday.date);
      if (!downloadedByDate.has(date) || storedByDate.has(date)) {
        idsToDelete.push(storedHoliday.id);
      } else {
        storedByDate.set(date, storedHoliday);
      }
    }

    const holidaysToUpdate = downloadedHolidays
      .map((holiday) => ({ stored: storedByDate.get(holiday.date), downloaded: holiday }))
      .filter(({ stored, downloaded }) => stored && stored.name !== downloaded.name);
    const holidaysToCreate = downloadedHolidays.filter(
      (holiday) => !storedByDate.has(holiday.date),
    );

    if (
      idsToDelete.length === 0 &&
      holidaysToUpdate.length === 0 &&
      holidaysToCreate.length === 0
    ) {
      return false;
    }

    await holidayModel.sequelize.transaction(async (transaction: any) => {
      if (idsToDelete.length > 0) {
        await holidayModel.destroy({
          where: { id: { [Op.in]: idsToDelete } },
          transaction,
        });
      }

      await Promise.all(
        holidaysToUpdate.map(({ stored, downloaded }) =>
          stored.update({ name: downloaded.name }, { transaction }),
        ),
      );

      if (holidaysToCreate.length > 0) {
        await holidayModel.bulkCreate(
          holidaysToCreate.map((holiday) => ({
            ...holiday,
            source: ScheduleHolidaySource.AUTOMATIC,
          })),
          { transaction },
        );
      }
    });

    return true;
  }

  private async downloadPolishHolidays(
    year: number,
  ): Promise<Array<{ date: string; name: string }>> {
    const apiBaseUrl =
      process.env.HOLIDAYS_API_URL ?? 'https://nagerholidays.com/api/v4/Holidays';

    try {
      const response = await fetch(`${apiBaseUrl}/PL/${year}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Nager Holidays zwrocil status ${response.status}.`);
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        throw new Error('Nager Holidays zwrocil niepoprawny format danych.');
      }

      const holidaysByDate = new Map<string, { date: string; name: string }>();
      for (const item of payload as NagerHoliday[]) {
        if (
          typeof item?.date !== 'string' ||
          typeof item?.name !== 'string' ||
          item.countryCode !== 'PL' ||
          !item.date.startsWith(`${year}-`)
        ) {
          continue;
        }

        const name = item.name.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !name) {
          continue;
        }

        holidaysByDate.set(item.date, {
          date: item.date,
          name: POLISH_HOLIDAY_NAMES[name] ?? name,
        });
      }

      const holidays = [...holidaysByDate.values()].sort((first, second) =>
        first.date.localeCompare(second.date),
      );
      if (holidays.length === 0) {
        throw new Error('Nager Holidays nie zwrocil swiat dla wybranego roku.');
      }

      return holidays;
    } catch {
      throw new ServiceUnavailableException(
        'Nie udalo sie pobrac swiat z serwisu Nager Holidays. Sprobuj ponownie pozniej.',
      );
    }
  }

  private mainScheduleModels(): ScheduleDatabaseModels {
    return {
      subjectModel: this.subjectModel,
      teacherModel: this.teacherModel,
      courseTeacherModel: this.courseTeacherModel,
      teacherSubjectModel: this.teacherSubjectModel,
      classTypeModel: this.classTypeModel,
      holidayModel: this.holidayModel,
      noteModel: this.noteModel,
      locationModel: this.locationModel,
      groupModel: this.groupModel,
      studyTrackModel: this.studyTrackModel,
      studyTrackSpecializationModel: this.studyTrackSpecializationModel,
      lessonModel: this.lessonModel,
      lessonGenerationModel: this.lessonGenerationModel,
      lessonRangeModel: this.lessonRangeModel,
      dateShortcutModel: this.dateShortcutModel,
      shortcutModel: this.shortcutModel,
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

  private async getStudentScheduleModels(): Promise<ScheduleDatabaseModels> {
    const activeAcademicYear = await this.academicYearModel.findOne({
      where: { active: true, activeForStudent: true },
      order: [['updatedAt', 'DESC']],
    });

    if (!activeAcademicYear) {
      throw new NotFoundException('Nie wybrano aktywnej bazy dla studentow.');
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
    await this.ensureScheduleLessonTimeShortcutSortOrderColumn(sequelize);
    await this.ensureScheduleLessonShortcutStudyModeColumns(sequelize);
    await this.ensureScheduleHolidaySourceColumn(sequelize);
    await this.ensureScheduleLessonGenerationColumns(sequelize);
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
    const holidayModel = sequelize.define(
      'ScheduleHoliday',
      {
        id: uuidPrimaryKey(),
        date: { type: DataTypes.DATEONLY, allowNull: false },
        name: { type: DataTypes.STRING(160), allowNull: false },
        source: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: ScheduleHolidaySource.AUTOMATIC,
        },
      },
      {
        tableName: 'schedule_holidays',
      },
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
    const shortcutModel = sequelize.define(
      'ScheduleLessonTimeShortcut',
      {
        id: uuidPrimaryKey(),
        startHour: { type: DataTypes.INTEGER, allowNull: false },
        startMinute: { type: DataTypes.INTEGER, allowNull: false },
        lessonHours: { type: DataTypes.INTEGER, allowNull: false },
        studyMode: {
          type: DataTypes.STRING(30),
          allowNull: false,
          defaultValue: ScheduleStudyMode.FULL_TIME,
        },
        sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      },
      { tableName: 'schedule_lesson_time_shortcuts' },
    );
    const dateShortcutModel = sequelize.define(
      'ScheduleLessonDateShortcut',
      {
        id: uuidPrimaryKey(),
        date: { type: DataTypes.DATEONLY, allowNull: false },
        week: { type: DataTypes.INTEGER, allowNull: false },
        studyMode: {
          type: DataTypes.STRING(30),
          allowNull: false,
          defaultValue: ScheduleStudyMode.FULL_TIME,
        },
      },
      { tableName: 'schedule_lesson_date_shortcuts' },
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
        source: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: ScheduleLessonSource.MANUAL,
        },
        generationId: { type: DataTypes.UUID, allowNull: true },
        sourceLessonId: { type: DataTypes.UUID, allowNull: true },
        detached: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      },
      { tableName: 'schedule_lessons' },
    );
    const lessonGenerationModel = sequelize.define(
      'ScheduleLessonGeneration',
      {
        id: uuidPrimaryKey(),
        key: {
          type: DataTypes.STRING(20),
          allowNull: false,
          unique: true,
          defaultValue: 'DEFAULT',
        },
        sourceWeekOneDate: { type: DataTypes.DATEONLY, allowNull: false },
        sourceWeekTwoDate: { type: DataTypes.DATEONLY, allowNull: false },
        lastAppliedAt: { type: DataTypes.DATE, allowNull: true },
      },
      { tableName: 'schedule_lesson_generations' },
    );
    const lessonRangeModel = sequelize.define(
      'ScheduleLessonRange',
      {
        id: uuidPrimaryKey(),
        key: {
          type: DataTypes.STRING(20),
          allowNull: false,
          unique: true,
          defaultValue: 'DEFAULT',
        },
        startDate: { type: DataTypes.DATEONLY, allowNull: false },
        endDate: { type: DataTypes.DATEONLY, allowNull: false },
      },
      { tableName: 'schedule_lesson_cycle_ranges' },
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
      holidayModel,
      noteModel,
      locationModel,
      groupModel,
      studyTrackModel,
      studyTrackSpecializationModel,
      lessonModel,
      lessonGenerationModel,
      lessonRangeModel,
      dateShortcutModel,
      shortcutModel,
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
      throw new ConflictException('Specjalność, grupa albo warsztat musi mieć element nadrzędny.');
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
    if (dto.level === ScheduleGroupLevel.WORKSHOP && parent.level !== ScheduleGroupLevel.GROUP) {
      throw new ConflictException('Warsztat musi należeć do grupy.');
    }
  }

  private async buildAcademicGroupDeletionCheck(
    models: ScheduleDatabaseModels,
    id: string,
  ): Promise<AcademicGroupDeletionCheck> {
    const groups: any[] = await models.groupModel.findAll({ where: { active: true } });
    const group = groups.find((item) => item.id === id);
    if (!group) {
      throw new NotFoundException('Nie znaleziono kierunku, specjalnosci, grupy albo warsztatu.');
    }

    const descendantIds = this.findDescendantIds(id, groups);
    const branchIds = [id, ...descendantIds];
    const lessons: Array<{ groupId: string }> = await models.lessonModel.findAll({
      where: { groupId: { [Op.in]: branchIds } },
      attributes: ['groupId'],
      raw: true,
    });
    const lessonCounts = new Map<string, number>();
    for (const lesson of lessons) {
      lessonCounts.set(lesson.groupId, (lessonCounts.get(lesson.groupId) ?? 0) + 1);
    }

    const childrenByParentId = new Map<string, any[]>();
    for (const item of groups) {
      if (!item.parentId) {
        continue;
      }
      const siblings = childrenByParentId.get(item.parentId) ?? [];
      siblings.push(item);
      childrenByParentId.set(item.parentId, siblings);
    }
    for (const siblings of childrenByParentId.values()) {
      siblings.sort((first, second) => first.name.localeCompare(second.name, 'pl'));
    }

    const buildChild = (child: any): AcademicGroupDeletionChild => {
      const nestedChildren = (childrenByParentId.get(child.id) ?? []).map(buildChild);
      const ownLessonCount = lessonCounts.get(child.id) ?? 0;
      return {
        ...child.get({ plain: true }),
        ownLessonCount,
        branchLessonCount:
          ownLessonCount +
          nestedChildren.reduce((count, nestedChild) => count + nestedChild.branchLessonCount, 0),
        children: nestedChildren,
      };
    };
    const children = (childrenByParentId.get(id) ?? []).map(buildChild);
    const ownLessonCount = lessonCounts.get(id) ?? 0;
    const descendantLessonCount = descendantIds.reduce(
      (count, groupId) => count + (lessonCounts.get(groupId) ?? 0),
      0,
    );

    return {
      group: group.get({ plain: true }),
      children,
      ownLessonCount,
      descendantLessonCount,
      totalLessonCount: ownLessonCount + descendantLessonCount,
      descendantCount: descendantIds.length,
      hasChildren: children.length > 0,
      canDelete: children.length === 0 && ownLessonCount === 0,
    };
  }

  private collectAcademicGroupDeletionChildIds(
    children: AcademicGroupDeletionChild[],
  ): string[] {
    return children.flatMap((child) => [
      child.id,
      ...this.collectAcademicGroupDeletionChildIds(child.children),
    ]);
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
    if (dto.level === ScheduleGroupLevel.GROUP) {
      throw new ConflictException('Grupa o podanej nazwie juz istnieje w tej specjalnosci.');
    }

    throw new ConflictException('Warsztat o podanej nazwie juz istnieje w tej grupie.');
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

  private async assertLessonDateIsNotHoliday(
    models: ScheduleDatabaseModels,
    date: string,
  ): Promise<void> {
    const holidays = await models.holidayModel.findAll({
      attributes: ['name'],
      where: { date },
      order: [['name', 'ASC']],
    });
    if (holidays.length === 0) {
      return;
    }

    const [year, month, day] = date.split('-');
    const names = holidays.map((holiday: any) => holiday.name).join(', ');
    throw new ConflictException(
      `Nie można zapisać zajęć w dniu ${day}.${month}.${year}. Jest to święto: ${names}.`,
    );
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
    const createdAt = (lesson as ScheduleLesson & { createdAt?: Date | string }).createdAt;

    return {
      id: lesson.id,
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ''),
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
      source: lesson.source,
      generationId: lesson.generationId,
      sourceLessonId: lesson.sourceLessonId,
      detached: lesson.detached,
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

  private sortLessonDateShortcuts(shortcuts: any[]): any[] {
    return [...shortcuts].sort((first, second) => {
      const weekDifference = first.week - second.week;
      const weekdayDifference =
        this.lessonDateWeekdayNumber(first.date) -
        this.lessonDateWeekdayNumber(second.date);
      return weekDifference || weekdayDifference || first.date.localeCompare(second.date);
    });
  }

  private validateLessonDateShortcutDate(date: string): void {
    const weekday = this.lessonDateWeekdayNumber(date);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) {
      throw new BadRequestException('Skrót daty może wskazywać tylko dzień od poniedziałku do piątku.');
    }
  }

  private async validateUniqueLessonDateShortcut(
    models: ScheduleDatabaseModels,
    date: string,
    week: number,
    studyMode: ScheduleStudyMode,
    excludedId?: string,
  ): Promise<void> {
    const where: any = { date, week, studyMode };
    if (excludedId) {
      where.id = { [Op.ne]: excludedId };
    }

    const existingShortcut = await models.dateShortcutModel.findOne({ where });
    if (existingShortcut) {
      throw new ConflictException('Taki skrót daty już istnieje w wybranym tygodniu.');
    }
  }

  private resolveShortcutStudyMode(studyMode?: string): ScheduleStudyMode {
    const resolvedStudyMode = studyMode ?? ScheduleStudyMode.FULL_TIME;
    const allowedStudyModes: ScheduleStudyMode[] = [
      ScheduleStudyMode.FULL_TIME,
      ScheduleStudyMode.PART_TIME,
      ScheduleStudyMode.POSTGRADUATE,
    ];

    if (!allowedStudyModes.includes(resolvedStudyMode as ScheduleStudyMode)) {
      throw new BadRequestException('Nieprawidlowy rodzaj kierunku dla skrotow.');
    }

    return resolvedStudyMode as ScheduleStudyMode;
  }

  private lessonDateWeekdayNumber(date: string): number {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return weekday === 0 ? 7 : weekday;
  }

  private toMinutes(hour: number, minute: number): number {
    return hour * 60 + minute;
  }

  private overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && end > otherStart;
  }

  private parseIsoDate(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(date: string, days: number): string {
    const parsedDate = this.parseIsoDate(date);
    parsedDate.setUTCDate(parsedDate.getUTCDate() + days);
    return this.formatIsoDate(parsedDate);
  }

  private getIsoWeekday(date: string): number {
    const weekday = this.parseIsoDate(date).getUTCDay();
    return weekday === 0 ? 7 : weekday;
  }

  private getMondayDate(date: string): string {
    return this.addDays(date, 1 - this.getIsoWeekday(date));
  }

  private getCycleStartMondayDate(date: string): string {
    const weekday = this.getIsoWeekday(date);
    if (weekday === 6) {
      return this.addDays(date, 2);
    }
    if (weekday === 7) {
      return this.addDays(date, 1);
    }
    return this.addDays(date, 1 - weekday);
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
