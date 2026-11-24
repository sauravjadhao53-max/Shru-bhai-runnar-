import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Coins,
  Magnet,
  Pause,
  Play,
  Shield,
  ShoppingBag,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Tv,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AdMobMissionGateModal,
  DailyMissionsModal,
} from './components/DailyMissionsModal';
import { ShopModal } from './components/ShopModal';
import { isOnlineForAdMob, tryShowNativeAdMobRewarded } from './game/admob';
import { project, renderGame } from './game/renderer';
import { sound } from './game/sound';
import { resetEntityIds, spawnWave } from './game/spawner';
import {
  ensureCurrentDailyMissions,
  getMagnetDuration,
  getMultiplierDuration,
  getShieldBonusDuration,
  loadProgress,
  saveProgress,
} from './game/storage';
import {
  Collectible,
  DAILY_MISSIONS,
  FloatingText,
  GameState,
  HudSnapshot,
  Lane,
  MissionId,
  Obstacle,
  Particle,
  PlayerProgress,
  PlayerState,
  SHERU_SKINS,
  SkinId,
  UpgradeLevels,
} from './game/types';

const INITIAL_MESSAGE = 'Sheru Bhai bhag raha hai! Train se bacho, Coin lo!';
const REVIVE_COST = 25;

const NEAR_MISS_LINES = [
  'Arre waah! Bal-bal bache Sheru Bhai!',
  'Kya dodge kiya! Ekdum filmy style!',
  'Sheru ki speed ke aage train bhi fail!',
];

const COIN_STREAK_LINES = [
  'Paisa hi paisa hoga! Shabash Sheru!',
  'Chamak rahe hain sikke! Chal bhagte reh!',
  'Sikke loot liye! Sheru Bhai rocks!',
];

function createInitialPlayer(): PlayerState {
  return {
    lane: 1,
    visualLane: 1,
    y: 0,
    vy: 0,
    floorY: 0,
    isJumping: false,
    slideTimer: 0,
    runPhase: 0,
    invincibleTimer: 0,
    hasShield: false,
    magnetTimer: 0,
    multiplierTimer: 0,
    skateTimer: 0,
    skateCooldown: 0,
  };
}

