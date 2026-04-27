const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'rpgbot.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function defaultCampaignSettings(systemKey = 'custom') {
  const common = {
    isConfigured: false,
    system: systemKey,
    damageRules: {
      resistanceMultiplier: 0.5,
      weaknessMultiplier: 2,
      immunityMultiplier: 0
    },
    lobbyVisibility: {
      defaultMode: 'private',
      revealMode: 'imageAndName',
      woundedThresholdPercent: 5
    },
    encounters: [],
    templates: [],
    loreNodes: [],
    loreLinks: []
  };

  if (systemKey === 'dnd5.5') {
    return {
      ...common,
      system: 'dnd5.5',
      damageTypes: [
        { id: 'acid', name: 'Ácido', color: '#65a30d', icon: '' },
        { id: 'bludgeoning', name: 'Concussão', color: '#78716c', icon: '' },
        { id: 'cold', name: 'Frio', color: '#0284c7', icon: '' },
        { id: 'fire', name: 'Fogo', color: '#dc2626', icon: '' },
        { id: 'force', name: 'Energia', color: '#7c3aed', icon: '' },
        { id: 'lightning', name: 'Elétrico', color: '#ca8a04', icon: '' },
        { id: 'necrotic', name: 'Necrótico', color: '#4b5563', icon: '' },
        { id: 'piercing', name: 'Perfurante', color: '#525252', icon: '' },
        { id: 'poison', name: 'Veneno', color: '#16a34a', icon: '' },
        { id: 'psychic', name: 'Psíquico', color: '#c026d3', icon: '' },
        { id: 'radiant', name: 'Radiante', color: '#facc15', icon: '' },
        { id: 'slashing', name: 'Cortante', color: '#991b1b', icon: '' },
        { id: 'thunder', name: 'Trovão', color: '#2563eb', icon: '' }
      ],
      templates: [
        { id: 'dnd-character', name: 'Personagem D&D 5.5', entityType: 'PC', fields: ['HP', 'CA', 'Deslocamento', 'Atributos'] },
        { id: 'dnd-creature', name: 'Criatura D&D 5.5', entityType: 'Enemy', fields: ['HP', 'CA', 'Desafio', 'Ações'] }
      ]
    };
  }

  return {
    ...common,
    damageTypes: [],
    templates: []
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    system_key TEXT NOT NULL DEFAULT 'custom',
    settings_json TEXT NOT NULL DEFAULT '',
    phase TEXT NOT NULL DEFAULT 'planning',
    active_combat_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    type TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    player_can_edit INTEGER NOT NULL DEFAULT 0,
    base_state_json TEXT NOT NULL,
    session_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS combat_logs (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    action TEXT NOT NULL,
    requested_amount INTEGER NOT NULL,
    final_amount INTEGER NOT NULL,
    damage_type TEXT NOT NULL,
    hp_before INTEGER NOT NULL,
    hp_after INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS campaign_lobby_settings (
    campaign_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL DEFAULT '',
    max_participants INTEGER NOT NULL DEFAULT 10,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lobby_participants (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    nick TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    is_guest INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entity_visibility_rules (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    participant_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_id, participant_id),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES lobby_participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entity_assignments (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    can_edit_session INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_id, participant_id),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES lobby_participants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS campaign_gm_members (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'assistant',
    permissions_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(campaign_id, user_id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const campaignColumns = db.prepare('PRAGMA table_info(campaigns)').all().map((column) => column.name);

if (!campaignColumns.includes('settings_json')) {
  db.exec(`ALTER TABLE campaigns ADD COLUMN settings_json TEXT NOT NULL DEFAULT '';`);
}

db.prepare("UPDATE campaigns SET settings_json = ? WHERE settings_json = '' OR settings_json IS NULL")
  .run(JSON.stringify(defaultCampaignSettings('custom')));

function now() {
  return new Date().toISOString();
}

function toEntity(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    type: row.type,
    visibility: row.visibility,
    playerCanEdit: Boolean(row.player_can_edit),
    baseState: JSON.parse(row.base_state_json),
    sessionState: JSON.parse(row.session_state_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCampaign(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    systemKey: row.system_key,
    settings: row.settings_json ? JSON.parse(row.settings_json) : defaultCampaignSettings(row.system_key),
    phase: row.phase,
    activeCombatName: row.active_combat_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCombatLog(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    action: row.action,
    requestedAmount: row.requested_amount,
    finalAmount: row.final_amount,
    damageType: row.damage_type,
    hpBefore: row.hp_before,
    hpAfter: row.hp_after,
    note: row.note,
    createdAt: row.created_at
  };
}

function toLobbySettings(row) {
  return {
    campaignId: row.campaign_id,
    hasPassword: Boolean(row.password_hash),
    maxParticipants: row.max_participants,
    isEnabled: Boolean(row.is_enabled),
    updatedAt: row.updated_at
  };
}

function toLobbyParticipant(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    nick: row.nick,
    isGuest: Boolean(row.is_guest),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

module.exports = {
  db,
  now,
  defaultCampaignSettings,
  toCampaign,
  toCombatLog,
  toEntity,
  toLobbyParticipant,
  toLobbySettings
};
