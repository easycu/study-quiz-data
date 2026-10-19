// =============================================================
// 서바이벌 모드 (뱀파이어 서바이벌 방식)
//   - 이동만 하면 무기는 자동. 시간이 갈수록 몬스터가 떼로 몰려온다.
//   - 몬스터를 잡으면 경험치 보석 -> 레벨업하면 O/X 문제 1개
//       맞히면 강화 3개(연속 정답 3번부터 4개) 중 하나, 틀리면 2개 중 하나
//   - 무기 9종(최대 6개) + 능력 9종, 무기 5레벨에서 "각성"
//   - 엘리트/보스를 잡으면 보물 상자, 10분을 버티면 생존 성공
// =============================================================
"use strict";

const SV = {
    RUN_MS: 10 * 60 * 1000,
    MAX_ENEMIES: 320,
    CELL: 48,
    CX: SCREEN_W / 2, CY: 360,           // 화면에서 플레이어가 서는 자리
    SPAWN_R: 560,                        // 이 거리에서 몬스터가 나타남 (화면 밖)
    DESPAWN_R: 900,                      // 너무 멀어지면 다시 가까이 옮김
    MAX_WEAPONS: 6,
    INVULN_MS: 380,
    GEM_CAP: 420,
};

// ---------------- 몬스터 ----------------
// sprite: monsters2 그림 이름, from: 등장 시작(분)
const SV_ENEMY = {
    chase:    { sprite: "chase", r: 12, hp: 7, spd: 1.25, dmg: 6, xp: 1, from: 0, w: 10 },
    bat:      { sprite: "homing", r: 9, hp: 4, spd: 2.05, dmg: 5, xp: 1, from: 0.35, w: 8 },
    slime:    { sprite: "splitter", r: 13, hp: 16, spd: 1.0, dmg: 8, xp: 2, from: 1.2, w: 7 },
    brute:    { sprite: "brute", r: 21, hp: 70, spd: 0.8, dmg: 14, xp: 6, from: 2.0, w: 3 },
    spitter:  { sprite: "spitter", r: 13, hp: 20, spd: 0.95, dmg: 7, xp: 3, from: 3.0, w: 2.5, ranged: true },
    skull:    { sprite: "summoner", r: 15, hp: 38, spd: 1.45, dmg: 11, xp: 4, from: 4.0, w: 4 },
    kamikaze: { sprite: "kamikaze", r: 13, hp: 22, spd: 2.0, dmg: 0, xp: 3, from: 5.0, w: 2.5, blast: 24 },
    assassin: { sprite: "assassin", r: 13, hp: 30, spd: 2.4, dmg: 12, xp: 4, from: 6.5, w: 3 },
};
const SV_BOSSES = [
    { at: 3 * 60000, key: "brute", name: "돌격 대장", hp: 1800 },
    { at: 6 * 60000, key: "artillery", name: "포격 장군", hp: 4500 },
    { at: 9 * 60000, key: "mirror", name: "거울 마녀", hp: 9000 },
];

// ---------------- 무기 ----------------
// st(lv, evo): 그 레벨의 수치. 각성(evo)은 5레벨 다음 단계
const SV_WEAPONS = {
    gun: { name: "마법 탄환", icon: "muzzle_02", color: [255, 220, 120], el: "light",
        st: (lv, evo) => ({ cd: evo ? 330 : 700 - lv * 40, dmg: 9 + lv * 3 + (evo ? 8 : 0), count: 1 + (lv >= 2) + (lv >= 4) + (evo ? 2 : 0), pierce: (lv >= 3) + (lv >= 5) + (evo ? 2 : 0), knock: 2.5 }),
        desc: lv => ["가까운 적에게 탄환 발사", "탄환 +1", "관통 +1", "탄환 +1", "관통 +1 · 피해 증가"][lv - 1] },
    whip: { name: "회전 베기", icon: "slash_02", color: [235, 235, 255], el: "none",
        st: (lv, evo) => ({ cd: evo ? 700 : 1150 - lv * 40, dmg: 14 + lv * 6 + (evo ? 14 : 0), len: 150 + lv * 10 + (evo ? 60 : 0), wid: 56 + (evo ? 20 : 0), both: lv >= 2 || evo, four: evo, knock: 7 }),
        desc: lv => ["앞쪽을 크게 벤다", "뒤쪽도 함께 벤다", "피해·길이 증가", "피해·길이 증가", "피해·길이 크게 증가"][lv - 1] },
    orbit: { name: "회전 칼날", icon: "twirl_01", color: [170, 220, 255], el: "ice",
        st: (lv, evo) => ({ count: 1 + lv + (evo ? 2 : 0), dmg: 7 + lv * 3 + (evo ? 6 : 0), rad: 70 + lv * 6, spin: 0.075 + lv * 0.006, size: 15 + (evo ? 5 : 0), ring2: evo, knock: 3.5 }),
        desc: lv => ["내 주변을 도는 칼날", "칼날 +1", "칼날 +1 · 빨라짐", "칼날 +1", "칼날 +1 · 피해 증가"][lv - 1] },
    lightning: { name: "낙뢰", icon: "spark_01", color: [255, 240, 120], el: "light",
        st: (lv, evo) => ({ cd: evo ? 900 : 1700 - lv * 80, dmg: 18 + lv * 7 + (evo ? 12 : 0), count: 1 + lv + (evo ? 3 : 0), rad: 42 + lv * 4, chain: evo ? 3 : 0, knock: 1 }),
        desc: lv => ["화면 안 적에게 번개", "번개 +1", "번개 +1 · 범위 증가", "번개 +1", "번개 +1 · 피해 증가"][lv - 1] },
    aura: { name: "화염 고리", icon: "circle_05", color: [255, 130, 50], el: "fire",
        st: (lv, evo) => ({ tick: 330, dmg: 3 + lv * 2 + (evo ? 5 : 0), rad: 62 + lv * 13 + (evo ? 45 : 0), burn: evo, knock: 1.6 }),
        desc: lv => ["내 주변을 계속 태움", "범위·피해 증가", "범위·피해 증가", "범위·피해 증가", "범위·피해 크게 증가"][lv - 1] },
    missile: { name: "유도 미사일", icon: "trace_01", color: [200, 130, 255], el: "dark",
        st: (lv, evo) => ({ cd: evo ? 1100 : 1900 - lv * 70, dmg: 13 + lv * 5 + (evo ? 8 : 0), count: 1 + lv + (evo ? 4 : 0), boom: 46 + lv * 4, knock: 4 }),
        desc: lv => ["따라가서 터지는 미사일", "미사일 +1", "미사일 +1 · 폭발 증가", "미사일 +1", "미사일 +1 · 피해 증가"][lv - 1] },
    nova: { name: "빙결 파동", icon: "circle_03", color: [150, 225, 255], el: "ice",
        st: (lv, evo) => ({ cd: evo ? 2200 : 3300 - lv * 120, dmg: 12 + lv * 6 + (evo ? 10 : 0), rad: 150 + lv * 22 + (evo ? 60 : 0), slow: 0.45, freeze: evo, knock: 9 }),
        desc: lv => ["퍼지는 얼음 파동 · 느려짐", "범위·피해 증가", "범위·피해 증가", "범위·피해 증가", "범위·피해 크게 증가"][lv - 1] },
    meteor: { name: "별똥별", icon: "star_06", color: [255, 200, 110], el: "fire",
        st: (lv, evo) => ({ cd: evo ? 1600 : 2700 - lv * 100, dmg: 30 + lv * 11 + (evo ? 20 : 0), count: 1 + lv + (evo ? 4 : 0), rad: 58 + lv * 4 + (evo ? 14 : 0), knock: 10 }),
        desc: lv => ["적이 모인 곳에 운석", "운석 +1", "운석 +1 · 범위 증가", "운석 +1", "운석 +1 · 피해 증가"][lv - 1] },
    boomer: { name: "빛 부메랑", icon: "magic_02", color: [255, 245, 190], el: "light",
        st: (lv, evo) => ({ cd: evo ? 800 : 1500 - lv * 60, dmg: 15 + lv * 5 + (evo ? 10 : 0), count: 1 + (lv >= 3) + (lv >= 5) + (evo ? 2 : 0), dist: 240 + lv * 15, size: 16 + (evo ? 6 : 0), knock: 5 }),
        desc: lv => ["관통하며 돌아오는 부메랑", "피해·거리 증가", "부메랑 +1", "피해·거리 증가", "부메랑 +1"][lv - 1] },
};
const SV_EVO_NAME = {
    gun: "탄환 폭풍", whip: "사방 베기", orbit: "칼날 폭풍", lightning: "천둥 심판", aura: "지옥불 고리",
    missile: "미사일 세례", nova: "절대 영도", meteor: "유성우", boomer: "빛의 원무",
};
// ---------------- 능력 (패시브) ----------------
const SV_PASSIVES = {
    might:  { name: "공격력", tag: "힘", color: [255, 110, 90], desc: "모든 피해 +12%" },
    haste:  { name: "가속", tag: "속", color: [120, 220, 255], desc: "무기 재사용 -8%" },
    area:   { name: "범위", tag: "범", color: [190, 140, 255], desc: "공격 범위 +12%" },
    amount: { name: "개수", tag: "수", color: [255, 230, 110], desc: "투사체 +1", max: 2 },
    speed:  { name: "신발", tag: "발", color: [140, 255, 170], desc: "이동속도 +9%" },
    vital:  { name: "체력", tag: "체", color: [255, 90, 120], desc: "최대 체력 +25 · 회복" },
    regen:  { name: "재생", tag: "재", color: [120, 255, 140], desc: "초당 체력 +0.4" },
    magnet: { name: "자석", tag: "자", color: [120, 200, 255], desc: "보석 끌어오는 범위 +35%" },
    crit:   { name: "치명", tag: "치", color: [255, 200, 80], desc: "치명타 확률 +6%" },
};
const SV_PASSIVE_MAX = 5;

// 레벨업에 필요한 경험치: 처음엔 금방, 갈수록 오래 (뱀서 방식: 20레벨까지 +10씩, 40까지 +13, 그 뒤 +16)
function svNeedXp(level) { return Math.round(2 * (level < 20 ? 5 + 10 * (level - 1) : level < 40 ? 195 + 13 * (level - 20) : 455 + 16 * (level - 40))); }
function svFmtTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

// =============================================================
class SurvivalGame {
    constructor(startWeapon, onEnd) {
        this.onEnd = onEnd;
        this.now = 0; this.frame = 0;
        this.p = { x: 0, y: 0, radius: 16, hp: 100, maxHp: 100, speed: 3.3, facingX: 0, facingY: 1, isMoving: false,
                   animOffset: randInt(0, 1000), invulnUntil: 0, lastDx: 1 };
        this.passives = {};
        this.weapons = [];
        this.addWeapon(startWeapon || "gun");
        this.recalc();
        this.enemies = []; this.gems = []; this.pickups = []; this.proj = []; this.ebul = []; this.tele = [];
        this.particles = []; this.fx = []; this.nums = [];
        this.grid = new Map();
        this.cam = { x: 0, y: 0 };
        this.level = 1; this.xp = 0; this.pendingLevels = 0;
        this.kills = 0; this.combo = 0; this.comboAt = -1e9; this.maxCombo = 0; this.killTimes = [];
        this.feverUntil = 0; this.feverReadyAt = 0;
        this.gemChain = 0; this.gemChainAt = -1e9;
        this.shakeMag = 0; this.shakeUntil = 0; this.shakeDur = 1;
        this.hitstop = 0; this.slowmoUntil = 0;
        this.ui = null;              // 퀴즈 / 강화 고르기 / 보물 상자
        this.banner = null;
        this.paused = false; this.over = false; this.ended = false; this.won = false;
        this.nextSpawnAt = 0; this.nextEliteAt = 60000; this.bossIdx = 0; this.events = [45000, 150000, 270000, 420000, 510000];
        this.quiz = { asked: 0, right: 0, streak: 0 };
        this.dmgBy = {};
        this.lastHurtSound = 0;
        this.flashUntil = 0; this.flashColor = [255, 255, 255];
        this.hurtFlashUntil = 0;
    }

