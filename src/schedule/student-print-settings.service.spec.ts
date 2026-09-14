import { SchedulePrintSettings } from './models/schedule-print-settings.model';
import { ScheduleStudentPrintSettings } from './models/schedule-student-print-settings.model';
import { StudentPrintSettingsService } from './student-print-settings.service';
import {
  PRINT_COLUMN_IDS,
  StudentPrintColumnId,
  StudentPrintStudyMode,
  StudentPrintType
} from './student-print-settings.types';

describe('StudentPrintSettingsService', () => {
  const legacyModel = { findByPk: jest.fn() };
  const settingsModel = { findOne: jest.fn(), upsert: jest.fn() };
  const service = new StudentPrintSettingsService(
    legacyModel as unknown as typeof ScheduleStudentPrintSettings,
    settingsModel as unknown as typeof SchedulePrintSettings
  );

  beforeEach(() => {
    jest.resetAllMocks();
    settingsModel.findOne.mockResolvedValue(null);
  });

  it('returns all columns enabled when the selected study mode has no settings', async () => {
    const result = await service.findForUser('user-a', StudentPrintType.STUDENTS, StudentPrintStudyMode.PART_TIME);

    expect(result).toMatchObject({
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.PART_TIME
    });
    expect(result.columns.map(column => column.id)).toEqual(PRINT_COLUMN_IDS[StudentPrintType.STUDENTS]);
    expect(result.columns.every(column => column.enabled)).toBe(true);
    expect(settingsModel.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        printType: StudentPrintType.STUDENTS,
        studyMode: StudentPrintStudyMode.PART_TIME
      }
    });
    expect(legacyModel.findByPk).not.toHaveBeenCalled();
  });

  it('returns all teacher columns enabled for a new teacher print scope', async () => {
    const result = await service.findForUser(
      'user-a',
      StudentPrintType.TEACHERS,
      StudentPrintStudyMode.FULL_TIME
    );

    expect(result.columns.map(column => column.id)).toEqual([
      StudentPrintColumnId.DATE,
      StudentPrintColumnId.WEEKDAY,
      StudentPrintColumnId.TIME,
      StudentPrintColumnId.COURSE,
      StudentPrintColumnId.SUBJECT,
      StudentPrintColumnId.CLASS_TYPE,
      StudentPrintColumnId.ROOM,
      StudentPrintColumnId.GROUP,
      StudentPrintColumnId.NOTE
    ]);
    expect(result.columns.every(column => column.enabled)).toBe(true);
    expect(legacyModel.findByPk).not.toHaveBeenCalled();
  });

  it('adds the note column to a teacher layout saved before that column existed', async () => {
    const previousColumns = [
      StudentPrintColumnId.DATE,
      StudentPrintColumnId.WEEKDAY,
      StudentPrintColumnId.TIME,
      StudentPrintColumnId.COURSE,
      StudentPrintColumnId.SUBJECT,
      StudentPrintColumnId.CLASS_TYPE,
      StudentPrintColumnId.ROOM,
      StudentPrintColumnId.GROUP,
    ].map(id => ({ id, enabled: id !== StudentPrintColumnId.GROUP }));
    settingsModel.findOne.mockResolvedValue({ columns: previousColumns });

    const result = await service.findForUser(
      'user-a',
      StudentPrintType.TEACHERS,
      StudentPrintStudyMode.FULL_TIME,
    );

    expect(result.columns).toEqual([
      ...previousColumns,
      { id: StudentPrintColumnId.NOTE, enabled: true },
    ]);
    expect(settingsModel.upsert).toHaveBeenCalledWith({
      userId: 'user-a',
      printType: StudentPrintType.TEACHERS,
      studyMode: StudentPrintStudyMode.FULL_TIME,
      columns: result.columns,
    });
  });

  it('returns the room columns enabled in one shared scope', async () => {
    const result = await service.findForUser(
      'user-a',
      StudentPrintType.ROOMS,
      StudentPrintStudyMode.ALL_STUDY_MODES
    );

    expect(result.columns.map(column => column.id)).toEqual(PRINT_COLUMN_IDS[StudentPrintType.ROOMS]);
    expect(result.columns.every(column => column.enabled)).toBe(true);
  });

  it('restores the order and disabled states saved for the selected study mode', async () => {
    const columns = PRINT_COLUMN_IDS[StudentPrintType.STUDENTS]
      .reverse()
      .map(id => ({ id, enabled: id !== StudentPrintColumnId.ROOM }));
    settingsModel.findOne.mockResolvedValue({ columns });

    expect(await service.findForUser('user-b', StudentPrintType.STUDENTS, StudentPrintStudyMode.POSTGRADUATE)).toEqual({
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.POSTGRADUATE,
      columns
    });
  });

  it('migrates the previous global layout to the all study modes scope', async () => {
    const columns = PRINT_COLUMN_IDS[StudentPrintType.STUDENTS].map(id => ({ id, enabled: true }));
    legacyModel.findByPk.mockResolvedValue({ columns });

    await expect(
      service.findForUser('user-c', StudentPrintType.STUDENTS, StudentPrintStudyMode.ALL_STUDY_MODES)
    ).resolves.toEqual({
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.ALL_STUDY_MODES,
      columns
    });
    expect(settingsModel.upsert).toHaveBeenCalledWith({
      userId: 'user-c',
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.ALL_STUDY_MODES,
      columns
    });
  });

  it('writes settings only for the authenticated user and selected scope', async () => {
    const columns = PRINT_COLUMN_IDS[StudentPrintType.STUDENTS].map(id => ({ id, enabled: true }));
    await service.saveForUser('user-a', {
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.FULL_TIME,
      columns
    });
    expect(settingsModel.upsert).toHaveBeenCalledWith({
      userId: 'user-a',
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.FULL_TIME,
      columns
    });
  });

  it('stores teacher settings separately from student settings', async () => {
    const columns = [
      StudentPrintColumnId.DATE,
      StudentPrintColumnId.WEEKDAY,
      StudentPrintColumnId.TIME,
      StudentPrintColumnId.COURSE,
      StudentPrintColumnId.SUBJECT,
      StudentPrintColumnId.CLASS_TYPE,
      StudentPrintColumnId.ROOM,
      StudentPrintColumnId.GROUP,
      StudentPrintColumnId.NOTE
    ].map(id => ({ id, enabled: id !== StudentPrintColumnId.GROUP }));

    await service.saveForUser('user-a', {
      printType: StudentPrintType.TEACHERS,
      studyMode: StudentPrintStudyMode.PART_TIME,
      columns
    });

    expect(settingsModel.upsert).toHaveBeenCalledWith({
      userId: 'user-a',
      printType: StudentPrintType.TEACHERS,
      studyMode: StudentPrintStudyMode.PART_TIME,
      columns
    });
  });

  it('reports a database failure instead of confirming an unsaved configuration', async () => {
    settingsModel.upsert.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      service.saveForUser('user-a', {
        printType: StudentPrintType.STUDENTS,
        studyMode: StudentPrintStudyMode.FULL_TIME,
        columns: []
      })
    ).rejects.toThrow('Database unavailable');
  });
});
