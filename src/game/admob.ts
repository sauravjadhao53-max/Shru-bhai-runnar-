export interface AdMobBridge {
  showRewardedAd?: (adUnitId?: string) => Promise<boolean>;
}

declare global {
  interface Window {
    admob?: {
      rewarded?: {
        load?: (opts: { id: string }) => Promise<void>;
        show?: () => Promise<boolean | void>;
      };
      showRewardedAd?: (adUnitId?: string) => Promise<boolean>;
    };
    AndroidAdMob?: {
      showRewardedAd?: (adUnitId: string, callbackName: string) => void;
    };
    __onAndroidAdMobReward?: (rewarded: boolean) => void;
  }
}

export const ADMOB_REWARDED_UNIT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMOB_REWARDED_ID) ||
  'ca-app-pub-3940256099942544/5224354917';

export function isOnlineForAdMob(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function hasNativeAdMobBridge(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.admob?.showRewardedAd ||
      window.admob?.rewarded?.show ||
      window.AndroidAdMob?.showRewardedAd
  );
}

/**
 * Attempts to trigger a native/SDK online AdMob Rewarded Ad if connected
 * (e.g. Android WebView / Capacitor AdMob plugin). Returns 'native_rewarded'
 * if handled natively, 'native_dismissed' if cancelled, or 'use_web_ad'
 * to present the in-browser AdMob Rewarded Ad slot.
 */
export async function tryShowNativeAdMobRewarded(): Promise<
  'native_rewarded' | 'native_dismissed' | 'use_web_ad'
> {
  if (typeof window === 'undefined') return 'use_web_ad';

  try {
    if (window.admob?.showRewardedAd) {
      const ok = await window.admob.showRewardedAd(ADMOB_REWARDED_UNIT_ID);
      return ok ? 'native_rewarded' : 'native_dismissed';
    }

    if (window.admob?.rewarded?.show) {
      if (window.admob.rewarded.load) {
        await window.admob.rewarded.load({ id: ADMOB_REWARDED_UNIT_ID });
      }
      const res = await window.admob.rewarded.show();
      return res === false ? 'native_dismissed' : 'native_rewarded';
    }

    if (window.AndroidAdMob?.showRewardedAd) {
      return await new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          delete window.__onAndroidAdMobReward;
          resolve('native_dismissed');
        }, 45000);

        window.__onAndroidAdMobReward = (rewarded: boolean) => {
          window.clearTimeout(timeout);
          delete window.__onAndroidAdMobReward;
          resolve(rewarded ? 'native_rewarded' : 'native_dismissed');
        };

        window.AndroidAdMob?.showRewardedAd?.(
          ADMOB_REWARDED_UNIT_ID,
          '__onAndroidAdMobReward'
        );
      });
    }
  } catch {
    return 'use_web_ad';
  }

  return 'use_web_ad';
}
