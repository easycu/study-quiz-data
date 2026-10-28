// =============================================================
// 영구 성장 "꿈가루" + "꿈의 별자리" + 꿈의 심연 + 이어하기 저장
//   - 꿈가루는 줍는 즉시 이 기기에 저장된다 (죽어도 남음)
//   - 별자리는 위에서부터 차례로 밝힌다 (윗별을 1단계 이상 밝혀야 아랫별을 밝힐 수 있음)
//   - 별자리는 언제든 무료로 초기화해서 다시 고를 수 있다
// =============================================================
"use strict";

const KEY_META = "sr_meta", KEY_RUN_SAVE = "sr_run_save";

// 스카이림처럼 별자리마다 갈래가 있는 트리. 이어진 별(parents 중 하나)이 밝아야 밝힐 수 있다.
//   x, y: 별 지도 위치 (0~100) / cost(lv) = (base + step x lv) x COST_SCALE
//   key/per: 효과 합계는 Meta.bonus(key) / cap: 끝별(마지막 특전)
const COST_SCALE = 4.0;       // 시뮬레이션: 별자리 전부 = 엔딩 5~7번 정도
const CONSTELLATIONS = [
    { id: "archer", name: "사수", icon: "🏹", color: [255, 120, 90], desc: "총 피해와 원소 효과", nodes: [
        { id: "a_aim", name: "정조준", max: 3, base: 10, step: 6, key: "dmg", per: 0.04, eff: "모든 피해 +4%", x: 50, y: 88 },
        { id: "a_fast", name: "속사", max: 3, base: 14, step: 8, key: "aspd", per: 0.03, eff: "공격 속도 +3%", x: 30, y: 68, parents: ["a_aim"] },
        { id: "a_crit", name: "급소", max: 3, base: 18, step: 10, key: "crit", per: 0.02, eff: "치명타 확률 +2%", x: 22, y: 46, parents: ["a_fast"] },
        { id: "a_critd", name: "치명상", max: 2, base: 26, step: 14, key: "critDmg", per: 0.15, eff: "치명타 피해 +15%", x: 34, y: 26, parents: ["a_crit"] },
        { id: "a_elem", name: "원소 친화", max: 3, base: 16, step: 10, key: "gunEff", per: 0.1, eff: "총 원소 효과 +10%", x: 72, y: 66, parents: ["a_aim"] },
        { id: "a_arsenal", name: "무기고", max: 2, base: 50, step: 50, key: "gun", per: 1, once: true, eff: "총을 들고 시작 (1단계 일반 · 2단계 레어)", x: 78, y: 40, parents: ["a_elem"] },
        { id: "a_cap", name: "원소 폭발", max: 1, base: 150, step: 0, key: "elemBurst", per: 1, cap: true, eff: "3번 쏠 때마다 1발이 폭발 (주변에 피해의 60%)", x: 56, y: 10, parents: ["a_critd", "a_arsenal"] },
    ] },
    { id: "memory", name: "기억", icon: "✨", color: [200, 150, 255], desc: "기억(스킬)을 더 강하게", nodes: [
        { id: "m_power", name: "기억력", max: 3, base: 10, step: 6, key: "skillDmg", per: 0.06, eff: "기억 피해 +6%", x: 50, y: 88 },
        { id: "m_quick", name: "빠른 회상", max: 3, base: 14, step: 8, key: "skillCd", per: 0.04, eff: "기억 쿨타임 -4%", x: 28, y: 66, parents: ["m_power"] },
        { id: "m_res", name: "공명", max: 2, base: 18, step: 12, key: "synBonus", per: 0.1, eff: "시너지 피해 배율 +0.1", x: 72, y: 66, parents: ["m_power"] },
        { id: "m_start", name: "첫 기억", max: 1, base: 45, step: 0, key: "startSkill", per: 1, eff: "무작위 기억 하나를 들고 시작", x: 22, y: 40, parents: ["m_quick"] },
        { id: "m_chain", name: "연속 시전", max: 1, base: 40, step: 0, key: "castGap", per: 200, eff: "기억 사이 간격 0.5초 → 0.3초", x: 44, y: 44, parents: ["m_quick"] },
        { id: "m_well", name: "기억의 샘", max: 2, base: 20, step: 12, key: "newSkillW", per: 0.5, eff: "'새로운 기억' 카드가 더 자주 (+50%)", x: 76, y: 40, parents: ["m_res"] },
        { id: "m_cap", name: "네 번째 기억", max: 1, base: 160, step: 0, key: "slot4", per: 1, cap: true, eff: "기억 칸이 4개로", x: 40, y: 12, parents: ["m_start", "m_chain"] },
    ] },
    { id: "dash", name: "질주", icon: "💨", color: [140, 220, 255], desc: "대시와 회피", nodes: [
        { id: "d_light", name: "가벼운 몸", max: 3, base: 10, step: 6, key: "dashCd", per: 0.06, eff: "대시 쿨타임 -6%", x: 50, y: 88 },
        { id: "d_long", name: "긴 무적", max: 2, base: 18, step: 12, key: "dashInv", per: 50, eff: "대시 무적 +0.05초", x: 30, y: 64, parents: ["d_light"] },
        { id: "d_far", name: "먼 돌진", max: 2, base: 14, step: 8, key: "dashDist", per: 0.15, eff: "대시 거리 +15%", x: 70, y: 64, parents: ["d_light"] },
        { id: "d_sense", name: "완벽한 감각", max: 2, base: 22, step: 14, key: "perfectAspd", per: 0.2, eff: "완벽 회피 후 2초간 공격 속도 +20%", x: 24, y: 40, parents: ["d_long"] },
        { id: "d_ready", name: "준비된 발", max: 1, base: 45, step: 0, key: "startDash", per: 1, eff: "무작위 대시 기억을 들고 시작", x: 76, y: 40, parents: ["d_far"] },
        { id: "d_two", name: "이중 도약", max: 1, base: 70, step: 0, key: "dashCharge", per: 1, eff: "대시 충전 +1회", x: 40, y: 24, parents: ["d_sense", "d_ready"] },
        { id: "d_cap", name: "돌진 공격", max: 1, base: 150, step: 0, key: "dashRam", per: 1.5, cap: true, eff: "대시로 통과한 적에게 공격력의 150% 피해", x: 56, y: 8, parents: ["d_two"] },
    ] },
    { id: "guard", name: "수호", icon: "🛡", color: [110, 190, 255], desc: "체력과 생존", nodes: [
        { id: "g_hp", name: "생명", max: 5, base: 8, step: 6, key: "hp", per: 8, eff: "최대 체력 +8", x: 50, y: 88 },
        { id: "g_heal", name: "회복", max: 3, base: 14, step: 8, key: "clearHeal", per: 0.02, eff: "방 클리어 때 최대 체력의 2% 회복", x: 28, y: 66, parents: ["g_hp"] },
        { id: "g_inv", name: "단단함", max: 3, base: 16, step: 10, key: "invuln", per: 80, eff: "맞은 뒤 무적 +0.08초", x: 72, y: 66, parents: ["g_hp"] },
        { id: "g_regen", name: "재생", max: 3, base: 20, step: 12, key: "regen", per: 0.003, eff: "전투 중 매초 최대 체력의 0.3% 회복", x: 22, y: 40, parents: ["g_heal"] },
        { id: "g_armor", name: "철갑", max: 3, base: 22, step: 12, key: "armor", per: 0.04, eff: "받는 피해 -4%", x: 78, y: 42, parents: ["g_inv"] },
        { id: "g_shield", name: "방패술", max: 2, base: 24, step: 14, key: "roomShield", per: 0.06, eff: "전투 시작 보호막 (최대 체력 6%)", x: 66, y: 20, parents: ["g_armor"] },
        { id: "g_cap", name: "불사조", max: 1, base: 170, step: 0, key: "revive", per: 1, cap: true, eff: "판마다 한 번 부활 (체력 50%)", x: 36, y: 10, parents: ["g_regen"] },
    ] },
    { id: "wisdom", name: "지혜", icon: "📖", color: [255, 215, 100], desc: "공부할수록 강해지는 별", nodes: [
        { id: "s_focus", name: "집중", max: 1, base: 30, step: 0, key: "focus", per: 1, eff: "연속 정답 2번부터 카드 4장 (원래 3번)", x: 50, y: 88 },
        { id: "s_joy", name: "정답의 기쁨", max: 2, base: 14, step: 10, key: "correctHeal", per: 0.05, eff: "정답 회복 +5% (잃은 체력 기준)", x: 30, y: 66, parents: ["s_focus"] },
        { id: "s_soft", name: "실수 만회", max: 2, base: 14, step: 10, key: "wrongSoft", per: 0.5, eff: "오답 체력 감소 -50%", x: 70, y: 66, parents: ["s_focus"] },
        { id: "s_review", name: "복습의 보람", max: 2, base: 18, step: 12, key: "reviewDust", per: 3, eff: "복습일이 된 문제를 맞히면 꿈가루 +3", x: 18, y: 44, parents: ["s_joy"] },
        { id: "s_luck", name: "행운 카드", max: 5, base: 12, step: 8, key: "luck", per: 0.03, eff: "희귀·전설 카드 확률 +3%", x: 40, y: 38, parents: ["s_joy"] },
        { id: "s_note", name: "오답 노트", max: 1, base: 60, step: 0, key: "wrongCards", per: 1, eff: "오답이어도 카드 3장", x: 78, y: 40, parents: ["s_soft"] },
        { id: "s_cap", name: "지식의 정점", max: 1, base: 160, step: 0, key: "sage", per: 1, cap: true, eff: "연속 정답 10번마다 전설 카드를 한 번 더 고름", x: 58, y: 12, parents: ["s_luck", "s_note"] },
    ] },
    { id: "luck", name: "행운", icon: "💰", color: [255, 200, 80], desc: "골드·상점·꿈가루", nodes: [
        { id: "l_gold", name: "부자", max: 3, base: 10, step: 6, key: "gold", per: 15, eff: "시작 골드 +15", x: 50, y: 88 },
        { id: "l_haggle", name: "흥정", max: 3, base: 14, step: 8, key: "discount", per: 0.1, eff: "상점 가격 -10%", x: 28, y: 66, parents: ["l_gold"] },
        { id: "l_dust", name: "꿈 수집가", max: 5, base: 14, step: 10, key: "dustPct", per: 0.1, eff: "꿈가루 획득 +10%", x: 72, y: 66, parents: ["l_gold"] },
        { id: "l_chest", name: "보물 사냥", max: 1, base: 50, step: 0, key: "chest4", per: 1, eff: "보물 상자에서 카드 4장", x: 20, y: 42, parents: ["l_haggle"] },
        { id: "l_altar", name: "제단의 축복", max: 2, base: 18, step: 12, key: "altarLuck", per: 0.08, eff: "운명의 제단 꽝 확률 -8%", x: 42, y: 40, parents: ["l_haggle"] },
        { id: "l_star", name: "별점 장인", max: 2, base: 18, step: 12, key: "starGold", per: 0.5, eff: "방 별점 골드 +50%", x: 78, y: 40, parents: ["l_dust"] },
        { id: "l_cap", name: "상점의 전설", max: 1, base: 140, step: 0, key: "shopLegend", per: 1, cap: true, eff: "상점에 전설 카드 1장이 꼭 나옴", x: 32, y: 12, parents: ["l_chest", "l_altar"] },
    ] },
    { id: "hunt", name: "사냥", icon: "⚔", color: [255, 90, 110], desc: "엘리트와 보스", nodes: [
        { id: "h_big", name: "사냥꾼", max: 3, base: 10, step: 8, key: "big", per: 0.08, eff: "엘리트·보스 피해 +8%", x: 50, y: 88 },
        { id: "h_loot", name: "전리품", max: 2, base: 16, step: 10, key: "lootBoost", per: 0.4, eff: "엘리트 전리품 희귀 확률 +40%", x: 28, y: 66, parents: ["h_big"] },
        { id: "h_exec", name: "처형", max: 2, base: 18, step: 12, key: "exec", per: 0.15, eff: "체력 30% 이하 적에게 피해 +15%", x: 72, y: 66, parents: ["h_big"] },
        { id: "h_feast", name: "포식", max: 2, base: 18, step: 12, key: "eliteHeal", per: 0.05, eff: "엘리트 처치 시 최대 체력 5% 회복", x: 22, y: 42, parents: ["h_loot"] },
        { id: "h_boss", name: "보스 킬러", max: 2, base: 22, step: 14, key: "bossDmg", per: 0.1, eff: "보스 피해 +10%", x: 78, y: 42, parents: ["h_exec"] },
        { id: "h_more", name: "사냥 본능", max: 2, base: 16, step: 10, key: "eliteAdd", per: 0.04, eff: "엘리트 등장 +4% (위험도·보상 모두 증가)", x: 36, y: 22, parents: ["h_feast"] },
        { id: "h_cap", name: "왕의 전리품", max: 1, base: 150, step: 0, key: "bossLegend", per: 1, cap: true, eff: "보스 처치 시 전설 카드 선택", x: 64, y: 10, parents: ["h_boss", "h_more"] },
    ] },
];
const NODE_BY_ID = {};
for (const c of CONSTELLATIONS) c.nodes.forEach((n, i) => { NODE_BY_ID[n.id] = Object.assign(n, { cons: c, index: i, parents: n.parents || [] }); });

