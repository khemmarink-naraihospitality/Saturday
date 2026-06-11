-- Add number_format and currency_code to columns if they don't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'columns' and column_name = 'number_format') then
    alter table columns add column number_format text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'columns' and column_name = 'currency_code') then
    alter table columns add column currency_code text;
  end if;
end $$;
