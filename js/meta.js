// =============================================================
// 영구 성장 "꿈가루" + "꿈의 별자리" + 꿈의 심연 + 이어하기 저장
//   - 꿈가루는 줍는 즉시 이 기기에 저장된다 (죽어도 남음)
//   - 별자리는 위에서부터 차례로 밝힌다 (윗별을 1단계 이상 밝혀야 아랫별을 밝힐 수 있음)
//   - 별자리는 언제든 무료로 초기화해서 다시 고를 수 있다
// =============================================================
"use strict";

const KEY_META = "sr_meta", KEY_RUN_SAVE = "sr_run_save";

// cost(lv): lv단계 -> lv+1단계로 올리는 비용
const CONSTELLATIONS = [
    { id: "war", name: "전투의 별자리", color: [255, 110, 90], nodes: [
        { id: "w_dmg", name: "날카로운 꿈", max: 5, base: 8, step: 6, eff: "모든 피해 +4%", key: "dmg", per: 0.04 },
        { id: "w_crit", name: "치명의 별", max: 3, base: 16, step: 10, eff: "치명타 확률 +2%", key: "crit", per: 0.02 },
        { id: "w_aspd", name: "연사의 별", max: 5, base: 14, step: 8, eff: "공격 속도 +3%", key: "aspd", per: 0.03 },
        { id: "w_big", name: "사냥꾼의 별", max: 3, base: 24, step: 14, eff: "엘리트·보스 피해 +8%", key: "big", per: 0.08 },
        { id: "w_gun", name: "무기고", max: 2, base: 60, step: 70, eff: "총을 들고 시작 (1단계 일반 · 2단계 레어)", key: "gun", per: 1, once: true },
    ] },
    { id: "guard", name: "수호의 별자리", color: [110, 190, 255], nodes: [
        { id: "g_hp", name: "생명의 별", max: 5, base: 8, step: 6, eff: "최대 체력 +8", key: "hp", per: 8 },
        { id: "g_heal", name: "회복의 별", max: 3, base: 16, step: 10, eff: "방 클리어 때 최대 체력의 2% 회복", key: "clearHeal", per: 0.02 },
        { id: "g_inv", name: "단단한 별", max: 3, base: 18, step: 12, eff: "맞은 뒤 무적 시간 +0.08초", key: "invuln", per: 80 },
        { id: "g_spd", name: "바람의 별", max: 3, base: 20, step: 12, eff: "이동 속도 +3%", key: "spd", per: 0.03 },
        { id: "g_rev", name: "불사조의 별", max: 1, base: 180, step: 0, eff: "판마다 한 번 부활 (체력 50%)", key: "revive", per: 1 },
    ] },
    { id: "wis", name: "지혜의 별자리", color: [255, 215, 100], nodes: [
        { id: "s_luck", name: "행운의 별", max: 5, base: 10, step: 8, eff: "희귀·전설 카드 확률 +3%", key: "luck", per: 0.03 },
        { id: "s_focus", name: "집중의 별", max: 1, base: 70, step: 0, eff: "연속 정답 2번부터 카드 4장 (원래 3번)", key: "focus", per: 1 },
        { id: "s_dust", name: "꿈 수집가", max: 5, base: 15, step: 10, eff: "꿈가루 획득 +10%", key: "dustPct", per: 0.1 },
        { id: "s_shop", name: "흥정의 별", max: 3, base: 18, step: 12, eff: "상점 가격 -10%", key: "discount", per: 0.1 },
        { id: "s_gold", name: "부자의 별", max: 3, base: 14, step: 10, eff: "시작 골드 +15", key: "gold", per: 15 },
    ] },
];
const NODE_BY_ID = {};
for (const c of CONSTELLATIONS) c.nodes.forEach((n, i) => { NODE_BY_ID[n.id] = Object.assign(n, { cons: c, index: i }); });

const Meta = {
    data: null,
    load() {
        const d = Store.get(KEY_META, null);
        this.data = Object.assign({ dust: 0, spent: 0, totalDust: 0, nodes: {}, maxDepth: 0, endings: 0, bestStage: 0 }, d && typeof d === "object" ? d : {});
        if (!this.data.nodes || typeof this.data.nodes !== "object") this.data.nodes = {};
        return this.data;
    },
    get d() { return this.data || this.load(); },
    save() { Store.set(KEY_META, this.d); },
    level(id) { return this.d.nodes[id] || 0; },
    // 효과 합계 (key 기준)
    bonus(key) {
        let v = 0;
        for (const n of Object.values(NODE_BY_ID)) if (n.key === key) v += this.level(n.id) * n.per;
        return v;
    },
    cost(id) { const n = NODE_BY_ID[id], lv = this.level(id); return lv >= n.max ? Infinity : Math.round((n.base + n.step * lv) * 1.5); },
    unlocked(id) { const n = NODE_BY_ID[id]; return n.index === 0 || this.level(n.cons.nodes[n.index - 1].id) > 0; },
    canBuy(id) { return this.unlocked(id) && this.d.dust >= this.cost(id); },
    buy(id) {
        if (!this.canBuy(id)) return false;
        const c = this.cost(id);
        this.d.dust -= c; this.d.spent += c;
        this.d.nodes[id] = this.level(id) + 1;
        this.save();
        return true;
    },
    reset() { this.d.dust += this.d.spent; this.d.spent = 0; this.d.nodes = {}; this.save(); },
    addDust(v) { this.d.dust += v; this.d.totalDust += v; this.save(); },
    dustMult() { return RunMods.dustMult * (1 + this.bonus("dustPct")); },
    // 엔딩: 이 심연 단계를 깼으면 다음 단계 열기
    onEnding(depth) {
        this.d.endings += 1;
        const opened = depth + 1 > this.d.maxDepth;
        if (opened) this.d.maxDepth = depth + 1;
        this.save();
        return opened;
    },
    noteStage(stage) { if (stage > this.d.bestStage) { this.d.bestStage = stage; this.save(); } },
};

