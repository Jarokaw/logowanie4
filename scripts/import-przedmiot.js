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
    id_p: Number(row[0]),
    p_nazwa: row[1],
    status: Number(row[2]),
  }));
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.przedmiot (
        id_p integer PRIMARY KEY,
        p_nazwa varchar(120) NOT NULL UNIQUE,
        status smallint NOT NULL DEFAULT 1
      )
    `);
    await client.query('CREATE SEQUENCE IF NOT EXISTS public.przedmiot_id_p_seq');
    await client.query(`
      ALTER TABLE public.przedmiot
      ALTER COLUMN id_p SET DEFAULT nextval('public.przedmiot_id_p_seq')
    `);
    await client.query(`
      ALTER SEQUENCE public.przedmiot_id_p_seq
      OWNED BY public.przedmiot.id_p
    `);

    const before = await client.query('SELECT count(*)::int AS count FROM public.przedmiot');
    let imported = 0;

    for (const row of rows) {
      await client.query(
        `
          INSERT INTO public.przedmiot (id_p, p_nazwa, status)
          VALUES ($1, $2, $3)
          ON CONFLICT (id_p) DO UPDATE
          SET p_nazwa = EXCLUDED.p_nazwa,
              status = EXCLUDED.status
        `,
        [row.id_p, row.p_nazwa, row.status],
      );
      imported += 1;
    }

    await client.query(`
      SELECT setval(
        'public.przedmiot_id_p_seq',
        COALESCE((SELECT max(id_p) FROM public.przedmiot), 1),
        true
      )
    `);

    const after = await client.query('SELECT count(*)::int AS count FROM public.przedmiot');
    await client.query('COMMIT');

    return {
      before: before.rows[0].count,
      imported,
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

  if (rows.length === 0) {
    throw new Error('Tabela `przedmiot` w dumpie nie zawiera rekordow.');
  }

  const result = await importRows(rows);
  console.log(
    `Zaimportowano tabele przedmiot do bazy ${targetDatabase}. ` +
      `Przed: ${result.before}, przetworzono: ${result.imported}, po: ${result.after}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
