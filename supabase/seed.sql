insert into public.matches (
  home_team, away_team, home_emoji, away_emoji, starts_at, status, competition
)
values
  ('Flamengo', 'Palmeiras', '🔴', '🟢', date_trunc('day', now()) + interval '1 day 19 hours', 'upcoming', 'Brasileirão • Rodada 1'),
  ('Corinthians', 'São Paulo', '⚫', '🔴', date_trunc('day', now()) + interval '2 days 19 hours', 'upcoming', 'Brasileirão • Rodada 1'),
  ('Grêmio', 'Internacional', '🔵', '🔴', date_trunc('day', now()) + interval '3 days 19 hours', 'upcoming', 'Brasileirão • Rodada 1'),
  ('Atlético-MG', 'Cruzeiro', '⚫', '🔵', date_trunc('day', now()) + interval '5 days 19 hours', 'upcoming', 'Brasileirão • Rodada 2'),
  ('Santos', 'Botafogo', '⚪', '⚫', date_trunc('day', now()) + interval '6 days 19 hours', 'upcoming', 'Brasileirão • Rodada 2')
on conflict (home_team, away_team, starts_at) do nothing;

insert into public.pools (
  name, description, emoji, visibility, invite_code, created_by
)
select
  'Bolão da comunidade',
  'Um bolão público para começar a temporada com a comunidade Vesti.',
  '🏆',
  'public',
  'VESTI26',
  id
from public.profiles
where role = 'admin'
order by created_at
limit 1
on conflict (invite_code) do nothing;

insert into public.pool_members (pool_id, user_id, role)
select id, created_by, 'owner'
from public.pools
where name = 'Bolão da comunidade'
on conflict (pool_id, user_id) do nothing;

insert into public.pool_matches (pool_id, match_id)
select p.id, m.id
from public.pools p
cross join public.matches m
where p.name = 'Bolão da comunidade'
  and m.status = 'upcoming'
on conflict (pool_id, match_id) do nothing;
