// =============================================================
// 전투 공통: 공격 예고(빨간 원/선/부채꼴/전체), 충격파 고리, 지뢰,
//            새 일반 몬스터 AI, 엘리트 접두사
// (Python 버전에도 같은 이름·같은 규칙으로 옮김)
// =============================================================
"use strict";

// ---------------- 공격 예고 ----------------
// kind: "circle"(원) / "line"(굵은 선) / "cone"(부채꼴) / "field"(방 전체, safes 원만 안전)
// fireAt이 되면 그 안에 있는 플레이어가 damage를 받는다. damage 0이면 보여주기만 한다.
class Telegraph {
    constructor(kind, now, ms, o) {
        o = o || {};
        this.kind = kind;
        this.x = o.x || 0; this.y = o.y || 0;
        this.r = o.r || 0;                                   // circle
        this.x2 = o.x2 || 0; this.y2 = o.y2 || 0; this.width = o.width || 12;   // line
        this.angle = o.angle || 0; this.len = o.len || 0; this.half = o.half || 0;   // cone (half: 라디안)
        this.safes = o.safes || [];                          // field: [[x, y, r], ...]
        this.losBlock = !!o.losBlock;                        // field: (x,y)에서 플레이어 사이에 벽이 있으면 안전
        this.startAt = now; this.fireAt = now + ms;
        this.damage = o.damage || 0;
        this.color = o.color || TELEGRAPH_COLOR;
        this.owner = o.owner || null;
        this.cancelWithOwner = !!o.cancelWithOwner;
        this.onFire = o.onFire || null;                      // (g, tg, hitPlayer)
        this.track = o.track || null;                        // (g, tg) 매 칸 위치 갱신 (lockAt 전까지)
        this.lockAt = o.lockAt || this.fireAt;
        this.slowPct = o.slowPct || 0; this.slowMs = o.slowMs || 0;
    }
    progress(now) { return clamp((now - this.startAt) / Math.max(1, this.fireAt - this.startAt), 0, 1); }
    contains(px, py, pr, obstacles) {
        pr = pr || 0;
        switch (this.kind) {
            case "circle": return hypot(px - this.x, py - this.y) <= this.r + pr * 0.6;
            case "line": return pointSegmentDistance(px, py, this.x, this.y, this.x2, this.y2) <= this.width / 2 + pr * 0.6;
            case "cone": {
                const dx = px - this.x, dy = py - this.y, d = hypot(dx, dy);
                if (d > this.len + pr * 0.6) return false;
                if (d < pr) return true;
                let diff = Math.atan2(dy, dx) - this.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                return Math.abs(diff) <= this.half + Math.asin(Math.min(1, pr * 0.6 / Math.max(d, 1)));
            }
            case "field": {
                for (const [sx, sy, sr] of this.safes) if (hypot(px - sx, py - sy) <= sr - pr * 0.4) return false;
                if (this.losBlock && lineBlocked(this.x, this.y, px, py, obstacles || [])) return false;
                return true;
            }
        }
        return false;
    }
}
// (ax,ay) -> (bx,by) 사이를 장애물이 가로막는지
function lineBlocked(ax, ay, bx, by, obstacles) {
    const d = hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(d / 6));
    for (const o of obstacles) {
        if (o.kind === "circle") { if (pointSegmentDistance(o.x, o.y, ax, ay, bx, by) < o.r) return true; continue; }
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            if (o.distanceTo(ax + (bx - ax) * t, ay + (by - ay) * t) < 1) return true;
        }
    }
    return false;
}
// 선 telegraph용: (x,y)에서 dir 방향으로 방 끝(또는 maxLen)까지
function lineEnd(x, y, dx, dy, maxLen) {
    const len = rayExitLength(x, y, Math.atan2(dy, dx), maxLen || 2000);
    return [x + dx * len, y + dy * len];
}

