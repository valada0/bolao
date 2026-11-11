import { createClient } from "@supabase/supabase-js";

const emptyState = () => ({
  users: [],
  pools: [],
  matches: [],
  predictions: [],
  standings: [],
  teams: [],
  currentUserId: null,
  currentPoolId: null
});

let client;
let session;
let state = emptyState();
let authSubscription;
let realtimeSubscription;
let selectedPoolId = null;
let onAuthChange = () => {};
let onDataChange = () => {};
let realtimeRefreshTimer;

function requireClient() {
  if (!client) throw new Error("Supabase não está configurado. Copie .env.example para .env.local e informe a URL e a chave anon do projeto.");
  return client;
}

function raise(error) {
  if (!error) return;
  console.error("Erro do Supabase:", error);
  if (error.code === "23505") throw new Error("Este registro já existe.");
  if (error.code === "42501" || error.code === "PGRST301") throw new Error("Você não tem permissão para esta ação.");
  if (error.code === "23514") throw new Error("Os dados informados não atendem às regras do sistema.");
  throw new Error(error.message || "Não foi possível concluir a operação no Supabase.");
}

function unwrap(result) {
  raise(result.error);
  return result.data;
}

function stopRealtime() {
  if (realtimeSubscription && client) {
    void client.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
  }
}

function startRealtime() {
  if (!client || !session?.user || realtimeSubscription) return;
  realtimeSubscription = client.channel("vesti-live-updates");
  ["profiles", "teams", "matches", "pools", "pool_members", "pool_matches", "predictions"].forEach((table) => {
    realtimeSubscription = realtimeSubscription.on("postgres_changes", {
      event: "*",
      schema: "public",
      table
    }, () => {
      window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = window.setTimeout(async () => {
        try {
          await load();
          onDataChange();
        } catch (error) {
          console.error("Não foi possível atualizar os dados em tempo real.", error);
        }
      }, 200);
    });
  });
  realtimeSubscription.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error("A atualização em tempo real do Supabase falhou.", error || status);
    }
  });
}

