// =============================================================
// 게임 진행 (Python 버전 run_game()을 옮긴 것)
//   - 1초에 60번 "한 칸(step)"씩 게임을 진행하고, 화면은 그때그때 그린다.
//   - now(게임 시각, ms)는 한 칸마다 1000/60 ms씩 늘어난다. (일시정지 중에는 멈춤)
// =============================================================
"use strict";

const QUIZ_TAP_GUARD_MS = 300;   // 결과 화면으로 바뀐 직후 실수로 두 번 눌리는 것 방지
const QUIZ_HIT_PAD = 12;         // O/X/확인 버튼 터치 판정을 그림보다 약간 넓게

function inRect(x, y, rect, pad) {
    const [rx, ry, rw, rh] = rect;
    pad = pad || 0;
    return x >= rx - pad && x <= rx + rw + pad && y >= ry - pad && y <= ry + rh + pad;
}

class Game {
    // opts.depth: 꿈의 심연 단계 / opts.save: 이어하기 저장본
    constructor(onEnd, opts) {
        opts = opts || {};
        setRunDepth(opts.save ? (opts.save.depth || 0) : (opts.depth || 0));
        this.onEnd = onEnd;       // 게임이 끝나면 호출: 결과 객체 (runResult 참고)
        this.now = 0;
        this.startTime = 0;
        this.stage = 1;
        [this.rooms, this.currentCoord] = generateDungeon();
        this.player = new Player();
        this.monsters = []; this.bullets = []; this.particles = []; this.popups = [];
        this.hazards = []; this.lasers = []; this.zaps = [];
        this.telegraphs = []; this.shockwaves = []; this.mines = [];
        this.fx = []; this.zones = []; this.pets = []; this.timers = [];
        this.decoy = null; this.recentDeaths = [];
        this.shakeUntil = 0; this.shakeMagnitude = 0; this.shakeDur = 1;
        this.hitstop = 0; this._hsReadyAt = 0; this.hurtFlashUntil = 0; this.decals = [];
        this.comboCount = 0; this.comboLastKillTime = -COMBO_WINDOW_MS;
        this.score = 0; this.totalKills = 0;
        this.roomEnterTime = 0;
        this.gameOver = false; this.endDelayStart = null; this.ended = false;
        this.stageMessage = ""; this.stageMessageUntil = 0;
        this.paused = false;
        this.quiz = null;           // 문제 풀이 중이면 상태 객체
        this.skillPick = null;      // 기억 고르는 중이면 상태 객체
        this.cardPick = null;       // 강화 카드 / 상점 / 제단 화면
        this.input = Input;
        // ---- 빠른 전개 / 성장 ----
        this.gold = 0; this.streak = 0; this.bonusPicks = 0;
        this.stats = { asked: 0, correct: 0, dust: 0, wrong: [], stars: 0, bestStreak: 0, cards: 0, endingDust: 0, opened: false };
        this.drops = [];            // 꿈가루 / 골드 (튀어나왔다가 나에게 빨려옴)
        this.queue = [];            // 방 클리어 뒤 차례로 띄울 화면들
        this.quizAt = 0; this.wantSave = false;
        this.slowFrames = 0; this.flashUntil = 0; this.flashColor = [255, 255, 255];
        this.wave = 1; this.wave2 = 0; this.waveSpawnAt = 0; this.wavePts = null; this.roomMonsterTotal = 0;
        this.banner = null;         // 화면 위쪽 알림 {text, sub, color, t0, until}
        this.ending = false;
        applyMetaToPlayer(this);
        this.player._synTier = synergyTier(this.player);
        if (opts.save) {
            RunSave.restore(this, opts.save);
            const th = stageTheme(this.stage);
            this.say("이어하기", th.accent, 1800, `${th.name}  ·  STAGE ${this.stage}`);
            Sound.setMusicRate && Sound.setMusicRate(th.musicRate || 1);
        }
        else { this.loadRoom(this.currentCoord); this.stageIntro(); }
    }
    // 화면 위 알림
    say(text, color, ms, sub) { this.banner = { text, sub: sub || "", color: color || [255, 230, 120], t0: this.now, until: this.now + (ms || 1400) }; }
    addGold(v) { this.gold += v; }
    queueFront(fn) { this.queue.unshift(fn); }
    get modalOpen() { return !!(this.quiz || this.skillPick || this.cardPick); }
    stageIntro() {
        const th = stageTheme(this.stage);
        const depth = RunMods.depth ? `  ·  꿈의 심연 ${RunMods.depth}단계` : "";
        this.stageMessage = `STAGE ${this.stage}`; this.stageMessageUntil = this.now + 1400;
        this.say(th.name + (this.stage >= FINAL_STAGE ? "  ·  마지막 스테이지" : ""), th.accent, 2200, `${this.stage} / ${FINAL_STAGE}${depth}`);
        Sound.setMusicRate && Sound.setMusicRate(th.musicRate || 1);
    }

    get room() { return this.rooms.get(ck(this.currentCoord[0], this.currentCoord[1])); }
    get obstacles() { return this.room.obstacles || []; }

    popup(x, y, text, color) { this.popups.push(new DamagePopup(x, y, text, color, this.now)); }
    // 화면 흔들림: 더 센 흔들림이 오면 덮어쓰고, 약한 건 남은 흔들림을 유지
    shake(mag, dur) {
        dur = dur || SCREEN_SHAKE_DURATION_MS;
        const left = this.shakeUntil > this.now ? this.shakeMagnitude * (this.shakeUntil - this.now) / this.shakeDur : 0;
        if (mag < left) return;
        this.shakeMagnitude = mag; this.shakeDur = dur; this.shakeUntil = this.now + dur;
    }
    // 타격 멈춤(히트스톱): 아주 짧게 세상이 멈춰서 타격감을 준다 (프레임 수)
    addHitstop(frames, force) {
        if (!force && this.now < this._hsReadyAt) return;
        this.hitstop = Math.max(this.hitstop, Math.min(12, frames));
        this._hsReadyAt = this.now + 140;
    }
    addDecal(img, x, y, size, color, ms) {
        if (!Opts.high) return;
        this.decals.push({ img, x, y, size, color, alpha: 0.55, rot: uniform(0, 6.28), until: this.now + (ms || 7000) });
        if (this.decals.length > 24) this.decals.shift();
    }
    explosionFx(x, y, r, color) {
        this.addFx({ kind: "anim", sheet: "explosion", x, y, scale: r / 18, dur: 420 });
        spawnSmokePuff(this.particles, x, y, [90, 80, 80], this.now, 5, r * 0.9);
        spawnHitSparks(this.particles, x, y, color || [255, 170, 70], this.now, 6);
        this.addDecal("scorch_02", x, y, r * 2.2, [20, 14, 12]);
        Sound.play("explode", { vol: 0.55, gap: 60 });
    }

    clampToPlay(o) {
        o.x = clamp(o.x, PLAY_LEFT + o.radius, PLAY_RIGHT - o.radius);
        o.y = clamp(o.y, PLAY_TOP + o.radius, PLAY_BOTTOM - o.radius);
    }

    // ---------------- 방 입장 ----------------
    loadRoom(coord, restoring) {
        this.collectAllDrops();
        this.wave = 1; this.wave2 = 0; this.waveSpawnAt = 0; this.wavePts = null;
        // 지난 방에서 잠깐 세운 바위는 없앤다
        const prev = this.rooms.get(ck(this.currentCoord[0], this.currentCoord[1]));
        if (prev && prev.obstacles) prev.obstacles = prev.obstacles.filter(o => !o.expireAt);
        this.monsters = []; this.zaps = []; this.bullets = []; this.hazards = []; this.lasers = [];
        this.telegraphs = []; this.shockwaves = []; this.mines = []; this.zones = []; this.timers = [];
        this.fx = []; this.decoy = null; this.recentDeaths = []; this.decals = [];
        if (this.now > 0) Sound.play("door", { vol: 0.35, gap: 200 });
        const room = this.rooms.get(ck(coord[0], coord[1]));
        room.visited = true;
        const now = this.now;
        this.roomEnterTime = now;
        const p = this.player;
        const resetTimers = mon => {
            const jitter = randInt(0, 400);
            mon.lastShotTime = now + jitter;
            mon.lastTouchTime = now + jitter;
            mon.aiNext = now + jitter + 600;
            if (mon.type === "summoner") mon.nextSummonTime = now + jitter + SUMMONER_SUMMON_COOLDOWN_MS;
            if (mon.isBoss) { mon.bUntil = now + ROOM_ENTER_GRACE_MS + 400; mon.bstate = "move"; }
            const k = skillMonsterHpMult(p, mon.isBoss);
            if (k !== 1) { mon.maxHp = Math.max(1, Math.round(mon.maxHp * k)); mon.hp = mon.maxHp; }
            return mon;
        };
        if (room.obstacles === null) {
            room.obstacles = (room.type === "battle" || room.type === "boss") ? generateRoomObstacles(p.x, p.y) : [];
        }
        if (room.type === "battle" && !room.cleared) {
            const [lo, hi] = monsterCountRange(this.stage);
            const full = randInt(lo, hi);
            // 2웨이브: 첫 무리를 잡으면 두 번째 무리가 쏟아진다
            const count = Math.max(1, Math.ceil(full * WAVE1_RATIO));
            this.wave2 = Math.max(1, Math.round(full * WAVE2_RATIO));
            this.roomMonsterTotal = count + this.wave2;
            for (let i = 0; i < count; i++) {
                const mtype = randomMonsterFamily(this.stage);
                const [ex, ey] = randomMonsterSpawnPosition(p.x, p.y, room.obstacles);
                const elite = mtype !== "summoner" && Math.random() < eliteSpawnChance(this.stage);
                this.monsters.push(resetTimers(new Monster(ex, ey, mtype, this.stage, null, elite)));
            }
        } else if (room.type === "boss" && !room.cleared) {
            const b = resetTimers(new Boss(SCREEN_W / 2, PLAY_TOP + 110, this.stage));
            if (this.stage >= FINAL_STAGE) {          // 마지막 보스: 더 단단하게
                b.maxHp = Math.round(b.maxHp * FINAL_BOSS_HP_MULT); b.hp = b.maxHp;
                b.bossName = "최종 보스 · " + b.bossName;
            }
            this.monsters.push(b);
            this.roomMonsterTotal = 1;
            this.stageMessage = b.bossName; this.stageMessageUntil = now + 1300;
        }
        // 카드 "꿈의 방패": 전투 시작 보호막
        if ((room.type === "battle" || room.type === "boss") && !room.cleared && p.roomShield > 0) this.shieldPlayer(p.maxHp * p.roomShield, 20000);
        if (isSpecialRoom(room) && !room.special) initSpecialRoom(this, room);
        // 전투가 없는 방에 들어오면 이어하기 저장
        if (!restoring && !((room.type === "battle" || room.type === "boss") && !room.cleared)) this.wantSave = true;
    }