// ---------------- 수호석: 판마다 하나 고르기 ----------------
// open(meta): 열렸는지
const STONES = [
    { id: "warrior", name: "전사의 돌", icon: "⚔", color: [255, 120, 90], eff: "공격력 +15%", open: () => true },
    { id: "mage", name: "마법사의 돌", icon: "✨", color: [200, 150, 255], eff: "기억 쿨타임 -15%", open: () => true },
    { id: "thief", name: "도적의 돌", icon: "🗝", color: [140, 220, 255], eff: "대시 쿨타임 -20% · 골드 +25%", open: () => true },
    { id: "scholar", name: "학자의 돌", icon: "📖", color: [255, 215, 100], eff: "연속 정답 보상이 한 단계 빨리 (카드 +1장·희귀·전설)", open: M => M.d.endings > 0 || M.level("s_cap") > 0, lock: "엔딩 1번 또는 지혜 끝별" },
    { id: "giant", name: "거인의 돌", icon: "⛰", color: [180, 140, 100], eff: "최대 체력 +30% · 이동 속도 -10%", open: M => M.level("g_cap") > 0, lock: "수호 끝별(불사조)" },
    { id: "shadow", name: "그림자의 돌", icon: "◐", color: [150, 90, 220], eff: "완벽 회피 후 2초간 몬스터가 나를 놓침", open: M => M.level("d_cap") > 0, lock: "질주 끝별(돌진 공격)" },
];
const STONE_BY_ID = {};
for (const st of STONES) STONE_BY_ID[st.id] = st;