async function load() {
  const supabase = requireClient();
  selectedPoolId = selectedPoolId || state.currentPoolId;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  raise(sessionError);
  session = sessionData.session;
  const authUser = session?.user;
  if (!authUser) {
    state = emptyState();
    return state;
  }

  const [profilesResult, poolsResult, membersResult, poolMatchesResult, matchesResult, predictionsResult, standingsResult, teamsResult] = await Promise.all([
    supabase.from("profiles").select("id,display_name,avatar_path,role,created_at"),
    supabase.from("pools").select("id,name,description,emoji,visibility,invite_code,owner_id,exact_points,outcome_points,goals_points,reveal_picks_after_kickoff,created_at"),
    supabase.from("pool_members").select("pool_id,user_id,joined_at"),
    supabase.from("pool_matches").select("pool_id,match_id"),
    supabase.from("matches").select("id,competition,starts_at,status,home_score,away_score,home_team:teams!matches_home_team_id_fkey(id,name,emoji,shield_path),away_team:teams!matches_away_team_id_fkey(id,name,emoji,shield_path)"),
    supabase.from("predictions").select("id,pool_id,match_id,user_id,home_score,away_score,created_at,updated_at"),
    supabase.rpc("get_pool_standings"),
    supabase.from("teams").select("id,name,emoji,shield_path").order("name")
  ]);
  [profilesResult, poolsResult, membersResult, poolMatchesResult, matchesResult, predictionsResult, standingsResult, teamsResult].forEach((result) => raise(result.error));

  const profiles = profilesResult.data || [];
  const poolsRaw = poolsResult.data || [];
  const memberships = membersResult.data || [];
  const poolMatches = poolMatchesResult.data || [];
  const avatarUrl = (path) => {
    if (!path) return "";
    return supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl;
  };
  const matches = (matchesResult.data || []).map((match) => ({
    id: match.id,
    home: match.home_team.name,
    away: match.away_team.name,
    homeEmoji: match.home_team.emoji || "⚽",
    awayEmoji: match.away_team.emoji || "⚽",
    homeShield: avatarUrl(match.home_team.shield_path),
    awayShield: avatarUrl(match.away_team.shield_path),
    homeTeamId: match.home_team.id,
    awayTeamId: match.away_team.id,
    startsAt: match.starts_at,
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    competition: match.competition
  }));
  const users = profiles.map((profile) => ({
    id: profile.id,
    name: profile.display_name || "Participante",
    email: profile.id === authUser.id ? authUser.email : "",
    role: profile.role,
    avatar: avatarUrl(profile.avatar_path),
    createdAt: profile.created_at
  }));

  state = {
    users,
    pools: poolsRaw.map((pool) => ({
      id: pool.id,
      name: pool.name,
      description: pool.description || "",
      emoji: pool.emoji || "⚽",
      visibility: pool.visibility,
      inviteCode: pool.invite_code,
      ownerId: pool.owner_id,
      members: memberships.filter((member) => member.pool_id === pool.id).map((member) => member.user_id),
      matchIds: poolMatches.filter((item) => item.pool_id === pool.id).map((item) => item.match_id),
      settings: {
        exact: pool.exact_points,
        outcome: pool.outcome_points,
        goals: pool.goals_points,
        showPicks: pool.reveal_picks_after_kickoff
      },
      createdAt: pool.created_at
    })),
    matches,
    teams: (teamsResult.data || []).map((team) => ({
      id: team.id,
      name: team.name,
      emoji: team.emoji,
      shieldPath: team.shield_path,
      shield: avatarUrl(team.shield_path)
    })),
    predictions: (predictionsResult.data || []).map((prediction) => ({
      id: prediction.id,
      poolId: prediction.pool_id,
      matchId: prediction.match_id,
      userId: prediction.user_id,
      homeScore: prediction.home_score,
      awayScore: prediction.away_score,
      createdAt: prediction.created_at,
      updatedAt: prediction.updated_at
    })),
    standings: (standingsResult.data || []).map((row) => ({
      poolId: row.pool_id,
      userId: row.user_id,
      points: Number(row.total_points),
      predictions: Number(row.predictions_count),
      completed: Number(row.completed_count),
      hits: Number(row.hits),
      exact: Number(row.exact_hits),
      accuracy: Number(row.accuracy)
    })),
    currentUserId: authUser.id,
    currentPoolId: selectedPoolId
  };
  return state;
}

async function ensureTeam(name, emoji) {
  const supabase = requireClient();
  const trimmed = name.trim();
  return unwrap(await supabase.from("teams").upsert(
    { name: trimmed, emoji: emoji || "⚽" },
    { onConflict: "name" }
  ).select("id").single()).id;
}

