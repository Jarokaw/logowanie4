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

    const statementEnd = sql.indexOf(';\n', valuesStart);
    if (statementEnd === -1) {
      throw new Error(`Nie znaleziono konca instrukcji INSERT dla tabeli \`${tableName}\`.`);
    }

    sections.push(sql.slice(valuesStart + 'VALUES'.length, statementEnd));
    searchFrom = statementEnd + 2;
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

function rowsFor(sql, tableName) {
  return extractAllInsertValues(sql, tableName).flatMap(parseValueRows);
}

function normalizeTitle(title) {
  const normalized = (title ?? '').trim();
  return normalized && normalized !== '-' ? normalized : null;
}

function parseSimpleIdNameStatus(sql, tableName, idIndex, nameIndex, statusIndex) {
  return rowsFor(sql, tableName).map((row) => ({
    oldId: Number(row[idIndex]),
    name: (row[nameIndex] ?? '').trim(),
    status: Number(row[statusIndex]),
  }));
}

function parseTitles(sql) {
  return new Map(
    rowsFor(sql, 'tytul_naukowy').map((row) => [Number(row[0]), normalizeTitle(row[1])]),
  );
}

function parseTeachers(sql) {
  const titlesById = parseTitles(sql);
  return rowsFor(sql, 'wykladowca').map((row) => ({
    oldId: Number(row[0]),
    title: titlesById.get(Number(row[1])) ?? null,
    firstName: (row[2] ?? '').trim(),
    lastName: (row[3] ?? '').trim(),
    status: Number(row[4]),
  }));
}

function parseLocations(sql) {
  return rowsFor(sql, 'budynki_i_sale').map((row) => ({
    oldId: Number(row[0]),
    name: (row[1] ?? '').trim(),
    parentOldId: Number(row[2]),
    status: Number(row[3]),
  }));
}

function parseGroups(sql) {
  return rowsFor(sql, 'kierunki').map((row) => ({
    oldId: Number(row[0]),
    name: (row[1] ?? '').trim(),
    parentOldId: Number(row[2]),
    status: Number(row[3]),
  }));
}

function resolveLevel(row, rowsByOldId) {
  if (row.parentOldId === 0) {
    return 'COURSE';
  }

  const parent = rowsByOldId.get(row.parentOldId);
  if (!parent) {
    return null;
  }

  if (parent.parentOldId === 0) {
    return 'SPECIALIZATION';
  }

  const grandParent = rowsByOldId.get(parent.parentOldId);
  if (grandParent?.parentOldId === 0) {
    return 'GROUP';
  }

  return null;
}

function parseTimes(sql) {
  return {
    hours: new Map(rowsFor(sql, 'godzina').map((row) => [Number(row[0]), Number(row[1])])),
    minutes: new Map(rowsFor(sql, 'minuta').map((row) => [Number(row[0]), Number(row[1])])),
    lessonHours: new Map(
      rowsFor(sql, 'licznik_godzin').map((row) => [Number(row[0]), Number(row[1])]),
    ),
  };
}

function parsePlan(sql) {
  return rowsFor(sql, 'plan_zajec').map((row) => ({
    oldId: Number(row[0]),
    date: row[1],
    hourOldId: Number(row[2]),
    minuteOldId: Number(row[3]),
    lessonHoursOldId: Number(row[4]),
    teacherOldId: Number(row[5]),
    subjectOldId: Number(row[6]),
    roomOldId: Number(row[7]),
    groupOldId: Number(row[8]),
    classTypeOldId: Number(row[9]),
    noteOldId: Number(row[10]),
  }));
}

