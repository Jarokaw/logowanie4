const { Client } = require('pg');
require('dotenv').config();

const FULL_TIME = 'FULL_TIME';
const SHORTCUT_TABLES = [
  'schedule_lesson_time_shortcuts',
  'schedule_lesson_date_shortcuts',
];

function connectionConfig(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
  };
}

async function scheduleDatabaseNames() {
  const client = new Client(connectionConfig(process.env.DB_NAME));
  await client.connect();

  try {
    const result = await client.query(
      'SELECT "name" FROM "schedule_academic_years" ORDER BY "name"',
    );
    return [...new Set([process.env.DB_NAME, ...result.rows.map((row) => row.name)])];
  } finally {
    await client.end();
  }
}

async function migrateDatabase(database) {
  const client = new Client(connectionConfig(database));
  await client.connect();

  try {
    const tableResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [SHORTCUT_TABLES],
    );
    const tables = new Set(tableResult.rows.map((row) => row.table_name));

    for (const tableName of SHORTCUT_TABLES.filter((name) => tables.has(name))) {
      await client.query(
        `ALTER TABLE "${tableName}"
         ADD COLUMN IF NOT EXISTS "studyMode" VARCHAR(30) NOT NULL DEFAULT '${FULL_TIME}'`,
      );
      await client.query(
        `UPDATE "${tableName}"
         SET "studyMode" = '${FULL_TIME}'
         WHERE "studyMode" IS NULL
            OR "studyMode" NOT IN ('FULL_TIME', 'PART_TIME', 'POSTGRADUATE')`,
      );
      await client.query(
        `ALTER TABLE "${tableName}"
         ALTER COLUMN "studyMode" SET DEFAULT '${FULL_TIME}',
         ALTER COLUMN "studyMode" SET NOT NULL`,
      );
    }

    if (tables.has('schedule_lesson_time_shortcuts')) {
      await client.query('DROP INDEX IF EXISTS "schedule_lesson_time_shortcuts_unique_time"');
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_lesson_time_shortcuts_unique_time_mode"
         ON "schedule_lesson_time_shortcuts"
         ("startHour", "startMinute", "lessonHours", "studyMode")`,
      );
    }

    if (tables.has('schedule_lesson_date_shortcuts')) {
      await client.query('DROP INDEX IF EXISTS "schedule_lesson_date_shortcuts_unique_date_week"');
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "schedule_lesson_date_shortcuts_unique_date_week_mode"
         ON "schedule_lesson_date_shortcuts" ("date", "week", "studyMode")`,
      );
    }

    const counts = {};
    for (const tableName of SHORTCUT_TABLES.filter((name) => tables.has(name))) {
      const result = await client.query(
        `SELECT "studyMode", COUNT(*)::int AS "count"
         FROM "${tableName}"
         GROUP BY "studyMode"
         ORDER BY "studyMode"`,
      );
      counts[tableName] = result.rows;
    }
    console.log(`${database}: ${JSON.stringify(counts)}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const databases = await scheduleDatabaseNames();
  for (const database of databases) {
    await migrateDatabase(database);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
