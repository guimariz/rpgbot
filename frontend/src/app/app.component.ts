import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { Campaign, CampaignSettings, CampaignSystem, createDefaultCampaignSettings, DamageTypeConfig, EncounterConfig, LobbyParticipant, LobbyRevealMode, LobbySettings, LobbyState, LoreLinkConfig, LoreNodeConfig, TemplateConfig, TemplateFieldConfig, TemplateFieldType } from './models/campaign.model';
import { CombatLogEntry, Entity, EntityType, HpPreview, VisibilityMode } from './models/entity.model';
import { EntityStoreService, getHpPreview } from './state/entity-store.service';

type HpAction = 'damage' | 'heal';
type SheetMode = 'view' | 'create' | 'edit';
type AuthMode = 'login' | 'register';
type TokenStorage = 'local' | 'session';
type WorkspaceView = 'dashboard' | 'lore';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthResponse {
  user: AuthUser;
  token: string;
}

const apiBaseUrl = 'http://localhost:3001/api';
const authStorageKey = 'rpgbot.auth';
const loreMapWidth = 1600;
const loreMapHeight = 1000;
const loreNodeWidth = 220;
const loreNodeHeight = 168;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private lobbyEventSource?: EventSource;

  readonly authMode = signal<AuthMode>('login');
  readonly user = signal<AuthUser | null>(null);
  readonly token = signal('');
  readonly campaigns = signal<Campaign[]>([]);
  readonly selectedCampaign = signal<Campaign | null>(null);
  readonly isConfiguringCampaign = signal(false);
  readonly configStep = signal(1);
  readonly settingsDraft = signal<CampaignSettings>(createDefaultCampaignSettings('custom'));
  readonly isLoading = signal(false);
  readonly authMessage = signal('');
  readonly campaignMessage = signal('');
  readonly workspaceView = signal<WorkspaceView>('dashboard');

  readonly loginEmail = signal('');
  readonly loginPassword = signal('');
  readonly rememberMe = signal(true);
  readonly registerName = signal('');
  readonly registerEmail = signal('');
  readonly registerPassword = signal('');
  readonly registerConfirmPassword = signal('');
  readonly newCampaignName = signal('');
  readonly newCampaignSystem = signal<CampaignSystem>('custom');
  readonly draftDamageName = signal('');
  readonly draftDamageColor = signal('#5d1a25');
  readonly draftDamageIcon = signal('');
  readonly draftEncounterName = signal('');
  readonly draftEncounterNotes = signal('');
  readonly draftTemplateName = signal('');
  readonly draftTemplateType = signal<EntityType>('PC');
  readonly draftTemplateFields = signal<TemplateFieldConfig[]>([]);
  readonly draftTemplateFieldName = signal('');
  readonly draftTemplateFieldType = signal<TemplateFieldType>('text');
  readonly draftTemplateFieldOptions = signal('');

  readonly amount = signal(8);
  readonly action = signal<HpAction>('damage');
  readonly damageType = signal('cortante');
  readonly note = signal('');
  readonly sheetMode = signal<SheetMode>('view');
  readonly draftName = signal('');
  readonly draftType = signal<EntityType>('NPC');
  readonly draftMaxHp = signal(20);
  readonly draftImageUrl = signal('');
  readonly draftResistances = signal<string[]>([]);
  readonly draftWeaknesses = signal<string[]>([]);
  readonly draftPublicNotes = signal('');
  readonly draftGmNotes = signal('');
  readonly draftResistance = signal('');
  readonly draftWeakness = signal('');
  readonly loreTitle = signal('');
  readonly loreText = signal('');
  readonly loreImageUrl = signal('');
  readonly loreLinkFrom = signal('');
  readonly loreLinkTo = signal('');
  readonly draggingLoreNodeId = signal('');
  readonly loreZoom = signal(1);
  readonly openedLoreNode = signal<LoreNodeConfig | null>(null);
  readonly lobbySettings = signal<LobbySettings | null>(null);
  readonly lobbyParticipants = signal<LobbyParticipant[]>([]);
  readonly lobbyPasswordDraft = signal('');
  readonly lobbyMaxParticipantsDraft = signal(10);
  readonly selectedLobbyParticipantId = signal('');
  readonly lobbyCampaignId = signal(new URLSearchParams(window.location.search).get('lobby') || '');
  readonly lobbyNick = signal('');
  readonly lobbyPassword = signal('');
  readonly lobbyToken = signal('');
  readonly lobbyState = signal<LobbyState | null>(null);

  readonly selectedEntity = this.entityStore.selectedEntity;
  readonly entities = this.entityStore.entities;
  readonly damageProfiles = this.entityStore.damageProfiles;
  readonly publicEntities = this.entityStore.publicEntities;
  readonly combatLog = this.entityStore.combatLog;
  readonly phase = this.entityStore.phase;
  readonly campaignName = this.entityStore.campaignName;
  readonly activeCombatName = this.entityStore.activeCombatName;
  readonly isPresetLocked = computed(() => this.settingsDraft().system !== 'custom');
  readonly campaignDamageTypes = computed(() => {
    const configured = this.selectedCampaign()?.settings?.damageTypes ?? this.settingsDraft().damageTypes;
    return configured.length > 0
      ? configured
      : [
        { id: 'cortante', name: 'Cortante' },
        { id: 'perfurante', name: 'Perfurante' },
        { id: 'impacto', name: 'Impacto' },
        { id: 'fogo', name: 'Fogo' },
        { id: 'gelo', name: 'Gelo' },
        { id: 'eletrico', name: 'Eletrico' },
        { id: 'veneno', name: 'Veneno' }
      ];
  });

  readonly hpPreview = computed<HpPreview>(() => {
    const entity = this.selectedEntity();
    const signedAmount = this.action() === 'heal' ? this.amount() : -this.amount();
    return entity
      ? getHpPreview(entity, signedAmount, this.action() === 'heal' ? 'cura' : this.damageType())
      : { finalAmount: 0, multiplier: 1, reason: 'neutral' };
  });

  constructor(private readonly entityStore: EntityStoreService) {
    void this.restoreSession();
  }

  setAuthMode(mode: AuthMode): void {
    this.authMode.set(mode);
    this.authMessage.set('');
  }

  async login(): Promise<void> {
    this.authMessage.set('');
    await this.authenticate('/auth/login', {
      email: this.loginEmail().trim(),
      password: this.loginPassword()
    }, this.rememberMe() ? 'local' : 'session');
  }

  async register(): Promise<void> {
    this.authMessage.set('');

    if (this.registerPassword() !== this.registerConfirmPassword()) {
      this.authMessage.set('As senhas não conferem.');
      return;
    }

    await this.authenticate('/auth/register', {
      name: this.registerName().trim(),
      email: this.registerEmail().trim(),
      password: this.registerPassword()
    }, 'local');
  }

  async discordLogin(): Promise<void> {
    this.authMessage.set('');

    try {
      await this.apiRequest('/auth/discord', { method: 'POST', skipAuth: true });
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Login com Discord indisponível.');
    }
  }

  forgotPassword(): void {
    this.authMessage.set('Recuperação de senha ainda não configurada.');
  }

  logout(): void {
    localStorage.removeItem(authStorageKey);
    sessionStorage.removeItem(authStorageKey);
    this.user.set(null);
    this.token.set('');
    this.campaigns.set([]);
    this.selectedCampaign.set(null);
    this.isConfiguringCampaign.set(false);
    this.entityStore.resetLocalData();
    this.authMode.set('login');
  }

  backToCampaigns(): void {
    this.selectedCampaign.set(null);
    this.isConfiguringCampaign.set(false);
    this.entityStore.resetLocalData();
    this.sheetMode.set('view');
  }

  async createCampaign(): Promise<void> {
    const name = this.newCampaignName().trim();

    if (!name) {
      this.campaignMessage.set('Informe o nome da campanha.');
      return;
    }

    this.campaignMessage.set('');
    this.isLoading.set(true);

    try {
      const response = await this.apiRequest<{ campaign: Campaign }>('/campaigns', {
        method: 'POST',
        body: {
          name,
          systemKey: this.newCampaignSystem(),
          settings: createDefaultCampaignSettings(this.newCampaignSystem()),
          activeCombatName: ''
        }
      });
      this.campaigns.set([response.campaign, ...this.campaigns()]);
      this.newCampaignName.set('');
      this.openCampaignConfiguration(response.campaign);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível criar a campanha.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectCampaign(campaign: Campaign): Promise<void> {
    this.selectedCampaign.set(campaign);
    this.settingsDraft.set(campaign.settings ?? createDefaultCampaignSettings(campaign.systemKey));
    await this.enterDashboard();
  }

  openCampaignConfiguration(campaign: Campaign): void {
    this.selectedCampaign.set(campaign);
    this.settingsDraft.set(campaign.settings ?? createDefaultCampaignSettings(campaign.systemKey));
    this.configStep.set(1);
    this.isConfiguringCampaign.set(true);
    this.campaignMessage.set('');
  }

  async enterDashboard(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isConfiguringCampaign.set(false);
    this.workspaceView.set('dashboard');
    this.entityStore.setCampaignContext(campaign.name, campaign.phase, campaign.activeCombatName);
    await this.loadEntities(campaign.id);
    await this.loadCombatLogs(campaign.id);
    await this.loadLobbySettings(campaign.id);
    await this.loadLobbyParticipants(campaign.id);
  }

  async finishCampaignConfiguration(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    const settings: CampaignSettings = {
      ...this.settingsDraft(),
      isConfigured: true
    };
    const validationMessage = this.validateSettings(settings);

    if (validationMessage) {
      this.campaignMessage.set(validationMessage);
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ campaign: Campaign }>(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: {
          systemKey: settings.system,
          settings,
          activeCombatName: ''
        }
      });
      this.selectedCampaign.set(response.campaign);
      this.campaigns.set(this.campaigns().map((item) => item.id === response.campaign.id ? response.campaign : item));
      await this.enterDashboard();
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível salvar a configuração.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setConfigStep(step: number): void {
    this.configStep.set(Math.max(1, Math.min(5, step)));
  }

  nextConfigStep(): void {
    this.setConfigStep(this.configStep() + 1);
  }

  previousConfigStep(): void {
    this.setConfigStep(this.configStep() - 1);
  }

  setCampaignSystem(system: CampaignSystem): void {
    const campaign = this.selectedCampaign();

    if (campaign?.settings?.isConfigured) {
      return;
    }

    this.settingsDraft.set(createDefaultCampaignSettings(system));
  }

  customizeSystem(): void {
    const previousSystem = this.settingsDraft().system;
    this.settingsDraft.update((settings) => ({
      ...settings,
      system: 'custom'
    }));
    this.campaignMessage.set(previousSystem === 'dnd5.5' ? 'Sistema Customizado com pré-set D&D 5.5' : 'Sistema customizado.');
  }

  addDamageType(): void {
    if (this.isPresetLocked()) {
      this.campaignMessage.set('Clique em Customizar Sistema para editar danos.');
      return;
    }

    const name = this.draftDamageName().trim();

    if (!name) {
      this.campaignMessage.set('Informe o nome do tipo de dano.');
      return;
    }

    const damageType: DamageTypeConfig = {
      id: crypto.randomUUID(),
      name,
      color: this.draftDamageColor(),
      icon: this.draftDamageIcon().trim()
    };

    this.settingsDraft.update((settings) => ({
      ...settings,
      damageTypes: [...settings.damageTypes, damageType]
    }));
    this.draftDamageName.set('');
    this.draftDamageIcon.set('');
    this.campaignMessage.set('');
  }

  removeDamageType(id: string): void {
    if (this.isPresetLocked()) {
      this.campaignMessage.set('Clique em Customizar Sistema para editar danos.');
      return;
    }

    this.settingsDraft.update((settings) => ({
      ...settings,
      damageTypes: settings.damageTypes.filter((item) => item.id !== id)
    }));
  }

  setWoundedThreshold(value: string): void {
    const parsed = Number(value);
    const woundedThresholdPercent = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 5;
    this.settingsDraft.update((settings) => ({
      ...settings,
      lobbyVisibility: {
        ...settings.lobbyVisibility,
        woundedThresholdPercent
      }
    }));
  }

  setRevealMode(value: string): void {
    this.settingsDraft.update((settings) => ({
      ...settings,
      lobbyVisibility: {
        ...settings.lobbyVisibility,
        revealMode: value as LobbyRevealMode
      }
    }));
  }

  async addEncounter(): Promise<void> {
    const campaign = this.selectedCampaign();
    const name = this.draftEncounterName().trim();

    if (!campaign?.settings?.isConfigured) {
      this.campaignMessage.set('Encontros sao adicionados dentro das sessoes, depois da configuracao da campanha.');
      return;
    }

    if (!name) {
      this.campaignMessage.set('Informe o nome do encontro.');
      return;
    }

    const encounter: EncounterConfig = {
      id: crypto.randomUUID(),
      name,
      notes: this.draftEncounterNotes().trim()
    };

    const settings: CampaignSettings = {
      ...campaign.settings,
      encounters: [...campaign.settings.encounters, encounter]
    };

    await this.saveCampaignSettings(settings, campaign.activeCombatName || encounter.name);
  }

  async removeEncounter(id: string): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign?.settings?.isConfigured) {
      return;
    }

    const encounters = campaign.settings.encounters.filter((item) => item.id !== id);
    const activeCombatName = encounters.some((item) => item.name === campaign.activeCombatName)
      ? campaign.activeCombatName
      : encounters[0]?.name ?? '';

    await this.saveCampaignSettings({ ...campaign.settings, encounters }, activeCombatName);
  }

  addTemplate(): void {
    if (this.isPresetLocked()) {
      this.campaignMessage.set('Clique em Customizar Sistema para editar templates.');
      return;
    }

    const name = this.draftTemplateName().trim();
    const fields = this.draftTemplateFields();

    if (!name || fields.length === 0) {
      this.campaignMessage.set('Informe nome e campos do template.');
      return;
    }

    const template: TemplateConfig = {
      id: crypto.randomUUID(),
      name,
      entityType: this.draftTemplateType(),
      fields
    };

    this.settingsDraft.update((settings) => ({
      ...settings,
      templates: [...settings.templates, template]
    }));
    this.draftTemplateName.set('');
    this.draftTemplateFields.set([]);
    this.campaignMessage.set('');
  }

  removeTemplate(id: string): void {
    if (this.isPresetLocked()) {
      this.campaignMessage.set('Clique em Customizar Sistema para editar templates.');
      return;
    }

    this.settingsDraft.update((settings) => ({
      ...settings,
      templates: settings.templates.filter((item) => item.id !== id)
    }));
  }

  addTemplateField(): void {
    if (this.isPresetLocked()) {
      this.campaignMessage.set('Clique em Customizar Sistema para editar templates.');
      return;
    }

    const name = this.draftTemplateFieldName().trim();
    const type = this.draftTemplateFieldType();
    const options = this.parseDisplayList(this.draftTemplateFieldOptions());

    if (!name) {
      this.campaignMessage.set('Informe o nome do campo.');
      return;
    }

    if ((type === 'select' || type === 'table') && options.length === 0) {
      this.campaignMessage.set(type === 'select' ? 'Informe as opcoes do select.' : 'Informe as colunas da tabela.');
      return;
    }

    this.draftTemplateFields.update((fields) => [
      ...fields,
      {
        id: crypto.randomUUID(),
        name,
        type,
        options
      }
    ]);
    this.draftTemplateFieldName.set('');
    this.draftTemplateFieldOptions.set('');
    this.campaignMessage.set('');
  }

  removeTemplateField(id: string): void {
    this.draftTemplateFields.update((fields) => fields.filter((field) => field.id !== id));
  }

  async saveSheetForm(entity?: Entity): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    const maxHp = Math.max(1, this.draftMaxHp());
    const baseState = {
      name: this.draftName().trim() || 'Ficha sem nome',
      maxHp,
      resistances: this.draftResistances(),
      weaknesses: this.draftWeaknesses(),
      imageUrl: this.draftImageUrl().trim(),
      publicNotes: this.draftPublicNotes().trim(),
      gmNotes: this.draftGmNotes().trim(),
      customFields: entity?.baseState.customFields ?? []
    };

    this.isLoading.set(true);

    try {
      if (this.sheetMode() === 'edit' && entity) {
        const response = await this.apiRequest<{ entity: Entity }>(`/entities/${entity.id}`, {
          method: 'PATCH',
          body: {
            type: this.draftType(),
            baseState
          }
        });
        this.entityStore.replaceEntity(response.entity);
      } else {
        const response = await this.apiRequest<{ entity: Entity }>(`/campaigns/${campaign.id}/entities`, {
          method: 'POST',
          body: {
            type: this.draftType(),
            visibility: 'private',
            playerCanEdit: false,
            baseState,
            sessionState: {
              currentHp: maxHp,
              status: 'Ativo',
              conditions: [],
              isVisibleToPlayers: false
            }
          }
        });
        this.entityStore.createEntity(response.entity);
      }

      this.sheetMode.set('view');
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível salvar a ficha.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteEntity(entity: Entity): Promise<void> {
    this.isLoading.set(true);

    try {
      await this.apiRequest(`/entities/${entity.id}`, { method: 'DELETE' });
      this.entityStore.deleteEntity(entity.id);
      this.sheetMode.set('view');
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível deletar a ficha.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async applyHpChange(entity: Entity): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    const signedAmount = this.action() === 'heal' ? this.amount() : -this.amount();
    const type = this.action() === 'heal' ? 'cura' : this.damageType();
    const logEntry = this.entityStore.updateHp(entity.id, signedAmount, type, this.note());
    this.note.set('');

    const updatedEntity = this.entities().find((item) => item.id === entity.id);

    if (!updatedEntity || !logEntry) {
      return;
    }

    try {
      await this.apiRequest(`/entities/${entity.id}`, {
        method: 'PATCH',
        body: {
          sessionState: updatedEntity.sessionState
        }
      });
      await this.apiRequest<{ log: CombatLogEntry }>(`/campaigns/${campaign.id}/combat-logs`, {
        method: 'POST',
        body: logEntry
      });
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'HP atualizado localmente, mas não sincronizado.');
    }
  }

  async toggleVisible(entity: Entity): Promise<void> {
    const nextVisible = !entity.sessionState.isVisibleToPlayers;
    this.entityStore.setPublicVisibility(entity.id, nextVisible);
    const updatedEntity = this.entities().find((item) => item.id === entity.id);

    if (!updatedEntity) {
      return;
    }

    try {
      await this.apiRequest(`/entities/${entity.id}`, {
        method: 'PATCH',
        body: {
          visibility: updatedEntity.visibility,
          sessionState: updatedEntity.sessionState
        }
      });
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Visibilidade não sincronizada.');
    }
  }

  async setEntityLobbyVisibility(entity: Entity, visibility: VisibilityMode, participantId = ''): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ entity: Entity }>(`/campaigns/${campaign.id}/entities/${entity.id}/visibility`, {
        method: 'PATCH',
        body: {
          visibility,
          participantId: participantId || undefined
        }
      });

      if (!participantId) {
        this.entityStore.replaceEntity(response.entity);
      }
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Visibilidade do lobby nao sincronizada.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async assignEntityToLobbyParticipant(entity: Entity, participantId: string): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign || !participantId) {
      this.campaignMessage.set('Escolha um jogador conectado para designar a ficha.');
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      await this.apiRequest(`/campaigns/${campaign.id}/entities/${entity.id}/assignments`, {
        method: 'PATCH',
        body: {
          participantId,
          assigned: true,
          canEditSession: true
        }
      });
      await this.setEntityLobbyVisibility(entity, 'publicSheet', participantId);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel designar a ficha.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCurrentLobbyParticipants(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    await this.loadLobbyParticipants(campaign.id);
  }

  async saveLobbySettings(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ lobbySettings: LobbySettings }>(`/campaigns/${campaign.id}/lobby/settings`, {
        method: 'PATCH',
        body: {
          ...(this.lobbyPasswordDraft() ? { password: this.lobbyPasswordDraft() } : {}),
          maxParticipants: this.lobbyMaxParticipantsDraft(),
          isEnabled: true
        }
      });
      this.lobbySettings.set(response.lobbySettings);
      this.lobbyPasswordDraft.set('');
      await this.loadLobbyParticipants(campaign.id);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel configurar o lobby.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setLobbyPasswordDraft(value: string): void {
    this.lobbyPasswordDraft.set(value);
  }

  setLobbyMaxParticipantsDraft(value: string): void {
    this.lobbyMaxParticipantsDraft.set(Math.max(1, Math.min(100, Number(value || 10))));
  }

  setSelectedLobbyParticipantId(value: string): void {
    this.selectedLobbyParticipantId.set(value);
  }

  setLobbyNick(value: string): void {
    this.lobbyNick.set(value);
  }

  setLobbyPassword(value: string): void {
    this.lobbyPassword.set(value);
  }

  async joinLobby(): Promise<void> {
    const campaignId = this.lobbyCampaignId();

    if (!campaignId) {
      return;
    }

    this.isLoading.set(true);
    this.authMessage.set('');

    try {
      const response = await this.apiRequest<{ participant: LobbyParticipant; lobbyToken: string; state: LobbyState }>(`/lobby/campaigns/${campaignId}/join`, {
        method: 'POST',
        body: {
          nick: this.lobbyNick(),
          password: this.lobbyPassword()
        },
        skipAuth: true
      });
      this.lobbyToken.set(response.lobbyToken);
      this.lobbyState.set(response.state);
      this.lobbyPassword.set('');
      this.connectLobbyEvents(response.state.participant.id, response.lobbyToken);
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Nao foi possivel entrar no lobby.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshLobbyState(): Promise<void> {
    const participantId = this.lobbyState()?.participant.id;

    if (!participantId || !this.lobbyToken()) {
      return;
    }

    try {
      const response = await this.apiRequest<{ state: LobbyState }>(`/lobby/participants/${participantId}/state`, {
        skipAuth: true,
        lobbyToken: this.lobbyToken()
      });
      this.lobbyState.set(response.state);
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Nao foi possivel atualizar o lobby.');
    }
  }

  private connectLobbyEvents(participantId: string, token: string): void {
    this.lobbyEventSource?.close();
    this.lobbyEventSource = new EventSource(`${apiBaseUrl}/lobby/participants/${participantId}/events?token=${encodeURIComponent(token)}`);

    this.lobbyEventSource.addEventListener('state', (event) => {
      try {
        this.lobbyState.set(JSON.parse((event as MessageEvent).data) as LobbyState);
        this.authMessage.set('');
      } catch {
        this.authMessage.set('Nao foi possivel ler uma atualizacao do lobby.');
      }
    });

    this.lobbyEventSource.onerror = () => {
      this.authMessage.set('Conexao em tempo real instavel. Use Atualizar se necessario.');
    };
  }

  lobbyLink(): string {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return '';
    }

    return `${window.location.origin}/?lobby=${campaign.id}`;
  }

  selectEntity(entityId: string): void {
    this.entityStore.selectEntity(entityId);
    this.sheetMode.set('view');
  }

  async setPhase(phase: 'planning' | 'session' | 'combat' | 'paused'): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.entityStore.setPhase(phase);

    try {
      const response = await this.apiRequest<{ campaign: Campaign }>(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: { phase }
      });
      this.selectedCampaign.set(response.campaign);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Fase não sincronizada.');
    }
  }

  setAction(action: HpAction): void {
    this.action.set(action);
    if (action === 'heal') {
      this.damageType.set('cura');
    } else if (this.damageType() === 'cura') {
      this.damageType.set('cortante');
    }
  }

  setAmount(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  setDamageType(value: string): void {
    this.damageType.set(value);
  }

  setNote(value: string): void {
    this.note.set(value);
  }

  startCreate(): void {
    this.sheetMode.set('create');
    this.draftName.set('');
    this.draftType.set('NPC');
    this.draftMaxHp.set(20);
    this.draftImageUrl.set('');
    this.draftResistances.set([]);
    this.draftWeaknesses.set([]);
    this.draftResistance.set(this.campaignDamageTypes()[0]?.id ?? '');
    this.draftWeakness.set(this.campaignDamageTypes()[0]?.id ?? '');
    this.draftPublicNotes.set('');
    this.draftGmNotes.set('');
  }

  startEdit(entity: Entity): void {
    this.sheetMode.set('edit');
    this.draftName.set(entity.baseState.name);
    this.draftType.set(entity.type);
    this.draftMaxHp.set(entity.baseState.maxHp);
    this.draftImageUrl.set(entity.baseState.imageUrl);
    this.draftResistances.set(entity.baseState.resistances);
    this.draftWeaknesses.set(entity.baseState.weaknesses);
    this.draftPublicNotes.set(entity.baseState.publicNotes);
    this.draftGmNotes.set(entity.baseState.gmNotes);
  }

  cancelSheetForm(): void {
    this.sheetMode.set('view');
  }

  resetLocalData(): void {
    this.entityStore.resetLocalData();
    this.sheetMode.set('view');
  }

  setDraftName(value: string): void {
    this.draftName.set(value);
  }

  setDraftType(value: string): void {
    this.draftType.set(value as EntityType);
  }

  setDraftMaxHp(value: string): void {
    const parsed = Number(value);
    this.draftMaxHp.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  setDraftImageUrl(value: string): void {
    this.draftImageUrl.set(value);
  }

  setDraftResistance(value: string): void {
    this.draftResistance.set(value);
  }

  setDraftWeakness(value: string): void {
    this.draftWeakness.set(value);
  }

  addDraftResistance(): void {
    const value = this.draftResistance() || this.campaignDamageTypes()[0]?.id;

    if (value && !this.draftResistances().includes(value)) {
      this.draftResistances.update((items) => [...items, value]);
    }
  }

  addDraftWeakness(): void {
    const value = this.draftWeakness() || this.campaignDamageTypes()[0]?.id;

    if (value && !this.draftWeaknesses().includes(value)) {
      this.draftWeaknesses.update((items) => [...items, value]);
    }
  }

  removeDraftResistance(value: string): void {
    this.draftResistances.update((items) => items.filter((item) => item !== value));
  }

  removeDraftWeakness(value: string): void {
    this.draftWeaknesses.update((items) => items.filter((item) => item !== value));
  }

  setDraftPublicNotes(value: string): void {
    this.draftPublicNotes.set(value);
  }

  setDraftGmNotes(value: string): void {
    this.draftGmNotes.set(value);
  }

  setLoginEmail(value: string): void {
    this.loginEmail.set(value);
  }

  setLoginPassword(value: string): void {
    this.loginPassword.set(value);
  }

  setRememberMe(value: boolean): void {
    this.rememberMe.set(value);
  }

  setRegisterName(value: string): void {
    this.registerName.set(value);
  }

  setRegisterEmail(value: string): void {
    this.registerEmail.set(value);
  }

  setRegisterPassword(value: string): void {
    this.registerPassword.set(value);
  }

  setRegisterConfirmPassword(value: string): void {
    this.registerConfirmPassword.set(value);
  }

  setNewCampaignName(value: string): void {
    this.newCampaignName.set(value);
  }

  setNewCampaignSystem(value: string): void {
    this.newCampaignSystem.set(value as CampaignSystem);
  }

  setWorkspaceView(view: WorkspaceView): void {
    this.workspaceView.set(view);
  }

  setDraftDamageName(value: string): void {
    this.draftDamageName.set(value);
  }

  setDraftDamageColor(value: string): void {
    this.draftDamageColor.set(value);
  }

  setDraftDamageIcon(value: string): void {
    this.draftDamageIcon.set(value);
  }

  setDraftEncounterName(value: string): void {
    this.draftEncounterName.set(value);
  }

  setDraftEncounterNotes(value: string): void {
    this.draftEncounterNotes.set(value);
  }

  setDraftTemplateName(value: string): void {
    this.draftTemplateName.set(value);
  }

  setDraftTemplateType(value: string): void {
    this.draftTemplateType.set(value as EntityType);
  }

  setDraftTemplateFieldName(value: string): void {
    this.draftTemplateFieldName.set(value);
  }

  setDraftTemplateFieldType(value: string): void {
    this.draftTemplateFieldType.set(value as TemplateFieldType);
  }

  setDraftTemplateFieldOptions(value: string): void {
    this.draftTemplateFieldOptions.set(value);
  }

  hpPercent(entity: Entity): number {
    if (entity.baseState.maxHp <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (entity.sessionState.currentHp / entity.baseState.maxHp) * 100));
  }

  hpStateLabel(entity: Entity): string {
    if (entity.sessionState.currentHp <= 0) {
      return entity.sessionState.status;
    }

    if (entity.type === 'Enemy' && entity.sessionState.currentHp <= entity.baseState.maxHp * 0.05) {
      return 'Gravemente Ferido';
    }

    if (this.hpPercent(entity) <= 35) {
      return 'Ferido';
    }

    return 'Estável';
  }

  damageLabel(type: string): string {
    const campaignType = this.campaignDamageTypes().find((item) => item.id === type);

    if (campaignType) {
      return campaignType.name;
    }

    const labels: Record<string, string> = {
      cortante: 'Cortante',
      perfurante: 'Perfurante',
      impacto: 'Impacto',
      fogo: 'Fogo',
      gelo: 'Gelo',
      eletrico: 'Elétrico',
      veneno: 'Veneno',
      cura: 'Cura'
    };

    return labels[type] ?? type;
  }

  formatLogTime(createdAt: string): string {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return createdAt;
    }

    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  previewMessage(entity: Entity): string {
    const preview = this.hpPreview();

    if (this.action() === 'heal') {
      const cappedAmount = Math.min(preview.finalAmount, entity.baseState.maxHp - entity.sessionState.currentHp);
      return `Cura final: ${Math.max(0, cappedAmount)} HP`;
    }

    if (preview.reason === 'resistance') {
      return `Resistência detectada: dano sugerido ${preview.finalAmount}`;
    }

    if (preview.reason === 'weakness') {
      return `Fraqueza detectada: dano sugerido ${preview.finalAmount}`;
    }

    return `Dano sugerido: ${preview.finalAmount}`;
  }

  templateFieldSummary(template: TemplateConfig): string {
    return this.normalizeTemplateFields(template.fields)
      .map((field) => {
        const suffix = field.options.length ? ` (${field.options.join(', ')})` : '';
        return `${field.name}: ${this.templateFieldTypeLabel(field.type)}${suffix}`;
      })
      .join(' · ');
  }

  templateFieldTypeLabel(type: TemplateFieldType): string {
    const labels: Record<TemplateFieldType, string> = {
      text: 'Texto',
      select: 'Select',
      table: 'Tabela'
    };

    return labels[type];
  }

  addLoreNode(): void {
    const title = this.loreTitle().trim();

    if (!title) {
      this.campaignMessage.set('Informe o titulo do campo de lore.');
      return;
    }

    const node: LoreNodeConfig = {
      id: crypto.randomUUID(),
      title,
      text: this.loreText().trim(),
      imageUrl: this.loreImageUrl().trim(),
      x: 80 + (this.currentLoreNodes().length % 4) * 170,
      y: 80 + Math.floor(this.currentLoreNodes().length / 4) * 150
    };

    void this.updateLore({
      loreNodes: [...this.currentLoreNodes(), node],
      loreLinks: this.currentLoreLinks()
    });
    this.loreTitle.set('');
    this.loreText.set('');
    this.loreImageUrl.set('');
  }

  removeLoreNode(id: string): void {
    void this.updateLore({
      loreNodes: this.currentLoreNodes().filter((node) => node.id !== id),
      loreLinks: this.currentLoreLinks().filter((link) => link.fromId !== id && link.toId !== id)
    });
  }

  setLoreTitle(value: string): void {
    this.loreTitle.set(value);
  }

  setLoreText(value: string): void {
    this.loreText.set(value);
  }

  setLoreImageUrl(value: string): void {
    this.loreImageUrl.set(value);
  }

  setLoreLinkFrom(value: string): void {
    this.loreLinkFrom.set(value);
  }

  setLoreLinkTo(value: string): void {
    this.loreLinkTo.set(value);
  }

  addLoreLink(): void {
    const fromId = this.loreLinkFrom();
    const toId = this.loreLinkTo();

    if (!fromId || !toId || fromId === toId) {
      this.campaignMessage.set('Escolha dois campos de lore diferentes.');
      return;
    }

    const exists = this.currentLoreLinks().some((link) =>
      (link.fromId === fromId && link.toId === toId) || (link.fromId === toId && link.toId === fromId));

    if (exists) {
      this.campaignMessage.set('Essa ligacao ja existe.');
      return;
    }

    void this.updateLore({
      loreNodes: this.currentLoreNodes(),
      loreLinks: [...this.currentLoreLinks(), { id: crypto.randomUUID(), fromId, toId }]
    });
  }

  removeLoreLink(id: string): void {
    void this.updateLore({
      loreNodes: this.currentLoreNodes(),
      loreLinks: this.currentLoreLinks().filter((link) => link.id !== id)
    });
  }

  startLoreDrag(id: string): void {
    this.draggingLoreNodeId.set(id);
  }

  moveLoreNode(event: DragEvent): void {
    const id = this.draggingLoreNodeId();

    if (!id || !event.currentTarget) {
      return;
    }

    const viewport = event.currentTarget as HTMLElement;
    const rect = viewport.getBoundingClientRect();
    const zoom = this.loreZoom();
    const x = this.clamp((event.clientX - rect.left + viewport.scrollLeft) / zoom - loreNodeWidth / 2, 16, loreMapWidth - loreNodeWidth - 16);
    const y = this.clamp((event.clientY - rect.top + viewport.scrollTop) / zoom - loreNodeHeight / 2, 16, loreMapHeight - loreNodeHeight - 16);
    const loreNodes = this.currentLoreNodes().map((node) => node.id === id ? { ...node, x, y } : node);

    void this.updateLore({ loreNodes, loreLinks: this.currentLoreLinks() });
    this.draggingLoreNodeId.set('');
  }

  loreLinkPath(link: LoreLinkConfig): string {
    const from = this.currentLoreNodes().find((node) => node.id === link.fromId);
    const to = this.currentLoreNodes().find((node) => node.id === link.toId);

    if (!from || !to) {
      return '';
    }

    const fromX = from.x + loreNodeWidth / 2;
    const fromY = from.y + loreNodeHeight / 2;
    const toX = to.x + loreNodeWidth / 2;
    const toY = to.y + loreNodeHeight / 2;

    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  loreCanvasStyle(): Record<string, string> {
    return {
      width: `${loreMapWidth}px`,
      height: `${loreMapHeight}px`,
      transform: `scale(${this.loreZoom()})`
    };
  }

  loreCanvasBoundsStyle(): Record<string, string> {
    const zoom = this.loreZoom();

    return {
      width: `${loreMapWidth * zoom}px`,
      height: `${loreMapHeight * zoom}px`
    };
  }

  loreViewBox(): string {
    return `0 0 ${loreMapWidth} ${loreMapHeight}`;
  }

  zoomLoreMap(delta: number): void {
    this.loreZoom.set(this.clamp(Math.round((this.loreZoom() + delta) * 100) / 100, 0.5, 1.8));
  }

  resetLoreZoom(): void {
    this.loreZoom.set(1);
  }

  openLoreNode(node: LoreNodeConfig): void {
    this.openedLoreNode.set(node);
  }

  closeLoreNode(): void {
    this.openedLoreNode.set(null);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private async restoreSession(): Promise<void> {
    const storedAuth = localStorage.getItem(authStorageKey) ?? sessionStorage.getItem(authStorageKey);

    if (!storedAuth) {
      return;
    }

    try {
      const parsedAuth = JSON.parse(storedAuth) as AuthResponse;
      this.user.set(parsedAuth.user);
      this.token.set(parsedAuth.token);
      await this.loadCampaigns();
    } catch {
      this.logout();
    }
  }

  private async authenticate(path: string, body: Record<string, unknown>, storage: TokenStorage): Promise<void> {
    this.isLoading.set(true);

    try {
      const response = await this.apiRequest<AuthResponse>(path, {
        method: 'POST',
        body,
        skipAuth: true
      });
      this.user.set(response.user);
      this.token.set(response.token);
      this.persistAuth(response, storage);
      await this.loadCampaigns();
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Não foi possível autenticar.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadCampaigns(): Promise<void> {
    this.campaignMessage.set('');
    const response = await this.apiRequest<{ campaigns: Campaign[] }>('/campaigns');
    this.campaigns.set(response.campaigns);
  }

  private async loadEntities(campaignId: string): Promise<void> {
    this.isLoading.set(true);

    try {
      const response = await this.apiRequest<{ entities: Entity[] }>(`/campaigns/${campaignId}/entities`);
      this.entityStore.replaceEntities(response.entities);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível carregar as fichas.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadCombatLogs(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ logs: CombatLogEntry[] }>(`/campaigns/${campaignId}/combat-logs`);
      this.entityStore.replaceCombatLog(response.logs);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.');
    }
  }

  private async loadLobbySettings(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ lobbySettings: LobbySettings }>(`/campaigns/${campaignId}/lobby/settings`);
      this.lobbySettings.set(response.lobbySettings);
      this.lobbyMaxParticipantsDraft.set(response.lobbySettings.maxParticipants);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar o lobby.');
    }
  }

  private async loadLobbyParticipants(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ participants: LobbyParticipant[] }>(`/campaigns/${campaignId}/lobby/participants`);
      this.lobbyParticipants.set(response.participants);

      if (this.selectedLobbyParticipantId() && !response.participants.some((participant) => participant.id === this.selectedLobbyParticipantId())) {
        this.selectedLobbyParticipantId.set('');
      }
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar jogadores do lobby.');
    }
  }

  private async apiRequest<T>(path: string, options: {
    method?: string;
    body?: unknown;
    skipAuth?: boolean;
    lobbyToken?: string;
  } = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (!options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.token()}`;
    }

    if (options.lobbyToken) {
      headers['X-Lobby-Token'] = options.lobbyToken;
    }

    let response: Response;

    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error('Backend indisponível.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(String(data.error || 'Erro na requisição.'));
    }

    return data as T;
  }

  private persistAuth(response: AuthResponse, storage: TokenStorage): void {
    const serialized = JSON.stringify(response);
    sessionStorage.removeItem(authStorageKey);
    localStorage.removeItem(authStorageKey);

    if (storage === 'local') {
      localStorage.setItem(authStorageKey, serialized);
    } else {
      sessionStorage.setItem(authStorageKey, serialized);
    }
  }

  private async saveCampaignSettings(settings: CampaignSettings, activeCombatName: string): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ campaign: Campaign }>(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: {
          settings,
          activeCombatName
        }
      });
      this.selectedCampaign.set(response.campaign);
      this.settingsDraft.set(response.campaign.settings);
      this.campaigns.set(this.campaigns().map((item) => item.id === response.campaign.id ? response.campaign : item));
      this.entityStore.setCampaignContext(response.campaign.name, response.campaign.phase, response.campaign.activeCombatName);
      this.draftEncounterName.set('');
      this.draftEncounterNotes.set('');
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel salvar a sessao.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async updateLore(lore: { loreNodes: LoreNodeConfig[]; loreLinks: LoreLinkConfig[] }): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    await this.saveCampaignSettings({
      ...campaign.settings,
      loreNodes: lore.loreNodes,
      loreLinks: lore.loreLinks
    }, campaign.activeCombatName);
  }

  private currentLoreNodes(): LoreNodeConfig[] {
    return this.selectedCampaign()?.settings?.loreNodes ?? [];
  }

  private currentLoreLinks(): LoreLinkConfig[] {
    return this.selectedCampaign()?.settings?.loreLinks ?? [];
  }

  private validateSettings(settings: CampaignSettings): string {
    if (settings.damageTypes.length === 0) {
      return 'Cadastre pelo menos um tipo de dano.';
    }

    if (settings.templates.length === 0) {
      return 'Cadastre pelo menos um template.';
    }

    return '';
  }

  private parseList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private parseDisplayList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeTemplateFields(fields: Array<TemplateFieldConfig | string>): TemplateFieldConfig[] {
    return fields.map((field) => typeof field === 'string'
      ? { id: field, name: field, type: 'text', options: [] }
      : { ...field, options: Array.isArray(field.options) ? field.options : [] });
  }
}
