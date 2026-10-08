// Creates the app's tables in Postgres (Neon). Safe to run repeatedly.
// Skipped when DATABASE_URL is not set (demo / first deploy without a database).
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping");
  process.exit(0);
}

const sql = neon(url);
await sql`create table if not exists triage (
  task_key text primary key,
  decision text not null check (decision in ('do','later','skip')),
  week text not null,
  decided_at bigint not null,
  title text not null default ''
)`;
await sql`create table if not exists settings (
  id int primary key default 1 check (id = 1),
  review_dow int not null default 1,
  review_time text not null default '09:00',
  last_review_at bigint
)`;
await sql`insert into settings (id) values (1) on conflict do nothing`;
await sql`create table if not exists notes (
  id text primary key,
  image_url text not null,
  created_at bigint not null,
  memo text not null default ''
)`;
console.log("[migrate] ok");