    // ---------------- 도우미 ----------------
    aimFor(m) {
        const d = this.decoy;
        if (d && this.now < d.until && hypot(m.x - d.x, m.y - d.y) <= 380) return d;
        return this.player;
    }
    addTelegraph(tg) { this.telegraphs.push(tg); return tg; }
    addFx(f) { f.t0 = this.now; this.fx.push(f); return f; }
    addTimer(ms, fn) { this.timers.push({ at: this.now + ms, fn }); }
    addZone(s, z) {
        z.sk = s; z.start = this.now; z.until = this.now + z.dur; z.nextTick = this.now;
        if (z.follow === "player") { z.x = this.player.x; z.y = this.player.y; }
        this.zones.push(z); return z;
    }
    addTempRock(x, y, r, ms, style) {
        const p = this.player;
        if (hypot(x - p.x, y - p.y) < r + p.radius + 6) return null;
        if (x < PLAY_LEFT + r + 4 || x > PLAY_RIGHT - r - 4 || y < PLAY_TOP + r + 4 || y > PLAY_BOTTOM - r - 4) return null;
        const o = Obstacle.circle(x, y, r, style || "rock");
        o.expireAt = this.now + ms;
        this.room.obstacles.push(o);
        return o;
    }
    monsterWithin(x, y, r) { return this.monsters.some(m => m.targetable && hypot(m.x - x, m.y - y) <= r + m.radius); }
    nearestTargetable(x, y, r, exclude) {
        let best = null, bd = r;
        for (const m of this.monsters) {
            if (m === exclude || !m.targetable) continue;
            const d = hypot(m.x - x, m.y - y) - m.radius;
            if (d <= bd) { bd = d; best = m; }
        }
        return best;
    }
    healPlayer(a) {
        const p = this.player;
        if (a <= 0 || p.hp >= p.maxHp) return;
        p.hp = Math.min(p.maxHp, p.hp + a);
        this.popup(p.x + 14, p.y - p.radius - 10, `+${fmtNum(a)}`, [120, 255, 140]);
        if (a >= p.maxHp * 0.03) Sound.play("heal", { vol: 0.35, gap: 400 });
    }
    shieldPlayer(amount, ms) {
        const p = this.player, now = this.now;
        const cur = now < p.shieldUntil ? p.shield : 0;
        p.shield = Math.min(p.maxHp * 0.5, cur + amount);
        p.shieldUntil = Math.max(p.shieldUntil, now + ms);
    }
    slowPlayer(pct, ms) {
        const p = this.player, now = this.now;
        p.slowPct = now < p.slowUntil ? Math.max(p.slowPct, pct) : pct;
        p.slowUntil = Math.max(p.slowUntil, now + ms);
    }

    // 플레이어가 피해를 받는다 (무적 / 피해 감소 / 보호막 처리). 실제로 맞았으면 true
    hurtPlayer(dmg, color, source) {
        const p = this.player, now = this.now;
        if (now < p.invulnUntil || dmg <= 0 || this.gameOver) return false;
        let d = dmg;
        if (now < p.dmgReduceUntil) d *= (1 - p.dmgReduce);
        if (p.shield > 0 && now < p.shieldUntil) {
            const a = Math.min(p.shield, d);
            p.shield -= a; d -= a;
            this.popup(p.x - 16, p.y - p.radius - 24, `보호막 -${fmtNum(a)}`, [170, 220, 255]);
            if (p.shield <= 0.01) { p.shield = 0; this.onShieldBreak(); }
        }
        p.invulnUntil = now + PLAYER_INVULN_MS + (p.invulnBonus || 0);
        if (d > 0) {
            p.hp -= d;
            this.popup(p.x, p.y - p.radius - 10, `-${fmtNum(d)}`, color || [255, 90, 90]);
            this.hurtFlashUntil = now + 260;
            this.addHitstop(3, true);
            Sound.play("hurt", { vol: 0.6, gap: 80 });
            spawnHitSparks(this.particles, p.x, p.y, [255, 90, 90], now, 5);
        } else Sound.play("hit1", { vol: 0.35, rate: 1.4, gap: 80 });
        this.shake(SCREEN_SHAKE_HIT + 2);
        if (source && source.hasAffix && source.hasAffix("vampire") && this.monsters.includes(source)) {
            const h = dmg * ELITE_VAMPIRE_HEAL_MULT;
            source.hp = Math.min(source.maxHp, source.hp + h);
            this.popup(source.x, source.y - source.radius - 14, `+${fmtNum(h)}`, affixColor("vampire"));
        }
        return true;
    }
    onShieldBreak() {
        const p = this.player, br = p.shieldBreak;
        p.shieldBreak = null;
        if (!br) return;
        this.addFx({ kind: "circle", x: p.x, y: p.y, r: 120, color: [170, 230, 255], dur: 300 });
        this.areaDamage(br.sk, p.x, p.y, 120, br.dmg, (m, res) => { if (!res.killed) this.slowMonster(m, 0.4, 2000); });
    }

    // 몬스터가 피해를 받는다 (무적 / 보스 쉬는 틈 / 보호막). 죽으면 처리까지.
    hitMonster(m, dmg, o) {
        o = o || {};
        const now = this.now;
        const out = { dealt: 0, killed: false, crit: !!o.crit };
        if (!this.monsters.includes(m) || m.hp <= 0) return out;
        if (now < m.invulnUntil) {
            if (now >= (m._invPopup || 0)) { this.popup(m.x, m.y - m.radius - 18, "무적", [200, 200, 210]); m._invPopup = now + 400; }
            return out;
        }
        const pl = this.player;
        if (pl.bigDmg && (m.isElite || m.isBoss)) dmg *= 1 + pl.bigDmg;                 // 거인 사냥꾼 / 사냥꾼의 별
        if (pl.execute && m.hp < m.maxHp * 0.3) dmg *= 1 + pl.execute;                  // 처형자
        let d = dmg;
        if (m.isBoss && m.bstate === "rest") d *= BOSS_REST_DAMAGE_MULT;
        if (m.shield > 0 && now < m.shieldUntil) {
            const a = Math.min(m.shield, d);
            m.shield -= a; d -= a;
            if (m.shield <= 0.01) m.shield = 0;
        }
        m.hp -= d;
        out.dealt = d;
        m.hitFlashUntil = now + HIT_FLASH_MS;
        resetMonsterRage(m, now);
        if (o.knock && !m.immovable && !m.airborne && !m.isBoss) {      // 보스는 총알에 밀리지 않음
            m.x += o.knock[0] * KNOCKBACK_MONSTER_DIST; m.y += o.knock[1] * KNOCKBACK_MONSTER_DIST;
            this.clampToPlay(m);
        }
        const color = o.color || [255, 255, 255];
        // 숫자가 너무 많이 겹치지 않게: 짧은 시간의 작은 피해는 모아서 한 번에 보여준다
        m._dmgAcc = (m._dmgAcc || 0) + dmg;
        if (out.crit || now >= (m._popupNext || 0) || m.hp <= 0) {
            this.popup(m.x + (o.popupDx || 0) + uniform(-6, 6), m.y - m.radius - (o.popupDy || 6), `-${fmtNum(m._dmgAcc)}${out.crit ? "!" : ""}`, out.crit ? [255, 170, 60] : color);
            m._dmgAcc = 0; m._popupNext = now + 130;
        }
        if (m.hp <= 0) { out.killed = true; if (!o.noKill) this.killMonster(m); }
        return out;
    }
    damageByEffect(m, dmg, color) { this.hitMonster(m, dmg, { color, popupDx: 8, popupDy: 18 }); }

    // ---------------- 기억 도우미 ----------------
    sd(s, coef) {
        const def = SKILL_BY_ID[s.id];
        return playerShotDamage(this.player) * coef * skillLevelMult(s.level) *
            (skillHasSynergy(def, this.player.gun) ? SKILL_SYNERGY_MULT : 1) * (this._castBoost || 1);
    }
    skillHit(s, m, dmg, o) {
        const crit = Math.random() < critChance(this.player);
        return this.hitMonster(m, crit ? dmg * critMult(this.player) : dmg,
            Object.assign({ crit, color: skillElementColor(SKILL_BY_ID[s.id].el) }, o || {}));
    }
    areaDamage(s, x, y, r, dmg, onHit, exclude) {
        const hits = [];
        for (const m of this.monsters.slice()) {
            if (m === exclude || !m.targetable || hypot(m.x - x, m.y - y) > r + m.radius) continue;
            const wasSlowed = monsterIsSlowed(m, this.now);
            const res = this.skillHit(s, m, dmg);
            hits.push([m, res]);
            if (onHit) onHit(m, res, wasSlowed);
        }
        return hits;
    }
    coneDamage(s, x, y, ang, len, half, dmg, onHit, noFx) {
        if (!noFx) this.addFx({ kind: "cone", x, y, angle: ang, len, half, color: skillElementColor(SKILL_BY_ID[s.id].el), dur: 220 });
        const shape = new Telegraph("cone", 0, 1, { x, y, angle: ang, len, half });
        const hits = [];
        for (const m of this.monsters.slice()) {
            if (!m.targetable || !shape.contains(m.x, m.y, m.radius / 0.6)) continue;
            const wasSlowed = monsterIsSlowed(m, this.now);
            const res = this.skillHit(s, m, dmg);
            hits.push([m, res]);
            if (onHit) onHit(m, res, wasSlowed);
        }
        return hits;
    }
    slowMonster(m, pct, ms) {
        const now = this.now;
        m.slowPct = monsterIsSlowed(m, now) ? Math.max(m.slowPct, pct) : pct;
        m.slowUntil = Math.max(m.slowUntil, now + ms);
    }
    stunMonster(m, ms) {
        if (m.isBoss) { if (m.bstate === "phase") return; ms *= 0.5; }
        m.stunUntil = Math.max(m.stunUntil, this.now + ms);
        if (!m.isBoss && (m.dashState === "telegraph" || m.dashState === "dashing")) m.dashState = "chase";
    }
    burnMonster(m, tick, ms) {
        const now = this.now;
        if (now < m.burnUntil) m.burnDamage = Math.max(m.burnDamage, tick);
        else { m.burnDamage = tick; m.nextBurnTick = now + FIRE_BURN_TICK_MS; }
        m.burnUntil = Math.max(m.burnUntil, now + ms);
    }
    moveMonster(m, dx, dy) {
        if (m.immovable) return;
        m.x += dx; m.y += dy;
        this.clampToPlay(m);
        [m.x, m.y] = pushCircleOutOfObstacles(m.x, m.y, m.radius, this.obstacles);
    }
    // 밀쳐내기. 벽(장애물/방 끝)에 부딪히면 true
    knockMonster(m, fx, fy, dist) {
        if (m.immovable || m.airborne || (m.isBoss && m.bstate === "cast")) return false;   // 패턴 중인 보스는 안 밀림 (예고와 어긋나지 않게)
        let [ux, uy] = unitTo(fx, fy, m.x, m.y);
        const step = 6;
        for (let t = 0; t < dist; t += step) {
            const nx = m.x + ux * step, ny = m.y + uy * step;
            if (nx < PLAY_LEFT + m.radius || nx > PLAY_RIGHT - m.radius || ny < PLAY_TOP + m.radius || ny > PLAY_BOTTOM - m.radius) return true;
            if (this.obstacles.some(o => o.overlapsCircle(nx, ny, m.radius))) return true;
            m.x = nx; m.y = ny;
        }
        return false;
    }
    skillBullet(s, t, o) {
        const p = this.player, def = SKILL_BY_ID[s.id];
        const [fx, fy] = o.from || [p.x, p.y];
        const dir = o.dir || unitTo(fx, fy, t.x, t.y);
        const b = new Bullet(fx, fy, dir[0], dir[1], o.speed, o.dmg, "skill", false, o.radius || 6);
        b.sk = s; b.kind = o.kind; b.color = skillElementColor(def.el);
        b.pierceLeft = o.pierce || 0; b.hitSet = new Set(); b.onHit = o.onHit || null;
        b.ghost = !!o.ghost; b.maxDist = o.maxDist || 1200; b.traveled = 0;
        b.returning = !!o.returning; b.goingBack = false; b.onReturn = o.onReturn || null;
        b.homingMon = !!o.homing; b.grow = o.grow || 0;
        this.bullets.push(b);
        return b;
    }