    // ---------------- 능력치 ----------------
    pl(id) { return this.passives[id] || 0; }
    recalc() {
        const p = this.p, P = id => this.pl(id);
        this.might = 1 + 0.12 * P("might");
        this.cdMul = Math.pow(0.92, P("haste")) * (this.now < this.feverUntil ? 0.6 : 1);
        this.area = 1 + 0.12 * P("area");
        this.amount = P("amount");
        p.speed = 3.3 * (1 + 0.09 * P("speed"));
        const newMax = 100 + 25 * P("vital");
        if (newMax > p.maxHp) p.hp += newMax - p.maxHp;
        p.maxHp = newMax;
        this.regen = 0.4 * P("regen");
        this.magnet = 110 * (1 + 0.35 * P("magnet"));
        this.critChance = 0.08 + 0.06 * P("crit");
    }
    addWeapon(id) { this.weapons.push({ id, lv: 1, evo: false, next: 0, ang: Math.random() * 6.28, side: 1 }); }
    weapon(id) { return this.weapons.find(w => w.id === id); }
    wst(w) {
        const s = SV_WEAPONS[w.id].st(w.lv, w.evo);
        if (s.count !== undefined && w.id !== "orbit") s.count += this.amount;
        if (w.id === "orbit") s.count += this.amount;
        return s;
    }

    // ---------------- 연출 도구 ----------------
    shake(mag, dur) {
        if (!Opts.data.shake) return;
        dur = dur || 160;
        const left = this.now < this.shakeUntil ? this.shakeMag * (this.shakeUntil - this.now) / this.shakeDur : 0;
        if (mag < left) return;
        this.shakeMag = mag; this.shakeDur = dur; this.shakeUntil = this.now + dur;
    }
    num(x, y, v, crit, color) {
        if (this.nums.length > 45) this.nums.shift();
        this.nums.push({ x: x + uniform(-6, 6), y, text: crit ? fmtNum(v) + "!" : fmtNum(v), t: this.now, crit, color: color || (crit ? [255, 210, 80] : [255, 255, 255]) });
    }
    addFx(f) { f.t0 = this.now; this.fx.push(f); if (this.fx.length > 160) this.fx.shift(); return f; }
    say(text, color, ms) { this.banner = { text, color: color || [255, 230, 120], t: this.now, until: this.now + (ms || 1400) }; }

