-- Allow Start-to-Start (SS) alongside Finish-to-Start and Finish-to-Finish.
--
-- Propagation is identical to the other two — moving the predecessor shifts the
-- successor by the same number of days. What the type selects is which edge the
-- link is anchored to, and therefore how the arrow is drawn:
--
--   FS  predecessor finish -> successor start
--   FF  predecessor finish -> successor finish
--   SS  predecessor start  -> successor start

alter table item_dependencies
  drop constraint if exists item_dependencies_type_check;

alter table item_dependencies
  add constraint item_dependencies_type_check check (type in ('FS', 'FF', 'SS'));

comment on column item_dependencies.type is
  'FS = predecessor finish -> successor start. FF = finish -> finish. SS = start -> start. All three shift the successor by the same delta; they differ in how the arrow is anchored.';
