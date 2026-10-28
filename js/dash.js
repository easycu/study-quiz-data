// =============================================================
// 대시(짧은 무적 이동기) + 대시 기억 (전용 1칸)
//   - 이동 방향으로 짧게 돌진, 0.2초 무적, 쿨타임 3초
//   - 무적 중에 공격이 몸을 지나가면 "완벽 회피" (짧은 슬로모션)
//   - 대시 기억: 대시할 때 발동하는 기억. 같은 걸 다시 고르면 +1 강화, 다른 걸 고르면 교체
// =============================================================
"use strict";

const DASH_DIST = 110, DASH_FRAMES = 12, DASH_INVULN_MS = 200, DASH_COOLDOWN_MS = 3000;
const PERFECT_SLOW_FRAMES = 18;
// 휴대폰 대시 버튼 (게임 좌표, 오른쪽 아래)
const DASH_BTN = { x: SCREEN_W - 80, y: SCREEN_H - 96, r: 46 };

// lv: 강화 수치 (0~). k(lv) = 1 + 0.15 * lv
function dashK(lv) { return 1 + 0.15 * (lv || 0); }
const DASH_DEFS = [
    { id: "d_shadow", name: "그림자 걸음", el: "dark", icon: "◐", desc: lv => `대시 후 다음 3발 피해 +${Math.round(60 * dashK(lv))}%` },
    { id: "d_gale", name: "질풍", el: "none", icon: "»", desc: lv => `대시 후 3초간 공속 +${Math.round(40 * dashK(lv))}%` },
    { id: "d_flame", name: "화염 질주", el: "fire", icon: "♨", desc: lv => `지나간 길에 2초간 불길 (밟은 적 화상)${lv ? ` · 피해 x${dashK(lv).toFixed(2)}` : ""}` },
    { id: "d_frost", name: "서리 발자국", el: "ice", icon: "❄", desc: lv => `도착 지점 냉기 피해·둔화, 느려진 적은 빙결${lv ? ` · 피해 x${dashK(lv).toFixed(2)}` : ""}` },
    { id: "d_bolt", name: "번개 돌진", el: "light", icon: "ϟ", desc: lv => `몸으로 통과한 적에게 번개 피해 (공격력의 ${Math.round(120 * dashK(lv))}%)` },
    { id: "d_image", name: "잔상", el: "none", icon: "☍", desc: lv => `출발 자리에 ${(2 * dashK(lv)).toFixed(1)}초짜리 분신 (적이 분신을 노림)` },
    { id: "d_land", name: "착지 충격", el: "none", icon: "◎", desc: lv => `도착할 때 주변 적을 밀쳐내고 피해 (공격력의 ${Math.round(80 * dashK(lv))}%)` },
    { id: "d_counter", name: "반격의 기술", el: "none", icon: "✪", desc: lv => `완벽 회피 시 다른 기억 쿨타임 초기화 + 다음 1발 치명타 (치명 피해 +${Math.round(50 * dashK(lv))}%)` },
    { id: "d_double", name: "이중 대시", el: "none", icon: "⇉", desc: lv => `대시를 2번 연속 사용 (충전 2회) · 쿨타임 -${Math.round(3 * (lv || 0))}%` },
    { id: "d_aegis", name: "빛의 가호", el: "light", icon: "✚", desc: lv => `대시 후 1.5초간 최대 체력 ${Math.round(10 * dashK(lv))}% 보호막` },
];
const DASH_BY_ID = {};
for (const d of DASH_DEFS) {
    DASH_BY_ID[d.id] = d;
    // 기억 피해 계산(g.sd / g.skillHit)과 시너지를 그대로 쓰려고 기억 목록에도 등록 (뽑기 목록에는 안 들어감)
    SKILL_BY_ID[d.id] = { id: d.id, name: d.name, el: d.el, cd: 0, range: 0, target: "self", desc: "" };
}

// ---------------- 능력치 ----------------
function dashMaxCharges(p) { return 1 + (p.dashSkill && p.dashSkill.id === "d_double" ? 1 : 0) + (p.dashChargeBonus || 0); }
function dashCooldown(p) {
    let cd = DASH_COOLDOWN_MS * (1 - (p.dashCdPct || 0));
    if (p.dashSkill && p.dashSkill.id === "d_double") cd *= 1 - 0.03 * p.dashSkill.level;
    return Math.max(800, cd);
}
function dashInvulnMs(p) { return DASH_INVULN_MS + (p.dashInvBonus || 0); }