    // ---------------- 공간 나누기 (빠른 충돌 검사) ----------------
    buildGrid() {
        const g = this.grid; g.clear();
        const C = SV.CELL;
        for (const e of this.enemies) {
            const k = ((Math.floor(e.x / C) + 4096) << 13) | (Math.floor(e.y / C) + 4096);
            let a = g.get(k); if (!a) { a = []; g.set(k, a); } a.push(e);
        }
    }
    near(x, y, r, fn) {
        const C = SV.CELL, x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C), y0 = Math.floor((y - r) / C), y1 = Math.floor((y + r) / C);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
            const a = this.grid.get(((cx + 4096) << 13) | (cy + 4096));
            if (!a) continue;
            for (const e of a) if (!e.dead && Math.abs(e.x - x) <= r + e.r && Math.abs(e.y - y) <= r + e.r) { if (fn(e) === false) return; }
        }
    }
    nearest(x, y, maxD, exclude) {
        let best = null, bd = maxD * maxD;
        for (const e of this.enemies) {
            if (e.dead || (exclude && exclude.has(e))) continue;
            const d = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }
    onScreen(e, pad) { return Math.abs(e.x - this.cam.x) < SCREEN_W / 2 + (pad || 0) && Math.abs(e.y - this.cam.y) < SCREEN_H / 2 + (pad || 0); }

    // ---------------- 몬스터 만들기 ----------------
    minutes() { return this.now / 60000; }
    spawnEnemy(type, x, y, opts) {
        if (this.enemies.length >= SV.MAX_ENEMIES && !(opts && (opts.elite || opts.boss))) return null;
        const d = SV_ENEMY[type], t = this.minutes();
        const hpMul = (1 + 0.5 * t + 0.12 * t * t) * (this.heat || 1), dmgMul = 1 + 0.1 * t;
        const e = { type, sprite: d.sprite, x, y, r: d.r, hp: d.hp * hpMul, spd: d.spd * (1 + 0.025 * t) * uniform(0.92, 1.08), dmg: d.dmg * dmgMul,
                    xp: d.xp, kx: 0, ky: 0, flashUntil: 0, slowUntil: 0, slowPct: 0, stunUntil: 0, dotUntil: 0, dotDmg: 0, dotNext: 0,
                    hitOrbit: 0, hitAura: 0, hitBoom: 0, anim: randInt(0, 1000), dead: false, elite: false, boss: false,
                    ranged: !!d.ranged, shootNext: this.now + uniform(1500, 3000), blast: d.blast || 0, fuseAt: 0, popAcc: 0, popNext: 0 };
        if (opts && opts.elite) {
            e.elite = true; e.r = Math.round(d.r * 1.9); e.hp *= 16; e.dmg *= 1.6; e.spd *= 0.85; e.xp = 0;
            e.eliteColor = choice([[255, 120, 60], [120, 200, 255], [200, 120, 255], [255, 220, 90]]);
        }
        e.maxHp = e.hp;
        this.enemies.push(e);
        return e;
    }
    spawnAround(type, n, ring) {
        const p = this.p;
        for (let i = 0; i < n; i++) {
            const a = ring ? i / n * Math.PI * 2 : uniform(0, Math.PI * 2), r = ring ? SV.SPAWN_R - 40 : uniform(SV.SPAWN_R, SV.SPAWN_R + 120);
            this.spawnEnemy(type, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8);
        }
    }
    pickType() {
        const t = this.minutes(), keys = [], w = [];
        for (const [k, d] of Object.entries(SV_ENEMY)) if (t >= d.from) { keys.push(k); w.push(d.w * (k === "chase" ? Math.max(0.35, 1 - t * 0.1) : 1)); }
        return weightedChoice(keys, w);
    }
    spawnBoss(def) {
        const p = this.p, a = uniform(0, 6.28);
        const t = this.minutes();
        const b = { type: "boss", boss: true, bossKey: def.key, name: def.name, x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 300, r: 34,
                    hp: def.hp * (1 + 0.1 * t), spd: 1.25, dmg: 16 * (1 + 0.08 * t), xp: 0, kx: 0, ky: 0, flashUntil: 0, slowUntil: 0, slowPct: 0, stunUntil: 0,
                    dotUntil: 0, dotDmg: 0, dotNext: 0, hitOrbit: 0, hitAura: 0, hitBoom: 0, anim: 0, dead: false, elite: false,
                    act: this.now + 2500, state: "chase", popAcc: 0, popNext: 0 };
        b.maxHp = b.hp;
        this.enemies.push(b); this.boss = b;
        this.say(`⚠ ${def.name} 등장!`, [255, 110, 90], 1800);
        Sound.play("alert", { vol: 0.6 }); Sound.play("phase", { vol: 0.5 });
        this.shake(8, 500);
    }

    // =============================================================
    // 한 칸 진행
    // =============================================================
    step() {
        if (this.paused || this.ended || (typeof ZoomView !== "undefined" && ZoomView.isOpen)) return;
        if (this.ui) { this.now += 0; this.updateUi(); return; }
        if (this.hitstop > 0) { this.hitstop--; return; }
        this.frame++;
        if (this.now < this.slowmoUntil && this.frame % 3 !== 0) { this.updateVisualsOnly(); return; }
        this.now += FRAME_MS;
        const now = this.now;
        if (!this.over) this.update(now);
        else this.updateVisualsOnly();
        if (this.over && !this.ended && now - this.overAt > 1200) {
            this.ended = true;
            this.onEnd && this.onEnd(this.result());
        }
    }
    updateVisualsOnly() {
        for (const pt of this.particles) pt.update();
        this.particles = this.particles.filter(pt => pt.alive(this.now));
    }
    update(now) {
        const p = this.p;
        // ---- 이동 ----
        const [mx, my] = Input.moveVector();
        p.isMoving = mx !== 0 || my !== 0;
        if (p.isMoving) {
            p.x += mx * p.speed; p.y += my * p.speed;
            const l = hypot(mx, my); p.facingX = mx / l; p.facingY = my / l;
            if (Math.abs(mx) > 0.2) p.lastDx = Math.sign(mx);
        }
        this.cam.x += (p.x - this.cam.x) * 0.18; this.cam.y += (p.y - this.cam.y) * 0.18;
        if (this.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + this.regen / 60);
        if (this.feverUntil && now >= this.feverUntil) { this.feverUntil = 0; this.recalc(); }

        this.director(now);
        this.buildGrid();
        this.updateEnemies(now);
        this.buildGrid();
        this.updateWeapons(now);
        this.updateProjectiles(now);
        this.updateEnemyBullets(now);
        this.updateTelegraphs(now);
        this.updateGems(now);
        this.updatePickups(now);
        // 효과 정리
        for (const pt of this.particles) pt.update();
        this.particles = this.particles.filter(pt => pt.alive(now));
        if (this.particles.length > 170) this.particles.splice(0, this.particles.length - 170);
        this.fx = this.fx.filter(f => now - f.t0 < f.dur);
        this.nums = this.nums.filter(n => now - n.t < 650);
        if (this.enemies.some(e => e.dead)) this.enemies = this.enemies.filter(e => !e.dead);
        if (this.boss && this.boss.dead) this.boss = null;

        if (this.pendingLevels > 0 && !this.ui) this.openLevelUp();
        if (p.hp <= 0 && !this.over) this.die();
        if (now >= SV.RUN_MS && !this.over) this.win();
    }

    // ---------------- 웨이브 감독 ----------------
    director(now) {
        const t = this.minutes(), p = this.p;
        const target = Math.min(SV.MAX_ENEMIES - 20, Math.round(14 + 26 * t + 2.6 * t * t));
        // 난이도 자동 조절: 몬스터를 너무 빨리 쓸어버리면 새로 나오는 몬스터가 단단해지고,
        // 화면이 넘치고 체력이 낮으면 다시 약해진다 -> 누구나 "몰려오는 무리"를 계속 느끼게
        if (now >= (this.heatAt || 0)) {
            this.heatAt = now + 1000;
            const ratio = this.enemies.length / Math.max(1, target);
            this.heat = this.heat || 1;
            if (p.hp < p.maxHp * 0.4) this.heat *= 0.97;                 // 위험하면 숨 돌릴 틈
            else if (ratio < 0.55 && t > 0.75) this.heat *= 1.012;        // 너무 쉽게 쓸어버리면 단단하게
            else if (ratio > 0.9 && this.heat > 1) this.heat *= 0.995;
            this.heat = clamp(this.heat, 0.75, 3.5);
        }
        // 1초에 나올 수 있는 몬스터 수에 한도 (시간이 갈수록 늘어남)
        this.spawnBudget = Math.min(40, (this.spawnBudget || 0) + (5 + 3 * t) * FRAME_MS / 1000);
        if (now >= this.nextSpawnAt) {
            const missing = target - this.enemies.length;
            if (missing > 0 && this.spawnBudget >= 1) {
                const n = Math.min(missing, Math.floor(this.spawnBudget));
                this.spawnBudget -= n;
                for (let i = 0; i < n; i++) {
                    const a = uniform(0, Math.PI * 2), r = uniform(SV.SPAWN_R, SV.SPAWN_R + 140);
                    this.spawnEnemy(this.pickType(), p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.85);
                }
            }
            this.nextSpawnAt = now + 260;
        }
        // 포위 이벤트
        if (this.events.length && now >= this.events[0]) {
            this.events.shift();
            const type = t < 3 ? "bat" : t < 6 ? "slime" : "skull";
            this.spawnAround(type, Math.round(28 + t * 6), true);
            this.say("포위당했다! 뚫고 나가!", [255, 160, 90]);
            Sound.play("alert", { vol: 0.45 });
        }
        if (now >= this.nextEliteAt) {
            this.nextEliteAt = now + 60000;
            const a = uniform(0, 6.28);
            const e = this.spawnEnemy(this.pickType() === "bat" ? "brute" : this.pickType(), p.x + Math.cos(a) * SV.SPAWN_R, p.y + Math.sin(a) * SV.SPAWN_R * 0.8, { elite: true });
            if (e) this.say("엘리트 등장 - 잡으면 보물 상자!", [255, 215, 90]);
        }
        if (this.bossIdx < SV_BOSSES.length && now >= SV_BOSSES[this.bossIdx].at) this.spawnBoss(SV_BOSSES[this.bossIdx++]);
    }

    // ---------------- 몬스터 행동 ----------------
    updateEnemies(now) {
        const p = this.p;
        let touchDmg = 0, toucher = null;
        for (const e of this.enemies) {
            if (e.dead) continue;
            // 지속 피해 (지옥불)
            if (now < e.dotUntil && now >= e.dotNext) { e.dotNext = now + 500; this.hit(e, e.dotDmg, { wid: "aura", noKnock: true, color: [255, 150, 70] }); if (e.dead) continue; }
            const dx = p.x - e.x, dy = p.y - e.y, d = hypot(dx, dy) || 1;
            // 너무 멀어진 몬스터는 다시 앞쪽에 (보스 제외)
            if (d > SV.DESPAWN_R && !e.boss && !e.elite) {
                const a = Math.atan2(p.facingY || uniform(-1, 1), p.facingX || uniform(-1, 1)) + uniform(-0.8, 0.8);
                e.x = p.x + Math.cos(a) * SV.SPAWN_R; e.y = p.y + Math.sin(a) * SV.SPAWN_R * 0.85; continue;
            }
            const stunned = now < e.stunUntil;
            let spd = e.spd * (now < e.slowUntil ? 1 - e.slowPct : 1);
            if (e.boss) this.updateBoss(e, now, dx / d, dy / d, d);
            else if (!stunned) {
                if (e.ranged) {
                    const want = d > 260 ? 1 : d < 200 ? -0.7 : 0.15;
                    e.x += dx / d * spd * want; e.y += dy / d * spd * want;
                    if (now >= e.shootNext && d < 520) {
                        e.shootNext = now + uniform(2400, 3200);
                        this.ebul.push({ x: e.x, y: e.y, vx: dx / d * 2.9, vy: dy / d * 2.9, r: 7, dmg: e.dmg * 1.1, life: 4000, t0: now });
                    }
                } else if (e.blast) {
                    if (e.fuseAt) { if (now >= e.fuseAt) { this.kamikazeBlast(e); continue; } }
                    else {
                        e.x += dx / d * spd; e.y += dy / d * spd;
                        if (d < 66) { e.fuseAt = now + 650; this.tele.push({ kind: "circle", x: e.x, y: e.y, r: 66, t0: now, until: now + 650, owner: e }); }
                    }
                } else { e.x += dx / d * spd; e.y += dy / d * spd; }
            }
            // 밀려남 (넉백)
            if (e.kx || e.ky) { e.x += e.kx; e.y += e.ky; e.kx *= 0.78; e.ky *= 0.78; if (Math.abs(e.kx) + Math.abs(e.ky) < 0.05) e.kx = e.ky = 0; }
            // 서로 겹치지 않게 (가볍게)
            if (!e.boss) {
                let pushed = 0;
                this.near(e.x, e.y, e.r, o => {
                    if (o === e || pushed > 4) return;
                    const ox = e.x - o.x, oy = e.y - o.y, od = hypot(ox, oy), min = e.r + o.r;
                    if (od > 0 && od < min) { const k = (min - od) / od * 0.35; e.x += ox * k; e.y += oy * k; pushed++; }
                });
            }
            // 플레이어와 닿음
            if (!stunned && e.dmg > 0 && d < p.radius * 0.8 + e.r) { if (e.dmg > touchDmg) { touchDmg = e.dmg; toucher = e; } }
        }
        if (touchDmg > 0) this.hurt(touchDmg, toucher);
    }
    updateBoss(b, now, ux, uy, d) {
        const p = this.p;
        const enraged = b.hp < b.maxHp * 0.5;
        if (b.state === "dash") {
            if (now < b.dashAt) return;                // 예고 중
            b.x += b.dvx; b.y += b.dvy;
            if (now >= b.dashEnd) { b.state = "chase"; b.act = now + (enraged ? 1800 : 2600); }
            return;
        }
        if (now < b.stunUntil) return;
        b.x += ux * b.spd * (enraged ? 1.25 : 1); b.y += uy * b.spd * (enraged ? 1.25 : 1);
        if (now < b.act) return;
        const r = Math.random();
        if (r < 0.45 && d > 120) {
            // 돌진: 빨간 선으로 예고 -> 빠르게 돌진
            const len = 460, tms = enraged ? 650 : 800;
            b.state = "dash"; b.dashAt = now + tms; b.dashEnd = b.dashAt + len / 10 * FRAME_MS; b.dvx = ux * 10; b.dvy = uy * 10;
            this.tele.push({ kind: "line", x: b.x, y: b.y, x2: b.x + ux * len, y2: b.y + uy * len, w: b.r * 2, t0: now, until: b.dashAt, owner: b });
            Sound.play("dash", { vol: 0.5 });
        } else if (r < 0.8) {
            // 원형 탄막 2번 (사이사이 빈틈)
            const n = enraged ? 18 : 14;
            for (let k = 0; k < 2; k++) {
                const off = k * Math.PI / n;
                setTimeoutGame(this, k * 420, () => {
                    for (let i = 0; i < n; i++) { const a = off + i * Math.PI * 2 / n; this.ebul.push({ x: b.x, y: b.y, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, r: 8, dmg: b.dmg * 0.6, life: 5000, t0: this.now }); }
                    Sound.play("boom", { vol: 0.35, gap: 60 });
                });
            }
            b.act = now + (enraged ? 1900 : 2700);
        } else {
            this.spawnAround("bat", enraged ? 14 : 10, true);
            this.addFx({ kind: "ring", x: b.x, y: b.y, r: 90, color: [255, 120, 90], dur: 400 });
            b.act = now + 2600;
        }
    }
    kamikazeBlast(e) {
        const p = this.p;
        this.explode(e.x, e.y, 66, [255, 140, 60]);
        if (hypot(p.x - e.x, p.y - e.y) < 66 + p.radius * 0.6) this.hurt(SV_ENEMY.kamikaze.blast * (1 + 0.09 * this.minutes()), e);
        this.tele = this.tele.filter(t => t.owner !== e);
        this.kill(e, true);
    }
    explode(x, y, r, color) {
        this.addFx({ kind: "anim", sheet: "explosion", x, y, scale: Math.min(4.5, r / 18 * 0.75), alpha: 0.8, dur: 420 });
        spawnSmokePuff(this.particles, x, y, [90, 80, 80], this.now, 3, r * 0.8);
        spawnHitSparks(this.particles, x, y, color || [255, 170, 70], this.now, 5);
        Sound.play("explode", { vol: 0.45, gap: 60 });
        this.shake(4);
    }

    // ---------------- 플레이어 피해 ----------------
    hurt(dmg, src) {
        const p = this.p, now = this.now;
        if (now < p.invulnUntil || this.over) return;
        p.hp -= dmg; p.invulnUntil = now + SV.INVULN_MS;
        if (this.combo >= 50) this.say(`${this.combo} COMBO 끊김!`, [255, 120, 120], 900);
        this.combo = 0;
        this.hurtFlashUntil = now + 260;
        this.num(p.x, p.y - 30, dmg, false, [255, 90, 90]);
        this.shake(6, 200); this.hitstop = Math.max(this.hitstop, 2);
        if (now - this.lastHurtSound > 120) { Sound.play("hurt", { vol: 0.6 }); this.lastHurtSound = now; }
        spawnHitSparks(this.particles, p.x, p.y, [255, 80, 80], now, 5);
        // 맞으면 주변 몬스터를 살짝 밀어내서 갇혀서 계속 맞는 일이 없게
        this.near(p.x, p.y, 80, e => { if (e.boss) return; const dx = e.x - p.x, dy = e.y - p.y, d = hypot(dx, dy) || 1; e.kx += dx / d * 7; e.ky += dy / d * 7; });
    }
    die() {
        this.over = true; this.overAt = this.now; this.won = false;
        Sound.playMusic(null); Sound.play("gameover", { vol: 0.7 });
        this.say("쓰러졌다...", [255, 90, 90], 2000);
        this.slowmoUntil = this.now + 500;
    }
    win() {
        this.over = true; this.overAt = this.now; this.won = true;
        for (const e of this.enemies) if (!e.dead) { spawnHitSparks(this.particles, e.x, e.y, [255, 255, 255], this.now, 2); e.dead = true; }
        this.flashUntil = this.now + 500; this.flashColor = [255, 255, 230];
        Sound.play("stage", { vol: 0.7 });
        this.say("생존 성공!", [140, 255, 160], 2500);
    }

    // ---------------- 몬스터 피해 ----------------
    hit(e, base, o) {
        if (e.dead) return false;
        o = o || {};
        const crit = !o.noCrit && Math.random() < this.critChance;
        const dmg = base * this.might * (crit ? 2.2 : 1) * (this.now < this.feverUntil ? 1.25 : 1);
        e.hp -= dmg;
        e.flashUntil = this.now + 90;
        this.dmgBy[o.wid || "?"] = (this.dmgBy[o.wid || "?"] || 0) + Math.min(dmg, dmg + e.hp);
        // 넉백 (보스는 안 밀림, 엘리트는 조금)
        if (!o.noKnock && !e.boss) {
            const k = (o.knock || 3) * (e.elite ? 0.25 : 1);
            let ux = o.dx, uy = o.dy;
            if (ux === undefined) { const dx = e.x - this.p.x, dy = e.y - this.p.y, d = hypot(dx, dy) || 1; ux = dx / d; uy = dy / d; }
            e.kx += ux * k; e.ky += uy * k;
        }
        // 숫자 (자잘한 피해는 모아서)
        e.popAcc += dmg;
        if (crit || this.now >= e.popNext || e.hp <= 0) { this.num(e.x, e.y - e.r - 6, e.popAcc, crit, o.color); e.popAcc = 0; e.popNext = this.now + 120; }
        if (crit) { spawnHitSparks(this.particles, e.x, e.y, [255, 230, 140], this.now, 3, true); Sound.play("crit", { vol: 0.35, gap: 70 }); }
        else Sound.play(choice(["hit1", "hit2", "hit3"]), { vol: 0.22, gap: 40 });
        if (e.hp <= 0) this.kill(e);
        return true;
    }
    kill(e, silent) {
        if (e.dead) return;
        e.dead = true;
        const now = this.now;
        this.kills++;
        this.combo++;                     // 콤보 = 맞지 않고 연속으로 잡은 수
        this.comboAt = now; this.maxCombo = Math.max(this.maxCombo, this.combo);
        if (this.combo % 250 === 0) { this.say(`${this.combo} 노히트 콤보!`, [255, 200, 90], 1100); Sound.play("powerup", { vol: 0.4, rate: 1.2 }); }
        this.killTimes.push(now);
        while (this.killTimes.length && now - this.killTimes[0] > 2500) this.killTimes.shift();
        // 피버: 2.5초에 40마리 이상
        if (this.killTimes.length >= 40 && now >= this.feverReadyAt && !this.feverUntil) {
            this.feverUntil = now + 6000; this.feverReadyAt = now + 25000; this.recalc();
            this.say("🔥 FEVER! 공격속도 UP", [255, 150, 60], 1600); Sound.play("phase", { vol: 0.55 });
            this.flashUntil = now + 200; this.flashColor = [255, 160, 60];
        }
        if (this.kills % 100 === 0) { this.say(`${this.kills} KILL!`, [120, 220, 255], 1100); Sound.play("clear", { vol: 0.5 }); }
        // 터지는 연출
        const col = e.elite ? e.eliteColor : e.boss ? [255, 200, 120] : [255, 245, 230];
        spawnHitSparks(this.particles, e.x, e.y, col, now, e.boss ? 14 : e.elite ? 8 : 3);
        if (this.fx.length < 70 && this.onScreen(e, 0)) this.addFx({ kind: "anim", sheet: "smoke", x: e.x, y: e.y, scale: e.r / 9, dur: 380 });
        if (!silent) Sound.play("kill", { vol: 0.32, gap: 35, rate: 1 + Math.min(0.5, this.combo * 0.004) });
        // 보석 / 아이템
        if (e.boss) {
            for (let i = 0; i < 26; i++) this.dropGem(e.x + uniform(-50, 50), e.y + uniform(-50, 50), 10);
            this.pickups.push({ kind: "chest", x: e.x, y: e.y, born: now, big: true });
            this.slowmoUntil = now + 1200; this.shake(14, 700);
            for (let k = 0; k < 6; k++) setTimeoutGame(this, k * 120, () => this.explode(e.x + uniform(-40, 40), e.y + uniform(-40, 40), 50));
            this.say(`${e.name} 처치!`, [255, 220, 120], 1800);
            Sound.play("stage", { vol: 0.6 });
        } else if (e.elite) {
            this.pickups.push({ kind: "chest", x: e.x, y: e.y, born: now });
            for (let i = 0; i < 6; i++) this.dropGem(e.x + uniform(-30, 30), e.y + uniform(-30, 30), 5);
            this.hitstop = Math.max(this.hitstop, 5); this.shake(8, 300);
            this.explode(e.x, e.y, 50, e.eliteColor);
        } else {
            if (e.xp) this.dropGem(e.x, e.y, e.xp);
            const r = Math.random();
            if (r < 0.0035) this.pickups.push({ kind: "heal", x: e.x, y: e.y, born: now });
            else if (r < 0.0055) this.pickups.push({ kind: "magnet", x: e.x, y: e.y, born: now });
            else if (r < 0.0068) this.pickups.push({ kind: "bomb", x: e.x, y: e.y, born: now });
            if (this.hitstop === 0 && this.combo % 25 === 0) this.hitstop = 1;
        }
    }
    dropGem(x, y, v) {
        // 보석이 너무 많으면 가까운 보석에 합친다 (빨간 큰 보석)
        if (this.gems.length >= SV.GEM_CAP) { const g = this.gems[randInt(0, this.gems.length - 1)]; g.v += v; return; }
        const a = uniform(0, 6.28), s = uniform(0.8, 2.2);
        this.gems.push({ x, y, v, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, hop: 1, mag: false, born: this.now });
    }

    // ---------------- 무기 ----------------
    updateWeapons(now) {
        const p = this.p;
        for (const w of this.weapons) {
            const s = this.wst(w);
            switch (w.id) {
                case "orbit": this.orbitTick(w, s, now); break;
                case "aura": this.auraTick(w, s, now); break;
                default:
                    if (now < w.next) break;
                    if (this.fire(w, s, now)) w.next = now + s.cd * this.cdMul;
                    else w.next = now + 120;
            }
        }
    }
    fire(w, s, now) {
        const p = this.p, A = this.area;
        switch (w.id) {
            case "gun": {
                const t = this.nearest(p.x, p.y, 560);
                if (!t) return false;
                const base = Math.atan2(t.y - p.y, t.x - p.x);
                for (let i = 0; i < s.count; i++) {
                    const a = base + (i - (s.count - 1) / 2) * 0.13;
                    this.proj.push({ kind: "bullet", wid: "gun", x: p.x, y: p.y, vx: Math.cos(a) * 9.5, vy: Math.sin(a) * 9.5, r: 6 * Math.sqrt(A), dmg: s.dmg, pierce: s.pierce, life: 1300, t0: now, hitSet: new Set(), knock: s.knock, evo: w.evo });
                }
                this.particles.push(new FxParticle({ img: "muzzle_02", x: p.x + Math.cos(base) * 18, y: p.y + Math.sin(base) * 18, color: [255, 230, 150], size: 24, life: 90, t0: now, rot: base + Math.PI / 2 }));
                Sound.play("shoot", { vol: 0.1, gap: 80 });
                return true;
            }
            case "whip": {
                // 가장 가까운 적 쪽으로 벤다 (2레벨부터 반대쪽도, 각성하면 네 방향)
                const t = this.nearest(p.x, p.y, s.len * this.area * 1.4);
                const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facingY, p.facingX || p.lastDx);
                const n = s.four ? 4 : s.both ? 2 : 1;
                const dirs = Array.from({ length: n }, (_, i) => [Math.cos(base + i * Math.PI * 2 / n), Math.sin(base + i * Math.PI * 2 / n)]);
                dirs.forEach(([dx, dy], i) => setTimeoutGame(this, i * 110, () => this.slash(dx, dy, s, A)));
                return true;
            }
            case "lightning": {
                const cands = this.enemies.filter(e => !e.dead && this.onScreen(e, -20));
                if (!cands.length) return false;
                const n = Math.min(s.count, cands.length);
                for (let i = 0; i < n; i++) {
                    const t = choice(cands);
                    setTimeoutGame(this, i * 70, () => this.bolt(t.x, t.y, s, A, s.chain));
                }
                Sound.play("sk_light", { vol: 0.4, gap: 120 });
                return true;
            }
            case "missile": {
                if (!this.nearest(p.x, p.y, 600)) return false;
                for (let i = 0; i < s.count; i++) {
                    const a = uniform(0, 6.28);
                    setTimeoutGame(this, i * 60, () => this.proj.push({ kind: "missile", wid: "missile", x: this.p.x, y: this.p.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 7, dmg: s.dmg, boom: s.boom * A, life: 2600, t0: this.now, knock: s.knock }));
                }
                Sound.play("sk_dark", { vol: 0.35, gap: 150 });
                return true;
            }
            case "nova": {
                if (!this.nearest(p.x, p.y, s.rad * A)) return false;
                const R = s.rad * A;
                this.addFx({ kind: "nova", x: p.x, y: p.y, r: R, dur: 420 });
                this.near(p.x, p.y, R, e => {
                    if (hypot(e.x - p.x, e.y - p.y) > R + e.r) return;
                    e.slowUntil = this.now + 1600; e.slowPct = s.slow;
                    if (s.freeze) e.stunUntil = this.now + (e.boss ? 300 : 900);
                    this.hit(e, s.dmg, { wid: "nova", knock: s.knock, color: [170, 230, 255] });
                });
                Sound.play("sk_ice", { vol: 0.45 }); this.shake(3);
                return true;
            }
            case "meteor": {
                const cands = this.enemies.filter(e => !e.dead && this.onScreen(e, -40));
                if (!cands.length) return false;
                for (let i = 0; i < s.count; i++) {
                    const t = choice(cands), x = t.x + uniform(-20, 20), y = t.y + uniform(-20, 20), R = s.rad * A;
                    const delay = 380 + i * 90;
                    this.addFx({ kind: "meteor", x, y, r: R, dur: delay });
                    setTimeoutGame(this, delay, () => {
                        this.addFx({ kind: "anim", sheet: "explosion", x, y, scale: Math.min(4.5, R / 17 * 0.75), alpha: 0.8, dur: 420 });
                        spawnDebris(this.particles, x, y, [150, 110, 80], this.now, 4);
                        this.near(x, y, R, e => { if (hypot(e.x - x, e.y - y) <= R + e.r) { const d = hypot(e.x - x, e.y - y) || 1; this.hit(e, s.dmg, { wid: "meteor", knock: s.knock, dx: (e.x - x) / d, dy: (e.y - y) / d, color: [255, 180, 90] }); } });
                        Sound.play("explode", { vol: 0.4, gap: 70 }); this.shake(5);
                    });
                }
                return true;
            }
            case "boomer": {
                const t = this.nearest(p.x, p.y, 520);
                const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facingY, p.facingX);
                for (let i = 0; i < s.count; i++) {
                    const a = base + (i - (s.count - 1) / 2) * 0.5;
                    this.proj.push({ kind: "boomer", wid: "boomer", x: p.x, y: p.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, r: s.size * Math.sqrt(A), dmg: s.dmg, dist: s.dist * A, trav: 0, back: false, life: 4000, t0: now, knock: s.knock, spin: 0 });
                }
                Sound.play("sk_light", { vol: 0.3, gap: 120, rate: 1.3 });
                return true;
            }
        }
        return false;
    }
    slash(dx, dy, s, A) {
        const p = this.p, len = s.len * A, wid = s.wid * A;
        const ang = Math.atan2(dy, dx), cx = p.x + dx * len / 2, cy = p.y + dy * len / 2;
        this.addFx({ kind: "slash", x: cx, y: cy, ang, len, wid, dur: 200 });
        Sound.play("sk_none", { vol: 0.35, gap: 60 });
        let hits = 0;
        this.near(cx, cy, len / 2 + wid, e => {
            const rx = e.x - p.x, ry = e.y - p.y, along = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
            if (along > -10 && along < len + e.r && side < wid / 2 + e.r) { this.hit(e, s.dmg, { wid: "whip", knock: s.knock, dx, dy }); hits++; }
        });
        if (hits >= 3) this.shake(2);
    }
    bolt(x, y, s, A, chain) {
        const R = s.rad * A;
        const pts = [[x + uniform(-30, 30), y - 300]];
        for (let k = 1; k < 6; k++) pts.push([x + uniform(-14, 14), y - 300 + k * 50]);
        pts.push([x, y]);
        this.addFx({ kind: "bolt", x, y, r: R, dur: 240, pts });
        this.near(x, y, R, e => { if (hypot(e.x - x, e.y - y) <= R + e.r) this.hit(e, s.dmg, { wid: "lightning", knock: s.knock, color: [255, 240, 140] }); });
        if (chain > 0) {
            const n = this.nearest(x, y, 200);
            if (n) setTimeoutGame(this, 80, () => this.bolt(n.x, n.y, s, A, chain - 1));
        }
    }
    orbitTick(w, s, now) {
        const p = this.p, A = this.area;
        w.ang += s.spin;
        const rings = s.ring2 ? [[s.rad * A, 1], [s.rad * A * 1.6, -1]] : [[s.rad * A, 1]];
        w.blades = [];
        for (const [rad, dir] of rings) {
            for (let i = 0; i < s.count; i++) {
                const a = w.ang * dir + i * Math.PI * 2 / s.count;
                const bx = p.x + Math.cos(a) * rad, by = p.y + Math.sin(a) * rad;
                w.blades.push([bx, by, a]);
                this.near(bx, by, s.size, e => {
                    if (now < e.hitOrbit || hypot(e.x - bx, e.y - by) > s.size + e.r) return;
                    e.hitOrbit = now + 380;
                    this.hit(e, s.dmg, { wid: "orbit", knock: s.knock });
                });
            }
        }
    }
    auraTick(w, s, now) {
        w.rad = s.rad * this.area;
        if (now < w.next) return;
        w.next = now + s.tick * this.cdMul;
        const p = this.p;
        this.near(p.x, p.y, w.rad, e => {
            if (hypot(e.x - p.x, e.y - p.y) > w.rad + e.r) return;
            this.hit(e, s.dmg, { wid: "aura", knock: s.knock, noCrit: false, color: [255, 160, 90] });
            if (s.burn) { e.dotUntil = now + 2000; e.dotDmg = s.dmg * 0.6; if (!e.dotNext || e.dotNext < now) e.dotNext = now + 500; }
        });
    }

    updateProjectiles(now) {
        const p = this.p;
        for (const b of this.proj) {
            if (b.dead) continue;
            if (now - b.t0 > b.life) { b.dead = true; continue; }
            if (b.kind === "missile") {
                const t = this.nearest(b.x, b.y, 500);
                if (t && now - b.t0 > 150) {
                    const [ux, uy] = [t.x - b.x, t.y - b.y], d = hypot(ux, uy) || 1;
                    b.vx += (ux / d * 7 - b.vx) * 0.12; b.vy += (uy / d * 7 - b.vy) * 0.12;
                }
            } else if (b.kind === "boomer") {
                b.spin += 0.4;
                b.trav += hypot(b.vx, b.vy);
                if (!b.back && b.trav >= b.dist) { b.back = true; b.hitAt = new Map(); }
                if (b.back) {
                    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) || 1;
                    b.vx += (dx / d * 9 - b.vx) * 0.15; b.vy += (dy / d * 9 - b.vy) * 0.15;
                    if (d < 20) { b.dead = true; continue; }
                }
            }
            b.x += b.vx; b.y += b.vy;
            if (Opts.high && this.frame % 2 === 0 && b.kind !== "bullet") this.particles.push(new FxParticle({ img: "circle_05", x: b.x, y: b.y, color: b.kind === "missile" ? [190, 120, 255] : [255, 240, 180], size: b.r * 1.6, life: 220, t0: now, alpha: 0.5 }));
            this.near(b.x, b.y, b.r, e => {
                if (b.dead) return false;
                if (hypot(e.x - b.x, e.y - b.y) > b.r + e.r) return;
                if (b.kind === "bullet") {
                    if (b.hitSet.has(e)) return;
                    b.hitSet.add(e);
                    this.hit(e, b.dmg, { wid: b.wid, knock: b.knock, dx: b.vx / 9.5, dy: b.vy / 9.5 });
                    spawnHitSparks(this.particles, b.x, b.y, [255, 230, 150], now, 2);
                    if (b.evo) this.near(b.x, b.y, 40, o => { if (o !== e && hypot(o.x - b.x, o.y - b.y) < 40 + o.r) this.hit(o, b.dmg * 0.5, { wid: "gun", noKnock: true }); });
                    if (b.pierce-- <= 0) { b.dead = true; return false; }
                } else if (b.kind === "missile") {
                    b.dead = true;
                    this.addFx({ kind: "anim", sheet: "explosion", x: b.x, y: b.y, scale: Math.min(4.5, b.boom / 20 * 0.75), alpha: 0.8, dur: 380 });
                    this.near(b.x, b.y, b.boom, o => { if (hypot(o.x - b.x, o.y - b.y) <= b.boom + o.r) this.hit(o, b.dmg, { wid: "missile", knock: b.knock, color: [210, 150, 255] }); });
                    Sound.play("explode2", { vol: 0.25, gap: 70 });
                    return false;
                } else if (b.kind === "boomer") {
                    if (now < (e.hitBoom || 0)) return;
                    e.hitBoom = now + 300;
                    this.hit(e, b.dmg, { wid: "boomer", knock: b.knock, dx: b.vx / 8, dy: b.vy / 8, color: [255, 245, 190] });
                }
            });
        }
        this.proj = this.proj.filter(b => !b.dead);
        // 늦게 실행되는 일 (연속 공격 등)
        if (this.timers && this.timers.length) {
            const due = this.timers.filter(t => this.now >= t.at);
            if (due.length) { this.timers = this.timers.filter(t => this.now < t.at); for (const t of due) t.fn(); }
        }
    }
    updateEnemyBullets(now) {
        const p = this.p;
        for (const b of this.ebul) {
            b.x += b.vx; b.y += b.vy;
            if (now - b.t0 > b.life) b.dead = true;
            else if (hypot(b.x - p.x, b.y - p.y) < b.r + p.radius * 0.7) { this.hurt(b.dmg); b.dead = true; }
        }
        this.ebul = this.ebul.filter(b => !b.dead);
    }
    updateTelegraphs(now) {
        const p = this.p;
        for (const t of this.tele) {
            if (t.owner && t.owner.dead) { t.dead = true; continue; }
            if (now >= t.until) t.dead = true;
        }
        this.tele = this.tele.filter(t => !t.dead);
    }

    // ---------------- 보석 / 아이템 ----------------
    updateGems(now) {
        const p = this.p, M = this.magnet;
        for (const g of this.gems) {
            if (g.hop > 0) { g.x += g.vx; g.y += g.vy; g.vy += 0.15; g.vx *= 0.9; g.hop -= 0.04; }
            const dx = p.x - g.x, dy = p.y - g.y, d = hypot(dx, dy);
            if (g.mag || d < M) {
                g.mag = true;
                g.sp = Math.min(16, (g.sp || 2) + 0.55);
                g.x += dx / (d || 1) * Math.min(d, g.sp); g.y += dy / (d || 1) * Math.min(d, g.sp);
            }
            if (d < p.radius + 6) {
                g.dead = true;
                this.gainXp(g.v);
                if (now - this.gemChainAt < 450) this.gemChain++; else this.gemChain = 0;
                this.gemChainAt = now;
                Sound.play("select", { vol: 0.18, gap: 28, jitter: 0, rate: 1.1 + Math.min(1.3, this.gemChain * 0.035) });
                if (Opts.high && this.particles.length < 200) this.particles.push(new FxParticle({ img: "star_07", x: p.x + uniform(-8, 8), y: p.y + uniform(-8, 8), color: this.gemColor(g.v), size: 14, life: 200, t0: now }));
            }
        }
        this.gems = this.gems.filter(g => !g.dead);
    }
    gemColor(v) { return v >= 10 ? [255, 80, 100] : v >= 5 ? [110, 255, 140] : v >= 2 ? [120, 220, 255] : [90, 160, 255]; }
    gainXp(v) {
        this.xp += v * (1 + 0.0 * 0);
        while (this.xp >= svNeedXp(this.level + this.pendingLevels)) { this.xp -= svNeedXp(this.level + this.pendingLevels); this.pendingLevels++; }
    }
    updatePickups(now) {
        const p = this.p;
        for (const it of this.pickups) {
            const d = hypot(p.x - it.x, p.y - it.y);
            if (d < 120 && it.kind !== "chest") { it.x += (p.x - it.x) * 0.08; it.y += (p.y - it.y) * 0.08; }
            if (d > p.radius + 18) continue;
            it.dead = true;
            if (it.kind === "heal") {
                const a = Math.min(p.maxHp - p.hp, 30); p.hp += a;
                this.num(p.x, p.y - 34, a, false, [120, 255, 140]); Sound.play("heal", { vol: 0.5 });
                spawnHitSparks(this.particles, p.x, p.y, [120, 255, 140], now, 8);
            } else if (it.kind === "magnet") {
                for (const g of this.gems) g.mag = true;
                this.say("자석! 보석이 몰려온다", [120, 200, 255]); Sound.play("powerup", { vol: 0.5, rate: 1.3 });
            } else if (it.kind === "bomb") {
                this.flashUntil = now + 350; this.flashColor = [255, 255, 255];
                this.hitstop = 6; this.shake(16, 600);
                for (const e of this.enemies) if (!e.dead && this.onScreen(e, 40)) {
                    if (e.boss || e.elite) this.hit(e, e.maxHp * (e.boss ? 0.08 : 0.4) / this.might, { wid: "bomb", noCrit: true });
                    else { this.dmgBy.bomb = (this.dmgBy.bomb || 0) + e.hp; this.kill(e, true); }
                }
                Sound.play("explode", { vol: 0.8, gap: 0 }); Sound.play("boom", { vol: 0.6, gap: 0 });
                this.say("폭탄! 화면 정리", [255, 220, 120]);
            } else if (it.kind === "chest") this.openChest(it.big);
        }
        this.pickups = this.pickups.filter(it => !it.dead);
    }

    // =============================================================
    // 레벨업: 문제 1개 -> 강화 고르기
    // =============================================================
    openLevelUp() {
        const p = this.p, now = this.now;
        this.pendingLevels--; this.level++;
        // 레벨업 충격파: 주변 몬스터를 밀어내며 금빛 고리
        this.addFx({ kind: "kp", img: "circle_03", x: p.x, y: p.y, size: 60, grow: 5, color: [255, 220, 120], dur: 420 });
        this.near(p.x, p.y, 150, e => { const dx = e.x - p.x, dy = e.y - p.y, d = hypot(dx, dy) || 1; if (!e.boss) { e.kx += dx / d * 12; e.ky += dy / d * 12; } });
        spawnHitSparks(this.particles, p.x, p.y, [255, 230, 140], now, 12, true);
        Sound.play("powerup", { vol: 0.6 });
        this.flashUntil = now + 160; this.flashColor = [255, 230, 150];
        Input.releaseJoystick();
        const probs = Problems.loadWithReviews ? Problems.loadWithReviews() : [];
        if (!probs.length) { this.openPick(true); return; }
        const [qs, flags] = pickQuizQuestions(probs, 1);
        const prob = qs[0];
        if (prob) { quizImage(prob._qimg); quizImage(prob._eimg); }
        this.ui = { kind: "quiz", phase: "answering", prob, flag: flags[0], selected: null, pressed: null, pressedUntil: 0,
                    start: performance.now(), openedAt: performance.now(), zoomTargets: [] };
    }
    quizSelect(c) { const q = this.ui; if (!q || q.kind !== "quiz" || q.phase !== "answering") return; q.selected = c; q.pressed = c; q.pressedUntil = performance.now() + 120; Sound.play("select", { vol: 0.4, gap: 20 }); }
    quizSubmit() {
        const q = this.ui;
        if (!q || q.kind !== "quiz" || q.phase !== "answering" || q.selected === null) return;
        const prob = q.prob, ok = q.selected === prob.correct, sec = (performance.now() - q.start) / 1000;
        this.quiz.asked++;
        if (ok) { this.quiz.right++; this.quiz.streak++; } else { this.quiz.streak = 0; saveWrongAnswer(prob); }
        const [quality, tier] = computeSm2Quality(ok, sec);
        if (q.flag) {
            const next = applySm2Review(prob.review || defaultReviewState(), quality);
            const early = !!next.early; delete next.early;
            prob.review = next; saveReviewState([prob]);
            q.reviewInfo = { elapsedSec: sec, tier, interval: next.interval, early, due: next.due || "" };
        } else q.reviewInfo = { elapsedSec: sec, tier, practice: true };
        q.phase = "result"; q.ok = ok; q.phaseAt = performance.now();
        Sound.play(ok ? "correct" : "wrong", { vol: 0.6, gap: 0, jitter: 0 });
        if (ok && this.quiz.streak >= 3) Sound.play("powerup", { vol: 0.35, rate: 1.4 });
    }
    quizNext() {
        const q = this.ui;
        if (!q || q.kind !== "quiz" || q.phase !== "result" || performance.now() - q.phaseAt < 300) return;
        this.openPick(q.ok);
    }
    // 고를 수 있는 강화 목록
    upgradePool() {
        const out = [];
        for (const w of this.weapons) {
            if (w.lv < 5) out.push({ type: "weapon", id: w.id, w: 3 });
            else if (!w.evo) out.push({ type: "evo", id: w.id, w: 5 });
        }
        if (this.weapons.length < SV.MAX_WEAPONS) for (const id of Object.keys(SV_WEAPONS)) if (!this.weapon(id)) out.push({ type: "weapon", id, w: 1.6 });
        for (const [id, d] of Object.entries(SV_PASSIVES)) if (this.pl(id) < (d.max || SV_PASSIVE_MAX)) out.push({ type: "passive", id, w: 1.3 });
        return out;
    }
    rollOptions(n) {
        let pool = this.upgradePool();
        const out = [];
        while (out.length < n && pool.length) {
            const o = weightedChoice(pool, pool.map(x => x.w));
            out.push(o); pool = pool.filter(x => x !== o);
        }
        while (out.length < n) out.push(out.length % 2 ? { type: "gold" } : { type: "heal" });
        return out;
    }
    openPick(correct) {
        const n = correct ? (this.quiz.streak >= 3 ? 4 : 3) : 2;
        this.ui = { kind: "pick", options: this.rollOptions(n), sel: null, openedAt: performance.now(), correct, streak: this.quiz.streak };
    }
    applyOption(o) {
        const p = this.p;
        if (o.type === "weapon") { const w = this.weapon(o.id); if (w) w.lv++; else this.addWeapon(o.id); }
        else if (o.type === "evo") { const w = this.weapon(o.id); w.evo = true; this.say(`각성! ${SV_EVO_NAME[o.id]}`, [255, 215, 90], 1600); this.flashUntil = this.now + 300; this.flashColor = [255, 220, 120]; }
        else if (o.type === "passive") this.passives[o.id] = this.pl(o.id) + 1;
        else if (o.type === "heal") p.hp = Math.min(p.maxHp, p.hp + 40);
        else if (o.type === "gold") this.bonusScore = (this.bonusScore || 0) + 300;
        this.recalc();
    }
    pickSelect(i) {
        const u = this.ui;
        if (!u || u.kind !== "pick" || i < 0 || i >= u.options.length || performance.now() - u.openedAt < 280) return;
        this.applyOption(u.options[i]);
        Sound.play("pickup", { vol: 0.55 });
        spawnHitSparks(this.particles, this.p.x, this.p.y, [255, 230, 140], this.now, 10, true);
        this.ui = null;
        Input.releaseJoystick();
    }
    openChest(big) {
        const n = big ? 3 : (Math.random() < 0.25 ? 3 : 1);
        const items = this.rollOptions(n);
        for (const o of items) this.applyOption(o);
        this.ui = { kind: "chest", items, openedAt: performance.now(), big };
        Sound.play("pickup", { vol: 0.7 }); Sound.play("clear", { vol: 0.5 });
        Input.releaseJoystick();
    }
    updateUi() {
        const u = this.ui;
        if (u.kind === "quiz" && u.pressed && performance.now() >= u.pressedUntil) u.pressed = null;
    }

    // ---------------- 입력 ----------------
    wantsTaps() { return !!this.ui && !this.paused; }
    onTap(x, y) {
        const u = this.ui;
        if (!u) return;
        if (u.kind === "quiz") {
            for (const t of (u.phase === "answering" || u.phase === "result") && u.zoomTargets || []) {
                if (inRect(x, y, t.rect, 4)) { ZoomView.open(t.src, () => { if (this.ui) this.ui.phaseAt = performance.now(); }); return; }
            }
            if (u.phase === "answering") {
                if (inRect(x, y, QUIZ_O_RECT, 12)) this.quizSelect("O");
                else if (inRect(x, y, QUIZ_X_RECT, 12)) this.quizSelect("X");
                else if (inRect(x, y, QUIZ_SUBMIT_RECT, 12)) this.quizSubmit();
            } else this.quizNext();
        } else if (u.kind === "pick") {
            const rects = svPickRects(u.options.length);
            rects.forEach((r, i) => { if (inRect(x, y, r, 6)) this.pickSelect(i); });
        } else if (u.kind === "chest") {
            if (performance.now() - u.openedAt > 700) this.ui = null;
        }
    }
    onKey(code) {
        if (code === "Escape" || code === "KeyP") { if (!this.over) this.setPaused(!this.paused); return; }
        if (this.paused) return;
        const u = this.ui, enter = code === "Enter" || code === "NumpadEnter" || code === "Space";
        if (!u) return;
        if (u.kind === "quiz") {
            if (code === "KeyZ") { const src = u.phase === "result" ? (u.prob._eimg || u.prob._qimg) : u.prob._qimg; if (src) ZoomView.open(src, () => {}); return; }
            if (u.phase === "answering") {
                if (code === "ArrowLeft" || code === "KeyA" || code === "KeyO") this.quizSelect("O");
                else if (code === "ArrowRight" || code === "KeyD" || code === "KeyX") this.quizSelect("X");
                else if (enter) this.quizSubmit();
            } else if (enter) this.quizNext();
        } else if (u.kind === "pick") {
            if (/^Digit[1-4]$/.test(code)) this.pickSelect(Number(code.slice(5)) - 1);
        } else if (u.kind === "chest" && enter) { if (performance.now() - u.openedAt > 700) this.ui = null; }
    }
    setPaused(v) { if (this.over) return; this.paused = v; Input.releaseJoystick(); if (this.onPauseChange) this.onPauseChange(v); }

    result() {
        const score = Math.round(this.kills * 10 + this.level * 50 + this.now / 1000 * 5 + this.quiz.right * 100 + (this.won ? 3000 : 0) + (this.bonusScore || 0));
        return { won: this.won, timeMs: Math.min(this.now, SV.RUN_MS), kills: this.kills, level: this.level, score, quiz: this.quiz, maxCombo: this.maxCombo, dmgBy: this.dmgBy, weapons: this.weapons };
    }
}
// 게임 시간 기준으로 나중에 실행
function setTimeoutGame(g, ms, fn) { (g.timers || (g.timers = [])).push({ at: g.now + ms, fn }); }