    hatchEgg(m) {
        const i = this.monsters.indexOf(m);
        if (i < 0) return;
        this.monsters.splice(i, 1);
        spawnDeathBurst(this.particles, m.x, m.y, EGG_COLOR, this.now, 8);
        for (let k = 0; k < 2; k++) {
            if (this.monsters.length >= MONSTER_ADD_CAP + 5) break;
            const mm = spawnMinion(m.x + uniform(-12, 12), m.y + uniform(-12, 12), m.stage, m.power);
            mm.lastShotTime = this.now; mm.lastTouchTime = this.now;
            this.monsters.push(mm);
        }
    }

    // ---------------- 몬스터 사망 ----------------
    killMonster(m, opts) {
        opts = opts || {};
        const now = this.now, p = this.player;
        spawnDeathBurst(this.particles, m.x, m.y, m.color, now, Math.ceil(DEATH_PARTICLE_COUNT * (m.isBoss ? 2 : 0.6)));
        this.addFx({ kind: "anim", sheet: "smoke", x: m.x, y: m.y, scale: m.radius / 9, dur: 420 });
        spawnHitSparks(this.particles, m.x, m.y, m.isElite ? affixColor(m.affixes[0] || "fire") : [255, 240, 220], now, m.isBoss ? 12 : 4);
        if (m.isBoss) {
            for (let k = 0; k < 5; k++) {
                const ox = uniform(-1, 1) * m.radius, oy = uniform(-1, 1) * m.radius;
                this.addTimer(k * 130, gg => gg.explosionFx(m.x + ox, m.y + oy, 40 + k * 6));
            }
            this.addHitstop(12, true); this.shake(SCREEN_SHAKE_BOSS_DASH + 4, 600);
        } else if (m.isElite) { this.addHitstop(4, true); Sound.play("crit", { vol: 0.5 }); }
        else if (!opts.selfDestruct) this.addHitstop(2);
        if (!opts.selfDestruct && m.subtype !== "exploder") Sound.play("kill", { vol: 0.42, gap: 40, rate: m.isBoss ? 0.7 : 1 });
        const idx = this.monsters.indexOf(m);
        if (idx >= 0) this.monsters.splice(idx, 1);
        this.lasers = this.lasers.filter(L => L !== m.laser && L.owner !== m);
        if (m.isBoss) this.telegraphs = this.telegraphs.filter(t => t.owner !== m);

        if (opts.selfDestruct) {       // 자폭: 점수/처치 수 없음
            spawnDeathBurst(this.particles, m.x, m.y, KAMIKAZE_COLOR, now, DEATH_PARTICLE_COUNT);
            this.explosionFx(m.x, m.y, KAMIKAZE_BLAST_RADIUS * 0.8, KAMIKAZE_COLOR);
            this.shake(SCREEN_SHAKE_BOSS_DASH);
            return;
        }
        this.totalKills += 1;
        this.score += SCORE_PER_KILL;
        if (m.isElite) this.score += SCORE_PER_ELITE_KILL;
        // 꿈가루 / 골드 / 엘리트 전리품
        if (m.isBoss) this.dropDust(m.x, m.y, DUST_BOSS_BASE + DUST_BOSS_PER_STAGE * this.stage);
        else if (m.isElite) {
            this.dropDust(m.x, m.y, randInt(DUST_ELITE[0], DUST_ELITE[1]));
            this.dropGold(m.x, m.y, ELITE_GOLD);
            this.bonusPicks += 1;
            this.popup(m.x, m.y - m.radius - 40, this.bonusPicks > 1 ? "전리품 등급 UP!" : "전리품 상자!", [255, 215, 90]);
        } else if (!m.isMinion && Math.random() < DUST_NORMAL_CHANCE) this.dropDust(m.x, m.y, 1);
        if (p.lifesteal > 0) this.healPlayer(p.lifesteal);
        if (!m.isMinion && !m.isBoss && !m.revived && !m.isMirrorClone && m.subtype !== "egg") {
            this.recentDeaths.push({ x: m.x, y: m.y, type: m.type, subtype: m.subtype, stage: m.stage, power: m.power, time: now });
            if (this.recentDeaths.length > 12) this.recentDeaths.shift();
        }
        if (m.marks.harvest && now <= m.marks.harvest) this.healPlayer(m.marks.harvestHeal || 0);

        if (m.subtype === "exploder") {
            spawnDeathBurst(this.particles, m.x, m.y, EXPLODER_COLOR, now, DEATH_PARTICLE_COUNT);
            this.explosionFx(m.x, m.y, EXPLODER_BLAST_RADIUS * 0.8, EXPLODER_COLOR);
            spawnHazard(this.hazards, m.x, m.y, EXPLODER_HAZARD_RADIUS, scaleDmg(HAZARD_DAMAGE, m.power), now, EXPLODER_COLOR);
            if (hypot(p.x - m.x, p.y - m.y) < EXPLODER_BLAST_RADIUS) {
                if (this.hurtPlayer(scaleDmg(EXPLODER_BLAST_DMG, m.power), [255, 140, 40])) this.shake(SCREEN_SHAKE_BOSS_DASH);
            }
        }
        if (m.subtype === "splitter" && this.monsters.length < MONSTER_ADD_CAP + 4) {
            for (let i = 0; i < 2; i++) {
                const a = uniform(0, Math.PI * 2);
                const cx = clamp(m.x + Math.cos(a) * 20, PLAY_LEFT + 10, PLAY_RIGHT - 10);
                const cy = clamp(m.y + Math.sin(a) * 20, PLAY_TOP + 10, PLAY_BOTTOM - 10);
                const c = new Monster(cx, cy, "melee", m.stage, "chase", false, m.power);
                c.hp = Math.max(1, pyRound(c.hp * SPLITTER_CHILD_HP_MULT)); c.maxHp = c.hp;
                c.touchDamage = Math.max(1, pyRound(c.touchDamage * SPLITTER_CHILD_DMG_MULT));
                c.radius = Math.max(8, pyRound(c.radius * 0.75));
                c.color = SPLITTER_COLOR; c.isMinion = true;
                c.lastShotTime = now; c.lastTouchTime = now; c.lastDamagedTime = now;
                c.snapshotRageBaseStats();
                this.monsters.push(c);
            }
        }
        if (m.isElite) {
            eliteDeathEffects(this, m, now);
            p.hp = Math.min(p.maxHp, p.hp + ELITE_KILL_HEAL);
            this.popup(p.x, p.y - p.radius - 10, `+${ELITE_KILL_HEAL}`, [120, 255, 120]);
        }
        if (now - this.comboLastKillTime <= COMBO_WINDOW_MS) this.comboCount += 1; else this.comboCount = 1;
        this.comboLastKillTime = now;
        if (this.comboCount >= 2) this.popup(m.x, m.y - m.radius - 26, `${this.comboCount} KILL!`, [90, 220, 255]);
    }

    // ---------------- 한 칸 진행 ----------------
    step() {
        // 이미지를 크게 보는 동안은 시간이 멈춘다 (풀이 시간에도 안 들어감)
        if (this.paused || this.ended || ZoomView.isOpen) return;
        const modal = this.modalOpen;
        if (this.hitstop > 0 && !modal) { this.hitstop--; return; }
        // 마지막 처치 슬로모션: 3칸에 한 번만 진행
        if (this.slowFrames > 0 && !modal) { this.slowFrames--; if (this.slowFrames % 3 !== 0) return; }
        this.now += FRAME_MS;
        const now = this.now;
        if (this.stageMessage && now >= this.stageMessageUntil) this.stageMessage = "";

        if (!this.gameOver && !this.ending && !modal) this.updateWorld(now);
        if (this.quiz && this.quiz.pressed && now >= this.quiz.pressedUntil) this.quiz.pressed = null;
        if (!this.gameOver && !this.ending) this.runQueue(now);

        if ((this.gameOver || this.ending) && !this.ended) {
            if (this.endDelayStart === null) this.endDelayStart = now;
            if (now - this.endDelayStart > (this.ending ? 2600 : 2200)) {
                this.ended = true;
                Input.releaseJoystick();
                RunSave.clear();
                Meta.noteStage(this.stage);
                this.onEnd(this.runResult());
            }
        }
    }
    // 방 클리어 뒤: 문제 -> 카드 -> (기억) -> 엘리트 전리품 -> 저장
    runQueue(now) {
        if (this.modalOpen) return;
        if (this.quizAt && now >= this.quizAt) { this.quizAt = 0; this.startQuiz(); return; }
        if (this.quizAt) return;
        if (this.queue.length) { this.queue.shift()(this); return; }
        const room = this.room;
        if (this.wantSave && !((room.type === "battle" || room.type === "boss") && !room.cleared)) {
            this.wantSave = false;
            RunSave.save(this);
        }
    }
    runResult() {
        return {
            died: !this.ending, won: this.ending, score: this.score, stage: this.stage, kills: this.totalKills,
            timeMs: this.now, depth: RunMods.depth, gold: this.gold, stats: this.stats,
            skills: this.player.skills.map(s => SKILL_BY_ID[s.id].name + (s.level ? ` +${s.level}` : "")),
            gun: this.player.gun ? this.player.gun.name : null,
        };
    }

