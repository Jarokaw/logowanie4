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

  const statementEnd = sql.indexOf(';\n', valuesStart);
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

function normalizeTitle(title) {
  const normalized = (title ?? '').trim();
  return normalized && normalized !== '-' ? normalized : null;
}

function parseTitles(sql) {
  const rows = parseValueRows(extractInsertValues(sql, 'tytul_naukowy'));
  return new Map(
    rows.map((row) => [
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

async function tableExists(client) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schedule_teachers'
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
          AND table_name = 'schedule_teachers'
          AND column_name = $1
      ) AS exists
    `,
    [columnName],
  );

  return result.rows[0].exists;
}

async function ensureScheduleTeachersTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_teachers (
      id uuid PRIMARY KEY,
      title varchar(40),
      "firstName" varchar(80) NOT NULL,
      "lastName" varchar(100) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function importRows(rows) {
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
    await ensureScheduleTeachersTable(client);

    const hasCreatedAt = await columnExists(client, 'createdAt');
    const hasUpdatedAt = await columnExists(client, 'updatedAt');
    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_teachers');
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const existing = await client.query(
        `
          SELECT id
          FROM public.schedule_teachers
          WHERE lower("firstName") = lower($1)
            AND lower("lastName") = lower($2)
            AND lower(coalesce(title, '')) = lower(coalesce($3, ''))
          LIMIT 1
        `,
        [row.firstName, row.lastName, row.title],
      );

      if (existing.rowCount > 0) {
        if (hasUpdatedAt) {
          await client.query(
            `
              UPDATE public.schedule_teachers
              SET title = $1,
                  "firstName" = $2,
                  "lastName" = $3,
                  active = true,
                  "updatedAt" = now()
              WHERE id = $4
            `,
            [row.title, row.firstName, row.lastName, existing.rows[0].id],
          );
        } else {
          await client.query(
            `
              UPDATE public.schedule_teachers
              SET title = $1,
                  "firstName" = $2,
                  "lastName" = $3,
                  active = true
              WHERE id = $4
            `,
            [row.title, row.firstName, row.lastName, existing.rows[0].id],
          );
        }
        updated += 1;
        continue;
      }

      if (hasCreatedAt && hasUpdatedAt) {
        await client.query(
          `
            INSERT INTO public.schedule_teachers
              (id, title, "firstName", "lastName", active, "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, true, now(), now())
          `,
          [crypto.randomUUID(), row.title, row.firstName, row.lastName],
        );
      } else {
        await client.query(
          `
            INSERT INTO public.schedule_teachers
              (id, title, "firstName", "lastName", active)
            VALUES ($1, $2, $3, $4, true)
          `,
          [crypto.randomUUID(), row.title, row.firstName, row.lastName],
        );
      }
      inserted += 1;
    }

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_teachers');
    await client.query('COMMIT');

    return {
      existedBefore,
      before: before.rows[0].count,
      inserted,
      updated,
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
  const titlesById = parseTitles(sql);
  const rows = parseTeachers(sql, titlesById);
  const activeRows = rows.filter(
    (row) => row.status === 1 && row.firstName.length >= 2 && row.lastName.length >= 2,
  );

  if (activeRows.length === 0) {
    throw new Error('W dumpie nie znaleziono aktywnych wykladowcow.');
  }

  const tooLongRows = activeRows.filter(
    (row) =>
      (row.title?.length ?? 0) > 40 ||
      row.firstName.length > 80 ||
      row.lastName.length > 100,
  );
  if (tooLongRows.length > 0) {
    throw new Error(
      `Nie mozna zaimportowac ${tooLongRows.length} wykladowcow z wartosciami dluzszymi niz limity tabeli. ` +
        `Pierwsze id_wykladowca: ${tooLongRows.slice(0, 5).map((row) => row.oldId).join(', ')}.`,
    );
  }

  const result = await importRows(activeRows);
  console.log(
    `Zaimportowano aktywnych wykladowcow do public.schedule_teachers w bazie ${targetDatabase}. ` +
      `Tabela istniala: ${result.existedBefore ? 'tak' : 'nie'}, ` +
      `przed: ${result.before}, dodano: ${result.inserted}, ` +
      `zaktualizowano: ${result.updated}, po: ${result.after}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
