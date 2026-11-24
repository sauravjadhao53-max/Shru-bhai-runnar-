import React from 'react';
import { CheckCircle2, Coins, Target, Timer, Tv, WifiOff, X } from 'lucide-react';
import { DAILY_MISSIONS, DailyMissionsState, MissionId } from '../game/types';

interface DailyMissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  missionsState: DailyMissionsState;
  onClaimMission: (missionId: MissionId, reward: number) => void;
}

export const DailyMissionsModal: React.FC<DailyMissionsModalProps> = ({
  isOpen,
  onClose,
  missionsState,
  onClaimMission,
}) => {
  if (!isOpen) return null;

  const completedCount = DAILY_MISSIONS.filter((m) => {
    const prog = missionsState.items[m.id]?.progress ?? 0;
    return prog >= m.target;
  }).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Daily Missions"
    >
      <div className="w-full max-w-md max-h-[85dvh] flex flex-col bg-[#161F2A] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#1B2634]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FFCC00]/15 border border-[#FFCC00]/30 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-[#FFCC00]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold text-white tracking-tight truncate">
                Daily Missions
              </h2>
              <p className="text-xs text-slate-400 font-mono-num">
                {completedCount}/{DAILY_MISSIONS.length} Done · {missionsState.dateKey}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close Daily Missions"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Missions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {DAILY_MISSIONS.map((mission) => {
            const state = missionsState.items[mission.id] || {
              progress: 0,
              claimed: false,
            };
            const current = Math.min(mission.target, state.progress);
            const pct = Math.min(100, Math.round((current / mission.target) * 100));
            const isComplete = current >= mission.target;
            const isClaimed = state.claimed;

            return (
              <div
                key={mission.id}
                className={`p-3.5 rounded-xl border transition-colors ${
                  isComplete && !isClaimed
                    ? 'bg-[#1D2D3B] border-[#00E676]/50'
                    : 'bg-[#111922] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-sm text-white leading-snug">
                      {mission.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{mission.subtitle}</div>
                  </div>

                  {isClaimed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#00E676] whitespace-nowrap shrink-0 pt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Claimed
                    </span>
                  ) : isComplete ? (
                    <button
                      onClick={() => onClaimMission(mission.id, mission.reward)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-extrabold text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      Claim +{mission.reward}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FFCC00] font-mono-num whitespace-nowrap shrink-0 pt-0.5">
                      <Coins className="w-3.5 h-3.5" />+{mission.reward}
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isComplete ? 'bg-[#00E676]' : 'bg-[#FFCC00]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono-num font-bold text-slate-300 shrink-0">
                    {current}/{mission.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface AdMobMissionGateModalProps {
  isOpen: boolean;
  secondsLeft: number;
  isOffline: boolean;
  onRetryOnline: () => void;
  onClose: () => void;
  onOpenMissionsFromAd: () => void;
}

export const AdMobMissionGateModal: React.FC<AdMobMissionGateModalProps> = ({
  isOpen,
  secondsLeft,
  isOffline,
  onRetryOnline,
  onClose,
  onOpenMissionsFromAd,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AdMob Ad for Daily Missions"
    >
      <div className="w-full max-w-md bg-[#111922] border border-white/20 rounded-2xl overflow-hidden shadow-2xl">
        {/* AdMob Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B2634] border-b border-white/10 text-xs font-mono-num">
          <span className="inline-flex items-center gap-1.5 font-sans font-bold text-slate-200">
            <Tv className="w-3.5 h-3.5 text-[#38BDF8]" />
            Google AdMob · Rewarded Ad
          </span>
          <div className="flex items-center gap-2">
            {!isOffline && (
              <span className="inline-flex items-center gap-1 font-bold text-[#FFCC00]">
                <Timer className="w-3.5 h-3.5" />
                {secondsLeft > 0 ? `${secondsLeft}s` : 'Ad Complete'}
              </span>
            )}
            {(isOffline || secondsLeft <= 0) && (
              <button
                onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close Ad"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Ad Content */}
        {isOffline ? (
          <div className="p-6 text-center bg-[#161F2A]">
            <WifiOff className="w-10 h-10 text-rose-400 mx-auto mb-2.5" />
            <h3 className="font-display text-lg font-black text-white">
              Online Connection Zaroori Hai
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Daily Missions kholne ke liye online AdMob Ad load hona zaroori hai. Internet on karke
              try karein.
            </p>
            <div className="mt-4 flex gap-2.5 justify-center">
              <button
                onClick={onRetryOnline}
                className="px-4 py-2.5 rounded-xl bg-[#2979FF] hover:bg-[#448AFF] text-white font-display font-bold text-sm cursor-pointer"
              >
                Retry AdMob
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-sm cursor-pointer"
              >
                Wapas Lobby
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#1E1B4B]">
            <div className="text-4xl mb-2" aria-hidden="true">
              🦁🎯
            </div>
            <h3 className="font-display text-xl font-black text-[#FFCC00]">
              ADMOB SPONSORED REWARD
            </h3>
            <p className="mt-1.5 text-sm text-slate-200">
              AdMob ad poora hote hi aaj ke Daily Missions unlock ho jayenge — extra coins jeeto!
            </p>

            <div className="mt-4 w-full h-2 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-[#38BDF8] transition-all duration-700"
                style={{ width: `${((5 - secondsLeft) / 5) * 100}%` }}
              />
            </div>

            <div className="mt-5">
              {secondsLeft > 0 ? (
                <div className="py-3 px-4 rounded-xl bg-white/10 text-slate-300 text-sm font-bold font-mono-num">
                  AdMob Ad chal raha hai... {secondsLeft}s ruko
                </div>
              ) : (
                <button
                  onClick={onOpenMissionsFromAd}
                  className="w-full py-3 px-5 rounded-xl bg-[#00E676] hover:bg-[#1FF58A] text-black font-display font-extrabold text-base transition-colors cursor-pointer"
                >
                  Open Daily Missions
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