    updateWorld(now) {
        const p = this.player;
        let room = this.room;
        let inBattle = (room.type === "battle" || room.type === "boss") && !room.cleared;
        let obstacles = room.obstacles || [];
        const canAttack = (now - this.roomEnterTime) >= ROOM_ENTER_GRACE_MS;

        // ---- 플레이어 이동 (키보드 / 조이패드) ----
        const [mx, my] = Input.moveVector();
        p.isMoving = mx !== 0 || my !== 0;
        if (p.isMoving) {
            const len = hypot(mx, my);
            const spd = p.speed * (now < p.slowUntil ? 1 - p.slowPct : 1);
            p.x += mx * spd; p.y += my * spd;
            p.facingX = mx / len; p.facingY = my / len;
            p.velX = mx * spd; p.velY = my * spd;
        } else { p.velX = 0; p.velY = 0; }
        this.clampToPlay(p);
        [p.x, p.y] = pushCircleOutOfObstacles(p.x, p.y, p.radius, obstacles);
        this.clampToPlay(p);

        // ---- 방 이동 ----
        if (!inBattle) {
            const next = checkRoomTransition(p, room);
            if (next) {
                this.loadRoom(next);
                this.currentCoord = next;
                room = this.room; obstacles = room.obstacles || [];
                inBattle = (room.type === "battle" || room.type === "boss") && !room.cleared;
            }
        }

        // ---- 보스 보상: 총 줍기 / 포탈 ----
        if (!inBattle && room.type === "boss" && now >= room.rewardActiveAt) {
            for (const [gun, gx, gy] of (room.gunChoices || [])) {
                if (hypot(p.x - gx, p.y - gy) < GUN_PICKUP_RADIUS + p.radius) {
                    p.gun = gun;
                    room.gunChoices = [];
                    this.checkSynergy();
                    this.wantSave = true;
                    Sound.play("pickup", { vol: 0.6 });
                    spawnHitSparks(this.particles, gx, gy, gun.borderColor, now, 10, true);
                    this.popup(p.x, p.y - p.radius - 26, `${gun.name} 획득!`, gun.borderColor);
                    spawnDeathBurst(this.particles, gx, gy, gun.color, now, DEATH_PARTICLE_COUNT);
                    break;
                }
            }
            const portal = room.portal;
            if (portal && !this.modalOpen && !this.queue.length && !this.quizAt && hypot(p.x - portal[0], p.y - portal[1]) < PORTAL_RADIUS + p.radius * 0.5) {
                if (this.stage >= FINAL_STAGE) { this.startEnding(); return; }
                this.stage += 1;
                Meta.noteStage(this.stage);
                Sound.play("stage", { vol: 0.6 });
                [this.rooms, this.currentCoord] = generateDungeon();
                this.loadRoom(this.currentCoord);
                room = this.room; obstacles = room.obstacles || [];
                inBattle = false;
                this.stageIntro();
            }
        }
        if (!inBattle && isSpecialRoom(room)) updateSpecialRoom(this, room, now);

        // ---- 자동 공격 ----
        p.aspdBuffs = p.aspdBuffs.filter(b => now < b.until);
        if (inBattle && this.monsters.length) {
            const target = nearestMonster(p, this.monsters);
            const interval = 1000 / (p.shotsPerSec * playerAspdMult(p, now));
            if (target && now - p.lastShotTime > interval) {
                p.lastShotTime = now;
                const tdx = target.x - p.x, tdy = target.y - p.y, td = hypot(tdx, tdy);
                if (td > 0) {
                    const shots = makePlayerBullets(p, tdx / td, tdy / td);
                    Sound.play("shoot", { vol: 0.12, gap: 90, jitter: 0.12 });
                    if (Opts.high) this.particles.push(new FxParticle({ img: "muzzle_02", x: p.x + tdx / td * 18, y: p.y + tdy / td * 18, color: p.gun ? ELEMENT_FX_COLOR[p.gun.element] : [255, 230, 150],
                        size: 22, life: 90, t0: now, rot: Math.atan2(tdy, tdx) + Math.PI / 2 }));
                    if (p.empower) { shots[0].empower = p.empower; shots[0].radius += 2; p.empower = null; }
                    this.bullets.push(...shots);
                    if (now < p.volleyUntil) {
                        for (const deg of [-14, 14, 0]) {
                            const [ax, ay] = rotateDirection(tdx / td, tdy / td, deg);
                            const b = new Bullet(p.x - ax * (deg === 0 ? 14 : 0), p.y - ay * (deg === 0 ? 14 : 0), ax, ay, 9, p.volleyDmg, "player", false, 4);
                            b.arrow = true;
                            this.bullets.push(b);
                        }
                    }
                }
            }
        }

        // ---- 2웨이브 등장 ----
        if (this.waveSpawnAt && now >= this.waveSpawnAt) this.spawnWave2(now);
        // ---- 꿈가루 / 골드 ----
        this.updateDrops(now);

        // ---- 기억 자동 발동 ----
        if (inBattle && this.monsters.length && now - this.roomEnterTime >= 300) this.updateSkills(now);

        // ---- 분신 수명 ----
        if (this.monsters.length) this.monsters = this.monsters.filter(mm => !(mm.isMirrorClone && now >= (mm.expireAt || 0)));

        // ---- 화염 / 출혈 지속 피해 ----
        for (const m of this.monsters.slice()) {
            const burn = burnTickDue(m, now);
            if (burn !== null) this.damageByEffect(m, burn, GUN_ELEMENTS.fire[1]);
            if (m.dotUntil && now >= m.dotNext && now <= m.dotUntil && this.monsters.includes(m)) {
                m.dotNext += 500;
                this.damageByEffect(m, m.dotDamage, [220, 50, 60]);
            }
        }

        // ---- 몬스터 행동 ----
        const monsters = this.monsters;
        for (let i = 0; i < monsters.length; i++) {
            const m = monsters[i];
            if (canAttack && updateMonsterRage(m, now)) this.popup(m.x, m.y - m.radius - 22, `격분 ${m.rageStacks}`, RAGE_COLOR);

            const slowed = monsterIsSlowed(m, now);
            let savedSpeed = 0, savedDash = 0;
            if (slowed) {
                savedSpeed = m.speed; savedDash = m.dashSpeed;
                m.speed *= (1 - m.slowPct); m.dashSpeed *= (1 - m.slowPct);
            }
            const aim = this.aimFor(m);
            const stunned = monsterIsStunned(m, now);
            if (stunned) { /* 기절: 아무것도 못 함 */ }
            else if (m.isBoss) updateBoss(this, m, now, canAttack);
            else if (updateNewMonster(this, m, aim, now, canAttack)) { /* 새 몬스터 */ }
            else if (m.type === "melee") updateMeleeMonster(m, aim, now, canAttack);
            else if (m.type === "summoner") updateSummonerMonster(m, aim, monsters, now, canAttack);
            else updateRangedMonster(m, aim, this.bullets, now, canAttack, this.hazards);
            if (!stunned && m.isElite) updateEliteAffixes(this, m, now, canAttack);

            if (slowed) {
                if (m.speed === savedSpeed * (1 - m.slowPct)) m.speed = savedSpeed;
                if (m.dashSpeed === savedDash * (1 - m.slowPct)) m.dashSpeed = savedDash;
            }

            const md = hypot(p.x - m.x, p.y - m.y);
            if (canAttack && !stunned && !m.hidden && !m.airborne && m.touchDamage > 0 && md < p.radius + m.radius) {
                if (now - m.lastTouchTime > TOUCH_DAMAGE_COOLDOWN && now >= p.invulnUntil) {
                    if (this.hurtPlayer(m.touchDamage, [255, 90, 90], m)) {
                        m.lastTouchTime = now;
                        const [px, py] = md > 0 ? [(p.x - m.x) / md, (p.y - m.y) / md] : [0, -1];
                        p.x += px * KNOCKBACK_PLAYER_DIST; p.y += py * KNOCKBACK_PLAYER_DIST;
                        this.clampToPlay(p);
                        if (m.isBoss && m.dashState === "dashing") this.shake(SCREEN_SHAKE_BOSS_DASH);
                    }
                }
            }
            this.clampToPlay(m);
            if (!m.airborne && !m.immovable) {
                [m.x, m.y] = pushCircleOutOfObstacles(m.x, m.y, m.radius, obstacles,
                    Math.max(MONSTER_WALL_SLIDE, m.speed * 1.15 + 0.3), m, [p.x, p.y]);
                this.clampToPlay(m);
            }
        }
        if (monsters.length > 1) {
            const ground = monsters.filter(mm => !mm.airborne && !mm.hidden);
            resolveMonsterOverlaps(ground);
            for (const m of ground) {
                if (m.immovable && m._fixX !== undefined) { m.x = m._fixX; m.y = m._fixY; }
                this.clampToPlay(m);
            }
            for (const m of monsters) if (m.immovable && m._fixX === undefined) { m._fixX = m.x; m._fixY = m.y; }
        }

        // ---- 총알 ----
        this.updateBullets(now, obstacles);

        // ---- 장판 ----
        this.hazards = this.hazards.filter(h => h.isAlive(now));
        for (const h of this.hazards) {
            if (!h.isActive(now) || !h.contains(p.x, p.y, p.radius * 0.6)) continue;
            if (now < h.nextTickTime || now < p.invulnUntil) continue;
            if (this.hurtPlayer(h.damage, [170, 255, 120])) h.nextTickTime = now + HAZARD_TICK_MS;
        }
        // ---- 회전 레이저 ----
        for (const L of this.lasers) {
            const was = L.state === "active";
            L.update(now);
            if (L.state === "active" && !was && !L.owner) this.shake(SCREEN_SHAKE_HIT);
            if (!L.hits(p.x, p.y, p.radius * 0.7)) continue;
            if (now < L.nextTickTime || now < p.invulnUntil) continue;
            if (this.hurtPlayer(L.damage, [255, 120, 120])) { L.nextTickTime = now + LASER_TICK_MS; this.shake(SCREEN_SHAKE_BOSS_DASH); }
        }

        this.updateTelegraphs(now);
        this.updateShockwaves(now);
        this.updateMines(now);
        this.updateSkillObjects(now, inBattle);

        // 잠깐 세운 바위 사라짐
        if (obstacles.some(o => o.expireAt && now >= o.expireAt)) room.obstacles = obstacles.filter(o => !(o.expireAt && now >= o.expireAt));
        if (now >= p.shieldUntil && p.shield > 0) { p.shield = 0; p.shieldBreak = null; }

        for (const pt of this.particles) pt.update();
        this.particles = this.particles.filter(pt => pt.alive(now));
        this.popups = this.popups.filter(pp => pp.alive(now));
        this.zaps = this.zaps.filter(z => now - z[4] < LIGHTNING_ZAP_MS);
        this.fx = this.fx.filter(f => now - f.t0 < f.dur);

        // ---- 전투 종료 ----
        if (inBattle && !this.monsters.length && room.type === "battle" && this.wave === 1 && this.wave2 > 0) this.startWave2(now);
        else if (inBattle && !this.monsters.length && !this.waveSpawnAt) {
            room.cleared = true;
            this.bullets = []; this.hazards = []; this.lasers = [];
            this.telegraphs = []; this.shockwaves = []; this.mines = []; this.zones = []; this.timers = [];
            this.decoy = null; p.trailUntil = 0;
            room.obstacles = room.obstacles.filter(o => !o.expireAt);
            Sound.play(room.type === "boss" ? "stage" : "clear", { vol: 0.6 });
            this.onRoomClear(room, now);
        }

        if (p.hp <= 0 && !this.gameOver) {
            if (p.revives > 0) this.revive(now);
            else { this.gameOver = true; Input.releaseJoystick(); Sound.playMusic(null); Sound.play("gameover", { vol: 0.7 }); }
        }
        // 바닥 자국 정리
        if (this.decals.length && this.decals[0].until < now) this.decals = this.decals.filter(d => d.until > now);
    }

