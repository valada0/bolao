-- Vesti: execute uma vez no SQL Editor do seu projeto Supabase.
-- Nenhuma chave de service_role deve ser colocada neste arquivo ou no frontend.

create type public.pool_visibility as enum ('public', 'private');
create type public.match_status as enum ('upcoming', 'finished');
create type public.app_role as enum ('user', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_path text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  emoji text not null default '⚽',
  shield_path text,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  competition text,
  starts_at timestamptz not null,
  status public.match_status not null default 'upcoming',
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_nonnegative_scores check (
    (home_score is null or home_score between 0 and 99)
    and (away_score is null or away_score between 0 and 99)
  ),
  constraint matches_finished_have_score check (
    (status = 'finished' and home_score is not null and away_score is not null)
    or (status = 'upcoming' and home_score is null and away_score is null)
  )
);

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 48),
  description text not null default '' check (char_length(description) <= 240),
  emoji text not null default '⚽',
  visibility public.pool_visibility not null default 'public',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  exact_points integer not null default 10 check (exact_points between 0 and 100),
  outcome_points integer not null default 5 check (outcome_points between 0 and 100),
  goals_points integer not null default 2 check (goals_points between 0 and 100),
  reveal_picks_after_kickoff boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pool_members (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create table public.pool_matches (
  pool_id uuid not null references public.pools(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  primary key (pool_id, match_id)
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null,
  match_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  home_score integer not null check (home_score between 0 and 99),
  away_score integer not null check (away_score between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predictions_member_match_fk
    foreign key (pool_id, match_id)
    references public.pool_matches(pool_id, match_id)
    on delete cascade,
  constraint predictions_once_per_user unique (pool_id, match_id, user_id)
);

create index pool_members_user_id_idx on public.pool_members(user_id);
create index pool_matches_match_id_idx on public.pool_matches(match_id);
create index predictions_user_id_idx on public.predictions(user_id);
create index matches_starts_at_idx on public.matches(starts_at);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger predictions_touch_updated_at
before update on public.predictions
for each row execute function public.touch_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  target_pool uuid;
begin
  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Jogador'
  );
  if char_length(requested_name) < 2 then requested_name := 'Jogador'; end if;
  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 60));
  if nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '') is not null then
    select id into target_pool from public.pools
    where invite_code = upper(trim(new.raw_user_meta_data ->> 'invite_code'));
    if target_pool is null then raise exception 'Invite code not found'; end if;
    insert into public.pool_members (pool_id, user_id) values (target_pool, new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin()
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

create function public.is_pool_member(target_pool uuid)
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

create function public.can_view_pool(target_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or public.is_pool_member(target_pool)
    or exists (
      select 1 from public.pools
      where id = target_pool and visibility = 'public'
    );
$$;

create function public.can_view_prediction(target_pool uuid, target_match uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.pools p
      join public.pool_members pm on pm.pool_id = p.id
      join public.matches m on m.id = target_match
      where p.id = target_pool
        and pm.user_id = (select auth.uid())
        and p.reveal_picks_after_kickoff
        and m.starts_at <= now()
    );
$$;

create function public.score_prediction(
  p_pool_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actual_home integer;
  actual_away integer;
  exact_points integer;
  outcome_points integer;
  goals_points integer;
  points integer := 0;
begin
  select m.home_score, m.away_score, p.exact_points, p.outcome_points, p.goals_points
  into actual_home, actual_away, exact_points, outcome_points, goals_points
  from public.matches m
  join public.pools p on p.id = p_pool_id
  where m.id = p_match_id and m.status = 'finished';

  if not found then return 0; end if;
  if p_home_score = actual_home and p_away_score = actual_away then
    return exact_points;
  end if;

  if sign(p_home_score - p_away_score) = sign(actual_home - actual_away) then
    points := points + outcome_points;
  end if;
  if p_home_score = actual_home then points := points + goals_points; end if;
  if p_away_score = actual_away then points := points + goals_points; end if;
  return points;
end;
$$;

create function public.create_pool(
  p_name text,
  p_description text,
  p_emoji text,
  p_visibility public.pool_visibility,
  p_exact_points integer,
  p_outcome_points integer,
  p_goals_points integer,
  p_reveal_picks_after_kickoff boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_pool_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_exact_points not between 0 and 100
    or p_outcome_points not between 0 and 100
    or p_goals_points not between 0 and 100 then
    raise exception 'Invalid scoring rules';
  end if;

  insert into public.pools (
    name, description, emoji, visibility, owner_id,
    exact_points, outcome_points, goals_points, reveal_picks_after_kickoff
  )
  values (
    trim(p_name), coalesce(p_description, ''), coalesce(p_emoji, '⚽'), p_visibility,
    (select auth.uid()), p_exact_points, p_outcome_points, p_goals_points,
    p_reveal_picks_after_kickoff
  )
  returning id into new_pool_id;

  insert into public.pool_members (pool_id, user_id)
  values (new_pool_id, (select auth.uid()));

  insert into public.pool_matches (pool_id, match_id)
  select new_pool_id, id from public.matches
  where starts_at >= now() - interval '30 days';

  return new_pool_id;
end;
$$;

create function public.join_pool_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pool uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into target_pool from public.pools
  where invite_code = upper(trim(p_invite_code));
  if target_pool is null then raise exception 'Invite code not found'; end if;
  insert into public.pool_members (pool_id, user_id)
  values (target_pool, (select auth.uid()))
  on conflict do nothing;
  return target_pool;
end;
$$;

create function public.join_public_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.pools where id = p_pool_id and visibility = 'public') then
    raise exception 'Public pool not found';
  end if;
  insert into public.pool_members (pool_id, user_id)
  select id, (select auth.uid()) from public.pools
  where id = p_pool_id and visibility = 'public'
  on conflict do nothing;
end;
$$;

create function public.set_profile_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'Cannot change your own role'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create function public.get_pool_standings()
returns table (
  pool_id uuid,
  user_id uuid,
  total_points bigint,
  predictions_count bigint,
  completed_count bigint,
  hits bigint,
  exact_hits bigint,
  accuracy integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pm.pool_id,
    pm.user_id,
    coalesce(sum(public.score_prediction(pr.pool_id, pr.match_id, pr.home_score, pr.away_score)), 0)::bigint,
    count(pr.id)::bigint,
    count(pr.id) filter (where m.status = 'finished')::bigint,
    count(pr.id) filter (where m.status = 'finished'
      and public.score_prediction(pr.pool_id, pr.match_id, pr.home_score, pr.away_score) > 0)::bigint,
    count(pr.id) filter (where m.status = 'finished'
      and pr.home_score = m.home_score and pr.away_score = m.away_score)::bigint,
    case when count(pr.id) filter (where m.status = 'finished') = 0 then 0
      else round(
        100.0 * count(pr.id) filter (where m.status = 'finished'
          and public.score_prediction(pr.pool_id, pr.match_id, pr.home_score, pr.away_score) > 0)
        / count(pr.id) filter (where m.status = 'finished')
      )::integer
    end
  from public.pool_members pm
  join public.pools visible_pool on visible_pool.id = pm.pool_id
  left join public.predictions pr on pr.pool_id = pm.pool_id and pr.user_id = pm.user_id
  left join public.matches m on m.id = pr.match_id
  where visible_pool.visibility = 'public'
    or exists (
      select 1 from public.pool_members viewer
      where viewer.pool_id = pm.pool_id and viewer.user_id = (select auth.uid())
    )
  group by pm.pool_id, pm.user_id;
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.pool_matches enable row level security;
alter table public.predictions enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.teams, public.matches, public.pools, public.pool_members,
  public.pool_matches, public.predictions from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant select on public.teams, public.matches, public.pools, public.pool_members,
  public.pool_matches, public.predictions to authenticated;
grant insert, update, delete on public.teams, public.matches to authenticated;
grant update, delete on public.pools to authenticated;
grant insert, update, delete on public.pool_matches to authenticated;
grant insert, update on public.predictions to authenticated;

create policy "Profiles are visible to signed-in users"
on public.profiles for select to authenticated using (true);
create policy "Users update only their own profile"
on public.profiles for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Teams are visible to signed-in users"
on public.teams for select to authenticated using (true);
create policy "Admins manage teams"
on public.teams for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Matches are visible to signed-in users"
on public.matches for select to authenticated using (true);
create policy "Admins manage matches"
on public.matches for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Pools are discoverable when public"
on public.pools for select to authenticated
using (visibility = 'public' or (select public.is_pool_member(id)) or (select public.is_admin()));
create policy "Pool owners update settings"
on public.pools for update to authenticated
using (owner_id = (select auth.uid()) or (select public.is_admin()))
with check (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "Pool owners and admins delete pools"
on public.pools for delete to authenticated
using (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "Pool participants are visible to authorized viewers"
on public.pool_members for select to authenticated
using ((select public.can_view_pool(pool_id)));
create policy "Pool matches are visible to authorized viewers"
on public.pool_matches for select to authenticated
using ((select public.can_view_pool(pool_id)));
create policy "Owners and admins manage pool matches"
on public.pool_matches for all to authenticated
using (
  exists (select 1 from public.pools p where p.id = pool_id
    and (p.owner_id = (select auth.uid()) or (select public.is_admin())))
)
with check (
  exists (select 1 from public.pools p where p.id = pool_id
    and (p.owner_id = (select auth.uid()) or (select public.is_admin())))
);

create policy "Users see predictions allowed by pool privacy"
on public.predictions for select to authenticated
using ((select public.can_view_prediction(pool_id, match_id, user_id)));
create policy "Members save their own predictions before kickoff"
on public.predictions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_pool_member(pool_id))
  and exists (select 1 from public.matches m
    where m.id = match_id and m.starts_at > now() and m.status = 'upcoming')
);
create policy "Members update their own predictions before kickoff"
on public.predictions for update to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_pool_member(pool_id))
  and exists (select 1 from public.matches m
    where m.id = match_id and m.starts_at > now() and m.status = 'upcoming')
)
with check (
  user_id = (select auth.uid())
  and (select public.is_pool_member(pool_id))
  and exists (select 1 from public.matches m
    where m.id = match_id and m.starts_at > now() and m.status = 'upcoming')
);

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_pool_member(uuid) from public, anon;
revoke all on function public.can_view_pool(uuid) from public, anon;
revoke all on function public.can_view_prediction(uuid, uuid, uuid) from public, anon;
revoke all on function public.score_prediction(uuid, uuid, integer, integer) from public, anon;
revoke all on function public.create_pool(text, text, text, public.pool_visibility, integer, integer, integer, boolean) from public, anon;
revoke all on function public.join_pool_by_code(text) from public, anon;
revoke all on function public.join_public_pool(uuid) from public, anon;
revoke all on function public.set_profile_role(uuid, public.app_role) from public, anon;
revoke all on function public.get_pool_standings() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_pool_member(uuid) to authenticated;
grant execute on function public.can_view_pool(uuid) to authenticated;
grant execute on function public.can_view_prediction(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_pool(text, text, text, public.pool_visibility, integer, integer, integer, boolean) to authenticated;
grant execute on function public.join_pool_by_code(text) to authenticated;
grant execute on function public.join_public_pool(uuid) to authenticated;
grant execute on function public.set_profile_role(uuid, public.app_role) to authenticated;
grant execute on function public.get_pool_standings() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public profile photos and team badges are readable"
on storage.objects for select
using (bucket_id = 'public-assets');
create policy "Users upload files into their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'public-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (storage.foldername(name))[2] is null
    or (select public.is_admin())
  )
);
create policy "Users update files in their own folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'public-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (storage.foldername(name))[2] is null
    or (select public.is_admin())
  )
)
with check (
  bucket_id = 'public-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (storage.foldername(name))[2] is null
    or (select public.is_admin())
  )
);
create policy "Users delete files in their own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'public-assets'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] is null
    or (select public.is_admin())
  )
);

