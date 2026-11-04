import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { CameraDirector } from '../core/CameraDirector';
import type { QualityProfile } from '../render/quality';
import type { ScentController } from '../systems/scent/ScentController';

interface PostFXProps {
  profile: QualityProfile;
  director: CameraDirector;
  scent: ScentController;
}

/** Minimalny kształt efektów postprocessing, których właściwości animujemy co klatkę. */
interface HueSaturationLike {
  saturation: number;
}
interface VignetteLike {
  darkness: number;
}
interface DepthOfFieldLike {
  bokehScale: number;
  /** w różnych wersjach: setter kopiujący Vector3 albo pole z worldFocusPoint */
  target?: THREE.Vector3 | null;
}

/**
 * Łańcuch post-processingu: Bloom, DoF (ostrość z CameraDirector), Vignette,
 * tone mapping ACES oraz desaturacja świata napędzana siłą Psiego Węchu.
 */
export function PostFX({ profile, director, scent }: PostFXProps) {
  const hue = useRef<HueSaturationLike | null>(null);
  const vignette = useRef<VignetteLike | null>(null);
  const dof = useRef<DepthOfFieldLike | null>(null);

  useFrame(() => {
    const strength = scent.state.strength;
    if (hue.current) hue.current.saturation = -0.65 * strength;
    if (vignette.current) vignette.current.darkness = 0.45 + 0.25 * strength;
    const d = dof.current;
    if (d) {
      d.bokehScale = director.rig.bokeh;
      // ponowne przypisanie wymusza aktualizację punktu ostrości niezależnie od wersji biblioteki
      if ('target' in d) d.target = director.focusPoint;
    }
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <DepthOfField
        ref={dof as never}
        target={director.focusPoint}
        focalLength={0.06}
        bokehScale={director.rig.bokeh}
        height={profile.dof ? 480 : 240}
      />
      <Bloom intensity={profile.bloom ? 0.55 : 0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
      <HueSaturation ref={hue as never} saturation={0} />
      <Vignette ref={vignette as never} offset={0.3} darkness={0.45} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