    updateBullets(now, obstacles) {
        const p = this.player;
        for (const b of this.bullets.slice()) {
            if (!this.bullets.includes(b)) continue;
            if (b.owner === "skill") { this.updateSkillBullet(b, now, obstacles); continue; }
            if (b.homing) {
                if (b.bornAt === null) b.bornAt = now;
                if (now - b.bornAt >= HOMING_LIFETIME_MS) { this.removeBullet(b); continue; }
                const tdx = p.x - b.x, tdy = p.y - b.y, td = hypot(tdx, tdy);
                if (td > 0) {
                    const tx = tdx / td, ty = tdy / td;
                    const nx = b.dirX + (tx - b.dirX) * HOMING_TURN_RATE, ny = b.dirY + (ty - b.dirY) * HOMING_TURN_RATE;
                    const nl = hypot(nx, ny);
                    if (nl > 0) { b.dirX = nx / nl; b.dirY = ny / nl; }
                }
            }
            b.x += b.dirX * b.speed; b.y += b.dirY * b.speed;
            if (b.x < 0 || b.x > SCREEN_W || b.y < 0 || b.y > SCREEN_H) { this.removeBullet(b); continue; }
            if (bulletHitsObstacle(b, obstacles)) { this.removeBullet(b); continue; }

            if (b.owner === "player") {
                for (const m of this.monsters.slice()) {
                    if (b.hitSet && b.hitSet.has(m)) continue;
                    if (!m.targetable || hypot(b.x - m.x, b.y - m.y) >= m.radius + b.radius) continue;
                    const gun = b.gun;
                    let damage = b.damage * lightDamageMultiplier(gun, m);
                    const crit = Math.random() < critChance(p);
                    if (crit) damage *= critMult(p);
                    const res = this.hitMonster(m, damage, { crit, knock: [b.dirX, b.dirY], noKill: true });
                    if (res.dealt > 0) {
                        spawnHitSparks(this.particles, b.x, b.y, gun ? ELEMENT_FX_COLOR[gun.element] : [255, 230, 150], now, crit ? 6 : 3, crit);
                        Sound.play(crit ? "crit" : choice(["hit1", "hit2", "hit3"]), { vol: crit ? 0.45 : 0.28, gap: 35 });
                        if (crit) { this.addHitstop(1); this.shake(2); }
                    }

                    if (b.pierceLeft > 0) { b.pierceLeft -= 1; b.damage *= WIND_PIERCE_DAMAGE_MULT; b.hitSet.add(m); }
                    else this.removeBullet(b);
                    if (res.dealt <= 0 && !res.killed) break;

                    const eff = applyGunOnHit(gun, p, m, this.monsters, damage, now);
                    for (const [cm, cd] of eff.extraHits) {
                        this.zaps.push([m.x, m.y, cm.x, cm.y, now]);
                        this.damageByEffect(cm, cd, GUN_ELEMENTS.lightning[1]);
                    }
                    if (eff.stunned) this.popup(m.x, m.y - m.radius - 28, "기절!", GUN_ELEMENTS.earth[1]);
                    if (eff.darkProc) {
                        p.invulnUntil = Math.max(p.invulnUntil, now + DARK_INVULN_MS);
                        p.darkShieldUntil = now + DARK_INVULN_MS;
                        this.popup(p.x, p.y - p.radius - 24, "무적!", GUN_ELEMENTS.dark[1]);
                    }
                    if (eff.heal > 0 && p.hp < p.maxHp) {
                        p.hp = Math.min(p.maxHp, p.hp + eff.heal);
                        this.popup(p.x + 14, p.y - p.radius - 10, `+${fmtNum(eff.heal)}`, GUN_ELEMENTS.nature[1]);
                    }
                    // 출혈로 강화된 총알
                    if (b.empower && m.hp > 0) {
                        const e = b.empower;
                        const r2 = this.skillHit(e.sk, m, e.add, { noKill: true, popupDy: 22 });
                        if (!r2.killed) {
                            m.dotDamage = e.dot; m.dotUntil = now + 3000; m.dotNext = now + 500;
                            this.slowMonster(m, 0.3, 2000);
                        }
                    }
                    if (m.hp <= 0 && this.monsters.includes(m)) this.killMonster(m);
                    break;
                }
            } else if (hypot(b.x - p.x, b.y - p.y) < p.radius + b.radius) {
                if (this.hurtPlayer(b.damage, [255, 90, 90])) {
                    p.x += b.dirX * KNOCKBACK_PLAYER_DIST; p.y += b.dirY * KNOCKBACK_PLAYER_DIST;
                    this.clampToPlay(p);
                    if (b.hex) { this.slowPlayer(HEXER_SLOW_PCT, HEXER_SLOW_MS); this.popup(p.x, p.y - p.radius - 26, "저주! 느려짐", HEXER_COLOR); }
                }
                this.removeBullet(b);
            }
        }
    }

    updateSkillBullet(b, now, obstacles) {
        const p = this.player;
        if (b.homingMon) {
            const t = this.nearestTargetable(b.x, b.y, 500);
            if (t) {
                const [tx, ty] = unitTo(b.x, b.y, t.x, t.y);
                const nx = b.dirX + (tx - b.dirX) * 0.14, ny = b.dirY + (ty - b.dirY) * 0.14, nl = hypot(nx, ny);
                if (nl > 0) { b.dirX = nx / nl; b.dirY = ny / nl; }
            }
        }
        if (b.returning && b.traveled >= b.maxDist) b.goingBack = true;
        if (b.goingBack) {
            const [tx, ty] = unitTo(b.x, b.y, p.x, p.y);
            b.dirX = tx; b.dirY = ty;
            if (hypot(p.x - b.x, p.y - b.y) < p.radius + b.speed + 4) {
                if (b.onReturn) b.onReturn(this, b);
                this.removeBullet(b); return;
            }
        }
        b.x += b.dirX * b.speed; b.y += b.dirY * b.speed; b.traveled += b.speed;
        if (!b.returning && b.traveled > b.maxDist) { this.removeBullet(b); return; }
        if (!b.goingBack && (b.x < -20 || b.x > SCREEN_W + 20 || b.y < -20 || b.y > SCREEN_H + 20)) {
            if (b.returning) { b.goingBack = true; return; }
            this.removeBullet(b); return;
        }
        if (!b.ghost && bulletHitsObstacle(b, obstacles)) { this.removeBullet(b); return; }
        for (const m of this.monsters.slice()) {
            if (b.hitSet.has(m) || !m.targetable || hypot(b.x - m.x, b.y - m.y) >= m.radius + b.radius) continue;
            b.hitSet.add(m);
            const res = this.skillHit(b.sk, m, b.damage, { knock: [b.dirX * 0.5, b.dirY * 0.5] });
            if (b.onHit) b.onHit(this, m, b, res);
            if (b.grow) b.damage *= b.grow;
            if (b.pierceLeft > 0) b.pierceLeft -= 1;
            else { this.removeBullet(b); return; }
        }
    }

    // ---------------- 공격 예고 / 충격파 / 지뢰 ----------------
    updateTelegraphs(now) {
        const p = this.player;
        const list = this.telegraphs;
        this.telegraphs = [];            // onFire에서 새로 만든 예고는 여기에 들어간다
        for (const tg of list) {
            if (tg.owner && tg.cancelWithOwner && !this.monsters.includes(tg.owner)) continue;
            if (tg.track && now < tg.lockAt) tg.track(this, tg);
            if (now < tg.fireAt) { this.telegraphs.push(tg); continue; }
            const inside = tg.contains(p.x, p.y, p.radius, this.obstacles);
            let hit = false;
            if (inside && tg.damage > 0) {
                hit = this.hurtPlayer(tg.damage, [255, 110, 90], tg.owner);
                if (hit && tg.slowPct) this.slowPlayer(tg.slowPct, tg.slowMs);
            }
            if (tg.damage > 0) {
                this.addFx({ kind: "flash", tg, color: tg.color, dur: tg.kind === "field" ? 260 : 180 });
                Sound.play("boom", { vol: tg.kind === "field" ? 0.6 : 0.3, gap: 90 });
                if (tg.kind === "circle" && tg.r >= 45) {
                    spawnSmokePuff(this.particles, tg.x, tg.y, [120, 105, 95], now, 4, tg.r * 0.6);
                    spawnDebris(this.particles, tg.x, tg.y, [140, 110, 90], now, 5);
                    this.addDecal("dirt_02", tg.x, tg.y, tg.r * 1.4, [30, 22, 18], 5000);
                }
            }
            if (tg.kind === "field" && tg.damage > 0) this.shake(SCREEN_SHAKE_BOSS_DASH);
            if (tg.onFire) tg.onFire(this, tg, hit);
        }
    }
    updateShockwaves(now) {
        const p = this.player;
        for (const w of this.shockwaves) {
            w.r += w.speed;
            if (!w.hit && w.touches(p.x, p.y, p.radius)) { w.hit = true; this.hurtPlayer(w.damage, [255, 150, 90], w.owner); }
        }
        this.shockwaves = this.shockwaves.filter(w => w.r < w.maxR);
    }
    updateMines(now) {
        const p = this.player;
        this.mines = this.mines.filter(mi => now < mi.expireAt);
        for (const mi of this.mines) {
            if (mi.triggered || now < mi.armAt) continue;
            if (hypot(p.x - mi.x, p.y - mi.y) < 24 + p.radius) {
                mi.triggered = true;
                this.addTelegraph(new Telegraph("circle", now, 450, {
                    x: mi.x, y: mi.y, r: TRAPPER_MINE_RADIUS, damage: mi.damage, color: TRAPPER_COLOR,
                    onFire: (g) => { g.mines = g.mines.filter(o => o !== mi); spawnDeathBurst(g.particles, mi.x, mi.y, TRAPPER_COLOR, g.now, 8); g.explosionFx(mi.x, mi.y, TRAPPER_MINE_RADIUS, TRAPPER_COLOR); },
                }));
            }
        }
    }

