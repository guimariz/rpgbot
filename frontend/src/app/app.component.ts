import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DashboardModernComponent } from './dashboard-modern/dashboard-modern.component';
import { ApiClientService } from './core/api-client.service';
import { Campaign, CampaignSettings, CampaignSystem, CombatInitiative, CombatSession, createDefaultCampaignSettings, DamageTypeConfig, EncounterConfig, LobbyEntity, LobbyParticipant, LobbyRevealMode, LobbySettings, LobbyState, LoreLinkConfig, LoreNodeConfig, RoundCounterConfig, SessionConfig, SessionRun, TemplateConfig, TemplateFieldConfig, TemplateFieldType } from './models/campaign.model';
import { CombatLogEntry, Entity, EntitySessionState, EntityType, HpPreview, VisibilityMode } from './models/entity.model';
import { CampaignStateService } from './state/campaign-state.service';
import { CombatStateService } from './state/combat-state.service';
import { EntityStoreService, getHpPreview } from './state/entity-store.service';

type HpAction = 'damage' | 'heal';
type SheetMode = 'view' | 'create' | 'edit';
type AuthMode = 'login' | 'register';
type TokenStorage = 'local' | 'session';
type WorkspaceView = 'dashboard' | 'library' | 'lore';
type LibraryFilter = 'all' | EntityType;

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
  imports: [CommonModule, DashboardComponent, DashboardModernComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private lobbyEventSource?: EventSource;
  private readonly apiClient = inject(ApiClientService);
  private readonly campaignState = inject(CampaignStateService);
  private readonly combatState = inject(CombatStateService);
  private readonly entityStore = inject(EntityStoreService);

  readonly authMode = signal<AuthMode>('login');
  readonly user = signal<AuthUser | null>(null);
  readonly token = signal('');
  readonly campaigns = this.campaignState.campaigns;
  readonly selectedCampaign = this.campaignState.selectedCampaign;
  readonly isConfiguringCampaign = this.campaignState.isConfiguringCampaign;
  readonly configStep = this.campaignState.configStep;
  readonly settingsDraft = this.campaignState.settingsDraft;
  readonly isLoading = signal(false);
  readonly authMessage = signal('');
  readonly campaignMessage = signal('');
  readonly workspaceView = signal<WorkspaceView>('dashboard');
  readonly dashboardDesign = signal<'original' | 'v1' | 'v2'>('original');

  cycleDesign(): void {
    const next: Record<string, 'original' | 'v1' | 'v2'> = {
      original: 'v1', v1: 'v2', v2: 'original',
    };
    this.dashboardDesign.set(next[this.dashboardDesign()]);
  }
  readonly libraryFilter = signal<LibraryFilter>('all');

  readonly loginEmail = signal('');
  readonly loginPassword = signal('');
  readonly rememberMe = signal(true);
  readonly registerName = signal('');
  readonly registerEmail = signal('');
  readonly registerPassword = signal('');
  readonly registerConfirmPassword = signal('');
  readonly newCampaignName = this.campaignState.newCampaignName;
  readonly newCampaignSystem = this.campaignState.newCampaignSystem;
  readonly draftDamageName = signal('');
  readonly draftDamageColor = signal('#5d1a25');
  readonly draftDamageIcon = signal('');
  readonly draftEncounterName = signal('');
  readonly draftEncounterNotes = signal('');
  readonly draftEncounterEntityIds = signal<string[]>([]);
  readonly draftEncounterBoardWidth = signal(8);
  readonly draftEncounterBoardHeight = signal(6);
  readonly draftEncounterBoardVisibility = signal<'gmOnly' | 'public'>('gmOnly');
  readonly draftRoundCounters = signal<RoundCounterConfig[]>([]);
  readonly draftRoundCounterName = signal('');
  readonly draftRoundCounterRounds = signal(3);
  readonly draftRoundCounterVisibility = signal<'gmOnly' | 'public'>('gmOnly');
  readonly editingEncounterId = signal('');
  readonly draftSessionName = this.campaignState.draftSessionName;
  readonly draftSessionNotes = this.campaignState.draftSessionNotes;
  readonly isSavingSessionConfig = this.campaignState.isSavingSessionConfig;
  readonly selectedSessionConfigId = this.campaignState.selectedSessionConfigId;
  readonly configuringSessionId = this.campaignState.configuringSessionId;
  readonly activeSessionConfigId = this.campaignState.activeSessionConfigId;
  readonly activeEncounterId = this.combatState.activeEncounterId;
  readonly boardSelectedEntityId = this.combatState.boardSelectedEntityId;
  readonly isLobbyModalOpen = signal(false);
  readonly lobbySummaryDraft = signal('');
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
  readonly isHpActionModalOpen = signal(false);
  readonly hpActionModalEntity = signal<Entity | null>(null);
  readonly sheetMode = signal<SheetMode>('view');
  readonly draftName = signal('');
  readonly draftType = signal<EntityType>('NPC');
  readonly draftMaxHp = signal(20);
  readonly draftImageUrl = signal('');
  readonly draftResistances = signal<string[]>([]);
  readonly draftWeaknesses = signal<string[]>([]);
  readonly draftPublicNotes = signal('');
  readonly draftGmNotes = signal('');
  readonly draftAbilityTiming = signal<'instant' | 'perRound'>('instant');
  readonly draftAbilityDamage = signal(0);
  readonly draftAbilityDamageType = signal('');
  readonly draftAbilityDurationRounds = signal(0);
  readonly draftResistance = signal('');
  readonly draftWeakness = signal('');
  readonly loreTitle = signal('');
  readonly loreText = signal('');
  readonly loreImageUrl = signal('');
  readonly loreError = signal('');
  readonly loreLinkFrom = signal('');
  readonly loreLinkTo = signal('');
  readonly draggingLoreNodeId = signal('');
  readonly loreZoom = signal(1);
  readonly openedLoreNode = signal<LoreNodeConfig | null>(null);
  readonly lobbySettings = signal<LobbySettings | null>(null);
  readonly lobbyParticipants = signal<LobbyParticipant[]>([]);
  readonly lobbyPasswordDraft = signal('');
  readonly savedLobbyPassword = signal('');
  readonly lobbyMaxParticipantsDraft = signal(10);
  readonly selectedLobbyParticipantId = signal('');
  readonly lobbyCampaignId = signal(new URLSearchParams(window.location.search).get('lobby') || '');
  readonly gmLobbyCampaignId = signal(new URLSearchParams(window.location.search).get('gmLobby') || '');
  readonly sessionConfigCampaignId = signal(new URLSearchParams(window.location.search).get('sessionConfig') || '');
  readonly sessionConfigInitialId = signal(new URLSearchParams(window.location.search).get('session') || '');
  readonly lobbyNick = signal('');
  readonly lobbyPassword = signal('');
  readonly lobbyToken = signal('');
  readonly lobbyState = signal<LobbyState | null>(null);
  readonly combatInitiatives = this.combatState.combatInitiatives;
  readonly combats = this.combatState.combats;
  readonly sessionRuns = this.combatState.sessionRuns;
  readonly selectedSessionRunId = this.combatState.selectedSessionRunId;
  readonly sessionRunLogs = this.combatState.sessionRunLogs;
  readonly draftCombatName = this.combatState.draftCombatName;
  readonly draftCombatEntityIds = this.combatState.draftCombatEntityIds;
  readonly gmInitiativeEntityId = this.combatState.gmInitiativeEntityId;
  readonly gmInitiativeValue = this.combatState.gmInitiativeValue;
  readonly gmInitiativeNote = this.combatState.gmInitiativeNote;
  readonly lobbyInitiativeEntityId = signal('');
  readonly lobbyInitiativeValue = signal(10);
  readonly lobbyInitiativeNote = signal('');
  readonly isCombatModalOpen = this.combatState.isCombatModalOpen;
  readonly isInitiativePopupOpen = this.combatState.isInitiativePopupOpen;

  readonly selectedEntity = this.entityStore.selectedEntity;
  readonly entities = this.entityStore.entities;
  readonly damageProfiles = this.entityStore.damageProfiles;
  readonly publicEntities = this.entityStore.publicEntities;
  readonly combatLog = this.entityStore.combatLog;
  readonly phase = this.entityStore.phase;
  readonly campaignName = this.entityStore.campaignName;
  readonly activeCombatName = this.entityStore.activeCombatName;
  readonly isPresetLocked = computed(() => this.settingsDraft().system !== 'custom');
  readonly initiativePopupConfirmLabel = computed(() =>
    this.isCombatModalOpen() ? 'Atualizar Iniciativas' : 'Entrar no Combate');
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

  readonly filteredLibraryEntities = computed(() => {
    const filter = this.libraryFilter();
    return filter === 'all'
      ? this.entities()
      : this.entities().filter((entity) => entity.type === filter);
  });

  readonly hpPreview = computed<HpPreview>(() => {
    const entity = this.selectedEntity();
    const signedAmount = this.action() === 'heal' ? this.amount() : -this.amount();
    return entity
      ? getHpPreview(entity, signedAmount, this.action() === 'heal' ? 'cura' : this.damageType())
      : { finalAmount: 0, multiplier: 1, reason: 'neutral' };
  });

  constructor() {
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
    this.campaignState.resetSelection();
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

  async deleteCampaign(campaign: Campaign, event?: Event): Promise<void> {
    event?.stopPropagation();

    if (!confirm(`Excluir a campanha "${campaign.name}"? Esta acao nao pode ser desfeita.`)) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      await this.apiRequest(`/campaigns/${campaign.id}`, {
        method: 'DELETE'
      });
      const wasSelected = this.selectedCampaign()?.id === campaign.id;
      this.campaignState.removeCampaign(campaign.id);

      if (wasSelected) {
        this.entityStore.resetLocalData();
      }
      this.campaignMessage.set(`Campanha "${campaign.name}" excluida.`);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel excluir a campanha.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectCampaign(campaign: Campaign): Promise<void> {
    this.campaignState.selectCampaign(campaign);
    this.savedLobbyPassword.set('');
    await this.enterDashboard();
  }

  openCampaignConfiguration(campaign: Campaign): void {
    this.campaignState.openConfiguration(campaign);
    this.savedLobbyPassword.set('');
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
    await this.loadSessionRuns(campaign.id);
    await this.loadCombats(campaign.id);
    await this.loadCombatInitiatives(campaign.id);

    if (this.isGmLobbyMode()) {
      this.activeSessionConfigId.set(this.selectedSessionConfig()?.id ?? '');
      this.openLobbyModal();
    }
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
    const session = this.selectedSessionConfig();
    const name = this.draftEncounterName().trim();

    if (!campaign) {
      this.campaignMessage.set('Selecione uma campanha antes de adicionar encontros.');
      return;
    }

    if (!session) {
      this.campaignMessage.set('Configure uma sessao antes de adicionar encontros.');
      return;
    }

    if (!name) {
      this.campaignMessage.set('Informe o nome do encontro.');
      return;
    }

    const sessionEntityIds = this.sessionEntityIds(session);
    const encounterEntityIds = this.draftEncounterEntityIds().filter((id) => sessionEntityIds.includes(id));

    if (encounterEntityIds.length === 0) {
      this.campaignMessage.set('Escolha ao menos uma ficha para o encontro.');
      return;
    }

    const editingId = this.editingEncounterId();
    const currentEncounter = editingId ? session.encounters.find((item) => item.id === editingId) : null;
    const encounter: EncounterConfig = {
      id: currentEncounter?.id ?? crypto.randomUUID(),
      name,
      notes: this.draftEncounterNotes().trim(),
      entityIds: encounterEntityIds,
      roundCounters: this.draftRoundCounters(),
      board: {
        width: this.draftEncounterBoardWidth(),
        height: this.draftEncounterBoardHeight(),
        visibility: this.draftEncounterBoardVisibility(),
        positions: currentEncounter?.board?.positions ?? {}
      }
    };

    const sessions = this.upsertSessionConfig(campaign.settings, {
      ...session,
      encounters: currentEncounter
        ? session.encounters.map((item) => item.id === encounter.id ? encounter : item)
        : [...session.encounters, encounter]
    });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName || encounter.name);
    this.resetEncounterDraft();
  }

  async removeEncounter(id: string): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.selectedSessionConfig();

    if (!campaign?.settings?.isConfigured || !session) {
      return;
    }

    const encounters = session.encounters.filter((item) => item.id !== id);
    const activeCombatName = encounters.some((item) => item.name === campaign.activeCombatName)
      ? campaign.activeCombatName
      : encounters[0]?.name ?? '';
    const sessions = this.upsertSessionConfig(campaign.settings, { ...session, encounters });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, activeCombatName);
  }

  editEncounter(encounter: EncounterConfig): void {
    this.editingEncounterId.set(encounter.id);
    this.draftEncounterName.set(encounter.name);
    this.draftEncounterNotes.set(encounter.notes);
    this.draftEncounterEntityIds.set((encounter.entityIds ?? []).filter((id) => this.isSessionEntityId(id)));
    this.draftEncounterBoardWidth.set(encounter.board?.width ?? 8);
    this.draftEncounterBoardHeight.set(encounter.board?.height ?? 6);
    this.draftEncounterBoardVisibility.set(encounter.board?.visibility ?? 'gmOnly');
    this.draftRoundCounters.set(encounter.roundCounters ?? []);
    this.campaignMessage.set('');
  }

  cancelEncounterEdit(): void {
    this.resetEncounterDraft();
  }

  async addSessionConfig(): Promise<void> {
    if (this.isSavingSessionConfig()) {
      return;
    }

    const campaign = this.selectedCampaign();

    if (!campaign) {
      this.campaignMessage.set('Selecione uma campanha antes de criar sessoes.');
      return;
    }

    this.campaignMessage.set('Criando sessao...');

    const campaignSettings = campaign.settings ?? createDefaultCampaignSettings(campaign.systemKey);
    const previousSelectedSessionId = this.selectedSessionConfigId();
    const previousConfiguringSessionId = this.configuringSessionId();
    const previousActiveSessionId = this.activeSessionConfigId();
    const nextSessionNumber = this.campaignSessions().length + 1;
    const name = this.draftSessionName().trim() || `Sessao ${nextSessionNumber}`;

    const session: SessionConfig = {
      id: crypto.randomUUID(),
      name,
      notes: this.draftSessionNotes().trim(),
      entityIds: [],
      loreNodeIds: [],
      encounters: [],
      lastLobbySummary: ''
    };

    const sessions = this.upsertSessionConfig(campaignSettings, session);
    const optimisticCampaign: Campaign = {
      ...campaign,
      settings: {
        ...campaignSettings,
        sessions,
        encounters: []
      }
    };

    this.selectedCampaign.set(optimisticCampaign);
    this.campaigns.set(this.campaigns().map((item) => item.id === campaign.id ? optimisticCampaign : item));
    this.selectedSessionConfigId.set(session.id);
    this.configuringSessionId.set(session.id);
    this.activeSessionConfigId.set(session.id);
    this.workspaceView.set('dashboard');
    this.isSavingSessionConfig.set(true);

    try {
      const saved = await this.saveCampaignSettings({ ...campaignSettings, sessions, encounters: [] }, campaign.activeCombatName);

      if (!saved) {
        this.selectedCampaign.set(campaign);
        this.campaigns.set(this.campaigns().map((item) => item.id === campaign.id ? campaign : item));
        this.selectedSessionConfigId.set(previousSelectedSessionId);
        this.configuringSessionId.set(previousConfiguringSessionId);
        this.activeSessionConfigId.set(previousActiveSessionId);
        this.ensureSelectedSessionConfig(campaign);
        return;
      }

      this.selectedSessionConfigId.set(session.id);
      this.configuringSessionId.set(session.id);
      this.activeSessionConfigId.set(session.id);
      this.workspaceView.set('dashboard');
      this.draftSessionName.set('');
      this.draftSessionNotes.set('');
      this.campaignMessage.set(`Sessao "${session.name}" criada.`);

      setTimeout(() => {
        document.querySelector('.session-config-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } finally {
      this.isSavingSessionConfig.set(false);
    }
  }

  async deleteSessionConfig(sessionId: string, event?: Event): Promise<void> {
    event?.stopPropagation();

    if (this.isSavingSessionConfig()) {
      return;
    }

    const campaign = this.selectedCampaign();
    const session = this.campaignSessions().find((item) => item.id === sessionId);

    if (!campaign || !session) {
      return;
    }

    if (!confirm(`Excluir a sessao "${session.name}"?`)) {
      return;
    }

    const settings = campaign.settings ?? createDefaultCampaignSettings(campaign.systemKey);
    const previousSelectedSessionId = this.selectedSessionConfigId();
    const previousConfiguringSessionId = this.configuringSessionId();
    const previousActiveSessionId = this.activeSessionConfigId();
    const sessions = this.sessionConfigsFromSettings(settings).filter((item) => item.id !== sessionId);
    const fallbackSessionId = sessions[0]?.id ?? '';
    const optimisticCampaign: Campaign = {
      ...campaign,
      settings: {
        ...settings,
        sessions,
        encounters: []
      }
    };

    this.selectedCampaign.set(optimisticCampaign);
    this.campaigns.set(this.campaigns().map((item) => item.id === campaign.id ? optimisticCampaign : item));
    this.selectedSessionConfigId.set(previousSelectedSessionId === sessionId ? fallbackSessionId : previousSelectedSessionId);
    this.configuringSessionId.set(previousConfiguringSessionId === sessionId ? '' : previousConfiguringSessionId);
    this.activeSessionConfigId.set(previousActiveSessionId === sessionId ? fallbackSessionId : previousActiveSessionId);
    this.isSavingSessionConfig.set(true);

    try {
      const saved = await this.saveCampaignSettings({ ...settings, sessions, encounters: [] }, campaign.activeCombatName);

      if (!saved) {
        this.selectedCampaign.set(campaign);
        this.campaigns.set(this.campaigns().map((item) => item.id === campaign.id ? campaign : item));
        this.selectedSessionConfigId.set(previousSelectedSessionId);
        this.configuringSessionId.set(previousConfiguringSessionId);
        this.activeSessionConfigId.set(previousActiveSessionId);
        this.ensureSelectedSessionConfig(campaign);
        return;
      }

      this.campaignMessage.set(`Sessao "${session.name}" excluida.`);
    } finally {
      this.isSavingSessionConfig.set(false);
    }
  }

  configureSession(sessionId: string): void {
    const url = this.sessionConfigLink(sessionId);
    const configWindow = window.open(url, '_blank');

    if (!configWindow) {
      this.campaignMessage.set('O navegador bloqueou a nova aba. Libere pop-ups para abrir a configuracao da sessao.');
    }
  }

  closeSessionConfig(): void {
    this.configuringSessionId.set('');
    this.sheetMode.set('view');
    this.campaignMessage.set('');
  }

  selectSessionConfig(sessionId: string): void {
    this.selectedSessionConfigId.set(sessionId);
    this.configuringSessionId.set('');
    this.campaignMessage.set('');
  }

  async startLobbyForSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      this.campaignMessage.set('Selecione uma sessao antes de iniciar o lobby.');
      return;
    }

    this.selectedSessionConfigId.set(sessionId);
    this.activeSessionConfigId.set(sessionId);
    await this.startSession(true);
  }

  async saveSessionConfiguration(): Promise<void> {
    if (this.lobbyPasswordDraft()) {
      await this.saveLobbySettings();
      return;
    }

    this.campaignMessage.set('Configuracao salva.');
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
      abilityTiming: this.draftAbilityTiming(),
      abilityDamage: this.draftAbilityDamage(),
      abilityDamageType: this.draftAbilityDamageType() || this.campaignDamageTypes()[0]?.id || '',
      abilityDurationRounds: this.draftAbilityDurationRounds(),
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
      const nextPassword = this.lobbyPasswordDraft();
      const response = await this.apiRequest<{ lobbySettings: LobbySettings }>(`/campaigns/${campaign.id}/lobby/settings`, {
        method: 'PATCH',
        body: {
          ...(nextPassword ? { password: nextPassword } : {}),
          maxParticipants: this.lobbyMaxParticipantsDraft(),
          isEnabled: true
        }
      });
      this.lobbySettings.set(response.lobbySettings);
      this.savedLobbyPassword.set(nextPassword || this.savedLobbyPassword());
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

  async updateLobbyEntitySession(entity: LobbyEntity, patch: Partial<EntitySessionState>): Promise<void> {
    const participantId = this.lobbyState()?.participant.id;

    if (!participantId || !this.lobbyToken() || !entity.canEditSession || !entity.sessionState) {
      return;
    }

    try {
      const response = await this.apiRequest<{ entity: LobbyEntity }>(`/lobby/participants/${participantId}/entities/${entity.id}/session`, {
        method: 'PATCH',
        body: { sessionState: patch },
        skipAuth: true,
        lobbyToken: this.lobbyToken()
      });
      this.replaceLobbyEntity(response.entity);
      this.authMessage.set('');
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Nao foi possivel atualizar a ficha.');
    }
  }

  setLobbyInitiativeEntityId(value: string): void {
    this.lobbyInitiativeEntityId.set(value);
  }

  setLobbyInitiativeValue(value: string): void {
    this.lobbyInitiativeValue.set(Number(value || 0));
  }

  setLobbyInitiativeNote(value: string): void {
    this.lobbyInitiativeNote.set(value);
  }

  async submitLobbyInitiative(): Promise<void> {
    const participantId = this.lobbyState()?.participant.id;

    if (!participantId || !this.lobbyToken()) {
      return;
    }

    const selectedEntityId = this.lobbyInitiativeEntityId();
    const selectedEntity = this.lobbyState()?.entities.find((entity) => entity.id === selectedEntityId);

    try {
      const response = await this.apiRequest<{ initiatives: CombatInitiative[] }>(`/lobby/participants/${participantId}/initiative`, {
        method: 'POST',
        body: {
          entityId: selectedEntityId || undefined,
          entityName: selectedEntity?.baseState.name || '',
          value: this.lobbyInitiativeValue(),
          note: this.lobbyInitiativeNote()
        },
        skipAuth: true,
        lobbyToken: this.lobbyToken()
      });
      const state = this.lobbyState();

      if (state) {
        this.lobbyState.set({ ...state, initiatives: response.initiatives });
      }

      this.lobbyInitiativeNote.set('');
      this.authMessage.set('');
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : 'Nao foi possivel enviar iniciativa.');
    }
  }

  assignedLobbyEntities(): LobbyEntity[] {
    const state = this.lobbyState();
    const combatEntityIds = state?.activeCombat?.participantEntityIds ?? [];

    return state?.entities.filter((entity) =>
      entity.type !== 'Ability' &&
      entity.canEditSession &&
      entity.sessionState &&
      (combatEntityIds.length === 0 || combatEntityIds.includes(entity.id))) ?? [];
  }

  lobbyInitiativeLabel(initiative: CombatInitiative): string {
    return initiative.entityName || initiative.participantNick;
  }

  updateLobbyEntityHp(entity: LobbyEntity, value: string): void {
    const maxHp = Number(entity.baseState.maxHp || 0);
    const currentHp = Math.max(0, Number(value || 0));

    void this.updateLobbyEntitySession(entity, { currentHp: maxHp > 0 ? Math.min(currentHp, maxHp) : currentHp });
  }

  updateLobbyEntityMana(entity: LobbyEntity, value: string): void {
    void this.updateLobbyEntitySession(entity, { mana: Number(value || 0) });
  }

  updateLobbyEntityMaxMana(entity: LobbyEntity, value: string): void {
    void this.updateLobbyEntitySession(entity, { maxMana: Number(value || 0) });
  }

  updateLobbyEntityStatus(entity: LobbyEntity, value: string): void {
    void this.updateLobbyEntitySession(entity, { status: value });
  }

  updateLobbyEntityConditions(entity: LobbyEntity, value: string): void {
    const conditions = value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        id: crypto.randomUUID(),
        name,
        durationTurns: 0,
        isPublic: true
      }));

    void this.updateLobbyEntitySession(entity, { conditions });
  }

  updateLobbyEntityModifiers(entity: LobbyEntity, value: string): void {
    const modifiers = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split(':');

        return {
          id: crypto.randomUUID(),
          name: name.trim(),
          value: rest.join(':').trim(),
          isPublic: true
        };
      });

    void this.updateLobbyEntitySession(entity, { modifiers });
  }

  lobbyConditionsText(entity: LobbyEntity): string {
    return entity.sessionState?.conditions?.map((condition) => condition.name).join(', ') ?? '';
  }

  lobbyModifiersText(entity: LobbyEntity): string {
    return entity.sessionState?.modifiers?.map((modifier) =>
      modifier.value ? `${modifier.name}: ${modifier.value}` : modifier.name).join('\n') ?? '';
  }

  private replaceLobbyEntity(entity: LobbyEntity): void {
    const state = this.lobbyState();

    if (!state) {
      return;
    }

    this.lobbyState.set({
      ...state,
      entities: state.entities.map((item) => item.id === entity.id ? entity : item)
    });
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

  gmLobbyLink(): string {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return '';
    }

    return `${window.location.origin}/?gmLobby=${campaign.id}`;
  }

  sessionConfigLink(sessionId: string): string {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return '';
    }

    return `${window.location.origin}/?sessionConfig=${campaign.id}&session=${sessionId}`;
  }

  isGmLobbyMode(): boolean {
    return Boolean(this.gmLobbyCampaignId());
  }

  isSessionConfigMode(): boolean {
    return Boolean(this.sessionConfigCampaignId());
  }

  canShareLobbyLink(): boolean {
    return this.phase() === 'session' || this.phase() === 'combat' || this.phase() === 'paused';
  }

  campaignSessions(): SessionConfig[] {
    return this.campaignState.campaignSessions();
  }

  selectedSessionConfig(): SessionConfig | null {
    return this.campaignState.selectedSessionConfig();
  }

  activeLobbySession(): SessionConfig | null {
    return this.campaignState.activeLobbySession();
  }

  selectEntity(entityId: string): void {
    this.entityStore.selectEntity(entityId);
    this.sheetMode.set('view');
  }

  async startSession(openInModal = false): Promise<void> {
    const hasPassword = this.lobbySettings()?.hasPassword || Boolean(this.lobbyPasswordDraft());

    if (!hasPassword) {
      this.campaignMessage.set('Defina a senha do lobby antes de iniciar a sessao.');
      return;
    }

    const lobbyWindow = openInModal ? null : window.open('about:blank', '_blank');

    if (this.lobbyPasswordDraft()) {
      await this.saveLobbySettings();
    }

    if (!this.lobbySettings()?.hasPassword) {
      lobbyWindow?.close();
      return;
    }

    const started = await this.startSessionRun();

    if (!started) {
      lobbyWindow?.close();
      return;
    }

    if (openInModal) {
      this.isLobbyModalOpen.set(true);
      this.lobbySummaryDraft.set(this.activeLobbySession()?.lastLobbySummary ?? '');
    } else if (lobbyWindow) {
      lobbyWindow.location.href = this.gmLobbyLink();
    } else {
      this.campaignMessage.set('Sessao iniciada. O navegador bloqueou a nova aba; libere pop-ups e abra o link do lobby manualmente.');
    }
  }

  async startCombat(): Promise<void> {
    if (this.phase() !== 'session' && this.phase() !== 'combat') {
      this.campaignMessage.set('Inicie a sessao antes de iniciar o combate.');
      return;
    }

    this.campaignMessage.set('Crie um combate e escolha as fichas envolvidas para iniciar.');
  }

  async pauseSession(): Promise<void> {
    await this.endActiveSessionRun();
  }

  async finishLobbyModal(): Promise<void> {
    await this.saveActiveLobbySummary();
    await this.endActiveSessionRun();
    this.isLobbyModalOpen.set(false);
  }

  closeLobbyModal(): void {
    this.isLobbyModalOpen.set(false);
  }

  openLobbyModal(): void {
    if (!this.activeLobbySession()) {
      this.campaignMessage.set('Nenhuma sessao configurada para abrir o lobby.');
      return;
    }

    this.lobbySummaryDraft.set(this.activeLobbySession()?.lastLobbySummary ?? '');
    this.isLobbyModalOpen.set(true);
  }

  setLobbySummaryDraft(value: string): void {
    this.lobbySummaryDraft.set(value);
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
      this.campaigns.set(this.campaigns().map((item) => item.id === response.campaign.id ? response.campaign : item));
      this.campaignMessage.set('');
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Fase não sincronizada.');
    }
  }

  async startSessionRun(sessionRunId = ''): Promise<boolean> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return false;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ sessionRun: SessionRun; campaign: Campaign }>(`/campaigns/${campaign.id}/session-runs/start`, {
        method: 'POST',
        body: sessionRunId ? { sessionRunId } : {}
      });
      this.selectedCampaign.set(response.campaign);
      this.campaigns.set(this.campaigns().map((item) => item.id === response.campaign.id ? response.campaign : item));
      this.entityStore.setCampaignContext(response.campaign.name, response.campaign.phase, response.campaign.activeCombatName);
      await this.loadSessionRuns(campaign.id);
      return true;
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel iniciar a sessao.');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async endActiveSessionRun(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');
 
    try {
      const response = await this.apiRequest<{ ok: boolean; sessionRun: SessionRun | null; campaign: Campaign }>(`/campaigns/${campaign.id}/session-runs/end`, {
        method: 'POST'
      });
      this.selectedCampaign.set(response.campaign);
      this.campaigns.set(this.campaigns().map((item) => item.id === response.campaign.id ? response.campaign : item));
      this.entityStore.setCampaignContext(response.campaign.name, response.campaign.phase, response.campaign.activeCombatName);
      await this.loadSessionRuns(response.campaign.id);
      await this.loadCombats(response.campaign.id);
      this.isCombatModalOpen.set(false);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel encerrar a sessao.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectSessionRun(sessionRunId: string): Promise<void> {
    const campaign = this.selectedCampaign();

    this.selectedSessionRunId.set(sessionRunId);

    if (!campaign || !sessionRunId) {
      this.sessionRunLogs.set([]);
      return;
    }

    try {
      const response = await this.apiRequest<{ logs: CombatLogEntry[] }>(`/campaigns/${campaign.id}/combat-logs?sessionRunId=${encodeURIComponent(sessionRunId)}`);
      this.sessionRunLogs.set(response.logs);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar o historico da sessao.');
    }
  }

  sessionRunLabel(run: SessionRun): string {
    const started = new Date(run.startedAt).toLocaleString('pt-BR');
    const ended = run.endedAt ? new Date(run.endedAt).toLocaleString('pt-BR') : 'em andamento';

    return `${started} - ${ended}`;
  }

  async refreshCombatInitiatives(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    await this.loadCombatInitiatives(campaign.id);
  }

  async clearCombatInitiatives(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      await this.apiRequest(`/campaigns/${campaign.id}/combat/initiatives`, {
        method: 'DELETE'
      });
      this.combatInitiatives.set([]);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel limpar iniciativas.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setDraftCombatName(value: string): void {
    this.draftCombatName.set(value);
  }

  setGmInitiativeEntityId(value: string): void {
    this.gmInitiativeEntityId.set(value);
  }

  setGmInitiativeValue(value: string): void {
    this.gmInitiativeValue.set(Number(value || 0));
  }

  setGmInitiativeNote(value: string): void {
    this.gmInitiativeNote.set(value);
  }

  async submitGmInitiative(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign || !this.gmInitiativeEntityId()) {
      this.campaignMessage.set('Escolha uma ficha para lancar iniciativa.');
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ initiatives: CombatInitiative[] }>(`/campaigns/${campaign.id}/combat/initiatives`, {
        method: 'POST',
        body: {
          entityId: this.gmInitiativeEntityId(),
          value: this.gmInitiativeValue(),
          note: this.gmInitiativeNote()
        }
      });
      this.combatInitiatives.set(response.initiatives);
      this.gmInitiativeNote.set('');
      const activeCombat = this.activeCombat();
      const nextEntityId = activeCombat?.participantEntityIds.find((entityId) =>
        !response.initiatives.some((initiative) => initiative.entityId === entityId));
      this.gmInitiativeEntityId.set(nextEntityId ?? this.gmInitiativeEntityId());
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel lancar iniciativa.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleDraftCombatEntity(entityId: string, checked: boolean): void {
    this.combatState.toggleDraftCombatEntity(entityId, checked);
  }

  isDraftCombatEntitySelected(entityId: string): boolean {
    return this.draftCombatEntityIds().includes(entityId);
  }

  async createCombat(): Promise<void> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return;
    }

    if (this.draftCombatEntityIds().length === 0) {
      this.campaignMessage.set('Escolha as fichas envolvidas no combate.');
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ combat: CombatSession; campaign: Campaign }>(`/campaigns/${campaign.id}/combats`, {
        method: 'POST',
        body: {
          name: this.draftCombatName().trim() || 'Combate',
          entityIds: this.draftCombatEntityIds()
        }
      });
      this.combatState.upsertCombat(response.combat);
      this.selectedCampaign.set(response.campaign);
      this.entityStore.setCampaignContext(response.campaign.name, response.campaign.phase, response.campaign.activeCombatName);
      this.gmInitiativeEntityId.set(response.combat.participantEntityIds[0] ?? '');
      if (response.combat.participantEntityIds[0]) {
        this.selectEntity(response.combat.participantEntityIds[0]);
      }
      this.draftCombatName.set('');
      this.draftCombatEntityIds.set([]);
      await this.loadCombatInitiatives(campaign.id);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel criar o combate.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async startEncounterCombat(encounter: EncounterConfig): Promise<void> {
    const campaign = this.selectedCampaign();
    const entityIds = (encounter.entityIds ?? []).filter((id) => this.isCombatEntityId(id));

    if (!campaign) {
      return;
    }

    if (entityIds.length === 0) {
      this.campaignMessage.set('Este encontro nao tem fichas vinculadas.');
      return;
    }

    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ combat: CombatSession; campaign: Campaign }>(`/campaigns/${campaign.id}/combats`, {
        method: 'POST',
        body: {
          name: encounter.name,
          entityIds
        }
      });
      this.combatState.upsertCombat(response.combat);
      this.selectedCampaign.set(response.campaign);
      this.entityStore.setCampaignContext(response.campaign.name, response.campaign.phase, response.campaign.activeCombatName);
      this.activeEncounterId.set(encounter.id);
      this.boardSelectedEntityId.set(entityIds[0] ?? '');
      if (entityIds[0]) {
        this.selectEntity(entityIds[0]);
      }
      await this.loadCombatInitiatives(campaign.id);
      const firstWithoutInitiative = entityIds.find((id) => !this.combatInitiatives().some((i) => i.entityId === id));
      this.gmInitiativeEntityId.set(firstWithoutInitiative ?? entityIds[0] ?? '');
      this.isInitiativePopupOpen.set(true);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel iniciar o combate.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openCombatModal(): void {
    const combat = this.activeCombat();

    if (!combat) {
      this.campaignMessage.set('Nenhum combate ativo.');
      return;
    }

    if (!this.gmInitiativeEntityId()) {
      this.gmInitiativeEntityId.set(combat.participantEntityIds[0] ?? '');
    }

    if (!this.selectedCombatEntity(combat) && combat.participantEntityIds[0]) {
      this.selectEntity(combat.participantEntityIds[0]);
    }

    this.isCombatModalOpen.set(true);
  }

  closeCombatModal(): void {
    this.isCombatModalOpen.set(false);
  }

  async openCombatFromPopup(): Promise<void> {
    const combat = this.activeCombat();
    if (combat) {
      await this.generateTurnOrder(combat);
    }
    this.isInitiativePopupOpen.set(false);
    if (!this.isCombatModalOpen()) {
      this.isCombatModalOpen.set(true);
    }
  }

  closeInitiativePopup(): void {
    this.isInitiativePopupOpen.set(false);
  }

  getEntityInitiative(entityId: string): number | '' {
    return this.combatInitiatives().find((i) => i.entityId === entityId)?.value ?? '';
  }

  isTurnEntity(combat: CombatSession, entityId: string): boolean {
    return combat.turnOrderEntityIds[combat.currentTurnIndex] === entityId;
  }

  combatParticipantEntitiesSortedByInitiative(combat: CombatSession | null): Entity[] {
    const entities = this.combatParticipantEntities(combat);
    const initiatives = this.combatInitiatives();
    return [...entities].sort((a, b) => {
      const aVal = initiatives.find((i) => i.entityId === a.id)?.value ?? -Infinity;
      const bVal = initiatives.find((i) => i.entityId === b.id)?.value ?? -Infinity;
      return bVal - aVal;
    });
  }

  async updateEntityInitiative(entityId: string, rawValue: string): Promise<void> {
    const campaign = this.selectedCampaign();
    const value = Number(rawValue);

    if (!campaign || !entityId || isNaN(value)) {
      return;
    }

    const existingNote = this.combatInitiatives().find((i) => i.entityId === entityId)?.note ?? '';
    this.isLoading.set(true);

    try {
      const response = await this.apiRequest<{ initiatives: CombatInitiative[] }>(`/campaigns/${campaign.id}/combat/initiatives`, {
        method: 'POST',
        body: { entityId, value, note: existingNote }
      });
      this.combatInitiatives.set(response.initiatives);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel atualizar iniciativa.');
    } finally {
      this.isLoading.set(false);
    }
  }

  activeCombat(): CombatSession | null {
    const campaign = this.selectedCampaign();

    if (!campaign?.activeCombatId) {
      return null;
    }

    return this.combatState.activeCombat(campaign.activeCombatId);
  }

  combatParticipantNames(combat: CombatSession | null): string {
    if (!combat) {
      return '';
    }

    return combat.participantEntityIds
      .map((id) => this.entities().find((entity) => entity.id === id)?.baseState.name)
      .filter(Boolean)
      .join(', ');
  }

  combatParticipantEntities(combat: CombatSession | null): Entity[] {
    if (!combat) {
      return [];
    }

    return combat.participantEntityIds
      .map((id) => this.entities().find((entity) => entity.id === id))
      .filter((entity): entity is Entity => entity !== undefined && entity.type !== 'Ability');
  }

  selectedCombatEntity(combat: CombatSession | null): Entity | null {
    const participants = this.combatParticipantEntities(combat);
    const selected = this.selectedEntity();

    return selected
      ? participants.find((entity) => entity.id === selected.id) ?? participants[0] ?? null
      : participants[0] ?? null;
  }

  encounterEntityNames(encounter: EncounterConfig): string {
    return (encounter.entityIds ?? [])
      .map((id) => this.entities().find((entity) => entity.id === id)?.baseState.name)
      .filter(Boolean)
      .join(', ');
  }

  sessionEntityIds(session = this.selectedSessionConfig()): string[] {
    return session?.entityIds ?? this.entities().filter((entity) => entity.type !== 'Ability').map((entity) => entity.id);
  }

  sessionLoreNodeIds(session = this.selectedSessionConfig()): string[] {
    return session?.loreNodeIds ?? [];
  }

  sessionEntitiesByType(type: EntityType): Entity[] {
    const ids = this.sessionEntityIds();
    return this.entities().filter((entity) => ids.includes(entity.id) && entity.type === type);
  }

  sessionEncounterEntitiesByType(type: EntityType): Entity[] {
    const ids = this.sessionEntityIds();
    return this.entities().filter((entity) => ids.includes(entity.id) && entity.type === type);
  }

  sessionLoreNodes(): LoreNodeConfig[] {
    const campaign = this.selectedCampaign();
    const ids = this.sessionLoreNodeIds();

    return campaign?.settings.loreNodes.filter((node) => ids.includes(node.id)) ?? [];
  }

  isSessionEntitySelected(entityId: string): boolean {
    return this.sessionEntityIds().includes(entityId);
  }

  isSessionLoreSelected(nodeId: string): boolean {
    return this.sessionLoreNodeIds().includes(nodeId);
  }

  async toggleSessionEntity(entityId: string, checked: boolean): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.selectedSessionConfig();

    if (!campaign || !session) {
      return;
    }

    const entityIds = checked
      ? this.sessionEntityIds(session).includes(entityId) ? this.sessionEntityIds(session) : [...this.sessionEntityIds(session), entityId]
      : this.sessionEntityIds(session).filter((id) => id !== entityId);
    const encounters = session.encounters.map((encounter) => ({
      ...encounter,
      entityIds: (encounter.entityIds ?? []).filter((id) => entityIds.includes(id))
    }));
    const sessions = this.upsertSessionConfig(campaign.settings, { ...session, entityIds, encounters });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName);
  }

  async toggleSessionLore(nodeId: string, checked: boolean): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.selectedSessionConfig();

    if (!campaign || !session) {
      return;
    }

    const currentIds = this.sessionLoreNodeIds(session);
    const loreNodeIds = checked
      ? currentIds.includes(nodeId) ? currentIds : [...currentIds, nodeId]
      : currentIds.filter((id) => id !== nodeId);
    const sessions = this.upsertSessionConfig(campaign.settings, { ...session, loreNodeIds });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName);
  }

  encounterCombatEntities(): Entity[] {
    return this.entities().filter((entity) => entity.type !== 'Ability');
  }

  encounterCombatEntitiesByType(type: Exclude<EntityType, 'Ability'>): Entity[] {
    return this.encounterCombatEntities().filter((entity) => entity.type === type);
  }

  encounterSupportAbilities(): Entity[] {
    return this.entities().filter((entity) => entity.type === 'Ability');
  }

  activeEncounter(): EncounterConfig | null {
    const session = this.activeLobbySession();
    const activeId = this.activeEncounterId();

    return session?.encounters.find((encounter) => encounter.id === activeId) ?? null;
  }

  boardCells(encounter: EncounterConfig): Array<{ x: number; y: number; key: string }> {
    return this.combatState.boardCells(encounter);
  }

  boardEntityAt(encounter: EncounterConfig, x: number, y: number): Entity | null {
    return this.combatState.boardEntityAt(encounter, this.entities(), x, y);
  }

  isBoardEntitySelected(entityId: string): boolean {
    return this.boardSelectedEntityId() === entityId;
  }

  setBoardSelectedEntityId(entityId: string): void {
    this.boardSelectedEntityId.set(entityId);
  }

  async placeBoardEntity(encounter: EncounterConfig, x: number, y: number): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.activeLobbySession();
    const entityId = this.boardSelectedEntityId();

    if (!campaign || !session || !entityId) {
      return;
    }

    const nextEncounter = this.combatState.moveEntityOnBoard(encounter, entityId, x, y);
    const sessions = this.upsertSessionConfig(campaign.settings, {
      ...session,
      encounters: session.encounters.map((item) => item.id === encounter.id ? nextEncounter : item)
    });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName);
  }

  async removeBoardEntity(encounter: EncounterConfig): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.activeLobbySession();
    const entityId = this.boardSelectedEntityId();

    if (!campaign || !session || !entityId) {
      return;
    }

    const nextEncounter = this.combatState.removeEntityFromBoard(encounter, entityId);
    const sessions = this.upsertSessionConfig(campaign.settings, {
      ...session,
      encounters: session.encounters.map((item) => item.id === encounter.id ? nextEncounter : item)
    });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName);
  }

  combatTurnEntityName(combat: CombatSession | null, offset = 0): string {
    if (!combat || combat.turnOrderEntityIds.length === 0) {
      return 'Aguardando ordem';
    }

    const index = (combat.currentTurnIndex + offset + combat.turnOrderEntityIds.length) % combat.turnOrderEntityIds.length;
    const entityId = combat.turnOrderEntityIds[index];

    return this.entities().find((entity) => entity.id === entityId)?.baseState.name || 'Ficha removida';
  }

  combatTurnEntitySummary(combat: CombatSession | null, offset = 0): string {
    if (!combat || combat.turnOrderEntityIds.length === 0) {
      return 'Aguardando ordem';
    }

    const index = (combat.currentTurnIndex + offset + combat.turnOrderEntityIds.length) % combat.turnOrderEntityIds.length;
    const entityId = combat.turnOrderEntityIds[index];
    const name = this.entities().find((entity) => entity.id === entityId)?.baseState.name || 'Ficha removida';
    const initiative = this.combatInitiatives().find((item) => item.entityId === entityId);

    return initiative ? `${name} (${initiative.value})` : `${name} (sem iniciativa)`;
  }

  lobbyTurnEntityName(offset = 0): string {
    const state = this.lobbyState();
    const combat = state?.activeCombat;

    if (!state || !combat || combat.turnOrderEntityIds.length === 0) {
      return 'Aguardando ordem';
    }

    const index = (combat.currentTurnIndex + offset + combat.turnOrderEntityIds.length) % combat.turnOrderEntityIds.length;
    const entityId = combat.turnOrderEntityIds[index];

    return state.entities.find((entity) => entity.id === entityId)?.baseState.name || 'Ficha revelada';
  }

  lobbyBoardCells(): Array<{ x: number; y: number; key: string }> {
    const board = this.lobbyState()?.publicBoard;

    if (!board) {
      return [];
    }

    const cells: Array<{ x: number; y: number; key: string }> = [];

    for (let y = 0; y < board.height; y += 1) {
      for (let x = 0; x < board.width; x += 1) {
        cells.push({ x, y, key: `${x}-${y}` });
      }
    }

    return cells;
  }

  lobbyBoardEntityAt(x: number, y: number): LobbyEntity | null {
    const state = this.lobbyState();
    const positions = state?.publicBoard?.positions ?? {};
    const entityId = Object.keys(positions).find((id) => positions[id]?.x === x && positions[id]?.y === y);

    return entityId ? state?.entities.find((entity) => entity.id === entityId) ?? null : null;
  }

  async generateTurnOrder(combat: CombatSession): Promise<void> {
    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ combat: CombatSession }>(`/combats/${combat.id}/turn-order`, {
        method: 'POST'
      });
      this.replaceCombat(response.combat);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel gerar a ordem de turno.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async moveCombatTurn(combat: CombatSession, direction: 1 | -1): Promise<void> {
    if (combat.turnOrderEntityIds.length === 0) {
      return;
    }

    const nextIndex = (combat.currentTurnIndex + direction + combat.turnOrderEntityIds.length) % combat.turnOrderEntityIds.length;
    const roundNumber = direction > 0 && nextIndex === 0
      ? (combat.roundNumber || 1) + 1
      : direction < 0 && combat.currentTurnIndex === 0
        ? Math.max(1, (combat.roundNumber || 1) - 1)
        : combat.roundNumber || 1;

    await this.updateCombat(combat, { currentTurnIndex: nextIndex, roundNumber });
  }

  private async updateCombat(combat: CombatSession, patch: Partial<CombatSession>): Promise<void> {
    this.isLoading.set(true);
    this.campaignMessage.set('');

    try {
      const response = await this.apiRequest<{ combat: CombatSession }>(`/combats/${combat.id}`, {
        method: 'PATCH',
        body: patch
      });
      this.replaceCombat(response.combat);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel atualizar o combate.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private replaceCombat(combat: CombatSession): void {
    this.combatState.replaceCombat(combat);
  }

  setAction(action: HpAction): void {
    this.action.set(action);
    if (action === 'heal') {
      this.damageType.set('cura');
    } else if (this.damageType() === 'cura') {
      this.damageType.set('cortante');
    }
  }

  openHpActionModal(entity: Entity, action: 'damage' | 'heal'): void {
    this.setAction(action);
    this.hpActionModalEntity.set(entity);
    this.isHpActionModalOpen.set(true);
  }

  closeHpActionModal(): void {
    this.isHpActionModalOpen.set(false);
    this.hpActionModalEntity.set(null);
  }

  async applyHpFromModal(): Promise<void> {
    const entity = this.hpActionModalEntity();
    if (!entity) {
      return;
    }
    await this.applyHpChange(entity);
    this.closeHpActionModal();
  }

  openInitiativeEditor(): void {
    const combat = this.activeCombat();
    const entityIds = combat?.participantEntityIds ?? [];
    const firstWithoutInitiative = entityIds.find((id) => !this.combatInitiatives().some((i) => i.entityId === id));
    this.gmInitiativeEntityId.set(firstWithoutInitiative ?? entityIds[0] ?? '');
    this.isInitiativePopupOpen.set(true);
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
    this.draftAbilityTiming.set('instant');
    this.draftAbilityDamage.set(0);
    this.draftAbilityDamageType.set(this.campaignDamageTypes()[0]?.id ?? '');
    this.draftAbilityDurationRounds.set(0);
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
    this.draftAbilityTiming.set(entity.baseState.abilityTiming ?? 'instant');
    this.draftAbilityDamage.set(entity.baseState.abilityDamage ?? 0);
    this.draftAbilityDamageType.set(entity.baseState.abilityDamageType ?? this.campaignDamageTypes()[0]?.id ?? '');
    this.draftAbilityDurationRounds.set(entity.baseState.abilityDurationRounds ?? 0);
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

  setDraftEncounterBoardWidth(value: string): void {
    const parsed = Number(value);
    this.draftEncounterBoardWidth.set(Number.isFinite(parsed) && parsed > 0 ? Math.min(30, Math.floor(parsed)) : 8);
  }

  setDraftEncounterBoardHeight(value: string): void {
    const parsed = Number(value);
    this.draftEncounterBoardHeight.set(Number.isFinite(parsed) && parsed > 0 ? Math.min(30, Math.floor(parsed)) : 6);
  }

  setDraftEncounterBoardVisibility(value: string): void {
    this.draftEncounterBoardVisibility.set(value === 'public' ? 'public' : 'gmOnly');
  }

  setDraftRoundCounterName(value: string): void {
    this.draftRoundCounterName.set(value);
  }

  setDraftRoundCounterRounds(value: string): void {
    const parsed = Number(value);
    this.draftRoundCounterRounds.set(Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1);
  }

  setDraftRoundCounterVisibility(value: string): void {
    this.draftRoundCounterVisibility.set(value === 'public' ? 'public' : 'gmOnly');
  }

  addDraftRoundCounter(): void {
    const name = this.draftRoundCounterName().trim();

    if (!name) {
      this.campaignMessage.set('Informe o nome do contador.');
      return;
    }

    this.draftRoundCounters.update((counters) => [
      ...counters,
      {
        id: crypto.randomUUID(),
        name,
        rounds: this.draftRoundCounterRounds(),
        visibility: this.draftRoundCounterVisibility()
      }
    ]);
    this.draftRoundCounterName.set('');
    this.draftRoundCounterRounds.set(3);
    this.draftRoundCounterVisibility.set('gmOnly');
    this.campaignMessage.set('');
  }

  removeDraftRoundCounter(id: string): void {
    this.draftRoundCounters.update((counters) => counters.filter((counter) => counter.id !== id));
  }

  setDraftSessionName(value: string): void {
    this.draftSessionName.set(value);
  }

  setDraftSessionNotes(value: string): void {
    this.draftSessionNotes.set(value);
  }

  setDraftAbilityTiming(value: string): void {
    this.draftAbilityTiming.set(value === 'perRound' ? 'perRound' : 'instant');
  }

  setDraftAbilityDamage(value: string): void {
    const parsed = Number(value);
    this.draftAbilityDamage.set(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }

  setDraftAbilityDamageType(value: string): void {
    this.draftAbilityDamageType.set(value);
  }

  setDraftAbilityDurationRounds(value: string): void {
    const parsed = Number(value);
    this.draftAbilityDurationRounds.set(Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0);
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
    if (view !== 'dashboard') {
      this.configuringSessionId.set('');
    }
    this.workspaceView.set(view);
  }

  setLibraryFilter(filter: string): void {
    const allowed: LibraryFilter[] = ['all', 'PC', 'NPC', 'Enemy', 'Object', 'Ability'];
    this.libraryFilter.set(allowed.includes(filter as LibraryFilter) ? filter as LibraryFilter : 'all');
  }

  libraryFilterCount(filter: LibraryFilter): number {
    return filter === 'all'
      ? this.entities().length
      : this.entities().filter((entity) => entity.type === filter).length;
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

  toggleDraftEncounterEntity(entityId: string, checked: boolean): void {
    if (!this.isSessionEntityId(entityId)) {
      return;
    }

    this.draftEncounterEntityIds.update((ids) =>
      checked
        ? ids.includes(entityId) ? ids : [...ids, entityId]
        : ids.filter((id) => id !== entityId));
  }

  isDraftEncounterEntitySelected(entityId: string): boolean {
    return this.draftEncounterEntityIds().includes(entityId);
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
    if (entity.type === 'Ability') {
      return 0;
    }

    if (entity.baseState.maxHp <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (entity.sessionState.currentHp / entity.baseState.maxHp) * 100));
  }

  hpStateLabel(entity: Entity): string {
    if (entity.type === 'Ability') {
      return this.abilitySummary(entity);
    }

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

  abilitySummary(entity: Entity): string {
    const timing = entity.baseState.abilityTiming === 'perRound' ? 'por round' : 'instantanea';
    const damage = entity.baseState.abilityDamage ?? 0;
    const damageType = entity.baseState.abilityDamageType ? this.damageLabel(entity.baseState.abilityDamageType) : 'sem tipo';
    const rounds = entity.baseState.abilityDurationRounds ?? 0;

    return `${timing} · ${damage} ${damageType} · ${rounds} round(s)`;
  }

  entityListBadge(entity: Entity): string {
    return entity.type === 'Ability' ? 'Info' : String(entity.sessionState.currentHp);
  }

  entityListMeta(entity: Entity): string {
    return entity.type === 'Ability'
      ? this.abilitySummary(entity)
      : `${entity.type} · ${this.hpStateLabel(entity)}`;
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
      this.loreError.set('Informe o titulo do campo de lore.');
      return;
    }

    this.loreError.set('');

    const node: LoreNodeConfig = {
      id: crypto.randomUUID(),
      title,
      text: this.loreText().trim(),
      imageUrl: this.loreImageUrl().trim(),
      publishedToLobby: false,
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
    const node = this.currentLoreNodes().find((item) => item.id === id);
    const title = node?.title || 'este card';

    if (!confirm(`Remover "${title}" do mapa mental? As ligacoes desse card tambem serao removidas.`)) {
      return;
    }

    void this.updateLore({
      loreNodes: this.currentLoreNodes().filter((node) => node.id !== id),
      loreLinks: this.currentLoreLinks().filter((link) => link.fromId !== id && link.toId !== id)
    });
  }

  setLoreNodeVisibility(id: string, visibility: 'gm' | 'public'): void {
    const loreNodes = this.currentLoreNodes().map((node) =>
      node.id === id
        ? {
            ...node,
            publishedToLobby: visibility === 'public',
            isPublishedToLobby: visibility === 'public'
          }
        : node);

    void this.updateLore({ loreNodes, loreLinks: this.currentLoreLinks() });
  }

  loreNodeVisibility(node: LoreNodeConfig): 'gm' | 'public' {
    return node.publishedToLobby || node.isPublishedToLobby ? 'public' : 'gm';
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

  private isCombatEntityId(entityId: string): boolean {
    return this.entities().some((entity) => entity.id === entityId && entity.type !== 'Ability');
  }

  private isSessionEntityId(entityId: string): boolean {
    return this.sessionEntityIds().includes(entityId);
  }

  private resetEncounterDraft(): void {
    this.editingEncounterId.set('');
    this.draftEncounterName.set('');
    this.draftEncounterNotes.set('');
    this.draftEncounterEntityIds.set([]);
    this.draftEncounterBoardWidth.set(8);
    this.draftEncounterBoardHeight.set(6);
    this.draftEncounterBoardVisibility.set('gmOnly');
    this.draftRoundCounters.set([]);
    this.draftRoundCounterName.set('');
    this.draftRoundCounterRounds.set(3);
    this.draftRoundCounterVisibility.set('gmOnly');
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

    const gmLobbyCampaignId = this.gmLobbyCampaignId();
    const gmLobbyCampaign = response.campaigns.find((campaign) => campaign.id === gmLobbyCampaignId);

    if (gmLobbyCampaign) {
      await this.selectCampaign(gmLobbyCampaign);
    }

    const sessionConfigCampaignId = this.sessionConfigCampaignId();
    const sessionConfigCampaign = response.campaigns.find((campaign) => campaign.id === sessionConfigCampaignId);

    if (sessionConfigCampaign) {
      await this.selectCampaign(sessionConfigCampaign);
      const sessionId = this.sessionConfigInitialId();
      if (sessionId) {
        this.selectedSessionConfigId.set(sessionId);
        this.configuringSessionId.set(sessionId);
      }
    }
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

  private async loadCombatInitiatives(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ initiatives: CombatInitiative[] }>(`/campaigns/${campaignId}/combat/initiatives`);
      this.combatInitiatives.set(response.initiatives);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar iniciativas.');
    }
  }

  private async loadSessionRuns(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ sessionRuns: SessionRun[] }>(`/campaigns/${campaignId}/session-runs`);
      this.sessionRuns.set(response.sessionRuns);
      this.combatState.clearSelectedSessionRunIfMissing(response.sessionRuns);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar sessoes.');
    }
  }

  private async loadCombats(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ combats: CombatSession[] }>(`/campaigns/${campaignId}/combats`);
      this.combats.set(response.combats);
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel carregar combates.');
    }
  }

  private async loadLobbySettings(campaignId: string): Promise<void> {
    try {
      const response = await this.apiRequest<{ lobbySettings: LobbySettings }>(`/campaigns/${campaignId}/lobby/settings`);
      this.lobbySettings.set(response.lobbySettings);
      this.lobbyMaxParticipantsDraft.set(response.lobbySettings.maxParticipants);
      if (!response.lobbySettings.hasPassword) {
        this.savedLobbyPassword.set('');
      }
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
    return this.apiClient.request<T>(path, {
      ...options,
      token: this.token()
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (!options.skipAuth) {
      headers['Authorization'] = `Bearer ${this.token()}`;
    }

    if (options.lobbyToken) {
      headers['X-Lobby-Token'] = options.lobbyToken ?? '';
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

  private async saveCampaignSettings(settings: CampaignSettings, activeCombatName: string): Promise<boolean> {
    const campaign = this.selectedCampaign();

    if (!campaign) {
      return false;
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
      const savedCampaign: Campaign = {
        ...response.campaign,
        settings: {
          ...response.campaign.settings,
          ...settings
        }
      };
      this.campaignState.replaceCampaign(savedCampaign);
      this.entityStore.setCampaignContext(savedCampaign.name, savedCampaign.phase, savedCampaign.activeCombatName);
      this.resetEncounterDraft();
      return true;
    } catch (error) {
      this.campaignMessage.set(error instanceof Error ? error.message : 'Nao foi possivel salvar a sessao.');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  private ensureSelectedSessionConfig(campaign: Campaign): void {
    this.campaignState.ensureSelectedSessionConfig(campaign);
  }

  private upsertSessionConfig(settings: CampaignSettings, session: SessionConfig): SessionConfig[] {
    return this.campaignState.upsertSessionConfig(settings, session);
  }

  private sessionConfigsFromSettings(settings: CampaignSettings): SessionConfig[] {
    return this.campaignState.sessionConfigsFromSettings(settings);
  }

  private async saveActiveLobbySummary(): Promise<void> {
    const campaign = this.selectedCampaign();
    const session = this.activeLobbySession();

    if (!campaign || !session) {
      return;
    }

    const activeRun = this.sessionRuns().find((run) => run.status === 'active');
    const sessions = this.upsertSessionConfig(campaign.settings, {
      ...session,
      lastLobbySummary: this.lobbySummaryDraft().trim(),
      lastLobbyRunId: activeRun?.id || session.lastLobbyRunId || ''
    });

    await this.saveCampaignSettings({ ...campaign.settings, sessions, encounters: [] }, campaign.activeCombatName);
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
