import React from 'react';
import { X, Check, Magnet, Shield, Zap, Coins } from 'lucide-react';
import {
  PlayerProgress,
  SHERU_SKINS,
  SkinId,
  UpgradeLevels,
} from '../game/types';
import {
  getMagnetDuration,
  getMultiplierDuration,
  getShieldBonusDuration,
  getUpgradeCost,
  getUpgradeLabel,
  isMaxLevel,
} from '../game/storage';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: PlayerProgress;
  onBuySkin: (skinId: SkinId, price: number) => void;
  onEquipSkin: (skinId: SkinId) => void;
  onUpgradePowerup: (key: keyof UpgradeLevels, cost: number) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  progress,
  onBuySkin,
  onEquipSkin,
  onUpgradePowerup,
}) => {
  if (!isOpen) return null;

  const upgradeKeys: (keyof UpgradeLevels)[] = ['magnet', 'shield', 'multiplier'];

  const renderUpgradeIcon = (key: keyof UpgradeLevels) => {
    if (key === 'magnet') return <Magnet className="w-5 h-5 text-rose-400" />;
    if (key === 'shield') return <Shield className="w-5 h-5 text-emerald-400" />;
    return <Zap className="w-5 h-5 text-purple-400" />;
  };

  const renderUpgradeDesc = (key: keyof UpgradeLevels, level: number) => {
    if (key === 'magnet') return `Duration: ${getMagnetDuration(level).toFixed(1)}s`;
    if (key === 'multiplier') return `Duration: ${getMultiplierDuration(level).toFixed(1)}s`;
    return `Post-hit grace: ${getShieldBonusDuration(level).toFixed(1)}s`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sheru Dukaan"
    >
      <div className="w-full max-w-2xl max-h-[88dvh] flex flex-col bg-[#161F2A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1B2634]">
          <div>
            <h2 className="font-display text-xl font-extrabold text-white tracking-tight">
              Sheru Dukaan
            </h2>
            <p className="text-xs text-slate-400">
              Sikke kharch karo, naye avatars aur power-ups unlock karo
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm font-bold text-[#FFCC00] font-mono-num">
              <Coins className="w-4 h-4" />
              <span>{progress.totalCoins}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close Shop"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Skins Section */}
          <section>
            <h3 className="text-sm font-bold text-slate-200 mb-3">
              Sheru Bhai Avatars
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SHERU_SKINS.map((skin) => {
                const unlocked = progress.unlockedSkins.includes(skin.id);
                const equipped = progress.equippedSkin === skin.id;
                const canAfford = progress.totalCoins >= skin.price;

                return (
                  <div
                    key={skin.id}
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                      equipped
                        ? 'bg-[#1F2D3D] border-[#FFCC00]/60'
                        : 'bg-[#111922] border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Swatch avatar */}
                      <div
                        className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border border-white/15"
                        style={{
                          background: `linear-gradient(135deg, ${skin.maneColor}, ${skin.jacketColor})`,
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-full"
                          style={{ backgroundColor: skin.furColor }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm text-white truncate">
                          {skin.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {skin.tagline}
                        </div>
                      </div>
                    </div>

                    {equipped ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#00E676] whitespace-nowrap shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Equipped
                      </span>
                    ) : unlocked ? (
                      <button
                        onClick={() => onEquipSkin(skin.id)}
                        className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Equip
                      </button>
                    ) : (
                      <button
                        onClick={() => onBuySkin(skin.id, skin.price)}
                        disabled={!canAfford}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 font-mono-num ${
                          canAfford
                            ? 'bg-[#FFCC00] hover:bg-[#FFD633] text-black cursor-pointer'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {skin.price} Coins
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Upgrades Section */}
          <section className="pt-2 border-t border-white/10">
            <h3 className="text-sm font-bold text-slate-200 mb-3">
              Power-up Upgrades
            </h3>
            <div className="space-y-2.5">
              {upgradeKeys.map((key) => {
                const level = progress.upgrades[key];
                const maxed = isMaxLevel(level);
                const cost = getUpgradeCost(level);
                const canAfford = progress.totalCoins >= cost;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#111922] border border-white/10"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#1A2431] flex items-center justify-center shrink-0">
                        {renderUpgradeIcon(key)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="truncate">{getUpgradeLabel(key)}</span>
                          <span className="text-xs font-mono-num text-slate-400">
                            Lv {level}/5
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono-num">
                          {renderUpgradeDesc(key, level)}
                        </div>
                      </div>
                    </div>

                    {maxed ? (
                      <span className="px-3 py-1.5 text-xs font-bold text-[#00E676] whitespace-nowrap shrink-0">
                        Max Level
                      </span>
                    ) : (
                      <button
                        onClick={() => onUpgradePowerup(key, cost)}
                        disabled={!canAfford}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 font-mono-num ${
                          canAfford
                            ? 'bg-[#00E676] hover:bg-[#1FF58A] text-black cursor-pointer'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Upgrade · {cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
