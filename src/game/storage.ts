import {
  DAILY_MISSIONS,
  DailyMissionsState,
  MissionId,
  PlayerProgress,
  SkinId,
  UpgradeLevels,
} from './types';

const STORAGE_KEY = 'sheru_bhai_runner_progress_v1';

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createFreshDailyMissions(dateKey = getTodayDateKey()): DailyMissionsState {
  const items = {} as Record<MissionId, { progress: number; claimed: boolean }>;
  for (const mission of DAILY_MISSIONS) {
    items[mission.id] = { progress: 0, claimed: false };
  }
  return { dateKey, items };
}

export function ensureCurrentDailyMissions(
  existing?: Partial<DailyMissionsState> | null
): DailyMissionsState {
  const today = getTodayDateKey();
  if (!existing || existing.dateKey !== today || !existing.items) {
    return createFreshDailyMissions(today);
  }
  const items = {} as Record<MissionId, { progress: number; claimed: boolean }>;
  for (const mission of DAILY_MISSIONS) {
    const saved = existing.items[mission.id];
    items[mission.id] = {
      progress:
        typeof saved?.progress === 'number'
          ? Math.max(0, Math.min(mission.target, Math.floor(saved.progress)))
          : 0,
      claimed: Boolean(saved?.claimed),
    };
  }
  return { dateKey: today, items };
}

const DEFAULT_PROGRESS: PlayerProgress = {
  totalCoins: 0,
  highScore: 0,
  bestDistance: 0,
  unlockedSkins: ['classic'],
  equippedSkin: 'classic',
  upgrades: {
    magnet: 1,
    shield: 1,
    multiplier: 1,
  },
  muted: false,
  dailyMissions: createFreshDailyMissions(),
};

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PROGRESS,
        upgrades: { ...DEFAULT_PROGRESS.upgrades },
        dailyMissions: createFreshDailyMissions(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      totalCoins: typeof parsed.totalCoins === 'number' ? parsed.totalCoins : 0,
      highScore: typeof parsed.highScore === 'number' ? parsed.highScore : 0,
      bestDistance: typeof parsed.bestDistance === 'number' ? parsed.bestDistance : 0,
      unlockedSkins: Array.isArray(parsed.unlockedSkins) && parsed.unlockedSkins.length > 0
        ? (parsed.unlockedSkins as SkinId[])
        : ['classic'],
      equippedSkin: parsed.equippedSkin || 'classic',
      upgrades: {
        magnet: parsed.upgrades?.magnet ?? 1,
        shield: parsed.upgrades?.shield ?? 1,
        multiplier: parsed.upgrades?.multiplier ?? 1,
      },
      muted: Boolean(parsed.muted),
      dailyMissions: ensureCurrentDailyMissions(parsed.dailyMissions),
    };
  } catch {
    return {
      ...DEFAULT_PROGRESS,
      upgrades: { ...DEFAULT_PROGRESS.upgrades },
      dailyMissions: createFreshDailyMissions(),
    };
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

export function getMagnetDuration(level: number): number {
  return 7 + (level - 1) * 2.5; // 7s up to 17s
}

export function getMultiplierDuration(level: number): number {
  return 8 + (level - 1) * 2.5; // 8s up to 18s
}

export function getShieldBonusDuration(level: number): number {
  return 1.2 + (level - 1) * 0.4; // Grace invincibility seconds after shield break
}

export function getUpgradeCost(currentLevel: number): number {
  return currentLevel * 45;
}

export function isMaxLevel(level: number): boolean {
  return level >= 5;
}

export function getUpgradeLabel(key: keyof UpgradeLevels): string {
  switch (key) {
    case 'magnet':
      return 'Chumbak (Coin Magnet)';
    case 'multiplier':
      return '2x Sikke Boost';
    case 'shield':
      return 'Kavach Grace Time';
  }
}