// ---------------- 대시 시작 / 진행 ----------------
function dashStart(g, dir) {
    const p = g.player, now = g.now;
    if (g.modalOpen || g.gameOver || g.ending || p.dash) return false;
    if (p.dashCharges <= 0) { if (now - (p._dashDenyAt || 0) > 300) { Sound.play("select", { vol: 0.2, rate: 0.6 }); p._dashDenyAt = now; } return false; }
    let [dx, dy] = dir || Input.moveVector();
    let l = hypot(dx, dy);
    if (l < 0.1) { dx = p.facingX; dy = p.facingY; l = hypot(dx, dy) || 1; }
    dx /= l; dy /= l;
    const max = dashMaxCharges(p);
    if (p.dashCharges >= max) p.dashReadyAt = now + dashCooldown(p);       // 충전 시작
    p.dashCharges -= 1;
    const dist = DASH_DIST * (1 + (p.dashDistPct || 0));
    p.dash = { dx, dy, left: DASH_FRAMES, step: dist / DASH_FRAMES, fromX: p.x, fromY: p.y, hit: new Set(), perfect: false, t0: now };
    p.facingX = dx; p.facingY = dy;
    p.dashInvulnUntil = now + dashInvulnMs(p);
    p.invulnUntil = Math.max(p.invulnUntil, p.dashInvulnUntil);
    Sound.play("dash", { vol: 0.45, gap: 60, rate: 1.15 });
    g.shake(2, 120);
    const s = p.dashSkill;
    if (s && s.id === "d_image") g.decoy = { x: p.x, y: p.y, velX: 0, velY: 0, until: now + 2000 * dashK(s.level), radius: 14, image: true };
    return true;
}
function dashUpdate(g, now) {
    const p = g.player;
    // 충전
    const max = dashMaxCharges(p);
    if (p.dashCharges < max && now >= p.dashReadyAt) {
        p.dashCharges += 1;
        if (p.dashCharges < max) p.dashReadyAt = now + dashCooldown(p);
        if (p.dashCharges === max) p._dashReadyFlash = now;
    }
    if (p.dashCharges > max) p.dashCharges = max;
    const d = p.dash;
    if (!d) return false;
    const s = p.dashSkill;
    p.x += d.dx * d.step; p.y += d.dy * d.step;
    g.clampToPlay(p);
    [p.x, p.y] = pushCircleOutOfObstacles(p.x, p.y, p.radius, g.obstacles);
    g.clampToPlay(p);
    // 잔상
    if (d.left % 3 === 0) g.particles.push(new FxParticle({ img: "circle_05", x: p.x, y: p.y, color: s ? skillElementColor(SKILL_BY_ID[s.id].el) : [190, 220, 255], size: 34, life: 260, t0: now, alpha: 0.5 }));
    // 지나가며 맞히기: 번개 돌진 / 별자리 "돌진 공격"
    const bolt = s && s.id === "d_bolt", ram = (p.dashRam || 0) > 0;
    if (bolt || ram) for (const m of g.monsters.slice()) {
        if (d.hit.has(m) || !m.targetable || hypot(m.x - p.x, m.y - p.y) > m.radius + p.radius + 10) continue;
        d.hit.add(m);
        if (bolt) { g.skillHit(s, m, g.sd(s, 1.2)); g.zaps.push([p.x, p.y, m.x, m.y, now]); }
        if (ram) g.hitMonster(m, playerShotDamage(p) * p.dashRam, { color: [190, 220, 255] });
    }
    // 화염 질주: 불길
    if (s && s.id === "d_flame" && d.left % 4 === 0 && (g.room.type === "battle" || g.room.type === "boss") && !g.room.cleared)
        g.addZone(s, { x: p.x, y: p.y, r: 30, dur: 2000, tick: 500, dmg: g.sd(s, 0.35), burn: g.sd(s, 0.15), kind: "fire", color: [255, 120, 50] });
    d.left -= 1;
    if (d.left <= 0) dashEnd(g, now);
    return true;
}
function dashEnd(g, now) {
    const p = g.player, s = p.dashSkill;
    p.dash = null;
    if (!s) return;
    const L = dashK(s.level), inBattle = (g.room.type === "battle" || g.room.type === "boss") && !g.room.cleared;
    switch (s.id) {
        case "d_shadow": p.dashEmpower = { shots: 3, mult: 0.6 * L }; break;
        case "d_gale": p.aspdBuffs.push({ mult: 1 + 0.4 * L, until: now + 3000 }); break;
        case "d_aegis": g.shieldPlayer(p.maxHp * 0.10 * L, 1500); break;
        case "d_frost":
            if (!inBattle) break;
            g.addFx({ kind: "circle", x: p.x, y: p.y, r: 95, color: [150, 220, 255], dur: 300 });
            g.areaDamage(s, p.x, p.y, 95, g.sd(s, 0.6), (m, res, wasSlowed) => { if (res.killed) return; if (wasSlowed) g.stunMonster(m, 1000); else g.slowMonster(m, 0.5, 2000); });
            break;
        case "d_land":
            if (!inBattle) break;
            g.addFx({ kind: "circle", x: p.x, y: p.y, r: 105, color: [230, 230, 240], dur: 260 });
            g.shake(4, 160);
            g.areaDamage(s, p.x, p.y, 105, g.sd(s, 0.8), (m, res) => { if (!res.killed) g.knockMonster(m, p.x, p.y, 60); });
            break;
    }
}
// 무적 중에 공격이 들어오면 (한 번의 대시에 한 번)
function dashPerfect(g) {
    const p = g.player, now = g.now, d = p.dash || p._lastDash;
    if (p._perfectAt && now - p._perfectAt < 400) return;
    p._perfectAt = now;
    g.stats.perfect = (g.stats.perfect || 0) + 1;
    g.slowFrames = Math.max(g.slowFrames, PERFECT_SLOW_FRAMES);
    g.popup(p.x, p.y - p.radius - 30, "완벽 회피!", [140, 230, 255]);
    spawnHitSparks(g.particles, p.x, p.y, [160, 230, 255], now, 10, true);
    Sound.play("crit", { vol: 0.5, rate: 1.4 });
    const s = p.dashSkill;
    if (s && s.id === "d_counter") {
        for (const sk of p.skills) sk.readyAt = Math.min(sk.readyAt, now);
        p.nextCrit = 0.5 * dashK(s.level);
    }
    if (p.perfectAspd > 0) p.aspdBuffs.push({ mult: 1 + p.perfectAspd, until: now + 2000 });
    if (p.perfectStealth > 0) { p.stealthUntil = now + p.perfectStealth; g.decoy = { x: p.x, y: p.y, velX: 0, velY: 0, until: now + p.perfectStealth, radius: 14, image: true }; }
    void d;
}

