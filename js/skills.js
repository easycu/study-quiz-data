// =============================================================
// 기억(스킬) - Shape of Dreams의 기억을 자동 발동용으로 옮김
//   - 최대 3칸. 쿨타임이 찼고 사거리 안에 적이 있으면 자동 발동 (0.5초 간격)
//   - 같은 기억을 다시 고르면 +1 강화: 쿨타임 17/(17+n), 피해 +20%씩
//   - 기억과 총의 원소가 같으면 기억 피해 x1.3
//   - 피해는 모두 "총 1발 피해 x 계수"로 계산 (공부로 공격력이 오르면 같이 오른다)
// =============================================================
"use strict";

// target: "nearest"(가까운 적) / "dense"(적이 많이 모인 곳) / "self"(내 주변)
// range: 이 거리 안에 적이 있어야 발동
const SKILL_DEFS = [
    // ---------------- 무속성 ----------------
    { id: "bleed", name: "출혈", el: "none", cd: 4.5, range: 380, target: "nearest", desc: "다음 총알이 강화: 추가 피해 + 3초 출혈 + 둔화" },
    { id: "dagger", name: "신비한 단검", el: "none", cd: 6, range: 420, target: "nearest", desc: "단검을 던짐. 맞으면 다른 기억 쿨타임 1.5초 감소" },
    { id: "phantom", name: "유령 탄환", el: "none", cd: 6, range: 450, target: "nearest", desc: "강한 탄환 한 발. 처치하면 점수 +20" },
    { id: "butcher", name: "도살자의 일격", el: "none", cd: 8, range: 115, target: "nearest", desc: "앞쪽 베기. 처치할 때마다 이번 판 최대 체력 +2" },
    { id: "bigbite", name: "크게 물어뜯기", el: "none", cd: 8, range: 110, target: "nearest", desc: "앞쪽 물어뜯기. 맞히면 체력 회복 + 보호막" },
    { id: "pressure", name: "압력 방출", el: "none", cd: 5.5, range: 95, target: "self", desc: "주변 적을 밀쳐냄. 벽에 부딪히면 추가 피해 + 기절" },
    { id: "whirl", name: "회전 회오리", el: "none", cd: 10, range: 110, target: "self", desc: "2초 동안 내 주변을 회전 공격" },
    { id: "trail", name: "부식성 발자취", el: "none", cd: 10, range: 300, target: "self", desc: "4초 동안 지나간 길에 독 장판" },
    { id: "bladestorm", name: "칼날 폭풍", el: "none", cd: 13, range: 320, target: "dense", desc: "4초간 칼날 장판. 가까운 적을 따라감" },
    { id: "grasp", name: "악의의 손아귀", el: "none", cd: 11, range: 320, target: "dense", desc: "촉수로 적을 한곳에 끌어모으고 둔화" },
    { id: "harvest", name: "피의 수확", el: "none", cd: 12.5, range: 350, target: "nearest", desc: "주변 적에 표식, 2초 뒤 폭발. 표식 적 처치 시 회복" },
    { id: "volley", name: "화살 세례", el: "none", cd: 11, range: 400, target: "self", desc: "4초간 공격속도 +40%, 쏠 때마다 화살 3발 추가" },
    { id: "taunt", name: "짜증나는 깃발", el: "none", cd: 12, range: 320, target: "dense", desc: "4초간 깃발을 세워 근처 몬스터가 깃발을 노림" },
    { id: "rewind", name: "되돌리기", el: "none", cd: 12, range: 400, target: "self", desc: "다른 기억 하나의 쿨타임 초기화 + 다음 기억 피해 +50%" },
    // ---------------- 화염 ----------------
    { id: "whip", name: "불타는 채찍", el: "fire", cd: 4.5, range: 165, target: "nearest", desc: "앞쪽 부채꼴 화염. 화상 + 둔화" },
    { id: "bang", name: "빵야", el: "fire", cd: 10, range: 450, target: "nearest", desc: "큰 화염탄. 맞으면 주변 폭발 + 화상" },
    { id: "ignite", name: "점화", el: "fire", cd: 10, range: 380, target: "nearest", desc: "화염 피해. 불붙은 적이면 추가 피해 + 주변으로 번짐" },
    { id: "pillar", name: "불기둥", el: "fire", cd: 11, range: 380, target: "dense", desc: "즉시 폭발 후 3초간 불타는 바닥" },
    { id: "breath", name: "화염 분출", el: "fire", cd: 11.5, range: 220, target: "nearest", desc: "2초간 가까운 적에게 화염 줄기" },
    { id: "immolate", name: "이몰레이션", el: "fire", cd: 9, range: 120, target: "self", desc: "3초간 내 주변 화염 피해" },
    { id: "furnace", name: "작은 용광로", el: "fire", cd: 10, range: 400, target: "self", desc: "아기 화염용 소환 (8초). 화염구로 공격" },
    // ---------------- 얼음 ----------------
    { id: "flashfreeze", name: "급속 빙결", el: "ice", cd: 9, range: 200, target: "nearest", desc: "앞쪽 냉기. 이미 느려진 적은 얼어붙음" },
    { id: "iceclaw", name: "얼음 발톱", el: "ice", cd: 7, range: 125, target: "nearest", desc: "앞쪽으로 2번 연속 할퀴기 + 둔화" },
    { id: "stomp", name: "빙하 발구르기", el: "ice", cd: 8, range: 125, target: "self", desc: "주변 적 기절. 맞힌 수만큼 보호막 (위기 때도 자동)" },
    { id: "iceshield", name: "얼음 방패", el: "ice", cd: 6, range: 250, target: "self", desc: "보호막. 깨지면 주변 냉기 폭발" },
    { id: "hammer", name: "빙하 망치", el: "ice", cd: 9, range: 350, target: "dense", desc: "망치 내려찍기 + 주변 적 끌어당김 + 둔화" },
    { id: "blizzard", name: "눈보라", el: "ice", cd: 14.5, range: 350, target: "dense", desc: "5초간 냉기 장판 (피해 + 둔화)" },
    // ---------------- 빛 ----------------
    { id: "starfall", name: "별똥별", el: "light", cd: 8, range: 400, target: "self", desc: "적들 위로 별똥별 6개 낙하" },
    { id: "orb", name: "빛의 구체", el: "light", cd: 8, range: 400, target: "nearest", desc: "관통하는 구체. 돌아오면 체력 회복" },
    { id: "strike", name: "번개 타격", el: "light", cd: 13, range: 400, target: "nearest", desc: "잠시 뒤 낙뢰. 기절 + 확률로 화상" },
    { id: "chain", name: "연쇄 번개", el: "light", cd: 16, range: 380, target: "nearest", desc: "최대 6마리까지 튕기는 번개" },
    { id: "discharge", name: "전하 방출", el: "light", cd: 8.5, range: 135, target: "self", desc: "모았다가 주변 폭발. 3초간 받는 피해 -25%" },
    { id: "soulmate", name: "영혼의 단짝", el: "light", cd: 14, range: 400, target: "self", desc: "작은 정령 소환 (최대 5마리, 20초). 빛 화살 공격" },
    { id: "radiant", name: "광휘 폭발", el: "light", cd: 13, range: 380, target: "nearest", desc: "1초 뒤 폭발. 처치하면 다음 적에게 반복 (최대 3번)" },
    { id: "purify", name: "대규모 정화", el: "light", cd: 10, range: 160, target: "self", desc: "주변 피해 + 둔화·장판 제거 + 회복" },
    // ---------------- 어둠 ----------------
    { id: "darkbolt", name: "어둠 화살", el: "dark", cd: 4.5, range: 450, target: "nearest", desc: "2마리 관통. 치명타면 쿨타임 감소" },
    { id: "blackspear", name: "검은 창", el: "dark", cd: 5, range: 160, target: "nearest", desc: "앞쪽 찌르기. 맞은 적을 앞으로 모음" },
    { id: "shotgun", name: "산탄 발사", el: "dark", cd: 8, range: 260, target: "nearest", desc: "5발 산탄. 치명타면 추가 탄" },
    { id: "grenade", name: "어둠 수류탄", el: "dark", cd: 9, range: 380, target: "dense", desc: "폭발 후 사방으로 어둠 조각" },
    { id: "overcharge", name: "어둠 과충전", el: "dark", cd: 10, range: 450, target: "self", desc: "유도 미사일 5발 + 3초간 공격속도 +25%" },
    { id: "crossbow", name: "검은 쇠뇌", el: "dark", cd: 11, range: 500, target: "nearest", desc: "모두 관통. 관통할 때마다 피해 +25%" },
];
const SKILL_BY_ID = {};
SKILL_DEFS.forEach(d => { SKILL_BY_ID[d.id] = d; });