    // ---------------- 기억 ----------------
    updateSkills(now) {
        const p = this.player;
        if (!p.skills.length || now < p.nextSkillAt) return;
        const ready = p.skills.filter(s => now >= s.readyAt).sort((a, b) => a.readyAt - b.readyAt);
        for (const s of ready) {
            const def = SKILL_BY_ID[s.id];
            if (!skillCanCast(this, def, s)) continue;
            const t = skillTarget(this, def);
            if (!t) continue;
            if (p.skillBoost && s.id !== "rewind") { this._castBoost = p.skillBoost; p.skillBoost = 0; }
            SKILL_CAST[s.id](this, s, t);
            Sound.play("sk_" + def.el, { vol: 0.42, gap: 80 });
            this._castBoost = 0;
            s.readyAt = now + skillCooldownMs(def, s.level) * SYNERGY_CD_MULT[p._synTier || 0];
            s.castAt = now;
            p.nextSkillAt = now + SKILL_CAST_GAP_MS;
            break;
        }
    }
    updateSkillObjects(now, inBattle) {
        const p = this.player;
        // 정해진 시간 뒤 실행
        if (this.timers.length) {
            const due = this.timers.filter(t => now >= t.at);
            if (due.length) {
                this.timers = this.timers.filter(t => now < t.at);
                for (const t of due) t.fn(this);
            }
        }
        // 부식성 발자취
        if (now < p.trailUntil && now >= p.trailNext && p.isMoving && inBattle) {
            this.addZone(p.trailSk, { x: p.x, y: p.y, r: 30, dur: 2500, tick: 500, dmg: p.trailDmg, kind: "poison", color: [120, 210, 90] });
            p.trailNext = now + 220;
        }
        // 장판형 기억
        this.zones = this.zones.filter(z => now < z.until);
        for (const z of this.zones) {
            if (z.follow === "player") { z.x = p.x; z.y = p.y; }
            if (z.chase) {
                const m = this.nearestTargetable(z.x, z.y, 400);
                if (m) { const [ux, uy] = unitTo(z.x, z.y, m.x, m.y); if (hypot(m.x - z.x, m.y - z.y) > 6) { z.x += ux * z.chase; z.y += uy * z.chase; } }
            }
            if (now < z.nextTick) continue;
            z.nextTick += z.tick;
            if (z.tickFn) { z.tickFn(this, z); continue; }
            this.areaDamage(z.sk, z.x, z.y, z.r, z.dmg, (m, res) => {
                if (res.killed) return;
                if (z.burn) this.burnMonster(m, z.burn, 2000);
                if (z.slow) this.slowMonster(m, z.slow, 1000);
            });
        }
        // 소환수 (아기 화염용 / 정령)
        this.pets = this.pets.filter(pt => now < pt.until);
        this.pets.forEach((pt, i) => {
            pt.angle += pt.kind === "dragon" ? 0.045 : 0.035;
            const rr = pt.kind === "dragon" ? 42 : 52, off = pt.kind === "dragon" ? 0 : i * 1.3;
            const tx = p.x + Math.cos(pt.angle + off) * rr, ty = p.y + Math.sin(pt.angle + off) * rr * 0.8;
            pt.x += (tx - pt.x) * 0.2; pt.y += (ty - pt.y) * 0.2;
            if (!inBattle || now < pt.nextShot) return;
            const m = this.nearestTargetable(pt.x, pt.y, pt.kind === "dragon" ? 400 : 350);
            if (!m) return;
            pt.nextShot = now + pt.gap;
            const burn = pt.burn;
            this.skillBullet(pt.sk, null, { from: [pt.x, pt.y], dir: unitTo(pt.x, pt.y, m.x, m.y), speed: 8, dmg: pt.dmg, radius: 6,
                kind: pt.kind === "dragon" ? "fireball_s" : "lightbolt", maxDist: 450,
                onHit: burn ? (gg, mm, b, res) => { if (!res.killed) gg.burnMonster(mm, burn, 2000); } : null });
        });
        if (this.decoy && now >= this.decoy.until) this.decoy = null;
    }

    removeBullet(b) { const i = this.bullets.indexOf(b); if (i >= 0) this.bullets.splice(i, 1); }

    // =============================================================
    // 문제 풀이 (O/X)
    // =============================================================
    startQuiz() {
        const problems = Problems.loadWithReviews();
        if (!problems.length) { this.afterQuiz(true); return; }
        const [questions, flags] = pickQuizQuestions(problems, QUESTIONS_PER_ROOM);
        if (!questions.length) { this.afterQuiz(true); return; }
        Input.releaseJoystick();      // 문제 화면에서는 조이패드 대신 터치/클릭으로 고른다
        this.quiz = {
            phase: "answering", questions, flags, index: 0, selected: null,
            pressed: null, pressedUntil: 0, correct: 0,
            perfectHeal: 0, penalty: 0, reviewInfo: null, skillOffer: false,
            questionStart: this.now, phaseChangedAt: this.now,
        };
        // 문제 이미지를 미리 불러둔다
        for (const q of questions) { quizImage(q._qimg); quizImage(q._eimg); }
    }

    // 지금 화면이 터치를 "버튼 누르기"로 받아야 하는지 (조이패드 대신)
    wantsTaps() { return this.modalOpen && !this.paused; }

    flashPressed(name) { this.quiz.pressed = name; this.quiz.pressedUntil = this.now + 120; }

    quizSelect(choice) {
        const q = this.quiz;
        if (!q || q.phase !== "answering") return;
        q.selected = choice;
        this.flashPressed(choice);
        Sound.play("select", { vol: 0.4, gap: 30 });
    }

    quizSubmit() {
        const q = this.quiz;
        if (!q || q.phase !== "answering" || q.selected === null) return;
        const now = this.now;
        const prob = q.questions[q.index];
        const isCorrect = q.selected === prob.correct;
        if (isCorrect) q.correct += 1; else saveWrongAnswer(prob);
        this.stats.asked += 1;
        if (isCorrect) {
            this.stats.correct += 1; this.streak += 1;
            this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
        } else {
            this.streak = 0;
            if (!this.stats.wrong.some(w => w.id === prob.id))
                this.stats.wrong.push({ id: prob.id, q: prob.question, a: prob.correct, e: prob.explanation || "", img: !!prob._qimg });
        }
        Sound.play(isCorrect ? "correct" : "wrong", { vol: 0.55, gap: 0, jitter: 0 });
        const elapsedSec = Math.max(0, (now - q.questionStart) / 1000);
        const [quality, tier] = computeSm2Quality(isCorrect, elapsedSec);
        const counts = q.index < q.flags.length ? q.flags[q.index] : true;
        if (counts) {
            const prev = prob.review || defaultReviewState();
            const next = applySm2Review(prev, quality);
            const early = !!next.early;
            delete next.early;
            prob.review = next;
            saveReviewState([prob]);
            q.reviewInfo = { elapsedSec, tier, interval: next.interval, early, due: next.due || "" };
        } else {
            q.reviewInfo = { elapsedSec, tier, practice: true };
        }
        q.phase = "result";
        q.phaseChangedAt = now;
        this.flashPressed("submit");
    }

    quizNext() {
        const q = this.quiz;
        if (!q) return;
        const now = this.now;
        if (q.phase === "result") {
            if (q.index + 1 >= QUESTIONS_PER_ROOM || q.index + 1 >= q.questions.length) {
                this.finishQuiz();
                return;
            } else {
                q.index += 1; q.selected = null; q.phase = "answering";
                q.questionStart = now; q.reviewInfo = null;
            }
            q.phaseChangedAt = now;
        } else if (q.phase === "summary") {
            this.finishQuiz();
        }
    }

    finishQuiz() {
        const q = this.quiz, ok = q.correct >= 1;
        this.quiz = null;
        Input.releaseJoystick();
        this.afterQuiz(ok);
    }
    // 문제 결과 -> 회복/패널티 -> 강화 카드 -> 엘리트 전리품
    afterQuiz(ok) {
        const p = this.player;
        if (ok) {
            const heal = Math.max(0, p.maxHp - p.hp) * CORRECT_HEAL_RATIO;
            if (heal > 0.5) { p.hp = Math.min(p.maxHp, p.hp + heal); this.popup(p.x, p.y - p.radius - 26, `정답 +${fmtNum(heal)}`, [120, 255, 140]); }
        } else {
            const pen = Math.max(0, p.hp) * WRONG_ANSWER_DAMAGE_RATIO;
            if (pen > 0) { p.hp = Math.max(1, p.hp - pen); this.popup(p.x, p.y - p.radius - 10, `오답 -${fmtNum(pen)}`, [255, 110, 110]); }
        }
        const need = Meta.bonus("focus") > 0 ? STREAK_FOR_EXTRA_CARD - 1 : STREAK_FOR_EXTRA_CARD;
        const st = this.streak;
        let o;
        if (!ok) o = { n: CARDS_ON_WRONG, title: "오답...  2장 중에서 고르세요", color: [255, 150, 140] };
        else {
            const guarantee = st > 0 && st % STREAK_LEGEND_EVERY === 0 ? "legend" : st > 0 && st % STREAK_RARE_EVERY === 0 ? "rare" : null;
            o = { n: st >= need ? CARDS_ON_STREAK : CARDS_ON_CORRECT, guarantee, color: [150, 255, 170],
                  title: st >= need ? `연속 정답 ${st}!  강화를 고르세요 (+1장)` : "정답!  강화를 하나 고르세요",
                  sub: guarantee === "legend" ? `🔥 ${st}연속 정답 보상: 전설 카드 확정!` : guarantee === "rare" ? `✨ ${st}연속 정답 보상: 희귀 카드 확정!` : "" };
            if (guarantee) Sound.play("powerup", { vol: 0.5, rate: guarantee === "legend" ? 1.25 : 1.1 });
        }
        this.queue.push(g => g.openCardPick(o));
        this.queueEliteLoot();
        this.wantSave = true;
    }

