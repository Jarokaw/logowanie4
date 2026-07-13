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

function clientFor(database) {
  return new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database,
  });
}

async function databaseExists(database) {
  const client = clientFor('template1');
  await client.connect();
  try {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1',
      [database],
    );
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function academicYearDatabaseNames() {
  const client = clientFor(env.DB_NAME);
  await client.connect();
  try {
    const tableResult = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schedule_academic_years'
      ) AS exists
    `);

    if (!tableResult.rows[0].exists) {
      return [];
    }

    const result = await client.query(`
      SELECT name
      FROM public.schedule_academic_years
      WHERE active = true
      ORDER BY name
    `);

    return result.rows.map((row) => row.name);
  } finally {
    await client.end();
  }
}

async function ensureScheduleCourseTeachersTable(database) {
  const client = clientFor(database);
  await client.connect();
  try {
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
      CREATE INDEX IF NOT EXISTS schedule_course_teachers_course_idx
      ON public.schedule_course_teachers ("courseId")
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS schedule_course_teachers_teacher_idx
      ON public.schedule_course_teachers ("teacherId")
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS schedule_course_teachers_course_teacher_unique
      ON public.schedule_course_teachers ("courseId", "teacherId")
    `);
  } finally {
    await client.end();
  }
}

(async () => {
  const databases = new Set([env.DB_NAME, ...(await academicYearDatabaseNames())]);
  const synced = [];
  const missing = [];

  for (const database of databases) {
    if (!(await databaseExists(database))) {
      missing.push(database);
      continue;
    }

    await ensureScheduleCourseTeachersTable(database);
    synced.push(database);
  }

  console.log(`Zaktualizowane bazy: ${synced.join(', ') || 'brak'}`);
  if (missing.length) {
    console.log(`Pominiete nieistniejace bazy: ${missing.join(', ')}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
