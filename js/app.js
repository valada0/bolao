import { VestiStore } from "./storage.js";

(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastRegion = document.getElementById("toast-region");
  let state = VestiStore.get();
  let adminTab = "matches";
  let searchTerm = "";
  let selectedPoolId = null;
  let configured = false;
  let loading = true;

  const icons = {
    ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2v3l-3 2-3-2V9l3-2ZM9 9l-3-1m9 1 3-1m-9 4-4 3m10-3 4 3m-8-1v5m4-5v5"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    trophy: '<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
    chart: '<path d="M4 19V5m0 14h17M8 15l4-4 3 2 5-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7-.2.1a8 8 0 0 1-1.4.8l-.2.1-.3 1.8h-2.8l-.3-1.8-.2-.1a8 8 0 0 1-1.4-.8l-.2-.1-1.7.7-1.4-2.4 1.4-1.1.1-.2a8 8 0 0 1 0-1.6l-.1-.2-1.4-1.1 1.4-2.4 1.7.7.2-.1a8 8 0 0 1 1.4-.8l.2-.1.3-1.8h2.8l.3 1.8.2.1a8 8 0 0 1 1.4.8l.2.1 1.7-.7 1.4 2.4-1.4 1.1-.1.2a8 8 0 0 1 0 1.6Z"/>',
    plus: '<path d="M12 5v14m-7-7h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.5a4 4 0 0 1 0 7.8m6 10.7v-2a4 4 0 0 0-3-3.9"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    medal: '<circle cx="12" cy="8" r="5"/><path d="m8 12-1 9 5-3 5 3-1-9"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    logout: '<path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-1 5Z"/>'
  };
  const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.ball}</svg>`;
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  const date = (value, options = {}) => new Intl.DateTimeFormat("pt-BR", options).format(new Date(value));
  const currentUser = () => state.users.find((user) => user.id === state.currentUserId) || null;
  const getPool = (id) => state.pools.find((pool) => pool.id === id);
  const getMatch = (id) => state.matches.find((match) => match.id === id);
  const getUser = (id) => state.users.find((user) => user.id === id);
  const avatar = (user, cls = "") => `<span class="avatar ${cls}">${user && user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc(initials(user ? user.name : "?"))}</span>`;
  const teamBadge = (emoji, shield) => `<span class="team-badge">${shield ? `<img src="${esc(shield)}" alt="">` : esc(emoji || "⚽")}</span>`;
  const pointSettings = (pool) => ({ exact: 10, outcome: 5, goals: 2, ...(pool && pool.settings || {}) });
  const outcome = (home, away) => home > away ? "home" : home < away ? "away" : "draw";
  const scorePrediction = (prediction, match, pool) => {
    if (!prediction || !match || match.status !== "finished" || match.homeScore === null || match.awayScore === null) return 0;
    const rules = pointSettings(pool);
    if (prediction.homeScore === match.homeScore && prediction.awayScore === match.awayScore) return Number(rules.exact);
    let points = 0;
    if (outcome(prediction.homeScore, prediction.awayScore) === outcome(match.homeScore, match.awayScore)) points += Number(rules.outcome);
    if (prediction.homeScore === match.homeScore) points += Number(rules.goals);
    if (prediction.awayScore === match.awayScore) points += Number(rules.goals);
    return points;
  };
  const standings = (pool) => (pool ? pool.members : []).map((userId) => {
    const user = getUser(userId);
    if (!user) return null;
    const serverRow = state.standings.find((row) => row.poolId === pool.id && row.userId === userId);
    if (serverRow) return { user, ...serverRow };
    const predictions = state.predictions.filter((item) => item.poolId === pool.id && item.userId === userId);
    const completed = predictions.filter((item) => getMatch(item.matchId)?.status === "finished");
    const points = completed.reduce((sum, item) => sum + scorePrediction(item, getMatch(item.matchId), pool), 0);
    const hits = completed.filter((item) => scorePrediction(item, getMatch(item.matchId), pool) > 0).length;
    const exact = completed.filter((item) => scorePrediction(item, getMatch(item.matchId), pool) === Number(pointSettings(pool).exact)).length;
    return { user, points, predictions: predictions.length, completed: completed.length, hits, exact, accuracy: completed.length ? Math.round(hits / completed.length * 100) : 0 };
  }).filter(Boolean).sort((a, b) => b.points - a.points || b.exact - a.exact || b.hits - a.hits || a.user.name.localeCompare(b.user.name, "pt-BR"));
  const userTotalPoints = (userId) => state.pools.reduce((sum, pool) => sum + (standings(pool).find((row) => row.user.id === userId)?.points || 0), 0);
  const userPools = (userId) => state.pools.filter((pool) => pool.members.includes(userId));
  const go = (path) => { location.hash = path; };
  const routeNow = () => (location.hash.replace(/^#\/?/, "") || "home").split("/");
  const toast = (message, isError = false) => {
    const node = document.createElement("div");
    node.className = `toast${isError ? " error" : ""}`;
    node.textContent = message;
    toastRegion.appendChild(node);
    setTimeout(() => node.remove(), 3400);
  };
  const refreshState = async () => {
    state = await VestiStore.refresh();
    render();
  };
  const run = async (operation, successMessage, navigate) => {
    try {
      await operation();
      await refreshState();
      if (successMessage) toast(successMessage);
      if (navigate) go(navigate);
    } catch (error) {
      toast(error.message || "Não foi possível concluir a operação.", true);
    }
    function editPoolModal(poolId) {
      const pool = getPool(poolId);
      if (!pool || !(pool.ownerId === currentUser().id || currentUser().role === "admin")) return toast("Somente o organizador pode editar este bolão.", true);
      const content = `<div class="field"><label>Nome do bolão</label><input name="name" value="${esc(pool.name)}" required minlength="3" maxlength="48"></div><div class="field" style="margin-top:12px"><label>Descrição</label><textarea name="description" maxlength="240">${esc(pool.description)}</textarea></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Emoji</label><input name="emoji" value="${esc(pool.emoji)}" maxlength="8"></div><div class="field"><label>Visibilidade</label><select name="visibility"><option value="public" ${pool.visibility === "public" ? "selected" : ""}>Público</option><option value="private" ${pool.visibility === "private" ? "selected" : ""}>Privado</option></select></div></div>`;
      showModal("Editar bolão", content, "Salvar", async (formData) => {
        await VestiStore.updatePool(poolId, {
          name: String(formData.get("name")).trim(),
          description: String(formData.get("description") || "").trim(),
          emoji: String(formData.get("emoji") || "⚽"),
          visibility: String(formData.get("visibility"))
        });
        await refreshState();
        toast("Bolão atualizado.");
        return true;
      });
    }
  };
  const isLocked = (match) => match.status === "finished" || new Date(match.startsAt).getTime() <= Date.now();
  const activeMatches = (pool) => (pool ? pool.matchIds.map(getMatch).filter(Boolean) : state.matches).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const formatCountdown = (startsAt) => {
    const diff = new Date(startsAt).getTime() - Date.now();
    if (diff <= 0) return "Palpites encerrados";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff % 86400000 / 3600000);
    if (days) return `Em ${days} dia${days > 1 ? "s" : ""}`;
    if (hours) return `Em ${hours}h`;
    return "Em breve";
  };
  const navItems = [
    { path: "home", label: "Visão geral", icon: "home" },
    { path: "picks", label: "Meus palpites", icon: "ball" },
    { path: "explore", label: "Explorar bolões", icon: "grid" },
    { path: "ranking", label: "Classificação", icon: "trophy" },
    { path: "profile", label: "Meu perfil", icon: "user" }
  ];
  const navLink = (item, route) => `<a class="nav-link${route[0] === item.path || item.path === "home" && route[0] === "pool" ? " active" : ""}" href="#${item.path}">${icon(item.icon)}<span class="nav-label">${item.label}</span></a>`;
  const sidebar = (route) => {
    const user = currentUser();
    return `<aside class="sidebar">
      <a class="brand" href="#home"><span class="brand-mark">${icon("ball")}</span><span>vesti<em>.</em></span></a>
      <div class="nav-caption">Menu principal</div>
      <nav class="nav-list">${navItems.map((item) => navLink(item, route)).join("")}
        ${user?.role === "admin" ? `<a class="nav-link${route[0] === "admin" ? " active" : ""}" href="#admin">${icon("gear")}<span class="nav-label">Administração</span></a>` : ""}
      </nav>
      <div class="sidebar-bottom">
        <div class="invite-card"><span class="invite-icon">${icon("people")}</span><strong>Tem um código?</strong><p>Entre no bolão dos seus amigos e comece a palpitar.</p><button type="button" data-action="join-pool">Entrar com convite →</button></div>
        <div class="user-mini">${avatar(user)}<div class="user-mini-copy"><strong>${esc(user?.name || "Visitante")}</strong><span>${user?.role === "admin" ? "Administrador" : "Palpiteiro"}</span></div><button class="icon-button" title="Sair" data-action="logout">${icon("logout")}</button></div>
      </div>
    </aside>`;
  };
  const topbar = () => `<header class="topbar"><div class="breadcrumbs">Vesti <span> / </span> <strong>${esc(pageTitle(routeNow()[0]))}</strong></div><div class="top-actions">
    <label class="search-box">${icon("search")}<input type="search" aria-label="Buscar bolões" placeholder="Buscar partidas e bolões..." value="${esc(searchTerm)}"></label>
    <button class="icon-button notification-dot" title="Notificações" data-action="notifications">${icon("bell")}</button>
  </div></header>`;
  const pageTitle = (page) => ({ home: "Visão geral", login: "Entrar", register: "Criar conta", explore: "Explorar bolões", create: "Criar bolão", pool: "Meu bolão", picks: "Meus palpites", ranking: "Classificação", profile: "Meu perfil", admin: "Administração" }[page] || "Visão geral");
  const mobileNav = (route) => `<nav class="mobile-menu">${navItems.slice(0, 5).map((item) => `<a class="${route[0] === item.path || route[0] === "pool" && item.path === "home" ? "active" : ""}" href="#${item.path}">${icon(item.icon)}<span>${item.path === "explore" ? "Bolões" : item.path === "ranking" ? "Ranking" : item.path === "profile" ? "Perfil" : item.path === "picks" ? "Palpites" : "Início"}</span></a>`).join("")}${currentUser()?.role === "admin" ? `<a class="${route[0] === "admin" ? "active" : ""}" href="#admin">${icon("gear")}<span>Admin</span></a>` : ""}</nav>`;
  const shell = (content, route) => `<div class="app-shell">${sidebar(route)}<div class="main-wrap">${topbar()}<main class="page">${content}</main></div>${mobileNav(route)}</div>`;
  const button = (label, action, cls = "btn-primary", extra = "") => `<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const statCard = (name, value, iconName, hint = "") => `<div class="card stat-card"><span class="stat-icon">${icon(iconName)}</span><div class="stat-copy"><span>${name}</span><strong>${value}</strong>${hint ? `<em>${hint}</em>` : ""}</div></div>`;

  function matchRow(match, pool, userId) {
    const prediction = state.predictions.find((item) => item.poolId === pool?.id && item.matchId === match.id && item.userId === userId);
    const locked = isLocked(match);
    const score = match.status === "finished" ? `<span class="score-display">${match.homeScore} – ${match.awayScore}</span>` : '<span class="score-display">vs</span>';
    return `<div class="match-row"><div class="match-time"><strong>${date(match.startsAt, { day: "2-digit", month: "short" })}</strong>${date(match.startsAt, { hour: "2-digit", minute: "2-digit" })} · ${esc(match.competition || "Partida")}</div>
      <div class="teams"><span class="team">${teamBadge(match.homeEmoji, match.homeShield)}<span class="team-name">${esc(match.home)}</span></span>${score}<span class="team"><span class="team-name">${esc(match.away)}</span>${teamBadge(match.awayEmoji, match.awayShield)}</span></div>
      <div class="match-action">${match.status === "finished" ? `<span class="tag tag-green">${prediction ? `${scorePrediction(prediction, match, pool)} pts` : "Encerrado"}</span>` : `<a class="btn ${prediction ? "btn-secondary" : "btn-primary"} btn-small" href="#picks${pool ? `/${pool.id}` : ""}">${locked ? "Ver palpite" : prediction ? `${prediction.homeScore}–${prediction.awayScore} · Editar` : "Palpitar"}</a>`}</div></div>`;
  }
  function poolCard(pool, userId) {
    const userRank = standings(pool).find((row) => row.user.id === userId);
    return `<a class="pool-card" href="#pool/${encodeURIComponent(pool.id)}"><span class="pool-emblem">${esc(pool.emoji || "⚽")}</span><span class="pool-info"><strong>${esc(pool.name)}</strong><span>${pool.members.length} participantes · ${pool.visibility === "private" ? "Privado" : "Público"}</span></span><span class="pool-points"><strong>${userRank?.points || 0}</strong><span>pontos</span></span></a>`;
  }
  function rankRows(pool, limit = 5) {
    const rows = standings(pool).slice(0, limit);
    if (!rows.length) return '<div class="empty-state">Ainda não há participantes neste bolão.</div>';
    return `<div class="rank-list">${rows.map((row, index) => `<div class="rank-item"><span class="rank-number${index < 3 ? " top" : ""}">${String(index + 1).padStart(2, "0")}</span>${avatar(row.user)}<span class="rank-name">${esc(row.user.name)}<small>${row.exact} placar${row.exact === 1 ? "" : "es"} exato${row.exact === 1 ? "" : "s"}</small></span><span class="rank-points">${row.points} pts</span></div>`).join("")}</div>`;
  }
  function dashboard() {
    const user = currentUser();
    const pools = userPools(user.id);
    const picks = state.predictions.filter((item) => item.userId === user.id);
    const matches = pools.flatMap((pool) => pool.matchIds.map(getMatch).filter(Boolean)).filter((match, index, list) => list.findIndex((entry) => entry.id === match.id) === index);
    const upcoming = matches.filter((match) => match.status === "upcoming" && !isLocked(match)).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 3);
    const primaryPool = getPool(state.currentPoolId) && getPool(state.currentPoolId).members.includes(user.id) ? getPool(state.currentPoolId) : pools[0];
    const globalRank = state.users.map((item) => ({ user: item, points: userTotalPoints(item.id) })).sort((a, b) => b.points - a.points);
    const position = globalRank.findIndex((row) => row.user.id === user.id) + 1;
    return `<section class="dashboard-hero"><span class="hero-chip">TEMPORADA 2026</span><div class="hero-copy"><div class="eyebrow">A bola está com você</div><h1>Seu próximo palpite pode <span>mudar tudo.</span></h1><p>Entre na disputa, faça seus palpites e mostre quem entende de futebol.</p><div class="hero-actions"><a class="btn btn-primary" href="#picks">${icon("ball")} Fazer palpites</a><a class="btn btn-secondary" href="#explore">Explorar bolões</a></div><div class="hero-community">${state.users.length} jogadores <span>·</span> ${state.pools.length} bolões <span>·</span> ${state.matches.filter((match) => match.status === "upcoming").length} próximos jogos</div></div><div class="hero-art">${icon("ball")}</div></section>
      <div class="stats-grid">${statCard("Meus pontos", userTotalPoints(user.id), "medal", "na temporada")}${statCard("Bolões ativos", pools.length, "trophy")}${statCard("Palpites feitos", picks.length, "ball")}${statCard("Posição geral", position ? `#${position}` : "—", "chart")}</div>
      <div class="dashboard-grid"><div class="stack"><section class="card"><div class="card-heading"><h2>Próximas partidas</h2><a class="text-link" href="#picks">Ver todas →</a></div><div class="match-list">${upcoming.length ? upcoming.map((match) => matchRow(match, primaryPool, user.id)).join("") : '<div class="empty-state"><strong>Tudo em dia!</strong>Não há jogos abertos para palpites nos seus bolões.</div>'}</div></section>
      <section class="card"><div class="card-heading"><h2>Seus bolões</h2><a class="text-link" href="#explore">Explorar →</a></div><div class="pool-list">${pools.length ? pools.slice(0, 3).map((pool) => poolCard(pool, user.id)).join("") : '<div class="empty-state">Você ainda não participa de nenhum bolão.</div>'}</div></section></div>
      <div class="stack"><section class="card"><div class="card-heading"><h2>${esc(primaryPool?.name || "Ranking")} · Top 5</h2>${primaryPool ? `<a class="text-link" href="#ranking/${encodeURIComponent(primaryPool.id)}">Ver ranking →</a>` : ""}</div>${primaryPool ? rankRows(primaryPool) : '<div class="empty-state">Participe de um bolão para ver o ranking.</div>'}</section>
      <section class="card"><div class="card-heading"><h2>Como pontuar</h2><span class="tag tag-green">Regras base</span></div><div class="settings-list"><div class="setting-row"><div><strong>Placar exato</strong><span>Acertou o resultado completo</span></div><span class="tag tag-green">10 pts</span></div><div class="setting-row"><div><strong>Resultado correto</strong><span>Vitória, empate ou derrota</span></div><span class="tag">5 pts</span></div><div class="setting-row"><div><strong>Gols do time</strong><span>Por equipe com gols certos</span></div><span class="tag">2 pts</span></div></div></section></div></div>`;
  }
  function loginPage(register = false) {
    return `<div class="auth-wrap"><aside class="auth-aside"><a class="brand" href="#home"><span class="brand-mark">${icon("ball")}</span><span>vesti<em>.</em></span></a><div class="auth-promo"><div class="eyebrow">Seu jogo. Suas regras.</div><h1>Futebol é melhor quando a <span>disputa é sua.</span></h1><p>Crie seu bolão, convide a galera e prove que você conhece o jogo dentro e fora de campo.</p></div><div class="auth-foot">© 2025 Vesti · Feito para quem vive futebol.</div></aside><section class="auth-content"><form class="auth-form" data-form="${register ? "register" : "login"}"><div class="eyebrow">${register ? "Chega mais" : "Que bom ter você de volta"}</div><h2>${register ? "Crie sua conta" : "Entre na sua conta"}</h2><p>${register ? "Só falta um cadastro rápido para entrar em campo." : "Acesse seus palpites e continue na disputa."}</p>
      ${register ? `<div class="field"><label for="auth-name">Nome completo</label><input id="auth-name" name="name" autocomplete="name" placeholder="Como quer ser chamado?" required minlength="2" maxlength="60"></div>` : ""}
      <div class="field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="voce@email.com" required maxlength="120"></div>
      <div class="field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="${register ? "Mínimo de 6 caracteres" : "Sua senha"}" required minlength="${register ? "6" : "1"}" maxlength="80"></div>
      ${register ? `<div class="field"><label for="auth-code">Código de convite <span class="field-help">(opcional)</span></label><input id="auth-code" name="inviteCode" placeholder="Ex.: BR25GO" maxlength="24"></div>` : ""}
      <button class="btn btn-primary" type="submit">${register ? "Criar minha conta" : "Entrar"} ${icon("arrow")}</button>
      <div class="auth-switch">${register ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <a href="#${register ? "login" : "register"}">${register ? "Fazer login" : "Criar conta grátis"}</a></div>
      ${!register ? `<div class="demo-note">Entre com sua conta do Supabase. Se ainda não tem cadastro, crie uma conta — pode ser necessário confirmar o endereço de e-mail antes do primeiro acesso.</div>` : ""}</form></section></div>`;
  }
  function explorePage() {
    const user = currentUser();
    const search = searchTerm.toLocaleLowerCase("pt-BR");
    const pools = state.pools.filter((pool) => pool.visibility === "public" || pool.members.includes(user.id)).filter((pool) => !search || `${pool.name} ${pool.description}`.toLocaleLowerCase("pt-BR").includes(search));
    return `<div class="page-heading"><div><div class="eyebrow">Comunidade</div><h1>Explore os bolões</h1><p class="subtitle">Encontre uma disputa, convide seus amigos e entre no jogo.</p></div><a class="btn btn-primary" href="#create">${icon("plus")} Criar bolão</a></div>
      <div class="filter-row"><span class="tag">${pools.length} bolões encontrados</span>${button(`${icon("people")} Entrar com código`, "join-pool", "btn-secondary")}</div>
      <div class="dashboard-grid"><div class="stack">${pools.length ? pools.map((pool) => {
        const joined = pool.members.includes(user.id);
        const lead = standings(pool)[0];
        const nextMatch = activeMatches(pool).find((match) => match.status === "upcoming");
        return `<section class="card"><div class="detail-hero"><span class="pool-emblem">${esc(pool.emoji || "⚽")}</span><div class="detail-copy"><h2>${esc(pool.name)}</h2><p>${esc(pool.description || "Sem descrição.")}</p><div class="detail-meta"><span class="tag">${pool.members.length} participantes</span><span class="tag">${pool.visibility === "private" ? `${icon("lock")} Privado` : "Público"}</span><span class="tag">${activeMatches(pool).length} partidas</span></div></div>${joined ? `<a class="btn btn-secondary btn-small" href="#pool/${encodeURIComponent(pool.id)}">Abrir</a>` : `<button class="btn btn-primary btn-small" data-action="join-public" data-pool="${esc(pool.id)}">Participar</button>`}</div>
          <div class="settings-list"><div class="setting-row"><div><strong>Líder atual</strong><span>${lead ? esc(lead.user.name) : "Sem pontuação ainda"}</span></div><span class="tag tag-green">${lead ? `${lead.points} pts` : "—"}</span></div><div class="setting-row"><div><strong>Próxima partida</strong><span>${nextMatch ? `${esc(nextMatch.home)} × ${esc(nextMatch.away)}` : "Nenhuma agendada"}</span></div><span>${nextMatch ? `<span class="tag">${date(nextMatch.startsAt, { day: "2-digit", month: "short" })}</span>` : ""}</span></div></div></section>`;
      }).join("") : '<div class="card empty-state"><strong>Nenhum bolão encontrado</strong>Tente outra busca ou crie seu próprio bolão.</div>'}</div>
      <div class="stack"><section class="card"><div class="card-heading"><h2>Faça seu jogo</h2></div><p class="subtitle" style="line-height:1.7">Crie um bolão público ou privado, escolha as regras e convide quem quiser. Cada bolão tem partidas, participantes e ranking independentes.</p><a class="btn btn-primary" href="#create">${icon("plus")} Criar meu bolão</a></section><section class="card"><div class="card-heading"><h2>Já tem um convite?</h2></div><p class="subtitle" style="line-height:1.7">Peça o código ao organizador e participe em segundos.</p>${button(`${icon("people")} Usar código`, "join-pool", "btn-secondary")}</section></div></div>`;
  }
  function createPoolPage() {
    return `<div class="page-heading"><div><div class="eyebrow">Sua turma, suas regras</div><h1>Criar um bolão</h1><p class="subtitle">Monte a disputa e convide a galera para participar.</p></div></div>
      <section class="card form-card"><form data-form="create-pool"><div class="form-grid">
      <div class="field full"><label for="pool-name">Nome do bolão *</label><input id="pool-name" name="name" placeholder="Ex.: Amigos do Brasileirão" required minlength="3" maxlength="48"></div>
      <div class="field full"><label for="pool-description">Descrição</label><textarea id="pool-description" name="description" placeholder="Conte um pouco sobre seu bolão..." maxlength="240"></textarea></div>
      <div class="field"><label for="pool-emoji">Escudo ou emoji</label><select id="pool-emoji" name="emoji"><option>⚽</option><option>🏆</option><option>🥇</option><option>🏟️</option><option>🔥</option><option>⭐</option><option>🐯</option><option>👑</option></select><span class="field-help">Escolha um símbolo para identificar seu bolão.</span></div>
      <div class="field"><label for="pool-visibility">Privacidade</label><select id="pool-visibility" name="visibility"><option value="public">Público — qualquer pessoa pode entrar</option><option value="private">Privado — somente com código de convite</option></select></div>
      <div class="field"><label for="pool-exact">Placar exato (pontos)</label><input id="pool-exact" name="exact" type="number" min="0" max="100" value="10" required></div>
      <div class="field"><label for="pool-outcome">Resultado correto (pontos)</label><input id="pool-outcome" name="outcome" type="number" min="0" max="100" value="5" required></div>
      <div class="field"><label for="pool-goals">Acerto por equipe (pontos)</label><input id="pool-goals" name="goals" type="number" min="0" max="100" value="2" required></div>
      <div class="field full"><label><input name="showPicks" type="checkbox" checked> Mostrar palpites de outros participantes após o início da partida</label><span class="field-help">Antes do jogo, cada palpite permanece privado.</span></div>
      </div><div class="form-actions"><a class="btn btn-secondary" href="#explore">Cancelar</a><button type="submit" class="btn btn-primary">${icon("plus")} Criar bolão</button></div></form></section>`;
  }
  function poolPage(id) {
    const pool = getPool(decodeURIComponent(id));
    const user = currentUser();
    if (!pool || !pool.members.includes(user.id)) return `<div class="card empty-state"><strong>Bolão não encontrado</strong>Este bolão não existe ou você ainda não participa dele.<div style="margin-top:12px"><a class="btn btn-primary" href="#explore">Explorar bolões</a></div></div>`;
    state.currentPoolId = pool.id;
    selectedPoolId = pool.id;
    const isOwner = pool.ownerId === user.id || user.role === "admin";
    const matches = activeMatches(pool);
    return `<div class="page-heading"><div><div class="eyebrow">Disputa independente</div><h1>${esc(pool.name)}</h1><p class="subtitle">Acompanhe as partidas, palpites e classificação.</p></div><div class="hero-actions">${isOwner ? `<button class="btn btn-secondary" data-action="edit-pool" data-pool="${esc(pool.id)}">${icon("edit")} Editar</button>` : ""}<a class="btn btn-secondary" href="#ranking/${encodeURIComponent(pool.id)}">${icon("trophy")} Ranking</a></div></div>
      <section class="detail-hero"><span class="pool-emblem">${esc(pool.emoji || "⚽")}</span><div class="detail-copy"><h2>${esc(pool.name)}</h2><p>${esc(pool.description || "Sem descrição.")}</p><div class="detail-meta"><span class="tag">${pool.members.length} participantes</span><span class="tag">${pool.visibility === "private" ? `${icon("lock")} Privado` : "Público"}</span><span class="tag">${matches.length} partidas</span></div></div>${button(`${icon("copy")} Convidar`, "copy-invite", "btn-secondary btn-small", `data-pool="${esc(pool.id)}"`)}</section>
      <div class="dashboard-grid"><div class="stack"><section class="card"><div class="card-heading"><h2>Partidas do bolão</h2><a class="text-link" href="#picks/${encodeURIComponent(pool.id)}">Fazer palpites →</a></div><div class="match-list">${matches.length ? matches.map((match) => matchRow(match, pool, user.id)).join("") : '<div class="empty-state">O administrador ainda não adicionou partidas.</div>'}</div></section>
      <section class="card"><div class="card-heading"><h2>Participantes</h2><span class="tag">${pool.members.length} no bolão</span></div>${rankRows(pool, 10)}</section></div>
      <div class="stack"><section class="card"><div class="card-heading"><h2>Ranking do bolão</h2><a class="text-link" href="#ranking/${encodeURIComponent(pool.id)}">Completo →</a></div>${rankRows(pool, 5)}</section>
      <section class="card"><div class="card-heading"><h2>Regras de pontuação</h2>${isOwner ? `<button class="icon-button" title="Editar regras" data-action="edit-rules" data-pool="${esc(pool.id)}">${icon("edit")}</button>` : ""}</div><div class="settings-list"><div class="setting-row"><div><strong>Placar exato</strong></div><span class="tag tag-green">${pointSettings(pool).exact} pts</span></div><div class="setting-row"><div><strong>Resultado correto</strong></div><span class="tag">${pointSettings(pool).outcome} pts</span></div><div class="setting-row"><div><strong>Gols de cada equipe</strong></div><span class="tag">${pointSettings(pool).goals} pts</span></div><div class="setting-row"><div><strong>Palpites dos outros</strong></div><button class="switch${pool.settings.showPicks ? " on" : ""}" aria-label="Alternar visibilidade dos palpites" data-action="toggle-picks" data-pool="${esc(pool.id)}" ${isOwner ? "" : "disabled"}></button></div></div></section>
      <section class="card"><div class="card-heading"><h2>Código de convite</h2></div><p class="subtitle">Compartilhe este código para convidar participantes.</p><div class="filter-row" style="margin:12px 0 0"><code class="tag tag-green">${esc(pool.inviteCode)}</code>${button(`${icon("copy")} Copiar`, "copy-invite", "btn-secondary btn-small", `data-pool="${esc(pool.id)}"`)}</div></section></div></div>`;
  }
  function picksPage(poolId) {
    const user = currentUser();
    const joined = userPools(user.id);
    let pool = poolId ? getPool(decodeURIComponent(poolId)) : getPool(state.currentPoolId);
    if (!pool || !pool.members.includes(user.id)) pool = joined[0];
    if (!pool) return `<div class="page-heading"><div><div class="eyebrow">Na sua hora</div><h1>Meus palpites</h1><p class="subtitle">Entre em um bolão para começar a palpitar.</p></div></div><section class="card empty-state"><strong>Você ainda não participa de um bolão</strong>Explore as disputas disponíveis e faça seu primeiro palpite.<div style="margin-top:12px"><a class="btn btn-primary" href="#explore">Explorar bolões</a></div></section>`;
    selectedPoolId = pool.id;
    state.currentPoolId = pool.id;
    const search = searchTerm.toLocaleLowerCase("pt-BR");
    const matches = activeMatches(pool).filter((match) => !search || `${match.home} ${match.away} ${match.competition}`.toLocaleLowerCase("pt-BR").includes(search));
    return `<div class="page-heading"><div><div class="eyebrow">Seu momento de brilhar</div><h1>Meus palpites</h1><p class="subtitle">Escolha o placar de cada jogo antes do apito inicial.</p></div></div>
      <div class="filter-row"><div class="segmented">${joined.map((item) => `<button class="${item.id === pool.id ? "active" : ""}" data-action="select-pool" data-pool="${esc(item.id)}">${esc(item.name)}</button>`).join("")}</div><a class="text-link" href="#pool/${encodeURIComponent(pool.id)}">Ver bolão →</a></div>
      ${pool.settings.showPicks ? '<div class="privacy-note">🔒 Seus palpites são privados até o início de cada partida. Depois, os palpites dos participantes ficam visíveis.</div>' : '<div class="privacy-note">🔒 Seus palpites permanecem privados para os outros participantes.</div>'}
      <div class="stack">${matches.length ? matches.map((match) => {
        const prediction = state.predictions.find((item) => item.poolId === pool.id && item.matchId === match.id && item.userId === user.id);
        const locked = isLocked(match);
        const canSeeOthers = locked && pool.settings.showPicks;
        const otherPredictions = canSeeOthers ? state.predictions.filter((item) => item.poolId === pool.id && item.matchId === match.id && item.userId !== user.id) : [];
        return `<section class="card match-predict-card"><div class="card-heading"><div><span class="eyebrow">${esc(match.competition || "Partida")}</span><h2 style="margin-top:3px">${date(match.startsAt, { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</h2></div><span class="tag${match.status === "finished" ? " tag-green" : locked ? " tag-live" : ""}">${match.status === "finished" ? "Finalizado" : locked ? "Em andamento" : formatCountdown(match.startsAt)}</span></div>
        <form data-form="prediction" data-pool="${esc(pool.id)}" data-match="${esc(match.id)}"><div class="predict-teams"><div class="predict-team">${teamBadge(match.homeEmoji, match.homeShield)}<strong>${esc(match.home)}</strong></div><div class="score-inputs"><input aria-label="Gols de ${esc(match.home)}" name="homeScore" type="number" min="0" max="99" inputmode="numeric" value="${prediction ? prediction.homeScore : ""}" placeholder="–" required ${locked ? "disabled" : ""}><span>×</span><input aria-label="Gols de ${esc(match.away)}" name="awayScore" type="number" min="0" max="99" inputmode="numeric" value="${prediction ? prediction.awayScore : ""}" placeholder="–" required ${locked ? "disabled" : ""}></div><div class="predict-team">${teamBadge(match.awayEmoji, match.awayShield)}<strong>${esc(match.away)}</strong></div></div><div class="match-card-footer"><span>${prediction ? `Seu palpite: ${prediction.homeScore} × ${prediction.awayScore}${match.status === "finished" ? ` · ${scorePrediction(prediction, match, pool)} pontos` : ""}` : locked ? "Você não registrou um palpite antes do início." : "Palpite ainda não registrado"}</span>${locked ? (match.status === "finished" ? `<span class="result-score">Resultado: ${match.homeScore} × ${match.awayScore}</span>` : '<span class="tag tag-live">Palpites fechados</span>') : `<button class="btn ${prediction ? "btn-secondary" : "btn-primary"} btn-small" type="submit">${prediction ? "Atualizar palpite" : "Salvar palpite"}</button>`}</div></form>
        ${otherPredictions.length ? `<div class="settings-list section-spacer">${otherPredictions.map((item) => `<div class="setting-row"><div class="table-user">${avatar(getUser(item.userId))}<strong>${esc(getUser(item.userId)?.name || "Participante")}</strong></div><span class="tag">${item.homeScore} × ${item.awayScore}</span></div>`).join("")}</div>` : ""}
        </section>`;
      }).join("") : '<div class="card empty-state"><strong>Nenhuma partida disponível</strong>Este bolão ainda não tem jogos ou sua busca não encontrou resultados.</div>'}</div>`;
  }
  function rankingPage(poolId) {
    const user = currentUser();
    const pools = userPools(user.id);
    let pool = poolId ? getPool(decodeURIComponent(poolId)) : getPool(state.currentPoolId);
    if (!pool || !pool.members.includes(user.id)) pool = pools[0];
    if (!pool) return `<div class="page-heading"><div><div class="eyebrow">Quem está na frente?</div><h1>Classificação</h1><p class="subtitle">Participe de um bolão para acompanhar o ranking.</p></div></div><section class="card empty-state">Nenhum ranking disponível ainda. <a class="text-link" href="#explore">Explorar bolões →</a></section>`;
    selectedPoolId = pool.id;
    state.currentPoolId = pool.id;
    const rows = standings(pool);
    return `<div class="page-heading"><div><div class="eyebrow">Só os melhores</div><h1>Classificação</h1><p class="subtitle">O ranking é atualizado automaticamente após cada resultado.</p></div></div>
      <div class="filter-row"><div class="segmented">${pools.map((item) => `<button class="${item.id === pool.id ? "active" : ""}" data-action="select-ranking" data-pool="${esc(item.id)}">${esc(item.name)}</button>`).join("")}</div><span class="tag">${rows.length} participantes</span></div>
      <section class="card"><div class="card-heading"><h2>${esc(pool.name)}</h2><span class="tag tag-green">${rows.reduce((sum, row) => sum + row.completed, 0)} palpites concluídos</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>POSIÇÃO</th><th>PARTICIPANTE</th><th>PALPITES</th><th>ACERTOS</th><th>APROVEITAMENTO</th><th>PONTOS</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td><span class="position-badge ${index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : ""}">${index + 1}</span></td><td><span class="table-user">${avatar(row.user)}<strong>${esc(row.user.name)}${row.user.id === user.id ? " (você)" : ""}</strong></span></td><td>${row.completed}</td><td>${row.hits}${row.exact ? ` <span class="field-help">(${row.exact} exatos)</span>` : ""}</td><td>${row.accuracy}%</td><td class="result-score">${row.points} pts</td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<div class="empty-state">Ainda não há participantes neste bolão.</div>'}</section>
      <section class="card section-spacer"><div class="card-heading"><h2>Critérios de desempate</h2></div><p class="subtitle">Em caso de empate, priorizamos: maior quantidade de placares exatos, mais acertos e, por fim, ordem alfabética.</p></section>`;
  }
  function profilePage() {
    const user = currentUser();
    const pools = userPools(user.id);
    const predictions = state.predictions.filter((item) => item.userId === user.id).sort((a, b) => new Date(getMatch(b.matchId)?.startsAt || 0) - new Date(getMatch(a.matchId)?.startsAt || 0));
    const completed = predictions.filter((item) => getMatch(item.matchId)?.status === "finished");
    const hits = completed.filter((item) => scorePrediction(item, getMatch(item.matchId), getPool(item.poolId)) > 0).length;
    return `<div class="page-heading"><div><div class="eyebrow">Seu jogo, suas estatísticas</div><h1>Meu perfil</h1><p class="subtitle">Gerencie seus dados e veja sua trajetória no Vesti.</p></div></div>
      <section class="profile-head">${avatar(user)}<div><h2>${esc(user.name)}</h2><p>${esc(user.email)} · Membro desde ${date(user.createdAt || new Date(), { month: "long", year: "numeric" })}</p></div><button class="btn btn-secondary" data-action="edit-profile">${icon("edit")} Editar perfil</button></section>
      <div class="stats-grid">${statCard("Pontos totais", userTotalPoints(user.id), "medal")}${statCard("Palpites feitos", predictions.length, "ball")}${statCard("Acertos", hits, "trophy")}${statCard("Bolões", pools.length, "people")}</div>
      <div class="dashboard-grid"><section class="card"><div class="card-heading"><h2>Histórico de palpites</h2><span class="tag">${predictions.length} registrados</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>PARTIDA</th><th>BOLÃO</th><th>PALPITE</th><th>RESULTADO</th><th>PONTOS</th></tr></thead><tbody>${predictions.slice(0, 12).map((item) => { const match = getMatch(item.matchId); const pool = getPool(item.poolId); return match ? `<tr><td>${esc(match.home)} × ${esc(match.away)}<small class="field-help" style="display:block;margin-top:3px">${date(match.startsAt, { day: "2-digit", month: "short" })}</small></td><td>${esc(pool?.name || "—")}</td><td>${item.homeScore} × ${item.awayScore}</td><td>${match.status === "finished" ? `${match.homeScore} × ${match.awayScore}` : "Aguardando"}</td><td class="result-score">${scorePrediction(item, match, pool)} pts</td></tr>` : ""; }).join("")}</tbody></table>${predictions.length ? "" : '<div class="empty-state">Seus palpites aparecerão aqui.</div>'}</div></section>
      <section class="card"><div class="card-heading"><h2>Meus bolões</h2><a class="text-link" href="#explore">Explorar →</a></div><div class="pool-list">${pools.length ? pools.map((pool) => poolCard(pool, user.id)).join("") : '<div class="empty-state">Você ainda não participa de bolões.</div>'}</div></section></div>`;
  }
  function adminPage() {
    const user = currentUser();
    if (user.role !== "admin") return `<section class="card empty-state"><strong>Acesso restrito</strong>Somente administradores podem acessar esta página.<div style="margin-top:12px"><a class="btn btn-primary" href="#home">Voltar</a></div></section>`;
    const tabs = `<div class="admin-tabs">${[["matches", "Partidas"], ["teams", "Times"], ["pools", "Bolões"], ["users", "Usuários"]].map(([key, title]) => `<button class="btn ${adminTab === key ? "active" : "btn-secondary"} btn-small" data-action="admin-tab" data-tab="${key}">${title}</button>`).join("")}</div>`;
    let body = "";
    if (adminTab === "matches") {
      body = `<div class="card-heading"><h2>Partidas cadastradas</h2><button class="btn btn-primary btn-small" data-action="new-match">${icon("plus")} Nova partida</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>PARTIDA</th><th>COMPETIÇÃO</th><th>DATA</th><th>RESULTADO</th><th>AÇÕES</th></tr></thead><tbody>${state.matches.slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map((match) => `<tr><td>${esc(match.home)} × ${esc(match.away)}</td><td>${esc(match.competition || "—")}</td><td>${date(match.startsAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${match.status === "finished" ? `<span class="result-score">${match.homeScore} × ${match.awayScore}</span>` : '<span class="tag">Agendado</span>'}</td><td><button class="btn btn-secondary btn-small" data-action="edit-match" data-match="${esc(match.id)}">${match.status === "finished" ? "Corrigir resultado" : "Editar partida"}</button></td></tr>`).join("")}</tbody></table></div>`;
    } else if (adminTab === "teams") {
      body = `<div class="card-heading"><h2>Times e escudos</h2><span class="tag">${state.teams.length} times</span></div><p class="subtitle" style="margin-bottom:14px">Os times são cadastrados automaticamente ao criar ou editar uma partida. Você pode adicionar ou trocar o escudo aqui.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>TIME</th><th>ESCUDO</th><th>ENVIAR IMAGEM</th></tr></thead><tbody>${state.teams.map((team) => `<tr><td><span class="table-user">${teamBadge(team.emoji, team.shield)}<strong>${esc(team.name)}</strong></span></td><td>${team.shield ? "Cadastrado" : "Usando emoji"}</td><td><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Enviar escudo de ${esc(team.name)}" data-team-shield="${esc(team.id)}"></td></tr>`).join("")}</tbody></table></div>`;
    } else if (adminTab === "pools") {
      body = `<div class="card-heading"><h2>Bolões cadastrados</h2><span class="tag">${state.pools.length} bolões</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>BOLÃO</th><th>ORGANIZADOR</th><th>VISIBILIDADE</th><th>PARTICIPANTES</th><th>AÇÕES</th></tr></thead><tbody>${state.pools.map((pool) => `<tr><td>${esc(pool.emoji)} ${esc(pool.name)}</td><td>${esc(getUser(pool.ownerId)?.name || "—")}</td><td>${pool.visibility === "private" ? "Privado" : "Público"}</td><td>${pool.members.length}</td><td><button class="btn btn-secondary btn-small" data-action="edit-pool" data-pool="${esc(pool.id)}">Editar</button> <button class="btn btn-danger btn-small" data-action="delete-pool" data-pool="${esc(pool.id)}">Excluir</button></td></tr>`).join("")}</tbody></table></div>`;
    } else {
      body = `<div class="card-heading"><h2>Usuários</h2><span class="tag">${state.users.length} cadastrados</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>USUÁRIO</th><th>BOLÕES</th><th>PERMISSÃO</th><th>AÇÕES</th></tr></thead><tbody>${state.users.map((item) => `<tr><td><span class="table-user">${avatar(item)}<strong>${esc(item.name)}</strong></span></td><td>${userPools(item.id).length}</td><td>${item.role === "admin" ? '<span class="tag tag-green">Admin</span>' : '<span class="tag">Participante</span>'}</td><td>${item.id === user.id ? '<span class="field-help">Sua conta</span>' : `<button class="btn btn-secondary btn-small" data-action="toggle-admin" data-user="${esc(item.id)}">${item.role === "admin" ? "Remover admin" : "Tornar admin"}</button>`}</td></tr>`).join("")}</tbody></table></div>`;
    }
    return `<div class="page-heading"><div><div class="eyebrow">Gestão da plataforma</div><h1>Painel administrativo</h1><p class="subtitle">Gerencie partidas, usuários e bolões.</p></div></div>${tabs}<section class="card">${body}</section>`;
  }
  function render() {
    state = VestiStore.get();
    if (!configured) {
      app.innerHTML = `<main class="auth-content"><section class="auth-form"><div class="eyebrow">Configuração necessária</div><h1>Conecte seu projeto Supabase</h1><p>Copie <code>.env.example</code> para <code>.env.local</code>, configure a URL e a chave anon/public do projeto e reinicie o servidor.</p><p>Depois, execute <code>supabase/schema.sql</code> no SQL Editor do seu projeto. Instruções completas estão no README.</p></section></main>`;
      return;
    }
    if (loading) {
      app.innerHTML = `<main class="auth-content"><section class="auth-form"><div class="eyebrow">Vesti</div><h1>Conectando...</h1><p>Carregando sua sessão e os dados compartilhados do Supabase.</p></section></main>`;
      return;
    }
    const route = routeNow();
    const user = currentUser();
    if (!user && !["login", "register"].includes(route[0])) { go("login"); return; }
    if (user && ["login", "register"].includes(route[0])) { go("home"); return; }
    if (!user) { app.innerHTML = loginPage(route[0] === "register"); bindDynamicForms(); return; }
    let content;
    switch (route[0]) {
      case "explore": content = explorePage(); break;
      case "create": content = createPoolPage(); break;
      case "pool": content = poolPage(route[1]); break;
      case "picks": content = picksPage(route[1]); break;
      case "ranking": content = rankingPage(route[1]); break;
      case "profile": content = profilePage(); break;
      case "admin": content = adminPage(); break;
      default: content = dashboard();
    }
    app.innerHTML = shell(content, route);
    bindDynamicForms();
  }

  function showModal(title, content, submitLabel = "Confirmar", onSubmit = null) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${esc(title)}</h2><form id="modal-form" data-form="modal">${content}<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button><button type="submit" class="btn btn-primary">${esc(submitLabel)}</button></div></form></section>`;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector("input,select,textarea");
    if (input) input.focus();
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-action='close-modal']")) backdrop.remove();
    });
    app.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-team-shield]");
      const file = input?.files?.[0];
      if (!input || !file) return;
      run(() => VestiStore.uploadTeamShield(input.dataset.teamShield, file), "Escudo atualizado.");
    });
    backdrop.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        if (onSubmit && await onSubmit(formData) === false) return;
        backdrop.remove();
      } catch (error) {
        toast(error.message || "Não foi possível concluir a operação.", true);
      }
    });
  }
  function bindDynamicForms() {
    app.querySelectorAll('form[data-form]:not([data-bound])').forEach((form) => {
      form.dataset.bound = "true";
      form.addEventListener("submit", (event) => {
        handleForm(event).catch((error) => toast(error.message || "Não foi possível concluir a operação.", true));
      });
    });
  }
  async function handleForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const type = form.dataset.form;
    if (type === "modal") return;
    if (type === "login") {
      const email = String(formData.get("email")).trim().toLowerCase();
      await run(() => VestiStore.signIn(email, String(formData.get("password"))), "Login realizado com sucesso.", "home");
      return;
    }
    if (type === "register") {
      const email = String(formData.get("email")).trim().toLowerCase();
      const code = String(formData.get("inviteCode") || "").trim().toUpperCase();
      try {
        const result = await VestiStore.signUp(String(formData.get("name")).trim(), email, String(formData.get("password")), code);
        if (result.confirmed) {
          await refreshState();
          toast(result.joined ? "Conta criada e convite aplicado." : "Conta criada com sucesso.");
          go("home");
        } else {
          toast(code ? `Cadastro recebido. Confirme seu e-mail para entrar no bolão ${code}.` : "Cadastro recebido. Confirme seu e-mail para entrar.");
          go("login");
        }
      } catch (error) { toast(error.message, true); }
      return;
    }
    if (type === "create-pool") {
      try {
        const id = await VestiStore.createPool({
          name: String(formData.get("name")).trim(),
          description: String(formData.get("description") || "").trim(),
          emoji: String(formData.get("emoji") || "⚽"),
          visibility: String(formData.get("visibility")),
          exact: Number(formData.get("exact")),
          outcome: Number(formData.get("outcome")),
          goals: Number(formData.get("goals")),
          showPicks: formData.get("showPicks") === "on"
        });
        await refreshState();
        const pool = getPool(id);
        toast(`Bolão criado! Código: ${pool?.inviteCode || ""}`);
        go(`pool/${id}`);
      } catch (error) { toast(error.message, true); }
      return;
    }
    if (type === "prediction") {
      const pool = getPool(form.dataset.pool);
      const match = getMatch(form.dataset.match);
      if (!pool || !match || !pool.members.includes(currentUser().id)) return toast("Bolão ou partida não encontrado.", true);
      if (isLocked(match)) return toast("O prazo para palpites desta partida já encerrou.", true);
      const homeScore = Number(formData.get("homeScore"));
      const awayScore = Number(formData.get("awayScore"));
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) return toast("Informe um placar válido, entre 0 e 99 gols.", true);
      await run(() => VestiStore.savePrediction(pool.id, match.id, homeScore, awayScore), "Palpite salvo! Boa sorte.");
      return;
    }
    if (type === "profile") {
      const file = form.querySelector('input[type="file"]')?.files[0] || null;
      await run(() => VestiStore.updateProfile({
        name: String(formData.get("name")).trim(),
        file,
        password: String(formData.get("password") || "")
      }), "Perfil atualizado.");
      return;
    }
    if (type === "match") {
      const id = form.dataset.match;
      const existing = id ? getMatch(id) : null;
      const startsAt = new Date(String(formData.get("startsAt"))).toISOString();
      const homeScoreValue = String(formData.get("homeScore") ?? "").trim();
      const awayScoreValue = String(formData.get("awayScore") ?? "").trim();
      const finished = homeScoreValue !== "" && awayScoreValue !== "";
      if (finished && (!Number.isInteger(Number(homeScoreValue)) || !Number.isInteger(Number(awayScoreValue)) || Number(homeScoreValue) < 0 || Number(awayScoreValue) < 0)) return toast("Informe um resultado válido.", true);
      const data = { home: String(formData.get("home")).trim(), away: String(formData.get("away")).trim(), homeEmoji: String(formData.get("homeEmoji") || "⚽").trim(), awayEmoji: String(formData.get("awayEmoji") || "⚽").trim(), startsAt, status: finished ? "finished" : "upcoming", homeScore: finished ? Number(homeScoreValue) : null, awayScore: finished ? Number(awayScoreValue) : null, competition: String(formData.get("competition") || "").trim() };
      await run(() => VestiStore.saveMatch(data, existing?.id), finished ? "Resultado salvo. O ranking foi atualizado." : "Partida salva.");
      return;
    }
    if (type === "rules") {
      const pool = getPool(form.dataset.pool);
      if (!pool || !(pool.ownerId === currentUser().id || currentUser().role === "admin")) return toast("Você não pode alterar estas regras.", true);
      await run(() => VestiStore.updatePoolRules(pool.id, {
        exact: Number(formData.get("exact")),
        outcome: Number(formData.get("outcome")),
        goals: Number(formData.get("goals"))
      }), "Regras salvas e pontuações recalculadas.");
    }
  }

  function modalMatch(match = null) {
    const dateTimeLocal = (value) => {
      if (!value) return "";
      const d = new Date(value);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    };
    const poolAssignment = match ? "" : `<div class="field" style="margin-top:12px"><label>Adicionar esta partida aos bolões</label><div class="settings-list">${state.pools.map((pool) => `<label class="setting-row"><span><strong>${esc(pool.name)}</strong><span>${pool.visibility === "private" ? "Privado" : "Público"}</span></span><input name="poolIds" type="checkbox" value="${esc(pool.id)}" checked></label>`).join("")}</div><span class="field-help">Selecione em quais bolões esta partida e seus resultados aparecerão.</span></div>`;
    const content = `<div class="field"><label>Time da casa</label><input name="home" value="${esc(match?.home || "")}" required maxlength="48" placeholder="Ex.: Flamengo"></div><div class="field"><label>Time visitante</label><input name="away" value="${esc(match?.away || "")}" required maxlength="48" placeholder="Ex.: Palmeiras"></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Escudo casa (emoji)</label><input name="homeEmoji" value="${esc(match?.homeEmoji || "⚽")}" maxlength="8"></div><div class="field"><label>Escudo visitante (emoji)</label><input name="awayEmoji" value="${esc(match?.awayEmoji || "⚽")}" maxlength="8"></div></div><div class="field" style="margin-top:12px"><label>Competição / rodada</label><input name="competition" value="${esc(match?.competition || "")}" maxlength="60" placeholder="Ex.: Brasileirão • Rodada 12"></div><div class="field" style="margin-top:12px"><label>Data e horário</label><input name="startsAt" type="datetime-local" value="${dateTimeLocal(match?.startsAt)}" required></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Gols casa (deixe em branco para pendente)</label><input name="homeScore" type="number" min="0" max="99" value="${match?.status === "finished" ? match.homeScore : ""}"></div><div class="field"><label>Gols visitante</label><input name="awayScore" type="number" min="0" max="99" value="${match?.status === "finished" ? match.awayScore : ""}"></div></div>${poolAssignment}<p class="field-help" style="margin-top:10px">Ao registrar ou corrigir o resultado, os rankings dos bolões que contêm esta partida são recalculados automaticamente.</p>`;
    showModal(match ? "Editar partida e resultado" : "Adicionar partida", content, "Salvar partida", async (formData) => {
      const startsAt = String(formData.get("startsAt"));
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) { toast("Informe uma data e horário válidos.", true); return false; }
      const homeScoreValue = String(formData.get("homeScore") ?? "").trim();
      const awayScoreValue = String(formData.get("awayScore") ?? "").trim();
      if ((homeScoreValue === "") !== (awayScoreValue === "")) { toast("Informe os gols dos dois times ou deixe ambos vazios.", true); return false; }
      const finished = homeScoreValue !== "" && awayScoreValue !== "";
      const data = {
        home: String(formData.get("home")).trim(),
        away: String(formData.get("away")).trim(),
        homeEmoji: String(formData.get("homeEmoji") || "⚽").trim(),
        awayEmoji: String(formData.get("awayEmoji") || "⚽").trim(),
        startsAt: new Date(startsAt).toISOString(),
        status: finished ? "finished" : "upcoming",
        homeScore: finished ? Number(homeScoreValue) : null,
        awayScore: finished ? Number(awayScoreValue) : null,
        competition: String(formData.get("competition") || "").trim()
      };
      await VestiStore.saveMatch(data, match?.id, formData.getAll("poolIds"));
      await refreshState();
      toast(finished ? "Resultado salvo. O ranking foi atualizado." : "Partida salva.");
      return true;
    });
  }
  function editProfileModal() {
    const user = currentUser();
    const content = `<div id="profile-modal-form"><div class="field"><label>Nome</label><input name="name" value="${esc(user.name)}" required minlength="2" maxlength="60"></div><div class="field" style="margin-top:12px"><label>Foto de perfil</label><div class="avatar-upload">${avatar(user)}<input name="avatarFile" type="file" accept="image/*" aria-label="Escolher imagem"></div><span class="field-help">Imagem JPG ou PNG de até 1 MB.</span></div><div class="field" style="margin-top:12px"><label>Nova senha <span class="field-help">(opcional)</span></label><input name="password" type="password" minlength="6" placeholder="Mínimo de 6 caracteres"></div></div>`;
    showModal("Editar perfil", content, "Salvar alterações", async (formData) => {
      const form = document.getElementById("modal-form");
      if (!form.reportValidity()) return false;
      await VestiStore.updateProfile({
        name: String(formData.get("name")).trim(),
        password: String(formData.get("password") || ""),
        file: form.querySelector('input[type="file"]').files[0] || null
      });
      await refreshState();
      toast("Perfil atualizado.");
      return true;
    });
  }
  function editRulesModal(poolId) {
    const pool = getPool(poolId);
    if (!pool) return;
    const rules = pointSettings(pool);
    const content = `<div class="field"><label>Placar exato (pontos)</label><input name="exact" type="number" min="0" max="100" value="${rules.exact}" required></div><div class="field" style="margin-top:12px"><label>Resultado correto (pontos)</label><input name="outcome" type="number" min="0" max="100" value="${rules.outcome}" required></div><div class="field" style="margin-top:12px"><label>Acerto por equipe (pontos)</label><input name="goals" type="number" min="0" max="100" value="${rules.goals}" required></div><p style="margin-top:12px">O ranking será atualizado com as novas regras assim que você salvar.</p>`;
    showModal("Regras de pontuação", content, "Salvar regras", async (formData) => {
      await VestiStore.updatePoolRules(poolId, {
        exact: Number(formData.get("exact")),
        outcome: Number(formData.get("outcome")),
        goals: Number(formData.get("goals"))
      });
      await refreshState();
      toast("Regras atualizadas.");
      return true;
    });
  }
  function joinPoolModal() {
    const content = `<p>Digite o código de convite compartilhado pelo organizador do bolão.</p><div class="field"><label for="invite-code-input">Código do convite</label><input id="invite-code-input" name="code" required maxlength="24" placeholder="Ex.: código do convite" style="text-transform:uppercase"></div>`;
    showModal("Entrar em um bolão", content, "Encontrar bolão", async (formData) => {
      const code = String(formData.get("code")).trim().toUpperCase();
      await VestiStore.joinPoolByCode(code);
      state = await VestiStore.refresh();
      const pool = state.pools.find((item) => item.inviteCode.toUpperCase() === code);
      toast(pool ? `Você entrou em ${pool.name}!` : "Você entrou no bolão.");
      if (pool) go(`pool/${pool.id}`);
      render();
      return true;
    });
  }
  function notificationsModal() {
    const user = currentUser();
    const upcoming = userPools(user.id).flatMap((pool) => pool.matchIds.map(getMatch).filter((match) => match && match.status === "upcoming" && !isLocked(match))).filter((match, index, list) => list.findIndex((item) => item.id === match.id) === index).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 5);
    const content = upcoming.length ? upcoming.map((match) => `<div class="notification">${esc(match.home)} × ${esc(match.away)}<small>Começa ${date(match.startsAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · ${formatCountdown(match.startsAt)}</small></div>`).join("") : "<p>Você está em dia! Não há partidas futuras nos seus bolões.</p>";
    showModal("Próximas partidas", content, "Ver meus palpites", () => { go("picks"); return true; });
  }
  function copyInvite(poolId) {
    const pool = getPool(poolId || state.currentPoolId);
    if (!pool) return toast("Bolão não encontrado.", true);
    const text = `${pool.name} — entre no Vesti com o código ${pool.inviteCode}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast("Convite copiado!")).catch(() => { window.prompt("Copie o código de convite:", pool.inviteCode); });
    else window.prompt("Copie o código de convite:", pool.inviteCode);
  }
  async function joinPublicPool(poolId) {
    const pool = getPool(poolId);
    if (!pool || pool.visibility !== "public") return toast("Este bolão não está disponível para entrada pública.", true);
    await run(() => VestiStore.joinPublicPool(pool.id), `Você entrou em ${pool.name}!`, `pool/${pool.id}`);
  }
  async function handleAction(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "logout") {
      try { await VestiStore.signOut(); state = VestiStore.get(); go("login"); render(); }
      catch (error) { toast(error.message, true); }
    }
    else if (action === "join-pool") joinPoolModal();
    else if (action === "copy-invite") copyInvite(target.dataset.pool);
    else if (action === "join-public") joinPublicPool(target.dataset.pool);
    else if (action === "edit-profile") editProfileModal();
    else if (action === "notifications") notificationsModal();
    else if (action === "new-match") modalMatch();
    else if (action === "edit-match") modalMatch(getMatch(target.dataset.match));
    else if (action === "edit-pool") editPoolModal(target.dataset.pool);
    else if (action === "delete-pool") {
      const pool = getPool(target.dataset.pool);
      if (!pool || !(pool.ownerId === currentUser().id || currentUser().role === "admin")) return toast("Somente o organizador pode excluir este bolão.", true);
      showModal("Excluir bolão", `<p>O bolão <strong>${esc(pool.name)}</strong>, seus palpites e participantes serão removidos permanentemente. Esta ação não pode ser desfeita.</p>`, "Excluir bolão", async () => {
        await VestiStore.deletePool(pool.id);
        await refreshState();
        toast("Bolão excluído.");
        go("admin");
        return true;
      });
    }
    else if (action === "edit-rules") editRulesModal(target.dataset.pool);
    else if (action === "admin-tab") { adminTab = target.dataset.tab; render(); }
    else if (action === "select-pool") { selectedPoolId = target.dataset.pool; state.currentPoolId = selectedPoolId; go(`picks/${encodeURIComponent(target.dataset.pool)}`); }
    else if (action === "select-ranking") { selectedPoolId = target.dataset.pool; state.currentPoolId = selectedPoolId; go(`ranking/${encodeURIComponent(target.dataset.pool)}`); }
    else if (action === "toggle-picks") {
      const pool = getPool(target.dataset.pool);
      if (!pool || !(pool.ownerId === currentUser().id || currentUser().role === "admin")) return toast("Somente o organizador pode alterar esta opção.", true);
      await run(() => VestiStore.updateRevealPicks(pool.id, !pool.settings.showPicks));
    } else if (action === "toggle-admin") {
      const user = getUser(target.dataset.user);
      if (!user || user.id === currentUser().id) return;
      const role = user.role === "admin" ? "user" : "admin";
      await run(() => VestiStore.setProfileRole(user.id, role), `Permissão de ${user.name} atualizada.`);
    } else if (action === "close-modal") target.closest(".modal-backdrop")?.remove();
  }
  app.addEventListener("click", (event) => {
    handleAction(event).catch((error) => toast(error.message || "Não foi possível concluir a operação.", true));
  });
  app.addEventListener("input", (event) => {
    if (event.target.matches('.search-box input')) {
      searchTerm = event.target.value;
      const route = routeNow()[0];
      if (route === "explore" || route === "picks") {
        const cursor = event.target.selectionStart;
        render();
        const search = app.querySelector(".search-box input");
        if (search) { search.focus(); search.setSelectionRange(cursor, cursor); }
      }
    }
  });
  window.addEventListener("hashchange", render);
  render();
  VestiStore.initialize(async () => {
    loading = true;
    render();
    try {
      state = await VestiStore.refresh();
      loading = false;
      render();
    } catch (error) {
      loading = false;
      toast(error.message || "Não foi possível carregar os dados do Supabase.", true);
      render();
    }
  }, () => {
    state = VestiStore.get();
    render();
  }).then((result) => {
    configured = result.configured;
    state = result.state;
    loading = false;
    render();
  }).catch((error) => {
    configured = true;
    loading = false;
    state = VestiStore.get();
    toast(error.message || "Não foi possível conectar ao Supabase.", true);
    render();
  });
})();
