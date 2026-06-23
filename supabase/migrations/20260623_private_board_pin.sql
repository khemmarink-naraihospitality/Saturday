-- Private Board with PIN feature
-- See docs/superpowers/specs/2026-06-23-private-board-pin-design.md

alter table boards
  add column if not exists is_private boolean not null default false;

create table if not exists board_pins (
  board_id uuid primary key references boards(id) on delete cascade,
  pin_hash text not null,
  pin_salt text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists board_pin_reset_otps (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references boards(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_board_pin_reset_otps_board_id on board_pin_reset_otps(board_id);

-- Default-deny: only the board-pin Edge Function (service-role key) may
-- read/write these tables. No client (anon or authenticated) gets a policy.
alter table board_pins enable row level security;
alter table board_pin_reset_otps enable row level security;