export default function App() {
  const [progress, setProgress] = useState<PlayerProgress>(() => {
    const loaded = loadProgress();
    sound.setMuted(loaded.muted);
    return loaded;
  });

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [message, setMessage] = useState<string>(INITIAL_MESSAGE);
  const [shopOpen, setShopOpen] = useState<boolean>(false);
  const [missionsOpen, setMissionsOpen] = useState<boolean>(false);
  const [missionAdOpen, setMissionAdOpen] = useState<boolean>(false);
  const [missionAdSecondsLeft, setMissionAdSecondsLeft] = useState<number>(5);
  const [missionAdOffline, setMissionAdOffline] = useState<boolean>(false);
  const [freeChanceUsed, setFreeChanceUsed] = useState<boolean>(false);
  const [adChanceUsed, setAdChanceUsed] = useState<boolean>(false);
  const [coinReviveUsed, setCoinReviveUsed] = useState<boolean>(false);
  const [reviveTimer, setReviveTimer] = useState<number>(10);
  const [adModalOpen, setAdModalOpen] = useState<boolean>(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState<number>(5);
  const [lastRunSummary, setLastRunSummary] = useState<{
    score: number;
    coins: number;
    distance: number;
    isNewBest: boolean;
  } | null>(null);

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    runCoins: 0,
    distance: 0,
    speedKmh: 38,
    hasShield: false,
    magnetTimeLeft: 0,
    multiplierTimeLeft: 0,
    multiplierMaxTime: 8,
    magnetMaxTime: 7,
    comboCount: 0,
    skateTimeLeft: 0,
    skateCooldownLeft: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Mutable simulation refs for smooth 60fps loop without React re-render lag
  const gameStateRef = useRef<GameState>('TITLE_MENU');
  const progressRef = useRef<PlayerProgress>(progress);
  const playerRef = useRef<PlayerState>(createInitialPlayer());
  const obstaclesRef = useRef<Obstacle[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  const worldScrollRef = useRef<number>(0);
  const distanceRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const runCoinsRef = useRef<number>(0);
  const spawnCooldownRef = useRef<number>(0.3);
  const speedMilestoneRef = useRef<number>(1);
  const comboRef = useRef<{ count: number; timer: number }>({ count: 0, timer: 0 });
  const shakeTimerRef = useRef<number>(0);
  const lastHudSyncRef = useRef<number>(0);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 800, height: 480 });
  const chancesRef = useRef<{ freeUsed: boolean; adUsed: boolean; coinUsed: boolean }>({
    freeUsed: false,
    adUsed: false,
    coinUsed: false,
  });
  const runMissionFlagsRef = useRef<{ hit100Coins: boolean; hit350m: boolean }>({
    hit100Coins: false,
    hit350m: false,
  });

  // Touch / hand drag & double-tap tracking
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    active: boolean;
    didSwipe: boolean;
    lastActionTime: number;
  }>({
    x: 0,
    y: 0,
    active: false,
    didSwipe: false,
    lastActionTime: 0,
  });
  const lastTapTimeRef = useRef<number>(0);

  useEffect(() => {
    progressRef.current = progress;
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const equippedSkin =
    SHERU_SKINS.find((s) => s.id === progress.equippedSkin) || SHERU_SKINS[0];

  const currentDailyMissions = ensureCurrentDailyMissions(progress.dailyMissions);
  const claimableMissionsCount = DAILY_MISSIONS.filter((m) => {
    const state = currentDailyMissions.items[m.id];
    return state && state.progress >= m.target && !state.claimed;
  }).length;

  const recordMissionEvents = useCallback(
    (opts: {
      barrierDelta?: number;
      gantryDelta?: number;
      runCoins?: number;
      runDistance?: number;
    }) => {
      setProgress((prev) => {
        const missions = ensureCurrentDailyMissions(prev.dailyMissions);
        const nextItems = { ...missions.items };
        let changed = missions.dateKey !== prev.dailyMissions?.dateKey;

        if (opts.barrierDelta && opts.barrierDelta > 0) {
          const prevVal = nextItems.jump_5_barriers.progress;
          const nextVal = Math.min(5, prevVal + opts.barrierDelta);
          if (nextVal !== prevVal) {
            nextItems.jump_5_barriers = { ...nextItems.jump_5_barriers, progress: nextVal };
            changed = true;
          }
        }

        if (opts.gantryDelta && opts.gantryDelta > 0) {
          const prevVal = nextItems.slide_4_gantries.progress;
          const nextVal = Math.min(4, prevVal + opts.gantryDelta);
          if (nextVal !== prevVal) {
            nextItems.slide_4_gantries = { ...nextItems.slide_4_gantries, progress: nextVal };
            changed = true;
          }
        }

        if (typeof opts.runCoins === 'number') {
          const prevVal = nextItems.collect_100_coins_run.progress;
          const nextVal = Math.min(100, Math.max(prevVal, Math.floor(opts.runCoins)));
          if (nextVal !== prevVal) {
            nextItems.collect_100_coins_run = {
              ...nextItems.collect_100_coins_run,
              progress: nextVal,
            };
            changed = true;
          }
        }

        if (typeof opts.runDistance === 'number') {
          const prevVal = nextItems.run_350m_run.progress;
          const nextVal = Math.min(350, Math.max(prevVal, Math.floor(opts.runDistance)));
          if (nextVal !== prevVal) {
            nextItems.run_350m_run = {
              ...nextItems.run_350m_run,
              progress: nextVal,
            };
            changed = true;
          }
        }

        if (!changed) return prev;
        return {
          ...prev,
          dailyMissions: {
            dateKey: missions.dateKey,
            items: nextItems,
          },
        };
      });
    },
    []
  );

  const spawnBurst = useCallback(
    (x: number, y: number, color: string, count = 10, spread = 140) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * spread;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          size: 3 + Math.random() * 4,
          color,
        });
      }
    },
    []
  );

  const addFloatingText = useCallback((x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({
      x,
      y,
      text,
      color,
      life: 0.85,
      maxLife: 0.85,
    });
  }, []);

  const startNewRun = useCallback(() => {
    sound.unlock();
    sound.playClick();
    resetEntityIds();
    playerRef.current = createInitialPlayer();
    obstaclesRef.current = [];
    collectiblesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    worldScrollRef.current = 0;
    distanceRef.current = 0;
    scoreRef.current = 0;
    runCoinsRef.current = 0;
    spawnCooldownRef.current = 0.22;
    speedMilestoneRef.current = 1;
    comboRef.current = { count: 0, timer: 0 };
    shakeTimerRef.current = 0;

    setFreeChanceUsed(false);
    setAdChanceUsed(false);
    setCoinReviveUsed(false);
    chancesRef.current = { freeUsed: false, adUsed: false, coinUsed: false };
    runMissionFlagsRef.current = { hit100Coins: false, hit350m: false };
    setReviveTimer(10);
    setAdModalOpen(false);
    setAdSecondsLeft(5);
    setLastRunSummary(null);
    setShopOpen(false);
    setMissionsOpen(false);
    setMissionAdOpen(false);
    setMessage(INITIAL_MESSAGE);
    setHud({
      score: 0,
      runCoins: 0,
      distance: 0,
      speedKmh: 38,
      hasShield: false,
      magnetTimeLeft: 0,
      multiplierTimeLeft: 0,
      multiplierMaxTime: getMultiplierDuration(progressRef.current.upgrades.multiplier),
      magnetMaxTime: getMagnetDuration(progressRef.current.upgrades.magnet),
      comboCount: 0,
      skateTimeLeft: 0,
      skateCooldownLeft: 0,
    });
    setGameState('PLAYING');
  }, []);

  const handleMove = useCallback((delta: -1 | 1) => {
    if (gameStateRef.current !== 'PLAYING') return;
    sound.unlock();
    const player = playerRef.current;
    const nextLane = Math.max(0, Math.min(2, player.lane + delta)) as Lane;
    if (nextLane !== player.lane) {
      player.lane = nextLane;
      sound.playLaneSwitch();
    }
  }, []);

  const handleJump = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    sound.unlock();
    const player = playerRef.current;
    if (!player.isJumping || player.y <= player.floorY + 0.06) {
      player.isJumping = true;
      player.vy = 3.35;
      player.slideTimer = 0;
      sound.playJump();
      const { width, height } = canvasSizeRef.current;
      const p = project(player.visualLane, 0, width, height);
      spawnBurst(p.x, p.y - player.floorY * 100, '#E2E8F0', 7, 80);
    }
  }, [spawnBurst]);

  const handleSlide = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    sound.unlock();
    const player = playerRef.current;
    if (player.isJumping) {
      // Fast-fall slam into slide!
      player.vy = Math.min(player.vy, -4.6);
      player.slideTimer = 0.65;
    } else {
      player.slideTimer = 0.68;
    }
    sound.playSlide();
    const { width, height } = canvasSizeRef.current;
    const p = project(player.visualLane, 0, width, height);
    spawnBurst(p.x, p.y, '#CBD5E1', 6, 90);
  }, [spawnBurst]);

  const activateSkate = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    sound.unlock();
    const player = playerRef.current;

    if (player.skateTimer > 0) return;
    if (player.skateCooldown > 0) {
      setMessage(`Skate recharge ho raha hai (${Math.ceil(player.skateCooldown)}s)!`);
      return;
    }

    player.skateTimer = 30;
    sound.playPowerup();
    const { width, height } = canvasSizeRef.current;
    const p = project(player.visualLane, 0, width, height);
    spawnBurst(p.x, p.y - 10, '#38BDF8', 16, 160);
    addFloatingText(p.x, p.y - 95, 'SKATE ON! 30s', '#38BDF8');
    setMessage('Skate nikal gaya! 30 second tak gaadi se takkar par ek chance!');
  }, [addFloatingText, spawnBurst]);

  const handleTogglePause = useCallback(() => {
    sound.unlock();
    sound.playClick();
    if (gameStateRef.current === 'PLAYING') {
      recordMissionEvents({
        runCoins: runCoinsRef.current,
        runDistance: distanceRef.current,
      });
      setGameState('PAUSED');
      setMessage('Sheru Bhai thoda saans le raha hai...');
    } else if (gameStateRef.current === 'PAUSED') {
      setGameState('PLAYING');
      setMessage('Chalo phir daud lagao Sheru Bhai!');
    }
  }, [recordMissionEvents]);

  const finalizeGameOver = useCallback(() => {
    const finalScore = Math.floor(scoreRef.current);
    const earnedCoins = runCoinsRef.current;
    const finalDist = Math.floor(distanceRef.current);
    const beatHigh = finalScore > progressRef.current.highScore;

    setLastRunSummary({
      score: finalScore,
      coins: earnedCoins,
      distance: finalDist,
      isNewBest: beatHigh,
    });
    setProgress((prev) => {
      const missions = ensureCurrentDailyMissions(prev.dailyMissions);
      const nextItems = {
        ...missions.items,
        collect_100_coins_run: {
          ...missions.items.collect_100_coins_run,
          progress: Math.min(
            100,
            Math.max(missions.items.collect_100_coins_run.progress, earnedCoins)
          ),
        },
        run_350m_run: {
          ...missions.items.run_350m_run,
          progress: Math.min(350, Math.max(missions.items.run_350m_run.progress, finalDist)),
        },
      };

      return {
        ...prev,
        totalCoins: prev.totalCoins + earnedCoins,
        highScore: Math.max(prev.highScore, finalScore),
        bestDistance: Math.max(prev.bestDistance, finalDist),
        dailyMissions: {
          dateKey: missions.dateKey,
          items: nextItems,
        },
      };
    });

    setHud((prev) => ({
      ...prev,
      score: finalScore,
      runCoins: earnedCoins,
      distance: finalDist,
      hasShield: false,
      magnetTimeLeft: 0,
      multiplierTimeLeft: 0,
      skateTimeLeft: 0,
      skateCooldownLeft: 0,
    }));

    setAdModalOpen(false);
    setMessage('Takkar ho gayi! Phir se PLAY dabao aur record todo!');
    setGameState('TITLE_MENU');
  }, []);

  const resumeWithChance = useCallback((bannerText: string) => {
    sound.unlock();
    sound.playPowerup();

    // Clear nearby obstacles safely so Sheru doesn't instantly crash again
    obstaclesRef.current = obstaclesRef.current.filter((o) => o.z > 0.38);
    playerRef.current.invincibleTimer = 2.5;
    playerRef.current.y = 0;
    playerRef.current.vy = 0;
    playerRef.current.floorY = 0;
    playerRef.current.isJumping = false;
    playerRef.current.slideTimer = 0;

    setAdModalOpen(false);
    setMessage(bannerText);
    setGameState('PLAYING');
  }, []);

  const handleUseFreeChance = useCallback(() => {
    if (freeChanceUsed) return;
    chancesRef.current.freeUsed = true;
    setFreeChanceUsed(true);
    resumeWithChance('Ek Chance mil gaya! Sheru Bhai wapas daud raha hai!');
  }, [freeChanceUsed, resumeWithChance]);

  const handleStartAdChance = useCallback(() => {
    if (adChanceUsed) return;
    sound.unlock();
    sound.playClick();
    setAdSecondsLeft(5);
    setAdModalOpen(true);
  }, [adChanceUsed]);

  const handleClaimAdChance = useCallback(() => {
    if (adSecondsLeft > 0 || adChanceUsed) return;
    chancesRef.current.adUsed = true;
    setAdChanceUsed(true);
    resumeWithChance('Ad dekh ke Free Chance mil gaya! Bhaago Sheru!');
  }, [adSecondsLeft, adChanceUsed, resumeWithChance]);

  const handleUseCoinChance = useCallback(() => {
    if (coinReviveUsed || progressRef.current.totalCoins < REVIVE_COST) return;
    chancesRef.current.coinUsed = true;
    setCoinReviveUsed(true);
    setProgress((prev) => ({
      ...prev,
      totalCoins: prev.totalCoins - REVIVE_COST,
    }));
    resumeWithChance('25 Coins se Chance mil gaya! Daud jaari rakho!');
  }, [coinReviveUsed, resumeWithChance]);

  // 10-second countdown timer on crash (pauses while watching Ad)
  useEffect(() => {
    if (gameState !== 'REVIVE_COUNTDOWN' || adModalOpen) return;
    if (reviveTimer <= 0) {
      finalizeGameOver();
      return;
    }
    const timer = window.setTimeout(() => {
      setReviveTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [gameState, reviveTimer, adModalOpen, finalizeGameOver]);

  // 5-second Rewarded Ad playback timer (for revive)
  useEffect(() => {
    if (!adModalOpen || adSecondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setAdSecondsLeft((s) => {
        const next = Math.max(0, s - 1);
        if (next === 0) sound.playPowerup();
        return next;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [adModalOpen, adSecondsLeft]);

  // 5-second AdMob Ad timer to unlock & open Daily Missions
  useEffect(() => {
    if (!missionAdOpen || missionAdOffline) return;
    if (missionAdSecondsLeft > 0) {
      const timer = window.setTimeout(() => {
        setMissionAdSecondsLeft((s) => {
          const next = Math.max(0, s - 1);
          if (next === 0) sound.playPowerup();
          return next;
        });
      }, 1000);
      return () => window.clearTimeout(timer);
    }

    const openTimer = window.setTimeout(() => {
      setMissionAdOpen(false);
      setMissionsOpen(true);
    }, 650);
    return () => window.clearTimeout(openTimer);
  }, [missionAdOpen, missionAdOffline, missionAdSecondsLeft]);

  const handleRequestDailyMissions = useCallback(async () => {
    sound.unlock();
    sound.playClick();

    if (!isOnlineForAdMob()) {
      setMissionAdOffline(true);
      setMissionAdOpen(true);
      return;
    }

    const nativeResult = await tryShowNativeAdMobRewarded();
    if (nativeResult === 'native_rewarded') {
      sound.playPowerup();
      setMissionsOpen(true);
      return;
    }
    if (nativeResult === 'native_dismissed') {
      setMessage('AdMob ad poora dekho Daily Missions kholne ke liye!');
      return;
    }

    setMissionAdOffline(false);
    setMissionAdSecondsLeft(5);
    setMissionAdOpen(true);
  }, []);

  const handleOpenMissionsFromAd = useCallback(() => {
    if (missionAdSecondsLeft > 0 || missionAdOffline) return;
    sound.playClick();
    setMissionAdOpen(false);
    setMissionsOpen(true);
  }, [missionAdSecondsLeft, missionAdOffline]);

  const handleClaimMission = useCallback((missionId: MissionId, reward: number) => {
    sound.unlock();
    sound.playPowerup();
    setProgress((prev) => {
      const missions = ensureCurrentDailyMissions(prev.dailyMissions);
      const missionDef = DAILY_MISSIONS.find((m) => m.id === missionId);
      const item = missions.items[missionId];
      if (!missionDef || !item || item.claimed || item.progress < missionDef.target) {
        return prev;
      }
      return {
        ...prev,
        totalCoins: prev.totalCoins + reward,
        dailyMissions: {
          dateKey: missions.dateKey,
          items: {
            ...missions.items,
            [missionId]: { ...item, claimed: true },
          },
        },
      };
    });
  }, []);

  const toggleMute = useCallback(() => {
    setProgress((prev) => {
      const nextMuted = !prev.muted;
      sound.setMuted(nextMuted);
      if (!nextMuted) {
        sound.unlock();
        sound.playClick();
      }
      return { ...prev, muted: nextMuted };
    });
  }, []);

  const handleBuySkin = useCallback((skinId: SkinId, price: number) => {
    sound.unlock();
    sound.playPowerup();
    setProgress((prev) => {
      if (prev.totalCoins < price || prev.unlockedSkins.includes(skinId)) return prev;
      return {
        ...prev,
        totalCoins: prev.totalCoins - price,
        unlockedSkins: [...prev.unlockedSkins, skinId],
        equippedSkin: skinId,
      };
    });
  }, []);

  const handleEquipSkin = useCallback((skinId: SkinId) => {
    sound.unlock();
    sound.playClick();
    setProgress((prev) => {
      if (!prev.unlockedSkins.includes(skinId)) return prev;
      return { ...prev, equippedSkin: skinId };
    });
  }, []);

  const handleUpgradePowerup = useCallback((key: keyof UpgradeLevels, cost: number) => {
    sound.unlock();
    sound.playPowerup();
    setProgress((prev) => {
      const curr = prev.upgrades[key];
      if (curr >= 5 || prev.totalCoins < cost) return prev;
      return {
        ...prev,
        totalCoins: prev.totalCoins - cost,
        upgrades: {
          ...prev.upgrades,
          [key]: curr + 1,
        },
      };
    });
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shopOpen || missionsOpen || missionAdOpen) {
        if (e.key === 'Escape') {
          if (shopOpen) setShopOpen(false);
          if (missionsOpen) setMissionsOpen(false);
          if (missionAdOpen && (missionAdOffline || missionAdSecondsLeft <= 0)) {
            setMissionAdOpen(false);
          }
        }
        return;
      }

      if (gameStateRef.current === 'TITLE_MENU') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (gameStateRef.current !== 'PLAYING') return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          handleMove(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          handleMove(1);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ':
          e.preventDefault();
          handleJump();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          handleSlide();
          break;
        case 'h':
        case 'H':
        case 'Shift':
          e.preventDefault();
          activateSkate();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    shopOpen,
    missionsOpen,
    missionAdOpen,
    missionAdOffline,
    missionAdSecondsLeft,
    startNewRun,
    handleTogglePause,
    handleMove,
    handleJump,
    handleSlide,
    activateSkate,
  ]);

  // Resize observer for crisp HiDPI canvas
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvasSizeRef.current = { width: rect.width, height: rect.height };
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Main 60fps Game Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const triggerCrash = (obs: Obstacle): boolean => {
      const player = playerRef.current;
      const { width, height } = canvasSizeRef.current;
      const p = project(player.visualLane, 0, width, height);

      if (player.skateTimer > 0) {
        player.skateTimer = 0;
        player.skateCooldown = 10;
        player.invincibleTimer = 2.0;
        // Blast away nearby obstacles so Sheru gets a clean extra chance
        obstaclesRef.current = obstaclesRef.current.filter((o) => o.z > 0.34);
        shakeTimerRef.current = 0.28;
        sound.playShieldBreak();
        spawnBurst(p.x, p.y - 30, '#38BDF8', 22, 220);
        spawnBurst(p.x, p.y - 30, '#FFCC00', 12, 180);
        addFloatingText(p.x, p.y - 100, 'SKATE SAVED! EK CHANCE!', '#38BDF8');
        setMessage('Skate ne gadi se bacha liya! Ek aur chance mil gaya!');
        return false;
      }

      if (player.hasShield) {
        player.hasShield = false;
        player.invincibleTimer = getShieldBonusDuration(progressRef.current.upgrades.shield);
        obs.passed = true;
        obs.z = -0.25; // Knock obstacle out of way
        shakeTimerRef.current = 0.25;
        sound.playShieldBreak();
        spawnBurst(p.x, p.y - 40, '#00E676', 18, 200);
        addFloatingText(p.x, p.y - 95, 'KAVACH SAVED!', '#00E676');
        setMessage('Kavach ne bacha liya! Sheru Bhai rukega nahi!');
        return false;
      }

      // Crash impact!
      shakeTimerRef.current = 0.35;
      sound.playCrash();
      spawnBurst(p.x, p.y - 35, '#FF1744', 22, 220);

      const finalScore = Math.floor(scoreRef.current);
      const earnedCoins = runCoinsRef.current;
      const finalDist = Math.floor(distanceRef.current);

      setHud((prev) => ({
        ...prev,
        score: finalScore,
        runCoins: earnedCoins,
        distance: finalDist,
        hasShield: false,
        magnetTimeLeft: 0,
        multiplierTimeLeft: 0,
      }));

      const hasAnyChanceLeft =
        !chancesRef.current.freeUsed ||
        !chancesRef.current.adUsed ||
        (!chancesRef.current.coinUsed && progressRef.current.totalCoins >= REVIVE_COST);

      if (hasAnyChanceLeft) {
        recordMissionEvents({
          runCoins: runCoinsRef.current,
          runDistance: distanceRef.current,
        });
        setReviveTimer(10);
        setMessage('Sheru Bhai out ho gaya! 10 second me Chance lo!');
        setGameState('REVIVE_COUNTDOWN');
      } else {
        finalizeGameOver();
      }
      return true;
    };

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      const timeSec = now / 1000;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height } = canvasSizeRef.current;

      if (ctx && canvas) {
        const dpr = canvas.width / Math.max(1, width);

        // Idle animation on Title Menu
        if (gameStateRef.current === 'TITLE_MENU') {
          worldScrollRef.current += dt * 0.48;
          playerRef.current.runPhase += dt * 11;
        }

        // Active Gameplay Simulation
        if (gameStateRef.current === 'PLAYING') {
          const player = playerRef.current;
          const difficulty = Math.min(1, distanceRef.current / 1600);
          const worldSpeedZ = 0.62 + difficulty * 0.56; // z-units per second
          const metersPerSec = 14 + difficulty * 18;

          worldScrollRef.current += worldSpeedZ * dt;
          distanceRef.current += metersPerSec * dt;

          const scoreRate = player.multiplierTimer > 0 ? 2 : 1;
          scoreRef.current += metersPerSec * scoreRate * dt * 1.5;

          // Milestone announcements & 350m mission check
          const nextMilestone = Math.floor(distanceRef.current / 250) + 1;
          if (nextMilestone > speedMilestoneRef.current) {
            speedMilestoneRef.current = nextMilestone;
            setMessage('Train ki speed badh rahi hai — dhyaan se Sheru!');
          }
          if (distanceRef.current >= 350 && !runMissionFlagsRef.current.hit350m) {
            runMissionFlagsRef.current.hit350m = true;
            recordMissionEvents({ runDistance: distanceRef.current });
            const p = project(player.visualLane, 0, width, height);
            addFloatingText(p.x, p.y - 120, 'MISSION: 350m DONE!', '#00E676');
            setMessage('Daily Mission Poora: Ek run me 350m daud complete!');
          }

          // Timers
          if (player.invincibleTimer > 0) {
            player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);
          }
          if (player.magnetTimer > 0) {
            player.magnetTimer = Math.max(0, player.magnetTimer - dt);
          }
          if (player.multiplierTimer > 0) {
            player.multiplierTimer = Math.max(0, player.multiplierTimer - dt);
          }
          if (player.skateTimer > 0) {
            player.skateTimer = Math.max(0, player.skateTimer - dt);
            if (player.skateTimer === 0) {
              player.skateCooldown = 10;
              setMessage('Skate time khatam! 10s baad phir 2x tap se nikalo!');
            }
          } else if (player.skateCooldown > 0) {
            player.skateCooldown = Math.max(0, player.skateCooldown - dt);
          }
          if (comboRef.current.timer > 0) {
            comboRef.current.timer -= dt;
            if (comboRef.current.timer <= 0) {
              comboRef.current.count = 0;
            }
          }

          // Smooth lane interpolation
          const laneDiff = player.lane - player.visualLane;
          player.visualLane += laneDiff * Math.min(1, dt * 18);

          // Advance obstacles & compute train ramp/roof support floor BEFORE vertical physics
          spawnCooldownRef.current -= worldSpeedZ * dt;
          if (spawnCooldownRef.current <= 0) {
            const batch = spawnWave(distanceRef.current, obstaclesRef.current);
            obstaclesRef.current.push(...batch.obstacles);
            collectiblesRef.current.push(...batch.collectibles);
            spawnCooldownRef.current =
              0.46 - difficulty * 0.07 + Math.random() * 0.12 + (batch.cooldownBonus || 0);
          }

          let supportFloorY = 0;
          const TRAIN_ROOF_Y = 1.06;

          const remainingObstacles: Obstacle[] = [];
          for (const obs of obstaclesRef.current) {
            obs.z -= worldSpeedZ * obs.speedMult * dt;

            // Play horn once as fast oncoming express approaches
            if (obs.type === 'MOVING_TRAIN' && !obs.hornPlayed && obs.z < 0.72) {
              obs.hornPlayed = true;
              sound.playTrainHorn();
            }

            // Check ramp & train roof support beneath Sheru
            if (obs.type === 'TRAIN' || obs.type === 'MOVING_TRAIN') {
              const onSameLane = Math.abs(player.visualLane - obs.lane) < 0.48;
              if (onSameLane) {
                if (obs.hasRamp && obs.rampLength) {
                  const rampStart = obs.z - obs.rampLength;
                  if (0 >= rampStart && 0 <= obs.z + 0.02) {
                    const rampRatio = Math.max(
                      0,
                      Math.min(1, (0 - rampStart) / obs.rampLength)
                    );
                    supportFloorY = Math.max(supportFloorY, rampRatio * TRAIN_ROOF_Y);
                  }
                }
                if (0 >= obs.z && 0 <= obs.z + obs.length && player.y >= 0.68) {
                  supportFloorY = Math.max(supportFloorY, TRAIN_ROOF_Y);
                }
              }
            }

            if (obs.z + obs.length > -0.24) {
              remainingObstacles.push(obs);
            }
          }
          obstaclesRef.current = remainingObstacles;
          player.floorY = supportFloorY;

          // Jump, ramp climb & gravity against supporting floor
          if (player.isJumping || player.y > supportFloorY) {
            player.y += player.vy * dt;
            player.vy -= 11.2 * dt;
            if (player.y <= supportFloorY) {
              player.y = supportFloorY;
              player.vy = 0;
              if (player.isJumping) {
                player.isJumping = false;
                const p = project(player.visualLane, 0, width, height);
                spawnBurst(p.x, p.y - supportFloorY * 100, '#CBD5E1', 5, 65);
              }
            }
          } else {
            player.y = supportFloorY;
            player.vy = 0;
          }

          // Slide timer
          if (player.slideTimer > 0) {
            player.slideTimer = Math.max(0, player.slideTimer - dt);
          }

          // Run animation phase
          player.runPhase += dt * (13 + difficulty * 6);

          // Check Obstacles Collisions & Passes
          for (const obs of obstaclesRef.current) {
            if (player.invincibleTimer <= 0 && !obs.passed) {
              const laneHit = Math.abs(player.visualLane - obs.lane) < 0.44;
              const zOverlap =
                obs.type === 'TRAIN' || obs.type === 'MOVING_TRAIN'
                  ? obs.z < 0.045 && obs.z + obs.length > -0.035
                  : obs.z < 0.04 && obs.z > -0.035;

              if (laneHit && zOverlap) {
                let crashed = false;
                if (obs.type === 'TRAIN' || obs.type === 'MOVING_TRAIN') {
                  const ridingRamp = Boolean(obs.hasRamp && 0 < obs.z + 0.05);
                  const safelyOnRoof = player.y >= 0.68;
                  if (!ridingRamp && !safelyOnRoof) {
                    crashed = triggerCrash(obs);
                  }
                } else if (obs.type === 'LOW_BARRIER' && player.y < 0.46) {
                  crashed = triggerCrash(obs);
                } else if (obs.type === 'HIGH_GANTRY' && player.slideTimer <= 0) {
                  crashed = triggerCrash(obs);
                }
                if (crashed) break;
              }
            }

            // Reward clean pass / jump / slide / train roof run
            if (!obs.passed && obs.z + obs.length < -0.04) {
              obs.passed = true;
              if (Math.abs(player.visualLane - obs.lane) < 0.5) {
                const p = project(player.visualLane, 0, width, height);
                if (obs.type === 'LOW_BARRIER' && player.y >= 0.46) {
                  scoreRef.current += 25;
                  addFloatingText(p.x, p.y - 100, '+25 JUMP!', '#FFCC00');
                  recordMissionEvents({ barrierDelta: 1 });
                } else if (obs.type === 'HIGH_GANTRY' && player.slideTimer > 0) {
                  scoreRef.current += 25;
                  addFloatingText(p.x, p.y - 75, '+25 SLIDE!', '#38BDF8');
                  recordMissionEvents({ gantryDelta: 1 });
                } else if (obs.type === 'TRAIN' && player.y >= 0.68) {
                  scoreRef.current += 40;
                  addFloatingText(p.x, p.y - 140, '+40 ROOF RUN!', '#00E676');
                  setMessage('Wah Sheru! Train ki chhat par daud raha hai!');
                }
              } else if (Math.random() < 0.25 && obs.type === 'MOVING_TRAIN') {
                setMessage(
                  NEAR_MISS_LINES[Math.floor(Math.random() * NEAR_MISS_LINES.length)]
                );
              }
            }
          }

          // Update Collectibles & Magnet Pull
          const remainingCollectibles: Collectible[] = [];
          for (const col of collectiblesRef.current) {
            if (col.collected) continue;
            col.z -= worldSpeedZ * dt;

            // Magnet pulls nearby coins across lanes
            if (player.magnetTimer > 0 && col.type === 'COIN' && col.z < 0.55 && col.z > -0.06) {
              col.magnetized = true;
              const targetOffset = player.visualLane - col.lane;
              col.visualXOffset =
                (col.visualXOffset || 0) +
                (targetOffset - (col.visualXOffset || 0)) * Math.min(1, dt * 14);
              col.z -= dt * 0.45;
            }

            const effectiveLane = col.lane + (col.visualXOffset || 0);
            const laneMatch = Math.abs(player.visualLane - effectiveLane) < 0.54;
            const zMatch = col.z < 0.075 && col.z > -0.05;
            const yMatch =
              col.yOffset === 0
                ? player.y < 0.65
                : Math.abs(player.y - col.yOffset * 0.95) < 0.72;

            if (laneMatch && zMatch && (yMatch || col.magnetized)) {
              col.collected = true;
              const p = project(effectiveLane, Math.max(0, col.z), width, height);

              if (col.type === 'COIN') {
                const coinGain = player.multiplierTimer > 0 ? 2 : 1;
                runCoinsRef.current += coinGain;
                scoreRef.current += 10 * coinGain;
                comboRef.current.count += 1;
                comboRef.current.timer = 1.4;
                sound.playCoin(comboRef.current.count);
                spawnBurst(p.x, p.y - 32, '#FFCC00', 7, 110);

                if (runCoinsRef.current >= 100 && !runMissionFlagsRef.current.hit100Coins) {
                  runMissionFlagsRef.current.hit100Coins = true;
                  recordMissionEvents({ runCoins: runCoinsRef.current });
                  addFloatingText(p.x, p.y - 95, 'MISSION: 100 COINS!', '#00E676');
                  setMessage('Daily Mission Poora: Ek run me 100 sikke jama ho gaye!');
                }

                if (comboRef.current.count > 0 && comboRef.current.count % 10 === 0) {
                  addFloatingText(p.x, p.y - 68, `${comboRef.current.count}x STREAK!`, '#FFCC00');
                  setMessage(
                    COIN_STREAK_LINES[Math.floor(Math.random() * COIN_STREAK_LINES.length)]
                  );
                }
              } else if (col.type === 'MAGNET') {
                player.magnetTimer = getMagnetDuration(progressRef.current.upgrades.magnet);
                sound.playPowerup();
                spawnBurst(p.x, p.y - 35, '#F43F5E', 14, 150);
                addFloatingText(p.x, p.y - 75, 'CHUMBAK ON!', '#FB7185');
                setMessage('Chumbak ON! Saare sikke Sheru ke paas aa rahe hain!');
              } else if (col.type === 'SHIELD') {
                player.hasShield = true;
                sound.playPowerup();
                spawnBurst(p.x, p.y - 35, '#00E676', 14, 150);
                addFloatingText(p.x, p.y - 75, 'KAVACH ON!', '#00E676');
                setMessage('Kavach mil gaya! Ab ek takkar maaf!');
              } else if (col.type === 'MULTIPLIER') {
                player.multiplierTimer = getMultiplierDuration(
                  progressRef.current.upgrades.multiplier
                );
                sound.playPowerup();
                spawnBurst(p.x, p.y - 35, '#A855F7', 14, 150);
                addFloatingText(p.x, p.y - 75, '2X SIKKE!', '#C084FC');
                setMessage('2X Boost ON! Double sikke aur double score!');
              }
              continue;
            }

            if (col.z > -0.15) {
              remainingCollectibles.push(col);
            }
          }
          if (gameStateRef.current === 'PLAYING') {
            collectiblesRef.current = remainingCollectibles;
          }
        }

        // Update Particles & Floating Texts in-place for zero GC lag
        if (gameStateRef.current !== 'PAUSED') {
          const particles = particlesRef.current;
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * dt;
            p.life -= dt;
            if (p.life <= 0) {
              particles.splice(i, 1);
            }
          }

          const texts = floatingTextsRef.current;
          for (let i = texts.length - 1; i >= 0; i--) {
            const ft = texts[i];
            ft.y -= 42 * dt;
            ft.life -= dt;
            if (ft.life <= 0) {
              texts.splice(i, 1);
            }
          }

          if (shakeTimerRef.current > 0) {
            shakeTimerRef.current = Math.max(0, shakeTimerRef.current - dt);
          }
        }

        // Screen shake offset
        const shakeMag = shakeTimerRef.current > 0 ? shakeTimerRef.current * 26 : 0;
        const shakeOffset = {
          x: shakeMag ? (Math.random() - 0.5) * shakeMag : 0,
          y: shakeMag ? (Math.random() - 0.5) * shakeMag : 0,
        };

        // Render frame
        ctx.save();
        ctx.scale(dpr, dpr);
        renderGame({
          ctx,
          width,
          height,
          worldScroll: worldScrollRef.current,
          distance: distanceRef.current,
          player: playerRef.current,
          skin:
            SHERU_SKINS.find((s) => s.id === progressRef.current.equippedSkin) ||
            SHERU_SKINS[0],
          obstacles: obstaclesRef.current,
          collectibles: collectiblesRef.current,
          particles: particlesRef.current,
          floatingTexts: floatingTextsRef.current,
          shakeOffset,
          time: timeSec,
        });
        ctx.restore();

        // Throttle React HUD state updates (~15Hz) for smooth zero-jank rendering
        if (gameStateRef.current === 'PLAYING' && now - lastHudSyncRef.current > 65) {
          lastHudSyncRef.current = now;
          const difficulty = Math.min(1, distanceRef.current / 1600);
          setHud({
            score: Math.floor(scoreRef.current),
            runCoins: runCoinsRef.current,
            distance: Math.floor(distanceRef.current),
            speedKmh: Math.round(38 + difficulty * 46),
            hasShield: playerRef.current.hasShield,
            magnetTimeLeft: playerRef.current.magnetTimer,
            multiplierTimeLeft: playerRef.current.multiplierTimer,
            magnetMaxTime: getMagnetDuration(progressRef.current.upgrades.magnet),
            multiplierMaxTime: getMultiplierDuration(progressRef.current.upgrades.multiplier),
            comboCount: comboRef.current.count,
            skateTimeLeft: playerRef.current.skateTimer,
            skateCooldownLeft: playerRef.current.skateCooldown,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [addFloatingText, finalizeGameOver, recordMissionEvents, spawnBurst]);

  // Direct Finger / Hand Swipe, Continuous Drag & Double-Tap Skate Controls
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameStateRef.current !== 'PLAYING') return;
    sound.unlock();
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      didSwipe: false,
      lastActionTime: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current.active || gameStateRef.current !== 'PLAYING') return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const threshold = 22;

    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      pointerStartRef.current.didSwipe = true;
      const now = performance.now();
      if (Math.abs(dx) > Math.abs(dy)) {
        if (now - pointerStartRef.current.lastActionTime > 90) {
          handleMove(dx < 0 ? -1 : 1);
          pointerStartRef.current.lastActionTime = now;
        }
        pointerStartRef.current.x = e.clientX;
        pointerStartRef.current.y = e.clientY;
      } else {
        if (dy < 0) handleJump();
        else handleSlide();
        pointerStartRef.current.x = e.clientX;
        pointerStartRef.current.y = e.clientY;
        pointerStartRef.current.lastActionTime = now;
      }
    }
  };

  const onPointerUp = () => {
    if (
      pointerStartRef.current.active &&
      !pointerStartRef.current.didSwipe &&
      gameStateRef.current === 'PLAYING'
    ) {
      const now = performance.now();
      if (now - lastTapTimeRef.current < 340) {
        lastTapTimeRef.current = 0;
        activateSkate();
      } else {
        lastTapTimeRef.current = now;
      }
    }
    pointerStartRef.current.active = false;
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#0E141B] text-white overflow-hidden">
      {/* Top HUD Bar */}
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-2.5 bg-[#FFCC00] text-black shrink-0 border-b border-black/15">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl sm:text-2xl leading-none" aria-hidden="true">
            🦁
          </span>
          <h1 className="font-display font-black text-base sm:text-xl tracking-tight whitespace-nowrap truncate">
            SHERU RUNNER
          </h1>
        </div>

        {/* Clean Unboxed Tabular Metrics */}
        <div className="flex items-center gap-3 sm:gap-5 text-sm sm:text-base font-extrabold font-mono-num shrink-0">
          <div className="flex items-center gap-1" title="Coins">
            <Coins className="w-4 h-4 text-amber-800 shrink-0" />
            <span>
              {gameState === 'PLAYING' || gameState === 'PAUSED'
                ? hud.runCoins
                : progress.totalCoins}
            </span>
          </div>
          <span className="text-black/35 font-normal" aria-hidden="true">
            ·
          </span>
          <div className="flex items-center gap-1" title="Score">
            <span className="text-xs font-sans font-bold uppercase tracking-wide text-black/70 hidden sm:inline">
              Score
            </span>
            <span>{hud.score}</span>
          </div>
          <span className="text-black/35 font-normal hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <div className="hidden sm:flex items-center gap-1" title="Best Score">
            <Trophy className="w-4 h-4 text-amber-800 shrink-0" />
            <span>{Math.max(progress.highScore, hud.score)}</span>
          </div>
        </div>

        {/* Functional Utility Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            className="p-2 rounded-lg bg-black/10 hover:bg-black/20 text-black transition-colors cursor-pointer"
            aria-label={progress.muted ? 'Unmute Sound' : 'Mute Sound'}
            title={progress.muted ? 'Sound Off' : 'Sound On'}
          >
            {progress.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
            <button
              onClick={handleTogglePause}
              className="p-2 rounded-lg bg-black/10 hover:bg-black/20 text-black transition-colors cursor-pointer"
              aria-label={gameState === 'PAUSED' ? 'Resume Game' : 'Pause Game'}
            >
              {gameState === 'PAUSED' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Live Hinglish Commentary + Active Power-Up Strip */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-[#161F2A] border-b border-white/10 shrink-0">
        <p className="text-xs sm:text-sm font-semibold text-amber-100 truncate">
          {message}
        </p>

        <div className="flex items-center gap-3 text-xs font-mono-num shrink-0">
          {hud.skateTimeLeft > 0 ? (
            <span className="inline-flex items-center gap-1 font-bold text-sky-400">
              <span>🛹 {Math.ceil(hud.skateTimeLeft)}s</span>
            </span>
          ) : hud.skateCooldownLeft > 0 ? (
            <span className="text-slate-400 font-semibold">
              🛹 {Math.ceil(hud.skateCooldownLeft)}s
            </span>
          ) : (
            gameState === 'PLAYING' && (
              <span className="text-sky-300/90 font-semibold hidden xs:inline">
                🛹 2x Tap
              </span>
            )
          )}
          {hud.hasShield && (
            <span className="inline-flex items-center gap-1 font-bold text-[#00E676]">
              <Shield className="w-3.5 h-3.5" />
              <span>Kavach</span>
            </span>
          )}
          {hud.magnetTimeLeft > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-rose-400">
              <Magnet className="w-3.5 h-3.5" />
              <span>{hud.magnetTimeLeft.toFixed(1)}s</span>
            </span>
          )}
          {hud.multiplierTimeLeft > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-purple-400">
              <Zap className="w-3.5 h-3.5" />
              <span>2x · {hud.multiplierTimeLeft.toFixed(1)}s</span>
            </span>
          )}
          <span className="text-slate-400 hidden sm:inline">
            {hud.distance}m · {hud.speedKmh} km/h
          </span>
        </div>
      </div>

      {/* 2.5D Perspective Game Viewport */}
      <main
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex-1 min-h-0 w-full game-touch-area overflow-hidden"
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Lobby / Title Menu Overlay */}
        {gameState === 'TITLE_MENU' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#FF9800]/92 via-[#FF5722]/92 to-[#7B1FA2]/95 p-4">
            <div className="w-full max-w-md text-center">
              <div
                className="text-7xl sm:text-8xl leading-none mb-2 animate-bounce drop-shadow-[0_0_18px_rgba(255,215,0,0.85)]"
                aria-hidden="true"
              >
                🦁
              </div>

              <h2 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-[2px_2px_0_#000]">
                SHERU RUNNER
              </h2>
              <p className="mt-1 text-sm font-medium text-white/90">
                Train se bacho, ramp par chadho aur sikke looto!
              </p>

              <div className="mt-4 flex items-center justify-center gap-4 text-sm text-white font-mono-num font-bold">
                <span>Best: {progress.highScore}</span>
                <span className="text-white/40" aria-hidden="true">
                  ·
                </span>
                <span>Coins: {progress.totalCoins}</span>
                <span className="text-white/40" aria-hidden="true">
                  ·
                </span>
                <span className="font-sans text-[#FFCC00]">{equippedSkin.name}</span>
              </div>

              {lastRunSummary && (
                <div className="mt-4 mx-auto max-w-xs px-4 py-2.5 rounded-xl bg-black/45 border border-white/15 text-xs text-white">
                  <div className="font-bold text-[#FFCC00]">
                    {lastRunSummary.isNewBest
                      ? 'Naya Record! Last Run Summary'
                      : 'Aakhri Run (Out)'}
                  </div>
                  <div className="mt-0.5 font-mono-num text-white/90">
                    Score: {lastRunSummary.score} · +{lastRunSummary.coins} Coins ·{' '}
                    {lastRunSummary.distance}m
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3.5 items-center">
                <button
                  onClick={startNewRun}
                  className="w-full max-w-xs inline-flex items-center justify-center gap-2.5 py-4 px-8 rounded-full bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-black text-2xl tracking-wide shadow-[0_6px_0_#009624] active:translate-y-1 active:shadow-[0_2px_0_#009624] transition-all whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-6 h-6 fill-current" />
                  PLAY
                </button>

                <div className="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-sm">
                  <button
                    onClick={() => {
                      sound.unlock();
                      sound.playClick();
                      setShopOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-black/40 hover:bg-black/55 border border-white/20 text-white font-display font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#FFCC00]" />
                    Sheru Dukaan ({progress.totalCoins})
                  </button>

                  <button
                    onClick={handleRequestDailyMissions}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-black/40 hover:bg-black/55 border border-[#38BDF8]/45 text-white font-display font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Target className="w-4 h-4 text-[#38BDF8]" />
                    <span>Daily Missions</span>
                    {claimableMissionsCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#00E676] text-black text-[11px] font-mono-num font-black leading-none">
                        {claimableMissionsCount}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#2979FF] text-white text-[10px] font-mono-num font-bold leading-none">
                        AD
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <p className="mt-5 text-xs text-white/85">
                Finger swipe se mudna/jump/slide karein · 2 baar tap karke 30s Skate nikalein
              </p>
            </div>
          </div>
        )}

        {/* Pause Overlay */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-sm bg-[#161F2A] border border-white/15 rounded-2xl p-6 text-center shadow-2xl">
              <h2 className="font-display text-2xl font-black text-white">Game Paused</h2>
              <p className="mt-1 text-sm text-slate-300">
                Score: <span className="font-mono-num font-bold text-white">{hud.score}</span> ·{' '}
                Coins: <span className="font-mono-num font-bold text-[#FFCC00]">{hud.runCoins}</span>
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={handleTogglePause}
                  className="w-full py-3 px-5 rounded-xl bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-extrabold text-base transition-colors cursor-pointer"
                >
                  Resume Run
                </button>
                <button
                  onClick={startNewRun}
                  className="w-full py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-colors cursor-pointer"
                >
                  Restart
                </button>
                <button
                  onClick={finalizeGameOver}
                  className="w-full py-2.5 px-5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 font-bold text-sm transition-colors cursor-pointer"
                >
                  Lobby
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 10-Second Out Countdown & Ek Chance / Ad Chance Overlay */}
        {gameState === 'REVIVE_COUNTDOWN' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md bg-[#161F2A] border border-white/15 rounded-2xl p-6 text-center shadow-2xl">
              {/* Countdown Ring */}
              <div className="mx-auto w-20 h-20 rounded-full border-4 border-[#FFCC00] bg-[#111922] flex flex-col items-center justify-center mb-3">
                <span className="font-mono-num text-3xl font-black text-[#FFCC00] leading-none">
                  {reviveTimer}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                  sec
                </span>
              </div>

              <h2 className="font-display text-2xl font-black text-white">
                Out Ho Gaye! Ek Chance?
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Score: <span className="font-mono-num font-bold text-white">{hud.score}</span> ·{' '}
                Run Coins: <span className="font-mono-num font-bold text-[#FFCC00]">+{hud.runCoins}</span>
              </p>

              {/* Progress bar for 10s timer */}
              <div className="mt-3 w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#FFCC00] transition-all duration-700"
                  style={{ width: `${(reviveTimer / 10) * 100}%` }}
                />
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                {!freeChanceUsed && (
                  <button
                    onClick={handleUseFreeChance}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-extrabold text-base transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ek Chance Lo (Free)
                  </button>
                )}

                {!adChanceUsed && (
                  <button
                    onClick={handleStartAdChance}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#2979FF] hover:bg-[#448AFF] text-white font-display font-extrabold text-base transition-colors cursor-pointer"
                  >
                    <Tv className="w-4 h-4" />
                    Ad Dekh Ke Chance Lo (5s)
                  </button>
                )}

                {!coinReviveUsed && progress.totalCoins >= REVIVE_COST && (
                  <button
                    onClick={handleUseCoinChance}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#FFCC00] hover:bg-[#FFD633] text-black font-display font-extrabold text-base transition-colors cursor-pointer"
                  >
                    <Coins className="w-4 h-4" />
                    Coins Se Chance Lo ({REVIVE_COST} Coins)
                  </button>
                )}

                <button
                  onClick={finalizeGameOver}
                  className="w-full py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-sm transition-colors cursor-pointer"
                >
                  Seedha Lobby Jao
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rewarded Ad Overlay (Pauses 10s timer while watching) */}
        {adModalOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-md bg-[#111922] border border-white/20 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B2634] border-b border-white/10 text-xs font-mono-num">
                <span className="font-sans font-bold text-slate-200">
                  Sponsored Ad · Rewarded Chance
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-[#FFCC00]">
                  <Timer className="w-3.5 h-3.5" />
                  {adSecondsLeft > 0 ? `${adSecondsLeft}s` : 'Reward Ready!'}
                </span>
              </div>

              <div className="p-6 text-center bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#1E1B4B]">
                <div className="text-4xl mb-2" aria-hidden="true">
                  🚄
                </div>
                <h3 className="font-display text-xl font-black text-[#FFCC00]">
                  SHERU EXPRESS SUPER SALE
                </h3>
                <p className="mt-1.5 text-sm text-slate-200">
                  Sikke jama karo aur Sheru Dukaan se Raja Crown, Swag Chashma aur Turbo Mane unlock
                  karo!
                </p>

                <div className="mt-4 w-full h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-[#00E676] transition-all duration-700"
                    style={{ width: `${((5 - adSecondsLeft) / 5) * 100}%` }}
                  />
                </div>

                <div className="mt-5">
                  {adSecondsLeft > 0 ? (
                    <div className="py-3 px-4 rounded-xl bg-white/10 text-slate-300 text-sm font-bold font-mono-num">
                      Ad chal raha hai... {adSecondsLeft}s ruko
                    </div>
                  ) : (
                    <button
                      onClick={handleClaimAdChance}
                      className="w-full py-3 px-5 rounded-xl bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-extrabold text-base transition-colors cursor-pointer"
                    >
                      Chance Claim Karo & Bhaago!
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      <ShopModal
        isOpen={shopOpen}
        onClose={() => setShopOpen(false)}
        progress={progress}
        onBuySkin={handleBuySkin}
        onEquipSkin={handleEquipSkin}
        onUpgradePowerup={handleUpgradePowerup}
      />

      <AdMobMissionGateModal
        isOpen={missionAdOpen}
        secondsLeft={missionAdSecondsLeft}
        isOffline={missionAdOffline}
        onRetryOnline={handleRequestDailyMissions}
        onClose={() => setMissionAdOpen(false)}
        onOpenMissionsFromAd={handleOpenMissionsFromAd}
      />

      <DailyMissionsModal
        isOpen={missionsOpen}
        onClose={() => setMissionsOpen(false)}
        missionsState={currentDailyMissions}
        onClaimMission={handleClaimMission}
      />
    </div>
  );
}
