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
    constructor(onEnd) {
        this.onEnd = onEnd;       // 게임이 끝나면 호출: ({died, score, stage, kills})
        this.now = 0;
        this.startTime = 0;
        this.stage = 1;
        [this.rooms, this.currentCoord] = generateDungeon();
        this.player = new Player();
        this.monsters = []; this.bullets = []; this.particles = []; this.popups = [];
        this.hazards = []; this.lasers = []; this.zaps = [];
        this.shakeUntil = 0; this.shakeMagnitude = 0;
        this.comboCount = 0; this.comboLastKillTime = -COMBO_WINDOW_MS;
        this.score = 0; this.totalKills = 0;
        this.roomEnterTime = 0;
        this.gameOver = false; this.endDelayStart = null; this.ended = false;
        this.stageMessage = ""; this.stageMessageUntil = 0;
        this.paused = false;
        this.quiz = null;           // 문제 풀이 중이면 상태 객체
        this.input = Input;
        this.loadRoom(this.currentCoord);
    }

    get room() { return this.rooms.get(ck(this.currentCoord[0], this.currentCoord[1])); }

    popup(x, y, text, color) { this.popups.push(new DamagePopup(x, y, text, color, this.now)); }
    shake(mag, dur) { this.shakeMagnitude = mag; this.shakeUntil = this.now + (dur || SCREEN_SHAKE_DURATION_MS); }

    clampToPlay(o) {
        o.x = clamp(o.x, PLAY_LEFT + o.radius, PLAY_RIGHT - o.radius);
        o.y = clamp(o.y, PLAY_TOP + o.radius, PLAY_BOTTOM - o.radius);
    }

    // ---------------- 방 입장 ----------------
    loadRoom(coord) {
        this.monsters = []; this.zaps = []; this.bullets = []; this.hazards = []; this.lasers = [];
        const room = this.rooms.get(ck(coord[0], coord[1]));
        room.visited = true;
        const now = this.now;
        this.roomEnterTime = now;
        const p = this.player;
        const resetTimers = mon => {
            const jitter = randInt(0, 400);
            mon.lastShotTime = now + jitter;
            mon.lastTouchTime = now + jitter;
            if (mon.type === "summoner") mon.nextSummonTime = now + jitter + SUMMONER_SUMMON_COOLDOWN_MS;
            else if (mon.isBoss && mon.variant === "swarm") mon.nextSummonTime = now + jitter + BOSS_SWARM_SUMMON_COOLDOWN_MS;
            return mon;
        };
        if (room.obstacles === null) {
            room.obstacles = (room.type === "battle" || room.type === "boss") ? generateRoomObstacles(p.x, p.y) : [];
        }
        if (room.type === "battle" && !room.cleared) {
            const [lo, hi] = monsterCountRange(this.stage);
            const count = randInt(lo, hi);
            for (let i = 0; i < count; i++) {
                const mtype = randomMonsterFamily(this.stage);
                const [ex, ey] = randomMonsterSpawnPosition(p.x, p.y, room.obstacles);
                const elite = mtype !== "summoner" && Math.random() < ELITE_SPAWN_CHANCE;
                this.monsters.push(resetTimers(new Monster(ex, ey, mtype, this.stage, null, elite)));
            }
        } else if (room.type === "boss" && !room.cleared) {
            this.monsters.push(resetTimers(new Boss(SCREEN_W / 2, PLAY_TOP + 110, this.stage)));
        }
    }

    // ---------------- 몬스터 사망 ----------------
    killMonster(m) {
        const now = this.now, p = this.player;
        spawnDeathBurst(this.particles, m.x, m.y, m.color, now, DEATH_PARTICLE_COUNT * (m.isBoss ? 2 : 1));
        const idx = this.monsters.indexOf(m);
        if (idx >= 0) this.monsters.splice(idx, 1);
        if (m.laser) { const li = this.lasers.indexOf(m.laser); if (li >= 0) this.lasers.splice(li, 1); }

        this.totalKills += 1;
        this.score += SCORE_PER_KILL;
        if (m.isElite) this.score += SCORE_PER_ELITE_KILL;

        if (m.subtype === "exploder") {
            spawnDeathBurst(this.particles, m.x, m.y, EXPLODER_COLOR, now, DEATH_PARTICLE_COUNT * 2);
            spawnHazard(this.hazards, m.x, m.y, EXPLODER_HAZARD_RADIUS, scaleDmg(HAZARD_DAMAGE, m.power), now, EXPLODER_COLOR);
            if (hypot(p.x - m.x, p.y - m.y) < EXPLODER_BLAST_RADIUS && now >= p.invulnUntil) {
                const dmg = scaleDmg(EXPLODER_BLAST_DMG, m.power);
                p.hp -= dmg;
                p.invulnUntil = now + PLAYER_INVULN_MS;
                this.popup(p.x, p.y - p.radius - 10, `-${dmg}`, [255, 140, 40]);
                this.shake(SCREEN_SHAKE_BOSS_DASH);
            }
        }
        if (m.subtype === "splitter" && this.monsters.length < MAX_MONSTERS_PER_ROOM + 4) {
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
            p.hp = Math.min(p.maxHp, p.hp + ELITE_KILL_HEAL);
            this.popup(p.x, p.y - p.radius - 10, `+${ELITE_KILL_HEAL}`, [120, 255, 120]);
        }
        if (now - this.comboLastKillTime <= COMBO_WINDOW_MS) this.comboCount += 1; else this.comboCount = 1;
        this.comboLastKillTime = now;
        if (this.comboCount >= 2) this.popup(m.x, m.y - m.radius - 26, `${this.comboCount} KILL!`, [90, 220, 255]);
    }

    damageByEffect(m, dmg, color) {
        if (!this.monsters.includes(m) || m.hp <= 0) return;
        m.hp -= dmg;
        m.hitFlashUntil = this.now + HIT_FLASH_MS;
        resetMonsterRage(m, this.now);
        this.popup(m.x + 8, m.y - m.radius - 18, `-${fmtNum(dmg)}`, color);
        if (m.hp <= 0) this.killMonster(m);
    }

    // ---------------- 한 칸 진행 ----------------
    step() {
        // 이미지를 크게 보는 동안은 시간이 멈춘다 (풀이 시간에도 안 들어감)
        if (this.paused || this.ended || ZoomView.isOpen) return;
        this.now += FRAME_MS;
        const now = this.now;
        if (this.stageMessage && now >= this.stageMessageUntil) this.stageMessage = "";

        if (!this.gameOver && !this.quiz) this.updateWorld(now);
        if (this.quiz && this.quiz.pressed && now >= this.quiz.pressedUntil) this.quiz.pressed = null;

        if (this.gameOver) {
            if (this.endDelayStart === null) this.endDelayStart = now;
            if (now - this.endDelayStart > 2200 && !this.ended) {
                this.ended = true;
                Input.releaseJoystick();
                this.onEnd({ died: true, score: this.score, stage: this.stage, kills: this.totalKills });
            }
        }
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
            p.x += mx * p.speed; p.y += my * p.speed;
            p.facingX = mx / len; p.facingY = my / len;
            p.velX = mx * p.speed; p.velY = my * p.speed;
        } else { p.velX = 0; p.velY = 0; }
        this.clampToPlay(p);
        [p.x, p.y] = pushCircleOutOfObstacles(p.x, p.y, p.radius, obstacles);
        this.clampToPlay(p);

        // ---- 방 이동 ----
        if (!inBattle) {
            const next = checkRoomTransition(p, room);
            if (next) {
                this.currentCoord = next;
                this.loadRoom(next);
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
                    this.popup(p.x, p.y - p.radius - 26, `${gun.name} 획득!`, gun.borderColor);
                    spawnDeathBurst(this.particles, gx, gy, gun.color, now, DEATH_PARTICLE_COUNT);
                    break;
                }
            }
            const portal = room.portal;
            if (portal && hypot(p.x - portal[0], p.y - portal[1]) < PORTAL_RADIUS + p.radius * 0.5) {
                this.stage += 1;
                [this.rooms, this.currentCoord] = generateDungeon();
                this.loadRoom(this.currentCoord);
                room = this.room; obstacles = room.obstacles || [];
                inBattle = false;
                this.stageMessage = `STAGE ${this.stage}`;
                this.stageMessageUntil = now + 1200;
            }
        }

        // ---- 자동 공격 ----
        if (inBattle && this.monsters.length) {
            const target = nearestMonster(p, this.monsters);
            const interval = 1000 / p.shotsPerSec;
            if (target && now - p.lastShotTime > interval) {
                p.lastShotTime = now;
                const tdx = target.x - p.x, tdy = target.y - p.y, td = hypot(tdx, tdy);
                if (td > 0) this.bullets.push(...makePlayerBullets(p, tdx / td, tdy / td));
            }
        }

        // ---- 분신 수명 ----
        if (this.monsters.length) this.monsters = this.monsters.filter(mm => !(mm.isMirrorClone && now >= (mm.expireAt || 0)));

        // ---- 화염 지속 피해 ----
        for (const m of this.monsters.slice()) {
            const burn = burnTickDue(m, now);
            if (burn !== null) this.damageByEffect(m, burn, GUN_ELEMENTS.fire[1]);
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
            const stunned = monsterIsStunned(m, now);
            if (stunned) { /* 기절: 아무것도 못 함 */ }
            else if (m.isBoss) {
                updateBossMonster(m, p, this.bullets, monsters, now, canAttack, this.hazards, this.lasers);
                if (m.enrageJustTriggered) {
                    m.enrageJustTriggered = false;
                    this.shake(SCREEN_SHAKE_BOSS_DASH, SCREEN_SHAKE_DURATION_MS * 2);
                    this.popup(m.x, m.y - m.radius - 30, "분노!", [255, 90, 40]);
                }
            } else if (m.type === "melee") updateMeleeMonster(m, p, now, canAttack);
            else if (m.type === "summoner") updateSummonerMonster(m, p, monsters, now, canAttack);
            else updateRangedMonster(m, p, this.bullets, now, canAttack, this.hazards);

            if (slowed) {
                if (m.speed === savedSpeed * (1 - m.slowPct)) m.speed = savedSpeed;
                if (m.dashSpeed === savedDash * (1 - m.slowPct)) m.dashSpeed = savedDash;
            }

            const md = hypot(p.x - m.x, p.y - m.y);
            if (canAttack && !stunned && md < p.radius + m.radius) {
                if (now - m.lastTouchTime > TOUCH_DAMAGE_COOLDOWN && now >= p.invulnUntil) {
                    p.hp -= m.touchDamage;
                    m.lastTouchTime = now;
                    p.invulnUntil = now + PLAYER_INVULN_MS;
                    const [px, py] = md > 0 ? [(p.x - m.x) / md, (p.y - m.y) / md] : [0, -1];
                    p.x += px * KNOCKBACK_PLAYER_DIST; p.y += py * KNOCKBACK_PLAYER_DIST;
                    this.clampToPlay(p);
                    this.popup(p.x, p.y - p.radius - 10, `-${m.touchDamage}`, [255, 90, 90]);
                    this.shake(m.isBoss && m.dashState === "dashing" ? SCREEN_SHAKE_BOSS_DASH : SCREEN_SHAKE_HIT);
                }
            }
            this.clampToPlay(m);
            [m.x, m.y] = pushCircleOutOfObstacles(m.x, m.y, m.radius, obstacles,
                Math.max(MONSTER_WALL_SLIDE, m.speed * 1.15 + 0.3), m, [p.x, p.y]);
            this.clampToPlay(m);
        }
        if (monsters.length > 1) {
            resolveMonsterOverlaps(monsters);
            for (const m of monsters) this.clampToPlay(m);
        }

        // ---- 총알 ----
        for (const b of this.bullets.slice()) {
            if (!this.bullets.includes(b)) continue;
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
                    if (hypot(b.x - m.x, b.y - m.y) >= m.radius + b.radius) continue;
                    const gun = b.gun;
                    let damage = b.damage * lightDamageMultiplier(gun, m);
                    const crit = Math.random() < CRIT_CHANCE;
                    if (crit) damage *= CRIT_MULTIPLIER;
                    m.hp -= damage;
                    m.hitFlashUntil = now + HIT_FLASH_MS;
                    resetMonsterRage(m, now);
                    m.x += b.dirX * KNOCKBACK_MONSTER_DIST; m.y += b.dirY * KNOCKBACK_MONSTER_DIST;
                    this.clampToPlay(m);
                    this.popup(m.x, m.y - m.radius - 6, `-${fmtNum(damage)}${crit ? "!" : ""}`, crit ? [255, 170, 60] : [255, 255, 255]);

                    if (b.pierceLeft > 0) { b.pierceLeft -= 1; b.damage *= WIND_PIERCE_DAMAGE_MULT; b.hitSet.add(m); }
                    else this.removeBullet(b);

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
                    if (m.hp <= 0) this.killMonster(m);
                    break;
                }
            } else if (hypot(b.x - p.x, b.y - p.y) < p.radius + b.radius) {
                if (now >= p.invulnUntil) {
                    p.hp -= b.damage;
                    p.invulnUntil = now + PLAYER_INVULN_MS;
                    p.x += b.dirX * KNOCKBACK_PLAYER_DIST; p.y += b.dirY * KNOCKBACK_PLAYER_DIST;
                    this.clampToPlay(p);
                    this.popup(p.x, p.y - p.radius - 10, `-${b.damage}`, [255, 90, 90]);
                    this.shake(SCREEN_SHAKE_HIT);
                }
                this.removeBullet(b);
            }
        }

        // ---- 장판 ----
        this.hazards = this.hazards.filter(h => h.isAlive(now));
        for (const h of this.hazards) {
            if (!h.isActive(now) || !h.contains(p.x, p.y, p.radius * 0.6)) continue;
            if (now < h.nextTickTime || now < p.invulnUntil) continue;
            p.hp -= h.damage;
            h.nextTickTime = now + HAZARD_TICK_MS;
            p.invulnUntil = now + PLAYER_INVULN_MS;
            this.popup(p.x, p.y - p.radius - 10, `-${h.damage}`, [170, 255, 120]);
            this.shake(SCREEN_SHAKE_HIT);
        }
        // ---- 회전 레이저 ----
        for (const L of this.lasers) {
            const was = L.state === "active";
            L.update(now);
            if (L.state === "active" && !was) this.shake(SCREEN_SHAKE_HIT);
            if (!L.hits(p.x, p.y, p.radius * 0.7)) continue;
            if (now < L.nextTickTime || now < p.invulnUntil) continue;
            p.hp -= L.damage;
            L.nextTickTime = now + LASER_TICK_MS;
            p.invulnUntil = now + PLAYER_INVULN_MS;
            this.popup(p.x, p.y - p.radius - 10, `-${L.damage}`, [255, 120, 120]);
            this.shake(SCREEN_SHAKE_BOSS_DASH);
        }

        for (const pt of this.particles) pt.update();
        this.particles = this.particles.filter(pt => pt.alive(now));
        this.popups = this.popups.filter(pp => pp.alive(now));
        this.zaps = this.zaps.filter(z => now - z[4] < LIGHTNING_ZAP_MS);

        // ---- 전투 종료 ----
        if (inBattle && !this.monsters.length) {
            room.cleared = true;
            this.bullets = []; this.hazards = []; this.lasers = [];
            if (room.type === "boss") {
                this.stageMessage = `STAGE ${this.stage} CLEAR!`;
                this.stageMessageUntil = now + 1600;
                this.score += SCORE_PER_STAGE_CLEAR;
                p.hp = Math.min(p.maxHp, p.hp + 4);
                this.zaps = [];
                [room.gunChoices, room.portal] = placeBossRewards(rollGunChoices(), obstacles, p.x, p.y);
                room.rewardActiveAt = now + REWARD_PICKUP_DELAY_MS;
            } else {
                this.startQuiz();
            }
        }

        if (p.hp <= 0 && !this.gameOver) { this.gameOver = true; Input.releaseJoystick(); }
    }

    removeBullet(b) { const i = this.bullets.indexOf(b); if (i >= 0) this.bullets.splice(i, 1); }

    // =============================================================
    // 문제 풀이 (O/X)
    // =============================================================
    startQuiz() {
        const problems = Problems.loadWithReviews();
        if (!problems.length) return;
        const [questions, flags] = pickQuizQuestions(problems, QUESTIONS_PER_ROOM);
        Input.releaseJoystick();      // 문제 화면에서는 조이패드 대신 터치/클릭으로 고른다
        this.quiz = {
            phase: "answering", questions, flags, index: 0, selected: null,
            pressed: null, pressedUntil: 0, correct: 0,
            perfectHeal: 0, penalty: 0, reviewInfo: null,
            questionStart: this.now, phaseChangedAt: this.now,
        };
        // 문제 이미지를 미리 불러둔다
        for (const q of questions) { quizImage(q._qimg); quizImage(q._eimg); }
    }

    // 지금 화면이 터치를 "버튼 누르기"로 받아야 하는지 (조이패드 대신)
    wantsTaps() { return !!this.quiz && !this.paused; }

    flashPressed(name) { this.quiz.pressed = name; this.quiz.pressedUntil = this.now + 120; }

    quizSelect(choice) {
        const q = this.quiz;
        if (!q || q.phase !== "answering") return;
        q.selected = choice;
        this.flashPressed(choice);
    }

    quizSubmit() {
        const q = this.quiz;
        if (!q || q.phase !== "answering" || q.selected === null) return;
        const now = this.now;
        const prob = q.questions[q.index];
        const isCorrect = q.selected === prob.correct;
        if (isCorrect) q.correct += 1; else saveWrongAnswer(prob);
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
                q.phase = "summary";
                q.perfectHeal = perfectQuizHealAmount(this.player, q.correct);
                q.penalty = wrongAnswerPenalty(this.player, q.correct);
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
        const q = this.quiz, p = this.player, c = q.correct, now = this.now;
        // 오답 패널티 (성장 적용 "전" 체력 기준)
        const penalty = wrongAnswerPenalty(p, c);
        if (penalty > 0) {
            p.hp -= penalty;
            this.popup(p.x, p.y - p.radius - 10, `오답 -${fmtNum(penalty)}`, [255, 110, 110]);
        }
        const hpGain = c * PLAYER_HP_GROWTH_PER_CORRECT;
        p.maxHp += hpGain;
        p.hp = Math.min(p.maxHp, p.hp + hpGain);
        p.atk += c * PLAYER_ATK_GROWTH_PER_CORRECT;
        p.shotsPerSec += c * PLAYER_ATTACK_SPEED_GROWTH_PER_CORRECT;
        p.speed = Math.min(PLAYER_MOVE_SPEED_CAP, p.speed + c * PLAYER_MOVE_SPEED_GROWTH_PER_CORRECT);
        const heal = perfectQuizHealAmount(p, c);
        if (heal > 0) {
            p.hp = Math.min(p.maxHp, p.hp + heal);
            this.popup(p.x, p.y - p.radius - 26, `만점 +${fmtNum(heal)}`, [255, 215, 90]);
        }
        this.quiz = null;
        Input.releaseJoystick();
        if (p.hp <= 0 && !this.gameOver) this.gameOver = true;
        void now;
    }

    // 문제/해설 이미지 크게 보기
    openZoom(src) {
        if (!src || ZoomView.isOpen) return;
        Input.releaseJoystick();
        ZoomView.open(src, () => { if (this.quiz) this.quiz.phaseChangedAt = this.now; });
    }

    // 터치/클릭 (게임 좌표)
    onTap(x, y) {
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
        if (code === "Escape" || code === "KeyP") { if (!this.gameOver) this.setPaused(!this.paused); return; }
        const q = this.quiz;
        if (!q || this.paused) return;
        if (code === "KeyZ" && q.phase !== "summary") {
            const prob = q.questions[q.index];
            this.openZoom(q.phase === "result" ? (prob._eimg || prob._qimg) : prob._qimg);
            return;
        }
        const enter = code === "Enter" || code === "NumpadEnter" || code === "Space";
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
        if (now < this.shakeUntil && !this.paused) {
            ctx.translate(randInt(-this.shakeMagnitude, this.shakeMagnitude), randInt(-this.shakeMagnitude, this.shakeMagnitude));
        }
        if (this.quiz) {
            drawQuizScreen(ctx, this.quiz, now, Input.lastType === "touch");
        } else {
            const room = this.room;
            drawGame(ctx, {
                room, player: this.player, hazards: this.hazards, obstacles: room.obstacles || [],
                lasers: this.lasers, monsters: this.monsters, bullets: this.bullets, zaps: this.zaps,
                particles: this.particles, popups: this.popups, stage: this.stage, score: this.score,
                elapsedMs: now, input: Input, rooms: this.rooms, currentCoord: this.currentCoord,
                gameOver: this.gameOver, stageMessage: this.stageMessage,
            }, now);
        }
        ctx.restore();
    }
}