// ---------------- 대시 기억 고르기 (카드 화면을 그대로 씀) ----------------
function dashCardFor(g, def) {
    const p = g.player, own = p.dashSkill, col = skillElementColor(def.el);
    const same = own && own.id === def.id, lv = same ? own.level + 1 : 0;
    return {
        id: "dash_" + def.id, r: "rare", name: def.name, icon: def.icon, color: col, isDash: true,
        desc: () => def.desc(lv),
        note: same ? `강화 +${own.level} → +${lv}` : own ? `교체: ${DASH_BY_ID[own.id].name} 버림` : "새 대시 기억",
        apply: gg => setDashSkill(gg, def.id),
    };
}
function openDashPick(g) {
    const p = g.player, own = p.dashSkill;
    let pool = DASH_DEFS.filter(d => !(own && own.id === d.id && own.level >= SKILL_MAX_LEVEL));
    let picks = sample(pool, 3);
    // 가진 대시 기억은 강화할 수 있게 자주 보여준다
    if (own && own.level < SKILL_MAX_LEVEL && !picks.some(d => d.id === own.id) && Math.random() < 0.6) picks[0] = DASH_BY_ID[own.id];
    g.openCardPick({ options: picks.map(d => dashCardFor(g, d)), title: "대시 기억 고르기", color: [140, 220, 255],
                     sub: own ? `지금: ${DASH_BY_ID[own.id].name} +${own.level}  ·  같은 걸 고르면 강화, 다른 걸 고르면 교체` : "대시할 때 발동하는 기억 (전용 1칸)" });
}
function setDashSkill(g, id) {
    const p = g.player, def = DASH_BY_ID[id];
    if (p.dashSkill && p.dashSkill.id === id) p.dashSkill.level = Math.min(SKILL_MAX_LEVEL, p.dashSkill.level + 1);
    else p.dashSkill = { id, level: 0 };
    p.dashCharges = Math.min(p.dashCharges, dashMaxCharges(p));
    if (id === "d_double" && p.dashCharges < dashMaxCharges(p) && !(p.dashReadyAt > g.now)) p.dashReadyAt = g.now + dashCooldown(p);
    g.popup(p.x, p.y - 44, `${def.name}${p.dashSkill.level ? " +" + p.dashSkill.level : ""}`, skillElementColor(def.el));
    g.checkSynergy();
}
