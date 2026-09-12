import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions
} from 'class-validator';
import {
  PRINT_COLUMN_IDS,
  StudentPrintColumnId,
  StudentPrintColumnSetting,
  StudentPrintStudyMode,
  StudentPrintType
} from '../student-print-settings.types';

function IsCompletePrintColumnSelection(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCompletePrintColumnSelection',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, arguments_: ValidationArguments) {
          if (!Array.isArray(value)) return false;
          const printType = (arguments_.object as StudentPrintSettingsScopeDto).printType;
          const expectedIds = PRINT_COLUMN_IDS[printType];
          if (!expectedIds || value.length !== expectedIds.length) return false;
          const receivedIds = new Set(value.map(column => column?.id));
          return expectedIds.every(id => receivedIds.has(id));
        }
      }
    });
  };
}

export class StudentPrintColumnDto implements StudentPrintColumnSetting {
  @ApiProperty({ enum: StudentPrintColumnId })
  @IsEnum(StudentPrintColumnId)
  id: StudentPrintColumnId;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class StudentPrintSettingsScopeDto {
  @ApiProperty({ enum: StudentPrintType })
  @IsEnum(StudentPrintType)
  printType: StudentPrintType;

  @ApiProperty({ enum: StudentPrintStudyMode })
  @IsEnum(StudentPrintStudyMode)
  studyMode: StudentPrintStudyMode;
}

export class UpdateStudentPrintSettingsDto extends StudentPrintSettingsScopeDto {
  @ApiProperty({ type: [StudentPrintColumnDto] })
  @IsArray()
  @ArrayMinSize(PRINT_COLUMN_IDS[StudentPrintType.TEACHERS].length)
  @ArrayMaxSize(Object.values(StudentPrintColumnId).length)
  @ArrayUnique((column: StudentPrintColumnDto) => column?.id)
  @IsCompletePrintColumnSelection({
    message: 'columns must contain exactly the columns supported by the selected print type'
  })
  @ValidateNested({ each: true })
  @Type(() => StudentPrintColumnDto)
  columns: StudentPrintColumnDto[];
}
