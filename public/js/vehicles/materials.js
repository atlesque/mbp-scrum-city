// materials shared by several vehicles
export const burntMat = new THREE.MeshLambertMaterial({ color: '#2a2428' });
export const lightRed = new THREE.MeshBasicMaterial({ color: '#ff2340' }), lightBlue = new THREE.MeshBasicMaterial({ color: '#2a6bff' });
// tinted car windows: see-through, so the people inside can be seen and shot
export const carGlassMat = new THREE.MeshPhongMaterial({ color: '#3a5574', transparent: true, opacity: 0.42, shininess: 110, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
