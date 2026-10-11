import { beforeEach, describe, expect, it } from 'vitest';
import { G, P, inv } from '../../public/js/core/state.js';
import { CLUB_AT, DJ, STAGE_TIP, clubLayout, collideClub } from '../../public/js/world/club.js';
import { LAYOUT, PINK, clubInteractions, clubShow, tipStage, requestTrack, clubSpeakers } from '../../public/js/game/club.js';

beforeEach(() => {
  G.state = 'play'; G.stairs = false; P.alive = true; P.club = LAYOUT; P.y = 0; inv.money = 200;
  Object.assign(clubShow, { time: 0, tipUntil: 0, requestUntil: 0, track: 0 });
});
const standAt = s => { P.x = CLUB_AT.x + s.x; P.z = CLUB_AT.z + s.z; };
describe('club floor interactions', () => {
  it('offers stage tipping at an accessible spot and charges once per cooldown', () => {
    standAt(STAGE_TIP); const near = []; clubInteractions(P, near);
    expect(near.some(i => /tip the stage/i.test(i.prompt))).toBe(true);
    expect(collideClub({ x: P.x, z: P.z }, 0.38, 0, clubLayout())).toBe(false);
    expect(tipStage()).toBe(true); expect(inv.money).toBe(200 - STAGE_TIP.price);
    expect(tipStage()).toBe(false); expect(inv.money).toBe(200 - STAGE_TIP.price);
    clubShow.time = STAGE_TIP.cooldown; expect(tipStage()).toBe(true);
  });
  it('refuses tips away from the stage, without cash or outside the main floor', () => {
    standAt(DJ.front); expect(tipStage()).toBe(false);
    standAt(STAGE_TIP); inv.money = 0; expect(tipStage()).toBe(false);
    inv.money = 200; P.club = PINK; expect(tipStage()).toBe(false); expect(inv.money).toBe(200);
  });
  it('changes the actual speaker sound and source keys when a DJ request is paid', () => {
    standAt(DJ.front); const near = []; clubInteractions(P, near);
    expect(near.some(i => /DJ request/i.test(i.prompt))).toBe(true);
    expect(collideClub({ x: P.x, z: P.z }, 0.38, 0, clubLayout())).toBe(false);
    const before = clubSpeakers();
    expect(requestTrack()).toBe(true); expect(inv.money).toBe(200 - DJ.price);
    expect(clubSpeakers()[0].sound).not.toBe(before[0].sound);
    expect(clubSpeakers()[0].key).not.toBe(before[0].key);
    expect(requestTrack()).toBe(false);
    clubShow.time = DJ.cooldown; inv.money = 0; expect(requestTrack()).toBe(false);
  });
});
