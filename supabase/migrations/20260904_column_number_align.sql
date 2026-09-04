-- Per-column horizontal alignment for Number columns. Previously hardcoded to
-- right-align in the client; now a real setting (Left / Center / Right),
-- defaulting to Center — the null/unset case is treated as Center by the
-- client, so existing columns pick up the new default without a backfill.
alter table public.columns
    add column if not exists number_align text check (number_align in ('left', 'center', 'right'));
