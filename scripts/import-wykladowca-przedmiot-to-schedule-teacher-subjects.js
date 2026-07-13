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

function extractInsertValues(sql, tableName) {
  const insertStart = sql.indexOf(`INSERT INTO \`${tableName}\``);
  if (insertStart === -1) {
    throw new Error(`Nie znaleziono INSERT INTO \`${tableName}\` w pliku SQL.`);
  }

  const valuesStart = sql.indexOf('VALUES', insertStart);
  if (valuesStart === -1) {
    throw new Error(`Nie znaleziono sekcji VALUES dla tabeli \`${tableName}\`.`);
  }

  const statementEnd = sql.indexOf(';', valuesStart);
  if (statementEnd === -1) {
    throw new Error(`Nie znaleziono konca instrukcji INSERT dla tabeli \`${tableName}\`.`);
  }

  return sql.slice(valuesStart + 'VALUES'.length, statementEnd);
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
    parseValueRows(extractInsertValues(sql, 'tytul_naukowy')).map((row) => [
      Number(row[0]),
      normalizeTitle(row[1]),
    ]),
  );
}

function parseTeachers(sql, titlesById) {
  return parseValueRows(extractInsertValues(sql, 'wykladowca')).map((row) => ({
    oldId: Number(row[0]),
    title: titlesById.get(Number(row[1])) ?? null,
    firstName: (row[2] ?? '').trim(),
    lastName: (row[3] ?? '').trim(),
    status: Number(row[4]),
  }));
}

function parseSubjects(sql) {
  return parseValueRows(extractInsertValues(sql, 'przedmiot')).map((row) => ({
    oldId: Number(row[0]),
    name: (row[1] ?? '').trim(),
    status: Number(row[2]),
  }));
}

function parseTeacherSubjectLinks(sql) {
  return parseValueRows(extractInsertValues(sql, 'wykladowca_przedmiot')).map((row) => ({
    oldId: Number(row[0]),
    oldTeacherId: Number(row[1]),
    oldSubjectId: Number(row[2]),
  }));
}

function addToFirstValueMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, value);
  }
}

async function ensureScheduleTeacherSubjectsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_teacher_subjects (
      id uuid PRIMARY KEY,
      "teacherId" uuid NOT NULL,
      "subjectId" uuid NOT NULL,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS schedule_teacher_subjects_teacher_idx
    ON public.schedule_teacher_subjects ("teacherId")
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS schedule_teacher_subjects_subject_idx
    ON public.schedule_teacher_subjects ("subjectId")
  `);
}

async function importRows(sql) {
  const titlesById = parseTitles(sql);
  const oldTeachers = parseTeachers(sql, titlesById);
  const oldSubjects = parseSubjects(sql);
  const oldLinks = parseTeacherSubjectLinks(sql);

  const oldTeachersById = new Map(oldTeachers.map((teacher) => [teacher.oldId, teacher]));
  const oldSubjectsById = new Map(oldSubjects.map((subject) => [subject.oldId, subject]));

  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: targetDatabase,
  });

  await client.connect();

  try {
    await client.query('BEGIN');
    await ensureScheduleTeacherSubjectsTable(client);

    const teachersResult = await client.query(`
        SELECT id, title, "firstName", "lastName"
        FROM public.schedule_teachers
        WHERE active = true
      `);
    const subjectsResult = await client.query(`
        SELECT id, name
        FROM public.schedule_subjects
        WHERE active = true
      `);
    const existingResult = await client.query(`
        SELECT "teacherId", "subjectId"
        FROM public.schedule_teacher_subjects
      `);
    const beforeResult = await client.query(
      'SELECT count(*)::int AS count FROM public.schedule_teacher_subjects',
    );

    const currentTeachersByKey = new Map();
    for (const teacher of teachersResult.rows) {
      addToFirstValueMap(currentTeachersByKey, teacherKey(teacher), teacher.id);
    }

    const currentSubjectsByName = new Map();
    for (const subject of subjectsResult.rows) {
      addToFirstValueMap(currentSubjectsByName, normalizeText(subject.name), subject.id);
    }

    const teacherUuidByOldId = new Map();
    for (const teacher of oldTeachers.filter((item) => item.status === 1)) {
      const teacherUuid = currentTeachersByKey.get(teacherKey(teacher));
      if (teacherUuid) {
        teacherUuidByOldId.set(teacher.oldId, teacherUuid);
      }
    }

    const subjectUuidByOldId = new Map();
    for (const subject of oldSubjects.filter((item) => item.status === 1)) {
      const subjectUuid = currentSubjectsByName.get(normalizeText(subject.name));
      if (subjectUuid) {
        subjectUuidByOldId.set(subject.oldId, subjectUuid);
      }
    }

    const existingPairs = new Set(
      existingResult.rows.map((row) => `${row.teacherId}|${row.subjectId}`),
    );
    const pairsToInsert = new Map();
    const samples = {
      missingTeacher: [],
      missingSubject: [],
    };
    const stats = {
      totalLinks: oldLinks.length,
      skippedInactiveTeacher: 0,
      skippedInactiveSubject: 0,
      skippedMissingTeacher: 0,
      skippedMissingSubject: 0,
      duplicateInDump: 0,
      alreadyExists: 0,
      inserted: 0,
    };

    for (const link of oldLinks) {
      const oldTeacher = oldTeachersById.get(link.oldTeacherId);
      const oldSubject = oldSubjectsById.get(link.oldSubjectId);

      if (!oldTeacher || oldTeacher.status !== 1) {
        stats.skippedInactiveTeacher += 1;
        continue;
      }

      if (!oldSubject || oldSubject.status !== 1) {
        stats.skippedInactiveSubject += 1;
        continue;
      }

      const teacherId = teacherUuidByOldId.get(link.oldTeacherId);
      if (!teacherId) {
        stats.skippedMissingTeacher += 1;
        if (samples.missingTeacher.length < 5) {
          samples.missingTeacher.push(
            `${oldTeacher.title ? `${oldTeacher.title} ` : ''}${oldTeacher.firstName} ${
              oldTeacher.lastName
            }`,
          );
        }
        continue;
      }

      const subjectId = subjectUuidByOldId.get(link.oldSubjectId);
      if (!subjectId) {
        stats.skippedMissingSubject += 1;
        if (samples.missingSubject.length < 5) {
          samples.missingSubject.push(oldSubject.name);
        }
        continue;
      }

      const pairKey = `${teacherId}|${subjectId}`;
      if (existingPairs.has(pairKey)) {
        stats.alreadyExists += 1;
        continue;
      }

      if (pairsToInsert.has(pairKey)) {
        stats.duplicateInDump += 1;
        continue;
      }

      pairsToInsert.set(pairKey, { teacherId, subjectId });
    }

    for (const pair of pairsToInsert.values()) {
      await client.query(
        `
          INSERT INTO public.schedule_teacher_subjects
            (id, "teacherId", "subjectId", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, now(), now())
        `,
        [crypto.randomUUID(), pair.teacherId, pair.subjectId],
      );
      stats.inserted += 1;
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS schedule_teacher_subjects_teacher_subject_unique
      ON public.schedule_teacher_subjects ("teacherId", "subjectId")
    `);

    const afterResult = await client.query(
      'SELECT count(*)::int AS count FROM public.schedule_teacher_subjects',
    );
    await client.query('COMMIT');

    return {
      database: targetDatabase,
      before: beforeResult.rows[0].count,
      after: afterResult.rows[0].count,
      mappedTeachers: teacherUuidByOldId.size,
      mappedSubjects: subjectUuidByOldId.size,
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
  console.log(`Wiersze wykladowca_przedmiot w backupie: ${result.totalLinks}`);
  console.log(`Dopasowani aktywni wykladowcy: ${result.mappedTeachers}`);
  console.log(`Dopasowane aktywne przedmioty: ${result.mappedSubjects}`);
  console.log(`Dodane relacje: ${result.inserted}`);
  console.log(`Juz istnialy: ${result.alreadyExists}`);
  console.log(`Pominiete duplikaty w backupie: ${result.duplicateInDump}`);
  console.log(`Pominiete przez nieaktywnego/brakujacego wykladowce: ${result.skippedInactiveTeacher}`);
  console.log(`Pominiete przez nieaktywny/brakujacy przedmiot: ${result.skippedInactiveSubject}`);
  console.log(`Pominiete, bo nie dopasowano wykladowcy w nowej bazie: ${result.skippedMissingTeacher}`);
  console.log(`Pominiete, bo nie dopasowano przedmiotu w nowej bazie: ${result.skippedMissingSubject}`);

  if (result.samples.missingTeacher.length) {
    console.log(`Przykladowi niedopasowani wykladowcy: ${result.samples.missingTeacher.join(', ')}`);
  }

  if (result.samples.missingSubject.length) {
    console.log(`Przykladowe niedopasowane przedmioty: ${result.samples.missingSubject.join(', ')}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
