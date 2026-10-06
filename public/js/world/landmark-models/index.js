import { landmarkMaterials } from './kit.js';
import { buildBelpaire } from './belpaire.js';
import { buildTeirlinck } from './teirlinck.js';
import { buildVac } from './vac.js';

// The detailed landmark models, each a THREE.Group to the imported-model spec (see kit.js).
// Not in the city yet: public/dev/landmarks.html previews them next to their reference photos.
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
export const landmarkMats = () => (mats = mats || landmarkMaterials());
