// =============================================================
// 보스: 공통 구조 (패턴 돌려쓰기 / 쉬는 틈 / 페이즈 전환) + 보스별 패턴
//   - 보스는 "이동 -> 패턴 -> 쉬는 틈(받는 피해 증가) -> 이동 ..."을 반복한다.
//   - 체력 70%, 35%에서 페이즈가 바뀌며 새 패턴이 추가된다. (3페이즈는 분노 상태)
//   - 패턴은 제너레이터 함수: yield ms = 그만큼 기다렸다가 이어서, yield 0 = 다음 칸
// =============================================================
"use strict";

// patterns: [1페이즈 패턴들, 2페이즈에 추가, 3페이즈에 추가]
const BOSS_DEFS = {
    brute: { name: "돌격 대장", color: [235, 165, 30], unlock: 1, move: "keep", dist: 250, patterns: [["dash", "spread"], ["dash3"], ["slamRing"]] },
    golem: { name: "바위 거인", color: [150, 130, 110], unlock: BOSS_GOLEM_UNLOCK_STAGE, move: "chase", speed: 0.75, hpMult: 1.15, melee: true, patterns: [["slam3", "stompRing"], ["rockfall"], ["quake"]] },
    swarm: { name: "무리의 군주", color: [90, 210, 110], unlock: BOSS_SWARM_UNLOCK_STAGE, move: "keep", dist: 260, patterns: [["summon", "spread"], ["dash"], ["ringShot"]] },
    venom: { name: "독의 군주", color: [140, 220, 70], unlock: BOSS_VENOM_UNLOCK_STAGE, move: "keep", dist: 250, passive: "venom", patterns: [["poolBarrage", "spread"], ["toxicRain"], ["dash"]] },
    mage: { name: "탄막 마법사", color: [120, 140, 255], unlock: BOSS_MAGE_UNLOCK_STAGE, move: "keep", dist: 300, patterns: [["spiral", "flower"], ["teleportSpiral", "beamSweep"], ["storm"]] },
    sniper: { name: "저격수", color: [80, 160, 235], unlock: BOSS_SNIPER_UNLOCK_STAGE, move: "keep", dist: 340, patterns: [["snipe", "homingPair"], ["snipeFan"], ["snipeTriple"]] },
    blade: { name: "검귀", color: [215, 215, 235], unlock: BOSS_BLADE_UNLOCK_STAGE, move: "chase", speed: 1.1, melee: true, patterns: [["tripleDash", "crescent"], ["afterimageDash"], ["crescentDouble"]] },
    laser: { name: "광선 감시자", color: [255, 100, 100], unlock: BOSS_LASER_UNLOCK_STAGE, move: "keep", dist: 260, passive: "laser", patterns: [["spread", "aimed"], ["crossBeams"], ["ringShot"]] },
    queen: { name: "둥지 여왕", color: [200, 160, 90], unlock: BOSS_QUEEN_UNLOCK_STAGE, move: "keep", dist: 280, patterns: [["layEggs", "acidSpray"], ["poolBarrage"], ["broodCharge"]] },
    artillery: { name: "포격 장군", color: [190, 80, 210], unlock: BOSS_ARTILLERY_UNLOCK_STAGE, move: "keep", dist: 300, patterns: [["ringShot", "mortarRain"], ["spiral"], ["mortarRainBig"]] },
    judge: { name: "심판자", color: [240, 210, 120], unlock: BOSS_JUDGE_UNLOCK_STAGE, move: "keep", dist: 280, patterns: [["safeZone", "crossLines"], ["hideBehind"], ["judgement"]] },
    mirror: { name: "거울 마녀", color: [230, 230, 110], unlock: BOSS_MIRROR_UNLOCK_STAGE, move: "keep", dist: 260, patterns: [["clone", "spread"], ["blinkDash"], ["clone2"]] },
};
const BOSS_ORDER = Object.keys(BOSS_DEFS);

function unlockedBosses(stage) { return BOSS_ORDER.filter(k => stage >= BOSS_DEFS[k].unlock); }
function pickBossVariant(stage) {
    if (stage >= BOSS_HYBRID_UNLOCK_STAGE && Math.random() < BOSS_HYBRID_CHANCE) return "hybrid";
    return choice(unlockedBosses(stage));
}
function pickHybridParts(stage) { return sample(unlockedBosses(stage), 2); }
function bossPatternPool(m) {
    const out = [];
    for (const v of m.parts) {
        const pats = BOSS_DEFS[v].patterns;
        for (let i = 0; i < Math.min(m.phase, pats.length); i++) for (const p of pats[i]) if (!out.includes(p)) out.push(p);
    }
    return out;
}
function bossDef(m) { return BOSS_DEFS[m.parts[0]]; }
function bossHas(m, key) { return m.parts.some(v => BOSS_DEFS[v][key]); }
function tgMs(m, base) { return Math.max(MIN_TELEGRAPH_MS, Math.round(base * (m.phase >= 3 ? 0.85 : 1))); }
function unitTo(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, d = hypot(dx, dy) || 1; return [dx / d, dy / d]; }

