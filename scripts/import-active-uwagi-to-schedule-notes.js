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
  const insertStart = sql.indexOf('INSERT INTO `uwagi`');
  if (insertStart === -1) {
    throw new Error('Nie znaleziono INSERT INTO `uwagi` w pliku SQL.');
  }

  const valuesStart = sql.indexOf('VALUES', insertStart);
  if (valuesStart === -1) {
    throw new Error('Nie znaleziono sekcji VALUES dla tabeli `uwagi`.');
  }

  const statementEnd = sql.indexOf(';\n', valuesStart);
  if (statementEnd === -1) {
    throw new Error('Nie znaleziono konca instrukcji INSERT dla tabeli `uwagi`.');
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
    text: row[1] === null ? '' : row[1].trim(),
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
          AND table_name = 'schedule_notes'
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
          AND table_name = 'schedule_notes'
          AND column_name = $1
      ) AS exists
    `,
    [columnName],
  );

  return result.rows[0].exists;
}

async function ensureScheduleNotesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_notes (
      id uuid PRIMARY KEY,
      text varchar(200) NOT NULL,
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
    await ensureScheduleNotesTable(client);

    const hasCreatedAt = await columnExists(client, 'createdAt');
    const hasUpdatedAt = await columnExists(client, 'updatedAt');
    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_notes');
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const existing = await client.query(
        'SELECT id FROM public.schedule_notes WHERE lower(text) = lower($1) LIMIT 1',
        [row.text],
      );

      if (existing.rowCount > 0) {
        if (hasUpdatedAt) {
          await client.query(
            'UPDATE public.schedule_notes SET text = $1, active = true, "updatedAt" = now() WHERE id = $2',
            [row.text, existing.rows[0].id],
          );
        } else {
          await client.query(
            'UPDATE public.schedule_notes SET text = $1, active = true WHERE id = $2',
            [row.text, existing.rows[0].id],
          );
        }
        updated += 1;
        continue;
      }

      if (hasCreatedAt && hasUpdatedAt) {
        await client.query(
          `
            INSERT INTO public.schedule_notes (id, text, active, "createdAt", "updatedAt")
            VALUES ($1, $2, true, now(), now())
          `,
          [crypto.randomUUID(), row.text],
        );
      } else {
        await client.query(
          'INSERT INTO public.schedule_notes (id, text, active) VALUES ($1, $2, true)',
          [crypto.randomUUID(), row.text],
        );
      }
      inserted += 1;
    }

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_notes');
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
  const rows = parseRows(extractInsertValues(sql));
  const activeRows = rows.filter((row) => row.status === 1 && row.text.length >= 2);
  const tooLongRows = activeRows.filter((row) => row.text.length > 200);

  if (activeRows.length === 0) {
    throw new Error('W dumpie nie znaleziono aktywnych, niepustych uwag.');
  }

  if (tooLongRows.length > 0) {
    throw new Error(
      `Nie mozna zaimportowac ${tooLongRows.length} uwag dluzszych niz 200 znakow. ` +
        `Pierwsze id_uwagi: ${tooLongRows.slice(0, 5).map((row) => row.oldId).join(', ')}.`,
    );
  }

  const result = await importRows(activeRows);
  console.log(
    `Zaimportowano aktywne uwagi do public.schedule_notes w bazie ${targetDatabase}. ` +
      `Tabela istniala: ${result.existedBefore ? 'tak' : 'nie'}, ` +
      `przed: ${result.before}, dodano: ${result.inserted}, ` +
      `zaktualizowano: ${result.updated}, po: ${result.after}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
