// The lion from the Vlaanderen logo (https://www.vlaanderen.be/img/logo/vlaanderen-logo.svg): only the subpaths
// left of the slash, in the logo's own viewBox units. Drawn into a canvas at run time, so no image file is needed.
const LION = 'M36.9,41.4 c-2-1.6-3,0-4.3-0.1c-1.1-0.1-2.1-1.8-2.9-1.4c-1.6,0.8,0.6,3.7,1.6,4.3c0.9,0.5,2,1,2.2,1.1c1.3,0.6,1.8,1.5,2,2.9 c0,0.3,0,1.1-0.1,1.4c-0.6,2.5-5,4.8-7.5,3c-1.2-0.8-2.3-1.9-2.6-3.7c-0.7-3.3-3-5.7-3.8-8.9c-0.5-1.9-0.8-4-1.3-6s-1-4-1.5-5.9 c-0.4-1.7-1.2-4.3-1.8-5.8c-2.4-6.3-3.5-5.8-3.5-5.8s0.9,1.7,4,17.1c0.1,0.6,1.3,7.4,2.1,9.6c0.3,0.8,0.8,2.5,1.2,3.2 c1,2.2,3.7,5.5,3.8,8.5c0.1,1.7,0.3,3.2,0.3,4.5c0,0.4,0.2,1.9,0.4,2.6c0.7,1.8,5.9,7.7,11.5,7.7v-4.5c-5.5,0-10.8-3.1-10.9-3.4 c-0.1-0.1,0.3-2.3,0.7-3.2c0.7-1.8,2.1-3.5,4.5-3.7c2.7-0.2,4.3,0.6,5.7,0.6C36.7,55.5,36.9,41.4,36.9,41.4zM12.8,25.2 c-0.2,3.4-5.4,7.9-7,10.9C5,37.5,4,40,3.8,41.4c-0.7,4,0.2,6.5,1.2,8.8c1.7,4.1-0.3,5.7,1,4.8c1.7-1.4,1.4-4.5,1.3-6.5 c-0.1-1.6-0.2-3.4,0-5.3c0.5-3.6,2.6-7.4,4.5-10.1C14,30,13.2,26.6,12.8,25.2zM13.9,34.7c0,0,0.6,2.7-1.8,9.5 C5.9,62,17.6,63.7,21,67.9c0,0,1.3-1.8-4-7.6c-1.9-2.1-3.7-6.8-2.2-13.5C17,37.1,13.9,34.7,13.9,34.7zM2.3,23 C2,21.9,1.9,21,2,20.1c0.3-4.2,4.1-5.9,5-6.5c0,0,1.7-1.2,1.9-2.4c0,0,1.8,4.4-2.3,6.9C4.6,19.5,3.3,21,2.3,23zM11.9,18.9 c0.2,0.4,1.8,2.7-4.7,8.1c-6.5,5.3-4.4,9.1-4.4,9.1s-6.9-3.8,1-10.5c7.9-6.6,6.3-8,6.3-8S11.3,17.7,11.9,18.9zM20.3,21 c1.1,0.1,1.8,3.6,4.4,4.4c1.9,0.6,3.9,0.3,4.4,1.4c-0.9,0.5-0.2,2,0.7,1.7C30.5,26.5,30.8,18.6,20.3,21zM23.8,22.5 c0.1-0.2,0.2,0,0.5-0.2c0.3-0.3,0.6-0.8,1.1-0.9c0.4-0.1,0.8-0.1,1.2,0.1c0.2,0.1,0.1,0.6-0.1,0.8c-0.3,0.3-1.4-0.2-1.4,0.6 c0,1.3,1.7,0,2.6,0C28.1,25.9,23,25.1,23.8,22.5z';
export const LION_BOX = [0, 10.5, 37.2, 70.6]; // x0, y0, x1, y1 of the lion in viewBox units

// a transparent texture with the lion in the logo's charcoal, or null where there is no DOM (unit tests)
export function lionTexture(px = 512) {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const [x0, y0, x1, y1] = LION_BOX, s = px / (y1 - y0), cv = document.createElement('canvas');
  cv.width = Math.ceil((x1 - x0) * s); cv.height = px;
  const g = cv.getContext('2d');
  g.scale(s, s); g.translate(-x0, -y0); g.fillStyle = '#333332'; g.fill(new Path2D(LION));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
export const LION_ASPECT = (LION_BOX[2] - LION_BOX[0]) / (LION_BOX[3] - LION_BOX[1]);
