create table if not exists public.devices (
  id text primary key check (char_length(id) between 1 and 100),
  trekker_id text unique references public.trekkers(id) on delete set null,
  pairing_code_hash text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_last_seen_idx
  on public.devices(last_seen_at desc);

drop trigger if exists devices_updated_at on public.devices;
create trigger devices_updated_at
before update on public.devices
for each row execute procedure public.update_updated_at_column();

alter table public.devices enable row level security;
revoke all on table public.devices from anon, authenticated;

comment on table public.devices is
  'Authority-managed ESP32 registry. Pairing codes are stored only as keyed hashes.';