// 판 시작할 때 별자리 효과를 플레이어에게 적용
function applyMetaToPlayer(g) {
    const p = g.player, M = Meta;
    p.dmgMult *= 1 + M.bonus("dmg");
    p.critBonus += M.bonus("crit");
    p.aspdPct += M.bonus("aspd");
    p.bigDmg += M.bonus("big");
    p.maxHp += M.bonus("hp"); p.hp = p.maxHp;
    p.clearHeal += M.bonus("clearHeal");
    p.invulnBonus += M.bonus("invuln");
    p.speed *= 1 + M.bonus("spd");
    p.revives += M.bonus("revive");
    const gunLv = M.bonus("gun");
    if (gunLv > 0) p.gun = new Gun(choice(GUN_ELEMENT_ORDER), gunLv >= 2 ? "rare" : "common");
    g.gold += M.bonus("gold");
}

// =============================================================
// 이어하기: 방을 깰 때마다 지금 상태를 1칸에 저장
// =============================================================
const PLAYER_SAVE_FIELDS = ["hp", "maxHp", "atk", "shotsPerSec", "speed", "critBonus", "critDmg", "dmgMult", "aspdPct", "bigDmg", "execute",
    "extraShots", "pierceBonus", "lifesteal", "roomShield", "revives", "invulnBonus", "clearHeal"];
const RunSave = {
    exists() { const s = Store.get(KEY_RUN_SAVE, null); return s && s.v === 1 ? s : null; },
    clear() { Store.set(KEY_RUN_SAVE, null); try { window.localStorage.removeItem(KEY_RUN_SAVE); } catch (e) { /* 무시 */ } },
    save(g) {
        const p = g.player;
        const pl = {};
        for (const k of PLAYER_SAVE_FIELDS) pl[k] = p[k];
        pl.gun = p.gun ? [p.gun.element, p.gun.grade] : null;
        pl.skills = p.skills.map(s => [s.id, s.level]);
        pl.stacks = p.cardStacks || {};
        const rooms = [...g.rooms.values()].map(r => ({
            x: r.x, y: r.y, t: r.type, c: r.cleared, v: r.visited, n: r.connections, sp: r.special || null,
            guns: r.gunChoices ? r.gunChoices.map(([gun, gx, gy]) => [gun.element, gun.grade, gx, gy]) : null, portal: r.portal || null, ep: !!r.endPortal,
        }));
        const data = {
            v: 1, date: todayISO(), stage: g.stage, depth: RunMods.depth, now: g.now, score: g.score, kills: g.totalKills,
            gold: g.gold + (g.drops || []).filter(d => d.kind === "gold").reduce((a, d) => a + d.v, 0), streak: g.streak, stats: g.stats, cur: g.currentCoord, rooms, player: pl,
        };
        Store.set(KEY_RUN_SAVE, data);
    },
    // 저장한 판을 게임에 다시 펼친다 (game은 새로 만든 Game)
    restore(g, s) {
        g.stage = s.stage; g.now = s.now; g.score = s.score; g.totalKills = s.kills;
        g.gold = s.gold; g.streak = s.streak; g.stats = Object.assign(g.stats, s.stats);
        const p = g.player;
        for (const k of PLAYER_SAVE_FIELDS) if (typeof s.player[k] === "number") p[k] = s.player[k];
        p.gun = s.player.gun ? new Gun(s.player.gun[0], s.player.gun[1]) : null;
        p.skills = (s.player.skills || []).filter(([id]) => SKILL_BY_ID[id]).map(([id, level]) => ({ id, level, readyAt: 0 }));
        p.cardStacks = Object.assign({}, s.player.stacks || {});
        p._synTier = synergyTier(p);
        const rooms = new Map();
        for (const r of s.rooms) {
            const room = new Room(r.x, r.y, r.t);
            room.cleared = r.c; room.visited = r.v; room.connections = r.n; room.special = r.sp;
            if (r.guns) room.gunChoices = r.guns.map(([el, gr, gx, gy]) => [new Gun(el, gr), gx, gy]);
            room.portal = r.portal; room.endPortal = !!r.ep;
            rooms.set(ck(r.x, r.y), room);
        }
        g.rooms = rooms; g.currentCoord = s.cur;
        p.x = Math.floor(SCREEN_W / 2); p.y = Math.floor((PLAY_TOP + PLAY_BOTTOM) / 2);
        g.loadRoom(g.currentCoord, true);
    },
};

// =============================================================
// 오답 노트 도우미
// =============================================================
// 같은 문제는 하나로 묶고, 가장 최근에 틀린 날짜 순으로
function wrongNoteEntries() {
    const list = Store.get(KEY_WRONG, []) || [];
    const by = new Map();
    for (const w of list) {
        if (!w || !w.id) continue;
        const e = by.get(w.id) || { id: w.id, question: w.question, correct: w.correct, explanation: w.explanation, count: 0, last: "", first: w.date };
        e.count++;
        if ((w.date || "") >= e.last) { e.last = w.date || ""; e.question = w.question; e.correct = w.correct; e.explanation = w.explanation; }
        by.set(w.id, e);
    }
    return [...by.values()].sort((a, b) => (b.last || "").localeCompare(a.last || "") || b.count - a.count);
}
function removeWrongNote(id) {
    const list = (Store.get(KEY_WRONG, []) || []).filter(w => w && w.id !== id);
    Store.set(KEY_WRONG, list);
}
