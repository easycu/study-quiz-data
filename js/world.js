// =============================================================
// 게임 세계: 플레이어 / 몬스터 / 보스 / 총알 / 장판 / 레이저 / 총 / 벽 / 던전 / AI
// (Python 버전의 클래스와 함수를 같은 이름·같은 규칙으로 옮겼다)
// =============================================================
"use strict";

function monsterCountRange(stage) {
    const extra = Math.floor((stage - 1) / MONSTER_COUNT_STAGE_STEP);
    let lo = Math.min(MIN_MONSTERS_PER_ROOM + extra, MONSTER_COUNT_MIN_CAP);
    let hi = Math.min(MAX_MONSTERS_PER_ROOM + extra, MONSTER_COUNT_MAX_CAP);
    const mult = MONSTER_COUNT_MULT * difficultyRamp(stage);
    lo = Math.max(1, pyRound(lo * mult)) + RunMods.countAdd;
    hi = Math.max(lo, pyRound(hi * mult) + RunMods.countAdd);
    return [lo, hi];
}

function scaleHp(base, power) {
    const s = power - 1;
    return Math.max(1, pyRound(base * (1 + STAGE_HP_GROWTH_LINEAR * s + STAGE_HP_GROWTH_QUAD * s * s) * RunMods.hpMult));
}
function scaleDmg(base, power) {
    if (base <= 0) return 0;
    const s = power - 1;
    return Math.max(1, pyRound(base * (1 + STAGE_DMG_GROWTH_LINEAR * s + STAGE_DMG_GROWTH_QUAD * s * s) * RunMods.dmgMult * ENEMY_TUNE.dmg));
}
function scaleMonsterSpeed(base, power) {
    return base * Math.min(STAGE_MONSTER_SPEED_CAP, 1 + STAGE_MONSTER_SPEED_GROWTH * (power - 1));
}
function scaleMonsterCooldown(base, power) {
    const mult = Math.max(STAGE_MONSTER_FIRE_RATE_FLOOR, 1 - STAGE_MONSTER_FIRE_RATE_GROWTH * (power - 1));
    return Math.max(150, pyRound(base * mult * ENEMY_TUNE.fire));
}

function randomMonsterSubtype(mtype, stage) {
    if (mtype === "melee") {
        const pool = MELEE_SUBTYPE_POOL.slice();
        if (stage >= EXPLODER_UNLOCK_STAGE) pool.push("exploder", "exploder");
        if (stage >= BRUTE_UNLOCK_STAGE) pool.push("brute", "brute");
        if (stage >= SPLITTER_UNLOCK_STAGE) pool.push("splitter", "splitter");
        if (stage >= KAMIKAZE_UNLOCK_STAGE) pool.push("kamikaze", "kamikaze");
        if (stage >= LEAPER_UNLOCK_STAGE) pool.push("leaper", "leaper");
        if (stage >= ASSASSIN_UNLOCK_STAGE) pool.push("assassin", "assassin");
        return choice(pool);
    }
    const pool = RANGED_SUBTYPE_POOL.slice();
    if (stage >= HOMING_UNLOCK_STAGE) pool.push("homing", "homing");
    if (stage >= BURST3_UNLOCK_STAGE) pool.push("burst3", "burst3");
    if (stage >= MORTAR_UNLOCK_STAGE) pool.push("mortar", "mortar");
    if (stage >= SPITTER_UNLOCK_STAGE) pool.push("spitter", "spitter");
    if (stage >= TURRET_UNLOCK_STAGE) pool.push("turret", "turret");
    if (stage >= SNIPER_UNLOCK_STAGE) pool.push("sniper", "sniper");
    if (stage >= TRAPPER_UNLOCK_STAGE) pool.push("trapper", "trapper");
    if (stage >= SHAMAN_UNLOCK_STAGE) pool.push("shaman");
    if (stage >= HEXER_UNLOCK_STAGE) pool.push("hexer", "hexer");
    return choice(pool);
}
function randomMonsterFamily(stage) {
    const pool = ["melee", "melee", "ranged", "ranged"];
    if (stage >= SUMMONER_UNLOCK_STAGE) pool.push("summoner");
    return choice(pool);
}

// ---------------- 플레이어 ----------------
class Player {
    constructor() {
        this.x = Math.floor(SCREEN_W / 2);
        this.y = Math.floor((PLAY_TOP + PLAY_BOTTOM) / 2);
        this.radius = 16;
        this.speed = 4.2;
        this.maxHp = 100; this.hp = 100;
        this.atk = 8;
        this.shotsPerSec = 2.5;
        this.lastShotTime = 0;
        this.color = [70, 130, 240];
        this.facingX = 0; this.facingY = -1;
        this.velX = 0; this.velY = 0;
        this.invulnUntil = 0;
        this.gun = null;
        this.darkShieldUntil = 0;
        this.darkReadyAt = 0;
        this.isMoving = false;
        this.animOffset = randInt(0, 1000);
        // 상태 이상 / 기억
        this.slowUntil = 0; this.slowPct = 0;
        this.skills = [];              // [{id, level, readyAt}]
        this.nextSkillAt = 0;
        this.empower = null;           // 출혈: 다음 총알 강화
        this.shield = 0; this.shieldUntil = 0; this.shieldBreak = null;
        this.dmgReduce = 0; this.dmgReduceUntil = 0;
        this.aspdBuffs = [];           // [{mult, until}]
        this.volleyUntil = 0; this.volleyDmg = 0;
        this.trailUntil = 0; this.trailNext = 0; this.trailSk = null; this.trailDmg = 0;
        this.skillBoost = 0;
        // 강화 카드 / 별자리로 붙는 능력
        this.critBonus = 0; this.critDmg = 0;      // 치명타 확률 / 치명타 피해 추가
        this.dmgMult = 1;                          // 모든 피해 배율 (별자리)
        this.aspdPct = 0;                          // 공격속도 % (별자리 / 카드)
        this.bigDmg = 0;                           // 엘리트·보스 추가 피해
        this.execute = 0;                          // 체력 30% 이하 적 추가 피해
        this.extraShots = 0; this.pierceBonus = 0;
        this.lifesteal = 0;                        // 처치할 때마다 회복
        this.roomShield = 0;                       // 전투 시작 때 최대 체력 비율 보호막
        this.revives = 0;
        this.invulnBonus = 0;
        this.clearHeal = 0;                        // 방 클리어 회복 (최대 체력 비율)
        this._synTier = 0;
        this.cardStacks = {};                      // 종류별로 고른 카드 수 (겹칠수록 효과 감소)
        // 대시
        this.dash = null; this.dashCharges = 1; this.dashReadyAt = 0; this.dashInvulnUntil = 0;
        this.dashSkill = null;                     // 대시 기억 {id, level}
        this.dashEmpower = null; this.nextCrit = 0;
        this.dashCdPct = 0; this.dashInvBonus = 0; this.dashDistPct = 0; this.dashChargeBonus = 0; this.dashRam = 0;
        this.perfectAspd = 0; this.perfectStealth = 0; this.stealthUntil = 0;
        // 별자리 / 수호석
        this.elemBurst = 0; this._shotCount = 0; this.skillDmg = 0; this.skillCd = 0; this.synBonus = 0; this.castGapCut = 0; this.extraSlot = 0;
        this.regenPct = 0; this.armor = 0; this.bossDmg = 0; this.eliteHeal = 0; this.stone = "warrior";
    }
}
function critChance(p) { return CRIT_CHANCE + (p ? p.critBonus : 0); }
function critMult(p) { return CRIT_MULTIPLIER + (p ? p.critDmg : 0); }
// 총과 같은 속성의 기억 개수 = 시너지 단계 (0~3)
function synergyTier(p) {
    if (!p.gun) return 0;
    return p.skills.filter(s => skillHasSynergy(SKILL_BY_ID[s.id], p.gun)).length;
}
const SYNERGY_GUN_BONUS = [0, 0, 0.12, 0.3];       // 시너지 2·3단계: 총 피해 추가
const SYNERGY_CD_MULT = [1, 1, 1, 0.85];           // 시너지 3단계(완성): 기억 쿨타임 -15%
function playerAspdMult(p, now) {
    let m = 1;
    for (const b of p.aspdBuffs) if (now < b.until) m *= b.mult;
    return m * (1 + (p.aspdPct || 0));
}