// ---------------- 매 칸 ----------------
function updateBoss(g, m, now, canAttack) {
    // 늘 켜져 있는 능력
    if (bossHas(m, "passive")) {
        for (const v of m.parts) {
            const ps = BOSS_DEFS[v].passive;
            if (ps === "laser") {
                if (!m.laser) {
                    m.laser = new RotatingLaser(m.x, m.y, scaleDmg(LASER_DAMAGE, m.power), now, BOSS_LASER_BEAM_COUNT);
                    m.laser.owner = m; g.lasers.push(m.laser);
                } else { m.laser.cx = m.x; m.laser.cy = m.y; }
            } else if (ps === "venom" && canAttack && now >= m.nextTrailTime) {
                spawnHazard(g.hazards, m.x, m.y, HAZARD_RADIUS * 0.8, scaleDmg(HAZARD_DAMAGE, m.power), now, m.baseColor);
                m.nextTrailTime = now + BOSS_VENOM_TRAIL_COOLDOWN_MS;
            }
        }
    }
    // 페이즈 전환
    if (m.phase === 1 && m.hp <= m.maxHp * BOSS_PHASE2_RATIO) startBossPhase(g, m, 2, now);
    else if (m.phase === 2 && m.hp <= m.maxHp * BOSS_PHASE3_RATIO) startBossPhase(g, m, 3, now);

    const T = g.aimFor(m);
    switch (m.bstate) {
        case "phase":
            if (now >= m.bUntil) { m.bstate = "move"; m.bUntil = now + randInt(BOSS_MOVE_MS[0], BOSS_MOVE_MS[1]); m.moveShotDone = false; }
            return;
        case "rest":
            if (now >= m.bUntil) { m.bstate = "move"; m.bUntil = now + randInt(BOSS_MOVE_MS[0], BOSS_MOVE_MS[1]); m.moveShotDone = false; }
            return;
        case "move": {
            const def = bossDef(m);
            if (def.move === "chase") {
                const d = hypot(T.x - m.x, T.y - m.y);
                if (d > m.radius + 30) { const [ux, uy] = unitTo(m.x, m.y, T.x, T.y); m.x += ux * m.speed; m.y += uy * m.speed; }
            } else keepDistance(m, T, def.dist || 260);
            // 이동 중 가볍게 한 발 (근접 보스는 안 쏨)
            if (canAttack && !def.melee && !m.moveShotDone && now >= m.bUntil - 500) {
                m.moveShotDone = true;
                const dir = predictedDirection(m, T, RANGED_BULLET_SPEED, PREDICT_BOSS_FACTOR, PREDICT_BULLET_MAX_FRAMES) || unitTo(m.x, m.y, T.x, T.y);
                g.bullets.push(new Bullet(m.x, m.y, dir[0], dir[1], RANGED_BULLET_SPEED, m.bulletDamage, "monster"));
            }
            if (canAttack && now >= m.bUntil) {
                const pool = bossPatternPool(m);
                const cands = pool.length > 1 ? pool.filter(p => p !== m.lastPattern) : pool;
                // 새로 열린 패턴은 조금 더 자주 나오게
                const name = choice(cands);
                m.lastPattern = name; m.patternName = name;
                m.gen = BOSS_PATTERNS[name](g, m);
                m.genWait = now; m.bstate = "cast";
            }
            return;
        }
        case "cast": {
            if (now < m.genWait) return;
            const r = m.gen.next();
            if (r.done) {
                m.gen = null; m.patternName = null; m.dashState = "chase"; m.airborne = false; m.hidden = false; m.jumpHeight = 0;
                m.bstate = "rest";
                m.bUntil = now + Math.round(randInt(BOSS_REST_MS[0], BOSS_REST_MS[1]) * (m.phase >= 3 ? BOSS_PHASE3_REST_MULT : 1));
            } else m.genWait = now + (r.value || 0);
            return;
        }
    }
}