async function queryOne(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

async function buildSubjectMap(client, subjects) {
  const map = new Map();
  for (const subject of subjects.filter((row) => row.status === 1 && row.name)) {
    const row = await queryOne(
      client,
      'SELECT id FROM public.schedule_subjects WHERE active = true AND lower(name) = lower($1) LIMIT 1',
      [subject.name],
    );
    if (row) {
      map.set(subject.oldId, row.id);
    }
  }
  return map;
}

async function buildTeacherMap(client, teachers) {
  const map = new Map();
  for (const teacher of teachers.filter((row) => row.status === 1 && row.firstName && row.lastName)) {
    const row = await queryOne(
      client,
      `
        SELECT id
        FROM public.schedule_teachers
        WHERE active = true
          AND lower("firstName") = lower($1)
          AND lower("lastName") = lower($2)
          AND lower(coalesce(title, '')) = lower(coalesce($3, ''))
        LIMIT 1
      `,
      [teacher.firstName, teacher.lastName, teacher.title],
    );
    if (row) {
      map.set(teacher.oldId, row.id);
    }
  }
  return map;
}

async function buildClassTypeMap(client, classTypes) {
  const map = new Map();
  for (const classType of classTypes.filter((row) => row.status === 1 && row.name)) {
    const row = await queryOne(
      client,
      'SELECT id FROM public.schedule_class_types WHERE active = true AND lower(name) = lower($1) LIMIT 1',
      [classType.name],
    );
    if (row) {
      map.set(classType.oldId, row.id);
    }
  }
  return map;
}

async function buildNoteMap(client, notes) {
  const map = new Map([[0, null]]);
  for (const note of notes.filter((row) => row.status === 1)) {
    if (!note.name || note.name.length < 2) {
      map.set(note.oldId, null);
      continue;
    }

    const row = await queryOne(
      client,
      'SELECT id FROM public.schedule_notes WHERE active = true AND lower(text) = lower($1) LIMIT 1',
      [note.name],
    );
    if (row) {
      map.set(note.oldId, row.id);
    }
  }
  return map;
}

async function buildLocationMap(client, locations) {
  const map = new Map();
  const activeBuildings = locations.filter(
    (row) => row.status === 1 && row.parentOldId === 0 && row.name,
  );
  const activeRooms = locations.filter(
    (row) => row.status === 1 && row.parentOldId !== 0 && row.name,
  );
  const buildingUuidByOldId = new Map();

  for (const building of activeBuildings) {
    const row = await queryOne(
      client,
      `
        SELECT id
        FROM public.schedule_locations
        WHERE active = true
          AND type::text = 'BUILDING'
          AND "parentId" IS NULL
          AND lower(name) = lower($1)
        LIMIT 1
      `,
      [building.name],
    );
    if (row) {
      buildingUuidByOldId.set(building.oldId, row.id);
      map.set(building.oldId, row.id);
    }
  }

  for (const room of activeRooms) {
    const parentId = buildingUuidByOldId.get(room.parentOldId);
    if (!parentId) {
      continue;
    }

    const row = await queryOne(
      client,
      `
        SELECT id
        FROM public.schedule_locations
        WHERE active = true
          AND type::text = 'ROOM'
          AND "parentId" = $2
          AND lower(name) = lower($1)
        LIMIT 1
      `,
      [room.name, parentId],
    );
    if (row) {
      map.set(room.oldId, row.id);
    }
  }

  return map;
}

async function buildGroupMap(client, groups) {
  const map = new Map();
  const rowsByOldId = new Map(groups.map((row) => [row.oldId, row]));
  const activeRows = groups
    .filter((row) => row.status === 1 && row.name)
    .map((row) => ({ ...row, level: resolveLevel(row, rowsByOldId) }))
    .filter((row) => row.level !== null);

  for (const level of ['COURSE', 'SPECIALIZATION', 'GROUP']) {
    for (const group of activeRows.filter((row) => row.level === level)) {
      const parentId = group.parentOldId === 0 ? null : map.get(group.parentOldId);
      if (group.parentOldId !== 0 && !parentId) {
        continue;
      }

      const row = await queryOne(
        client,
        `
          SELECT id
          FROM public.schedule_academic_groups
          WHERE active = true
            AND level::text = $2
            AND lower(name) = lower($1)
            AND (
              ($3::uuid IS NULL AND "parentId" IS NULL)
              OR "parentId" = $3::uuid
            )
          LIMIT 1
        `,
        [group.name, group.level, parentId],
      );
      if (row) {
        map.set(group.oldId, row.id);
      }
    }
  }

  return map;
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  );

  return result.rows[0].exists;
}