// ---------------- 충격파 고리 ----------------
// 가운데서 점점 커지는 고리. gaps(빈틈) 각도로 들어오면 안 맞는다.
class Shockwave {
    constructor(x, y, speed, maxR, damage, gaps, color, owner) {
        this.x = x; this.y = y; this.r = 10; this.speed = speed; this.maxR = maxR;
        this.damage = damage; this.gaps = gaps || []; this.color = color || [255, 150, 90];
        this.hit = false; this.owner = owner || null;
    }
    inGap(angle) {
        for (const [c, h] of this.gaps) {
            let d = angle - c;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) <= h) return true;
        }
        return false;
    }
    touches(px, py, pr) {
        const d = hypot(px - this.x, py - this.y);
        if (Math.abs(d - this.r) > SHOCKWAVE_THICKNESS / 2 + pr * 0.6) return false;
        return !this.inGap(Math.atan2(py - this.y, px - this.x));
    }
}
// 보스 충격파 고리의 빈틈: 하나는 플레이어 쪽 가까이에 두고 나머지는 고르게 나눈다
//   (빈틈이 반대편에만 있어서 아무리 빨라도 못 피하는 일이 없게)
//   same: 이미 퍼지고 있는 고리의 빈틈을 그대로 쓰면 연달아 나와도 같은 자리에서 피할 수 있다
function ringGaps(g, m, n, halfWidth, same, speed, shift) {
    if (same) return same.map(([c, h]) => [c + (shift || 0), Math.max(h, halfWidth)]);
    const T = g.aimFor(m), p = g.player;
    const ang = Math.atan2(T.y - m.y, T.x - m.x), d = Math.max(40, hypot(T.x - m.x, T.y - m.y));
    // 고리가 플레이어에게 닿을 때까지 걸어서 갈 수 있는 옆 거리
    const frames = Math.max(8, (d - 10) / (speed || 4));
    const pSpeed = p.speed * (g.now < p.slowUntil ? 1 - (p.slowPct || 0) : 1);
    const reachAng = Math.min(Math.PI / n, pSpeed * frames * SHOCKWAVE_GAP_REACH_SAFETY / d);
    const off = reachAng * uniform(SHOCKWAVE_GAP_REACH_MIN, SHOCKWAVE_GAP_REACH_MAX) * (Math.random() < 0.5 ? -1 : 1);
    const base = ang + off, out = [];
    for (let i = 0; i < n; i++) out.push([base + i * Math.PI * 2 / n, halfWidth]);
    return out;
}
// 이 보스가 쏜, 아직 퍼지고 있는 충격파의 빈틈 (없으면 null)
function activeRingGaps(g, m) {
    const w = g.shockwaves.find(s => s.owner === m && s.r < s.maxR);
    return w ? w.gaps : null;
}
function randomGaps(n, halfWidth) {
    const base = uniform(0, Math.PI * 2), out = [];
    for (let i = 0; i < n; i++) out.push([base + i * Math.PI * 2 / n + uniform(-0.4, 0.4), halfWidth]);
    return out;
}

// ---------------- 지뢰 (함정꾼) ----------------
class Mine {
    constructor(x, y, owner, damage, now) {
        this.x = x; this.y = y; this.owner = owner; this.damage = damage;
        this.armAt = now + TRAPPER_MINE_ARM_MS; this.expireAt = now + TRAPPER_MINE_LIFE_MS;
        this.triggered = false;
    }
}

// =============================================================
// 새 일반 몬스터 AI  (g = Game, aim = 노리는 대상(플레이어 또는 깃발))
// =============================================================
function chaseStep(m, aim, factor) {
    const d = predictedDirection(m, aim, m.speed, PREDICT_MELEE_FACTOR, PREDICT_MELEE_MAX_FRAMES);
    if (d) { m.x += d[0] * m.speed * (factor || 1); m.y += d[1] * m.speed * (factor || 1); }
}