function startBossPhase(g, m, phase, now) {
    m.phase = phase;
    m.gen = null; m.patternName = null; m.dashState = "chase"; m.airborne = false; m.hidden = false; m.jumpHeight = 0;
    m.bstate = "phase"; m.bUntil = now + BOSS_PHASE_CHANGE_MS;
    m.invulnUntil = m.bUntil;
    // 보스 쪽 예고는 취소 (페이즈 전환 중 억울하게 맞지 않게)
    g.telegraphs = g.telegraphs.filter(t => t.owner !== m);
    g.shockwaves.push(new Shockwave(m.x, m.y, 5, 520, Math.max(1, pyRound(m.bulletDamage * 0.6)), randomGaps(2, 0.45), m.baseColor, m));
    g.shake(SCREEN_SHAKE_BOSS_DASH, SCREEN_SHAKE_DURATION_MS * 3);
    g.popup(m.x, m.y - m.radius - 34, phase === 3 ? "3페이즈 - 분노!" : "2페이즈!", [255, 120, 60]);
    if (phase === 3) {
        m.enraged = true; m.color = BOSS_ENRAGE_COLOR;
        m.rageBaseSpeed *= BOSS_PHASE3_SPEED_MULT; m.rageBaseDashSpeed *= BOSS_PHASE3_SPEED_MULT;
        applyRageStats(m);
        if (m.laser && m.laser.owner === m) m.laser.beamCount = BOSS_LASER_BEAM_COUNT + 1;
    }
}

// ---------------- 패턴에서 쓰는 도구 ----------------
function bossBullet(g, m, dx, dy, speedMult, dmgMult, radius, homing) {
    g.bullets.push(new Bullet(m.x, m.y, dx, dy, RANGED_BULLET_SPEED * (speedMult || 1),
        Math.max(1, pyRound(m.bulletDamage * (dmgMult || 1))), "monster", !!homing, radius || 5));
}
function bossRing(g, m, count, speedMult, offset, dmgMult) {
    for (let i = 0; i < count; i++) {
        const a = (offset || 0) + i * Math.PI * 2 / count;
        bossBullet(g, m, Math.cos(a), Math.sin(a), speedMult, dmgMult);
    }
}
function aimDir(g, m, speed) {
    const T = g.aimFor(m);
    return predictedDirection(m, T, speed || RANGED_BULLET_SPEED, PREDICT_BOSS_FACTOR, PREDICT_BULLET_MAX_FRAMES) || unitTo(m.x, m.y, T.x, T.y);
}
function circleTg(g, m, x, y, r, ms, dmgMult, extra) {
    const o = Object.assign({ x: clamp(x, PLAY_LEFT + 10, PLAY_RIGHT - 10), y: clamp(y, PLAY_TOP + 10, PLAY_BOTTOM - 10), r,
        damage: Math.max(1, pyRound(m.bulletDamage * dmgMult)), owner: m }, extra || {});
    return g.addTelegraph(new Telegraph("circle", g.now, ms, o));
}
function nearPlayerPoint(g, m, spread) {
    const T = g.aimFor(m), a = uniform(0, Math.PI * 2), d = uniform(0, spread);
    return [clamp(T.x + Math.cos(a) * d, PLAY_LEFT + 30, PLAY_RIGHT - 30), clamp(T.y + Math.sin(a) * d, PLAY_TOP + 30, PLAY_BOTTOM - 30)];
}
// 직선 돌진 (예고선 -> 돌진). 몸에 부딪히면 피해 (몸통 접촉 피해)
function* dashAlong(g, m, dir, len, telegraph, speedMult) {
    const [ex, ey] = [m.x + dir[0] * len, m.y + dir[1] * len];
    if (telegraph > 0) {
        g.addTelegraph(new Telegraph("line", g.now, telegraph, { x: m.x, y: m.y, x2: ex, y2: ey, width: m.radius * 2, owner: m, cancelWithOwner: true }));
        m.dashState = "telegraph";
        yield telegraph;
    }
    m.dashState = "dashing";
    let moved = 0;
    while (moved < len) {
        const s = Math.min(m.dashSpeed * (speedMult || 1), len - moved);
        m.x += dir[0] * s; m.y += dir[1] * s; moved += s;
        yield 0;
    }
    m.dashState = "chase";
}
function dashLen(m, dir, maxLen) {
    return clamp(rayExitLength(m.x, m.y, Math.atan2(dir[1], dir[0]), maxLen) - m.radius, 60, maxLen);
}

