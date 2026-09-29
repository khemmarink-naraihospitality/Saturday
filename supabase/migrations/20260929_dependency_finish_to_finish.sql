-- Allow Finish-to-Finish (FF) alongside Finish-to-Start (FS).
--
-- Same propagation as FS — moving the predecessor shifts the successor by the
-- same number of days — so nothing about the cascade changes. What differs is
-- what the link means, and therefore how it is drawn: an FS arrow runs from the
-- predecessor's finish into the successor's *start*, an FF arrow runs from
-- finish to *finish*.
--
-- The type column was created with room for this (its comment already named
-- SS/FF/SF), so only the check constraint has to widen. The inline CHECK in
-- 20260903_item_dependencies.sql got Postgres's default name for a column
-- check, item_dependencies_type_check.

alter table item_dependencies
  drop constraint if exists item_dependencies_type_check;

alter table item_dependencies
  add constraint item_dependencies_type_check check (type in ('FS', 'FF'));

comment on column item_dependencies.type is
  'FS = predecessor finish -> successor start. FF = predecessor finish -> successor finish. Both shift the successor by the same delta; they differ in how the arrow is anchored.';

comment on table item_dependencies is
  'Dependencies between items on the same board. Moving a predecessor shifts its successors by the same delta, cascading downstream.';
