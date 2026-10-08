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
await sql`create table if not exists focus (
  id int primary key default 1 check (id = 1),
  task_key text not null,
  started_at bigint not null
)`;
await sql`create table if not exists parking (
  id text primary key,
  text text not null,
  created_at bigint not null
)`;
await sql`create table if not exists consult (
  task_key text primary key,
  title text not null default '',
  created_at bigint not null
)`;
await sql`create table if not exists done_log (
  task_key text primary key,
  title text not null default '',
  done_at bigint not null
)`;
await sql`create index if not exists done_log_done_at on done_log (done_at)`;
await sql`create table if not exists ai_requests (
  id text primary key,
  kind text not null check (kind in ('chat','dev','consult')),
  text text not null,
  task_key text,
  status text not null default 'pending' check (status in ('pending','doing','done','error')),
  reply text not null default '',
  actions jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
)`;
await sql`create index if not exists ai_requests_status on ai_requests (status, created_at)`;
console.log("[migrate] ok");