// ---------------- 몬스터 ----------------
class Monster {
    constructor(x, y, mtype, stage, subtype, elite, power) {
        this.x = x; this.y = y;
        this.type = mtype;
        this.stage = stage || 1;
        this.power = (power === undefined || power === null) ? this.stage : power;
        if (subtype) this.subtype = subtype;
        else if (mtype === "melee" || mtype === "ranged") this.subtype = randomMonsterSubtype(mtype, this.stage);
        else this.subtype = null;
        this.isElite = !!elite;
        this.isMinion = false;
        this.isBoss = false;
        this.lastShotTime = 0; this.lastTouchTime = 0;
        this.hitFlashUntil = 0;
        this.animOffset = randInt(0, 1000);
        this.dashState = "chase"; this.dashStateUntil = 0; this.dashDir = [0, 0];
        this.dashSpeed = MELEE_DASH_SPEED;
        this.lastDamagedTime = null; this.rageStacks = 0;
        this.burstPending = false; this.burstFireTime = 0; this.burstDir = [0, 0];
        this.burstShotsLeft = 0; this.burstDelayMs = RANGED_DOUBLE_BURST_DELAY_MS;
        this.summonCount = 0; this.nextSummonTime = 0;
        // 총 효과 상태
        this.burnUntil = 0; this.nextBurnTick = null; this.burnDamage = 0;
        this.slowUntil = 0; this.slowPct = 0;
        this.lightStacks = 0;
        this.stunUntil = 0; this.stunImmuneUntil = 0;
        // 새 몬스터 / 엘리트 / 기억 상태
        this.affixes = [];            // 엘리트 접두사 키 목록
        this.shield = 0; this.shieldUntil = 0;
        this.hidden = false; this.airborne = false; this.immovable = false;
        this.aiState = "idle"; this.aiUntil = 0; this.aiNext = 0; this.aiAngle = 0;
        this.dotDamage = 0; this.dotUntil = 0; this.dotNext = 0;     // 출혈/독 (기억)
        this.marks = {};              // 기억 표식
        this.invulnUntil = 0;

        const P = this.power;
        if (mtype === "melee") {
            this.shootCooldown = 0; this.bulletDamage = 0;
            switch (this.subtype) {
                case "dash": this.radius = 14; this.hp = scaleHp(MELEE_DASH_BASE_HP, P); this.speed = 1.8; this.color = [235, 120, 40]; this.touchDamage = scaleDmg(MELEE_DASH_TOUCH_DMG, P); break;
                case "exploder": this.radius = 15; this.hp = scaleHp(EXPLODER_BASE_HP, P); this.speed = 2.0; this.color = EXPLODER_COLOR; this.touchDamage = scaleDmg(EXPLODER_TOUCH_DMG, P); break;
                case "brute": this.radius = 18; this.hp = scaleHp(BRUTE_BASE_HP, P); this.speed = 1.3; this.color = BRUTE_COLOR; this.touchDamage = scaleDmg(BRUTE_TOUCH_DMG, P); break;
                case "splitter": this.radius = 14; this.hp = scaleHp(SPLITTER_BASE_HP, P); this.speed = 2.1; this.color = SPLITTER_COLOR; this.touchDamage = scaleDmg(SPLITTER_TOUCH_DMG, P); break;
                case "kamikaze": this.radius = 13; this.hp = scaleHp(KAMIKAZE_BASE_HP, P); this.speed = 2.6; this.color = KAMIKAZE_COLOR; this.touchDamage = scaleDmg(KAMIKAZE_TOUCH_DMG, P); this.bulletDamage = scaleDmg(KAMIKAZE_BLAST_DMG, P); break;
                case "leaper": this.radius = 15; this.hp = scaleHp(LEAPER_BASE_HP, P); this.speed = 1.6; this.color = LEAPER_COLOR; this.touchDamage = scaleDmg(LEAPER_TOUCH_DMG, P); this.bulletDamage = scaleDmg(LEAPER_SLAM_DMG, P); break;
                case "assassin": this.radius = 14; this.hp = scaleHp(ASSASSIN_BASE_HP, P); this.speed = 2.0; this.color = ASSASSIN_COLOR; this.touchDamage = scaleDmg(ASSASSIN_TOUCH_DMG, P); this.bulletDamage = scaleDmg(ASSASSIN_SLASH_DMG, P); break;
                case "egg": this.radius = 14; this.hp = scaleHp(EGG_BASE_HP, P); this.speed = 0; this.color = EGG_COLOR; this.touchDamage = 0; this.immovable = true; break;
                default: this.radius = 14; this.hp = scaleHp(MELEE_BASE_HP, P); this.speed = 2.3; this.color = [220, 60, 60]; this.touchDamage = scaleDmg(MELEE_BASE_TOUCH_DMG, P);
            }
        } else if (mtype === "summoner") {
            this.radius = 15; this.hp = scaleHp(SUMMONER_BASE_HP, P); this.speed = 1.4; this.color = SUMMONER_COLOR;
            this.touchDamage = scaleDmg(SUMMONER_TOUCH_DMG, P); this.shootCooldown = 0; this.bulletDamage = 0;
        } else {
            this.radius = 13; this.touchDamage = scaleDmg(RANGED_BASE_TOUCH_DMG, P);
            switch (this.subtype) {
                case "spread": this.hp = scaleHp(RANGED_BASE_HP, P); this.speed = 1.6; this.color = [205, 80, 190]; this.shootCooldown = 1700; this.bulletDamage = scaleDmg(RANGED_SPREAD_BULLET_DMG, P); break;
                case "double": this.hp = scaleHp(RANGED_BASE_HP, P); this.speed = 1.6; this.color = [120, 90, 230]; this.shootCooldown = 1900; this.bulletDamage = scaleDmg(RANGED_DOUBLE_BULLET_DMG, P); break;
                case "homing": this.hp = scaleHp(HOMING_BASE_HP, P); this.speed = 1.5; this.color = HOMING_COLOR; this.shootCooldown = HOMING_SHOOT_COOLDOWN_MS; this.bulletDamage = scaleDmg(HOMING_BULLET_DMG, P); this.touchDamage = scaleDmg(HOMING_TOUCH_DMG, P); break;
                case "burst3": this.hp = scaleHp(BURST3_BASE_HP, P); this.speed = 1.6; this.color = BURST3_COLOR; this.shootCooldown = BURST3_SHOOT_COOLDOWN_MS; this.bulletDamage = scaleDmg(BURST3_BULLET_DMG, P); break;
                case "mortar": this.hp = scaleHp(MORTAR_BASE_HP, P); this.speed = 1.3; this.color = MORTAR_COLOR; this.shootCooldown = MORTAR_SHOOT_COOLDOWN_MS; this.bulletDamage = scaleDmg(MORTAR_BULLET_DMG, P); break;
                case "turret": this.radius = 16; this.hp = scaleHp(TURRET_BASE_HP, P); this.speed = 0; this.color = TURRET_COLOR; this.shootCooldown = TURRET_REST_MS; this.bulletDamage = scaleDmg(TURRET_BULLET_DMG, P); this.touchDamage = scaleDmg(TURRET_TOUCH_DMG, P); this.immovable = true; break;
                case "sniper": this.hp = scaleHp(SNIPER_BASE_HP, P); this.speed = 1.5; this.color = SNIPER_COLOR; this.shootCooldown = SNIPER_COOLDOWN_MS; this.bulletDamage = scaleDmg(SNIPER_BULLET_DMG, P); break;
                case "trapper": this.hp = scaleHp(TRAPPER_BASE_HP, P); this.speed = 1.9; this.color = TRAPPER_COLOR; this.shootCooldown = TRAPPER_MINE_GAP_MS; this.bulletDamage = scaleDmg(TRAPPER_MINE_DMG, P); break;
                case "shaman": this.hp = scaleHp(SHAMAN_BASE_HP, P); this.speed = 1.4; this.color = SHAMAN_COLOR; this.shootCooldown = SHAMAN_CAST_MS; this.bulletDamage = 0; this.reviveUsed = false; break;
                case "hexer": this.hp = scaleHp(HEXER_BASE_HP, P); this.speed = 1.5; this.color = HEXER_COLOR; this.shootCooldown = HEXER_COOLDOWN_MS; this.bulletDamage = scaleDmg(HEXER_BULLET_DMG, P); break;
                case "spitter": this.hp = scaleHp(SPITTER_BASE_HP, P); this.speed = 1.5; this.color = SPITTER_COLOR; this.shootCooldown = SPITTER_SHOOT_COOLDOWN_MS; this.bulletDamage = scaleDmg(HAZARD_DAMAGE, P); this.touchDamage = scaleDmg(SPITTER_TOUCH_DMG, P); break;
                default: this.hp = scaleHp(RANGED_BASE_HP, P); this.speed = 1.6; this.color = [165, 70, 225]; this.shootCooldown = 1400; this.bulletDamage = scaleDmg(RANGED_SINGLE_BULLET_DMG, P);
            }
        }
        this.hp = Math.max(1, pyRound(this.hp * MONSTER_HP_MULT * difficultyRamp(this.stage)));
        if (this.isElite) {
            this.radius = pyRound(this.radius * ELITE_RADIUS_MULT);
            this.hp = Math.max(1, pyRound(this.hp * ELITE_HP_MULT));
            this.touchDamage = Math.max(1, pyRound(this.touchDamage * ELITE_DMG_MULT));
            this.bulletDamage = Math.max(0, pyRound(this.bulletDamage * ELITE_DMG_MULT));
        }
        this.speed = scaleMonsterSpeed(this.speed, P);
        if (this.shootCooldown) this.shootCooldown = scaleMonsterCooldown(this.shootCooldown, P);
        if (this.isElite) this.affixes = rollEliteAffixes(this.stage, this.subtype);
        if (this.affixes.includes("swift")) {
            this.speed *= ELITE_SWIFT_SPEED;
            if (this.shootCooldown) this.shootCooldown = Math.max(300, pyRound(this.shootCooldown * ELITE_SWIFT_COOLDOWN));
        }
        this.maxHp = this.hp;
        this.snapshotRageBaseStats();
    }
    hasAffix(a) { return this.affixes.includes(a); }
    // 총/기억이 노릴 수 있는지 (사라진 암살자 등은 안 됨)
    get targetable() { return !this.hidden; }
    snapshotRageBaseStats() {
        this.rageBaseSpeed = this.speed;
        this.rageBaseDashSpeed = this.dashSpeed || 0;
        this.rageBaseTouchDamage = this.touchDamage;
        this.rageBaseBulletDamage = this.bulletDamage;
    }
}

