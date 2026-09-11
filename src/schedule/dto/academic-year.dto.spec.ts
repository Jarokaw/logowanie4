import { validateSync } from 'class-validator';
import { ScheduleAcademicSemester } from '../models/schedule-academic-year.model';
import {
  CreateScheduleAcademicYearDto,
  UpdateScheduleAcademicYearDto,
} from './schedule.dto';

describe('Academic year semester validation', () => {
  it.each(Object.values(ScheduleAcademicSemester))('accepts %s when creating and editing', (semester) => {
    const create = Object.assign(new CreateScheduleAcademicYearDto(), {
      name: 'SemesterTest_2026',
      semester,
    });
    const update = Object.assign(new UpdateScheduleAcademicYearDto(), { semester });

    expect(validateSync(create)).toHaveLength(0);
    expect(validateSync(update)).toHaveLength(0);
  });

  it.each([undefined, null, '', 'AUTUMN', 'winter'])('rejects %p on creation', (semester) => {
    const dto = Object.assign(new CreateScheduleAcademicYearDto(), {
      name: 'SemesterTest_2026',
      semester,
    });

    expect(validateSync(dto).some((error) => error.property === 'semester')).toBe(true);
  });

  it.each([null, '', 'AUTUMN', 'summer'])('rejects %p on update', (semester) => {
    const dto = Object.assign(new UpdateScheduleAcademicYearDto(), { semester });

    expect(validateSync(dto).some((error) => error.property === 'semester')).toBe(true);
  });

  it('allows other fields to be updated without changing the semester', () => {
    const dto = Object.assign(new UpdateScheduleAcademicYearDto(), { active: false });

    expect(validateSync(dto)).toHaveLength(0);
  });
});
