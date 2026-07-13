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

function parsePodzial(sql) {
  const byKierunek = new Map();
  for (const row of extractAllInsertValues(sql, 'podzial_stacj_niestacj').flatMap(parseValueRows)) {
    const kierunekId = Number(row[1]);
    const podzial = Number(row[2]);
    if (!kierunekId) {
      continue;
    }

    const values = byKierunek.get(kierunekId) ?? [];
    values.push(podzial);
    byKierunek.set(kierunekId, values);
  }

  return byKierunek;
}

function resolveStudyMode(kierunekOldId, podzialByKierunek) {
  const values = podzialByKierunek.get(kierunekOldId) ?? [];
  const mappedValues = values
    .map((value) => {
      if (value === 1) {
        return 'FULL_TIME';
      }
      if (value === 2) {
        return 'PART_TIME';
      }
      if (value === 3) {
        return 'POSTGRADUATE';
      }
      return null;
    })
    .filter(Boolean);

  const uniqueModes = [...new Set(mappedValues)];
  return uniqueModes.length === 1 ? uniqueModes[0] : 'UNASSIGNED';
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

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function valueExpression(parameterIndex, columnInfo) {
  if (columnInfo?.data_type === 'USER-DEFINED') {
    return `$${parameterIndex}::${quoteIdentifier(columnInfo.udt_schema)}.${quoteIdentifier(columnInfo.udt_name)}`;
  }

  return `$${parameterIndex}`;
}

async function tableExists(client) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schedule_academic_groups'
      ) AS exists
    `,
  );

  return result.rows[0].exists;
}

async function columnExists(client, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'schedule_academic_groups'
          AND column_name = $1
      ) AS exists
    `,
    [columnName],
  );

  return result.rows[0].exists;
}

async function columnInfo(client, columnName) {
  const result = await client.query(
    `
      SELECT data_type, udt_schema, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schedule_academic_groups'
        AND column_name = $1
      LIMIT 1
    `,
    [columnName],
  );

  return result.rows[0] ?? null;
}