function rollEliteAffixes(stage, subtype) {
    let pool = ELITE_AFFIXES.map(a => a[0]);
    if (subtype === "turret" || subtype === "egg") pool = pool.filter(a => a !== "swift" && a !== "fire");
    const n = stage >= ELITE_TWO_AFFIX_STAGE ? 2 : 1;
    return sample(pool, n);
}
function eliteSpawnChance(stage) { return Math.min(ELITE_CHANCE_MAX + RunMods.eliteAdd, ELITE_SPAWN_CHANCE + ELITE_CHANCE_PER_STAGE * (stage - 1) + RunMods.eliteAdd); }
function affixName(key) { const a = ELITE_AFFIXES.find(x => x[0] === key); return a ? a[1] : key; }
function affixColor(key) { const a = ELITE_AFFIXES.find(x => x[0] === key); return a ? a[2] : [255, 255, 255]; }

class Boss extends Monster {
    constructor(x, y, stage, variant, power) {
        super(x, y, "ranged", stage, "single", false, power);
        this.isBoss = true;
        this.variant = variant || pickBossVariant(this.stage);
        // 혼합 보스: 두 보스의 패턴을 섞는다
        this.parts = this.variant === "hybrid" ? pickHybridParts(this.stage) : [this.variant];
        const defs = this.parts.map(v => BOSS_DEFS[v]);
        const hpMult = Math.max(...defs.map(d => d.hpMult || 1)) * (this.variant === "hybrid" ? 1.15 : 1);
        this.hp = pyRound(scaleHp(BOSS_BASE_HP, this.power) * hpMult * BOSS_HP_EXTRA * difficultyRamp(this.stage));
        this.maxHp = this.hp;
        this.radius = BOSS_RADIUS;
        this.speed = scaleMonsterSpeed(1.3 * (defs[0].speed || 1), this.power);
        this.baseColor = defs.length > 1
            ? defs[0].color.map((c, i) => Math.round((c + defs[1].color[i]) / 2)) : defs[0].color;
        this.color = this.baseColor;
        this.bossName = defs.length > 1 ? `혼돈: ${defs[0].name} + ${defs[1].name}` : defs[0].name;
        this.bulletDamage = scaleDmg(BOSS_BASE_BULLET_DMG, this.power);
        this.touchDamage = scaleDmg(BOSS_BASE_TOUCH_DMG, this.power);
        this.dashSpeed = scaleMonsterSpeed(BOSS_DASH_SPEED, this.power);
        this.shootCooldownMs = scaleMonsterCooldown(BOSS_SHOOT_COOLDOWN_MS, this.power);
        this.enraged = false;
        this.summonCount = 0; this.nextSummonTime = 0;
        this.nextPoolTime = 0; this.nextTrailTime = 0;
        this.laser = null;
        // 패턴 상태
        this.phase = 1; this.bstate = "move"; this.bUntil = 0; this.gen = null; this.genWait = 0;
        this.lastPattern = null; this.patternName = null; this.moveShotDone = false;
        this.snapshotRageBaseStats();
    }
}

class Bullet {
    constructor(x, y, dx, dy, speed, damage, owner, homing, radius, gun) {
        this.x = x; this.y = y; this.dirX = dx; this.dirY = dy;
        this.speed = speed; this.damage = damage; this.owner = owner;
        this.homing = !!homing; this.radius = radius || 5; this.gun = gun || null;
        this.bornAt = null; this.pierceLeft = 0; this.hitSet = null;
    }
}

class Hazard {
    constructor(x, y, radius, damage, now, color, warnMs, activeMs) {
        this.x = x; this.y = y; this.radius = radius; this.damage = damage;
        this.color = color || HAZARD_COLOR;
        this.activeAt = now + (warnMs === undefined || warnMs === null ? HAZARD_WARN_MS : warnMs);
        this.expireAt = this.activeAt + (activeMs || HAZARD_ACTIVE_MS);
        this.nextTickTime = 0;
        this.slowPct = 0;          // 밟으면 느려지는 장판 (얼음 등)
    }
    isActive(now) { return this.activeAt <= now && now < this.expireAt; }
    isAlive(now) { return now < this.expireAt; }
    contains(x, y, r) { return hypot(x - this.x, y - this.y) <= this.radius + (r || 0); }
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby;
    if (len2 <= 0) return hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
    return hypot(px - (ax + abx * t), py - (ay + aby * t));
}
function rayExitLength(cx, cy, angle, maxLen) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best = maxLen;
    const cands = [];
    if (Math.abs(dx) > 1e-9) cands.push((PLAY_LEFT - cx) / dx, (PLAY_RIGHT - cx) / dx);
    if (Math.abs(dy) > 1e-9) cands.push((PLAY_TOP - cy) / dy, (PLAY_BOTTOM - cy) / dy);
    for (const t of cands) {
        if (t <= 0 || t >= best) continue;
        const px = cx + dx * t, py = cy + dy * t;
        if (px >= PLAY_LEFT - 1 && px <= PLAY_RIGHT + 1 && py >= PLAY_TOP - 1 && py <= PLAY_BOTTOM + 1) best = t;
    }
    return best;
}