-- Publica somente mudanças; o conteúdo continua sujeito às políticas RLS.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'profiles', 'teams', 'matches', 'pools',
      'pool_members', 'pool_matches', 'predictions'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

-- Dados demonstrativos sem contas fictícias ou senhas compartilhadas.
insert into public.teams (name, emoji) values
  ('Flamengo', '🔴'), ('Palmeiras', '🟢'),
  ('Corinthians', '⚫'), ('São Paulo', '🔴'),
  ('Grêmio', '🔵'), ('Internacional', '🔴'),
  ('Atlético-MG', '⚫'), ('Cruzeiro', '🔵'),
  ('Santos', '⚪'), ('Botafogo', '⚫')
on conflict (name) do nothing;

insert into public.matches (home_team_id, away_team_id, competition, starts_at)
select home.id, away.id, seed.competition, seed.starts_at
from (values
  ('Flamengo', 'Palmeiras', 'Brasileirão • Rodada 1', now() + interval '1 day'),
  ('Corinthians', 'São Paulo', 'Brasileirão • Rodada 1', now() + interval '2 days'),
  ('Grêmio', 'Internacional', 'Brasileirão • Rodada 2', now() + interval '3 days'),
  ('Atlético-MG', 'Cruzeiro', 'Brasileirão • Rodada 2', now() + interval '5 days'),
  ('Santos', 'Botafogo', 'Brasileirão • Rodada 3', now() + interval '7 days')
) as seed(home_name, away_name, competition, starts_at)
join public.teams home on home.name = seed.home_name
join public.teams away on away.name = seed.away_name
where not exists (
  select 1 from public.matches m
  where m.home_team_id = home.id and m.away_team_id = away.id
    and m.starts_at > now()
);

-- Após criar sua conta, promova o primeiro administrador manualmente:
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'SEU_EMAIL');
