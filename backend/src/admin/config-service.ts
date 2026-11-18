import { adminStore, FeatureFlagRecord } from '../db/repositories/admin-store';

export class ConfigService {
  public async getSettings(): Promise<Record<string, Record<string, unknown>>> {
    return adminStore.getAllSettings();
  }

  public async updateSettingsSection(
    sectionKey: string,
    updates: Record<string, unknown>,
    actorId: string
  ): Promise<Record<string, unknown>> {
    const allowedSections = [
      'general',
      'meeting_policies',
      'recording_policies',
      'registration_policies',
      'email_config',
      'notifications',
      'access_policies',
      'maintenance_mode',
    ];
    if (!allowedSections.includes(sectionKey)) {
      throw new Error(`Unknown configuration section: ${sectionKey}`);
    }
    return adminStore.upsertSetting(sectionKey, sectionKey, updates, actorId);
  }

  public async listFeatureFlags(): Promise<FeatureFlagRecord[]> {
    return adminStore.listFeatureFlags();
  }

  public async updateFeatureFlag(
    idOrKey: string,
    updates: { enabledGlobally?: boolean; orgOverrides?: Record<string, boolean> },
    actorId: string
  ): Promise<FeatureFlagRecord> {
    const updated = await adminStore.updateFeatureFlag(idOrKey, {
      enabled_globally: updates.enabledGlobally,
      org_overrides: updates.orgOverrides,
      updated_by: actorId,
    });
    if (!updated) {
      throw new Error('Feature flag not found');
    }
    return updated;
  }

  /**
   * Backend enforcement check for feature flags (supports global default + organization override).
   */
  public async isFeatureEnabled(flagKey: string, organizationId?: string | null): Promise<boolean> {
    const flags = await adminStore.listFeatureFlags();
    const flag = flags.find((f) => f.key === flagKey);
    if (!flag) return true;
    if (organizationId && flag.org_overrides && typeof flag.org_overrides[organizationId] === 'boolean') {
      return flag.org_overrides[organizationId];
    }
    return flag.enabled_globally;
  }

  public async isMaintenanceModeEnabled(): Promise<{ enabled: boolean; message: string }> {
    const settings = await adminStore.getAllSettings();
    const m = (settings.maintenance_mode || {}) as Record<string, unknown>;
    return {
      enabled: Boolean(m.enabled),
      message: typeof m.message === 'string' && m.message ? m.message : 'Platform is currently under maintenance.',
    };
  }
}

export const configService = new ConfigService();

