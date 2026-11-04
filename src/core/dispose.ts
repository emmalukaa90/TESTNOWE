import * as THREE from 'three';

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material) as unknown[]) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

/** Rekurencyjnie zwalnia geometrie, materiały i tekstury obiektu. */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}
