const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    }),
);

const dumpPath = process.argv[2] || 'D:\\nodejs\\udemy\\wydzial_2026_II.sql';
const targetDatabase = process.argv[3] || 'Wydzial_2026_II';

function extractAllInsertValues(sql, tableName) {
  const sections = [];
  const marker = `INSERT INTO \`${tableName}\``;
  let searchFrom = 0;

  while (true) {
    const insertStart = sql.indexOf(marker, searchFrom);
    if (insertStart === -1) {
      break;
    }

    const valuesStart = sql.indexOf('VALUES', insertStart);
    if (valuesStart === -1) {
      throw new Error(`Nie znaleziono sekcji VALUES dla tabeli \`${tableName}\`.`);
    }

    const statementEnd = sql.indexOf(';', valuesStart);
    if (statementEnd === -1) {
      throw new Error(`Nie znaleziono konca instrukcji INSERT dla tabeli \`${tableName}\`.`);
    }

    sections.push(sql.slice(valuesStart + 'VALUES'.length, statementEnd));
    searchFrom = statementEnd + 1;
  }

  if (sections.length === 0) {
    throw new Error(`Nie znaleziono INSERT INTO \`${tableName}\` w pliku SQL.`);
  }

  return sections;
}

function parseValueRows(valuesSql) {
  const rows = [];
  let currentRow = null;
  let currentValue = '';
  let inString = false;
  let escaped = false;

  const pushValue = () => {
    if (!currentRow) {
      return;
    }

    const rawValue = currentValue.trim();
    currentRow.push(rawValue.toUpperCase() === 'NULL' ? null : rawValue);
    currentValue = '';
  };

  for (const char of valuesSql) {
    if (escaped) {
      currentValue += char;
      escaped = false;
      continue;
    }

    if (inString && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      continue;
    }

    if (!inString && char === '(') {
      currentRow = [];
      currentValue = '';
      continue;
    }

    if (!inString && char === ',') {
      if (currentRow) {
        pushValue();
      }
      continue;
    }

    if (!inString && char === ')') {
      pushValue();
      if (currentRow) {
        rows.push(currentRow);
      }
      currentRow = null;
      currentValue = '';
      continue;
    }

    if (currentRow) {
      currentValue += char;
    }
  }

  return rows;
}

function normalizeText(value) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
}

function normalizeTitle(title) {
  const normalized = (title ?? '').trim();
  return normalized && normalized !== '-' ? normalized : null;
}

function teacherKey(teacher) {
  return [
    normalizeText(teacher.firstName),
    normalizeText(teacher.lastName),
    normalizeText(teacher.title),
  ].join('|');
}

function parseTitles(sql) {
  return new Map(
    extractAllInsertValues(sql, 'tytul_naukowy')
      .flatMap(parseValueRows)
      .map((row) => [Number(row[0]), normalizeTitle(row[1])]),
  );
}

function parseTeachers(sql, titlesById) {
  return extractAllInsertValues(sql, 'wykladowca')
    .flatMap(parseValueRows)
    .map((row) => ({
      oldId: Number(row[0]),
      title: titlesById.get(Number(row[1])) ?? null,
      firstName: (row[2] ?? '').trim(),
      lastName: (row[3] ?? '').trim(),
      status: Number(row[4]),
    }));
}

function parseKierunki(sql) {
  return extractAllInsertValues(sql, 'kierunki')
    .flatMap(parseValueRows)
    .map((row) => ({
      oldId: Number(row[0]),
      name: (row[1] ?? '').trim(),
      parentOldId: Number(row[2]),
      status: Number(row[3]),
    }));
}

function parseCourseTeacherLinks(sql) {
  return extractAllInsertValues(sql, 'kierunek_wykladowca')
    .flatMap(parseValueRows)
    .map((row) => ({
      oldId: Number(row[0]),
      oldCourseId: row[1] === null ? null : Number(row[1]),
      oldTeacherId: row[2] === null ? null : Number(row[2]),
    }));
}

function clientFor(database) {
  return new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database,
  });
}

function addToFirstValueMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, value);
  }
}

async function ensureScheduleCourseTeachersTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_course_teachers (
      id uuid PRIMARY KEY,
      "courseId" uuid NOT NULL,
      "teacherId" uuid NOT NULL,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schedule_course_teachers_course_teacher_unique
    ON public.schedule_course_teachers ("courseId", "teacherId")
  `);
}

async function importRows(sql) {
  const titlesById = parseTitles(sql);
  const oldTeachers = parseTeachers(sql, titlesById);
  const oldCourses = parseKierunki(sql).filter(
    (row) => row.status === 1 && row.parentOldId === 0 && row.name,
  );
  const oldLinks = parseCourseTeacherLinks(sql);

  const oldTeachersById = new Map(oldTeachers.map((teacher) => [teacher.oldId, teacher]));
  const oldCoursesById = new Map(oldCourses.map((course) => [course.oldId, course]));
  const client = clientFor(targetDatabase);
  await client.connect();

  try {
    await client.query('BEGIN');
    await ensureScheduleCourseTeachersTable(client);

    const teachersResult = await client.query(`
      SELECT id, title, "firstName", "lastName"
      FROM public.schedule_teachers
      WHERE active = true
    `);
    const coursesResult = await client.query(`
      SELECT id, name
      FROM public.schedule_academic_groups
      WHERE active = true
        AND level::text = 'COURSE'
    `);
    const existingResult = await client.query(`
      SELECT "courseId", "teacherId"
      FROM public.schedule_course_teachers
    `);
    const beforeResult = await client.query(
      'SELECT count(*)::int AS count FROM public.schedule_course_teachers',
    );

    const currentTeachersByKey = new Map();
    for (const teacher of teachersResult.rows) {
      addToFirstValueMap(currentTeachersByKey, teacherKey(teacher), teacher.id);
    }

    const currentCoursesByName = new Map();
    for (const course of coursesResult.rows) {
      addToFirstValueMap(currentCoursesByName, normalizeText(course.name), course.id);
    }

    const teacherUuidByOldId = new Map();
    for (const teacher of oldTeachers.filter((item) => item.status === 1)) {
      const teacherUuid = currentTeachersByKey.get(teacherKey(teacher));
      if (teacherUuid) {
        teacherUuidByOldId.set(teacher.oldId, teacherUuid);
      }
    }

    const courseUuidByOldId = new Map();
    for (const course of oldCourses) {
      const courseUuid = currentCoursesByName.get(normalizeText(course.name));
      if (courseUuid) {
        courseUuidByOldId.set(course.oldId, courseUuid);
      }
    }

    const existingPairs = new Set(
      existingResult.rows.map((row) => `${row.courseId}|${row.teacherId}`),
    );
    const pairsToInsert = new Map();
    const stats = {
      totalLinks: oldLinks.length,
      skippedMissingOldValue: 0,
      skippedInactiveOrMissingCourse: 0,
      skippedInactiveOrMissingTeacher: 0,
      skippedUnmappedCourse: 0,
      skippedUnmappedTeacher: 0,
      duplicateInDump: 0,
      alreadyExists: 0,
      inserted: 0,
    };
    const samples = {
      missingCourse: [],
      missingTeacher: [],
    };

    for (const link of oldLinks) {
      if (!link.oldCourseId || !link.oldTeacherId) {
        stats.skippedMissingOldValue += 1;
        continue;
      }

      const oldCourse = oldCoursesById.get(link.oldCourseId);
      const oldTeacher = oldTeachersById.get(link.oldTeacherId);

      if (!oldCourse) {
        stats.skippedInactiveOrMissingCourse += 1;
        continue;
      }

      if (!oldTeacher || oldTeacher.status !== 1) {
        stats.skippedInactiveOrMissingTeacher += 1;
        continue;
      }

      const courseId = courseUuidByOldId.get(link.oldCourseId);
      if (!courseId) {
        stats.skippedUnmappedCourse += 1;
        if (samples.missingCourse.length < 5) {
          samples.missingCourse.push(oldCourse.name);
        }
        continue;
      }

      const teacherId = teacherUuidByOldId.get(link.oldTeacherId);
      if (!teacherId) {
        stats.skippedUnmappedTeacher += 1;
        if (samples.missingTeacher.length < 5) {
          samples.missingTeacher.push(
            `${oldTeacher.title ? `${oldTeacher.title} ` : ''}${oldTeacher.firstName} ${
              oldTeacher.lastName
            }`,
          );
        }
        continue;
      }

      const pairKey = `${courseId}|${teacherId}`;
      if (existingPairs.has(pairKey)) {
        stats.alreadyExists += 1;
        continue;
      }

      if (pairsToInsert.has(pairKey)) {
        stats.duplicateInDump += 1;
        continue;
      }

      pairsToInsert.set(pairKey, { courseId, teacherId });
    }

    for (const pair of pairsToInsert.values()) {
      await client.query(
        `
          INSERT INTO public.schedule_course_teachers
            (id, "courseId", "teacherId", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, now(), now())
        `,
        [crypto.randomUUID(), pair.courseId, pair.teacherId],
      );
      stats.inserted += 1;
    }

    const afterResult = await client.query(
      'SELECT count(*)::int AS count FROM public.schedule_course_teachers',
    );
    await client.query('COMMIT');

    return {
      database: targetDatabase,
      before: beforeResult.rows[0].count,
      after: afterResult.rows[0].count,
      mappedCourses: courseUuidByOldId.size,
      mappedTeachers: teacherUuidByOldId.size,
      samples,
      ...stats,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

(async () => {
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const result = await importRows(sql);

  console.log(`Baza docelowa: ${result.database}`);
  console.log(`Relacje przed importem: ${result.before}`);
  console.log(`Relacje po imporcie: ${result.after}`);
  console.log(`Wiersze kierunek_wykladowca w backupie: ${result.totalLinks}`);
  console.log(`Dopasowane aktywne kierunki: ${result.mappedCourses}`);
  console.log(`Dopasowani aktywni wykladowcy: ${result.mappedTeachers}`);
  console.log(`Dodane relacje: ${result.inserted}`);
  console.log(`Juz istnialy: ${result.alreadyExists}`);
  console.log(`Pominiete duplikaty w backupie: ${result.duplicateInDump}`);
  console.log(`Pominiete przez puste stare ID: ${result.skippedMissingOldValue}`);
  console.log(`Pominiete przez nieaktywny/brakujacy kierunek: ${result.skippedInactiveOrMissingCourse}`);
  console.log(`Pominiete przez nieaktywnego/brakujacego wykladowce: ${result.skippedInactiveOrMissingTeacher}`);
  console.log(`Pominiete, bo nie dopasowano kierunku w nowej bazie: ${result.skippedUnmappedCourse}`);
  console.log(`Pominiete, bo nie dopasowano wykladowcy w nowej bazie: ${result.skippedUnmappedTeacher}`);

  if (result.samples.missingCourse.length) {
    console.log(`Przykladowe niedopasowane kierunki: ${result.samples.missingCourse.join(', ')}`);
  }

  if (result.samples.missingTeacher.length) {
    console.log(`Przykladowi niedopasowani wykladowcy: ${result.samples.missingTeacher.join(', ')}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
