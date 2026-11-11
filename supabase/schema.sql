create extension if not exists pgcrypto with schema extensions;

create type public.profile_role as enum ('user', 'admin');
create type public.pool_visibility as enum ('public', 'private');
create type public.match_status as enum ('upcoming', 'finished');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  role public.profile_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 48),
  description text not null default '' check (char_length(description) <= 240),
  emoji text not null default '⚽',
  image_url text,
  visibility public.pool_visibility not null default 'public',
  invite_code text not null unique,
  created_by uuid not null references public.profiles (id) on delete restrict,
  points_exact integer not null default 10 check (points_exact between 0 and 100),
  points_outcome integer not null default 5 check (points_outcome between 0 and 100),
  points_goal integer not null default 2 check (points_goal between 0 and 100),
  show_picks boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pool_members (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null check (char_length(home_team) between 1 and 48),
  away_team text not null check (char_length(away_team) between 1 and 48),
  home_emoji text not null default '⚽',
  away_emoji text not null default '⚽',
  home_logo_url text,
  away_logo_url text,
  starts_at timestamptz not null,
  status public.match_status not null default 'upcoming',
  home_score integer check (home_score between 0 and 99),
  away_score integer check (away_score between 0 and 99),
  competition text check (char_length(competition) <= 60),
  created_at timestamptz not null default now(),
  unique (home_team, away_team, starts_at),
  check ((status = 'finished' and home_score is not null and away_score is not null)
      or (status = 'upcoming' and home_score is null and away_score is null))
);

create table public.pool_matches (
  pool_id uuid not null references public.pools (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pool_id, match_id)
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null,
  match_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  home_score integer not null check (home_score between 0 and 99),
  away_score integer not null check (away_score between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, match_id, user_id),
  foreign key (pool_id, match_id) references public.pool_matches (pool_id, match_id) on delete cascade
);

create index pools_visibility_created_idx on public.pools (visibility, created_at desc);
create index pool_members_user_idx on public.pool_members (user_id);
create index pool_matches_match_idx on public.pool_matches (match_id);
create index matches_start_idx on public.matches (starts_at);
create index predictions_user_pool_idx on public.predictions (user_id, pool_id);
create index predictions_pool_match_idx on public.predictions (pool_id, match_id);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_pool_owner(target_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = target_pool and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create or replace function public.is_pool_member(target_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = target_pool and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Jogador');
  if char_length(requested_name) < 2 then
    requested_name := 'Jogador';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 60));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and not public.is_platform_admin()
     and (select auth.uid()) is not null then
    raise exception 'Only a platform administrator can change profile roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();

create or replace function public.attach_new_match_to_pools()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pool_matches (pool_id, match_id)
  select id, new.id from public.pools
  on conflict do nothing;
  return new;
end;
$$;

create trigger matches_attach_to_pools
  after insert on public.matches
  for each row execute function public.attach_new_match_to_pools();

