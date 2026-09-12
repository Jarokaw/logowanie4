import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UpdateStudentPrintSettingsDto } from './dto/student-print-settings.dto';
import { SchedulePrintSettings } from './models/schedule-print-settings.model';
import { ScheduleStudentPrintSettings } from './models/schedule-student-print-settings.model';
import {
  PRINT_COLUMN_IDS,
  StudentPrintSettings,
  StudentPrintStudyMode,
  StudentPrintType
} from './student-print-settings.types';

@Injectable()
export class StudentPrintSettingsService {
  constructor(
    @InjectModel(ScheduleStudentPrintSettings)
    private readonly legacySettingsModel: typeof ScheduleStudentPrintSettings,
    @InjectModel(SchedulePrintSettings)
    private readonly settingsModel: typeof SchedulePrintSettings
  ) {}

  async findForUser(
    userId: string,
    printType: StudentPrintType,
    studyMode: StudentPrintStudyMode
  ): Promise<StudentPrintSettings> {
    const settings = await this.settingsModel.findOne({ where: { userId, printType, studyMode } });
    let columns = settings?.columns;

    if (!columns && printType === StudentPrintType.STUDENTS && studyMode === StudentPrintStudyMode.ALL_STUDY_MODES) {
      const legacySettings = await this.legacySettingsModel.findByPk(userId);
      if (legacySettings?.columns) {
        columns = legacySettings.columns;
        await this.settingsModel.upsert({ userId, printType, studyMode, columns });
      }
    }

    return {
      printType,
      studyMode,
      columns: columns ?? this.defaultColumns(printType)
    };
  }

  async saveForUser(userId: string, dto: UpdateStudentPrintSettingsDto): Promise<StudentPrintSettings> {
    const columns = dto.columns.map(({ id, enabled }) => ({ id, enabled }));
    await this.settingsModel.upsert({
      userId,
      printType: dto.printType,
      studyMode: dto.studyMode,
      columns
    });
    return { printType: dto.printType, studyMode: dto.studyMode, columns };
  }

  private defaultColumns(printType: StudentPrintType) {
    return PRINT_COLUMN_IDS[printType].map(id => ({ id, enabled: true }));
  }
}