function updateKamikaze(g, m, aim, now, canAttack) {
    if (m.aiState === "fuse") return;            // 멈춰서 깜빡이는 중 (예고가 터지면 자폭)
    chaseStep(m, aim);
    if (canAttack && hypot(aim.x - m.x, aim.y - m.y) < KAMIKAZE_TRIGGER_RANGE) {
        m.aiState = "fuse";
        g.addTelegraph(new Telegraph("circle", now, KAMIKAZE_FUSE_MS, {
            x: m.x, y: m.y, r: KAMIKAZE_BLAST_RADIUS, damage: m.bulletDamage, owner: m, cancelWithOwner: true,
            color: KAMIKAZE_COLOR,
            onFire: (gg) => { if (gg.monsters.includes(m)) gg.killMonster(m, { selfDestruct: true }); },
        }));
    }
}

function updateLeaper(g, m, aim, now, canAttack) {
    if (m.aiState === "air") {
        const t = clamp((now - m.jumpStart) / LEAPER_AIR_MS, 0, 1);
        m.x = m.jumpFrom[0] + (m.jumpTo[0] - m.jumpFrom[0]) * t;
        m.y = m.jumpFrom[1] + (m.jumpTo[1] - m.jumpFrom[1]) * t;
        m.jumpHeight = Math.sin(t * Math.PI) * 40;
        if (t >= 1) { m.aiState = "idle"; m.airborne = false; m.jumpHeight = 0; m.aiNext = now + LEAPER_COOLDOWN_MS; }
        return;
    }
    chaseStep(m, aim, 0.8);
    if (canAttack && now >= m.aiNext && hypot(aim.x - m.x, aim.y - m.y) < LEAPER_RANGE) {
        const [tx, ty] = predictPlayerPoint(aim, LEAPER_AIR_MS / FRAME_MS * 0.5, 0.8, 40);
        m.aiState = "air"; m.airborne = true; m.jumpStart = now;
        m.jumpFrom = [m.x, m.y]; m.jumpTo = [clamp(tx, PLAY_LEFT + 20, PLAY_RIGHT - 20), clamp(ty, PLAY_TOP + 20, PLAY_BOTTOM - 20)];
        g.addTelegraph(new Telegraph("circle", now, LEAPER_AIR_MS, {
            x: m.jumpTo[0], y: m.jumpTo[1], r: LEAPER_SLAM_RADIUS, damage: m.bulletDamage, owner: m, cancelWithOwner: true,
            onFire: (gg) => { gg.shake(SCREEN_SHAKE_HIT); gg.addFx({ kind: "ring", x: m.jumpTo[0], y: m.jumpTo[1], r: LEAPER_SLAM_RADIUS, color: LEAPER_COLOR, dur: 250 }); },
        }));
    }
}

function updateAssassin(g, m, aim, now, canAttack) {
    const st = m.aiState;
    if (st === "hide") {
        if (now < m.aiUntil) return;
        // 플레이어 등 뒤(보는 방향의 반대쪽)에 나타난다
        const p = g.player;
        let fx = p.facingX, fy = p.facingY;
        if (aim !== p) { fx = 0; fy = -1; }
        let nx = clamp(aim.x - fx * 75, PLAY_LEFT + m.radius, PLAY_RIGHT - m.radius);
        let ny = clamp(aim.y - fy * 75, PLAY_TOP + m.radius, PLAY_BOTTOM - m.radius);
        [nx, ny] = pushCircleOutOfObstacles(nx, ny, m.radius, g.obstacles);
        m.x = nx; m.y = ny; m.hidden = false;
        m.aiState = "windup";
        const ang = Math.atan2(aim.y - m.y, aim.x - m.x);
        g.addFx({ kind: "puff", x: m.x, y: m.y, r: 26, color: ASSASSIN_COLOR, dur: 300 });
        g.addTelegraph(new Telegraph("cone", now, ASSASSIN_WINDUP_MS, {
            x: m.x, y: m.y, angle: ang, len: ASSASSIN_SLASH_LEN, half: radians(ASSASSIN_SLASH_HALF_DEG),
            damage: m.bulletDamage, owner: m, cancelWithOwner: true,
            onFire: () => { m.aiState = "recover"; m.aiUntil = now + ASSASSIN_WINDUP_MS + 450; },
        }));
        return;
    }
    if (st === "windup") return;
    if (st === "recover") { if (now >= m.aiUntil) { m.aiState = "idle"; m.aiNext = now + ASSASSIN_COOLDOWN_MS; } return; }
    chaseStep(m, aim, 0.9);
    if (canAttack && now >= m.aiNext && hypot(aim.x - m.x, aim.y - m.y) < 420) {
        m.aiState = "hide"; m.hidden = true; m.aiUntil = now + ASSASSIN_HIDE_MS;
        g.addFx({ kind: "puff", x: m.x, y: m.y, r: 26, color: ASSASSIN_COLOR, dur: 300 });
    }
}

