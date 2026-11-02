-- Formula columns (src/lib/formula): a column of type 'formula' stores no values
-- of its own; each row's result is worked out in the browser from the row's
-- other columns. What to work out lives here: an expression ({"mode":"calc",
-- "expr":"{#<column id>} * {#<column id>}"}) or If / Then / Else rules
-- ({"mode":"rules","rules":[…],"otherwise":{…}}), with column ids rather than
-- titles so renaming a column doesn't break it. Null for every other type.
--
-- Nothing else changes: `type` has no check constraint, number_format /
-- currency_code / number_align already hold how a number result is shown, and
-- RLS on columns covers the new column as it covers the others.
alter table public.columns add column if not exists formula jsonb;

comment on column public.columns.formula is
    'Formula columns only: {"mode":"calc","expr":…} or {"mode":"rules","rules":[…],"otherwise":…}; columns referenced by id. See src/lib/formula.';
