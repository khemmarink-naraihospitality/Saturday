-- Soft-delete for groups, mirroring boards.is_archived (deleteBoard/restoreBoard
-- in boardSlice.ts). Previously deleteGroup issued a real DELETE with no way
-- back — this makes group deletion recoverable the same way board deletion
-- already is, via a per-board Archive/Trash view.

alter table public.groups
  add column if not exists is_archived boolean not null default false;

comment on column public.groups.is_archived is
  'Soft-delete flag. true = archived/trashed, recoverable via the board''s Archive/Trash view.';