const Meta = {
    data: null,
    load() {
        const d = Store.get(KEY_META, null);
        this.data = Object.assign({ dust: 0, spent: 0, totalDust: 0, nodes: {}, maxDepth: 0, endings: 0, bestStage: 0, treeV: 0, stone: "warrior" }, d && typeof d === "object" ? d : {});
        if (!this.data.nodes || typeof this.data.nodes !== "object") this.data.nodes = {};
        // 별자리 구조가 바뀌면(2026-10-28 갈래 트리) 쓴 꿈가루를 모두 돌려준다
        if (this.data.treeV !== 2) {
            this.data.dust += this.data.spent || 0; this.data.spent = 0; this.data.nodes = {};
            this.data.refunded = true; this.data.treeV = 2;
            this.save();
        }
        return this.data;
    },
    get d() { return this.data || this.load(); },
    save() { Store.set(KEY_META, this.d); },
    level(id) { return NODE_BY_ID[id] ? (this.d.nodes[id] || 0) : 0; },
    // 효과 합계 (key 기준)
    bonus(key) {
        let v = 0;
        for (const n of Object.values(NODE_BY_ID)) if (n.key === key) v += this.level(n.id) * n.per;
        return v;
    },
    cost(id) { const n = NODE_BY_ID[id], lv = this.level(id); return lv >= n.max ? Infinity : Math.round((n.base + n.step * lv) * COST_SCALE); },
    unlocked(id) { const n = NODE_BY_ID[id]; return !n.parents.length || n.parents.some(pid => this.level(pid) > 0); },
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
    // 별자리 전체를 다 밝히는 데 드는 꿈가루 (밸런스 확인용)
    totalCost() { let t = 0; for (const n of Object.values(NODE_BY_ID)) for (let lv = 0; lv < n.max; lv++) t += Math.round((n.base + n.step * lv) * COST_SCALE); return t; },
    stoneOk(id) { const st = STONE_BY_ID[id]; return !!st && st.open(this); },
    setStone(id) { if (this.stoneOk(id)) { this.d.stone = id; this.save(); } },
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

// 판 시작할 때 별자리·수호석 효과를 적용
function applyMetaToPlayer(g, stoneId) {
    const p = g.player, M = Meta;
    // 이번 판 전체에 걸리는 값
    RunMods.gunEff = 1 + M.bonus("gunEff");
    RunMods.eliteAdd = M.bonus("eliteAdd");
    RunMods.goldMult = 1;
    // 사수
    p.dmgMult *= 1 + M.bonus("dmg");
    p.aspdPct += M.bonus("aspd");
    p.critBonus += M.bonus("crit");
    p.critDmg += M.bonus("critDmg");
    p.elemBurst = M.bonus("elemBurst");
    const gunLv = M.bonus("gun");
    if (gunLv > 0) p.gun = new Gun(choice(GUN_ELEMENT_ORDER), gunLv >= 2 ? "rare" : "common");
    // 기억
    p.skillDmg = M.bonus("skillDmg"); p.skillCd = M.bonus("skillCd"); p.synBonus = M.bonus("synBonus");
    p.castGapCut = M.bonus("castGap"); p.extraSlot = M.bonus("slot4");
    if (M.bonus("startSkill") > 0) { const id = choice(SKILL_DEFS).id; p.skills.push({ id, level: 0, readyAt: 0 }); }
    // 질주
    p.dashCdPct += M.bonus("dashCd"); p.dashInvBonus += M.bonus("dashInv"); p.dashDistPct += M.bonus("dashDist");
    p.perfectAspd += M.bonus("perfectAspd"); p.dashChargeBonus += M.bonus("dashCharge"); p.dashRam += M.bonus("dashRam");
    if (M.bonus("startDash") > 0) p.dashSkill = { id: choice(DASH_DEFS).id, level: 0 };
    // 수호
    p.maxHp += M.bonus("hp"); p.clearHeal += M.bonus("clearHeal"); p.invulnBonus += M.bonus("invuln");
    p.regenPct = M.bonus("regen"); p.armor = M.bonus("armor"); p.roomShield += M.bonus("roomShield");
    p.revives += M.bonus("revive");
    // 사냥
    p.bigDmg += M.bonus("big"); p.execute += M.bonus("exec"); p.bossDmg = M.bonus("bossDmg");
    p.eliteHeal = M.bonus("eliteHeal");
    // 행운
    g.gold += M.bonus("gold");
    // 수호석
    const st = STONE_BY_ID[stoneId] && Meta.stoneOk(stoneId) ? stoneId : "warrior";
    p.stone = st;
    if (st === "warrior") p.dmgMult *= 1.15;
    else if (st === "mage") p.skillCd += 0.15;
    else if (st === "thief") { p.dashCdPct += 0.2; RunMods.goldMult = 1.25; }
    else if (st === "giant") { p.maxHp *= 1.3; p.speed *= 0.9; }
    else if (st === "shadow") p.perfectStealth = 2000;
    p.hp = p.maxHp;
    p.dashCharges = dashMaxCharges(p);
}
// 연속 정답 보상 조건 (집중의 별 / 학자의 돌)
function streakRules(p) {
    const sch = p.stone === "scholar" ? 1 : 0, focus = Meta.bonus("focus") > 0 ? 1 : 0;
    return { extraAt: Math.max(1, STREAK_FOR_EXTRA_CARD - focus - sch), rareEvery: STREAK_RARE_EVERY - sch, legendEvery: STREAK_LEGEND_EVERY - sch };
}
// 이 판에서 쓰는 기억 칸 수
function playerSkillSlots(p) { return SKILL_SLOTS + (p && p.extraSlot ? 1 : 0); }

// =============================================================
// 이어하기: 방을 깰 때마다 지금 상태를 1칸에 저장
// =============================================================
const PLAYER_SAVE_FIELDS = ["hp", "maxHp", "atk", "shotsPerSec", "speed", "critBonus", "critDmg", "dmgMult", "aspdPct", "bigDmg", "execute",
    "extraShots", "pierceBonus", "lifesteal", "roomShield", "revives", "invulnBonus", "clearHeal",
    "elemBurst", "skillDmg", "skillCd", "synBonus", "castGapCut", "extraSlot", "dashCdPct", "dashInvBonus", "dashDistPct", "dashChargeBonus", "dashRam",
    "perfectAspd", "perfectStealth", "regenPct", "armor", "bossDmg", "eliteHeal"];
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
        pl.dash = p.dashSkill ? [p.dashSkill.id, p.dashSkill.level] : null;
        const rooms = [...g.rooms.values()].map(r => ({
            x: r.x, y: r.y, t: r.type, c: r.cleared, v: r.visited, n: r.connections, sp: r.special || null,
            guns: r.gunChoices ? r.gunChoices.map(([gun, gx, gy]) => [gun.element, gun.grade, gx, gy]) : null, portal: r.portal || null, ep: !!r.endPortal,
        }));
        const data = {
            v: 1, date: todayISO(), stage: g.stage, depth: RunMods.depth, now: g.now, score: g.score, kills: g.totalKills,
            gold: g.gold + (g.drops || []).filter(d => d.kind === "gold").reduce((a, d) => a + d.v, 0), streak: g.streak, stone: p.stone, stats: g.stats, cur: g.currentCoord, rooms, player: pl,
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
        p.dashSkill = s.player.dash && DASH_BY_ID[s.player.dash[0]] ? { id: s.player.dash[0], level: s.player.dash[1] } : null;
        p.stone = STONE_BY_ID[s.stone] ? s.stone : "warrior";
        RunMods.goldMult = p.stone === "thief" ? 1.25 : 1;
        p.dashCharges = dashMaxCharges(p);
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
