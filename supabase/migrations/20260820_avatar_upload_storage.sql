-- Lets users upload/change their own profile picture. Nothing in this
-- codebase has used Supabase Storage before now — this is the first bucket.
-- profiles.avatar_url is already the field every other user's avatar is
-- read from everywhere in the app (PersonPicker, PeopleCell, MembersList,
-- ActivityLogList, board_members joins, etc.), so making it uploadable and
-- publicly readable is all that's needed for "everyone in the system sees it".

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read: avatar URLs are embedded in <img> tags across the whole app,
-- viewed by every signed-in user, so the bucket itself is public and every
-- object in it is world-readable — there's no private data in a profile photo.
create policy "Avatar images are publicly accessible"
on storage.objects for select
using (bucket_id = 'avatars');

-- Write access is restricted to the user's own folder (objects are stored as
-- "{user_id}/filename.ext") so one user can't overwrite or delete another's photo.
create policy "Users can upload their own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own avatar"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
