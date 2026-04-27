const http = require('node:http');
const crypto = require('node:crypto');
const { db, defaultCampaignSettings, now, toCampaign, toCombatLog, toEntity, toLobbyParticipant, toLobbySettings } = require('./db');
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
    const isAngularPort = url.port === '4200';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isPrivateLan =
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname);

    return url.protocol === 'http:' && isAngularPort && (isLocalhost || isPrivateLan);
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
      isVisibleToPlayers: Boolean(body.sessionState?.isVisibleToPlayers)
    }
  };
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

function buildLobbyState(campaignRow, participantRow) {
  const campaign = toCampaign(campaignRow);
  const participant = toLobbyParticipant(participantRow);
  const entities = db
    .prepare('SELECT * FROM entities WHERE campaign_id = ? ORDER BY updated_at DESC')
    .all(campaign.id)
    .map(toEntity)
    .map((entity) => sanitizeEntityForLobby(entity, participant.id))
    .filter(Boolean);
  const lore = sanitizeLoreForLobby(campaign.settings, participant.id);

  return {
    participant,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      phase: campaign.phase,
      activeCombatName: campaign.activeCombatName
    },
    entities,
    lore,
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
      ...(body.sessionState && typeof body.sessionState === 'object' ? body.sessionState : {})
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
      activeCombatName: String(body.activeCombatName || ''),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.prepare(`
      INSERT INTO campaigns (id, owner_user_id, name, system_key, settings_json, phase, active_combat_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaign.id,
      campaign.ownerUserId,
      campaign.name,
      campaign.systemKey,
      JSON.stringify(campaign.settings),
      campaign.phase,
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
      activeCombatName: String(body.activeCombatName ?? campaign.active_combat_name),
      updatedAt: now()
    };

    db.prepare(`
      UPDATE campaigns
      SET name = ?, system_key = ?, settings_json = ?, phase = ?, active_combat_name = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.name,
      next.systemKey,
      JSON.stringify(next.settings),
      next.phase,
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

  const campaignLogsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/combat-logs$/);

  if (campaignLogsMatch && method === 'GET') {
    const campaign = campaignBelongsToUser(campaignLogsMatch[1], user.id);

    if (!campaign) {
      sendJson(request, response, 404, { error: 'Campanha nao encontrada.' });
      return;
    }

    const logs = db
      .prepare('SELECT * FROM combat_logs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(campaign.id)
      .map(toCombatLog);
    sendJson(request, response, 200, { logs });
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
    const entity = db.prepare('SELECT id FROM entities WHERE id = ? AND campaign_id = ?').get(log.entityId, campaign.id);

    if (!entity) {
      sendJson(request, response, 404, { error: 'Ficha do histórico nao encontrada.' });
      return;
    }

    db.prepare(`
      INSERT INTO combat_logs (
        id, campaign_id, entity_id, entity_name, action, requested_amount, final_amount,
        damage_type, hp_before, hp_after, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      campaign.id,
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
