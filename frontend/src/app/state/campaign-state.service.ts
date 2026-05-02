import { Injectable, signal } from '@angular/core';
import { Campaign, CampaignSettings, CampaignSystem, createDefaultCampaignSettings, SessionConfig } from '../models/campaign.model';

@Injectable({ providedIn: 'root' })
export class CampaignStateService {
  readonly campaigns = signal<Campaign[]>([]);
  readonly selectedCampaign = signal<Campaign | null>(null);
  readonly isConfiguringCampaign = signal(false);
  readonly configStep = signal(1);
  readonly settingsDraft = signal<CampaignSettings>(createDefaultCampaignSettings('custom'));
  readonly newCampaignName = signal('');
  readonly newCampaignSystem = signal<CampaignSystem>('custom');
  readonly draftSessionName = signal('');
  readonly draftSessionNotes = signal('');
  readonly isSavingSessionConfig = signal(false);
  readonly selectedSessionConfigId = signal('');
  readonly configuringSessionId = signal('');
  readonly activeSessionConfigId = signal('');

  resetSelection(): void {
    this.selectedCampaign.set(null);
    this.isConfiguringCampaign.set(false);
    this.settingsDraft.set(createDefaultCampaignSettings('custom'));
    this.selectedSessionConfigId.set('');
    this.configuringSessionId.set('');
    this.activeSessionConfigId.set('');
  }

  selectCampaign(campaign: Campaign): void {
    this.selectedCampaign.set(campaign);
    this.settingsDraft.set(campaign.settings ?? createDefaultCampaignSettings(campaign.systemKey));
    this.ensureSelectedSessionConfig(campaign);
  }

  openConfiguration(campaign: Campaign): void {
    this.selectCampaign(campaign);
    this.configStep.set(1);
    this.isConfiguringCampaign.set(true);
  }

  replaceCampaign(campaign: Campaign): void {
    this.selectedCampaign.set(campaign);
    this.ensureSelectedSessionConfig(campaign);
    this.settingsDraft.set(campaign.settings);
    this.campaigns.set(this.campaigns().map((item) => item.id === campaign.id ? campaign : item));
  }

  removeCampaign(campaignId: string): void {
    this.campaigns.set(this.campaigns().filter((item) => item.id !== campaignId));

    if (this.selectedCampaign()?.id === campaignId) {
      this.resetSelection();
    }
  }

  campaignSessions(campaign = this.selectedCampaign()): SessionConfig[] {
    if (!campaign) {
      return [];
    }

    return this.sessionConfigsFromSettings(campaign.settings);
  }

  selectedSessionConfig(): SessionConfig | null {
    const sessions = this.campaignSessions();
    const selectedId = this.selectedSessionConfigId() || this.configuringSessionId();
    return sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  }

  activeLobbySession(): SessionConfig | null {
    const activeId = this.activeSessionConfigId() || this.selectedSessionConfigId();
    return this.campaignSessions().find((session) => session.id === activeId) ?? this.selectedSessionConfig();
  }

  ensureSelectedSessionConfig(campaign: Campaign): void {
    const sessions = this.sessionConfigsFromSettings(campaign.settings);

    if (sessions.length === 0) {
      this.selectedSessionConfigId.set('');
      this.configuringSessionId.set('');
      return;
    }

    const selected = this.selectedSessionConfigId();
    if (!sessions.some((session) => session.id === selected)) {
      this.selectedSessionConfigId.set(sessions[0].id);
    }
  }

  upsertSessionConfig(settings: CampaignSettings, session: SessionConfig): SessionConfig[] {
    const sessions = this.sessionConfigsFromSettings(settings);

    return sessions.some((item) => item.id === session.id)
      ? sessions.map((item) => item.id === session.id ? session : item)
      : [...sessions, session];
  }

  sessionConfigsFromSettings(settings: CampaignSettings): SessionConfig[] {
    const sessions = Array.isArray(settings.sessions) ? settings.sessions : [];
    const encounters = Array.isArray(settings.encounters) ? settings.encounters : [];

    if (sessions.length > 0) {
      return sessions;
    }

    if (encounters.length > 0) {
      return [{
        id: 'legacy-main-session',
        name: 'Sessao principal',
        notes: 'Sessao criada a partir dos encontros existentes.',
        entityIds: Array.from(new Set(encounters.flatMap((encounter) => encounter.entityIds ?? []))),
        loreNodeIds: [],
        encounters,
        lastLobbySummary: ''
      }];
    }

    return [];
  }
}
