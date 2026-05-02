const http = require('node:http');
const crypto = require('node:crypto');
const { db, defaultCampaignSettings, now, toCampaign, toCombatInitiative, toCombatLog, toCombatSession, toEntity, toLobbyParticipant, toLobbySettings, toSessionRun } = require('./db');
const { createToken, hashPassword, verifyPassword, verifyToken } = require('./auth');

const port = Number(process.env.PORT || 3001);
const maxBodyBytes = 1024 * 1024;
const defaultAllowedOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];
const lobbyEventClients = new Map();

function isDevelopmentFrontendOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    const isDevelopmentPort = Boolean(url.port) && Number(url.port) >= 1024;
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isPrivateLan =
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname);

    return url.protocol === 'http:' && isDevelopmentPort && (isLocalhost || isPrivateLan);
  } catch {
    return false;
  }
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.RPGBOT_ALLOWED_ORIGIN;

  if (!configuredOrigins) {
    return defaultAllowedOrigins;
  }

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function sendJson(request, response, statusCode, data) {
  const requestOrigin = request.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = requestOrigin && (allowedOrigins.includes(requestOrigin) || isDevelopmentFrontendOrigin(requestOrigin))
    ? requestOrigin
    : allowedOrigins[0];

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Lobby-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
  });
  response.end(JSON.stringify(data));
}