function skillElementColor(el) { return SKILL_ELEMENT_INFO[el][1]; }
function skillHasSynergy(def, gun) { return !!gun && !!SKILL_SYNERGY_GUNS[def.el] && SKILL_SYNERGY_GUNS[def.el].includes(gun.element); }
function skillCooldownMs(def, level) { return Math.round(def.cd * 1000 * skillCooldownMult(level)); }
function skillLevelMult(level) { return 1 + SKILL_DMG_PER_LEVEL * level; }

// 퀴즈 뒤 보여줄 기억 3개 (다 강화한 기억은 빼고)
function rollSkillOffers(p) {
    const pool = SKILL_DEFS.filter(d => { const s = p.skills.find(x => x.id === d.id); return !s || s.level < SKILL_MAX_LEVEL; });
    return sample(pool, SKILL_OFFER_COUNT).map(d => d.id);
}

// ---------------- 발동 조건 ----------------
function skillCanCast(g, def, s) {
    const p = g.player, now = g.now;
    switch (def.id) {
        case "bleed": return !p.empower;
        case "iceshield": return !(p.shield > 0 && now < p.shieldUntil);
        case "rewind": return p.skills.some(o => o !== s && o.readyAt - now > 2000);
        case "taunt": return !(g.decoy && now < g.decoy.until);
        case "soulmate": return g.pets.filter(pt => pt.kind === "spirit").length < 5;
    }
    return true;
}
// 위기 때 거리와 상관없이 발동하는 방어 기억
function skillEmergency(g, def) {
    const p = g.player;
    if (def.id === "stomp") return p.hp < p.maxHp * 0.5 && g.monsterWithin(p.x, p.y, 170);
    if (def.id === "purify") return g.now < p.slowUntil || g.hazards.some(h => h.isActive(g.now) && h.contains(p.x, p.y, p.radius));
    return false;
}
// 대상 고르기: {m, x, y} 또는 null
function skillTarget(g, def) {
    const p = g.player;
    const inRange = g.monsters.filter(m => m.targetable && hypot(m.x - p.x, m.y - p.y) <= def.range + m.radius);
    if (!inRange.length) return skillEmergency(g, def) ? { m: null, x: p.x, y: p.y } : null;
    if (def.target === "self") return { m: null, x: p.x, y: p.y };
    if (def.target === "nearest") {
        let best = inRange[0], bd = Infinity;
        for (const m of inRange) { const d = hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
        return { m: best, x: best.x, y: best.y };
    }
    // dense: 주변(110) 안에 몬스터가 가장 많은 몬스터 자리
    let best = inRange[0], bc = -1;
    for (const m of inRange) {
        let c = 0;
        for (const o of g.monsters) if (hypot(o.x - m.x, o.y - m.y) <= 110) c++;
        if (c > bc) { bc = c; best = m; }
    }
    return { m: best, x: best.x, y: best.y };
}

// =============================================================
// 기억 효과
// =============================================================
const SKILL_CAST = {
    // ---------------- 무속성 ----------------
    bleed(g, s) {
        g.player.empower = { add: g.sd(s, 1.0), dot: g.sd(s, 0.35), sk: s };
        g.addFx({ kind: "ring", x: g.player.x, y: g.player.y, r: 26, color: [220, 50, 60], dur: 250, follow: "player" });
    },
    dagger(g, s, t) {
        g.skillBullet(s, t, { speed: 10, dmg: g.sd(s, 2.5), radius: 6, kind: "dagger",
            onHit: (gg) => { for (const o of gg.player.skills) if (o !== s) o.readyAt = Math.max(gg.now, o.readyAt - 1500); } });
    },
    phantom(g, s, t) {
        g.skillBullet(s, t, { speed: 11, dmg: g.sd(s, 4.0), radius: 7, kind: "phantom",
            onHit: (gg, m, b, res) => { if (res.killed) { gg.score += 20; gg.popup(m.x, m.y - 30, "+20점", [200, 220, 255]); } } });
    },
    butcher(g, s, t) {
        const p = g.player, a = Math.atan2(t.y - p.y, t.x - p.x);
        g.coneDamage(s, p.x, p.y, a, 118, radians(60), g.sd(s, 3.0), (m, res) => {
            if (res.killed) { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2); g.popup(p.x, p.y - 40, "최대체력 +2", [255, 120, 120]); }
        });
    },
    bigbite(g, s, t) {
        const p = g.player, a = Math.atan2(t.y - p.y, t.x - p.x);
        const hits = g.coneDamage(s, p.x, p.y, a, 108, radians(45), g.sd(s, 2.5));
        if (hits.length) { g.healPlayer(p.maxHp * 0.04); g.shieldPlayer(p.maxHp * 0.08 * skillLevelMult(s.level), 3000); }
    },
    pressure(g, s) {
        const p = g.player;
        g.addFx({ kind: "ring", x: p.x, y: p.y, r: 115, color: [210, 210, 230], dur: 280 });
        for (const m of g.monsters.slice()) {
            if (!m.targetable || hypot(m.x - p.x, m.y - p.y) > 115 + m.radius) continue;
            const slam = g.knockMonster(m, p.x, p.y, m.isBoss ? 25 : 90);
            const res = g.skillHit(s, m, g.sd(s, 1.2));
            if (slam && !res.killed) {
                g.skillHit(s, m, g.sd(s, 1.5)); g.stunMonster(m, 600);
                g.popup(m.x, m.y - m.radius - 28, "쾅!", [255, 230, 150]);
            }
        }
    },
    whirl(g, s) {
        g.addZone(s, { follow: "player", r: 95, dur: 2000, tick: 250, dmg: g.sd(s, 0.5), kind: "whirl", color: [220, 220, 235] });
    },
    trail(g, s) {
        const p = g.player;
        p.trailUntil = g.now + 4000; p.trailNext = g.now; p.trailSk = s; p.trailDmg = g.sd(s, 0.4);
    },
    bladestorm(g, s, t) {
        g.addZone(s, { x: t.x, y: t.y, r: 70, dur: 4000, tick: 300, dmg: g.sd(s, 0.45), kind: "blades", chase: 1.6, color: [230, 230, 245] });
    },
    grasp(g, s, t) {
        g.addFx({ kind: "ring", x: t.x, y: t.y, r: 150, color: [150, 60, 150], dur: 350 });
        for (const m of g.monsters.slice()) {
            const d = hypot(m.x - t.x, m.y - t.y);
            if (!m.targetable || d > 150 + m.radius) continue;
            g.addFx({ kind: "beam", x: t.x, y: t.y, x2: m.x, y2: m.y, color: [170, 70, 170], dur: 300 });
            if (!m.isBoss && !m.immovable && d > 20) { const k = (d - 20) / d * 0.65; g.moveMonster(m, (t.x - m.x) * k, (t.y - m.y) * k); }
            const res = g.skillHit(s, m, g.sd(s, 1.0));
            if (!res.killed) g.slowMonster(m, 0.4, 2000);
        }
    },
    harvest(g, s, t) {
        const marked = g.monsters.filter(m => m.targetable && hypot(m.x - t.x, m.y - t.y) <= 200);
        const dmg = g.sd(s, 2.5), until = g.now + 2000;
        for (const m of marked) { m.marks.harvest = until; m.marks.harvestHeal = g.player.maxHp * 0.03; }
        g.addTimer(2000, gg => {
            for (const m of marked) {
                if (!gg.monsters.includes(m)) continue;
                gg.addFx({ kind: "circle", x: m.x, y: m.y, r: 40, color: [200, 30, 50], dur: 250 });
                gg.skillHit(s, m, dmg);
            }
        });
    },
    volley(g, s) {
        const p = g.player;
        p.volleyUntil = g.now + 4000; p.volleyDmg = g.sd(s, 0.4); p.volleySk = s;
        p.aspdBuffs.push({ mult: 1.4, until: g.now + 4000 });
        g.addFx({ kind: "ring", x: p.x, y: p.y, r: 30, color: [230, 220, 160], dur: 300, follow: "player" });
    },
    taunt(g, s, t) {
        const p = g.player, d = hypot(t.x - p.x, t.y - p.y) || 1, k = Math.min(d, 160) / d;
        let [x, y] = [p.x + (t.x - p.x) * k, p.y + (t.y - p.y) * k];
        [x, y] = pushCircleOutOfObstacles(x, y, 14, g.obstacles);
        g.decoy = { x, y, velX: 0, velY: 0, until: g.now + 4000, radius: 14 };
        g.popup(x, y - 34, "도발!", [255, 200, 90]);
    },
    rewind(g, s) {
        const p = g.player, others = p.skills.filter(o => o !== s);
        let best = others[0];
        for (const o of others) if (o.readyAt > best.readyAt) best = o;
        best.readyAt = g.now;
        p.skillBoost = 1.5;
        g.addFx({ kind: "ring", x: p.x, y: p.y, r: 34, color: [190, 230, 255], dur: 350, follow: "player" });
        g.popup(p.x, p.y - 44, `${SKILL_BY_ID[best.id].name} 초기화`, [190, 230, 255]);
    },
    // ---------------- 화염 ----------------
    whip(g, s, t) {
        const p = g.player, a = Math.atan2(t.y - p.y, t.x - p.x), burn = g.sd(s, 0.3);
        g.coneDamage(s, p.x, p.y, a, 178, radians(35), g.sd(s, 1.6), (m, res) => {
            if (!res.killed) { g.burnMonster(m, burn, 3000); g.slowMonster(m, 0.3, 1500); }
        });
    },
    bang(g, s, t) {
        const burn = g.sd(s, 0.3), blast = g.sd(s, 1.5);
        g.skillBullet(s, t, { speed: 9, dmg: g.sd(s, 4.0), radius: 11, kind: "fireball",
            onHit: (gg, m) => {
                gg.addFx({ kind: "circle", x: m.x, y: m.y, r: 60, color: [255, 130, 40], dur: 260 });
                gg.areaDamage(s, m.x, m.y, 60, blast, (o, res) => { if (!res.killed) gg.burnMonster(o, burn, 3000); }, m);
                if (gg.monsters.includes(m)) gg.burnMonster(m, burn, 3000);
            } });
    },
    ignite(g, s, t) {
        const m = t.m, burning = g.now < m.burnUntil, burn = g.sd(s, 0.3);
        g.addFx({ kind: "circle", x: m.x, y: m.y, r: 30, color: [255, 120, 40], dur: 250 });
        const res = g.skillHit(s, m, g.sd(s, burning ? 4.0 : 2.0));
        if (burning) {
            g.addFx({ kind: "ring", x: m.x, y: m.y, r: 80, color: [255, 150, 60], dur: 300 });
            g.areaDamage(s, m.x, m.y, 80, g.sd(s, 1.2), (o, r2) => { if (!r2.killed) g.burnMonster(o, burn, 3000); }, m);
        }
        if (!res.killed) g.burnMonster(m, burn, 3000);
    },
    pillar(g, s, t) {
        const burn = g.sd(s, 0.3);
        g.addFx({ kind: "circle", x: t.x, y: t.y, r: 70, color: [255, 120, 40], dur: 300 });
        g.areaDamage(s, t.x, t.y, 70, g.sd(s, 2.0), (m, res) => { if (!res.killed) g.burnMonster(m, burn, 3000); });
        g.addZone(s, { x: t.x, y: t.y, r: 70, dur: 3000, tick: 500, dmg: g.sd(s, 0.4), kind: "fire", color: [255, 110, 40], burn });
    },
    breath(g, s) {
        const dmg = g.sd(s, 0.35), burn = g.sd(s, 0.2);
        g.addZone(s, { follow: "player", r: 0, dur: 2000, tick: 150, kind: "breath", color: [255, 140, 50],
            tickFn: (gg, z) => {
                const p = gg.player, m = gg.nearestTargetable(p.x, p.y, 235);
                if (!m) { z.angle = null; return; }
                z.angle = Math.atan2(m.y - p.y, m.x - p.x);
                gg.coneDamage(s, p.x, p.y, z.angle, 230, radians(16), dmg, (o, res) => { if (!res.killed) gg.burnMonster(o, burn, 2000); }, true);
            } });
    },
    immolate(g, s) {
        g.addZone(s, { follow: "player", r: 110, dur: 3000, tick: 500, dmg: g.sd(s, 0.6), kind: "fire", color: [255, 110, 40], burn: g.sd(s, 0.2) });
    },
    furnace(g, s) {
        const p = g.player;
        let d = g.pets.find(pt => pt.kind === "dragon");
        if (!d) { d = { kind: "dragon", x: p.x, y: p.y - 30, angle: 0 }; g.pets.push(d); }
        d.until = g.now + 8000; d.nextShot = g.now + 300; d.sk = s; d.dmg = g.sd(s, 0.8); d.burn = g.sd(s, 0.25); d.gap = 800;
    },
    // ---------------- 얼음 ----------------
    flashfreeze(g, s, t) {
        const p = g.player, a = Math.atan2(t.y - p.y, t.x - p.x);
        g.coneDamage(s, p.x, p.y, a, 200, radians(30), g.sd(s, 1.8), (m, res, wasSlowed) => {
            if (res.killed) return;
            if (wasSlowed) { g.stunMonster(m, 1000, true); g.popup(m.x, m.y - m.radius - 26, "빙결!", [170, 230, 255]); }
            else g.slowMonster(m, 0.4, 2000);
        });
    },
    iceclaw(g, s, t) {
        const p = g.player, dmg = g.sd(s, 1.4);
        const claw = (gg, ang) => gg.coneDamage(s, gg.player.x, gg.player.y, ang, 125, radians(50), dmg, (m, res) => { if (!res.killed) gg.slowMonster(m, 0.3, 1500); });
        claw(g, Math.atan2(t.y - p.y, t.x - p.x));
        g.addTimer(200, gg => { const m = gg.nearestTargetable(gg.player.x, gg.player.y, 160); if (m) claw(gg, Math.atan2(m.y - gg.player.y, m.x - gg.player.x)); });
    },
    stomp(g, s) {
        const p = g.player;
        g.addFx({ kind: "circle", x: p.x, y: p.y, r: 130, color: [150, 220, 255], dur: 300 });
        const hits = g.areaDamage(s, p.x, p.y, 130, g.sd(s, 1.5), (m, res) => { if (!res.killed) g.stunMonster(m, 800, true); });
        if (hits.length) g.shieldPlayer(p.maxHp * Math.min(0.15, 0.03 * hits.length) * skillLevelMult(s.level), 4000);
    },
    iceshield(g, s) {
        const p = g.player;
        g.shieldPlayer(p.maxHp * 0.10 * skillLevelMult(s.level), 4000);
        p.shieldBreak = { sk: s, dmg: g.sd(s, 2.0) };
    },
    hammer(g, s, t) {
        g.addFx({ kind: "warn", x: t.x, y: t.y, r: 90, color: [150, 220, 255], dur: 350 });
        const dmg = g.sd(s, 2.5);
        g.addTimer(350, gg => {
            gg.addFx({ kind: "circle", x: t.x, y: t.y, r: 90, color: [160, 225, 255], dur: 280 });
            gg.shake(3);
            for (const m of gg.monsters.slice()) {
                const d = hypot(m.x - t.x, m.y - t.y);
                if (!m.targetable || d > 170 + m.radius) continue;
                if (!m.isBoss && !m.immovable && d > 10) { const k = Math.min(50, d - 10) / d; gg.moveMonster(m, (t.x - m.x) * k, (t.y - m.y) * k); }
                if (d <= 90 + m.radius) { const res = gg.skillHit(s, m, dmg); if (res.killed) continue; }
                gg.slowMonster(m, 0.35, 2000);
            }
        });
    },
    blizzard(g, s, t) {
        g.addZone(s, { x: t.x, y: t.y, r: 110, dur: 5000, tick: 500, dmg: g.sd(s, 0.45), kind: "snow", color: [190, 230, 255], slow: 0.35 });
    },
    // ---------------- 빛 ----------------
    starfall(g, s) {
        const p = g.player, dmg = g.sd(s, 1.3);
        const targets = g.monsters.filter(m => m.targetable && hypot(m.x - p.x, m.y - p.y) <= 420);
        for (let i = 0; i < 6; i++) {
            let x, y;
            if (targets.length) { const m = choice(targets); x = m.x + uniform(-30, 30); y = m.y + uniform(-30, 30); }
            else { x = p.x + uniform(-200, 200); y = p.y + uniform(-200, 200); }
            x = clamp(x, PLAY_LEFT + 10, PLAY_RIGHT - 10); y = clamp(y, PLAY_TOP + 10, PLAY_BOTTOM - 10);
            const delay = 380 + i * 120;
            g.addFx({ kind: "meteor", x, y, r: 50, color: [255, 235, 140], dur: delay });
            g.addTimer(delay, gg => {
                gg.addFx({ kind: "circle", x, y, r: 50, color: [255, 240, 160], dur: 220 });
                gg.areaDamage(s, x, y, 50, dmg);
            });
        }
    },
    orb(g, s, t) {
        const healAmt = g.player.maxHp * 0.03;
        g.skillBullet(s, t, { speed: 7, dmg: g.sd(s, 2.0), radius: 11, kind: "orb", pierce: 999, ghost: true, maxDist: 380, returning: true,
            onReturn: (gg, b) => { if (b.hitSet.size) gg.healPlayer(healAmt); } });
    },
    strike(g, s, t) {
        const x = t.x, y = t.y, dmg = g.sd(s, 3.5), burn = g.sd(s, 0.3);
        g.addFx({ kind: "warn", x, y, r: 70, color: [255, 240, 120], dur: 600 });
        g.addTimer(600, gg => {
            gg.addFx({ kind: "bolt", x, y, r: 70, color: [255, 250, 180], dur: 260 });
            gg.shake(3);
            gg.areaDamage(s, x, y, 70, dmg, (m, res) => {
                if (res.killed) return;
                gg.stunMonster(m, 1000, true);
                if (Math.random() < 0.3) gg.burnMonster(m, burn, 3000);
            });
        });
    },
    chain(g, s, t) {
        let cur = t.m, dmg = g.sd(s, 3.0), px = g.player.x, py = g.player.y;
        const hit = new Set();
        for (let i = 0; i < 6 && cur; i++) {
            hit.add(cur);
            g.zaps.push([px, py, cur.x, cur.y, g.now]);
            px = cur.x; py = cur.y;
            g.skillHit(s, cur, dmg);
            dmg *= 0.85;
            let next = null, bd = 200;
            for (const o of g.monsters) { if (hit.has(o) || !o.targetable) continue; const d = hypot(o.x - px, o.y - py); if (d < bd) { bd = d; next = o; } }
            cur = next;
        }
    },
    discharge(g, s) {
        const p = g.player, dmg = g.sd(s, 2.5);
        g.addFx({ kind: "charge", x: p.x, y: p.y, r: 140, color: [255, 240, 140], dur: 400, follow: "player" });
        p.dmgReduce = 0.25; p.dmgReduceUntil = g.now + 3400;
        g.addTimer(400, gg => {
            const q = gg.player;
            gg.addFx({ kind: "circle", x: q.x, y: q.y, r: 140, color: [255, 245, 170], dur: 280 });
            gg.areaDamage(s, q.x, q.y, 140, dmg);
        });
    },
    soulmate(g, s) {
        const p = g.player;
        g.pets.push({ kind: "spirit", x: p.x, y: p.y, angle: uniform(0, Math.PI * 2), until: g.now + 20000, nextShot: g.now + 500,
                      sk: s, dmg: g.sd(s, 0.6), gap: 1200 });
        g.addFx({ kind: "ring", x: p.x, y: p.y, r: 30, color: [255, 245, 180], dur: 300 });
    },
    radiant(g, s, t) { radiantBlast(g, s, t.m, g.sd(s, 3.0), 3); },
    purify(g, s) {
        const p = g.player;
        g.addFx({ kind: "circle", x: p.x, y: p.y, r: 150, color: [255, 250, 210], dur: 320 });
        g.areaDamage(s, p.x, p.y, 150, g.sd(s, 2.0));
        p.slowUntil = 0;
        g.hazards = g.hazards.filter(h => hypot(h.x - p.x, h.y - p.y) > 150 + h.radius * 0.5);
        g.mines = g.mines.filter(mi => hypot(mi.x - p.x, mi.y - p.y) > 150);
        g.healPlayer(p.maxHp * 0.05);
    },
    // ---------------- 어둠 ----------------
    darkbolt(g, s, t) {
        g.skillBullet(s, t, { speed: 11, dmg: g.sd(s, 2.2), radius: 7, kind: "darkbolt", pierce: 2,
            onHit: (gg, m, b, res) => { if (res.crit) s.readyAt = Math.max(gg.now, s.readyAt - 1500); } });
    },
    blackspear(g, s, t) {
        const p = g.player, [ux, uy] = unitTo(p.x, p.y, t.x, t.y);
        const ex = p.x + ux * 170, ey = p.y + uy * 170;
        g.addFx({ kind: "line", x: p.x, y: p.y, x2: ex, y2: ey, r: 50, color: [140, 60, 200], dur: 260 });
        for (const m of g.monsters.slice()) {
            if (!m.targetable || pointSegmentDistance(m.x, m.y, p.x, p.y, ex, ey) > 25 + m.radius) continue;
            const res = g.skillHit(s, m, g.sd(s, 2.0));
            if (res.killed || m.isBoss || m.immovable) continue;
            const tx = p.x + ux * 60, ty = p.y + uy * 60;
            g.moveMonster(m, (tx - m.x) * 0.8, (ty - m.y) * 0.8);
        }
    },
    shotgun(g, s, t) {
        const p = g.player, [ux, uy] = unitTo(p.x, p.y, t.x, t.y), dmg = g.sd(s, 1.0);
        for (let k = 0; k < 5; k++) {
            const [dx, dy] = rotateDirection(ux, uy, -20 + k * 10);
            g.skillBullet(s, null, { dir: [dx, dy], speed: 9, dmg, radius: 5, kind: "pellet", maxDist: 320,
                onHit: (gg, m, b, res) => {
                    if (!res.crit) return;
                    const o = gg.nearestTargetable(m.x, m.y, 220, m);
                    if (o) gg.skillBullet(s, null, { from: [m.x, m.y], dir: unitTo(m.x, m.y, o.x, o.y), speed: 9, dmg, radius: 5, kind: "pellet", maxDist: 240 });
                } });
        }
    },
    grenade(g, s, t) {
        const x = t.x, y = t.y, dmg = g.sd(s, 2.0), shard = g.sd(s, 0.6), p = g.player;
        g.addFx({ kind: "throw", x: p.x, y: p.y, x2: x, y2: y, r: 8, color: [120, 60, 180], dur: 500 });
        g.addTimer(500, gg => {
            gg.addFx({ kind: "circle", x, y, r: 80, color: [130, 60, 200], dur: 280 });
            gg.shake(3);
            gg.areaDamage(s, x, y, 80, dmg);
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4;
                gg.skillBullet(s, null, { from: [x, y], dir: [Math.cos(a), Math.sin(a)], speed: 7, dmg: shard, radius: 5, kind: "shard", maxDist: 210 });
            }
        });
    },
    overcharge(g, s) {
        const p = g.player, dmg = g.sd(s, 0.9);
        p.aspdBuffs.push({ mult: 1.25, until: g.now + 3000 });
        for (let i = 0; i < 5; i++) {
            g.addTimer(i * 100, gg => {
                const q = gg.player, a = uniform(0, Math.PI * 2);
                gg.skillBullet(s, null, { from: [q.x, q.y], dir: [Math.cos(a), Math.sin(a)], speed: 6.5, dmg, radius: 6, kind: "missile", homing: true, maxDist: 900 });
            });
        }
    },
    crossbow(g, s, t) {
        g.skillBullet(s, t, { speed: 13, dmg: g.sd(s, 2.5), radius: 7, kind: "bolt", pierce: 999, grow: 1.25 });
    },
};

function radiantBlast(g, s, m, dmg, left) {
    if (!m) return;
    m.marks.radiant = g.now + 1000;
    let lx = m.x, ly = m.y;
    g.addFx({ kind: "warn", x: m.x, y: m.y, r: 90, color: [255, 240, 150], dur: 1000, followM: m });
    g.addTimer(1000, gg => {
        if (gg.monsters.includes(m)) { lx = m.x; ly = m.y; }
        gg.addFx({ kind: "circle", x: lx, y: ly, r: 90, color: [255, 245, 170], dur: 280 });
        const hits = gg.areaDamage(s, lx, ly, 90, dmg);
        const killed = hits.some(h => h[1].killed) || !gg.monsters.includes(m);
        if (killed && left > 1) {
            const next = gg.nearestTargetable(lx, ly, 320);
            if (next) radiantBlast(gg, s, next, dmg, left - 1);
        }
    });
}
