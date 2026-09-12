import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  PRINT_COLUMN_IDS,
  StudentPrintColumnId,
  StudentPrintStudyMode,
  StudentPrintType
} from '../student-print-settings.types';
import { StudentPrintSettingsScopeDto, UpdateStudentPrintSettingsDto } from './student-print-settings.dto';

const defaults = () => PRINT_COLUMN_IDS[StudentPrintType.STUDENTS].map(id => ({ id, enabled: true }));
const validPayload = () => ({
  printType: StudentPrintType.STUDENTS,
  studyMode: StudentPrintStudyMode.FULL_TIME,
  columns: defaults()
});
const validate = (payload: unknown) => validateSync(plainToInstance(UpdateStudentPrintSettingsDto, payload));

describe('Student PDF column settings validation', () => {
  it('accepts a complete reordered selection, including disabled columns', () => {
    const payload = validPayload();
    payload.columns.reverse();
    payload.columns[0].enabled = false;
    expect(validate(payload)).toHaveLength(0);
  });

  it('accepts all columns disabled so the UI can keep this state', () => {
    expect(
      validate({
        ...validPayload(),
        columns: defaults().map(column => ({ ...column, enabled: false }))
      })
    ).toHaveLength(0);
  });

  it('accepts the complete teacher column selection', () => {
    const columns = [
      StudentPrintColumnId.DATE,
      StudentPrintColumnId.WEEKDAY,
      StudentPrintColumnId.TIME,
      StudentPrintColumnId.SUBJECT,
      StudentPrintColumnId.CLASS_TYPE,
      StudentPrintColumnId.ROOM,
      StudentPrintColumnId.GROUP
    ].map(id => ({ id, enabled: true }));

    expect(
      validate({
        printType: StudentPrintType.TEACHERS,
        studyMode: StudentPrintStudyMode.PART_TIME,
        columns
      })
    ).toHaveLength(0);
  });

  it('accepts the complete room column selection', () => {
    const columns = PRINT_COLUMN_IDS[StudentPrintType.ROOMS].map(id => ({ id, enabled: true }));

    expect(
      validate({
        printType: StudentPrintType.ROOMS,
        studyMode: StudentPrintStudyMode.ALL_STUDY_MODES,
        columns
      })
    ).toHaveLength(0);
  });

  it('rejects student columns for a teacher print and teacher columns for a student print', () => {
    const teacherColumns = defaults().filter(column =>
      [
        StudentPrintColumnId.DATE,
        StudentPrintColumnId.WEEKDAY,
        StudentPrintColumnId.TIME,
        StudentPrintColumnId.SUBJECT,
        StudentPrintColumnId.CLASS_TYPE,
        StudentPrintColumnId.ROOM,
        StudentPrintColumnId.GROUP
      ].includes(column.id)
    );

    expect(validate({ ...validPayload(), printType: StudentPrintType.TEACHERS }).length).toBeGreaterThan(0);
    expect(validate({ ...validPayload(), columns: teacherColumns }).length).toBeGreaterThan(0);
  });

  it.each([undefined, null, {}, [], defaults().slice(1), [...defaults(), defaults()[0]]])(
    'rejects incomplete or malformed settings (%#)',
    columns => {
      expect(validate({ ...validPayload(), columns }).length).toBeGreaterThan(0);
    }
  );

  it('rejects duplicate column identifiers', () => {
    const columns = defaults();
    columns[0] = columns[1];
    expect(validate({ ...validPayload(), columns }).length).toBeGreaterThan(0);
  });

  it.each([{ id: 'unknown', enabled: true }, { id: 'date', enabled: 'false' }, { id: 'date' }, null])(
    'rejects an invalid column (%#)',
    column => {
      expect(validate({ ...validPayload(), columns: [column, ...defaults().slice(1)] }).length).toBeGreaterThan(0);
    }
  );

  it.each([
    { printType: 'TEACHERS', studyMode: StudentPrintStudyMode.FULL_TIME },
    { printType: StudentPrintType.STUDENTS, studyMode: 'INVALID_MODE' },
    { printType: undefined, studyMode: StudentPrintStudyMode.FULL_TIME },
    { printType: StudentPrintType.STUDENTS, studyMode: undefined }
  ])('rejects an invalid settings scope (%#)', scope => {
    expect(validate({ ...validPayload(), ...scope }).length).toBeGreaterThan(0);
  });

  it('validates the GET query scope independently', () => {
    const valid = plainToInstance(StudentPrintSettingsScopeDto, {
      printType: StudentPrintType.STUDENTS,
      studyMode: StudentPrintStudyMode.PART_TIME
    });
    const invalid = plainToInstance(StudentPrintSettingsScopeDto, {
      printType: StudentPrintType.STUDENTS,
      studyMode: 'WEEKEND'
    });
    expect(validateSync(valid)).toHaveLength(0);
    expect(validateSync(invalid).length).toBeGreaterThan(0);
  });
});
