import { kb } from '../core/controls.js';
import { on } from '../core/events.js';
import { save } from '../core/save.js';
import { G, P, inv } from '../core/state.js';
import { addEntity, all, removeEntity } from '../entities/registry.js';
import { emit } from '../render/effects.js';
import { camera, scene } from '../render/scene.js';
import { toast } from '../ui/hud.js';
import { blocked, collide, isFree, onRoad, raySphere } from '../world/collision.js';
import { makePokemon, makeBall, disposeModel } from './models.js';
import { catchChance, catchPokemon, gainExperience, randomEncounter, selectPokemon, SPECIES } from './team.js';

const active = () => G.state === 'play' && P.alive && !P.club && !P.roof && !P.vehicle && (P.y || 0) < 2;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let spawnTimer = 0;
// B cycles healthy partners; after the last partner it recalls the team.
export function cyclePartner() {
  const team = inv.pokemon;
  for (let i = team.selected + 1; i < team.party.length; i++) if (selectPokemon(team, i)) {
    toast(`<em>${SPECIES[team.party[i].species].name}</em> is your partner.`); save(); return;
  }
  selectPokemon(team, -1); save(); toast('Partner recalled. Press the team key to send one out.');
}
function freeNear(x, z, radius = 4) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2, r = 2 + Math.random() * radius;
    const spot = { x: x + Math.sin(angle) * r, z: z + Math.cos(angle) * r };
    if (isFree(spot.x, spot.z, 0.7)) return spot;
  }
  return null;
}
function stepToward(p, x, z, dt, speed) {
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return false;
  const step = Math.min(d, speed * dt), ox = p.x, oz = p.z;
  // Slide along corners instead of walking into buildings.
  p.x += dx / d * step; collide(p, 0.45, p);
  p.z += dz / d * step; collide(p, 0.45, p);
  p.yaw = Math.atan2(dx, dz);
  return Math.hypot(p.x - ox, p.z - oz) > 0.005;
}
function validTarget(p, target) {
  return active() && target?.alive && !target.removed && !target.vehicle && (target.y || 0) < 2 && distance(P, target) < 30 && distance(p, target) < 35;
}
const Pokemon = {
  kind: 'pokemon', blipLayer: 2, surface: 'flesh',
  raycast(o, d, maxT) {
    if (this.removed || this.catching || !this.root.visible) return null;
    const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.x, this.baseScale, this.z, 0.7 * this.baseScale);
    return t >= 0 && t < maxT ? { t } : null;
  },
  onShot(hit, damage) { this.hurt(damage); return { head: false }; },
  blast(x, y, z, radius, damage) {
    const d = Math.hypot(x - this.x, y - this.baseScale, z - this.z);
    if (d < radius && !blocked(x, y, z, this.x, this.baseScale, this.z)) this.hurt(damage * (1 - d / radius));
  },
  hurt(damage) {
    if (this.removed || this.catching || !Number.isFinite(damage) || damage <= 0) return;
    this.hp = Math.max(0, (this.record?.hp ?? this.hp) - damage);
    if (this.record) this.record.hp = this.hp;
    emit(this.x, this.baseScale, this.z, 6, this.def.effect, 2, 0.3, 0.12);
    if (this.hp <= 0) {
      if (this.owned) { inv.pokemon.selected = -1; save(); }
      toast(`<em>${this.def.name}</em> fainted.${this.owned ? ' Heal at the Pokémon Center.' : ''}`);
      removeEntity(this); return;
    }
    if (this.owned) save();
    else { this.wander = freeNear(this.x, this.z, 7); this.wanderT = 3; }
    this.showHealth();
  },
  showHealth() {
    this.health.visible = this.hp < 100;
    this.healthFill.scale.x = this.hp / 100;
    this.health.quaternion.copy(this.root.quaternion).invert().multiply(camera.quaternion);
  },
  interaction(player) {
    if (!active() || this.catching || this.removed) return null;
    const dist = distance(this, player);
    if (dist > 3 || blocked(player.x, 1, player.z, this.x, 0.9, this.z)) return null;
    return { keys: ['use'], priority: 2, dist,
      prompt: this.owned ? `<em>${this.def.name}</em> · Lv ${this.record.level || 1} · HP ${Math.ceil(this.record.hp)}/100 · <kbd>${kb('use')}</kbd> recall`
        : `<kbd>${kb('use')}</kbd> throw Poké Ball · <em>${this.def.name}</em> Lv ${this.level} · ${inv.pokemon.balls} balls · ${Math.round(catchChance(this.species, this.hp) * 100)}% catch · HP ${Math.ceil(this.hp)}/100`,
      run: () => this.owned ? this.recall() : this.catch(),
    };
  },
  recall() { selectPokemon(inv.pokemon, -1); removeEntity(this); save(); },
  catch() {
    if (this.catching || this.removed || this.owned || !this.interaction(P)) return;
    const result = catchPokemon(inv.pokemon, this.species, Math.random, this.level, this.hp);
    if (result === 'empty' || result === 'full') { toast(result === 'empty' ? 'No Poké Balls. Buy a pack at the <em>Pokémon Center</em>.' : 'Your team is full (6/6).'); return; }
    this.catching = { t: 0, result, from: { x: P.x, z: P.z } };
    this.ball = makeBall(); scene.add(this.ball); save();
  },
  update(dt) {
    if (G.state !== 'play' || P.club) { this.root.visible = !P.club; return; }
    if (this.owned && (!active() || inv.pokemon.party[inv.pokemon.selected] !== this.record || this.record.hp <= 0)) { removeEntity(this); return; }
    this.root.visible = true;
    if (this.catching) {
      const c = this.catching; c.t += dt; const t = Math.min(1, c.t / 0.65);
      this.ball.position.set(c.from.x + (this.x - c.from.x) * t, 1 + Math.sin(t * Math.PI) * 1.5, c.from.z + (this.z - c.from.z) * t);
      this.ball.rotation.x += dt * 10; this.root.scale.setScalar(this.baseScale * (c.t > 0.65 ? Math.max(0, 1 - (c.t - 0.65) * 3) : 1));
      if (c.t > 1.1) {
        disposeModel(this.ball); this.ball = null; this.catching = null; this.root.scale.setScalar(this.baseScale);
        if (c.result === 'caught') { toast(`<em>${this.def.name}</em> caught! <em>${kb('pokemon')}</em> switches your partner.`); removeEntity(this); }
        else { toast(`<em>${this.def.name}</em> broke free. Try another ball!`); this.wander = freeNear(this.x, this.z, 6); }
      }
      return;
    }
    let moving = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.owned) {
      this.targetT -= dt;
      if (this.targetT <= 0 || !validTarget(this, this.target)) this.target = null;
      const target = this.target;
      if (target) {
        const d = distance(this, target);
        const clear = !blocked(this.x, 0.9, this.z, target.x, 1, target.z);
        if (d > 3 || !clear) moving = stepToward(this, target.x, target.z, dt, this.def.speed);
        else {
          this.yaw = Math.atan2(target.x - this.x, target.z - this.z);
          if (this.cooldown <= 0) {
            this.cooldown = 1.25;
            const dir = new THREE.Vector3(target.x - this.x, 0, target.z - this.z).normalize();
            target.hurt(this.def.damage * (1 + ((this.record.level || 1) - 1) * 0.06), dir, true, 0.25, 'pokemon');
            // A short elemental trail, with no new projectile or collision system.
            for (let i = 0; i < 5; i++) emit(this.x + (target.x - this.x) * i / 4, 1, this.z + (target.z - this.z) * i / 4, 2, this.def.effect, 1, 0.25, 0.12);
            if (target.alive) this.record.hp = Math.max(0, this.record.hp - (target.def?.gun ? 12 : 6));
            if (this.record.hp <= 0) { toast(`<em>${this.def.name}</em> fainted. Heal at the <em>Pokémon Center</em>.`); inv.pokemon.selected = -1; removeEntity(this); save(); return; }
          }
        }
      } else if (distance(this, P) > 2.3) moving = stepToward(this, P.x, P.z, dt, this.def.speed * (distance(this, P) > 10 ? 1.6 : 1));
      // Catch up safely after long detours around buildings or teleports.
      if (distance(this, P) > 20) { const s = freeNear(P.x, P.z, 2); if (s) Object.assign(this, s); }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 3 + Math.random() * 5; this.wander = freeNear(this.home.x, this.home.z, 7); }
      if (this.wander) moving = stepToward(this, this.wander.x, this.wander.z, dt, 1.2);
    }
    this.root.position.set(this.x, moving ? Math.abs(Math.sin(G.time * 10)) * 0.12 : Math.sin(G.time * 2 + this.phase) * 0.025, this.z);
    this.root.rotation.y = this.yaw;
    if (this.record) this.hp = this.record.hp;
    this.showHealth();
  },
  blip(radar) { radar.dot(this.x, this.z, this.owned ? '#74deff' : '#85ed9c', this.owned ? 6 : 4, false, this.owned ? 'dia' : undefined); },
  shouldDespawn() { return !this.owned && !this.catching && distance(this, P) > 130; },
  dispose() { disposeModel(this.root); if (this.ball) disposeModel(this.ball); },
};
export function spawnPokemon(species, x, z, record = null, level = null) {
  const def = SPECIES[species]; if (!def) throw new Error('Unknown Pokémon: ' + species);
  const root = makePokemon(species); root.position.set(x, 0, z); scene.add(root);
  const health = new THREE.Group(); health.position.y = 2.7; health.visible = false; root.add(health);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.14, 0.03), new THREE.MeshBasicMaterial({ color: '#292535' })); health.add(back);
  const healthFill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: '#91ee94' })); healthFill.position.z = 0.025; health.add(healthFill);
  return addEntity(Object.assign(Object.create(Pokemon), { species, def, root, health, healthFill, hp: record?.hp ?? 100, x, z, yaw: 0, owned: !!record, record, home: { x, z }, level: record?.level || level || def.minLevel, baseScale: root.scale.x, phase: Math.random() * 6, wanderT: 2, cooldown: 0, target: null, targetT: 0 }));
}
export function updatePokemon(dt) {
  const list = all('pokemon'), record = active() ? inv.pokemon.party[inv.pokemon.selected] : null;
  for (const p of list) if (p.owned && (p.record !== record || !record || record.hp <= 0 || p.species !== record.species)) removeEntity(p);
  if (record?.hp > 0 && !all('pokemon').some(p => p.owned)) {
    const s = freeNear(P.x, P.z, 2); if (s) spawnPokemon(record.species, s.x, s.z, record);
  }
  if (!active()) return;
  spawnTimer -= dt; if (spawnTimer > 0) return; spawnTimer = 2;
  if (all('pokemon').filter(p => !p.owned).length >= 16) return;
  // Random free ground near the player; prefer parks, pavement and beach over traffic lanes.
  for (let i = 0; i < 35; i++) {
    const angle = Math.random() * Math.PI * 2, r = 10 + Math.random() * 75;
    const x = P.x + Math.sin(angle) * r, z = P.z + Math.cos(angle) * r;
    if (!isFree(x, z, 1) || onRoad(x, z)) continue;
    const encounter = randomEncounter(); spawnPokemon(encounter.species, x, z, null, encounter.level); break;
  }
}
on('npc:attacked', ({ npc, source }) => {
  if (source !== 'player') return;
  for (const p of all('pokemon')) if (p.owned && validTarget(p, npc)) { p.target = npc; p.targetT = 12; }
});

on('npc:killed', ({ npc, byPlayer }) => {
  if (!byPlayer) return;
  const partner = all('pokemon').find(p => p.owned && p.target === npc);
  if (!partner) return;
  const result = gainExperience(partner.record, 20 + Math.ceil((npc.def?.hp || 80) / 4));
  if (result.evolvedTo) toast(`<em>${SPECIES[result.evolvedFrom].name}</em> evolved into <em>${SPECIES[result.evolvedTo].name}</em>! Lv ${partner.record.level}`);
  else if (result.levelsGained) toast(`<em>${partner.def.name}</em> reached <em>level ${partner.record.level}</em>!`);
  save();
});