create or replace function public.create_pool(
  p_name text,
  p_description text default '',
  p_emoji text default '⚽',
  p_visibility public.pool_visibility default 'public',
  p_points_exact integer default 10,
  p_points_outcome integer default 5,
  p_points_goal integer default 2,
  p_show_picks boolean default true,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_pool_id uuid;
  new_invite_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_points_exact not between 0 and 100
     or p_points_outcome not between 0 and 100
     or p_points_goal not between 0 and 100 then
    raise exception 'Point values must be between 0 and 100';
  end if;

  loop
    new_invite_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (select 1 from public.pools where invite_code = new_invite_code);
  end loop;

  insert into public.pools (
    name, description, emoji, image_url, visibility, invite_code, created_by,
    points_exact, points_outcome, points_goal, show_picks
  )
  values (
    trim(p_name), coalesce(p_description, ''), coalesce(p_emoji, '⚽'), p_image_url,
    coalesce(p_visibility, 'public'), new_invite_code, (select auth.uid()),
    p_points_exact, p_points_outcome, p_points_goal, coalesce(p_show_picks, true)
  )
  returning id into new_pool_id;

  insert into public.pool_members (pool_id, user_id, role)
  values (new_pool_id, (select auth.uid()), 'owner');

  insert into public.pool_matches (pool_id, match_id)
  select new_pool_id, id from public.matches
  where status = 'upcoming' and starts_at > now();

  return new_pool_id;
end;
$$;

create or replace function public.join_pool_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pool uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select id into target_pool from public.pools
  where invite_code = upper(trim(p_code));
  if target_pool is null then
    raise exception 'Invite code not found';
  end if;

  insert into public.pool_members (pool_id, user_id, role)
  values (target_pool, (select auth.uid()), 'member')
  on conflict (pool_id, user_id) do nothing;
  return target_pool;
end;
$$;

create or replace function public.join_public_pool(p_pool_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.pools
    where id = p_pool_id and visibility = 'public'
  ) then
    raise exception 'Public pool not found';
  end if;

  insert into public.pool_members (pool_id, user_id, role)
  values (p_pool_id, (select auth.uid()), 'member')
  on conflict (pool_id, user_id) do nothing;
  return p_pool_id;
end;
$$;

create or replace function public.save_prediction(
  p_pool_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  prediction_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p_home_score not between 0 and 99 or p_away_score not between 0 and 99 then
    raise exception 'Scores must be between 0 and 99';
  end if;
  if not public.is_pool_member(p_pool_id) then
    raise exception 'You are not a member of this pool';
  end if;
  if not exists (
    select 1 from public.pool_matches pm
    join public.matches m on m.id = pm.match_id
    where pm.pool_id = p_pool_id and pm.match_id = p_match_id
      and m.status = 'upcoming' and m.starts_at > now()
  ) then
    raise exception 'Predictions are closed for this match';
  end if;

  insert into public.predictions (pool_id, match_id, user_id, home_score, away_score)
  values (p_pool_id, p_match_id, (select auth.uid()), p_home_score, p_away_score)
  on conflict (pool_id, match_id, user_id) do update
  set home_score = excluded.home_score,
      away_score = excluded.away_score,
      updated_at = now()
  returning id into prediction_id;

  return prediction_id;
end;
$$;

create or replace function public.admin_set_profile_role(p_user_id uuid, p_role public.profile_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator permission required';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role';
  end if;
  if p_role = 'user' and exists (
    select 1 from public.profiles where id = p_user_id and role = 'admin'
  ) and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last platform administrator cannot be demoted';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.matches enable row level security;
alter table public.pool_matches enable row level security;
alter table public.predictions enable row level security;

create policy "Authenticated users can view profiles"
  on public.profiles for select to authenticated using (true);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users view public or joined pools"
  on public.pools for select to authenticated
  using (visibility = 'public' or public.is_pool_member(id) or public.is_platform_admin());
create policy "Authenticated users create pools through RPC"
  on public.pools for insert to authenticated with check (false);
create policy "Pool owners update their settings"
  on public.pools for update to authenticated
  using (public.is_pool_owner(id) or public.is_platform_admin())
  with check (public.is_pool_owner(id) or public.is_platform_admin());
create policy "Platform admins delete pools"
  on public.pools for delete to authenticated
  using (public.is_platform_admin());

create policy "Members view their pool participants"
  on public.pool_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_pool_member(pool_id)
    or exists (select 1 from public.pools p where p.id = pool_id and p.visibility = 'public')
    or public.is_platform_admin()
  );
create policy "Users join public pools"
  on public.pool_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'member'
    and exists (select 1 from public.pools p where p.id = pool_id and p.visibility = 'public')
  );
create policy "Platform admins manage pool members"
  on public.pool_members for delete to authenticated
  using (public.is_platform_admin());

create policy "Authenticated users view matches"
  on public.matches for select to authenticated using (true);
create policy "Admins create matches"
  on public.matches for insert to authenticated
  with check (public.is_platform_admin());
create policy "Admins update matches and results"
  on public.matches for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "Admins delete matches"
  on public.matches for delete to authenticated
  using (public.is_platform_admin());

create policy "Members view pool matches"
  on public.pool_matches for select to authenticated
  using (
    public.is_pool_member(pool_id)
    or public.is_platform_admin()
    or exists (select 1 from public.pools p where p.id = pool_id and p.visibility = 'public')
  );
create policy "Owners add pool matches"
  on public.pool_matches for insert to authenticated
  with check (public.is_pool_owner(pool_id) or public.is_platform_admin());
create policy "Owners remove pool matches"
  on public.pool_matches for delete to authenticated
  using (public.is_pool_owner(pool_id) or public.is_platform_admin());

create policy "Members view allowed predictions"
  on public.predictions for select to authenticated
  using (
    public.is_pool_member(pool_id)
    and (
      user_id = (select auth.uid())
      or (
        exists (select 1 from public.pools p where p.id = pool_id and p.show_picks)
        and exists (select 1 from public.matches m where m.id = match_id and m.starts_at <= now())
      )
    )
  );
create policy "Users modify predictions before kickoff"
  on public.predictions for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_pool_member(pool_id)
    and exists (select 1 from public.matches m where m.id = match_id and m.status = 'upcoming' and m.starts_at > now())
  )
  with check (user_id = (select auth.uid()) and public.is_pool_member(pool_id));

revoke all on function public.create_pool(text, text, text, public.pool_visibility, integer, integer, integer, boolean, text) from public;
revoke all on function public.join_pool_by_code(text) from public;
revoke all on function public.join_public_pool(uuid) from public;
revoke all on function public.save_prediction(uuid, uuid, integer, integer) from public;
revoke all on function public.admin_set_profile_role(uuid, public.profile_role) from public;
grant execute on function public.create_pool(text, text, text, public.pool_visibility, integer, integer, integer, boolean, text) to authenticated;
grant execute on function public.join_pool_by_code(text) to authenticated;
grant execute on function public.join_public_pool(uuid) to authenticated;
grant execute on function public.save_prediction(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.admin_set_profile_role(uuid, public.profile_role) to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update, delete on public.pools to authenticated;
grant select, insert, delete on public.pool_members to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, delete on public.pool_matches to authenticated;
grant select, update on public.predictions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp']),
  ('team-logos', 'team-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('pool-covers', 'pool-covers', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view Vesti images"
  on storage.objects for select to public
  using (bucket_id in ('avatars', 'team-logos', 'pool-covers'));
create policy "Users upload their own avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users update their own avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users upload their own pool covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pool-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Admins upload team logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'team-logos' and public.is_platform_admin());
create policy "Admins update team logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'team-logos' and public.is_platform_admin())
  with check (bucket_id = 'team-logos' and public.is_platform_admin());

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['profiles', 'pools', 'pool_members', 'matches', 'pool_matches', 'predictions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
