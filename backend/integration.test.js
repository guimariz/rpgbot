const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const test = require('node:test');

async function getFreePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function startApi() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpgbot-api-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      RPGBOT_DB_PATH: path.join(tempDir, 'test.sqlite')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}/api`;
  const started = Date.now();

  while (Date.now() - started < 5000) {
    if (output.includes('RPGBot backend running')) {
      return {
        baseUrl,
        stop: async () => {
          child.kill();
          await once(child, 'exit');
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  child.kill();
  throw new Error(`Backend did not start. Output:\n${output}`);
}

async function request(baseUrl, pathName, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.lobbyToken ? { 'X-Lobby-Token': options.lobbyToken } : {})
  };
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();

  return { response, data };
}

async function createAuthenticatedUser(baseUrl, email = 'gm@example.com') {
  const { response, data } = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name: 'GM',
      email,
      password: 'senhaforte'
    }
  });

  assert.equal(response.status, 201);
  return data.token;
}

async function createCampaign(baseUrl, token, name = 'Campanha Teste') {
  const { response, data } = await request(baseUrl, '/campaigns', {
    method: 'POST',
    token,
    body: {
      name,
      systemKey: 'custom',
      settings: {
        isConfigured: true,
        system: 'custom',
        damageTypes: [],
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
        sessions: [],
        templates: [],
        loreNodes: [],
        loreLinks: []
      }
    }
  });

  assert.equal(response.status, 201);
  return data.campaign;
}

async function createEntity(baseUrl, token, campaignId, overrides = {}) {
  const { response, data } = await request(baseUrl, `/campaigns/${campaignId}/entities`, {
    method: 'POST',
    token,
    body: {
      type: 'PC',
      visibility: 'private',
      baseState: {
        name: 'Aria',
        maxHp: 12,
        imageUrl: 'https://example.com/aria.png',
        publicNotes: 'Heroina conhecida',
        gmNotes: 'Segredo do GM',
        customFields: []
      },
      sessionState: {
        currentHp: 12,
        status: 'Ativo'
      },
      ...overrides
    }
  });

  assert.equal(response.status, 201);
  return data.entity;
}

test('campaigns can be deleted by their owner', async () => {
  const api = await startApi();

  try {
    const token = await createAuthenticatedUser(api.baseUrl);
    const campaign = await createCampaign(api.baseUrl, token);

    const deleted = await request(api.baseUrl, `/campaigns/${campaign.id}`, {
      method: 'DELETE',
      token
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.data.ok, true);

    const listed = await request(api.baseUrl, '/campaigns', { token });
    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.data.campaigns, []);
  } finally {
    await api.stop();
  }
});

test('lobby password is required and not returned in settings responses', async () => {
  const api = await startApi();

  try {
    const token = await createAuthenticatedUser(api.baseUrl);
    const campaign = await createCampaign(api.baseUrl, token);

    const saved = await request(api.baseUrl, `/campaigns/${campaign.id}/lobby/settings`, {
      method: 'PATCH',
      token,
      body: {
        password: 'mesa-secreta',
        maxParticipants: 2,
        isEnabled: true
      }
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.data.lobbySettings.hasPassword, true);
    assert.equal(saved.data.lobbySettings.password, undefined);
    assert.equal(saved.data.lobbySettings.passwordHash, undefined);

    await request(api.baseUrl, `/campaigns/${campaign.id}/session-runs/start`, {
      method: 'POST',
      token,
      body: {}
    });

    const wrongPassword = await request(api.baseUrl, `/lobby/campaigns/${campaign.id}/join`, {
      method: 'POST',
      body: {
        nick: 'Jogador',
        password: 'errada'
      }
    });
    assert.equal(wrongPassword.response.status, 401);

    const joined = await request(api.baseUrl, `/lobby/campaigns/${campaign.id}/join`, {
      method: 'POST',
      body: {
        nick: 'Jogador',
        password: 'mesa-secreta'
      }
    });
    assert.equal(joined.response.status, 201);
    assert.ok(joined.data.participant.id);
    assert.ok(joined.data.lobbyToken);
  } finally {
    await api.stop();
  }
});

test('lobby entity visibility never leaks GM notes', async () => {
  const api = await startApi();

  try {
    const token = await createAuthenticatedUser(api.baseUrl);
    const campaign = await createCampaign(api.baseUrl, token);
    const entity = await createEntity(api.baseUrl, token, campaign.id);

    await request(api.baseUrl, `/campaigns/${campaign.id}/lobby/settings`, {
      method: 'PATCH',
      token,
      body: {
        password: 'mesa-secreta',
        maxParticipants: 5,
        isEnabled: true
      }
    });
    await request(api.baseUrl, `/campaigns/${campaign.id}/session-runs/start`, {
      method: 'POST',
      token,
      body: {}
    });

    const joined = await request(api.baseUrl, `/lobby/campaigns/${campaign.id}/join`, {
      method: 'POST',
      body: {
        nick: 'Jogador',
        password: 'mesa-secreta'
      }
    });
    assert.equal(joined.response.status, 201);

    assert.equal(joined.data.state.entities.length, 0);

    const visible = await request(api.baseUrl, `/campaigns/${campaign.id}/entities/${entity.id}/visibility`, {
      method: 'PATCH',
      token,
      body: {
        visibility: 'publicSheet'
      }
    });
    assert.equal(visible.response.status, 200);

    const state = await request(api.baseUrl, `/lobby/participants/${joined.data.participant.id}/state`, {
      lobbyToken: joined.data.lobbyToken
    });
    assert.equal(state.response.status, 200);
    assert.equal(state.data.state.entities.length, 1);

    const lobbyEntity = state.data.state.entities[0];
    assert.equal(lobbyEntity.baseState.name, 'Aria');
    assert.equal(lobbyEntity.baseState.publicNotes, 'Heroina conhecida');
    assert.equal(lobbyEntity.baseState.gmNotes, undefined);
    assert.equal(JSON.stringify(lobbyEntity).includes('Segredo do GM'), false);
  } finally {
    await api.stop();
  }
});