function sendEventHeaders(request, response) {
  const requestOrigin = request.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = requestOrigin && (allowedOrigins.includes(requestOrigin) || isDevelopmentFrontendOrigin(requestOrigin))
    ? requestOrigin
    : allowedOrigins[0];

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin'
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error('Payload too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function routePath(request) {
  return new URL(request.url, `http://${request.headers.host}`).pathname;
}

function routeUrl(request) {
  return new URL(request.url, `http://${request.headers.host}`);
}

function getBearerToken(request) {
  const header = request.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return '';
  }

  return header.slice('Bearer '.length);
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function requireUser(request) {
  const payload = verifyToken(getBearerToken(request));

  if (!payload) {
    return null;
  }

  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null;
}

function campaignBelongsToUser(campaignId, userId) {
  return db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND owner_user_id = ?')
    .get(campaignId, userId);
}

function campaignCanBeManagedByUser(campaignId, userId) {
  const owned = campaignBelongsToUser(campaignId, userId);

  if (owned) {
    return owned;
  }

  return db
    .prepare(`
      SELECT campaigns.*
      FROM campaigns
      JOIN campaign_gm_members ON campaign_gm_members.campaign_id = campaigns.id
      WHERE campaigns.id = ? AND campaign_gm_members.user_id = ?
    `)
    .get(campaignId, userId);
}

function entityBelongsToUser(entityId, userId) {
  return db
    .prepare(`
      SELECT entities.*
      FROM entities
      JOIN campaigns ON campaigns.id = entities.campaign_id
      WHERE entities.id = ? AND campaigns.owner_user_id = ?
    `)
    .get(entityId, userId);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function normalizeEntityBody(body) {
  const baseState = body.baseState || {};
  const maxHp = Math.max(1, Number(baseState.maxHp || 1));

  return {
    type: body.type || 'NPC',
    visibility: body.visibility || 'private',
    playerCanEdit: Boolean(body.playerCanEdit),
    baseState: {
      name: String(baseState.name || 'Ficha sem nome'),
      maxHp,
      abilityTiming: ['instant', 'perRound'].includes(String(baseState.abilityTiming)) ? String(baseState.abilityTiming) : 'instant',
      abilityDamage: Math.max(0, Number(baseState.abilityDamage || 0)),
      abilityDamageType: String(baseState.abilityDamageType || ''),
      abilityDurationRounds: Math.max(0, Number(baseState.abilityDurationRounds || 0)),
      resistances: Array.isArray(baseState.resistances) ? baseState.resistances : [],
      weaknesses: Array.isArray(baseState.weaknesses) ? baseState.weaknesses : [],
      imageUrl: String(baseState.imageUrl || ''),
      publicNotes: String(baseState.publicNotes || ''),
      gmNotes: String(baseState.gmNotes || ''),
      customFields: Array.isArray(baseState.customFields) ? baseState.customFields : []
    },
    sessionState: {
      currentHp: Number(body.sessionState?.currentHp ?? maxHp),
      status: String(body.sessionState?.status || 'Ativo'),
      conditions: Array.isArray(body.sessionState?.conditions) ? body.sessionState.conditions : [],
      mana: Number(body.sessionState?.mana ?? 0),
      maxMana: Number(body.sessionState?.maxMana ?? 0),
      resources: Array.isArray(body.sessionState?.resources) ? body.sessionState.resources : [],
      modifiers: Array.isArray(body.sessionState?.modifiers) ? body.sessionState.modifiers : [],
      isVisibleToPlayers: Boolean(body.sessionState?.isVisibleToPlayers)
    }
  };
}

function normalizeSessionStatePatch(body) {
  const sessionState = body.sessionState && typeof body.sessionState === 'object' ? body.sessionState : {};
  const patch = {};

  if (sessionState.currentHp !== undefined) {
    patch.currentHp = Number(sessionState.currentHp);
  }

  if (sessionState.status !== undefined) {
    patch.status = String(sessionState.status || 'Ativo');
  }

  if (sessionState.mana !== undefined) {
    patch.mana = Math.max(0, Number(sessionState.mana || 0));
  }

  if (sessionState.maxMana !== undefined) {
    patch.maxMana = Math.max(0, Number(sessionState.maxMana || 0));
  }

  if (Array.isArray(sessionState.conditions)) {
    patch.conditions = sessionState.conditions.map((condition) => ({
      id: String(condition.id || crypto.randomUUID()),
      name: String(condition.name || '').trim(),
      durationTurns: Number(condition.durationTurns || 0),
      isPublic: condition.isPublic !== false
    })).filter((condition) => condition.name);
  }

  if (Array.isArray(sessionState.resources)) {
    patch.resources = sessionState.resources.map((resource) => ({
      id: String(resource.id || crypto.randomUUID()),
      name: String(resource.name || '').trim(),
      current: Number(resource.current || 0),
      max: Number(resource.max || 0),
      isPublic: resource.isPublic !== false
    })).filter((resource) => resource.name);
  }

  if (Array.isArray(sessionState.modifiers)) {
    patch.modifiers = sessionState.modifiers.map((modifier) => ({
      id: String(modifier.id || crypto.randomUUID()),
      name: String(modifier.name || '').trim(),
      value: String(modifier.value || '').trim(),
      isPublic: modifier.isPublic !== false
    })).filter((modifier) => modifier.name || modifier.value);
  }

  return patch;
}

function normalizeCombatLogBody(body) {
  return {
    id: String(body.id || crypto.randomUUID()),
    entityId: String(body.entityId || ''),
    entityName: String(body.entityName || 'Ficha'),
    action: body.action === 'heal' ? 'heal' : 'damage',
    requestedAmount: Number(body.requestedAmount || 0),
    finalAmount: Number(body.finalAmount || 0),
    damageType: String(body.damageType || ''),
    hpBefore: Number(body.hpBefore || 0),
    hpAfter: Number(body.hpAfter || 0),
    note: String(body.note || ''),
    createdAt: String(body.createdAt || now())
  };
}

function normalizeCampaignSettings(settings, systemKey) {
  const base = defaultCampaignSettings(systemKey);
  const next = settings && typeof settings === 'object' ? settings : {};

  return {
    ...base,
    ...next,
    system: next.system || systemKey,
    damageRules: {
      ...base.damageRules,
      ...(next.damageRules || {})
    },
    lobbyVisibility: {
      ...base.lobbyVisibility,
      ...(next.lobbyVisibility || {})
    },
    damageTypes: Array.isArray(next.damageTypes) ? next.damageTypes : base.damageTypes,
    encounters: Array.isArray(next.encounters) ? next.encounters : base.encounters,
    sessions: Array.isArray(next.sessions) ? next.sessions : base.sessions,
    templates: Array.isArray(next.templates) ? next.templates : base.templates,
    loreNodes: Array.isArray(next.loreNodes) ? next.loreNodes : base.loreNodes,
    loreLinks: Array.isArray(next.loreLinks) ? next.loreLinks : base.loreLinks,
    isConfigured: Boolean(next.isConfigured)
  };
}

function normalizeVisibility(value) {
  const visibility = String(value || 'private');
  const aliases = {
    public: 'publicSheet',
    prepared: 'private',
    imageAndName: 'nameAndImage'
  };
  const allowed = ['private', 'imageOnly', 'nameAndImage', 'publicSheet'];
  const normalized = aliases[visibility] || visibility;

  return allowed.includes(normalized) ? normalized : 'private';
}

function getOrCreateLobbySettings(campaignId) {
  const current = db.prepare('SELECT * FROM campaign_lobby_settings WHERE campaign_id = ?').get(campaignId);

  if (current) {
    return current;
  }

  const timestamp = now();

  db.prepare(`
    INSERT INTO campaign_lobby_settings (campaign_id, password_hash, max_participants, is_enabled, updated_at)
    VALUES (?, '', 10, 1, ?)
  `).run(campaignId, timestamp);

  return db.prepare('SELECT * FROM campaign_lobby_settings WHERE campaign_id = ?').get(campaignId);
}

function getActiveSessionRun(campaignId) {
  return db
    .prepare("SELECT * FROM session_runs WHERE campaign_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
    .get(campaignId) || null;
}

function createSessionRun(campaignId) {
  const timestamp = now();
  const sessionRun = {
    id: crypto.randomUUID(),
    campaignId,
    status: 'active',
    startedAt: timestamp,
    endedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.prepare(`
    INSERT INTO session_runs (id, campaign_id, status, started_at, ended_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionRun.id,
    sessionRun.campaignId,
    sessionRun.status,
    sessionRun.startedAt,
    sessionRun.endedAt,
    sessionRun.createdAt,
    sessionRun.updatedAt
  );

  return db.prepare('SELECT * FROM session_runs WHERE id = ?').get(sessionRun.id);
}

function getOrCreateGmLobbyParticipant(campaignId, user) {
  const id = `gm-${campaignId}-${user.id}`;
  const tokenHash = hashSecret(id);
  const current = db.prepare('SELECT * FROM lobby_participants WHERE id = ?').get(id);
  const timestamp = now();

  if (current) {
    db.prepare('UPDATE lobby_participants SET last_seen_at = ? WHERE id = ?').run(timestamp, id);
    return db.prepare('SELECT * FROM lobby_participants WHERE id = ?').get(id);
  }

  db.prepare(`
    INSERT INTO lobby_participants (id, campaign_id, nick, session_token_hash, is_guest, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, campaignId, user.name || 'GM', tokenHash, timestamp, timestamp);

  return db.prepare('SELECT * FROM lobby_participants WHERE id = ?').get(id);
}

function getLobbyParticipantFromRequest(request, participantId) {
  const tokenHash = hashSecret(request.headers['x-lobby-token'] || '');

  if (!participantId || !tokenHash) {
    return null;
  }

  return db
    .prepare('SELECT * FROM lobby_participants WHERE id = ? AND session_token_hash = ?')
    .get(participantId, tokenHash) || null;
}

function getLobbyParticipantByToken(participantId, token) {
  const tokenHash = hashSecret(token || '');

  if (!participantId || !tokenHash) {
    return null;
  }

  return db
    .prepare('SELECT * FROM lobby_participants WHERE id = ? AND session_token_hash = ?')
    .get(participantId, tokenHash) || null;
}

function getEntityVisibility(entity, participantId) {
  const participantRule = db
    .prepare('SELECT visibility FROM entity_visibility_rules WHERE entity_id = ? AND participant_id = ?')
    .get(entity.id, participantId);

  if (participantRule) {
    return normalizeVisibility(participantRule.visibility);
  }

  return normalizeVisibility(entity.visibility);
}

function sanitizeEntityForLobby(entity, participantId) {
  const assignment = db
    .prepare('SELECT * FROM entity_assignments WHERE entity_id = ? AND participant_id = ?')
    .get(entity.id, participantId);
  const visibility = assignment ? 'publicSheet' : getEntityVisibility(entity, participantId);

  if (visibility === 'private') {
    return null;
  }

  const publicBaseState = {
    name: entity.baseState.name,
    maxHp: entity.baseState.maxHp,
    imageUrl: entity.baseState.imageUrl,
    publicNotes: entity.baseState.publicNotes || '',
    customFields: Array.isArray(entity.baseState.customFields) ? entity.baseState.customFields : []
  };

  if (visibility === 'imageOnly') {
    return {
      id: entity.id,
      campaignId: entity.campaignId,
      type: entity.type,
      visibility,
      canEditSession: false,
      baseState: { imageUrl: publicBaseState.imageUrl },
      sessionState: null
    };
  }

  if (visibility === 'nameAndImage') {
    return {
      id: entity.id,
      campaignId: entity.campaignId,
      type: entity.type,
      visibility,
      canEditSession: false,
      baseState: {
        name: publicBaseState.name,
        imageUrl: publicBaseState.imageUrl
      },
      sessionState: null
    };
  }

  return {
    id: entity.id,
    campaignId: entity.campaignId,
    type: entity.type,
    visibility,
    canEditSession: Boolean(assignment?.can_edit_session),
    baseState: publicBaseState,
    sessionState: entity.sessionState,
    updatedAt: entity.updatedAt
  };
}

function sanitizeLoreForLobby(settings, participantId) {
  const nodes = Array.isArray(settings.loreNodes) ? settings.loreNodes : [];
  const visibleNodes = nodes.filter((node) =>
    node.publishedToLobby === true ||
    node.isPublishedToLobby === true ||
    (Array.isArray(node.visibleToParticipantIds) && node.visibleToParticipantIds.includes(participantId)));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const links = (Array.isArray(settings.loreLinks) ? settings.loreLinks : [])
    .filter((link) => visibleIds.has(link.fromId) && visibleIds.has(link.toId));

  return {
    loreNodes: visibleNodes,
    loreLinks: links
  };
}

function sanitizeBoardForLobby(settings, activeCombat) {
  if (!activeCombat) {
    return null;
  }

  const sessions = Array.isArray(settings.sessions) ? settings.sessions : [];
  const legacyEncounters = Array.isArray(settings.encounters) ? settings.encounters : [];
  const encounters = [
    ...legacyEncounters,
    ...sessions.flatMap((session) => Array.isArray(session.encounters) ? session.encounters : [])
  ];
  const encounter = encounters.find((item) =>
    item &&
    item.name === activeCombat.name &&
    item.board &&
    item.board.visibility === 'public');

  if (!encounter) {
    return null;
  }

  return {
    encounterId: String(encounter.id || ''),
    encounterName: String(encounter.name || activeCombat.name),
    width: Math.max(1, Number(encounter.board.width || 8)),
    height: Math.max(1, Number(encounter.board.height || 6)),
    positions: encounter.board.positions && typeof encounter.board.positions === 'object'
      ? encounter.board.positions
      : {},
    roundCounters: Array.isArray(encounter.roundCounters)
      ? encounter.roundCounters
        .filter((counter) => counter && counter.visibility === 'public')
        .map((counter) => ({
          id: String(counter.id || ''),
          name: String(counter.name || ''),
          rounds: Math.max(1, Number(counter.rounds || 1)),
          visibility: 'public'
        }))
      : []
  };
}

function buildLobbyState(campaignRow, participantRow) {
  const campaign = toCampaign(campaignRow);
  const participant = toLobbyParticipant(participantRow);
  const activeCombatRow = campaign.activeCombatId
    ? db.prepare('SELECT * FROM combat_sessions WHERE id = ? AND campaign_id = ?').get(campaign.activeCombatId, campaign.id)
    : null;
  const activeCombat = activeCombatRow ? toCombatSession(activeCombatRow) : null;
  const entities = db
    .prepare('SELECT * FROM entities WHERE campaign_id = ? ORDER BY updated_at DESC')
    .all(campaign.id)
    .map(toEntity)
    .map((entity) => sanitizeEntityForLobby(entity, participant.id))
    .filter(Boolean);
  const lore = sanitizeLoreForLobby(campaign.settings, participant.id);
  const publicBoard = sanitizeBoardForLobby(campaign.settings, activeCombat);
  const initiatives = db
    .prepare('SELECT * FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ? AND participant_id = ? ORDER BY value DESC, updated_at ASC')
    .all(campaign.id, campaign.activeCombatId || '', participant.id)
    .map(toCombatInitiative);

  return {
    participant,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      phase: campaign.phase,
      activeCombatId: campaign.activeCombatId,
      activeCombatName: campaign.activeCombatName
    },
    activeCombat,
    entities,
    lore,
    publicBoard,
    initiatives,
    serverTime: now()
  };
}

function sendLobbyStateEvent(client) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(client.campaignId);
  const participant = db.prepare('SELECT * FROM lobby_participants WHERE id = ?').get(client.participantId);

  if (!campaign || !participant || client.response.destroyed) {
    return false;
  }

  client.response.write(`event: state\ndata: ${JSON.stringify(buildLobbyState(campaign, participant))}\n\n`);
  return true;
}

function addLobbyEventClient(campaignId, client) {
  const clients = lobbyEventClients.get(campaignId) || new Set();
  clients.add(client);
  lobbyEventClients.set(campaignId, clients);

  client.response.on('close', () => {
    clearInterval(client.keepAlive);
    clients.delete(client);

    if (clients.size === 0) {
      lobbyEventClients.delete(campaignId);
    }
  });
}

function broadcastLobby(campaignId) {
  const clients = lobbyEventClients.get(campaignId);

  if (!clients) {
    return;
  }

  for (const client of [...clients]) {
    if (!sendLobbyStateEvent(client)) {
      clients.delete(client);
    }
  }

  if (clients.size === 0) {
    lobbyEventClients.delete(campaignId);
  }
}

async function handleAuthRegister(request, response) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim();
  const password = String(body.password || '');

  if (!email || !name || !validatePassword(password)) {
    sendJson(request, response, 400, { error: 'Informe nome, email e senha com pelo menos 8 caracteres.' });
    return;
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existingUser) {
    sendJson(request, response, 409, { error: 'Email ja cadastrado.' });
    return;
  }

  const timestamp = now();
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    password_hash: hashPassword(password),
    created_at: timestamp
  };

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.name, user.password_hash, user.created_at);

  sendJson(request, response, 201, {
    user: publicUser(user),
    token: createToken(user)
  });
}

