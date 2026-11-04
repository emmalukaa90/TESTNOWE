import type { QualityTier } from '../core/types';

export interface QualityProfile {
  tier: QualityTier;
  dpr: [number, number];
  furLayers: number;
  shadowMapSize: number;
  dof: boolean;
  bloom: boolean;
  leaves: number;
  sparkles: number;
}

/** Profile dobrane pod 60 FPS: low = tanie telefony, high = flagowce. */
export const PROFILES: Record<QualityTier, QualityProfile> = {
  low: { tier: 'low', dpr: [1, 1], furLayers: 5, shadowMapSize: 1024, dof: false, bloom: false, leaves: 120, sparkles: 30 },
  medium: { tier: 'medium', dpr: [1, 1.5], furLayers: 9, shadowMapSize: 2048, dof: true, bloom: true, leaves: 220, sparkles: 60 },
  high: { tier: 'high', dpr: [1, 2], furLayers: 14, shadowMapSize: 2048, dof: true, bloom: true, leaves: 320, sparkles: 90 },
};
