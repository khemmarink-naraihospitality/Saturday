-- Which rows a column belongs to: top-level items, sub-items, or both.
--
-- Until now a board had one set of columns that every row showed, sub-items
-- included, so a sub-item could never have columns of its own (Monday gives
-- them an independent set).
--
-- Values are already stored per column id inside items.values, for sub-items
-- exactly as for items, so no data moves — this only says where a column is
-- displayed.
--
-- Existing columns default to 'both' so every board looks exactly as it did:
-- sub-items keep the values they already show. Columns created from now on pick
-- a side ('item' from the main header, 'subitem' from the sub-item header).

alter table columns
  add column if not exists scope text not null default 'both';

alter table columns
  drop constraint if exists columns_scope_check;

alter table columns
  add constraint columns_scope_check check (scope in ('item', 'subitem', 'both'));

comment on column columns.scope is
  'item = shown on top-level items only; subitem = sub-items only; both = every row. Values live in items.values[column id] either way.';
