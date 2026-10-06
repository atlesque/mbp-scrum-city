import { landmarkMaterials } from './kit.js';
import { buildBelpaire } from './belpaire.js';
import { buildTeirlinck } from './teirlinck.js';
import { buildVac } from './vac.js';

// The detailed landmark models, each a THREE.Group to the imported-model spec (see kit.js).
// world/landmarks.js puts them in the city; public/dev/landmarks.html previews them one at a time.
export const LANDMARK_MODELS = {
  vac: { name: 'VAC Gent (Virginie Lovelinggebouw)', build: buildVac },
  teirlinck: { name: 'Herman Teirlinckgebouw', build: buildTeirlinck },
  belpaire: { name: 'Belpairegebouw (ZIN)', build: buildBelpaire },
};
let mats;
export function landmarkModel(type) {
  mats = mats || landmarkMaterials();
  return LANDMARK_MODELS[type].build().group(type, mats);
}
// the model plus its collision volumes ([x0, x1, z0, z1, top] in model metres, front at -z)
export function landmarkParts(type) {
  mats = mats || landmarkMaterials();
  const k = LANDMARK_MODELS[type].build();
  return { group: k.group(type, mats), colliders: k.colliders };
}
export const landmarkMats = () => (mats = mats || landmarkMaterials());
