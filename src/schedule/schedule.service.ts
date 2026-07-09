import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  CreateScheduleAcademicGroupDto,
  CreateScheduleClassTypeDto,
  CreateScheduleLessonDto,
  CreateScheduleLocationDto,
  CreateScheduleNoteDto,
  CreateScheduleSubjectDto,
  CreateScheduleTeacherDto,
  ScheduleLessonFilters,
  UpdateScheduleLessonDto,
} from './dto/schedule.dto';
import {
  ScheduleAcademicGroup,
  ScheduleGroupLevel,
} from './models/schedule-academic-group.model';
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

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly lessonMinutes = 45;

  constructor(
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
    @InjectModel(ScheduleLesson)
    private readonly lessonModel: typeof ScheduleLesson,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultDictionaries();
  }

  async findDictionaries() {
    const [
      subjects,
      teachers,
      classTypes,
      notes,
      locations,
      groups,
    ] = await Promise.all([
      this.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      this.teacherModel.findAll({
        where: { active: true },
        order: [
          ['lastName', 'ASC'],
          ['firstName', 'ASC'],
        ],
      }),
      this.classTypeModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      this.noteModel.findAll({ where: { active: true }, order: [['text', 'ASC']] }),
      this.locationModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      this.groupModel.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
    ]);

    return {
      subjects,
      teachers: teachers.map((teacher) => this.mapTeacher(teacher)),
      classTypes,
      notes,
      buildings: locations.filter((location) => location.type === ScheduleLocationType.BUILDING),
      rooms: locations.filter((location) => location.type === ScheduleLocationType.ROOM),
      groups,
      timeSlots: {
        hours: this.range(6, 22),
        minutes: this.range(0, 55, 5).map((minute) => minute.toString().padStart(2, '0')),
        lessonHours: this.range(1, 12),
      },
    };
  }

  async findSummary() {
    const [lessons, subjects, teachers, rooms, groups] = await Promise.all([
      this.lessonModel.count(),
      this.subjectModel.count({ where: { active: true } }),
      this.teacherModel.count({ where: { active: true } }),
      this.locationModel.count({
        where: { active: true, type: ScheduleLocationType.ROOM },
      }),
      this.groupModel.count({ where: { active: true } }),
    ]);

    return { lessons, subjects, teachers, rooms, groups };
  }

  async findSubjects(teacherId?: string): Promise<ScheduleSubject[]> {
    if (!teacherId) {
      return this.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] });
    }

    const links = await this.teacherSubjectModel.findAll({ where: { teacherId } });
    const subjectIds = links.map((link) => link.subjectId);
    if (!subjectIds.length) {
      return this.subjectModel.findAll({ where: { active: true }, order: [['name', 'ASC']] });
    }

    return this.subjectModel.findAll({
      where: { active: true, id: { [Op.in]: subjectIds } },
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
    const where: any = {
      active: true,
      type: ScheduleLocationType.ROOM,
    };
    if (params.buildingId) {
      where.parentId = params.buildingId;
    }

    const rooms = await this.locationModel.findAll({ where, order: [['name', 'ASC']] });
    if (
      !params.date ||
      params.startHour === undefined ||
      params.startMinute === undefined ||
      params.lessonHours === undefined
    ) {
      return rooms.map((room) => ({ ...room.toJSON(), occupied: false }));
    }

    const occupiedIds = await this.findOccupiedRoomIds(
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

      const rooms = await this.locationModel.findAll({ where: roomWhere });
      where.roomId = { [Op.in]: rooms.map((room) => room.id) };
    } else if (filters.roomId) {
      where.roomId = filters.roomId;
    }
    if (filters.groupId) {
      where.groupId = { [Op.in]: await this.getGroupAndDescendantIds(filters.groupId) };
    }

    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 5000);

    const lessons = await this.lessonModel.findAll({
      where,
      include: this.lessonIncludes(),
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
    return this.subjectModel.create(dto);
  }

  async createTeacher(dto: CreateScheduleTeacherDto) {
    return this.teacherModel.create(dto);
  }

  async createClassType(dto: CreateScheduleClassTypeDto) {
    return this.classTypeModel.create(dto);
  }

  async createNote(dto: CreateScheduleNoteDto) {
    return this.noteModel.create(dto);
  }

  async createLocation(dto: CreateScheduleLocationDto) {
    await this.validateParentLocation(dto);
    return this.locationModel.create(dto);
  }

  async createGroup(dto: CreateScheduleAcademicGroupDto) {
    await this.validateParentGroup(dto);
    return this.groupModel.create(dto);
  }

  async createLesson(dto: CreateScheduleLessonDto) {
    await this.validateLessonReferences(dto);
    await this.assertNoLessonConflicts(dto);
    const lesson = await this.lessonModel.create(dto);
    return this.findLesson(lesson.id);
  }

  async updateLesson(id: string, dto: UpdateScheduleLessonDto) {
    const lesson = await this.lessonModel.findByPk(id);
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

    await this.validateLessonReferences(nextLesson);
    await this.assertNoLessonConflicts(nextLesson, id);
    await lesson.update(dto);
    return this.findLesson(id);
  }

  async deleteLesson(id: string) {
    const lesson = await this.lessonModel.findByPk(id);
    if (!lesson) {
      throw new NotFoundException('Nie znaleziono zajęć.');
    }
    await lesson.destroy();
    return { deleted: true, id };
  }

  async findLesson(id: string) {
    const lesson = await this.lessonModel.findByPk(id, { include: this.lessonIncludes() });
    if (!lesson) {
      throw new NotFoundException('Nie znaleziono zajęć.');
    }
    return this.mapLesson(lesson);
  }

  private lessonIncludes() {
    return [
      { model: ScheduleTeacher },
      { model: ScheduleSubject },
      { model: ScheduleLocation },
      { model: ScheduleAcademicGroup },
      { model: ScheduleClassType },
      { model: ScheduleNote },
    ];
  }

  private async validateLessonReferences(dto: LessonLike): Promise<void> {
    const [teacher, subject, room, group, classType, note] = await Promise.all([
      this.teacherModel.findByPk(dto.teacherId),
      this.subjectModel.findByPk(dto.subjectId),
      this.locationModel.findByPk(dto.roomId),
      this.groupModel.findByPk(dto.groupId),
      this.classTypeModel.findByPk(dto.classTypeId),
      dto.noteId ? this.noteModel.findByPk(dto.noteId) : Promise.resolve(true),
    ]);

    if (!teacher || !subject || !room || !group || !classType || !note) {
      throw new NotFoundException('Jedna z wybranych pozycji słownikowych nie istnieje.');
    }
    if (room instanceof ScheduleLocation && room.type !== ScheduleLocationType.ROOM) {
      throw new ConflictException('Wybrana lokalizacja nie jest salą.');
    }
  }

  private async validateParentLocation(dto: CreateScheduleLocationDto): Promise<void> {
    if (dto.type === ScheduleLocationType.BUILDING && dto.parentId) {
      throw new ConflictException('Budynek nie może mieć budynku nadrzędnego.');
    }
    if (dto.type === ScheduleLocationType.ROOM && !dto.parentId) {
      throw new ConflictException('Sala musi mieć wskazany budynek.');
    }
    if (dto.parentId) {
      const parent = await this.locationModel.findByPk(dto.parentId);
      if (!parent || parent.type !== ScheduleLocationType.BUILDING) {
        throw new NotFoundException('Nie znaleziono budynku nadrzędnego.');
      }
    }
  }

  private async validateParentGroup(dto: CreateScheduleAcademicGroupDto): Promise<void> {
    if (dto.level === ScheduleGroupLevel.COURSE && dto.parentId) {
      throw new ConflictException('Kierunek nie może mieć elementu nadrzędnego.');
    }
    if (dto.level !== ScheduleGroupLevel.COURSE && !dto.parentId) {
      throw new ConflictException('Specjalność albo grupa musi mieć element nadrzędny.');
    }
    if (!dto.parentId) {
      return;
    }

    const parent = await this.groupModel.findByPk(dto.parentId);
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

  private async assertNoLessonConflicts(dto: LessonLike, ignoredLessonId?: string): Promise<void> {
    const lessons = await this.lessonModel.findAll({
      where: {
        date: dto.date,
        ...(ignoredLessonId ? { id: { [Op.ne]: ignoredLessonId } } : {}),
      },
      include: this.lessonIncludes(),
    });
    const start = this.toMinutes(dto.startHour, dto.startMinute);
    const end = start + dto.lessonHours * this.lessonMinutes;
    const relatedGroupIds = await this.getGroupConflictIds(dto.groupId);

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
    date: string,
    startHour: number,
    startMinute: number,
    lessonHours: number,
  ): Promise<Set<string>> {
    const lessons = await this.lessonModel.findAll({ where: { date } });
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

  private async getGroupConflictIds(groupId: string): Promise<Set<string>> {
    const groups = await this.groupModel.findAll({ where: { active: true } });
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

  private async getGroupAndDescendantIds(groupId: string): Promise<string[]> {
    const groups = await this.groupModel.findAll({ where: { active: true } });
    return [groupId, ...this.findDescendantIds(groupId, groups)];
  }

  private findDescendantIds(groupId: string, groups: ScheduleAcademicGroup[]): string[] {
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