// =============================================================
// 그리기
// =============================================================
function svPickRects(n) {
    const W = n >= 4 ? 196 : 236, H = 300, gap = 16, total = n * W + (n - 1) * gap, x0 = SCREEN_W / 2 - total / 2;
    return Array.from({ length: n }, (_, i) => [x0 + i * (W + gap), 190, W, H]);
}
function svOptionInfo(g, o) {
    if (o.type === "weapon") {
        const d = SV_WEAPONS[o.id], w = g.weapon(o.id), lv = w ? w.lv + 1 : 1;
        return { title: d.name, tag: w ? `Lv ${w.lv} → ${lv}` : "NEW 무기!", desc: d.desc(lv), color: d.color, icon: d.icon, isNew: !w };
    }
    if (o.type === "evo") {
        const d = SV_WEAPONS[o.id];
        return { title: SV_EVO_NAME[o.id], tag: "★ 각성 ★", desc: `${d.name}이(가) 각성해 크게 강해짐`, color: [255, 215, 90], icon: d.icon, evo: true };
    }
    if (o.type === "passive") {
        const d = SV_PASSIVES[o.id], lv = g.pl(o.id) + 1;
        return { title: d.name, tag: lv === 1 ? "NEW 능력!" : `Lv ${lv - 1} → ${lv}`, desc: d.desc, color: d.color, letter: d.tag, isNew: lv === 1 };
    }
    if (o.type === "heal") return { title: "고기", tag: "회복", desc: "체력 40 회복", color: [255, 140, 140], letter: "♥" };
    return { title: "보너스 점수", tag: "+300점", desc: "점수 300점", color: [255, 220, 120], letter: "$" };
}
function svDrawIcon(ctx, info, cx, cy, size, now) {
    R.circle(ctx, cx, cy, size / 2, rgb(info.color, 0.18));
    R.circle(ctx, cx, cy, size / 2, info.color, 2);
    if (info.icon && GFX.kp[info.icon]) drawKp(ctx, info.icon, cx, cy, size * 0.9, info.color, 1, info.evo ? now / 600 : 0, true);
    else R.text(ctx, info.letter || "?", cx, cy - size * 0.28, Math.round(size * 0.5), info.color, { align: "center", bold: true });
}
function svDrawPick(ctx, g, u, now, touch) {
    ctx.fillStyle = "rgba(8,8,16,0.78)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const title = u.correct ? (u.streak >= 3 ? `연속 정답 ${u.streak}! 강화를 하나 고르세요 (선택지 +1)` : "정답! 강화를 하나 고르세요")
                            : "오답... 2개 중에서 고르세요";
    R.text(ctx, `LEVEL ${g.level}`, SCREEN_W / 2, 96, 40, [255, 225, 110], { align: "center", bold: true, shadow: true });
    R.text(ctx, title, SCREEN_W / 2, 146, 18, u.correct ? [170, 255, 180] : [255, 160, 150], { align: "center", bold: true });
    const rects = svPickRects(u.options.length);
    u.options.forEach((o, i) => {
        const [x, y, w, h] = rects[i], info = svOptionInfo(g, o);
        const pop = Math.min(1, (performance.now() - u.openedAt - i * 70) / 180);
        if (pop <= 0) return;
        ctx.save(); ctx.globalAlpha = pop; ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop); ctx.translate(-(x + w / 2), -(y + h / 2));
        if (info.evo) drawGlow(ctx, x + w / 2, y + h / 2, w * 0.8, [255, 200, 80], 0.5 + 0.2 * Math.sin(now / 150));
        R.rect(ctx, x, y, w, h, [26, 26, 40], 0, 14);
        R.rect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, info.evo ? [255, 215, 90] : info.color, info.evo ? 4 : 2, 14);
        svDrawIcon(ctx, info, x + w / 2, y + 74, 84, now);
        R.text(ctx, info.tag, x + w / 2, y + 128, 15, info.isNew ? [130, 255, 170] : info.evo ? [255, 215, 90] : [200, 200, 220], { align: "center", bold: true });
        R.text(ctx, info.title, x + w / 2, y + 154, 22, [255, 255, 255], { align: "center", bold: true });
        const lines = wrapTextLines(ctx, info.desc, w - 28, 15);
        lines.slice(0, 4).forEach((l, k) => R.text(ctx, l, x + w / 2, y + 196 + k * 22, 15, [215, 215, 230], { align: "center" }));
        R.text(ctx, touch ? "누르면 선택" : `${i + 1}번 키 / 클릭`, x + w / 2, y + h - 30, 12, [140, 140, 165], { align: "center" });
        ctx.restore();
    });
}
function svDrawChest(ctx, g, u, now) {
    const t = (performance.now() - u.openedAt) / 1000;
    ctx.fillStyle = "rgba(8,8,16,0.8)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // 빛줄기
    ctx.save(); ctx.translate(SCREEN_W / 2, 230); ctx.rotate(t * 0.8);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = `rgba(255,220,120,${0.08 + 0.04 * (i % 2)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -420); ctx.lineTo(30, -420); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    drawGlow(ctx, SCREEN_W / 2, 230, 140, [255, 210, 100], 0.7);
    R.text(ctx, u.big ? "보스의 보물 상자!" : "보물 상자!", SCREEN_W / 2, 90, 38, [255, 225, 110], { align: "center", bold: true, shadow: true });
    const n = u.items.length, W = 200, gap = 20, x0 = SCREEN_W / 2 - (n * W + (n - 1) * gap) / 2;
    u.items.forEach((o, i) => {
        const show = t - 0.25 - i * 0.35;
        if (show < 0) return;
        const k = Math.min(1, show / 0.2), info = svOptionInfo(g, o), x = x0 + i * (W + gap), y = 300;
        ctx.save(); ctx.globalAlpha = k;
        R.rect(ctx, x, y, W, 200, [30, 28, 40], 0, 12); R.rect(ctx, x + 1, y + 1, W - 2, 198, info.color, 2, 12);
        svDrawIcon(ctx, info, x + W / 2, y + 60, 70, now);
        R.text(ctx, info.tag, x + W / 2, y + 104, 14, [200, 220, 200], { align: "center", bold: true });
        R.text(ctx, info.title, x + W / 2, y + 128, 20, [255, 255, 255], { align: "center", bold: true });
        R.text(ctx, info.desc, x + W / 2, y + 160, 13, [210, 210, 225], { align: "center" });
        ctx.restore();
    });
    if (t > 0.7) R.text(ctx, "화면을 누르면 계속", SCREEN_W / 2, SCREEN_H - 70, 15, [180, 200, 220], { align: "center" });
}
function svDrawQuiz(ctx, g, q, now, touch) {
    ctx.fillStyle = "rgba(8,8,16,0.86)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    R.rect(ctx, 70, 52, SCREEN_W - 140, SCREEN_H - 104, [28, 28, 40], 0, 14);
    R.rect(ctx, 71, 53, SCREEN_W - 142, SCREEN_H - 106, [255, 210, 100], 2, 14);
    const cw = SCREEN_W - 200, cx = 100, prob = q.prob;
    const targets = q.zoomTargets = [];
    const image = (src, x, y, maxW, maxH) => {
        const r = drawQuizImage(ctx, src, x, y, maxW - QUIZ_ZOOM_BTN - 10, maxH);
        if (!r) return 20;
        const b = QUIZ_ZOOM_BTN, bx = r[0] + r[2] + 8 + b <= QUIZ_PANEL_RIGHT - 6 ? r[0] + r[2] + 8 : r[0] + r[2] - b - 4, by = r[1];
        drawZoomButton(ctx, bx, by, b);
        targets.push({ rect: r, src }, { rect: [bx, by, b, b], src });
        return r[3];
    };
    const lines = (arr, x, y, size, color, lh) => { for (const l of arr) { R.text(ctx, l, x, y, size, color); y += lh; } };
    R.text(ctx, `LEVEL UP!  문제를 맞히면 강화 선택지가 늘어나요` + (g.quiz.streak ? `   ·   연속 정답 ${g.quiz.streak}` : ""), SCREEN_W / 2, 74, 15, [255, 220, 120], { align: "center", bold: true });
    if (q.phase === "answering") {
        if (prob._qimg) image(prob._qimg, cx, 112, cw, 170);
        else lines(wrapTextLines(ctx, prob.question, cw, 20).slice(0, 6), cx, 112, 20, [240, 240, 245], 30);
        const choiceBox = (rect, label, sel, pressed) => {
            const [x, y, w, h] = rect, d = pressed ? 2 : 0;
            R.rect(ctx, x + d, y + d, w, h, sel ? [255, 220, 90] : [70, 70, 95], 0, 12);
            R.rect(ctx, x + 1.5 + d, y + 1.5 + d, w - 3, h - 3, [230, 230, 240], 3, 12);
            R.text(ctx, label, x + w / 2 + d, y + h / 2 - 26 + d, 44, sel ? [20, 20, 30] : [210, 210, 220], { bold: true, align: "center" });
        };
        choiceBox(QUIZ_O_RECT, "O", q.selected === "O", q.pressed === "O");
        choiceBox(QUIZ_X_RECT, "X", q.selected === "X", q.pressed === "X");
        const [sx, sy, sw, sh] = QUIZ_SUBMIT_RECT, on = q.selected !== null;
        R.rect(ctx, sx, sy, sw, sh, on ? [47, 125, 79] : [52, 52, 66], 0, 10);
        R.text(ctx, "확인", sx + sw / 2, sy + 13, 22, on ? [255, 255, 255] : [130, 130, 150], { bold: true, align: "center" });
        R.text(ctx, touch ? "O 또는 X를 누른 뒤 '확인'" : "←  O     →  X     Enter  제출     Z  이미지 크게", SCREEN_W / 2, SCREEN_H - 118, 14, [180, 200, 220], { align: "center" });
        return;
    }
    if (prob._qimg) image(prob._qimg, cx, 100, cw, 100);
    else lines(wrapTextLines(ctx, prob.question, cw, 18).slice(0, 4), cx, 100, 18, [215, 215, 225], 26);
    const right = q.ok, k = Math.min(1, (performance.now() - q.phaseAt) / 200);
    ctx.save(); ctx.translate(SCREEN_W / 2, 232); ctx.scale(0.7 + 0.3 * k + (right ? 0.08 * Math.sin(now / 90) * (1 - k) : 0), 0.7 + 0.3 * k);
    R.text(ctx, right ? `⭕ 정답!  (정답 ${prob.correct})` : `❌ 오답  (내 답 ${q.selected} → 정답 ${prob.correct})`, 0, -16, 26, right ? [120, 240, 130] : [250, 110, 110], { bold: true, align: "center" });
    ctx.restore();
    const info = q.reviewInfo;
    if (info) R.text(ctx, info.practice ? "랜덤 연습 문제 (복습 일정 그대로)" : info.early ? `복습일 전이라 일정 유지 (${info.due})` : `다음 복습까지 ${info.interval}일`, SCREEN_W / 2, 258, 13, [150, 175, 205], { align: "center" });
    const top = 284, areaH = SCREEN_H - 120 - top, lh = 26, size = 17;
    let exp = wrapTextLines(ctx, (prob.explanation || "").trim(), cw, size);
    if (prob._eimg) {
        exp = exp.slice(0, Math.max(0, Math.floor((areaH - 110) / lh)));
        const h = image(prob._eimg, cx, top, cw, areaH - (exp.length ? exp.length * lh + 8 : 0));
        lines(exp, cx, top + h + 8, size, [222, 222, 232], lh);
    } else lines(exp.slice(0, Math.floor(areaH / lh)), cx, top, size, [222, 222, 232], lh);
    R.text(ctx, (touch ? "화면을 누르면" : "Enter") + "  강화 고르기", SCREEN_W / 2, SCREEN_H - 92, 15, [255, 225, 130], { align: "center", bold: true });
}

// 화면 가장자리 어둡게 (미리 그려두기)
const _svVig = {};
function svVignette(col) {
    if (_svVig[col]) return _svVig[col];
    const c = document.createElement("canvas"); c.width = SCREEN_W; c.height = SCREEN_H;
    const x = c.getContext("2d"), vg = x.createRadialGradient(SV.CX, SV.CY, 180, SV.CX, SV.CY, 620);
    vg.addColorStop(0, `rgba(${col},0)`); vg.addColorStop(1, `rgba(${col},0.65)`);
    x.fillStyle = vg; x.fillRect(0, 0, SCREEN_W, SCREEN_H);
    return (_svVig[col] = c);
}
// 보석 그림 (미리 그려두기)
const _svGem = {};
function svGemSprite(v) {
    const k = v >= 10 ? 3 : v >= 5 ? 2 : v >= 2 ? 1 : 0;
    if (_svGem[k]) return _svGem[k];
    const s = [6, 6.5, 7.5, 9][k], c = document.createElement("canvas"); c.width = c.height = Math.ceil(s * 2 + 4);
    const x = c.getContext("2d"), m = c.width / 2;
    x.beginPath(); x.moveTo(m, m - s); x.lineTo(m + s * 0.7, m); x.lineTo(m, m + s); x.lineTo(m - s * 0.7, m); x.closePath();
    x.fillStyle = rgb(SurvivalGame.prototype.gemColor(v)); x.fill(); x.strokeStyle = "rgba(255,255,255,0.75)"; x.lineWidth = 1; x.stroke();
    x.fillStyle = "rgba(255,255,255,0.6)"; x.fillRect(m - 1.5, m - s * 0.5, 2, s * 0.5);
    return (_svGem[k] = c);
}
// 바닥 장식: 256px 칸마다 정해진 자리에 (항상 같은 자리에 보이게)
function svHash(x, y) { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return h; }
const SV_DECO = ["grass1", "grass2", "grass3", "pebbles", "grass1", "grass3", "rock", "pebbles"];

function svDraw(ctx, g, now, touch) {
    const p = g.p, cam = g.cam;
    ctx.save();
    // 흔들림
    if (now < g.shakeUntil) { const k = (g.shakeUntil - now) / g.shakeDur, m = g.shakeMag * k * k; ctx.translate(Math.sin(now * 0.09) * m, Math.cos(now * 0.11) * m); }
    const ox = SV.CX - cam.x, oy = SV.CY - cam.y;
    // ---- 바닥 ----
    const tile = GFX.tiles.field || GFX.tiles.floor_battle;
    ctx.imageSmoothingEnabled = false;
    if (tile) {
        const tw = tile.width * 2, th = tile.height * 2;
        const sx = ((ox % tw) + tw) % tw - tw, sy = ((oy % th) + th) % th - th;
        for (let y = sy; y < SCREEN_H; y += th) for (let x = sx; x < SCREEN_W; x += tw) ctx.drawImage(tile, x, y, tw, th);
    } else { ctx.fillStyle = "#262230"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    ctx.translate(ox, oy);
    // 장식
    const C = 256, cx0 = Math.floor((cam.x - SCREEN_W / 2) / C), cx1 = Math.floor((cam.x + SCREEN_W / 2) / C), cy0 = Math.floor((cam.y - SCREEN_H / 2) / C), cy1 = Math.floor((cam.y + SCREEN_H / 2) / C);
    for (let a = cx0; a <= cx1; a++) for (let b = cy0; b <= cy1; b++) {
        let h = svHash(a, b);
        for (let k = 0; k < 3; k++) {
            const img = GFX.tiles[SV_DECO[h % SV_DECO.length]]; h = svHash(h, k + 7);
            const x = a * C + (h % C), y = b * C + ((h >>> 8) % C); h = svHash(h, 3);
            if (img) { ctx.globalAlpha = 0.75; ctx.drawImage(img, x, y, 32, 32); ctx.globalAlpha = 1; }
        }
    }
    // ---- 보석 / 아이템 ----
    const vx0 = cam.x - SCREEN_W / 2 - 20, vx1 = cam.x + SCREEN_W / 2 + 20, vy0 = cam.y - SCREEN_H / 2 - 20, vy1 = cam.y + SCREEN_H / 2 + 20;
    for (const gm of g.gems) {
        if (gm.x < vx0 || gm.x > vx1 || gm.y < vy0 || gm.y > vy1) continue;
        const img = svGemSprite(gm.v), bob = Math.sin(now / 200 + gm.x) * 1.5;
        ctx.drawImage(img, gm.x - img.width / 2, gm.y - img.height / 2 + bob);
    }
    for (const it of g.pickups) {
        const bob = Math.sin(now / 180) * 3;
        if (it.kind === "chest") {
            drawGlow(ctx, it.x, it.y, 46, [255, 210, 90], 0.6);
            R.rect(ctx, it.x - 16, it.y - 12 + bob, 32, 24, [150, 90, 40], 0, 4); R.rect(ctx, it.x - 16, it.y - 12 + bob, 32, 9, [200, 130, 50], 0, 4);
            R.rect(ctx, it.x - 4, it.y - 4 + bob, 8, 8, [255, 215, 90], 0, 2); R.rect(ctx, it.x - 16, it.y - 12 + bob, 32, 24, [255, 215, 90], 2, 4);
        } else {
            const col = it.kind === "heal" ? [255, 120, 120] : it.kind === "magnet" ? [120, 200, 255] : [255, 200, 90];
            drawGlow(ctx, it.x, it.y, 28, col, 0.5);
            R.circle(ctx, it.x, it.y + bob, 12, [30, 30, 40]); R.circle(ctx, it.x, it.y + bob, 12, col, 2);
            R.text(ctx, it.kind === "heal" ? "♥" : it.kind === "magnet" ? "U" : "✸", it.x, it.y - 9 + bob, 15, col, { align: "center", bold: true });
        }
    }
    // ---- 예고 ----
    for (const t of g.tele) {
        const k = clamp((now - t.t0) / (t.until - t.t0), 0, 1);
        if (t.kind === "circle") { R.circle(ctx, t.x, t.y, t.r, rgb([255, 60, 40], 0.15 + 0.2 * k)); R.circle(ctx, t.x, t.y, t.r * k, rgb([255, 80, 60], 0.3)); R.circle(ctx, t.x, t.y, t.r, [255, 90, 70], 2); }
        else { const poly = _linePoly(t.x, t.y, t.x2, t.y2, t.w); R.poly(ctx, poly, rgb([255, 60, 40], 0.18 + 0.2 * k)); R.poly(ctx, poly, [255, 90, 70], 2); }
    }
    // ---- 화염 고리 ----
    const aura = g.weapon("aura");
    if (aura && aura.rad) {
        const r = aura.rad, a = 0.16 + 0.05 * Math.sin(now / 120);
        const gr = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,120,40,0)`); gr.addColorStop(1, `rgba(255,${aura.evo ? 70 : 120},40,${a * 2})`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        R.circle(ctx, p.x, p.y, r, rgb([255, 150, 70], 0.5), 2);
    }
    // ---- 몬스터 ----
    const hi = Opts.high;
    const vis = [];
    for (const e of g.enemies) if (e.x > vx0 - 40 && e.x < vx1 + 40 && e.y > vy0 - 40 && e.y < vy1 + 40) vis.push(e);
    if (hi) {
        ctx.beginPath();
        for (const e of vis) { const sy = e.y + e.r * 0.85; ctx.moveTo(e.x + e.r * 0.85, sy); ctx.ellipse(e.x, sy, e.r * 0.85, e.r * 0.3, 0, 0, Math.PI * 2); }
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    vis.sort((a, b) => a.y - b.y);
    for (const e of vis) {
        const flash = now < e.flashUntil, sq = flash ? 1.15 : 1;
        if (e.boss) {
            const fr = (() => { const b = GFX.boss[e.bossKey]; if (!b) return null; const fs = (e.state === "dash" ? b.move : b.move || b.idle) || b.idle; return fs && fs[Math.floor(now / 120) % fs.length]; })();
            if (e.hp < e.maxHp * 0.5) drawGlow(ctx, e.x, e.y, 90, [255, 60, 30], 0.4);
            if (fr) { const h = e.r * 3.2, w = h * fr.width / fr.height; drawPixel(ctx, tintSprite(fr, e.hp < e.maxHp * 0.5 ? [255, 60, 30] : null, flash), e.x, e.y - e.r * 0.3, w * sq, h / sq, p.x < e.x); }
            else R.circle(ctx, e.x, e.y, e.r, flash ? [255, 255, 255] : [235, 165, 30]);
            continue;
        }
        const dirs = GFX.mon[e.sprite];
        if (e.elite) drawGlow(ctx, e.x, e.y, e.r * 2.4, e.eliteColor, 0.5);
        if (dirs) {
            const fr = dirs[dirIndex(p.x - e.x, p.y - e.y)][Math.floor((now + e.anim) / 130) % 4];
            const tint = e.elite ? e.eliteColor : (now < e.slowUntil ? [140, 210, 255] : null);
            const w = e.r * 2.8 * sq, h = e.r * 2.8 / sq;
            ctx.drawImage(tintSprite(fr, tint, flash), Math.round(e.x - w / 2), Math.round(e.y - e.r * 0.15 - h / 2), Math.round(w), Math.round(h));
        } else R.circle(ctx, e.x, e.y, e.r, flash ? [255, 255, 255] : [200, 90, 90]);
        if (e.fuseAt && Math.floor(now / 80) % 2) R.circle(ctx, e.x, e.y, e.r + 4, [255, 255, 255], 3);
        if (e.elite) { const bw = e.r * 2, ratio = Math.max(0, e.hp / e.maxHp); R.rect(ctx, e.x - bw / 2, e.y - e.r - 14, bw, 5, [60, 0, 0]); R.rect(ctx, e.x - bw / 2, e.y - e.r - 14, bw * ratio, 5, e.eliteColor); }
    }
    // ---- 회전 칼날 ----
    const orb = g.weapon("orbit");
    if (orb && orb.blades) for (const [bx, by, a] of orb.blades) {
        const s = SV_WEAPONS.orbit.st(orb.lv, orb.evo).size * 2.4;
        if (orb.blades.length <= 8) drawGlow(ctx, bx, by, s * 0.9, [150, 210, 255], 0.5);
        drawKp(ctx, "slash_02", bx, by, s * 1.3, [200, 235, 255], 0.95, a + Math.PI / 2, true);
    }
    // ---- 내 투사체 ----
    let glowN = 0;
    for (const b of g.proj) {
        if (b.kind === "bullet") { if (glowN++ < 40) drawGlow(ctx, b.x, b.y, b.r * 3, b.evo ? [255, 150, 230] : [255, 220, 120], 0.6); R.circle(ctx, b.x, b.y, b.r, b.evo ? [255, 200, 240] : [255, 240, 170]); R.circle(ctx, b.x, b.y, b.r * 0.5, [255, 255, 255]); }
        else if (b.kind === "missile") { drawGlow(ctx, b.x, b.y, 20, [190, 120, 255], 0.7); R.circle(ctx, b.x, b.y, 6, [220, 170, 255]); }
        else if (b.kind === "boomer") { drawGlow(ctx, b.x, b.y, b.r * 2.2, [255, 240, 170], 0.6); drawKp(ctx, "magic_02", b.x, b.y, b.r * 2.4, [255, 245, 190], 1, b.spin, true); }
    }
    // ---- 적 탄 ----
    for (const b of g.ebul) { drawGlow(ctx, b.x, b.y, b.r * 2.6, [255, 60, 60], 0.6); R.circle(ctx, b.x, b.y, b.r, [255, 120, 110]); R.circle(ctx, b.x, b.y, b.r * 0.45, [255, 230, 220]); }
    // ---- 효과 ----
    let boltN = 0;
    for (const f of g.fx) {
        const t = clamp((now - f.t0) / f.dur, 0, 1), a = 1 - t;
        switch (f.kind) {
            case "anim": drawSheet(ctx, f.sheet, t, f.x, f.y, f.scale || 2, 0, (f.alpha || 1) * (t > 0.7 ? (1 - t) / 0.3 : 1)); break;
            case "kp": drawKp(ctx, f.img, f.x, f.y, f.size * (1 + (f.grow || 0) * t), f.color, a, 0, true); break;
            case "ring": R.circle(ctx, f.x, f.y, f.r * (0.3 + 0.7 * t), rgb(f.color, a), 4); break;
            case "slash":
                ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
                ctx.fillStyle = `rgba(235,240,255,${0.5 * a})`;
                ctx.beginPath(); ctx.ellipse(0, 0, f.len / 2 * (0.6 + 0.4 * t), f.wid / 2 * a + 2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
                ctx.beginPath(); ctx.ellipse(0, -f.wid * 0.12, f.len / 2 * (0.5 + 0.5 * t), Math.max(1, f.wid * 0.12 * a), 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                break;
            case "bolt": {
                // 번개가 많을 때는 가볍게 (빛 번짐/불꽃 그림은 앞의 몇 개만)
                boltN++;
                if (t < 0.5 || boltN > 8) R.lines(ctx, f.pts, [255, 240, 120], 5 * a + 1);
                R.lines(ctx, f.pts, [255, 255, 255], 1.5);
                if (boltN <= 6) { drawSheet(ctx, "thunder", t, f.x, f.y - 8, 2.5); drawGlow(ctx, f.x, f.y, f.r * 1.3, [255, 240, 150], a * 0.8); }
                else R.circle(ctx, f.x, f.y, f.r * (0.4 + 0.6 * t), rgb([255, 240, 150], 0.5 * a), 3);
                break;
            }
            case "nova":
                R.circle(ctx, f.x, f.y, f.r * (0.2 + 0.8 * t), rgb([180, 235, 255], 0.25 * a));
                R.circle(ctx, f.x, f.y, f.r * (0.2 + 0.8 * t), rgb([200, 240, 255], a), 5);
                break;
            case "meteor": {
                const h = 260 * (1 - t);
                R.circle(ctx, f.x, f.y, f.r, rgb([255, 120, 60], 0.12 + 0.15 * t)); R.circle(ctx, f.x, f.y, f.r, rgb([255, 150, 80], 0.6), 1);
                drawGlow(ctx, f.x + h * 0.4, f.y - h, 26, [255, 180, 90], 0.9);
                R.circle(ctx, f.x + h * 0.4, f.y - h, 9, [255, 240, 200]);
                break;
            }
        }
    }
    for (const pt of g.particles) pt.draw(ctx, now);
    // ---- 플레이어 ----
    const blink = now < p.invulnUntil && Math.floor(now / 60) % 2 === 0;
    if (hi) drawBlobShadow(ctx, p.x, p.y + p.radius * 0.95, p.radius * 0.8, p.radius * 0.3);
    if (g.now < g.feverUntil) drawGlow(ctx, p.x, p.y, 60, [255, 140, 50], 0.5 + 0.2 * Math.sin(now / 80));
    if (!blink || g.over) drawPlayerShape(ctx, p, now);
    // 플레이어 체력바
    R.rect(ctx, p.x - 20, p.y + p.radius + 6, 40, 5, [60, 0, 0]);
    R.rect(ctx, p.x - 20, p.y + p.radius + 6, 40 * Math.max(0, p.hp / p.maxHp), 5, [90, 230, 110]);
    // ---- 숫자 ----
    for (const n of g.nums) {
        const t = (now - n.t) / 650, y = n.y - 26 * t - (n.crit ? 8 * Math.sin(t * Math.PI) : 0);
        const sz = n.crit ? Math.round(18 * (t < 0.15 ? 1.35 - t * 2.3 : 1)) : 13;
        ctx.globalAlpha = 1 - Math.max(0, t - 0.6) / 0.4;
        R.text(ctx, n.text, n.x, y, sz, n.color, { align: "center", bold: n.crit, shadow: true });
        ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ---- 화면 전체 효과 ----
    const lowHp = p.hp < p.maxHp * 0.3 && !g.over;
    ctx.globalAlpha = lowHp ? 0.85 + 0.15 * Math.sin(now / 150) : 0.85;
    ctx.drawImage(svVignette(lowHp ? "120,0,0" : g.now < g.feverUntil ? "120,40,0" : "0,0,0"), 0, 0);
    ctx.globalAlpha = 1;
    if (now < g.hurtFlashUntil) { ctx.fillStyle = `rgba(255,0,0,${0.18 * (g.hurtFlashUntil - now) / 260})`; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    if (now < g.flashUntil) { ctx.fillStyle = rgb(g.flashColor, 0.5 * (g.flashUntil - now) / 350); ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    svDrawHud(ctx, g, now);
    if (g.banner && now < g.banner.until) {
        const t = (now - g.banner.t) / 1000, k = Math.min(1, t / 0.15), fade = Math.min(1, (g.banner.until - now) / 300);
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(SCREEN_W / 2, 150); ctx.scale(1.4 - 0.4 * k, 1.4 - 0.4 * k);
        R.text(ctx, g.banner.text, 0, -18, 30, g.banner.color, { align: "center", bold: true, shadow: true });
        ctx.restore();
    }
    if (g.ui) {
        if (g.ui.kind === "quiz") svDrawQuiz(ctx, g, g.ui, now, touch);
        else if (g.ui.kind === "pick") svDrawPick(ctx, g, g.ui, now, touch);
        else if (g.ui.kind === "chest") svDrawChest(ctx, g, g.ui, now);
    }
}
function svDrawHud(ctx, g, now) {
    const p = g.p;
    // 경험치 막대
    const need = svNeedXp(g.level + g.pendingLevels), k = clamp(g.xp / need, 0, 1);
    R.rect(ctx, 0, 0, SCREEN_W, 16, [20, 20, 34]);
    const gr = ctx.createLinearGradient(0, 0, SCREEN_W, 0);
    gr.addColorStop(0, "#3f7bff"); gr.addColorStop(1, "#7fe0ff");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, SCREEN_W * k, 16);
    R.text(ctx, `Lv ${g.level}`, 8, 0, 13, [255, 255, 255], { bold: true, shadow: true });
    // 시간 / 처치
    R.text(ctx, svFmtTime(g.now), SCREEN_W / 2, 20, 30, [255, 255, 255], { align: "center", bold: true, shadow: true });
    R.text(ctx, `💀 ${g.kills}`, SCREEN_W - 120, 24, 18, [230, 230, 240], { align: "right", bold: true, shadow: true });
    if (g.combo >= 10) {
        const pulse = 1 + Math.max(0, 0.15 - (now - g.comboAt) / 600);
        ctx.save(); ctx.translate(SCREEN_W - 120, 56); ctx.scale(pulse, pulse);
        R.text(ctx, `${g.combo} COMBO`, 0, 0, 16, g.combo >= 100 ? [255, 120, 80] : [255, 220, 120], { align: "right", bold: true, shadow: true });
        ctx.restore();
    }
    // 체력
    R.text(ctx, `HP ${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`, 10, 22, 15, [255, 255, 255], { bold: true, shadow: true });
    R.rect(ctx, 10, 42, 150, 10, [60, 0, 0], 0, 3); R.rect(ctx, 10, 42, 150 * clamp(p.hp / p.maxHp, 0, 1), 10, [230, 70, 70], 0, 3);
    // 무기 / 능력
    let x = 10;
    for (const w of g.weapons) {
        const d = SV_WEAPONS[w.id];
        R.rect(ctx, x, 60, 30, 30, [24, 24, 36], 0, 6); R.rect(ctx, x, 60, 30, 30, w.evo ? [255, 215, 90] : d.color, w.evo ? 2 : 1, 6);
        if (GFX.kp[d.icon]) drawKp(ctx, d.icon, x + 15, 75, 26, d.color, 1, 0, true);
        R.text(ctx, w.evo ? "★" : String(w.lv), x + 26, 76, 11, [255, 255, 255], { align: "right", bold: true, shadow: true });
        x += 34;
    }
    x = 10;
    for (const [id, lv] of Object.entries(g.passives)) {
        const d = SV_PASSIVES[id];
        R.rect(ctx, x, 94, 24, 22, [24, 24, 36], 0, 5); R.rect(ctx, x, 94, 24, 22, d.color, 1, 5);
        R.text(ctx, d.tag, x + 12, 96, 12, d.color, { align: "center", bold: true });
        R.text(ctx, String(lv), x + 22, 104, 9, [255, 255, 255], { align: "right" });
        x += 27;
    }
    if (g.quiz.streak >= 2) R.text(ctx, `연속 정답 ${g.quiz.streak}`, SCREEN_W / 2, 56, 14, [140, 255, 170], { align: "center", bold: true, shadow: true });
    // 보스 체력
    if (g.boss && !g.boss.dead) {
        const b = g.boss, w = 420, bx = SCREEN_W / 2 - w / 2, by = SCREEN_H - 36;
        R.rect(ctx, bx - 2, by - 2, w + 4, 16, [20, 10, 14], 0, 4);
        R.rect(ctx, bx, by, w * Math.max(0, b.hp / b.maxHp), 12, [230, 70, 90], 0, 3);
        R.text(ctx, b.name, SCREEN_W / 2, by - 20, 14, [255, 220, 200], { align: "center", bold: true, shadow: true });
    }
}