    // 엘리트 전리품: 방마다 상자 하나 (많이 잡을수록 좋은 카드)
    queueEliteLoot() {
        const n = this.bonusPicks;
        this.bonusPicks = 0;
        if (n <= 0) return;
        const boost = Math.min(3, 1.4 + 0.6 * (n - 1));
        this.queue.push(g => g.openCardPick({ n: 2, boost, title: "엘리트 전리품 상자", color: [255, 215, 90],
            sub: n > 1 ? `엘리트 ${n}마리 처치 · 희귀 확률 x${boost.toFixed(1)}` : "엘리트를 처치한 보상" }));
    }

    // =============================================================
    // 강화 카드 / 상점 / 운명의 제단 화면
    // =============================================================
    openCardPick(o) {
        const options = o.options || rollCards(this, o.n || 3, o);
        if (!options.length) return;
        this.cardPick = { mode: "pick", title: o.title || "강화를 고르세요", sub: o.sub || "", color: o.color || [255, 225, 120], options, openedAt: this.now, sel: null };
        Sound.play("powerup", { vol: 0.45, gap: 200 });
        Input.releaseJoystick();
    }
    applyCard(c) {
        const p = this.player;
        c.apply(this, cardStackMult(this, c));
        if (c.fam) p.cardStacks[c.fam] = (p.cardStacks[c.fam] || 0) + 1;
        this.stats.cards += 1;
        this.popup(p.x, p.y - p.radius - 30, c.name, c.color);
        spawnHitSparks(this.particles, p.x, p.y, CARD_RARITY[c.r][1], this.now, c.r === "legend" ? 16 : 10, true);
        Sound.play(c.r === "legend" ? "stage" : "pickup", { vol: 0.55 });
        if (c.r === "legend") { this.flashUntil = this.now + 300; this.flashColor = [255, 200, 90]; }
        this.checkSynergy();
    }
    cardPickSelect(i) {
        const cp = this.cardPick;
        if (!cp || this.now - cp.openedAt < 280) return;
        if (cp.mode === "pick") {
            const c = cp.options[i];
            if (!c) return;
            this.cardPick = null;
            this.applyCard(c);
            Input.releaseJoystick();
        } else if (cp.mode === "shop") shopBuy(this, i);
        else if (cp.mode === "altar") altarChoose(this, i);
    }
    closeCardPick() {
        const cp = this.cardPick;
        if (!cp || this.now - cp.openedAt < 200) return;
        if (cp.mode === "pick") return;          // 카드는 꼭 하나 골라야 함
        this.cardPick = null;
        this.wantSave = true;
        Input.releaseJoystick();
    }
    // 시너지: 총과 같은 속성의 기억이 늘어나면 크게 알려준다
    checkSynergy() {
        const p = this.player, t = synergyTier(p), prev = p._synTier || 0;
        p._synTier = t;
        if (t <= prev || t === 0) return;
        const el = p.gun ? p.gun.elementName : "";
        const msg = t >= 3 ? `${el} 시너지 완성!` : `${el} 시너지 ${["", "I", "II", "III"][t]}`;
        const sub = t === 1 ? "같은 속성 기억 피해 x1.3" : t === 2 ? "총 피해 +12% 추가" : "총 피해 +30% · 기억 쿨타임 -15%";
        this.say(msg, p.gun ? p.gun.color : [255, 225, 120], 2200, sub);
        this.flashUntil = this.now + (t >= 3 ? 450 : 250); this.flashColor = p.gun ? p.gun.color : [255, 225, 120];
        spawnHitSparks(this.particles, p.x, p.y, this.flashColor, this.now, t >= 3 ? 24 : 12, true);
        Sound.play("phase", { vol: 0.55 }); if (t >= 3) Sound.play("stage", { vol: 0.5 });
        this.shake(t >= 3 ? 8 : 4, 400);
    }

    // =============================================================
    // 방 클리어 / 2웨이브 / 부활 / 엔딩
    // =============================================================
    startWave2(now) {
        this.wave = 2;
        const p = this.player, room = this.room;
        this.wavePts = [];
        for (let i = 0; i < this.wave2; i++) this.wavePts.push(randomMonsterSpawnPosition(p.x, p.y, room.obstacles));
        for (const [x, y] of this.wavePts) this.addFx({ kind: "spawnmark", x, y, r: 26, color: [255, 80, 70], dur: WAVE2_DELAY_MS });
        this.waveSpawnAt = now + WAVE2_DELAY_MS;
        this.say("WAVE 2", [255, 140, 90], 900, "두 번째 무리가 몰려온다!");
        Sound.play("alert", { vol: 0.45 });
    }
    spawnWave2(now) {
        this.waveSpawnAt = 0;
        const p = this.player;
        for (const [x, y] of (this.wavePts || [])) {
            const mtype = randomMonsterFamily(this.stage);
            const elite = mtype !== "summoner" && Math.random() < eliteSpawnChance(this.stage);
            const m = new Monster(x, y, mtype, this.stage, null, elite);
            const jitter = randInt(0, 300);
            m.lastShotTime = now + jitter; m.lastTouchTime = now + jitter; m.aiNext = now + jitter + 400;
            if (m.type === "summoner") m.nextSummonTime = now + jitter + SUMMONER_SUMMON_COOLDOWN_MS;
            const k = skillMonsterHpMult(p, false);
            if (k !== 1) { m.maxHp = Math.max(1, Math.round(m.maxHp * k)); m.hp = m.maxHp; }
            this.monsters.push(m);
            spawnSmokePuff(this.particles, x, y, [150, 90, 90], now, 3, 30);
        }
        this.wavePts = null;
        this.shake(4);
    }
    onRoomClear(room, now) {
        const p = this.player;
        this.slowFrames = CLEAR_SLOWMO_FRAMES;
        this.flashUntil = now + 160; this.flashColor = [255, 255, 255];
        this.shake(6, 300);
        for (const d of this.drops) d.mag = true;
        if (p.clearHeal > 0) this.healPlayer(p.maxHp * p.clearHeal);
        if (room.type === "boss") {
            this.stageMessage = `STAGE ${this.stage} CLEAR!`;
            this.stageMessageUntil = now + 1600;
            this.score += SCORE_PER_STAGE_CLEAR;
            p.hp = Math.min(p.maxHp, p.hp + 4);
            this.zaps = [];
            this.dropDust(p.x, p.y - 60, DUST_STAGE_CLEAR_PER_STAGE * this.stage);
            if (this.stage >= FINAL_STAGE) {
                // 마지막 보스: 총 대신 "깨어남의 문"
                room.gunChoices = [];
                room.portal = placeBossRewards([], room.obstacles, p.x, p.y)[1];
                room.endPortal = true;
                this.say("꿈의 끝이 열렸다", [200, 170, 255], 2600, "빛나는 문으로 들어가세요");
            } else [room.gunChoices, room.portal] = placeBossRewards(rollGunChoices(), room.obstacles, p.x, p.y);
            room.rewardActiveAt = now + REWARD_PICKUP_DELAY_MS;
            this.queueEliteLoot();
            this.wantSave = true;
            return;
        }
        // 클리어 시간 별 -> 골드
        const sec = Math.max(0, (now - this.roomEnterTime - ROOM_ENTER_GRACE_MS) / 1000);
        const par = STAR_PAR_BASE_SEC + STAR_PAR_PER_MONSTER_SEC * difficultyRamp(this.stage) * this.roomMonsterTotal;
        const stars = sec <= par ? 3 : sec <= par * 1.6 ? 2 : sec <= par * 2.4 ? 1 : 0;
        const gold = STAR_GOLD[stars];
        this.stats.stars += stars;
        this.dropGold(p.x, p.y - 40, gold);
        this.clearInfo = { stars, sec, gold, t0: now };
        this.say("ROOM CLEAR", [140, 255, 170], 1500, `${"★".repeat(stars)}${"☆".repeat(3 - stars)}   ${sec.toFixed(1)}초   +${gold}G`);
        if (stars === 3) Sound.play("powerup", { vol: 0.4, rate: 1.3 });
        this.quizAt = now + CLEAR_TO_QUIZ_MS;
    }
    revive(now) {
        const p = this.player;
        p.revives -= 1;
        p.hp = p.maxHp * 0.5;
        p.invulnUntil = now + 2000;
        this.bullets = this.bullets.filter(b => b.owner !== "monster");
        for (const m of this.monsters) if (!m.isBoss) this.knockMonster(m, p.x, p.y, 120);
        this.say("부활!", [255, 140, 60], 1800, "불사조의 힘으로 다시 일어섰다");
        this.flashUntil = now + 500; this.flashColor = [255, 160, 70];
        spawnHitSparks(this.particles, p.x, p.y, [255, 170, 80], now, 24, true);
        Sound.play("phase", { vol: 0.6 }); this.shake(10, 500);
    }
    startEnding() {
        if (this.ending) return;
        this.ending = true;
        const depth = RunMods.depth;
        const bonus = Math.round(ENDING_DUST_BASE * (depth + 1) * Meta.dustMult());
        Meta.addDust(bonus);
        this.stats.dust += bonus; this.stats.endingDust = bonus;
        this.stats.opened = Meta.onEnding(depth);
        this.score += 2000 * (depth + 1);
        this.flashUntil = this.now + 1200; this.flashColor = [230, 210, 255];
        this.say("꿈에서 깨어났다", [220, 200, 255], 3000, depth ? `꿈의 심연 ${depth}단계 돌파!` : "모든 스테이지 클리어!");
        Sound.playMusic(null); Sound.play("stage", { vol: 0.8 });
        Input.releaseJoystick();
    }

