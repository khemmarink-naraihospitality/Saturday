-- Which colour palette each person uses ("saturday" or "narai", src/lib/palettes.ts).
--
-- Kept in the browser's localStorage this only lasted on one machine; on the
-- profile it follows the account to every browser and to the phone layout.
-- Everyone starts on 'saturday' (the original look). A user may already update
-- their own profile row, and guard_profile_privileged_columns only watches
-- role, approval, active and email, so no policy change is needed. The check
-- constraint is the list of palettes the client knows: a new palette adds its
-- id here and in palettes.ts together.

alter table public.profiles
    add column if not exists ui_theme text not null default 'saturday';

alter table public.profiles
    drop constraint if exists profiles_ui_theme_check;

alter table public.profiles
    add constraint profiles_ui_theme_check check (ui_theme in ('saturday', 'narai'));
