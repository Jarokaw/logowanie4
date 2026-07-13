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
  const insertStart = sql.indexOf('INSERT INTO `budynki_i_sale`');
  if (insertStart === -1) {
    throw new Error('Nie znaleziono INSERT INTO `budynki_i_sale` w pliku SQL.');
  }

  const valuesStart = sql.indexOf('VALUES', insertStart);
  if (valuesStart === -1) {
    throw new Error('Nie znaleziono sekcji VALUES dla tabeli `budynki_i_sale`.');
  }

  const statementEnd = sql.indexOf(';\n', valuesStart);
  if (statementEnd === -1) {
    throw new Error('Nie znaleziono konca instrukcji INSERT dla tabeli `budynki_i_sale`.');
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
    name: (row[1] ?? '').trim(),
    parentOldId: Number(row[2]),
    status: Number(row[3]),
  }));
}

async function tableExists(client) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schedule_locations'
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
          AND table_name = 'schedule_locations'
          AND column_name = $1
      ) AS exists
    `,
    [columnName],
  );

  return result.rows[0].exists;
}

async function ensureScheduleLocationsTable(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'enum_schedule_locations_type'
      ) THEN
        CREATE TYPE public.enum_schedule_locations_type AS ENUM ('BUILDING', 'ROOM');
      END IF;
    END $$
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schedule_locations (
      id uuid PRIMARY KEY,
      name varchar(140) NOT NULL,
      type public.enum_schedule_locations_type NOT NULL,
      "parentId" uuid,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function findBuilding(client, name) {
  const result = await client.query(
    `
      SELECT id
      FROM public.schedule_locations
      WHERE type = 'BUILDING'
        AND "parentId" IS NULL
        AND lower(name) = lower($1)
      LIMIT 1
    `,
    [name],
  );

  return result.rows[0]?.id ?? null;
}

async function findRoom(client, name, parentId) {
  const result = await client.query(
    `
      SELECT id
      FROM public.schedule_locations
      WHERE type = 'ROOM'
        AND "parentId" = $2
        AND lower(name) = lower($1)
      LIMIT 1
    `,
    [name, parentId],
  );

  return result.rows[0]?.id ?? null;
}

async function upsertLocation(client, hasTimestamps, location) {
  const existingId =
    location.type === 'BUILDING'
      ? await findBuilding(client, location.name)
      : await findRoom(client, location.name, location.parentId);

  if (existingId) {
    if (hasTimestamps) {
      await client.query(
        `
          UPDATE public.schedule_locations
          SET name = $1,
              type = $2::public.enum_schedule_locations_type,
              "parentId" = $3,
              active = true,
              "updatedAt" = now()
          WHERE id = $4
        `,
        [location.name, location.type, location.parentId, existingId],
      );
    } else {
      await client.query(
        `
          UPDATE public.schedule_locations
          SET name = $1,
              type = $2::public.enum_schedule_locations_type,
              "parentId" = $3,
              active = true
          WHERE id = $4
        `,
        [location.name, location.type, location.parentId, existingId],
      );
    }

    return { id: existingId, inserted: false };
  }

  const id = crypto.randomUUID();
  if (hasTimestamps) {
    await client.query(
      `
        INSERT INTO public.schedule_locations
          (id, name, type, "parentId", active, "createdAt", "updatedAt")
        VALUES ($1, $2, $3::public.enum_schedule_locations_type, $4, true, now(), now())
      `,
      [id, location.name, location.type, location.parentId],
    );
  } else {
    await client.query(
      `
        INSERT INTO public.schedule_locations
          (id, name, type, "parentId", active)
        VALUES ($1, $2, $3::public.enum_schedule_locations_type, $4, true)
      `,
      [id, location.name, location.type, location.parentId],
    );
  }

  return { id, inserted: true };
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
    await ensureScheduleLocationsTable(client);

    const hasCreatedAt = await columnExists(client, 'createdAt');
    const hasUpdatedAt = await columnExists(client, 'updatedAt');
    const hasTimestamps = hasCreatedAt && hasUpdatedAt;
    const before = await client.query('SELECT count(*)::int AS count FROM public.schedule_locations');
    const activeRows = rows.filter((row) => row.status === 1 && row.name.length >= 1);
    const activeBuildings = activeRows.filter((row) => row.parentOldId === 0);
    const activeRooms = activeRows.filter((row) => row.parentOldId !== 0);
    const activeBuildingIds = new Set(activeBuildings.map((row) => row.oldId));
    const buildingUuidByOldId = new Map();
    let insertedBuildings = 0;
    let updatedBuildings = 0;
    let insertedRooms = 0;
    let updatedRooms = 0;
    let skippedRooms = 0;

    for (const building of activeBuildings) {
      const result = await upsertLocation(client, hasTimestamps, {
        name: building.name,
        type: 'BUILDING',
        parentId: null,
      });
      buildingUuidByOldId.set(building.oldId, result.id);
      if (result.inserted) {
        insertedBuildings += 1;
      } else {
        updatedBuildings += 1;
      }
    }

    for (const room of activeRooms) {
      if (!activeBuildingIds.has(room.parentOldId)) {
        skippedRooms += 1;
        continue;
      }

      const parentId = buildingUuidByOldId.get(room.parentOldId);
      if (!parentId) {
        skippedRooms += 1;
        continue;
      }

      const result = await upsertLocation(client, hasTimestamps, {
        name: room.name,
        type: 'ROOM',
        parentId,
      });
      if (result.inserted) {
        insertedRooms += 1;
      } else {
        updatedRooms += 1;
      }
    }

    const after = await client.query('SELECT count(*)::int AS count FROM public.schedule_locations');
    await client.query('COMMIT');

    return {
      existedBefore,
      before: before.rows[0].count,
      activeBuildings: activeBuildings.length,
      activeRooms: activeRooms.length,
      insertedBuildings,
      updatedBuildings,
      insertedRooms,
      updatedRooms,
      skippedRooms,
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
    throw new Error('Tabela `budynki_i_sale` w dumpie nie zawiera rekordow.');
  }

  const tooLongRows = rows.filter((row) => row.status === 1 && row.name.length > 140);
  if (tooLongRows.length > 0) {
    throw new Error(
      `Nie mozna zaimportowac ${tooLongRows.length} lokalizacji dluzszych niz 140 znakow. ` +
        `Pierwsze id_bs: ${tooLongRows.slice(0, 5).map((row) => row.oldId).join(', ')}.`,
    );
  }

  const result = await importRows(rows);
  console.log(
    `Zaimportowano aktywne budynki i sale do public.schedule_locations w bazie ${targetDatabase}. ` +
      `Tabela istniala: ${result.existedBefore ? 'tak' : 'nie'}, ` +
      `przed: ${result.before}, ` +
      `budynki aktywne: ${result.activeBuildings}, dodano: ${result.insertedBuildings}, zaktualizowano: ${result.updatedBuildings}, ` +
      `sale aktywne: ${result.activeRooms}, dodano: ${result.insertedRooms}, zaktualizowano: ${result.updatedRooms}, pominieto: ${result.skippedRooms}, ` +
      `po: ${result.after}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