// ---------------- 보스 패턴 ----------------
const BOSS_PATTERNS = {
    *dash(g, m) {
        const dir = aimDir(g, m, m.dashSpeed);
        yield* dashAlong(g, m, dir, dashLen(m, dir, 420), tgMs(m, 700));
    },
    *dash3(g, m) {
        for (let i = 0; i < 3; i++) {
            const dir = aimDir(g, m, m.dashSpeed);
            yield* dashAlong(g, m, dir, dashLen(m, dir, 300), tgMs(m, 620));
            yield 150;
        }
    },
    *spread(g, m) {
        for (let i = 0; i < 2; i++) {
            const [dx, dy] = aimDir(g, m);
            fireSpreadBullets(g.bullets, m.x, m.y, dx, dy, RANGED_BULLET_SPEED, m.bulletDamage, "monster", m.phase >= 3 ? 5 : BOSS_SPREAD_COUNT, BOSS_SPREAD_ANGLE);
            yield 420;
        }
    },
    *aimed(g, m) {
        for (let i = 0; i < 3; i++) { const [dx, dy] = aimDir(g, m); bossBullet(g, m, dx, dy); yield 170; }
        yield 200;
    },
    *slamRing(g, m) {
        circleTg(g, m, m.x, m.y, 120, tgMs(m, 750), 1.2, { cancelWithOwner: true });
        yield tgMs(m, 750);
        g.shake(SCREEN_SHAKE_BOSS_DASH);
        g.shockwaves.push(new Shockwave(m.x, m.y, 4.2, 560, m.bulletDamage, randomGaps(2, 0.42), m.baseColor, m));
        yield 300;
    },
    // ---- 바위 거인 ----
    *slam3(g, m) {
        for (let i = 0; i < 3; i++) {
            const T = g.aimFor(m);
            const [tx, ty] = predictPlayerPoint(T, 25, 0.8, 30);
            const ms = tgMs(m, i === 0 ? 850 : 720);
            const to = [clamp(tx, PLAY_LEFT + m.radius, PLAY_RIGHT - m.radius), clamp(ty, PLAY_TOP + m.radius, PLAY_BOTTOM - m.radius)];
            circleTg(g, m, to[0], to[1], 92, ms, 1.4, { cancelWithOwner: true });
            const from = [m.x, m.y], start = g.now;
            m.airborne = true;
            while (g.now - start < ms) {
                const t = (g.now - start) / ms;
                m.x = from[0] + (to[0] - from[0]) * t; m.y = from[1] + (to[1] - from[1]) * t;
                m.jumpHeight = Math.sin(t * Math.PI) * 60;
                yield 0;
            }
            m.x = to[0]; m.y = to[1]; m.airborne = false; m.jumpHeight = 0;
            g.shake(SCREEN_SHAKE_BOSS_DASH);
            g.shockwaves.push(new Shockwave(m.x, m.y, 4.5, 260, Math.max(1, pyRound(m.bulletDamage * 0.8)), randomGaps(1, 0.5), m.baseColor, m));
            yield 280;
        }
    },
    *stompRing(g, m) {
        circleTg(g, m, m.x, m.y, 100, tgMs(m, 650), 1.2, { cancelWithOwner: true });
        yield tgMs(m, 650);
        for (let i = 0; i < 2; i++) {
            g.shake(SCREEN_SHAKE_BOSS_DASH);
            g.shockwaves.push(new Shockwave(m.x, m.y, 3.6, 620, m.bulletDamage, randomGaps(2, 0.38), m.baseColor, m));
            yield 650;
        }
    },
    *rockfall(g, m) {
        const n = m.phase >= 3 ? 8 : 6;
        for (let i = 0; i < n; i++) {
            const [x, y] = i === 0 ? predictPlayerPoint(g.aimFor(m), 20, 0.8, 30) : nearPlayerPoint(g, m, 240);
            circleTg(g, m, x, y, 52, tgMs(m, 950), 1.3, {
                color: [200, 150, 90],
                onFire: (gg, tg, hit) => { if (!hit) gg.addTempRock(tg.x, tg.y, 24, 7000); },
            });
            yield 140;
        }
        yield 700;
    },
    *quake(g, m) {
        yield* BOSS_PATTERNS.stompRing(g, m);
        yield* BOSS_PATTERNS.rockfall(g, m);
    },
    // ---- 무리 ----
    *summon(g, m) {
        const n = m.phase >= 3 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            if (g.monsters.length < MAX_MONSTERS_PER_ROOM + 4) spawnNear(m, g.monsters, g.now, 30);
            g.addFx({ kind: "ring", x: m.x, y: m.y, r: m.radius + 20, color: m.baseColor, dur: 300 });
            yield 250;
        }
        yield 300;
    },
    *ringShot(g, m) {
        const n = m.phase >= 3 ? 16 : 12;
        bossRing(g, m, n, 0.75, 0);
        yield 450;
        bossRing(g, m, n, 0.75, Math.PI / n);
        yield 300;
    },
    // ---- 독 ----
    *poolBarrage(g, m) {
        const T = g.aimFor(m);
        for (let i = 0; i < 3; i++) {
            const [x, y] = i === 0 ? predictPlayerPoint(T, HAZARD_AIM_LEAD_MS / FRAME_MS, PREDICT_BOSS_FACTOR, PREDICT_BULLET_MAX_FRAMES) : nearPlayerPoint(g, m, 150);
            spawnHazard(g.hazards, x, y, HAZARD_RADIUS, scaleDmg(HAZARD_DAMAGE, m.power), g.now, m.baseColor);
            yield 260;
        }
        yield 300;
    },
    *toxicRain(g, m) {
        for (let i = 0; i < 7; i++) {
            const [x, y] = nearPlayerPoint(g, m, 260);
            spawnHazard(g.hazards, x, y, HAZARD_RADIUS * 0.8, scaleDmg(HAZARD_DAMAGE, m.power), g.now, m.baseColor);
            yield 160;
        }
        yield 400;
    },
    // ---- 탄막 마법사 ----
    *spiral(g, m) {
        const end = g.now + (m.phase >= 3 ? 2800 : 2300);
        let a = uniform(0, Math.PI * 2);
        const arms = m.phase >= 3 ? 3 : 2;
        while (g.now < end) {
            for (let k = 0; k < arms; k++) { const aa = a + k * Math.PI * 2 / arms; bossBullet(g, m, Math.cos(aa), Math.sin(aa), 0.62, 0.8); }
            a += 0.27;
            yield 95;
        }
    },
    *flower(g, m) {
        for (let i = 0; i < 3; i++) { bossRing(g, m, 16, 0.55, i * Math.PI / 16 * 0.66, 0.8); yield 380; }
        yield 200;
    },
    *teleportSpiral(g, m) {
        yield* bossTeleport(g, m, 240);
        yield* BOSS_PATTERNS.spiral(g, m);
    },
    *beamSweep(g, m) {
        const L = new RotatingLaser(m.x, m.y, scaleDmg(LASER_DAMAGE, m.power), g.now, 1, { length: 430, width: 16, warnMs: 900, activeMs: 2300, restMs: 99999, angularSpeed: 0.022 });
        L.owner = m; L.angle = Math.atan2(g.aimFor(m).y - m.y, g.aimFor(m).x - m.x) + Math.PI * 0.6;
        g.lasers.push(L);
        const end = g.now + 3200;
        while (g.now < end) { L.cx = m.x; L.cy = m.y; yield 0; }
        const i = g.lasers.indexOf(L); if (i >= 0) g.lasers.splice(i, 1);
    },
    *storm(g, m) {
        const end = g.now + 2600;
        let a = 0, nextFlower = g.now;
        while (g.now < end) {
            for (let k = 0; k < 2; k++) { const aa = a + k * Math.PI; bossBullet(g, m, Math.cos(aa), Math.sin(aa), 0.6, 0.8); }
            a += 0.3;
            if (g.now >= nextFlower) { bossRing(g, m, 12, 0.5, a, 0.8); nextFlower = g.now + 850; }
            yield 110;
        }
    },
    // ---- 저격수 ----
    *snipe(g, m) { yield* bossSnipeLines(g, m, [0], tgMs(m, 1000)); },
    *snipeFan(g, m) { yield* bossSnipeLines(g, m, [-22, 0, 22], tgMs(m, 950)); },
    *snipeTriple(g, m) { for (let i = 0; i < 3; i++) yield* bossSnipeLines(g, m, [0], tgMs(m, 760)); },
    *homingPair(g, m) {
        const [dx, dy] = aimDir(g, m);
        for (const deg of [-28, 28]) { const [ax, ay] = rotateDirection(dx, dy, deg); bossBullet(g, m, ax, ay, 0.8, 1, 6, true); }
        yield 600;
    },
    // ---- 검귀 ----
    *tripleDash(g, m) { yield* bossTripleDash(g, m, false); },
    *afterimageDash(g, m) { yield* bossTripleDash(g, m, true); },
    *crescent(g, m) { yield* bossCrescent(g, m); },
    *crescentDouble(g, m) { yield* bossCrescent(g, m); yield 120; yield* bossCrescent(g, m); },
    // ---- 광선 ----
    *crossBeams(g, m) {
        const T = g.aimFor(m), ms = tgMs(m, 1000), diag = Math.random() < 0.5;
        const angs = diag ? [Math.PI / 4, -Math.PI / 4] : [0, Math.PI / 2];
        for (const a of angs) {
            const [x1, y1] = lineEnd(T.x, T.y, Math.cos(a), Math.sin(a), 2000), [x2, y2] = lineEnd(T.x, T.y, -Math.cos(a), -Math.sin(a), 2000);
            g.addTelegraph(new Telegraph("line", g.now, ms, { x: x1, y: y1, x2, y2, width: 34, damage: Math.max(1, pyRound(m.bulletDamage * 1.5)), owner: m, color: LASER_COLOR }));
        }
        yield ms + 200;
    },
    // ---- 둥지 여왕 ----
    *layEggs(g, m) {
        const eggs = g.monsters.filter(o => o.subtype === "egg").length;
        const n = Math.min(3, 5 - eggs);
        for (let i = 0; i < n; i++) {
            if (g.monsters.length >= MAX_MONSTERS_PER_ROOM + 5) break;
            const a = uniform(0, Math.PI * 2), d = uniform(60, 160);
            let [x, y] = [clamp(m.x + Math.cos(a) * d, PLAY_LEFT + 30, PLAY_RIGHT - 30), clamp(m.y + Math.sin(a) * d, PLAY_TOP + 30, PLAY_BOTTOM - 30)];
            [x, y] = pushCircleOutOfObstacles(x, y, 16, g.obstacles);
            const e = new Monster(x, y, "melee", m.stage, "egg", false, m.power);
            e.hatchAt = g.now + EGG_HATCH_MS; e.lastTouchTime = g.now; e.lastDamagedTime = g.now;
            g.monsters.push(e);
            g.addFx({ kind: "ring", x, y, r: 22, color: EGG_COLOR, dur: 300 });
            yield 220;
        }
        yield 300;
    },
    *acidSpray(g, m) {
        const [dx, dy] = aimDir(g, m, RANGED_BULLET_SPEED * 0.6);
        for (let k = 0; k < 9; k++) {
            const [ax, ay] = rotateDirection(dx, dy, -36 + k * 9);
            bossBullet(g, m, ax, ay, 0.55 + (k % 2) * 0.12, 0.8, 7);
        }
        yield 500;
    },
    *broodCharge(g, m) {
        for (let i = 0; i < 2; i++) if (g.monsters.length < MAX_MONSTERS_PER_ROOM + 4) spawnNear(m, g.monsters, g.now, 30);
        yield 300;
        yield* BOSS_PATTERNS.dash(g, m);
    },
    // ---- 포격 ----
    *mortarRain(g, m) { yield* bossMortar(g, m, 5); },
    *mortarRainBig(g, m) { yield* bossMortar(g, m, 9); },
    // ---- 심판자 ----
    *safeZone(g, m) { yield* bossSafeZone(g, m, m.phase >= 3 ? 1 : 2); },
    *crossLines(g, m) { yield* bossCrossLines(g, m); },
    *hideBehind(g, m) {
        // 벽(장애물)이 적으면 잠깐 기둥을 세워준다
        if (g.obstacles.length < 2) {
            for (let i = 0; i < 3; i++) {
                for (let t = 0; t < 20; t++) {
                    const x = uniform(PLAY_LEFT + 80, PLAY_RIGHT - 80), y = uniform(PLAY_TOP + 70, PLAY_BOTTOM - 70);
                    if (hypot(x - g.player.x, y - g.player.y) < 110 || hypot(x - m.x, y - m.y) < 130) continue;
                    g.addTempRock(x, y, 30, 9000, "pillar"); break;
                }
            }
            yield 500;
        }
        const ms = tgMs(m, 2100);
        g.addTelegraph(new Telegraph("field", g.now, ms, { x: m.x, y: m.y, losBlock: true, damage: Math.max(1, pyRound(m.bulletDamage * 2.2)), owner: m, color: [255, 200, 90] }));
        g.popup(m.x, m.y - m.radius - 30, "벽 뒤로 숨어라!", [255, 220, 120]);
        yield ms + 250;
    },
    *judgement(g, m) {
        yield* bossSafeZone(g, m, 1);
        yield* bossCrossLines(g, m);
    },
    // ---- 거울 ----
    *clone(g, m) { bossMakeClones(g, m, 1); yield 400; },
    *clone2(g, m) { bossMakeClones(g, m, 2); yield 400; },
    *blinkDash(g, m) {
        const T = g.aimFor(m), a = uniform(0, Math.PI * 2);
        yield* bossTeleportTo(g, m, clamp(T.x + Math.cos(a) * 230, PLAY_LEFT + 40, PLAY_RIGHT - 40), clamp(T.y + Math.sin(a) * 230, PLAY_TOP + 40, PLAY_BOTTOM - 40));
        yield* BOSS_PATTERNS.dash(g, m);
    },
};