async function ensureScheduleAcademicGroupsTable(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'enum_schedule_academic_groups_level'
      ) THEN
        CREATE TYPE public.enum_schedule_academic_groups_level AS ENUM ('COURSE', 'SPECIALIZATION', 'GROUP');
      END IF;
    END $$
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_academic_groups (
      id uuid PRIMARY KEY,
      name varchar(220) NOT NULL,
      level public.enum_schedule_academic_groups_level NOT NULL,
      "studyMode" varchar(30) NOT NULL DEFAULT 'UNASSIGNED',
      "parentId" uuid,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function findExistingGroup(client, group) {
  const result = await client.query(
    `
      SELECT id
      FROM public.schedule_academic_groups
      WHERE lower(name) = lower($1)
        AND level::text = $2
        AND (
          ($3::uuid IS NULL AND "parentId" IS NULL)
          OR "parentId" = $3::uuid
        )
      LIMIT 1
    `,
    [group.name, group.level, group.parentId],
  );

  return result.rows[0]?.id ?? null;
}

async function upsertGroup(client, options, group) {
  const existingId = await findExistingGroup(client, group);
  const levelValue = valueExpression(2, options.levelColumn);
  const studyModeValue = valueExpression(4, options.studyModeColumn);

  if (existingId) {
    const timestampSql = options.hasTimestamps ? ', "updatedAt" = now()' : '';
    await client.query(
      `
        UPDATE public.schedule_academic_groups
        SET name = $1,
            level = ${levelValue},
            "parentId" = $3,
            "studyMode" = ${studyModeValue},
            active = true
            ${timestampSql}
        WHERE id = $5
      `,
      [group.name, group.level, group.parentId, group.studyMode, existingId],
    );

    return { id: existingId, inserted: false };
  }

  const id = crypto.randomUUID();
  if (options.hasTimestamps) {
    await client.query(
      `
        INSERT INTO public.schedule_academic_groups
          (id, name, level, "parentId", "studyMode", active, "createdAt", "updatedAt")
        VALUES ($1, $2, ${valueExpression(3, options.levelColumn)}, $4, ${valueExpression(5, options.studyModeColumn)}, true, now(), now())
      `,
      [id, group.name, group.level, group.parentId, group.studyMode],
    );
  } else {
    await client.query(
      `
        INSERT INTO public.schedule_academic_groups
          (id, name, level, "parentId", "studyMode", active)
        VALUES ($1, $2, ${valueExpression(3, options.levelColumn)}, $4, ${valueExpression(5, options.studyModeColumn)}, true)
      `,
      [id, group.name, group.level, group.parentId, group.studyMode],
    );
  }

  return { id, inserted: true };
}

async function importRows(rows, podzialByKierunek) {
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
    const existedBefore = await tableExists(client);
    await ensureScheduleAcademicGroupsTable(client);

    const options = {
      hasTimestamps:
        (await columnExists(client, 'createdAt')) && (await columnExists(client, 'updatedAt')),
      levelColumn: await columnInfo(client, 'level'),
      studyModeColumn: await columnInfo(client, 'studyMode'),
    };

    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_academic_groups');
    const rowsByOldId = new Map(rows.map((row) => [row.oldId, row]));
    const activeRows = rows
      .filter((row) => row.status === 1 && row.name.length >= 1)
      .map((row) => ({ ...row, level: resolveLevel(row, rowsByOldId) }))
      .filter((row) => row.level !== null);
    const activeByLevel = {
      COURSE: activeRows.filter((row) => row.level === 'COURSE'),
      SPECIALIZATION: activeRows.filter((row) => row.level === 'SPECIALIZATION'),
      GROUP: activeRows.filter((row) => row.level === 'GROUP'),
    };

    const uuidByOldId = new Map();
    const stats = {
      inserted: { COURSE: 0, SPECIALIZATION: 0, GROUP: 0 },
      updated: { COURSE: 0, SPECIALIZATION: 0, GROUP: 0 },
      skippedMissingParent: 0,
      skippedUnsupportedLevel: rows.filter(
        (row) => row.status === 1 && row.name.length >= 1 && resolveLevel(row, rowsByOldId) === null,
      ).length,
    };
    const modeCounts = {
      UNASSIGNED: 0,
      FULL_TIME: 0,
      PART_TIME: 0,
      POSTGRADUATE: 0,
    };

    for (const level of ['COURSE', 'SPECIALIZATION', 'GROUP']) {
      for (const row of activeByLevel[level]) {
        const parentId = row.parentOldId === 0 ? null : uuidByOldId.get(row.parentOldId);
        if (row.parentOldId !== 0 && !parentId) {
          stats.skippedMissingParent += 1;
          continue;
        }

        const studyMode =
          level === 'COURSE'
            ? resolveStudyMode(row.oldId, podzialByKierunek)
            : 'UNASSIGNED';
        if (level === 'COURSE') {
          modeCounts[studyMode] += 1;
        }

        const result = await upsertGroup(client, options, {
          name: row.name,
          level,
          parentId,
          studyMode,
        });
        uuidByOldId.set(row.oldId, result.id);
        if (result.inserted) {
          stats.inserted[level] += 1;
        } else {
          stats.updated[level] += 1;
        }
      }
    }

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_academic_groups');
    await client.query('COMMIT');

    return {
      existedBefore,
      before: before.rows[0].count,
      active: {
        COURSE: activeByLevel.COURSE.length,
        SPECIALIZATION: activeByLevel.SPECIALIZATION.length,
        GROUP: activeByLevel.GROUP.length,
      },
      modeCounts,
      ...stats,
      after: after.rows[0].count,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const kierunki = parseKierunki(sql);
  const podzialByKierunek = parsePodzial(sql);

  if (kierunki.length === 0) {
    throw new Error('Tabela `kierunki` w dumpie nie zawiera rekordow.');
  }

  const tooLongRows = kierunki.filter((row) => row.status === 1 && row.name.length > 220);
  if (tooLongRows.length > 0) {
    throw new Error(
      `Nie mozna zaimportowac ${tooLongRows.length} kierunkow/grup dluzszych niz 220 znakow. ` +
        `Pierwsze id_k: ${tooLongRows.slice(0, 5).map((row) => row.oldId).join(', ')}.`,
    );
  }

  const result = await importRows(kierunki, podzialByKierunek);
  console.log(
    `Zaimportowano aktywne kierunki i grupy do public.schedule_academic_groups w bazie ${targetDatabase}. ` +
      `Tabela istniala: ${result.existedBefore ? 'tak' : 'nie'}, przed: ${result.before}, po: ${result.after}.`,
  );
  console.log(
    `Aktywne w dumpie: kierunki=${result.active.COURSE}, specjalnosci=${result.active.SPECIALIZATION}, grupy=${result.active.GROUP}.`,
  );
  console.log(
    `Dodano: kierunki=${result.inserted.COURSE}, specjalnosci=${result.inserted.SPECIALIZATION}, grupy=${result.inserted.GROUP}. ` +
      `Zaktualizowano: kierunki=${result.updated.COURSE}, specjalnosci=${result.updated.SPECIALIZATION}, grupy=${result.updated.GROUP}.`,
  );
  console.log(
    `Rodzaje kierunkow: stacjonarne=${result.modeCounts.FULL_TIME}, niestacjonarne=${result.modeCounts.PART_TIME}, ` +
      `podyplomowe=${result.modeCounts.POSTGRADUATE}, nieprzydzielone=${result.modeCounts.UNASSIGNED}.`,
  );
  console.log(
    `Pominieto: brak aktywnego rodzica=${result.skippedMissingParent}, nieobslugiwany poziom=${result.skippedUnsupportedLevel}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
