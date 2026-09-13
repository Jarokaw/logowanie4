export enum StudentPrintColumnId {
  DATE = 'date',
  WEEKDAY = 'weekday',
  TIME = 'time',
  BUILDING = 'building',
  COURSE = 'course',
  SPECIALIZATION = 'specialization',
  GROUP = 'group',
  SUBJECT = 'subject',
  CLASS_TYPE = 'classType',
  TEACHER = 'teacher',
  ROOM = 'room',
  STUDY_MODE = 'studyMode'
}

export enum StudentPrintType {
  STUDENTS = 'STUDENTS',
  TEACHERS = 'TEACHERS',
  ROOMS = 'ROOMS'
}

export enum StudentPrintStudyMode {
  ALL_STUDY_MODES = 'ALL_STUDY_MODES',
  UNASSIGNED = 'UNASSIGNED',
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  POSTGRADUATE = 'POSTGRADUATE'
}

export interface StudentPrintColumnSetting {
  id: StudentPrintColumnId;
  enabled: boolean;
}

export interface StudentPrintSettings {
  printType: StudentPrintType;
  studyMode: StudentPrintStudyMode;
  columns: StudentPrintColumnSetting[];
}

export const PRINT_COLUMN_IDS: Record<StudentPrintType, StudentPrintColumnId[]> = {
  [StudentPrintType.STUDENTS]: [
    StudentPrintColumnId.DATE,
    StudentPrintColumnId.WEEKDAY,
    StudentPrintColumnId.TIME,
    StudentPrintColumnId.COURSE,
    StudentPrintColumnId.SPECIALIZATION,
    StudentPrintColumnId.GROUP,
    StudentPrintColumnId.SUBJECT,
    StudentPrintColumnId.CLASS_TYPE,
    StudentPrintColumnId.TEACHER,
    StudentPrintColumnId.ROOM
  ],
  [StudentPrintType.TEACHERS]: [
    StudentPrintColumnId.DATE,
    StudentPrintColumnId.WEEKDAY,
    StudentPrintColumnId.TIME,
    StudentPrintColumnId.SUBJECT,
    StudentPrintColumnId.CLASS_TYPE,
    StudentPrintColumnId.ROOM,
    StudentPrintColumnId.GROUP
  ],
  [StudentPrintType.ROOMS]: [
    StudentPrintColumnId.DATE,
    StudentPrintColumnId.WEEKDAY,
    StudentPrintColumnId.TIME,
    StudentPrintColumnId.BUILDING,
    StudentPrintColumnId.ROOM,
    StudentPrintColumnId.COURSE,
    StudentPrintColumnId.GROUP,
    StudentPrintColumnId.SUBJECT,
    StudentPrintColumnId.TEACHER
  ]
};