class RotatingLaser {
    // opts: { length, width, warnMs, activeMs, restMs, angularSpeed }  (엘리트 '비전'의 짧은 광선 등)
    constructor(cx, cy, damage, now, beamCount, opts) {
        opts = opts || {};
        this.cx = cx; this.cy = cy; this.damage = damage;
        this.beamCount = Math.max(1, beamCount || 1);
        this.length = opts.length || hypot(PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
        this.angle = uniform(0, Math.PI * 2);
        this.angularSpeed = choice([-1, 1]) * (opts.angularSpeed || LASER_ANGULAR_SPEED);
        this.width = opts.width || LASER_WIDTH;
        this.warnMs = opts.warnMs || LASER_WARN_MS;
        this.activeMs = opts.activeMs || LASER_ACTIVE_MS;
        this.restMs = opts.restMs || LASER_REST_MS;
        this.state = "warning"; this.stateUntil = now + this.warnMs;
        this.nextTickTime = 0;
        this.owner = null;
        this.stillWarn = !!opts.stillWarn;      // 예고 중에는 돌지 않고 시작 자리에서 기다림
    }
    beamAngles() {
        const out = [];
        for (let i = 0; i < this.beamCount; i++) out.push(this.angle + (2 * Math.PI / this.beamCount) * i);
        return out;
    }
    update(now) {
        if (this.state === "active" || (this.state === "warning" && !this.stillWarn)) this.angle += this.angularSpeed;
        if (now >= this.stateUntil) {
            if (this.state === "warning") { this.state = "active"; this.stateUntil = now + this.activeMs; }
            else if (this.state === "active") { this.state = "rest"; this.stateUntil = now + this.restMs; }
            else {
                this.state = "warning"; this.stateUntil = now + this.warnMs;
                this.angularSpeed = Math.abs(this.angularSpeed) * choice([-1, 1]);
            }
        }
    }
    hits(x, y, r) {
        if (this.state !== "active") return false;
        for (const a of this.beamAngles()) {
            const ex = this.cx + Math.cos(a) * this.length, ey = this.cy + Math.sin(a) * this.length;
            if (pointSegmentDistance(x, y, this.cx, this.cy, ex, ey) <= this.width / 2 + r) return true;
        }
        return false;
    }
}

// ---------------- 총 ----------------
class Gun {
    constructor(element, grade) { this.element = element; this.grade = grade; }
    get gradeIndex() { return GUN_GRADE_INDEX[this.grade]; }
    get gradeName() { return GUN_GRADES[this.gradeIndex][1]; }
    get elementName() { return GUN_ELEMENTS[this.element][0]; }
    get color() { return GUN_ELEMENTS[this.element][1]; }
    get borderColor() { return GUN_GRADES[this.gradeIndex][3]; }
    get borderWidth() { return GUN_GRADES[this.gradeIndex][4]; }
    get atkBonus() { return GUN_GRADES[this.gradeIndex][5]; }
    get effectValue() { return GUN_ELEMENTS[this.element][2][this.gradeIndex] * (RunMods.gunEff || 1); }   // 별자리 "원소 친화"
    get name() { return `[${this.gradeName}] ${this.elementName}의 총`; }
    description() {
        const atk = `공격력 +${pyRound(this.atkBonus * 100)}%`;
        if (this.element === "wind") return `${atk} · 맞힌 자리에서 폭발: 주변 적에게 피해의 ${Math.round(this.effectValue * 100)}%`;
        const v = Math.round(this.effectValue * 10000) / 100;
        const e = {
            fire: `5초간 매초 공격력의 ${v}% 화염 피해`,
            ice: `맞은 적 이동속도 ${v}% 감소`,
            lightning: `근처 적 ${LIGHTNING_CHAIN_COUNT}명에게 피해의 ${v}% 번개`,
            light: `맞힐수록 빛 표식 중첩(최대 ${LIGHT_MAX_STACKS}), 표식당 피해 +${v}%`,
            nature: `명중할 때마다 최대체력의 ${v}% 회복`,
            dark: `처치하면 영혼 폭발: 주변 적에게 죽은 적 최대 체력의 ${v}% (연쇄 폭발)`,
            earth: `${v}% 확률로 1초 기절 (보스 0.5초, 끝난 뒤 1초간 재기절 없음)`,
            spread: `한 번에 ${SPREAD_PELLETS}발 부채꼴 발사, 1발 피해 ${v}%`,
        }[this.element];
        return `${atk} · ${e}`;
    }
}
function rollGunGrade() {
    const r = Math.random();
    let acc = 0;
    for (const g of GUN_GRADES) { acc += g[2]; if (r < acc) return g[0]; }
    return GUN_GRADES[GUN_GRADES.length - 1][0];
}
function rollGunChoices(count) {
    return sample(GUN_ELEMENT_ORDER, count || GUN_CHOICE_COUNT).map(el => new Gun(el, rollGunGrade()));
}
function playerShotDamage(p) { return (p.gun ? p.atk * (1 + p.gun.atkBonus + SYNERGY_GUN_BONUS[p._synTier || 0]) : p.atk) * (p.dmgMult || 1); }
function perfectQuizHealAmount(p, correct) {
    if (correct < QUESTIONS_PER_ROOM) return 0;
    return Math.max(0, p.maxHp - p.hp) * PERFECT_QUIZ_HEAL_RATIO;
}
function wrongAnswerPenalty(p, correct) {
    return Math.max(0, p.hp) * WRONG_ANSWER_DAMAGE_RATIO * Math.max(0, QUESTIONS_PER_ROOM - correct);
}
function makePlayerBullets(p, dx, dy) {
    const gun = p.gun, dmg = playerShotDamage(p);
    if (gun && gun.element === "spread") {
        const out = [], half = (SPREAD_PELLETS - 1) / 2;
        for (let k = 0; k < SPREAD_PELLETS; k++) {
            const [ndx, ndy] = rotateDirection(dx, dy, (k - half) * SPREAD_ANGLE_DEG);
            out.push(new Bullet(p.x, p.y, ndx, ndy, 8, dmg * gun.effectValue, "player", false, 5, gun));
        }
        return out;
    }
    const b = new Bullet(p.x, p.y, dx, dy, 8, dmg, "player", false, gun ? 6 : 5, gun);
    const out = [b];
    // 카드 "총알 +1": 양옆으로 조금 약한 총알
    for (let k = 1; k <= (p.extraShots || 0); k++) {
        for (const sgn of [-1, 1]) {
            if (out.length > 1 + 2 * (p.extraShots || 0)) break;
            const [ndx, ndy] = rotateDirection(dx, dy, sgn * 9 * k);
            const e = new Bullet(p.x, p.y, ndx, ndy, 8, dmg * 0.5, "player", false, 5, gun);
            out.push(e);
        }
    }
    if (p.pierceBonus) for (const o of out) { o.pierceLeft = (o.pierceLeft || 0) + p.pierceBonus; o.hitSet = o.hitSet || new Set(); }
    return out;
}
function monsterIsSlowed(m, now) { return now < m.slowUntil; }
function monsterIsStunned(m, now) { return now < m.stunUntil; }
function applyGunOnHit(gun, player, target, monsters, hitDamage, now) {
    const out = { extraHits: [], heal: 0, darkProc: false, stunned: false };
    if (!gun) return out;
    const v = gun.effectValue;
    switch (gun.element) {
        case "fire": {
            const tick = playerShotDamage(player) * v;
            if (now < target.burnUntil) target.burnDamage = Math.max(target.burnDamage, tick);
            else { target.burnDamage = tick; target.nextBurnTick = now + FIRE_BURN_TICK_MS; }
            target.burnUntil = now + FIRE_BURN_DURATION_MS;
            break;
        }
        case "ice":
            target.slowPct = Math.max(v, monsterIsSlowed(target, now) ? target.slowPct : 0);
            target.slowUntil = now + ICE_SLOW_DURATION_MS;
            break;
        case "lightning": {
            const others = monsters.filter(m => m !== target && m.hp > 0 && hypot(m.x - target.x, m.y - target.y) <= LIGHTNING_CHAIN_RANGE);
            others.sort((a, b) => hypot(a.x - target.x, a.y - target.y) - hypot(b.x - target.x, b.y - target.y));
            const chain = Math.max(1, hitDamage * v);
            out.extraHits = others.slice(0, LIGHTNING_CHAIN_COUNT).map(m => [m, chain]);
            break;
        }
        case "light": target.lightStacks = Math.min(LIGHT_MAX_STACKS, target.lightStacks + 1); break;
        case "nature": out.heal = player.maxHp * v; break;   // 최대체력 기준
        case "dark": break;                                   // 영혼 폭발은 처치할 때 (Game.soulBlast)
        case "wind": out.blast = hitDamage * v; break;        // 폭발탄
        case "earth":
            if (now >= target.stunImmuneUntil && Math.random() < v) {
                const dur = target.isBoss ? EARTH_BOSS_STUN_MS : EARTH_STUN_MS;
                target.stunUntil = now + dur;
                target.stunImmuneUntil = target.stunUntil + EARTH_STUN_IMMUNE_MS;
                if (target.dashState === "telegraph" || target.dashState === "dashing") target.dashState = "chase";
                out.stunned = true;
            }
            break;
    }
    return out;
}
function burnTickDue(m, now) {
    const t = m.nextBurnTick;
    if (t === null || now < t || t > m.burnUntil) return null;
    m.nextBurnTick = t + FIRE_BURN_TICK_MS;
    return m.burnDamage;
}
function lightDamageMultiplier(gun, target) {
    if (!gun || gun.element !== "light") return 1;
    return 1 + target.lightStacks * gun.effectValue;
}

// ---------------- 벽 / 장애물 ----------------
class Obstacle {
    constructor(kind, x, y, r, w, h, style) {
        this.kind = kind; this.x = x; this.y = y; this.r = r || 0; this.w = w || 0; this.h = h || 0; this.style = style || "pillar";
    }
    static circle(x, y, r, style) { return new Obstacle("circle", x, y, r, 0, 0, style || "pillar"); }
    static rect(l, t, w, h, style) { return new Obstacle("rect", l, t, 0, w, h, style || "crate"); }
    bounds() {
        if (this.kind === "circle") return [this.x - this.r, this.y - this.r, this.x + this.r, this.y + this.r];
        return [this.x, this.y, this.x + this.w, this.y + this.h];
    }
    distanceTo(px, py) {
        if (this.kind === "circle") return Math.max(0, hypot(px - this.x, py - this.y) - this.r);
        const cx = clamp(px, this.x, this.x + this.w), cy = clamp(py, this.y, this.y + this.h);
        return hypot(px - cx, py - cy);
    }
    overlapsCircle(px, py, r) { return this.distanceTo(px, py) < r; }
    pushOut(px, py, radius, slide, mover, toward) {
        if (this.kind === "circle") {
            let dx = px - this.x, dy = py - this.y, dist = hypot(dx, dy);
            const need = radius + this.r;
            if (dist >= need) return [px, py];
            if (dist === 0) { dx = 1; dy = 0; dist = 1; }
            const nx = dx / dist, ny = dy / dist;
            px = this.x + nx * need; py = this.y + ny * need;
            if (slide) return this._slide(px, py, nx, ny, slide, mover, toward);
            return [px, py];
        }
        const left = this.x, top = this.y, right = this.x + this.w, bottom = this.y + this.h;
        const cx = clamp(px, left, right), cy = clamp(py, top, bottom);
        const dx = px - cx, dy = py - cy, dist = hypot(dx, dy);
        if (dist >= radius) return [px, py];
        let nx, ny;
        if (dist > 0) { nx = dx / dist; ny = dy / dist; px = cx + nx * radius; py = cy + ny * radius; }
        else {
            const moves = [[left - radius - px, 0], [right + radius - px, 0], [0, top - radius - py], [0, bottom + radius - py]];
            let best = moves[0];
            for (const m of moves) if (Math.abs(m[0]) + Math.abs(m[1]) < Math.abs(best[0]) + Math.abs(best[1])) best = m;
            px += best[0]; py += best[1];
            nx = Math.sign(best[0]); ny = Math.sign(best[1]);
        }
        if (slide) return this._slide(px, py, nx, ny, slide, mover, toward);
        return [px, py];
    }
    _slide(px, py, nx, ny, slide, mover, toward) {
        const tx = -ny, ty = nx;
        const ccx = this.kind === "circle" ? this.x : this.x + this.w / 2;
        const ccy = this.kind === "circle" ? this.y : this.y + this.h / 2;
        let preferred = ((px - ccx) * tx + (py - ccy) * ty) >= 0 ? 1 : -1;
        if (toward) {
            const want = (toward[0] - px) * tx + (toward[1] - py) * ty;
            if (Math.abs(want) > 4) preferred = want > 0 ? 1 : -1;
        }
        let sign = preferred;
        if (mover) {
            if ((mover._slideTtl || 0) <= 0 || !mover._slideSign) mover._slideSign = preferred;
            mover._slideTtl = 45;
            sign = mover._slideSign;
        }
        return [px + tx * slide * sign, py + ty * slide * sign];
    }
    gapTo(o) {
        if (this.kind === "circle" && o.kind === "circle") return hypot(this.x - o.x, this.y - o.y) - this.r - o.r;
        if (this.kind === "circle") return o.distanceTo(this.x, this.y) - this.r;
        if (o.kind === "circle") return this.distanceTo(o.x, o.y) - o.r;
        const a = this.bounds(), b = o.bounds();
        const gx = Math.max(b[0] - a[2], a[0] - b[2], 0), gy = Math.max(b[1] - a[3], a[1] - b[3], 0);
        if (gx === 0 && gy === 0) return -1;
        return hypot(gx, gy);
    }
}

function doorPoints() {
    const cx = (PLAY_LEFT + PLAY_RIGHT) / 2, cy = (PLAY_TOP + PLAY_BOTTOM) / 2;
    return [[cx, PLAY_TOP], [cx, PLAY_BOTTOM], [PLAY_LEFT, cy], [PLAY_RIGHT, cy]];
}

function layoutPieces(layout) {
    const L = PLAY_LEFT, R = PLAY_RIGHT, T = PLAY_TOP, B = PLAY_BOTTOM;
    const cx = (L + R) / 2, cy = (T + B) / 2;
    const rx = (m = 90) => uniform(L + m, R - m);
    const ry = (m = 90) => uniform(T + m, B - m);
    const pillar = () => [Obstacle.circle(rx(), ry(), randInt(OBSTACLE_MIN_RADIUS + 4, OBSTACLE_MAX_RADIUS), "pillar")];
    const crate = () => { const w = randInt(34, 72), h = randInt(34, 72); return [Obstacle.rect(rx() - w / 2, ry() - h / 2, w, h, "crate")]; };
    const wall = () => {
        const t = randInt(18, 24), len = randInt(120, 250);
        if (Math.random() < 0.5) return [Obstacle.rect(rx(len / 2 + 70) - len / 2, ry() - t / 2, len, t, "wall")];
        return [Obstacle.rect(rx() - t / 2, ry(len / 2 + 70) - len / 2, t, len, "wall")];
    };
    const corner = () => {
        const t = randInt(18, 24), a = randInt(90, 170), b = randInt(90, 170);
        const x0 = rx(140), y0 = ry(130), sx = choice([-1, 1]), sy = choice([-1, 1]);
        return [Obstacle.rect(sx > 0 ? x0 : x0 - a, y0 - t / 2, a, t, "wall"),
                Obstacle.rect(x0 - t / 2, sy > 0 ? y0 : y0 - b, t, b, "wall")];
    };
    const rubble = () => {
        let x = rx(130), y = ry(120), ang = uniform(0, Math.PI * 2);
        const rocks = [Obstacle.circle(x, y, randInt(12, 18), "rock")];
        const n = randInt(2, 4);
        for (let i = 0; i < n; i++) {
            ang += uniform(-0.7, 0.7);
            const r = randInt(10, 17), step = (rocks[rocks.length - 1].r + r) * uniform(0.55, 0.8);
            x += Math.cos(ang) * step; y += Math.sin(ang) * step;
            rocks.push(Obstacle.circle(x, y, r, "rock"));
        }
        return rocks;
    };
    const rep = (n, f) => { const out = []; for (let i = 0; i < n; i++) out.push(f()); return out; };
    switch (layout) {
        case "pillars": return rep(randInt(2, 5), pillar);
        case "crates": return rep(randInt(2, 5), crate);
        case "walls": return rep(randInt(1, 3), wall);
        case "corners": { const p = rep(randInt(1, 2), corner); if (Math.random() < 0.5) p.push(pillar()); return p; }
        case "rubble": return rep(randInt(2, 3), rubble);
        case "cross": {
            const t = randInt(18, 24), arm = randInt(70, 110), hole = randInt(46, 60);
            return [[Obstacle.rect(cx - hole - arm, cy - t / 2, arm, t, "wall")], [Obstacle.rect(cx + hole, cy - t / 2, arm, t, "wall")],
                    [Obstacle.rect(cx - t / 2, cy - hole - arm, t, arm, "wall")], [Obstacle.rect(cx - t / 2, cy + hole, t, arm, "wall")]];
        }
        case "symmetric": {
            const kind = choice(["pillar", "crate", "wall"]), pieces = [];
            const n = randInt(1, 3);
            for (let i = 0; i < n; i++) {
                const base = { pillar, crate, wall }[kind]()[0];
                const mirror = base.kind === "circle" ? Obstacle.circle(L + R - base.x, base.y, base.r, base.style)
                                                       : Obstacle.rect(L + R - base.x - base.w, base.y, base.w, base.h, base.style);
                if (base.gapTo(mirror) >= OBSTACLE_GAP) pieces.push([base, mirror]);
            }
            return pieces;
        }
        case "mixed": return rep(randInt(2, 4), () => choice([pillar, crate, wall, corner, rubble])());
        default: return [];
    }
}
function shiftPiece(piece) {
    const L = PLAY_LEFT, R = PLAY_RIGHT, T = PLAY_TOP, B = PLAY_BOTTOM;
    const bs = piece.map(o => o.bounds());
    const x0 = Math.min(...bs.map(b => b[0])), x1 = Math.max(...bs.map(b => b[2]));
    const y0 = Math.min(...bs.map(b => b[1])), y1 = Math.max(...bs.map(b => b[3]));
    const nx = uniform(L + OBSTACLE_GAP, Math.max(L + OBSTACLE_GAP, R - OBSTACLE_GAP - (x1 - x0)));
    const ny = uniform(T + OBSTACLE_GAP, Math.max(T + OBSTACLE_GAP, B - OBSTACLE_GAP - (y1 - y0)));
    const dx = nx - x0, dy = ny - y0;
    return piece.map(o => new Obstacle(o.kind, o.x + dx, o.y + dy, o.r, o.w, o.h, o.style));
}
function pieceFits(piece, placed, px, py) {
    for (const o of piece) {
        const [x0, y0, x1, y1] = o.bounds();
        if (x0 < PLAY_LEFT + OBSTACLE_GAP || x1 > PLAY_RIGHT - OBSTACLE_GAP || y0 < PLAY_TOP + OBSTACLE_GAP || y1 > PLAY_BOTTOM - OBSTACLE_GAP) return false;
        if (o.distanceTo(px, py) < OBSTACLE_PLAYER_CLEAR) return false;
        if (doorPoints().some(([dx, dy]) => o.distanceTo(dx, dy) < OBSTACLE_DOOR_CLEAR)) return false;
        if (placed.some(p => o.gapTo(p) < OBSTACLE_GAP)) return false;
    }
    return true;
}
function freeSpaceConnected(obstacles, sx, sy, radius = 18, step = 10) {
    const cols = Math.floor((PLAY_RIGHT - PLAY_LEFT) / step), rows = Math.floor((PLAY_BOTTOM - PLAY_TOP) / step);
    const grid = new Uint8Array(cols * rows);
    let total = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = PLAY_LEFT + i * step + step / 2, y = PLAY_TOP + j * step + step / 2;
        if (x < PLAY_LEFT + radius || x > PLAY_RIGHT - radius || y < PLAY_TOP + radius || y > PLAY_BOTTOM - radius) continue;
        if (obstacles.some(o => o.overlapsCircle(x, y, radius))) continue;
        grid[i * rows + j] = 1; total++;
    }
    let si = clamp(Math.floor((sx - PLAY_LEFT) / step), 0, cols - 1), sj = clamp(Math.floor((sy - PLAY_TOP) / step), 0, rows - 1);
    if (!grid[si * rows + sj]) {
        let best = null;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (grid[i * rows + j]) {
            const d = Math.abs(i - si) + Math.abs(j - sj);
            if (!best || d < best[0]) best = [d, i, j];
        }
        if (!best) return false;
        si = best[1]; sj = best[2];
    }
    const seen = new Uint8Array(cols * rows);
    const queue = [[si, sj]]; seen[si * rows + sj] = 1;
    let count = 1;
    while (queue.length) {
        const [i, j] = queue.pop();
        for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
            const k = ni * rows + nj;
            if (grid[k] && !seen[k]) { seen[k] = 1; count++; queue.push([ni, nj]); }
        }
    }
    return count === total;
}
function generateRoomObstaclesOnce(px, py) {
    const layouts = Object.keys(OBSTACLE_LAYOUT_WEIGHTS);
    const layout = weightedChoice(layouts, layouts.map(k => OBSTACLE_LAYOUT_WEIGHTS[k]));
    const placed = [];
    const placeAll = (pieces, fixed) => {
        for (let piece of pieces) {
            for (let t = 0; t < 25; t++) {
                if (pieceFits(piece, placed, px, py)) { placed.push(...piece); break; }
                if (fixed) break;
                piece = shiftPiece(piece);
            }
        }
    };
    placeAll(layoutPieces(layout), layout === "cross" || layout === "symmetric");
    if (!placed.length && layout !== "open") placeAll(layoutPieces("pillars"), false);
    return placed;
}
function generateRoomObstacles(px, py) {
    for (let a = 0; a < 8; a++) {
        const obs = generateRoomObstaclesOnce(px, py);
        if (freeSpaceConnected(obs, px, py)) return obs;
    }
    return [];
}
function pushCircleOutOfObstacles(x, y, radius, obstacles, slide, mover, toward) {
    if (mover) mover._slideTtl = (mover._slideTtl || 0) - 1;
    for (const o of obstacles) [x, y] = o.pushOut(x, y, radius, slide || 0, mover || null, toward || null);
    return [x, y];
}
function bulletHitsObstacle(b, obstacles) { return obstacles.some(o => o.overlapsCircle(b.x, b.y, b.radius)); }