function* bossTeleportTo(g, m, x, y) {
    g.addFx({ kind: "puff", x: m.x, y: m.y, r: m.radius + 10, color: m.baseColor, dur: 350 });
    m.hidden = true;
    yield 350;
    [m.x, m.y] = pushCircleOutOfObstacles(x, y, m.radius, g.obstacles);
    m.hidden = false;
    g.addFx({ kind: "puff", x: m.x, y: m.y, r: m.radius + 10, color: m.baseColor, dur: 350 });
    yield 250;
}
function* bossTeleport(g, m, minDist) {
    const T = g.aimFor(m);
    let best = [m.x, m.y];
    for (let t = 0; t < 20; t++) {
        const x = uniform(PLAY_LEFT + 60, PLAY_RIGHT - 60), y = uniform(PLAY_TOP + 60, PLAY_BOTTOM - 60);
        if (hypot(x - T.x, y - T.y) >= minDist) { best = [x, y]; break; }
    }
    yield* bossTeleportTo(g, m, best[0], best[1]);
}
function* bossSnipeLines(g, m, degs, ms) {
    const lock = Math.min(380, ms - 300);
    const tgs = degs.map(deg => {
        const tg = new Telegraph("line", g.now, ms, { x: m.x, y: m.y, width: 12, owner: m, cancelWithOwner: true, color: [255, 60, 60], lockAt: g.now + ms - lock });
        tg.deg = deg;
        tg.track = (gg, t) => {
            const T = gg.aimFor(m), [ux, uy] = unitTo(m.x, m.y, T.x, T.y), [rx, ry] = rotateDirection(ux, uy, t.deg);
            t.x = m.x; t.y = m.y; [t.x2, t.y2] = lineEnd(m.x, m.y, rx, ry, 1100);
        };
        tg.track(g, tg);
        return g.addTelegraph(tg);
    });
    yield ms;
    for (const tg of tgs) {
        const [ux, uy] = unitTo(tg.x, tg.y, tg.x2, tg.y2);
        bossBullet(g, m, ux, uy, 2.5, 1.4, 6);
    }
    yield 250;
}
function* bossTripleDash(g, m, afterimage) {
    // 돌진할 세 경로를 차례로 보여준 뒤 빠르게 세 번 돌진
    const T = g.aimFor(m), segs = [];
    let cx = m.x, cy = m.y;
    for (let i = 0; i < 3; i++) {
        let [ux, uy] = unitTo(cx, cy, T.x, T.y);
        if (i > 0) [ux, uy] = rotateDirection(ux, uy, (i % 2 ? 1 : -1) * uniform(25, 45));
        const len = clamp(rayExitLength(cx, cy, Math.atan2(uy, ux), 330) - m.radius, 80, 330);
        segs.push([cx, cy, ux, uy, len]);
        cx += ux * len; cy += uy * len;
    }
    const show = tgMs(m, 600);
    for (let i = 0; i < segs.length; i++) {
        const [sx, sy, ux, uy, len] = segs[i];
        g.addTelegraph(new Telegraph("line", g.now, show + (segs.length - 1 - i) * 200 + i * 260, { x: sx, y: sy, x2: sx + ux * len, y2: sy + uy * len, width: m.radius * 2, owner: m, cancelWithOwner: true }));
        yield 200;
    }
    yield show;
    for (const [sx, sy, ux, uy, len] of segs) {
        m.x = sx; m.y = sy;
        yield* dashAlong(g, m, [ux, uy], len, 0, 1.45);
        yield 60;
    }
    if (afterimage) {
        // 잔상이 같은 경로를 다시 벤다 (예고선 다시 표시 -> 선 위에 있으면 피해)
        const ms = tgMs(m, 650);
        for (const [sx, sy, ux, uy, len] of segs) {
            g.addTelegraph(new Telegraph("line", g.now, ms, { x: sx, y: sy, x2: sx + ux * len, y2: sy + uy * len, width: m.radius * 1.6,
                damage: Math.max(1, pyRound(m.touchDamage * 0.7)), owner: m, color: [200, 200, 255] }));
        }
        yield ms;
    }
}
function* bossCrescent(g, m) {
    const T = g.aimFor(m), ang = Math.atan2(T.y - m.y, T.x - m.x), ms = tgMs(m, 680);
    g.addTelegraph(new Telegraph("cone", g.now, ms, { x: m.x, y: m.y, angle: ang, len: 175, half: radians(70),
        damage: Math.max(1, pyRound(m.bulletDamage * 1.6)), owner: m, cancelWithOwner: true,
        track: (gg, tg) => { tg.x = m.x; tg.y = m.y; }, lockAt: g.now + ms }));
    yield ms;
    for (let k = 0; k < 5; k++) { const a = ang + radians(-30 + k * 15); bossBullet(g, m, Math.cos(a), Math.sin(a), 1.1, 0.9, 7); }
    yield 250;
}
function* bossMortar(g, m, n) {
    for (let i = 0; i < n; i++) {
        const [x, y] = i === 0 ? predictPlayerPoint(g.aimFor(m), 30, 0.85, 40) : nearPlayerPoint(g, m, 230);
        circleTg(g, m, x, y, 60, tgMs(m, 950), 1.3, { color: [255, 120, 70] });
        yield 120;
    }
    yield 800;
}
function* bossSafeZone(g, m, count) {
    const T = g.aimFor(m), safes = [];
    for (let i = 0; i < count; i++) {
        let x, y;
        for (let t = 0; t < 30; t++) {
            const a = uniform(0, Math.PI * 2), d = i === 0 ? uniform(80, 190) : uniform(150, 400);
            x = clamp(T.x + Math.cos(a) * d, PLAY_LEFT + 90, PLAY_RIGHT - 90); y = clamp(T.y + Math.sin(a) * d, PLAY_TOP + 90, PLAY_BOTTOM - 90);
            if (!g.obstacles.some(o => o.overlapsCircle(x, y, 40)) && safes.every(s => hypot(s[0] - x, s[1] - y) > 200)) break;
        }
        safes.push([x, y, count === 1 ? 95 : 82]);
    }
    const ms = tgMs(m, 1800);
    g.addTelegraph(new Telegraph("field", g.now, ms, { safes, damage: Math.max(1, pyRound(m.bulletDamage * 2.2)), owner: m, color: [255, 200, 90] }));
    g.popup(m.x, m.y - m.radius - 30, "안전한 원으로!", [255, 220, 120]);
    yield ms + 200;
}
function* bossCrossLines(g, m) {
    const T = g.aimFor(m), ms = tgMs(m, 950), horiz = Math.random() < 0.5, w = 70;
    const base = horiz ? T.y : T.x, lo = horiz ? PLAY_TOP + 40 : PLAY_LEFT + 40, hi = horiz ? PLAY_BOTTOM - 40 : PLAY_RIGHT - 40;
    const gap = horiz ? 150 : 210;
    for (let k = -2; k <= 2; k++) {
        const c = base + k * gap;
        if (c < lo || c > hi) continue;
        const o = horiz ? { x: PLAY_LEFT, y: c, x2: PLAY_RIGHT, y2: c } : { x: c, y: PLAY_TOP, x2: c, y2: PLAY_BOTTOM };
        if (k % 2 !== 0) continue;               // 줄 사이사이는 안전
        g.addTelegraph(new Telegraph("line", g.now, ms, Object.assign(o, { width: w, damage: Math.max(1, pyRound(m.bulletDamage * 1.6)), owner: m, color: [255, 200, 90] })));
    }
    yield ms + 200;
}
function bossMakeClones(g, m, n) {
    for (let i = 0; i < n; i++) {
        const clones = g.monsters.filter(o => o.isMirrorClone).length;
        if (clones >= n || g.monsters.length >= MAX_MONSTERS_PER_ROOM + 4) break;
        const c = new Monster(m.x, m.y, "ranged", m.stage, "single", false, m.power);
        c.hp = Math.max(1, pyRound(c.hp * BOSS_MIRROR_CLONE_HP_MULT)); c.maxHp = c.hp;
        c.color = m.baseColor; c.isMirrorClone = true; c.expireAt = g.now + BOSS_MIRROR_CLONE_LIFETIME_MS;
        c.lastShotTime = g.now; c.lastTouchTime = g.now; c.lastDamagedTime = g.now;
        c.snapshotRageBaseStats();
        g.monsters.push(c);
        g.addFx({ kind: "puff", x: c.x, y: c.y, r: 30, color: m.baseColor, dur: 300 });
    }
}
