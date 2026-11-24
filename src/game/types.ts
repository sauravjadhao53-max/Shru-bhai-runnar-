export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'REVIVE_COUNTDOWN' | 'GAME_OVER';

export type Lane = 0 | 1 | 2;

export type ObstacleType = 'TRAIN' | 'MOVING_TRAIN' | 'LOW_BARRIER' | 'HIGH_GANTRY';

export type CollectibleType = 'COIN' | 'MAGNET' | 'SHIELD' | 'MULTIPLIER';

export type SkinId = 'classic' | 'chashma' | 'raja' | 'turbo';

export interface SheruSkin {
  id: SkinId;
  name: string;
  tagline: string;
  price: number;
  maneColor: string;
  maneHighlight: string;
  furColor: string;
  jacketColor: string;
  accentColor: string;
  hasShades?: boolean;
  hasCrown?: boolean;
  hasFlameAura?: boolean;
}

export interface UpgradeLevels {
  magnet: number;     // 1 to 5
  shield: number;     // 1 to 5
  multiplier: number; // 1 to 5
}

export type MissionId =
  | 'collect_100_coins_run'
  | 'jump_5_barriers'
  | 'slide_4_gantries'
  | 'run_350m_run';

export interface DailyMissionItem {
  id: MissionId;
  title: string;
  subtitle: string;
  target: number;
  reward: number;
  mode: 'single_run' | 'cumulative';
}

export interface DailyMissionProgress {
  progress: number;
  claimed: boolean;
}

export interface DailyMissionsState {
  dateKey: string;
  items: Record<MissionId, DailyMissionProgress>;
}

export const DAILY_MISSIONS: DailyMissionItem[] = [
  {
    id: 'collect_100_coins_run',
    title: 'Collect 100 coins in one run',
    subtitle: 'Ek hi daud me 100 sikke jama karo',
    target: 100,
    reward: 60,
    mode: 'single_run',
  },
  {
    id: 'jump_5_barriers',
    title: 'Jump over 5 barriers',
    subtitle: '5 barriers ke upar se jump karo',
    target: 5,
    reward: 45,
    mode: 'cumulative',
  },
  {
    id: 'slide_4_gantries',
    title: 'Slide under 4 gantries',
    subtitle: '4 signal gantries ke neeche se slide karo',
    target: 4,
    reward: 40,
    mode: 'cumulative',
  },
  {
    id: 'run_350m_run',
    title: 'Run 350m in one run',
    subtitle: 'Ek hi run me 350 meter daud lagao',
    target: 350,
    reward: 55,
    mode: 'single_run',
  },
];

export interface PlayerProgress {
  totalCoins: number;
  highScore: number;
  bestDistance: number;
  unlockedSkins: SkinId[];
  equippedSkin: SkinId;
  upgrades: UpgradeLevels;
  muted: boolean;
  dailyMissions: DailyMissionsState;
}

export interface Obstacle {
  id: number;
  lane: Lane;
  z: number;       // 0 = player plane, 1.0 = horizon
  length: number;  // depth span in z units
  type: ObstacleType;
  speedMult: number; // 1.0 for stationary relative to world, >1.0 for oncoming moving train
  passed: boolean;
  hornPlayed?: boolean;
  colorScheme: number;
  hasRamp?: boolean;
  rampLength?: number;
}

export interface Collectible {
  id: number;
  lane: Lane;
  z: number;
  yOffset: number; // 0 = ground, >0 = elevated (arc over barrier)
  type: CollectibleType;
  collected: boolean;
  magnetized?: boolean;
  visualXOffset?: number; // used when pulled by magnet
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface PlayerState {
  lane: Lane;
  visualLane: number; // smoothly interpolated between 0, 1, 2
  y: number;          // height above ground (0 = grounded)
  vy: number;         // vertical velocity
  floorY: number;     // current supporting floor height (0 = track, >0 = train roof/ramp)
  isJumping: boolean;
  slideTimer: number; // > 0 means currently sliding
  runPhase: number;
  invincibleTimer: number; // brief grace period after shield break or revive
  hasShield: boolean;
  magnetTimer: number;
  multiplierTimer: number;
  skateTimer: number;      // 30s hoverboard/skate protection
  skateCooldown: number;   // recharge timer after skate ends
}

export interface HudSnapshot {
  score: number;
  runCoins: number;
  distance: number;
  speedKmh: number;
  hasShield: boolean;
  magnetTimeLeft: number;
  multiplierTimeLeft: number;
  multiplierMaxTime: number;
  magnetMaxTime: number;
  comboCount: number;
  skateTimeLeft: number;
  skateCooldownLeft: number;
}

export const SHERU_SKINS: SheruSkin[] = [
  {
    id: 'classic',
    name: 'Desi Sheru',
    tagline: 'Original Mumbai-track king',
    price: 0,
    maneColor: '#B45309',
    maneHighlight: '#F59E0B',
    furColor: '#FBBF24',
    jacketColor: '#DC2626',
    accentColor: '#FFCC00',
  },
  {
    id: 'chashma',
    name: 'Swag Sheru',
    tagline: 'Kaala chashma & neon vest',
    price: 80,
    maneColor: '#92400E',
    maneHighlight: '#FBBF24',
    furColor: '#FCD34D',
    jacketColor: '#1D4ED8',
    accentColor: '#38BDF8',
    hasShades: true,
  },
  {
    id: 'raja',
    name: 'Maharaja Sheru',
    tagline: 'Shahi taaj & royal cape',
    price: 180,
    maneColor: '#7C2D12',
    maneHighlight: '#F59E0B',
    furColor: '#FDE047',
    jacketColor: '#7E22CE',
    accentColor: '#FACC15',
    hasCrown: true,
  },
  {
    id: 'turbo',
    name: 'Turbo Sheru',
    tagline: 'Agni mane & supercharged dash',
    price: 350,
    maneColor: '#DC2626',
    maneHighlight: '#FB923C',
    furColor: '#FBBF24',
    jacketColor: '#0F172A',
    accentColor: '#F97316',
    hasShades: true,
    hasFlameAura: true,
  },
];