export const VestiStore = {
  async initialize(authChange, dataChange) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return { configured: false, state };
    client = createClient(url, anonKey);
    onAuthChange = authChange || (() => {});
    onDataChange = dataChange || (() => {});
    const { data, error } = await client.auth.getSession();
    raise(error);
    session = data.session;
    await load();
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      window.setTimeout(() => {
        if (session?.user) startRealtime();
        else stopRealtime();
        onAuthChange();
      }, 0);
    });
    authSubscription = subscription.subscription;
    startRealtime();
    return { configured: true, state };
  },
  get() { return state; },
  async refresh() { return load(); },
  async signIn(email, password) {
    unwrap(await requireClient().auth.signInWithPassword({ email, password }));
    return load();
  },
  async signUp(name, email, password, inviteCode = "") {
    const { data, error } = await requireClient().auth.signUp({
      email,
      password,
      options: { data: { display_name: name, invite_code: inviteCode || null } }
    });
    raise(error);
    if (data.session) await load();
    return { confirmed: Boolean(data.session), joined: Boolean(inviteCode) };
  },
  async signOut() {
    unwrap(await requireClient().auth.signOut());
    session = null;
    state = emptyState();
    return state;
  },
  async createPool(values) {
    const poolId = unwrap(await requireClient().rpc("create_pool", {
      p_name: values.name,
      p_description: values.description,
      p_emoji: values.emoji,
      p_visibility: values.visibility,
      p_exact_points: values.exact,
      p_outcome_points: values.outcome,
      p_goals_points: values.goals,
      p_reveal_picks_after_kickoff: values.showPicks
    }));
    return poolId;
  },
  async joinPoolByCode(code) {
    unwrap(await requireClient().rpc("join_pool_by_code", { p_invite_code: code }));
  },
  async joinPublicPool(poolId) {
    unwrap(await requireClient().rpc("join_public_pool", { p_pool_id: poolId }));
  },
  async savePrediction(poolId, matchId, homeScore, awayScore) {
    unwrap(await requireClient().from("predictions").upsert({
      pool_id: poolId,
      match_id: matchId,
      user_id: session.user.id,
      home_score: homeScore,
      away_score: awayScore
    }, { onConflict: "pool_id,match_id,user_id" }).select("id").single());
  },
  async updatePool(poolId, values) {
    unwrap(await requireClient().from("pools").update({
      name: values.name,
      description: values.description,
      emoji: values.emoji,
      visibility: values.visibility
    }).eq("id", poolId).select("id").single());
  },
  async deletePool(poolId) {
    unwrap(await requireClient().from("pools").delete().eq("id", poolId).select("id").single());
  },
  async updateProfile({ name, file, password }) {
    const supabase = requireClient();
    const profileUpdate = { display_name: name };
    if (file) {
      if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
      if (file.size > 1024 * 1024) throw new Error("A foto precisa ter até 1 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${session.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
      unwrap(await supabase.storage.from("public-assets").upload(path, file, { upsert: false, contentType: file.type }));
      profileUpdate.avatar_path = path;
    }
    unwrap(await supabase.from("profiles").update(profileUpdate).eq("id", session.user.id).select("id").single());
    if (password) unwrap(await supabase.auth.updateUser({ password }));
  },
  async saveMatch(values, matchId, poolIds = []) {
    const supabase = requireClient();
    const homeTeamId = await ensureTeam(values.home, values.homeEmoji);
    const awayTeamId = await ensureTeam(values.away, values.awayEmoji);
    const record = {
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      competition: values.competition || null,
      starts_at: values.startsAt,
      status: values.status,
      home_score: values.homeScore,
      away_score: values.awayScore
    };
    if (matchId) unwrap(await supabase.from("matches").update(record).eq("id", matchId).select("id").single());
    else {
      const match = unwrap(await supabase.from("matches").insert(record).select("id").single());
      if (poolIds.length) {
        unwrap(await supabase.from("pool_matches").insert(poolIds.map((poolId) => ({ pool_id: poolId, match_id: match.id }))));
      }
    }
  },
  async uploadTeamShield(teamId, file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
    if (file.size > 1024 * 1024) throw new Error("O escudo precisa ter até 1 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${session.user.id}/teams/${teamId}/shield-${crypto.randomUUID()}.${extension}`;
    unwrap(await requireClient().storage.from("public-assets").upload(path, file, { upsert: false, contentType: file.type }));
    unwrap(await requireClient().from("teams").update({ shield_path: path }).eq("id", teamId).select("id").single());
  },
  async updatePoolRules(poolId, settings) {
    unwrap(await requireClient().from("pools").update({
      exact_points: settings.exact,
      outcome_points: settings.outcome,
      goals_points: settings.goals
    }).eq("id", poolId).select("id").single());
  },
  async updateRevealPicks(poolId, showPicks) {
    unwrap(await requireClient().from("pools").update({ reveal_picks_after_kickoff: showPicks }).eq("id", poolId).select("id").single());
  },
  async setProfileRole(userId, role) {
    unwrap(await requireClient().rpc("set_profile_role", { p_user_id: userId, p_role: role }));
  },
  async close() {
    authSubscription?.unsubscribe();
    authSubscription = null;
    stopRealtime();
  }
};