function randomMonsterSpawnPosition(px, py, obstacles) {
    let ex = PLAY_LEFT + 60, ey = PLAY_TOP + 60;
    for (let t = 0; t < MONSTER_SPAWN_MAX_TRIES; t++) {
        ex = randInt(PLAY_LEFT + 60, PLAY_RIGHT - 60);
        ey = randInt(PLAY_TOP + 60, PLAY_BOTTOM - 120);
        if (hypot(ex - px, ey - py) < MIN_MONSTER_SPAWN_DIST) continue;
        if (!obstacles.some(o => o.overlapsCircle(ex, ey, 34))) return [ex, ey];
    }
    return [ex, ey];
}
function resolveMonsterOverlaps(ms) {
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d === 0) { dx = 1; dy = 0; d = 1; }
        if (d < min) {
            const ov = (min - d) / 2, pxv = dx / d * ov, pyv = dy / d * ov;
            a.x -= pxv; a.y -= pyv; b.x += pxv; b.y += pyv;
        }
    }
}

function placeBossRewards(guns, obstacles, px, py) {
    const cx = SCREEN_W / 2, cy = (PLAY_TOP + PLAY_BOTTOM) / 2, n = guns.length;
    const xs = guns.map((_, i) => cx + (i - (n - 1) / 2) * GUN_ROW_SPACING);
    const minDist = y => Math.min(...xs.map(x => hypot(px - x, py - y)));
    let rowY = cy - 90;
    for (const y of [cy - 90, cy, cy + 90]) if (minDist(y) > minDist(rowY)) rowY = y;
    const cands = [[cx, PLAY_TOP + 60], [cx, PLAY_BOTTOM - 60]];
    let portal = hypot(px - cands[0][0], py - cands[0][1]) >= hypot(px - cands[1][0], py - cands[1][1]) ? cands[0] : cands[1];
    const placed = guns.map((g, i) => { const [gx, gy] = pushCircleOutOfObstacles(xs[i], rowY, GUN_PICKUP_RADIUS, obstacles); return [g, gx, gy]; });
    portal = pushCircleOutOfObstacles(portal[0], portal[1], PORTAL_RADIUS, obstacles);
    return [placed, portal];
}