async function ensureScheduleLessonsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_lessons (
      id uuid PRIMARY KEY,
      date date NOT NULL,
      "startHour" integer NOT NULL,
      "startMinute" integer NOT NULL,
      "lessonHours" integer NOT NULL,
      "teacherId" uuid NOT NULL,
      "subjectId" uuid NOT NULL,
      "roomId" uuid NOT NULL,
      "groupId" uuid NOT NULL,
      "classTypeId" uuid NOT NULL,
      "noteId" uuid,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.legacy_plan_zajec_imports (
      legacy_id_pz integer PRIMARY KEY,
      lesson_id uuid NOT NULL UNIQUE,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function upsertLesson(client, hasTimestamps, lesson) {
  const existing = await queryOne(
    client,
    'SELECT lesson_id FROM public.legacy_plan_zajec_imports WHERE legacy_id_pz = $1',
    [lesson.oldId],
  );

  const lessonId = existing?.lesson_id ?? crypto.randomUUID();
  const timestampUpdate = hasTimestamps ? ', "updatedAt" = now()' : '';

  if (existing) {
    await client.query(
      `
        UPDATE public.schedule_lessons
        SET date = $1,
            "startHour" = $2,
            "startMinute" = $3,
            "lessonHours" = $4,
            "teacherId" = $5,
            "subjectId" = $6,
            "roomId" = $7,
            "groupId" = $8,
            "classTypeId" = $9,
            "noteId" = $10
            ${timestampUpdate}
        WHERE id = $11
      `,
      [
        lesson.date,
        lesson.startHour,
        lesson.startMinute,
        lesson.lessonHours,
        lesson.teacherId,
        lesson.subjectId,
        lesson.roomId,
        lesson.groupId,
        lesson.classTypeId,
        lesson.noteId,
        lessonId,
      ],
    );
    await client.query(
      'UPDATE public.legacy_plan_zajec_imports SET "updatedAt" = now() WHERE legacy_id_pz = $1',
      [lesson.oldId],
    );
    return 'updated';
  }

  if (hasTimestamps) {
    await client.query(
      `
        INSERT INTO public.schedule_lessons
          (id, date, "startHour", "startMinute", "lessonHours", "teacherId", "subjectId", "roomId", "groupId", "classTypeId", "noteId", "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
      `,
      [
        lessonId,
        lesson.date,
        lesson.startHour,
        lesson.startMinute,
        lesson.lessonHours,
        lesson.teacherId,
        lesson.subjectId,
        lesson.roomId,
        lesson.groupId,
        lesson.classTypeId,
        lesson.noteId,
      ],
    );
  } else {
    await client.query(
      `
        INSERT INTO public.schedule_lessons
          (id, date, "startHour", "startMinute", "lessonHours", "teacherId", "subjectId", "roomId", "groupId", "classTypeId", "noteId")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        lessonId,
        lesson.date,
        lesson.startHour,
        lesson.startMinute,
        lesson.lessonHours,
        lesson.teacherId,
        lesson.subjectId,
        lesson.roomId,
        lesson.groupId,
        lesson.classTypeId,
        lesson.noteId,
      ],
    );
  }
  await client.query(
    `
      INSERT INTO public.legacy_plan_zajec_imports (legacy_id_pz, lesson_id, "createdAt", "updatedAt")
      VALUES ($1, $2, now(), now())
    `,
    [lesson.oldId, lessonId],
  );

  return 'inserted';
}

function missingKeyFor(plan, maps, times) {
  if (!times.hours.has(plan.hourOldId)) return 'hour';
  if (!times.minutes.has(plan.minuteOldId)) return 'minute';
  if (!times.lessonHours.has(plan.lessonHoursOldId)) return 'lessonHours';
  if (!maps.teachers.has(plan.teacherOldId)) return 'teacher';
  if (!maps.subjects.has(plan.subjectOldId)) return 'subject';
  if (!maps.rooms.has(plan.roomOldId)) return 'room';
  if (!maps.groups.has(plan.groupOldId)) return 'group';
  if (!maps.classTypes.has(plan.classTypeOldId)) return 'classType';
  if (plan.noteOldId && !maps.notes.has(plan.noteOldId)) return 'note';
  return null;
}

async function importPlan(sql) {
  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: targetDatabase,
  });

  await client.connect();

  try {
    const planRows = parsePlan(sql);
    const times = parseTimes(sql);
    await ensureScheduleLessonsTable(client);
    const hasTimestamps =
      (await columnExists(client, 'schedule_lessons', 'createdAt')) &&
      (await columnExists(client, 'schedule_lessons', 'updatedAt'));

    const subjects = await buildSubjectMap(
      client,
      parseSimpleIdNameStatus(sql, 'przedmiot', 0, 1, 2),
    );
    const teachers = await buildTeacherMap(client, parseTeachers(sql));
    const rooms = await buildLocationMap(client, parseLocations(sql));
    const groups = await buildGroupMap(client, parseGroups(sql));
    const classTypes = await buildClassTypeMap(
      client,
      parseSimpleIdNameStatus(sql, 'forma_zajec', 0, 1, 2),
    );
    const notes = await buildNoteMap(client, parseSimpleIdNameStatus(sql, 'uwagi', 0, 1, 2));

    const maps = { subjects, teachers, rooms, groups, classTypes, notes };
    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_lessons');
    const missing = {
      hour: 0,
      minute: 0,
      lessonHours: 0,
      teacher: 0,
      subject: 0,
      room: 0,
      group: 0,
      classType: 0,
      note: 0,
    };
    let inserted = 0;
    let updated = 0;

    await client.query('BEGIN');
    for (const plan of planRows) {
      const missingKey = missingKeyFor(plan, maps, times);
      if (missingKey) {
        missing[missingKey] += 1;
        continue;
      }

      const operation = await upsertLesson(client, hasTimestamps, {
        oldId: plan.oldId,
        date: plan.date,
        startHour: times.hours.get(plan.hourOldId),
        startMinute: times.minutes.get(plan.minuteOldId),
        lessonHours: times.lessonHours.get(plan.lessonHoursOldId),
        teacherId: maps.teachers.get(plan.teacherOldId),
        subjectId: maps.subjects.get(plan.subjectOldId),
        roomId: maps.rooms.get(plan.roomOldId),
        groupId: maps.groups.get(plan.groupOldId),
        classTypeId: maps.classTypes.get(plan.classTypeOldId),
        noteId: plan.noteOldId ? maps.notes.get(plan.noteOldId) ?? null : null,
      });

      if (operation === 'inserted') {
        inserted += 1;
      } else {
        updated += 1;
      }
    }
    await client.query('COMMIT');

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_lessons');

    return {
      total: planRows.length,
      before: before.rows[0].count,
      inserted,
      updated,
      skipped: Object.values(missing).reduce((sum, value) => sum + value, 0),
      missing,
      after: after.rows[0].count,
      maps: {
        subjects: subjects.size,
        teachers: teachers.size,
        rooms: rooms.size,
        groups: groups.size,
        classTypes: classTypes.size,
        notes: notes.size,
      },
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const result = await importPlan(sql);

  console.log(
    `Zaimportowano plan_zajec do public.schedule_lessons w bazie ${targetDatabase}. ` +
      `W dumpie: ${result.total}, przed: ${result.before}, dodano: ${result.inserted}, ` +
      `zaktualizowano: ${result.updated}, pominieto: ${result.skipped}, po: ${result.after}.`,
  );
  console.log(
    `Mapowania slownikow: przedmioty=${result.maps.subjects}, wykladowcy=${result.maps.teachers}, ` +
      `sale=${result.maps.rooms}, grupy=${result.maps.groups}, formy=${result.maps.classTypes}, uwagi=${result.maps.notes}.`,
  );
  console.log(
    `Pominieto z powodu braku: godzina=${result.missing.hour}, minuta=${result.missing.minute}, ` +
      `licznik=${result.missing.lessonHours}, wykladowca=${result.missing.teacher}, ` +
      `przedmiot=${result.missing.subject}, sala=${result.missing.room}, grupa=${result.missing.group}, ` +
      `forma=${result.missing.classType}, uwaga=${result.missing.note}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