    // =============================================================
    // 꿈가루 / 골드 떨어뜨리기
    // =============================================================
    dropDust(x, y, base) {
        const v = Math.max(1, Math.round(base * Meta.dustMult()));
        this._spawnDrops("dust", x, y, v);
    }
    dropGold(x, y, v) { if (v > 0) this._spawnDrops("gold", x, y, v); }
    _spawnDrops(kind, x, y, v) {
        const n = Math.min(10, v);            // 보이는 개수는 최대 10개, 값은 나눠 담는다
        for (let i = 0; i < n; i++) {
            const a = uniform(0, Math.PI * 2), sp = uniform(2, 5);
            const val = Math.floor(v / n) + (i < v % n ? 1 : 0);
            this.drops.push({ kind, v: val, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, born: this.now, mag: false, spd: 0 });
        }
    }
    updateDrops(now) {
        if (!this.drops.length) return;
        const p = this.player, room = this.room;
        const calm = room.cleared || !(room.type === "battle" || room.type === "boss");
        for (const d of this.drops) {
            if (now - d.born < 350) { d.x += d.vx; d.y += d.vy; d.vx *= 0.88; d.vy *= 0.88; continue; }
            const dx = p.x - d.x, dy = p.y - d.y, dist = hypot(dx, dy);
            if (calm || d.mag || dist < 110) d.mag = true;
            if (d.mag) {
                d.spd = Math.min(18, d.spd + 0.9);
                d.x += dx / (dist || 1) * Math.min(dist, d.spd); d.y += dy / (dist || 1) * Math.min(dist, d.spd);
            }
            if (dist < p.radius + 6) { d.dead = true; this.collectDrop(d); }
        }
        this.drops = this.drops.filter(d => !d.dead);
    }
    collectDrop(d) {
        if (d.kind === "dust") { Meta.addDust(d.v); this.stats.dust += d.v; }
        else this.addGold(d.v);
        this._chainAt = this.now - (this._chainLast || -1e9) < 300 ? (this._chainAt || 0) + 1 : 0;
        this._chainLast = this.now;
        Sound.play("select", { vol: 0.2, gap: 30, jitter: 0, rate: (d.kind === "dust" ? 1.2 : 1.0) + Math.min(1, this._chainAt * 0.06) });
    }
    collectAllDrops() { for (const d of this.drops || []) this.collectDrop(d); this.drops = []; }

    // =============================================================
    // 기억 고르기 (3개 중 1개) / 칸이 꽉 찼으면 버릴 기억 고르기
    // =============================================================
    openSkillPick() {
        const options = rollSkillOffers(this.player);
        if (!options.length) return;
        this.skillPick = { phase: "choose", options, sel: null, pending: null, openedAt: this.now };
        Sound.play("powerup", { vol: 0.55 });
        Input.releaseJoystick();
    }
    skillPickSelect(i) {
        const sp = this.skillPick;
        if (!sp) return;
        const n = sp.phase === "choose" ? sp.options.length : this.player.skills.length + 1;
        if (i >= 0 && i < n) { sp.sel = i; Sound.play("select", { vol: 0.4, gap: 30 }); }
    }
    skillPickConfirm() {
        const sp = this.skillPick, p = this.player;
        if (!sp || sp.sel === null || this.now - sp.openedAt < QUIZ_TAP_GUARD_MS) return;
        if (sp.phase === "choose") {
            const id = sp.options[sp.sel], def = SKILL_BY_ID[id];
            const owned = p.skills.find(s => s.id === id);
            if (owned) {
                owned.level = Math.min(SKILL_MAX_LEVEL, owned.level + 1);
                this.popup(p.x, p.y - 44, `${def.name} +${owned.level} 강화!`, skillElementColor(def.el));
            } else if (p.skills.length < SKILL_SLOTS) {
                p.skills.push({ id, level: 0, readyAt: 0 });
                this.popup(p.x, p.y - 44, `${def.name} 획득!`, skillElementColor(def.el));
            } else {
                sp.phase = "replace"; sp.pending = id; sp.sel = null; sp.openedAt = this.now;
                return;
            }
        } else {
            if (sp.sel < p.skills.length) {
                const def = SKILL_BY_ID[sp.pending];
                p.skills[sp.sel] = { id: sp.pending, level: 0, readyAt: 0 };
                this.popup(p.x, p.y - 44, `${def.name} 획득!`, skillElementColor(def.el));
            }
        }
        this.skillPick = null;
        Input.releaseJoystick();
        Sound.play("pickup", { vol: 0.55 });
        spawnHitSparks(this.particles, p.x, p.y, [255, 230, 140], this.now, 10, true);
        this.checkSynergy();
    }

    // 문제/해설 이미지 크게 보기
    openZoom(src) {
        if (!src || ZoomView.isOpen) return;
        Input.releaseJoystick();
        ZoomView.open(src, () => { if (this.quiz) this.quiz.phaseChangedAt = this.now; });
    }

    // 터치/클릭 (게임 좌표)
    onTap(x, y) {
        const cp = this.cardPick;
        if (cp) {
            const rects = cardPickRects(cp);
            for (let i = 0; i < rects.cards.length; i++) if (inRect(x, y, rects.cards[i], 6)) { this.cardPickSelect(i); return; }
            if (rects.close && inRect(x, y, rects.close, QUIZ_HIT_PAD)) this.closeCardPick();
            return;
        }
        const sp = this.skillPick;
        if (sp) {
            const rects = skillPickRects(sp, this.player);
            for (let i = 0; i < rects.cards.length; i++) {
                if (inRect(x, y, rects.cards[i], 6)) { this.skillPickSelect(i); return; }
            }
            if (rects.confirm && inRect(x, y, rects.confirm, QUIZ_HIT_PAD)) this.skillPickConfirm();
            return;
        }
        const q = this.quiz;
        if (!q) return;
        for (const t of (q.phase !== "summary" && q.zoomTargets) || []) {
            if (inRect(x, y, t.rect, 4)) { this.openZoom(t.src); return; }
        }
        if (q.phase === "answering") {
            if (inRect(x, y, QUIZ_O_RECT, QUIZ_HIT_PAD)) this.quizSelect("O");
            else if (inRect(x, y, QUIZ_X_RECT, QUIZ_HIT_PAD)) this.quizSelect("X");
            else if (inRect(x, y, QUIZ_SUBMIT_RECT, QUIZ_HIT_PAD)) this.quizSubmit();
            return;
        }
        if (this.now - q.phaseChangedAt < QUIZ_TAP_GUARD_MS) return;
        this.quizNext();
    }

    // 키보드
    onKey(code) {
        if (code === "Escape" && this.cardPick && this.cardPick.mode !== "pick" && !this.paused) { this.closeCardPick(); return; }
        if (code === "Escape" || code === "KeyP") { if (!this.gameOver) this.setPaused(!this.paused); return; }
        if (this.paused) return;
        const enter = code === "Enter" || code === "NumpadEnter" || code === "Space";
        const cp = this.cardPick;
        if (cp) {
            if (/^Digit[1-5]$/.test(code)) this.cardPickSelect(Number(code.slice(5)) - 1);
            else if (code === "Escape" || code === "KeyQ" || (enter && cp.mode !== "pick")) this.closeCardPick();
            return;
        }
        const sp = this.skillPick;
        if (sp) {
            const n = sp.phase === "choose" ? sp.options.length : this.player.skills.length + 1;
            if (/^Digit[1-4]$/.test(code)) this.skillPickSelect(Number(code.slice(5)) - 1);
            else if (code === "ArrowLeft" || code === "KeyA" || code === "ArrowUp" || code === "KeyW") this.skillPickSelect(sp.sel === null ? 0 : (sp.sel + n - 1) % n);
            else if (code === "ArrowRight" || code === "KeyD" || code === "ArrowDown" || code === "KeyS") this.skillPickSelect(sp.sel === null ? 0 : (sp.sel + 1) % n);
            else if (enter) this.skillPickConfirm();
            return;
        }
        const q = this.quiz;
        if (!q) return;
        if (code === "KeyZ" && q.phase !== "summary") {
            const prob = q.questions[q.index];
            this.openZoom(q.phase === "result" ? (prob._eimg || prob._qimg) : prob._qimg);
            return;
        }
        if (q.phase === "answering") {
            if (code === "ArrowLeft" || code === "KeyA" || code === "KeyO") this.quizSelect("O");
            else if (code === "ArrowRight" || code === "KeyD" || code === "KeyX") this.quizSelect("X");
            else if (code === "ArrowUp" || code === "ArrowDown" || code === "KeyW" || code === "KeyS") {
                this.quizSelect(q.selected === "O" ? "X" : "O");     // 위/아래: O <-> X 바꾸기
            } else if (enter) this.quizSubmit();
        } else if (enter) {
            if (this.now - q.phaseChangedAt < 120) return;
            this.quizNext();
        }
    }

    setPaused(v) {
        if (this.ended) return;
        this.paused = v;
        Input.releaseJoystick();
        if (this.onPauseChange) this.onPauseChange(v);
    }

    // ---------------- 그리기 ----------------
    draw(ctx) {
        const now = this.now;
        ctx.save();
        if (now < this.shakeUntil && !this.paused && Opts.data.shake) {
            // 점점 약해지는 부드러운 흔들림
            const k = (this.shakeUntil - now) / this.shakeDur, m = this.shakeMagnitude * k * k;
            ctx.translate(Math.sin(now * 0.09) * m + Math.sin(now * 0.23) * m * 0.5, Math.cos(now * 0.11) * m + Math.sin(now * 0.31) * m * 0.5);
        }
        if (this.quiz) {
            drawQuizScreen(ctx, this.quiz, now, Input.lastType === "touch", this);
        } else if (this.skillPick) {
            drawSkillPick(ctx, this.skillPick, this.player, now, Input.lastType === "touch");
        } else {
            const room = this.room;
            drawGame(ctx, {
                room, player: this.player, hazards: this.hazards, obstacles: room.obstacles || [],
                lasers: this.lasers, monsters: this.monsters, bullets: this.bullets, zaps: this.zaps,
                particles: this.particles, popups: this.popups, stage: this.stage, score: this.score,
                elapsedMs: now, input: Input, rooms: this.rooms, currentCoord: this.currentCoord,
                gameOver: this.gameOver, stageMessage: this.stageMessage,
                telegraphs: this.telegraphs, shockwaves: this.shockwaves, mines: this.mines,
                fx: this.fx, zones: this.zones, pets: this.pets, decoy: this.decoy,
                decals: this.decals, hurtFlashUntil: this.hurtFlashUntil,
                drops: this.drops, gold: this.gold, streak: this.streak, banner: this.banner, game: this,
                flashUntil: this.flashUntil, flashColor: this.flashColor, ending: this.ending,
            }, now);
            if (this.cardPick) drawCardPick(ctx, this, this.cardPick, now, Input.lastType === "touch");
        }
        ctx.restore();
    }
}