function updateTurret(g, m, aim, now, canAttack) {
    if (!canAttack) return;
    if (m.aiState !== "fire") {
        if (now - m.lastShotTime > m.shootCooldown) { m.aiState = "fire"; m.aiUntil = now + TURRET_BURST_MS; m.aiNext = now; m.aiAngle = Math.atan2(aim.y - m.y, aim.x - m.x); }
        return;
    }
    if (now >= m.aiNext) {
        for (let k = 0; k < TURRET_ARMS; k++) {
            const a = m.aiAngle + k * Math.PI * 2 / TURRET_ARMS;
            g.bullets.push(new Bullet(m.x, m.y, Math.cos(a), Math.sin(a), TURRET_BULLET_SPEED, m.bulletDamage, "monster", false, 6));
        }
        m.aiAngle += 0.42;
        m.aiNext = now + TURRET_FIRE_GAP_MS;
    }
    if (now >= m.aiUntil) { m.aiState = "rest"; m.lastShotTime = now; }
}

function updateSniper(g, m, aim, now, canAttack) {
    if (m.aiState === "aim") return;                       // 조준 중에는 멈춤
    const d = keepDistance(m, aim, 330);
    if (!(canAttack && now - m.lastShotTime > m.shootCooldown && d < 760)) return;
    m.aiState = "aim";
    const dirTo = () => { const dx = aim.x - m.x, dy = aim.y - m.y, l = hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const [dx, dy] = dirTo(), [ex, ey] = lineEnd(m.x, m.y, dx, dy, 1100);
    g.addTelegraph(new Telegraph("line", now, SNIPER_AIM_MS, {
        x: m.x, y: m.y, x2: ex, y2: ey, width: 10, owner: m, cancelWithOwner: true, color: [255, 60, 60],
        lockAt: now + SNIPER_AIM_MS - SNIPER_LOCK_MS,
        track: (gg, tg) => { const [a, b] = dirTo(); [tg.x2, tg.y2] = lineEnd(m.x, m.y, a, b, 1100); tg.x = m.x; tg.y = m.y; },
        onFire: (gg, tg) => {
            const l = hypot(tg.x2 - tg.x, tg.y2 - tg.y) || 1;
            gg.bullets.push(new Bullet(m.x, m.y, (tg.x2 - tg.x) / l, (tg.y2 - tg.y) / l, SNIPER_BULLET_SPEED, m.bulletDamage, "monster", false, 6));
            m.aiState = "idle"; m.lastShotTime = gg.now;
        },
    }));
}

function updateTrapper(g, m, aim, now, canAttack) {
    const dx = aim.x - m.x, dy = aim.y - m.y, d = hypot(dx, dy);
    if (d < 260 && d > 0) { m.x -= dx / d * m.speed; m.y -= dy / d * m.speed; }   // 가까우면 도망
    else keepDistance(m, aim, 300);
    if (!canAttack || now - m.lastShotTime <= m.shootCooldown) return;
    if (g.mines.filter(mi => mi.owner === m).length >= TRAPPER_MAX_MINES) return;
    g.mines.push(new Mine(m.x, m.y, m, m.bulletDamage, now));
    m.lastShotTime = now;
}

function updateShaman(g, m, aim, now, canAttack) {
    keepDistance(m, aim, 260);
    if (!canAttack || now - m.lastShotTime <= m.shootCooldown) return;
    m.lastShotTime = now;
    // 1) 근처에서 막 죽은 몬스터를 한 번 부활
    if (!m.reviveUsed) {
        const dead = g.recentDeaths.find(dd => now - dd.time <= SHAMAN_REVIVE_WINDOW_MS && hypot(dd.x - m.x, dd.y - m.y) <= SHAMAN_RANGE * 1.4);
        if (dead && g.monsters.length < MAX_MONSTERS_PER_ROOM + 4) {
            g.recentDeaths.splice(g.recentDeaths.indexOf(dead), 1);
            const r = new Monster(dead.x, dead.y, dead.type, dead.stage, dead.subtype, false, dead.power);
            r.hp = Math.max(1, pyRound(r.hp * 0.5)); r.revived = true;
            r.lastShotTime = now; r.lastTouchTime = now; r.lastDamagedTime = now;
            g.monsters.push(r);
            m.reviveUsed = true;
            g.addFx({ kind: "beam", x: m.x, y: m.y, x2: r.x, y2: r.y, color: SHAMAN_COLOR, dur: 400 });
            g.addFx({ kind: "ring", x: r.x, y: r.y, r: 30, color: SHAMAN_COLOR, dur: 400 });
            g.popup(r.x, r.y - 30, "부활!", SHAMAN_COLOR);
            return;
        }
    }
    // 2) 다친 동료가 있으면 회복, 아니면 보호막
    const allies = g.monsters.filter(o => o !== m && !o.isBoss && hypot(o.x - m.x, o.y - m.y) <= SHAMAN_RANGE);
    if (!allies.length) return;
    const hurt = allies.filter(o => o.hp < o.maxHp * 0.9);
    for (const o of (hurt.length ? hurt : allies)) {
        if (hurt.length) {
            const heal = o.maxHp * SHAMAN_HEAL_RATIO;
            o.hp = Math.min(o.maxHp, o.hp + heal);
            g.popup(o.x, o.y - o.radius - 14, `+${fmtNum(heal)}`, [120, 255, 160]);
        } else {
            o.shield = Math.max(o.shield, o.maxHp * SHAMAN_SHIELD_RATIO); o.shieldUntil = now + SHAMAN_SHIELD_MS;
        }
        g.addFx({ kind: "beam", x: m.x, y: m.y, x2: o.x, y2: o.y, color: SHAMAN_COLOR, dur: 350 });
    }
}

function updateHexer(g, m, aim, now, canAttack) {
    const d = keepDistance(m, aim, 240);
    if (!(canAttack && now - m.lastShotTime > m.shootCooldown) || d <= 0) return;
    const dir = predictedDirection(m, aim, 3.6, PREDICT_BULLET_FACTOR, PREDICT_BULLET_MAX_FRAMES) || [(aim.x - m.x) / d, (aim.y - m.y) / d];
    const b = new Bullet(m.x, m.y, dir[0], dir[1], 3.6, m.bulletDamage, "monster", false, 9);
    b.hex = true;
    g.bullets.push(b);
    m.lastShotTime = now;
}

function updateEgg(g, m, now) {
    if (!m.hatchAt) m.hatchAt = now + EGG_HATCH_MS;
    if (now >= m.hatchAt) g.hatchEgg(m);
}

// 새 몬스터면 처리하고 true를 돌려준다
function updateNewMonster(g, m, aim, now, canAttack) {
    switch (m.subtype) {
        case "kamikaze": updateKamikaze(g, m, aim, now, canAttack); return true;
        case "leaper": updateLeaper(g, m, aim, now, canAttack); return true;
        case "assassin": updateAssassin(g, m, aim, now, canAttack); return true;
        case "turret": updateTurret(g, m, aim, now, canAttack); return true;
        case "sniper": updateSniper(g, m, aim, now, canAttack); return true;
        case "trapper": updateTrapper(g, m, aim, now, canAttack); return true;
        case "shaman": updateShaman(g, m, aim, now, canAttack); return true;
        case "hexer": updateHexer(g, m, aim, now, canAttack); return true;
        case "egg": updateEgg(g, m, now); return true;
    }
    return false;
}

// =============================================================
// 엘리트 접두사 (매 칸)
// =============================================================
function updateEliteAffixes(g, m, now, canAttack) {
    if (!m.affixes.length) return;
    const moved = m._lastX === undefined ? false : hypot(m.x - m._lastX, m.y - m._lastY) > 0.3;
    m._lastX = m.x; m._lastY = m.y;
    if (!canAttack) return;
    for (const a of m.affixes) {
        if (a === "fire" && moved && now >= (m.affFire || 0)) {
            spawnHazard(g.hazards, m.x, m.y, 26, scaleDmg(HAZARD_DAMAGE * 0.6, m.power), now, affixColor("fire"), 250, 2200);
            m.affFire = now + ELITE_FIRE_TRAIL_MS;
        } else if (a === "frost" && now >= (m.affFrost || now + 1)) {
            g.addTelegraph(new Telegraph("circle", now, 900, {
                x: m.x, y: m.y, r: ELITE_FROST_RADIUS, damage: scaleDmg(ELITE_FROST_DMG, m.power), owner: m, cancelWithOwner: true,
                color: affixColor("frost"), slowPct: 0.4, slowMs: 2000, lockAt: now + 700,
                track: (gg, tg) => { tg.x = m.x; tg.y = m.y; },
            }));
            m.affFrost = now + ELITE_FROST_GAP_MS;
        } else if (a === "arcane" && !m.laser) {
            m.laser = new RotatingLaser(m.x, m.y, scaleDmg(ELITE_ARCANE_DMG, m.power), now, 2,
                { length: ELITE_ARCANE_LEN, width: 12, warnMs: 900, activeMs: 2600, restMs: 1400, angularSpeed: 0.03 });
            m.laser.owner = m;
            g.lasers.push(m.laser);
        } else if (a === "shielded" && now >= (m.affShield || now + 1)) {
            m.shield = m.maxHp * ELITE_SHIELD_RATIO; m.shieldUntil = now + ELITE_SHIELD_MS;
            m.affShield = now + ELITE_SHIELD_GAP_MS;
        }
    }
    if (m.affFrost === undefined) m.affFrost = now + 1800;
    if (m.affShield === undefined) m.affShield = now + 1200;
    if (m.laser && !m.isBoss) { m.laser.cx = m.x; m.laser.cy = m.y; }
}

// 엘리트가 죽을 때 (폭발 / 분열 / 냉기)
function eliteDeathEffects(g, m, now) {
    if (m.hasAffix("explosive") || m.hasAffix("frost")) {
        const frost = !m.hasAffix("explosive");
        g.addTelegraph(new Telegraph("circle", now, 700, {
            x: m.x, y: m.y, r: frost ? ELITE_FROST_RADIUS : ELITE_EXPLODE_RADIUS,
            damage: scaleDmg(frost ? ELITE_FROST_DMG : ELITE_EXPLODE_DMG, m.power),
            color: affixColor(frost ? "frost" : "explosive"), slowPct: frost ? 0.4 : 0, slowMs: frost ? 2000 : 0,
        }));
    }
    if (m.hasAffix("splitting") && g.monsters.length < MAX_MONSTERS_PER_ROOM + 4) {
        for (let i = 0; i < 2; i++) {
            const a = uniform(0, Math.PI * 2);
            const c = new Monster(clamp(m.x + Math.cos(a) * 22, PLAY_LEFT + 12, PLAY_RIGHT - 12), clamp(m.y + Math.sin(a) * 22, PLAY_TOP + 12, PLAY_BOTTOM - 12),
                m.type, m.stage, m.subtype, false, m.power);
            c.hp = Math.max(1, pyRound(c.hp * 0.35)); c.maxHp = c.hp;
            c.radius = Math.max(9, pyRound(c.radius * 0.8)); c.isMinion = true;
            c.lastShotTime = now; c.lastTouchTime = now; c.lastDamagedTime = now;
            c.snapshotRageBaseStats();
            g.monsters.push(c);
        }
    }
}