// ---------------- 던전 ----------------
class Room {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.cleared = false; this.visited = false;
        this.connections = {};
        this.obstacles = null;
        this.gunChoices = null; this.portal = null; this.rewardActiveAt = 0;
        this.special = null;           // 보물방/상점/제단 상태
    }
}
const DIRECTIONS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };
const ck = (x, y) => x + "," + y;
function generateDungeonOnce() {
    const rooms = new Map();
    const start = new Room(0, 0, "start"); start.visited = true; start.cleared = true;
    rooms.set(ck(0, 0), start);
    const all = [[0, 0]], frontier = [[0, 0]];
    const nSpecial = Math.random() < 0.5 ? 3 : 2;      // 보물방 + 상점 (+ 50% 운명의 제단)
    const target = randInt(6, 8) + nSpecial;
    while (rooms.size < target && frontier.length) {
        const cur = choice(frontier);
        const dirs = shuffle(Object.entries(DIRECTIONS));
        let placed = false;
        for (const [d, [dx, dy]] of dirs) {
            const nx = cur[0] + dx, ny = cur[1] + dy;
            if (rooms.has(ck(nx, ny))) continue;
            const r = new Room(nx, ny, "battle");
            rooms.set(ck(nx, ny), r);
            rooms.get(ck(cur[0], cur[1])).connections[d] = [nx, ny];
            r.connections[OPPOSITE[d]] = [cur[0], cur[1]];
            frontier.push([nx, ny]); all.push([nx, ny]);
            placed = true; break;
        }
        if (!placed) frontier.splice(frontier.indexOf(cur), 1);
    }
    // 가로세로로 붙어 있는 방은 모두 문으로 잇는다
    for (const r of rooms.values()) {
        for (const [d, [dx, dy]] of Object.entries(DIRECTIONS)) {
            if (rooms.has(ck(r.x + dx, r.y + dy))) r.connections[d] = [r.x + dx, r.y + dy];
        }
    }
    // 보스방: 시작방에서 가장 먼 방 중, 그 방을 빼도 나머지 방이 모두 이어지는 방
    //   (보스방을 거쳐야만 갈 수 있는 막힌 방이 생기지 않게)
    const dist = roomDistances(rooms, null);
    let boss = null;
    for (const c of all) {
        if (c[0] === 0 && c[1] === 0) continue;
        const reach = roomDistances(rooms, ck(c[0], c[1]));
        if (reach.size !== rooms.size - 1) continue;
        if (!boss || dist.get(ck(c[0], c[1])) > dist.get(ck(boss[0], boss[1]))) boss = c;
    }
    if (!boss) boss = all[all.length - 1];
    rooms.get(ck(boss[0], boss[1])).type = "boss";
    // 특수 방: 문이 적은(구석) 방부터. 시작방 바로 옆은 되도록 피함
    const deg = r => Object.keys(r.connections).length;
    const cands = [...rooms.values()].filter(r => r.type === "battle")
        .sort((a, b) => deg(a) - deg(b) || (dist.get(ck(b.x, b.y)) || 0) - (dist.get(ck(a.x, a.y)) || 0));
    const kinds = ["treasure", "shop", "altar"].slice(0, nSpecial);
    for (const kind of kinds) {
        if (cands.length <= 3) break;          // 전투방은 최소 3개 남긴다
        const r = cands.shift();
        r.type = kind; r.cleared = true;
    }
    return [rooms, [0, 0]];
}
// 시작방에서 각 방까지 몇 칸인지 (blocked 방은 지나가지 않음)
function roomDistances(rooms, blocked) {
    const dist = new Map([[ck(0, 0), 0]]), queue = [[0, 0]];
    while (queue.length) {
        const [x, y] = queue.shift(), r = rooms.get(ck(x, y));
        for (const c of Object.values(r.connections)) {
            const k = ck(c[0], c[1]);
            if (k === blocked || dist.has(k)) continue;
            dist.set(k, dist.get(ck(x, y)) + 1);
            queue.push(c);
        }
    }
    return dist;
}
function generateDungeon() {
    let best = generateDungeonOnce();
    for (let i = 0; i < 9 && best[0].size < 5; i++) best = generateDungeonOnce();
    return best;
}
function checkRoomTransition(p, room) {
    const e = 4;
    if (p.y <= PLAY_TOP + p.radius + e && room.connections.N) { p.y = PLAY_BOTTOM - p.radius - 20; return room.connections.N; }
    if (p.y >= PLAY_BOTTOM - p.radius - e && room.connections.S) { p.y = PLAY_TOP + p.radius + 20; return room.connections.S; }
    if (p.x <= PLAY_LEFT + p.radius + e && room.connections.W) { p.x = PLAY_RIGHT - p.radius - 20; return room.connections.W; }
    if (p.x >= PLAY_RIGHT - p.radius - e && room.connections.E) { p.x = PLAY_LEFT + p.radius + 20; return room.connections.E; }
    return null;
}