async function handleAuthLogin(request, response) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    sendJson(request, response, 404, { error: 'Email nao encontrado.' });
    return;
  }

  if (!verifyPassword(password, user.password_hash)) {
    sendJson(request, response, 401, { error: 'Senha incorreta.' });
    return;
  }

  sendJson(request, response, 200, {
    user: publicUser(user),
    token: createToken(user)
  });
}

async function handleRequest(request, response) {
  const path = routePath(request);
  const method = request.method || 'GET';

  if (method === 'OPTIONS') {
    sendJson(request, response, 204, {});
    return;
  }

  if (method === 'GET' && path === '/api/health') {
    sendJson(request, response, 200, { ok: true, service: 'rpgbot-backend' });
    return;
  }

  if (method === 'POST' && path === '/api/auth/register') {
    await handleAuthRegister(request, response);
    return;
  }

  if (method === 'POST' && path === '/api/auth/login') {
    await handleAuthLogin(request, response);
    return;
  }

  if (method === 'POST' && path === '/api/auth/discord') {
    sendJson(request, response, 501, { error: 'Login com Discord ainda nao configurado.' });
    return;
  }

  const lobbyJoinMatch = path.match(/^\/api\/lobby\/campaigns\/([^/]+)\/join$/);

  if (lobbyJoinMatch && method === 'POST') {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(lobbyJoinMatch[1]);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const settings = getOrCreateLobbySettings(campaign.id);

    if (!settings.is_enabled) {
      sendJson(request, response, 403, { error: 'Lobby fechado pelo GM.' });
      return;
    }

    if (!['session', 'combat', 'paused'].includes(campaign.phase)) {
      sendJson(request, response, 403, { error: 'A sessao ainda nao foi iniciada pelo GM.' });
      return;
    }

    const body = await readBody(request);
    const nick = String(body.nick || '').trim();
    const password = String(body.password || '');

    if (!nick) {
      sendJson(request, response, 400, { error: 'Informe um nick para entrar no lobby.' });
      return;
    }

    if (!settings.password_hash || settings.password_hash !== hashSecret(password)) {
      sendJson(request, response, 401, { error: 'Senha do lobby incorreta.' });
      return;
    }

    const participantCount = db
      .prepare('SELECT COUNT(*) AS total FROM lobby_participants WHERE campaign_id = ?')
      .get(campaign.id).total;

    if (participantCount >= settings.max_participants) {
      sendJson(request, response, 403, { error: 'Lobby cheio.' });
      return;
    }

    const timestamp = now();
    const token = crypto.randomBytes(32).toString('base64url');
    const participant = {
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      nick,
      sessionTokenHash: hashSecret(token),
      isGuest: true,
      createdAt: timestamp,
      lastSeenAt: timestamp
    };

    db.prepare(`
      INSERT INTO lobby_participants (id, campaign_id, nick, session_token_hash, is_guest, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      participant.id,
      participant.campaignId,
      participant.nick,
      participant.sessionTokenHash,
      participant.isGuest ? 1 : 0,
      participant.createdAt,
      participant.lastSeenAt
    );

    sendJson(request, response, 201, {
      participant: {
        id: participant.id,
        campaignId: participant.campaignId,
        nick: participant.nick,
        isGuest: participant.isGuest,
        createdAt: participant.createdAt,
        lastSeenAt: participant.lastSeenAt
      },
      lobbyToken: token,
      state: buildLobbyState(campaign, db.prepare('SELECT * FROM lobby_participants WHERE id = ?').get(participant.id))
    });
    broadcastLobby(campaign.id);
    return;
  }

  const lobbyStateMatch = path.match(/^\/api\/lobby\/participants\/([^/]+)\/state$/);

  if (lobbyStateMatch && method === 'GET') {
    const participant = getLobbyParticipantFromRequest(request, lobbyStateMatch[1]);

    if (!participant) {
      sendJson(request, response, 401, { error: 'Sessao de lobby invalida.' });
      return;
    }

    db.prepare('UPDATE lobby_participants SET last_seen_at = ? WHERE id = ?').run(now(), participant.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(participant.campaign_id);
    sendJson(request, response, 200, { state: buildLobbyState(campaign, participant) });
    return;
  }

  const lobbyEventsMatch = path.match(/^\/api\/lobby\/participants\/([^/]+)\/events$/);

  if (lobbyEventsMatch && method === 'GET') {
    const url = routeUrl(request);
    const participant = getLobbyParticipantByToken(lobbyEventsMatch[1], url.searchParams.get('token'));

    if (!participant) {
      sendJson(request, response, 401, { error: 'Sessao de lobby invalida.' });
      return;
    }

    sendEventHeaders(request, response);
    const client = {
      campaignId: participant.campaign_id,
      participantId: participant.id,
      response,
      keepAlive: setInterval(() => response.write(': keep-alive\n\n'), 25000)
    };
    addLobbyEventClient(participant.campaign_id, client);
    sendLobbyStateEvent(client);
    return;
  }

  const lobbySessionEntityMatch = path.match(/^\/api\/lobby\/participants\/([^/]+)\/entities\/([^/]+)\/session$/);

  if (lobbySessionEntityMatch && method === 'PATCH') {
    const participant = getLobbyParticipantFromRequest(request, lobbySessionEntityMatch[1]);

    if (!participant) {
      sendJson(request, response, 401, { error: 'Sessao de lobby invalida.' });
      return;
    }

    const assignment = db
      .prepare('SELECT * FROM entity_assignments WHERE participant_id = ? AND entity_id = ? AND can_edit_session = 1')
      .get(participant.id, lobbySessionEntityMatch[2]);

    if (!assignment) {
      sendJson(request, response, 403, { error: 'Ficha nao designada para este jogador.' });
      return;
    }

    const entityRow = db
      .prepare('SELECT * FROM entities WHERE id = ? AND campaign_id = ?')
      .get(lobbySessionEntityMatch[2], participant.campaign_id);

    if (!entityRow) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const current = toEntity(entityRow);
    const nextSessionState = {
      ...current.sessionState,
      ...normalizeSessionStatePatch(body)
    };
    const timestamp = now();

    db.prepare('UPDATE entities SET session_state_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(nextSessionState), timestamp, current.id);
    db.prepare('UPDATE lobby_participants SET last_seen_at = ? WHERE id = ?').run(timestamp, participant.id);

    const updatedEntity = toEntity(db.prepare('SELECT * FROM entities WHERE id = ?').get(current.id));
    sendJson(request, response, 200, {
      entity: sanitizeEntityForLobby(updatedEntity, participant.id)
    });
    broadcastLobby(participant.campaign_id);
    return;
  }

  const lobbyInitiativeMatch = path.match(/^\/api\/lobby\/participants\/([^/]+)\/initiative$/);

  if (lobbyInitiativeMatch && method === 'POST') {
    const participant = getLobbyParticipantFromRequest(request, lobbyInitiativeMatch[1]);

    if (!participant) {
      sendJson(request, response, 401, { error: 'Sessao de lobby invalida.' });
      return;
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(participant.campaign_id);

    if (!campaign || campaign.phase !== 'combat') {
      sendJson(request, response, 403, { error: 'Iniciativa so pode ser enviada no Modo Combate.' });
      return;
    }

    if (!campaign.active_combat_id) {
      sendJson(request, response, 403, { error: 'Nenhum combate ativo.' });
      return;
    }

    const activeCombat = db
      .prepare('SELECT * FROM combat_sessions WHERE id = ? AND campaign_id = ?')
      .get(campaign.active_combat_id, campaign.id);

    if (!activeCombat) {
      sendJson(request, response, 404, { error: 'Combate ativo nao encontrado.' });
      return;
    }

    const combatEntityIds = activeCombat.participant_entity_ids_json ? JSON.parse(activeCombat.participant_entity_ids_json) : [];

    const body = await readBody(request);
    const entityId = String(body.entityId || '');
    const value = Number(body.value);

    if (!Number.isFinite(value)) {
      sendJson(request, response, 400, { error: 'Informe um valor de iniciativa.' });
      return;
    }

    let entityName = String(body.entityName || '');

    if (entityId) {
      const assignment = db
        .prepare('SELECT * FROM entity_assignments WHERE participant_id = ? AND entity_id = ?')
        .get(participant.id, entityId);

      if (!assignment) {
        sendJson(request, response, 403, { error: 'Ficha nao designada para este jogador.' });
        return;
      }

      const entity = db.prepare('SELECT * FROM entities WHERE id = ? AND campaign_id = ?').get(entityId, campaign.id);

      if (!entity) {
        sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
        return;
      }

      if (!combatEntityIds.includes(entityId)) {
        sendJson(request, response, 403, { error: 'Ficha fora do combate ativo.' });
        return;
      }

      entityName = toEntity(entity).baseState.name;
    }

    const timestamp = now();
    const initiativeEntityId = entityId || null;

    db.prepare(`
      DELETE FROM combat_initiatives
      WHERE campaign_id = ?
        AND combat_id = ?
        AND participant_id = ?
        AND (
          (? IS NULL AND entity_id IS NULL)
          OR entity_id = ?
        )
    `).run(campaign.id, activeCombat.id, participant.id, initiativeEntityId, initiativeEntityId);

    db.prepare(`
      INSERT OR REPLACE INTO combat_initiatives (
        id, campaign_id, combat_id, participant_id, entity_id, participant_nick, entity_name, value, note, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      campaign.id,
      activeCombat.id,
      participant.id,
      initiativeEntityId,
      participant.nick,
      entityName,
      Math.trunc(value),
      String(body.note || ''),
      timestamp,
      timestamp
    );

    const initiatives = db
      .prepare('SELECT * FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ? AND participant_id = ? ORDER BY value DESC, updated_at ASC')
      .all(campaign.id, activeCombat.id, participant.id)
      .map(toCombatInitiative);

    sendJson(request, response, 200, { initiatives });
    broadcastLobby(campaign.id);
    return;
  }

  const user = requireUser(request);

  if (!user) {
    sendJson(request, response, 401, { error: 'Autenticacao obrigatoria.' });
    return;
  }

  if (method === 'GET' && path === '/api/me') {
    sendJson(request, response, 200, { user: publicUser(user) });
    return;
  }

  if (method === 'GET' && path === '/api/campaigns') {
    const campaigns = db
      .prepare('SELECT * FROM campaigns WHERE owner_user_id = ? ORDER BY updated_at DESC')
      .all(user.id)
      .map(toCampaign);
    sendJson(request, response, 200, { campaigns });
    return;
  }

  if (method === 'POST' && path === '/api/campaigns') {
    const body = await readBody(request);
    const timestamp = now();
    const campaign = {
      id: crypto.randomUUID(),
      ownerUserId: user.id,
      name: String(body.name || 'Nova campanha'),
      systemKey: String(body.systemKey || 'custom'),
      settings: normalizeCampaignSettings(body.settings, String(body.systemKey || 'custom')),
      phase: 'planning',
      activeCombatId: String(body.activeCombatId || ''),
      activeCombatName: String(body.activeCombatName || ''),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.prepare(`
      INSERT INTO campaigns (id, owner_user_id, name, system_key, settings_json, phase, active_combat_id, active_combat_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaign.id,
      campaign.ownerUserId,
      campaign.name,
      campaign.systemKey,
      JSON.stringify(campaign.settings),
      campaign.phase,
      campaign.activeCombatId,
      campaign.activeCombatName,
      campaign.createdAt,
      campaign.updatedAt
    );

    sendJson(request, response, 201, { campaign });
    return;
  }

  const campaignMatch = path.match(/^\/api\/campaigns\/([^/]+)$/);

  if (campaignMatch && method === 'PATCH') {
    const campaign = campaignBelongsToUser(campaignMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const currentSettings = campaign.settings_json ? JSON.parse(campaign.settings_json) : defaultCampaignSettings(campaign.system_key);
    const requestedSystemKey = currentSettings.isConfigured
      ? body.systemKey === 'custom'
        ? 'custom'
        : campaign.system_key
      : String(body.systemKey ?? campaign.system_key);
    const nextSettings = body.settings
      ? normalizeCampaignSettings(body.settings, requestedSystemKey)
      : currentSettings;
    const next = {
      name: String(body.name ?? campaign.name),
      systemKey: requestedSystemKey,
      settings: nextSettings,
      phase: String(body.phase ?? campaign.phase),
      activeCombatId: String(body.activeCombatId ?? campaign.active_combat_id),
      activeCombatName: String(body.activeCombatName ?? campaign.active_combat_name),
      updatedAt: now()
    };

    db.prepare(`
      UPDATE campaigns
      SET name = ?, system_key = ?, settings_json = ?, phase = ?, active_combat_id = ?, active_combat_name = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.name,
      next.systemKey,
      JSON.stringify(next.settings),
      next.phase,
      next.activeCombatId,
      next.activeCombatName,
      next.updatedAt,
      campaign.id
    );

    const updatedCampaign = toCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id));
    sendJson(request, response, 200, {
      campaign: updatedCampaign
    });
    broadcastLobby(campaign.id);
    return;
  }

  if (campaignMatch && method === 'DELETE') {
    const campaign = campaignBelongsToUser(campaignMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaign.id);
    sendJson(request, response, 200, { ok: true });
    return;
  }

  const campaignSessionRunsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/session-runs$/);

  if (campaignSessionRunsMatch && method === 'GET') {
    const campaign = campaignCanBeManagedByUser(campaignSessionRunsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const sessionRuns = db
      .prepare('SELECT * FROM session_runs WHERE campaign_id = ? ORDER BY started_at DESC')
      .all(campaign.id)
      .map(toSessionRun);

    sendJson(request, response, 200, { sessionRuns });
    return;
  }

  const campaignSessionStartMatch = path.match(/^\/api\/campaigns\/([^/]+)\/session-runs\/start$/);

  if (campaignSessionStartMatch && method === 'POST') {
    const campaign = campaignCanBeManagedByUser(campaignSessionStartMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const requestedSessionRunId = String(body.sessionRunId || '');
    let row = requestedSessionRunId
      ? db.prepare('SELECT * FROM session_runs WHERE id = ? AND campaign_id = ?').get(requestedSessionRunId, campaign.id)
      : getActiveSessionRun(campaign.id);
    const timestamp = now();

    if (row) {
      db.prepare(`
        UPDATE session_runs
        SET status = 'active', ended_at = '', updated_at = ?
        WHERE id = ?
      `).run(timestamp, row.id);
    } else {
      row = createSessionRun(campaign.id);
    }

    db.prepare("UPDATE campaigns SET phase = 'session', updated_at = ? WHERE id = ?")
      .run(timestamp, campaign.id);

    const sessionRun = toSessionRun(db.prepare('SELECT * FROM session_runs WHERE id = ?').get(row.id));
    const updatedCampaign = toCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id));

    sendJson(request, response, 200, { sessionRun, campaign: updatedCampaign });
    broadcastLobby(campaign.id);
    return;
  }

  const campaignSessionEndMatch = path.match(/^\/api\/campaigns\/([^/]+)\/session-runs\/end$/);

  if (campaignSessionEndMatch && method === 'POST') {
    const campaign = campaignCanBeManagedByUser(campaignSessionEndMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const activeRun = getActiveSessionRun(campaign.id);
    const timestamp = now();

    if (activeRun) {
      db.prepare(`
        UPDATE session_runs
        SET status = 'ended', ended_at = ?, updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, activeRun.id);
    }

    db.prepare(`
      UPDATE combat_sessions
      SET status = 'ended', updated_at = ?
      WHERE campaign_id = ? AND status != 'ended'
    `).run(timestamp, campaign.id);

    db.prepare(`
      UPDATE campaigns
      SET phase = 'paused', active_combat_id = '', active_combat_name = '', updated_at = ?
      WHERE id = ?
    `).run(timestamp, campaign.id);

    const updatedCampaign = toCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id));
    const sessionRun = activeRun
      ? toSessionRun(db.prepare('SELECT * FROM session_runs WHERE id = ?').get(activeRun.id))
      : null;

    sendJson(request, response, 200, { ok: true, sessionRun, campaign: updatedCampaign });
    broadcastLobby(campaign.id);
    return;
  }

  const sessionRunMatch = path.match(/^\/api\/session-runs\/([^/]+)$/);

  if (sessionRunMatch && method === 'PATCH') {
    const row = db.prepare('SELECT * FROM session_runs WHERE id = ?').get(sessionRunMatch[1]);

    if (!row) {
      sendJson(request, response, 404, { error: 'Sessao nao encontrada.' });
      return;
    }

    const campaign = campaignCanBeManagedByUser(row.campaign_id, user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const status = String(body.status || row.status);
    const timestamp = now();
    const endedAt = status === 'ended' ? timestamp : '';

    db.prepare(`
      UPDATE session_runs
      SET status = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, endedAt, timestamp, row.id);

    if (status === 'ended') {
      db.prepare(`
        UPDATE campaigns
        SET phase = 'paused', active_combat_id = '', active_combat_name = '', updated_at = ?
        WHERE id = ?
      `).run(timestamp, campaign.id);
    }

    const sessionRun = toSessionRun(db.prepare('SELECT * FROM session_runs WHERE id = ?').get(row.id));
    const updatedCampaign = toCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id));

    sendJson(request, response, 200, { sessionRun, campaign: updatedCampaign });
    broadcastLobby(campaign.id);
    return;
  }

  const campaignLobbySettingsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/lobby\/settings$/);

  if (campaignLobbySettingsMatch && method === 'GET') {
    const campaign = campaignCanBeManagedByUser(campaignLobbySettingsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    sendJson(request, response, 200, {
      lobbySettings: toLobbySettings(getOrCreateLobbySettings(campaign.id))
    });
    broadcastLobby(campaign.id);
    return;
  }

  if (campaignLobbySettingsMatch && method === 'PATCH') {
    const campaign = campaignCanBeManagedByUser(campaignLobbySettingsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const current = getOrCreateLobbySettings(campaign.id);
    const body = await readBody(request);
    const nextPasswordHash = body.password === undefined
      ? current.password_hash
      : hashSecret(String(body.password || ''));
    const nextMaxParticipants = Math.max(1, Math.min(100, Number(body.maxParticipants ?? current.max_participants)));
    const nextIsEnabled = Boolean(body.isEnabled ?? Boolean(current.is_enabled));
    const timestamp = now();

    db.prepare(`
      UPDATE campaign_lobby_settings
      SET password_hash = ?, max_participants = ?, is_enabled = ?, updated_at = ?
      WHERE campaign_id = ?
    `).run(nextPasswordHash, nextMaxParticipants, nextIsEnabled ? 1 : 0, timestamp, campaign.id);

    sendJson(request, response, 200, {
      lobbySettings: toLobbySettings(getOrCreateLobbySettings(campaign.id))
    });
    return;
  }

  const campaignLobbyParticipantsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/lobby\/participants$/);

  if (campaignLobbyParticipantsMatch && method === 'GET') {
    const campaign = campaignCanBeManagedByUser(campaignLobbyParticipantsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const participants = db
      .prepare('SELECT * FROM lobby_participants WHERE campaign_id = ? ORDER BY last_seen_at DESC')
      .all(campaign.id)
      .map(toLobbyParticipant);

    sendJson(request, response, 200, { participants });
    return;
  }

  const entityVisibilityMatch = path.match(/^\/api\/campaigns\/([^/]+)\/entities\/([^/]+)\/visibility$/);

  if (entityVisibilityMatch && method === 'PATCH') {
    const campaign = campaignCanBeManagedByUser(entityVisibilityMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const entity = db
      .prepare('SELECT * FROM entities WHERE id = ? AND campaign_id = ?')
      .get(entityVisibilityMatch[2], campaign.id);

    if (!entity) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const visibility = normalizeVisibility(body.visibility);
    const participantId = body.participantId ? String(body.participantId) : '';
    const timestamp = now();

    if (participantId) {
      const participant = db
        .prepare('SELECT * FROM lobby_participants WHERE id = ? AND campaign_id = ?')
        .get(participantId, campaign.id);

      if (!participant) {
        sendJson(request, response, 404, { error: 'Jogador do lobby nao encontrado.' });
        return;
      }

      db.prepare(`
        INSERT INTO entity_visibility_rules (id, entity_id, participant_id, visibility, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_id, participant_id) DO UPDATE SET visibility = excluded.visibility, updated_at = excluded.updated_at
      `).run(crypto.randomUUID(), entity.id, participant.id, visibility, timestamp, timestamp);
    } else {
      db.prepare('UPDATE entities SET visibility = ?, updated_at = ? WHERE id = ?')
        .run(visibility, timestamp, entity.id);
    }

    sendJson(request, response, 200, {
      entity: toEntity(db.prepare('SELECT * FROM entities WHERE id = ?').get(entity.id))
    });
    broadcastLobby(campaign.id);
    return;
  }

  const entityAssignmentMatch = path.match(/^\/api\/campaigns\/([^/]+)\/entities\/([^/]+)\/assignments$/);

  if (entityAssignmentMatch && method === 'PATCH') {
    const campaign = campaignCanBeManagedByUser(entityAssignmentMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const entity = db
      .prepare('SELECT * FROM entities WHERE id = ? AND campaign_id = ?')
      .get(entityAssignmentMatch[2], campaign.id);

    if (!entity) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const participantId = String(body.participantId || '');
    const participant = db
      .prepare('SELECT * FROM lobby_participants WHERE id = ? AND campaign_id = ?')
      .get(participantId, campaign.id);

    if (!participant) {
      sendJson(request, response, 404, { error: 'Jogador do lobby nao encontrado.' });
      return;
    }

    const assigned = Boolean(body.assigned ?? true);
    const timestamp = now();

    if (!assigned) {
      db.prepare('DELETE FROM entity_assignments WHERE entity_id = ? AND participant_id = ?')
        .run(entity.id, participant.id);
      sendJson(request, response, 200, { ok: true, assigned: false });
      broadcastLobby(campaign.id);
      return;
    }

    db.prepare(`
      INSERT INTO entity_assignments (id, entity_id, participant_id, can_edit_session, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_id, participant_id) DO UPDATE SET can_edit_session = excluded.can_edit_session, updated_at = excluded.updated_at
    `).run(
      crypto.randomUUID(),
      entity.id,
      participant.id,
      Boolean(body.canEditSession ?? true) ? 1 : 0,
      timestamp,
      timestamp
    );

    sendJson(request, response, 200, { ok: true, assigned: true });
    broadcastLobby(campaign.id);
    return;
  }

  const campaignEntitiesMatch = path.match(/^\/api\/campaigns\/([^/]+)\/entities$/);

  if (campaignEntitiesMatch && method === 'GET') {
    const campaign = campaignBelongsToUser(campaignEntitiesMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const entities = db
      .prepare('SELECT * FROM entities WHERE campaign_id = ? ORDER BY updated_at DESC')
      .all(campaign.id)
      .map(toEntity);
    sendJson(request, response, 200, { entities });
    return;
  }

  if (campaignEntitiesMatch && method === 'POST') {
    const campaign = campaignBelongsToUser(campaignEntitiesMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const normalized = normalizeEntityBody(body);
    const timestamp = now();
    const entity = {
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.prepare(`
      INSERT INTO entities (id, campaign_id, type, visibility, player_can_edit, base_state_json, session_state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entity.id,
      entity.campaignId,
      entity.type,
      entity.visibility,
      entity.playerCanEdit ? 1 : 0,
      JSON.stringify(entity.baseState),
      JSON.stringify(entity.sessionState),
      entity.createdAt,
      entity.updatedAt
    );

    sendJson(request, response, 201, { entity });
    broadcastLobby(campaign.id);
    return;
  }

  const campaignCombatsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/combats$/);

  if (campaignCombatsMatch && method === 'GET') {
    const campaign = campaignCanBeManagedByUser(campaignCombatsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const combats = db
      .prepare('SELECT * FROM combat_sessions WHERE campaign_id = ? ORDER BY updated_at DESC')
      .all(campaign.id)
      .map(toCombatSession);

    sendJson(request, response, 200, { combats });
    return;
  }

  if (campaignCombatsMatch && method === 'POST') {
    const campaign = campaignCanBeManagedByUser(campaignCombatsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const entityIds = Array.isArray(body.entityIds) ? body.entityIds.map(String) : [];

    if (entityIds.length === 0) {
      sendJson(request, response, 400, { error: 'Escolha ao menos uma ficha para o combate.' });
      return;
    }

    const validEntityIds = new Set(db
      .prepare("SELECT id FROM entities WHERE campaign_id = ? AND type <> 'Ability'")
      .all(campaign.id)
      .map((row) => row.id));
    const participantEntityIds = entityIds.filter((id) => validEntityIds.has(id));

    if (participantEntityIds.length === 0) {
      sendJson(request, response, 400, { error: 'Nenhuma ficha valida selecionada.' });
      return;
    }

    const timestamp = now();
    const activeSessionRun = getActiveSessionRun(campaign.id);
    const combat = {
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      sessionRunId: activeSessionRun?.id || '',
      name: String(body.name || 'Combate'),
      status: 'collectingInitiative',
      participantEntityIds,
      currentTurnIndex: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.prepare(`
      INSERT INTO combat_sessions (
        id, campaign_id, session_run_id, name, status, participant_entity_ids_json, turn_order_entity_ids_json, current_turn_index, round_number, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      combat.id,
      combat.campaignId,
      combat.sessionRunId,
      combat.name,
      combat.status,
      JSON.stringify(combat.participantEntityIds),
      JSON.stringify([]),
      combat.currentTurnIndex,
      1,
      combat.createdAt,
      combat.updatedAt
    );

    db.prepare(`
      UPDATE campaigns
      SET phase = 'combat', active_combat_id = ?, active_combat_name = ?, updated_at = ?
      WHERE id = ?
    `).run(combat.id, combat.name, timestamp, campaign.id);

    sendJson(request, response, 201, {
      combat,
      campaign: toCampaign(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign.id))
    });
    broadcastLobby(campaign.id);
    return;
  }

  const combatMatch = path.match(/^\/api\/combats\/([^/]+)$/);

  if (combatMatch && method === 'PATCH') {
    const row = db.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(combatMatch[1]);

    if (!row) {
      sendJson(request, response, 404, { error: 'Combate nao encontrado.' });
      return;
    }

    const campaign = campaignCanBeManagedByUser(row.campaign_id, user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const current = toCombatSession(row);
    const entityIds = Array.isArray(body.entityIds)
      ? body.entityIds.map(String)
      : current.participantEntityIds;
    const turnOrderEntityIds = Array.isArray(body.turnOrderEntityIds)
      ? body.turnOrderEntityIds.map(String).filter((id) => entityIds.includes(id))
      : current.turnOrderEntityIds;
    const timestamp = now();

    db.prepare(`
      UPDATE combat_sessions
      SET name = ?, status = ?, participant_entity_ids_json = ?, turn_order_entity_ids_json = ?, current_turn_index = ?, round_number = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(body.name ?? current.name),
      String(body.status ?? current.status),
      JSON.stringify(entityIds),
      JSON.stringify(turnOrderEntityIds),
      Number(body.currentTurnIndex ?? current.currentTurnIndex),
      Math.max(1, Number(body.roundNumber ?? current.roundNumber ?? 1)),
      timestamp,
      current.id
    );

    const combat = toCombatSession(db.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(current.id));
    sendJson(request, response, 200, { combat });
    broadcastLobby(campaign.id);
    return;
  }

  const combatTurnOrderMatch = path.match(/^\/api\/combats\/([^/]+)\/turn-order$/);

  if (combatTurnOrderMatch && method === 'POST') {
    const row = db.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(combatTurnOrderMatch[1]);

    if (!row) {
      sendJson(request, response, 404, { error: 'Combate nao encontrado.' });
      return;
    }

    const campaign = campaignCanBeManagedByUser(row.campaign_id, user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const combat = toCombatSession(row);
    const initiatives = db
      .prepare('SELECT * FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ? ORDER BY value DESC, updated_at ASC')
      .all(campaign.id, combat.id)
      .map(toCombatInitiative);
    const initiativeEntityIds = Array.from(new Set(initiatives
      .map((initiative) => initiative.entityId)
      .filter((entityId) => entityId && combat.participantEntityIds.includes(entityId))));
    const remainingEntityIds = combat.participantEntityIds.filter((entityId) => !initiativeEntityIds.includes(entityId));
    const turnOrderEntityIds = [...initiativeEntityIds, ...remainingEntityIds];
    const timestamp = now();

    db.prepare(`
      UPDATE combat_sessions
      SET status = 'active', turn_order_entity_ids_json = ?, current_turn_index = 0, round_number = 1, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(turnOrderEntityIds), timestamp, combat.id);

    const updatedCombat = toCombatSession(db.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(combat.id));
    sendJson(request, response, 200, { combat: updatedCombat });
    broadcastLobby(campaign.id);
    return;
  }

  const campaignLogsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/combat-logs$/);

  if (campaignLogsMatch && method === 'GET') {
    const campaign = campaignBelongsToUser(campaignLogsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const sessionRunId = routeUrl(request).searchParams.get('sessionRunId') || '';
    const logs = sessionRunId
      ? db
        .prepare('SELECT * FROM combat_logs WHERE campaign_id = ? AND session_run_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(campaign.id, sessionRunId)
      : db
        .prepare('SELECT * FROM combat_logs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(campaign.id);

    const mappedLogs = logs
      .map(toCombatLog);
    sendJson(request, response, 200, { logs: mappedLogs });
    return;
  }

  const campaignInitiativesMatch = path.match(/^\/api\/campaigns\/([^/]+)\/combat\/initiatives$/);

  if (campaignInitiativesMatch && method === 'GET') {
    const campaign = campaignCanBeManagedByUser(campaignInitiativesMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const initiatives = db
      .prepare('SELECT * FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ? ORDER BY value DESC, updated_at ASC')
      .all(campaign.id, campaign.active_combat_id || '')
      .map(toCombatInitiative);

    sendJson(request, response, 200, { initiatives });
    return;
  }

  if (campaignInitiativesMatch && method === 'POST') {
    const campaign = campaignCanBeManagedByUser(campaignInitiativesMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    if (!campaign.active_combat_id) {
      sendJson(request, response, 403, { error: 'Nenhum combate ativo.' });
      return;
    }

    const activeCombat = db
      .prepare('SELECT * FROM combat_sessions WHERE id = ? AND campaign_id = ?')
      .get(campaign.active_combat_id, campaign.id);

    if (!activeCombat) {
      sendJson(request, response, 404, { error: 'Combate ativo nao encontrado.' });
      return;
    }

    const body = await readBody(request);
    const entityId = String(body.entityId || '');
    const value = Number(body.value);

    if (!entityId || !Number.isFinite(value)) {
      sendJson(request, response, 400, { error: 'Informe ficha e valor de iniciativa.' });
      return;
    }

    const combatEntityIds = activeCombat.participant_entity_ids_json ? JSON.parse(activeCombat.participant_entity_ids_json) : [];

    if (!combatEntityIds.includes(entityId)) {
      sendJson(request, response, 403, { error: 'Ficha fora do combate ativo.' });
      return;
    }

    const entity = db.prepare('SELECT * FROM entities WHERE id = ? AND campaign_id = ?').get(entityId, campaign.id);

    if (!entity) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    const gmParticipant = getOrCreateGmLobbyParticipant(campaign.id, user);
    const timestamp = now();

    db.prepare(`
      DELETE FROM combat_initiatives
      WHERE campaign_id = ? AND combat_id = ? AND participant_id = ? AND entity_id = ?
    `).run(campaign.id, activeCombat.id, gmParticipant.id, entityId);

    db.prepare(`
      INSERT OR REPLACE INTO combat_initiatives (
        id, campaign_id, combat_id, participant_id, entity_id, participant_nick, entity_name, value, note, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      campaign.id,
      activeCombat.id,
      gmParticipant.id,
      entityId,
      'GM',
      toEntity(entity).baseState.name,
      Math.trunc(value),
      String(body.note || ''),
      timestamp,
      timestamp
    );

    const initiatives = db
      .prepare('SELECT * FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ? ORDER BY value DESC, updated_at ASC')
      .all(campaign.id, activeCombat.id)
      .map(toCombatInitiative);

    sendJson(request, response, 200, { initiatives });
    broadcastLobby(campaign.id);
    return;
  }

  if (campaignInitiativesMatch && method === 'DELETE') {
    const campaign = campaignCanBeManagedByUser(campaignInitiativesMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    db.prepare('DELETE FROM combat_initiatives WHERE campaign_id = ? AND combat_id = ?')
      .run(campaign.id, campaign.active_combat_id || '');
    sendJson(request, response, 200, { ok: true });
    broadcastLobby(campaign.id);
    return;
  }

  if (campaignLogsMatch && method === 'POST') {
    const campaign = campaignBelongsToUser(campaignLogsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const body = await readBody(request);
    const log = normalizeCombatLogBody(body);
    const activeSessionRun = getActiveSessionRun(campaign.id);
    const entity = db.prepare('SELECT id FROM entities WHERE id = ? AND campaign_id = ?').get(log.entityId, campaign.id);

    if (!entity) {
      sendJson(request, response, 404, { error: 'Ficha do histórico nao encontrada.' });
      return;
    }

    db.prepare(`
      INSERT INTO combat_logs (
        id, campaign_id, session_run_id, entity_id, entity_name, action, requested_amount, final_amount,
        damage_type, hp_before, hp_after, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      campaign.id,
      activeSessionRun?.id || '',
      log.entityId,
      log.entityName,
      log.action,
      log.requestedAmount,
      log.finalAmount,
      log.damageType,
      log.hpBefore,
      log.hpAfter,
      log.note,
      log.createdAt
    );

    sendJson(request, response, 201, {
      log: toCombatLog(db.prepare('SELECT * FROM combat_logs WHERE id = ?').get(log.id))
    });
    broadcastLobby(campaign.id);
    return;
  }

  const entityMatch = path.match(/^\/api\/entities\/([^/]+)$/);

  if (entityMatch && method === 'PATCH') {
    const row = entityBelongsToUser(entityMatch[1], user.id);

    if (!row) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    const current = toEntity(row);
    const body = await readBody(request);
    const next = {
      type: String(body.type ?? current.type),
      visibility: String(body.visibility ?? current.visibility),
      playerCanEdit: Boolean(body.playerCanEdit ?? current.playerCanEdit),
      baseState: body.baseState ? { ...current.baseState, ...body.baseState } : current.baseState,
      sessionState: body.sessionState ? { ...current.sessionState, ...body.sessionState } : current.sessionState,
      updatedAt: now()
    };

    db.prepare(`
      UPDATE entities
      SET type = ?, visibility = ?, player_can_edit = ?, base_state_json = ?, session_state_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.type,
      next.visibility,
      next.playerCanEdit ? 1 : 0,
      JSON.stringify(next.baseState),
      JSON.stringify(next.sessionState),
      next.updatedAt,
      current.id
    );

    sendJson(request, response, 200, {
      entity: toEntity(db.prepare('SELECT * FROM entities WHERE id = ?').get(current.id))
    });
    broadcastLobby(current.campaignId);
    return;
  }

  if (entityMatch && method === 'DELETE') {
    const row = entityBelongsToUser(entityMatch[1], user.id);

    if (!row) {
      sendJson(request, response, 404, { error: 'Ficha nao encontrada.' });
      return;
    }

    db.prepare('DELETE FROM entities WHERE id = ?').run(row.id);
    sendJson(request, response, 200, { ok: true });
    broadcastLobby(row.campaign_id);
    return;
  }

  sendJson(request, response, 404, { error: 'Rota nao encontrada.' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(request, response, error.message === 'Payload too large' ? 413 : 400, {
      error: error.message || 'Erro inesperado.'
    });
  });
});

server.listen(port, () => {
  console.log(`RPGBot backend running at http://localhost:${port}`);
});
