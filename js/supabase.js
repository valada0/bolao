import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes("YOUR_PROJECT_ID") && !anonKey.includes("YOUR_SUPABASE"));
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

function assertClient() {
  if (!supabase) {
    throw new Error("Supabase não está configurado. Copie .env.example para .env, preencha as credenciais do projeto e reinicie o servidor.");
  }
  return supabase;
}

function unwrap(result) {
  if (result.error) {
    console.error("Erro na operação Supabase:", result.error);
    throw new Error(result.error.message || "Não foi possível concluir a operação no Supabase.");
  }
  return result.data;
}

function mapPool(row, memberships, poolMatches) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    emoji: row.emoji || "⚽",
    imageUrl: row.image_url || "",
    visibility: row.visibility,
    inviteCode: row.invite_code,
    ownerId: row.created_by,
    members: memberships.filter((member) => member.pool_id === row.id).map((member) => member.user_id),
    matchIds: poolMatches.filter((item) => item.pool_id === row.id).map((item) => item.match_id),
    settings: {
      exact: row.points_exact,
      outcome: row.points_outcome,
      goals: row.points_goal,
      showPicks: row.show_picks
    },
    createdAt: row.created_at
  };
}

export const VestiBackend = {
  async getSession() {
    const client = assertClient();
    return unwrap(await client.auth.getSession()).session;
  },
  onAuthStateChange(callback) {
    const client = assertClient();
    return client.auth.onAuthStateChange(callback);
  },
  async signIn(email, password) {
    const client = assertClient();
    return unwrap(await client.auth.signInWithPassword({ email, password }));
  },
  async signUp(name, email, password) {
    const client = assertClient();
    return unwrap(await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } }
    }));
  },
  async signOut() {
    const client = assertClient();
    unwrap(await client.auth.signOut());
  },
  async loadState(authUser) {
    const client = assertClient();
    const results = await Promise.all([
      client.from("profiles").select("id,display_name,avatar_url,role,created_at").order("display_name"),
      client.from("pools").select("id,name,description,emoji,image_url,visibility,invite_code,created_by,points_exact,points_outcome,points_goal,show_picks,created_at").order("created_at", { ascending: false }),
      client.from("pool_members").select("pool_id,user_id,role,created_at"),
      client.from("matches").select("id,home_team,away_team,home_emoji,away_emoji,home_logo_url,away_logo_url,starts_at,status,home_score,away_score,competition,created_at").order("starts_at"),
      client.from("pool_matches").select("pool_id,match_id"),
      client.from("predictions").select("id,pool_id,match_id,user_id,home_score,away_score,created_at,updated_at")
    ]);
    const [profiles, pools, memberships, matches, poolMatches, predictions] = results.map(unwrap);
    const users = profiles.map((profile) => ({
      id: profile.id,
      name: profile.display_name || "Participante",
      email: profile.id === authUser.id ? authUser.email : "",
      role: profile.role,
      avatar: profile.avatar_url || "",
      createdAt: profile.created_at
    }));
    return {
      users,
      pools: pools.map((pool) => mapPool(pool, memberships, poolMatches)),
      matches: matches.map((match) => ({
        id: match.id,
        home: match.home_team,
        away: match.away_team,
        homeEmoji: match.home_emoji || "⚽",
        awayEmoji: match.away_emoji || "⚽",
        homeLogoUrl: match.home_logo_url || "",
        awayLogoUrl: match.away_logo_url || "",
        startsAt: match.starts_at,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        competition: match.competition || ""
      })),
      predictions: predictions.map((prediction) => ({
        id: prediction.id,
        poolId: prediction.pool_id,
        matchId: prediction.match_id,
        userId: prediction.user_id,
        homeScore: prediction.home_score,
        awayScore: prediction.away_score,
        createdAt: prediction.created_at
      })),
      currentUserId: authUser.id,
      currentPoolId: null
    };
  },
  async createPool(data) {
    const client = assertClient();
    return unwrap(await client.rpc("create_pool", {
      p_name: data.name,
      p_description: data.description || "",
      p_emoji: data.emoji || "⚽",
      p_image_url: data.imageUrl || null,
      p_visibility: data.visibility,
      p_points_exact: data.exact,
      p_points_outcome: data.outcome,
      p_points_goal: data.goals,
      p_show_picks: data.showPicks
    }));
  },
  async joinPool(code) {
    const client = assertClient();
    return unwrap(await client.rpc("join_pool_by_code", { p_code: code }));
  },
  async joinPublicPool(poolId) {
    const client = assertClient();
    return unwrap(await client.rpc("join_public_pool", { p_pool_id: poolId }));
  },
  async savePrediction(poolId, matchId, homeScore, awayScore) {
    const client = assertClient();
    return unwrap(await client.rpc("save_prediction", {
      p_pool_id: poolId,
      p_match_id: matchId,
      p_home_score: homeScore,
      p_away_score: awayScore
    }));
  },
  async updatePoolSettings(poolId, settings) {
    const client = assertClient();
    unwrap(await client.from("pools").update({
      points_exact: settings.exact,
      points_outcome: settings.outcome,
      points_goal: settings.goals,
      show_picks: settings.showPicks
    }).eq("id", poolId));
  },
  async updateProfile(name, avatarUrl) {
    const client = assertClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw new Error(error.message);
    if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
    unwrap(await client.from("profiles").update({ display_name: name, avatar_url: avatarUrl }).eq("id", user.id));
    unwrap(await client.auth.updateUser({ data: { display_name: name } }));
  },
  async updatePoolImage(poolId, imageUrl) {
    const client = assertClient();
    unwrap(await client.from("pools").update({ image_url: imageUrl }).eq("id", poolId));
  },
  async changePassword(password) {
    const client = assertClient();
    unwrap(await client.auth.updateUser({ password }));
  },
  async uploadImage(bucket, file) {
    const client = assertClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw new Error(error.message);
    if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
    const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    unwrap(await client.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type }));
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
  async saveMatch(match) {
    const client = assertClient();
    const payload = {
      home_team: match.home,
      away_team: match.away,
      home_emoji: match.homeEmoji || "⚽",
      away_emoji: match.awayEmoji || "⚽",
      home_logo_url: match.homeLogoUrl || null,
      away_logo_url: match.awayLogoUrl || null,
      starts_at: match.startsAt,
      status: match.status,
      home_score: match.homeScore,
      away_score: match.awayScore,
      competition: match.competition || null
    };
    const query = match.id ? client.from("matches").update(payload).eq("id", match.id) : client.from("matches").insert(payload);
    unwrap(await query);
  },
  async setProfileRole(userId, role) {
    const client = assertClient();
    unwrap(await client.rpc("admin_set_profile_role", { p_user_id: userId, p_role: role }));
  },
  subscribeToUpdates(callback, onError) {
    const client = assertClient();
    return client.channel("vesti-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "pools" }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "pool_members" }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "pool_matches" }, callback)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, callback)
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError?.(error || new Error(`Realtime status: ${status}`));
      });
  }
};
