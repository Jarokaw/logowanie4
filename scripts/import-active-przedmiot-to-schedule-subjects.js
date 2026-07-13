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

function extractInsertValues(sql) {
  const insertStart = sql.indexOf('INSERT INTO `przedmiot`');
  if (insertStart === -1) {
    throw new Error('Nie znaleziono INSERT INTO `przedmiot` w pliku SQL.');
  }

  const valuesStart = sql.indexOf('VALUES', insertStart);
  if (valuesStart === -1) {
    throw new Error('Nie znaleziono sekcji VALUES dla tabeli `przedmiot`.');
  }

  const statementEnd = sql.indexOf(';\n', valuesStart);
  if (statementEnd === -1) {
    throw new Error('Nie znaleziono konca instrukcji INSERT dla tabeli `przedmiot`.');
  }

  return sql.slice(valuesStart + 'VALUES'.length, statementEnd);
}

function parseRows(valuesSql) {
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

  return rows.map((row) => ({
    oldId: Number(row[0]),
    name: row[1],
    status: Number(row[2]),
  }));
}

async function tableExists(client) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schedule_subjects'
      ) AS exists
    `,
  );

  return result.rows[0].exists;
}

async function ensureScheduleSubjectsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_subjects (
      id uuid PRIMARY KEY,
      name varchar(160) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function columnExists(client, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'schedule_subjects'
          AND column_name = $1
      ) AS exists
    `,
    [columnName],
  );

  return result.rows[0].exists;
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
    await ensureScheduleSubjectsTable(client);

    const hasCreatedAt = await columnExists(client, 'createdAt');
    const hasUpdatedAt = await columnExists(client, 'updatedAt');
    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_subjects');
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const existing = await client.query(
        'SELECT id FROM public.schedule_subjects WHERE lower(name) = lower($1) LIMIT 1',
        [row.name],
      );

      if (existing.rowCount > 0) {
        if (hasUpdatedAt) {
          await client.query(
            'UPDATE public.schedule_subjects SET name = $1, active = true, "updatedAt" = now() WHERE id = $2',
            [row.name, existing.rows[0].id],
          );
        } else {
          await client.query(
            'UPDATE public.schedule_subjects SET name = $1, active = true WHERE id = $2',
            [row.name, existing.rows[0].id],
          );
        }
        updated += 1;
        continue;
      }

      if (hasCreatedAt && hasUpdatedAt) {
        await client.query(
          `
            INSERT INTO public.schedule_subjects (id, name, active, "createdAt", "updatedAt")
            VALUES ($1, $2, true, now(), now())
          `,
          [crypto.randomUUID(), row.name],
        );
      } else {
        await client.query(
          'INSERT INTO public.schedule_subjects (id, name, active) VALUES ($1, $2, true)',
          [crypto.randomUUID(), row.name],
        );
      }
      inserted += 1;
    }

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_subjects');
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
  const activeRows = parseRows(extractInsertValues(sql)).filter((row) => row.status === 1);

  if (activeRows.length === 0) {
    throw new Error('W dumpie nie znaleziono aktywnych przedmiotow ze statusem 1.');
  }

  const result = await importRows(activeRows);
  console.log(
    `Zaimportowano aktywne przedmioty do public.schedule_subjects w bazie ${targetDatabase}. ` +
      `Tabela istniala: ${result.existedBefore ? 'tak' : 'nie'}, ` +
      `przed: ${result.before}, dodano: ${result.inserted}, ` +
      `zaktualizowano: ${result.updated}, po: ${result.after}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