// =============================================================
// 몬스터 AI
// =============================================================
function nearestMonster(p, ms) {
    let best = null, bd = Infinity;
    for (const m of ms) { if (!m.targetable) continue; const d = hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
    return best;
}
function spawnMinion(x, y, stage, power) {
    const m = new Monster(x, y, "melee", stage, "chase", false, power);
    m.hp = Math.max(1, pyRound(m.hp * SUMMONER_MINION_HP_MULT)); m.maxHp = m.hp;
    m.touchDamage = Math.max(1, pyRound(m.touchDamage * SUMMONER_MINION_DMG_MULT));
    m.radius = Math.max(8, pyRound(m.radius * 0.8));
    m.isMinion = true;
    m.color = shadeColor(m.color, 40);
    m.snapshotRageBaseStats();
    return m;
}
function predictPlayerPoint(p, frames, factor, maxFrames) {
    const f = clamp(frames, 0, maxFrames);
    return [clamp(p.x + p.velX * f * factor, PLAY_LEFT + 8, PLAY_RIGHT - 8),
            clamp(p.y + p.velY * f * factor, PLAY_TOP + 8, PLAY_BOTTOM - 8)];
}
function predictStageScale(stage) {
    if (stage >= PREDICT_STAGE_FULL) return 1;
    const t = clamp((stage - 1) / Math.max(1, PREDICT_STAGE_FULL - 1), 0, 1);
    return PREDICT_EARLY_SCALE + (1 - PREDICT_EARLY_SCALE) * t;
}
function predictedDirection(m, p, approachSpeed, factor, maxFrames) {
    factor *= predictStageScale(m.stage);
    const dist = hypot(p.x - m.x, p.y - m.y);
    const frames = approachSpeed > 0 ? dist / approachSpeed : 0;
    const [tx, ty] = predictPlayerPoint(p, frames, factor, maxFrames);
    const dx = tx - m.x, dy = ty - m.y, d = hypot(dx, dy);
    if (d <= 0) return null;
    return [dx / d, dy / d];
}
function applyRageStats(m) {
    const sm = 1 + RAGE_SPEED_PER_STACK * m.rageStacks, dm = 1 + RAGE_DAMAGE_PER_STACK * m.rageStacks;
    m.speed = m.rageBaseSpeed * sm;
    m.dashSpeed = m.rageBaseDashSpeed * sm;
    m.touchDamage = Math.max(1, pyRound(m.rageBaseTouchDamage * dm));
    m.bulletDamage = Math.max(0, pyRound(m.rageBaseBulletDamage * dm));
}
function updateMonsterRage(m, now) {
    if (m.lastDamagedTime === null) { m.lastDamagedTime = now; return false; }
    if (m.rageStacks >= RAGE_MAX_STACKS) return false;
    const el = now - m.lastDamagedTime;
    if (el < RAGE_FIRST_DELAY_MS) return false;
    const target = Math.min(RAGE_MAX_STACKS, 1 + Math.floor((el - RAGE_FIRST_DELAY_MS) / RAGE_STEP_MS));
    if (target > m.rageStacks) { m.rageStacks = target; applyRageStats(m); return true; }
    return false;
}
function resetMonsterRage(m, now) {
    m.lastDamagedTime = now;
    if (m.rageStacks) { m.rageStacks = 0; applyRageStats(m); }
}
function spawnHazard(hazards, x, y, radius, damage, now, color, warnMs, activeMs) {
    x = clamp(x, PLAY_LEFT + radius * 0.4, PLAY_RIGHT - radius * 0.4);
    y = clamp(y, PLAY_TOP + radius * 0.4, PLAY_BOTTOM - radius * 0.4);
    const h = new Hazard(x, y, radius, damage, now, color, warnMs, activeMs);
    hazards.push(h);
    if (hazards.length > MAX_HAZARDS) hazards.shift();
    return h;
}
function fireSpreadBullets(bullets, x, y, dx, dy, speed, damage, owner, count, spreadDeg) {
    if (count <= 1) { bullets.push(new Bullet(x, y, dx, dy, speed, damage, owner)); return; }
    const half = Math.floor(count / 2), angles = [];
    if (count % 2 === 1) for (let i = -half; i <= half; i++) angles.push(spreadDeg * i);
    else for (let i = -half; i < half; i++) angles.push(spreadDeg * (i + 0.5));
    for (const a of angles) { const [ndx, ndy] = rotateDirection(dx, dy, a); bullets.push(new Bullet(x, y, ndx, ndy, speed, damage, owner)); }
}
function fireRingBullets(bullets, x, y, speed, damage, owner, count) {
    for (let i = 0; i < count; i++) {
        const a = (2 * Math.PI / count) * i;
        bullets.push(new Bullet(x, y, Math.cos(a), Math.sin(a), speed, damage, owner));
    }
}
function keepDistance(m, p, desired) {
    const dx = p.x - m.x, dy = p.y - m.y, d = hypot(dx, dy);
    if (d > 0) {
        if (d > desired + 20) { m.x += dx / d * m.speed; m.y += dy / d * m.speed; }
        else if (d < desired - 20) { m.x -= dx / d * m.speed; m.y -= dy / d * m.speed; }
    }
    return d;
}
function updateMeleeMonster(m, p, now, canAttack) {
    const mdist = hypot(p.x - m.x, p.y - m.y);
    if (m.subtype !== "dash") {
        const aim = predictedDirection(m, p, m.speed, PREDICT_MELEE_FACTOR, PREDICT_MELEE_MAX_FRAMES);
        if (aim) { m.x += aim[0] * m.speed; m.y += aim[1] * m.speed; }
        return;
    }
    if (m.dashState === "cooldown" && now >= m.dashStateUntil) m.dashState = "chase";
    if (m.dashState === "chase" || m.dashState === "cooldown") {
        const aim = predictedDirection(m, p, m.speed, PREDICT_MELEE_FACTOR, PREDICT_MELEE_MAX_FRAMES);
        if (aim) { m.x += aim[0] * m.speed; m.y += aim[1] * m.speed; }
        if (m.dashState === "chase" && canAttack && mdist < MELEE_DASH_TRIGGER_RANGE) {
            m.dashState = "telegraph"; m.dashStateUntil = now + MELEE_DASH_TELEGRAPH_MS;
        }
    } else if (m.dashState === "telegraph") {
        if (now >= m.dashStateUntil) {
            m.dashDir = predictedDirection(m, p, m.dashSpeed, PREDICT_DASH_FACTOR, PREDICT_DASH_MAX_FRAMES) || [0, 0];
            m.dashState = "dashing"; m.dashStateUntil = now + MELEE_DASH_DURATION_MS;
        }
    } else if (m.dashState === "dashing") {
        m.x += m.dashDir[0] * m.dashSpeed; m.y += m.dashDir[1] * m.dashSpeed;
        if (now >= m.dashStateUntil) { m.dashState = "cooldown"; m.dashStateUntil = now + MELEE_DASH_COOLDOWN_MS; }
    }
}
function updateRangedMonster(m, p, bullets, now, canAttack, hazards) {
    const mdx = p.x - m.x, mdy = p.y - m.y;
    const mdist = keepDistance(m, p, 220);
    if (mdist <= 0) return;
    let bs = RANGED_BULLET_SPEED;
    if (m.subtype === "mortar") bs = RANGED_BULLET_SPEED * MORTAR_BULLET_SPEED_MULT;
    else if (m.subtype === "homing") bs = RANGED_BULLET_SPEED * 0.8;
    const aim = predictedDirection(m, p, bs, PREDICT_BULLET_FACTOR, PREDICT_BULLET_MAX_FRAMES);
    const [ndx, ndy] = aim || [mdx / mdist, mdy / mdist];
    if (m.burstPending) {
        if (now >= m.burstFireTime) {
            bullets.push(new Bullet(m.x, m.y, m.burstDir[0], m.burstDir[1], RANGED_BULLET_SPEED, m.bulletDamage, "monster"));
            if (m.burstShotsLeft > 0) { m.burstShotsLeft--; m.burstFireTime = now + m.burstDelayMs; }
            else { m.burstPending = false; m.lastShotTime = now; }
        }
        return;
    }
    if (!(canAttack && now - m.lastShotTime > m.shootCooldown)) return;
    switch (m.subtype) {
        case "spread":
            fireSpreadBullets(bullets, m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED, m.bulletDamage, "monster", 2, RANGED_SPREAD_ANGLE);
            m.lastShotTime = now; break;
        case "double":
            bullets.push(new Bullet(m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED, m.bulletDamage, "monster"));
            m.burstPending = true; m.burstShotsLeft = 0; m.burstDelayMs = RANGED_DOUBLE_BURST_DELAY_MS;
            m.burstFireTime = now + m.burstDelayMs; m.burstDir = [ndx, ndy]; break;
        case "burst3":
            bullets.push(new Bullet(m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED, m.bulletDamage, "monster"));
            m.burstPending = true; m.burstShotsLeft = 1; m.burstDelayMs = BURST3_INTERNAL_DELAY_MS;
            m.burstFireTime = now + m.burstDelayMs; m.burstDir = [ndx, ndy]; break;
        case "homing":
            bullets.push(new Bullet(m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED * 0.8, m.bulletDamage, "monster", true));
            m.lastShotTime = now; break;
        case "mortar":
            bullets.push(new Bullet(m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED * MORTAR_BULLET_SPEED_MULT, m.bulletDamage, "monster", false, MORTAR_BULLET_RADIUS));
            m.lastShotTime = now; break;
        case "spitter": {
            const [tx, ty] = predictPlayerPoint(p, HAZARD_AIM_LEAD_MS / (1000 / FPS), PREDICT_BULLET_FACTOR, PREDICT_BULLET_MAX_FRAMES);
            spawnHazard(hazards, tx, ty, HAZARD_RADIUS, m.bulletDamage, now, SPITTER_COLOR);
            m.lastShotTime = now; break;
        }
        default:
            bullets.push(new Bullet(m.x, m.y, ndx, ndy, RANGED_BULLET_SPEED, m.bulletDamage, "monster"));
            m.lastShotTime = now;
    }
}
function spawnNear(m, monsters, now, dist) {
    const a = uniform(0, Math.PI * 2);
    const sx = clamp(m.x + Math.cos(a) * (m.radius + dist), PLAY_LEFT + 16, PLAY_RIGHT - 16);
    const sy = clamp(m.y + Math.sin(a) * (m.radius + dist), PLAY_TOP + 16, PLAY_BOTTOM - 16);
    const minion = spawnMinion(sx, sy, m.stage, m.power);
    minion.lastShotTime = now; minion.lastTouchTime = now;
    monsters.push(minion);
}
function updateSummonerMonster(m, p, monsters, now, canAttack) {
    keepDistance(m, p, 240);
    if (canAttack && m.summonCount < SUMMONER_MAX_SUMMONS && now >= m.nextSummonTime) {
        if (monsters.length < MONSTER_ADD_CAP + 3) { spawnNear(m, monsters, now, 24); m.summonCount++; }
        m.nextSummonTime = now + SUMMONER_SUMMON_COOLDOWN_MS;
    }
}
class Particle {
    constructor(x, y, vx, vy, color, t, size) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color; this.t = t; this.size = size; }
    alive(now) { return now - this.t < PARTICLE_LIFETIME_MS; }
    update() { this.x += this.vx; this.y += this.vy; this.vx *= 0.9; this.vy *= 0.9; }
}
class DamagePopup {
    constructor(x, y, text, color, t) { this.x = x; this.y = y; this.text = text; this.color = color; this.t = t; }
    alive(now) { return now - this.t < DAMAGE_POPUP_LIFETIME_MS; }
    offset(now) { return (now - this.t) / DAMAGE_POPUP_LIFETIME_MS * -28; }
}
function spawnDeathBurst(particles, x, y, color, now, count) {
    count = count || DEATH_PARTICLE_COUNT;
    for (let i = 0; i < count; i++) {
        const a = uniform(0, Math.PI * 2), s = uniform(1.5, 4.5);
        particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, now, randInt(2, 5)));
    }
}
