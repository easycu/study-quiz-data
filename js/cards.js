// =============================================================
// 강화 카드: 방을 깨고 문제를 풀면 고르는 성장
//   - 정답 3장(연속 정답이면 4장), 오답 2장
//   - 일반 / 희귀 / 전설. 3연속 정답마다 희귀, 5연속마다 전설 확정
//   - 엘리트 전리품, 보물방, 상점, 운명의 제단에서도 같은 카드를 쓴다
// =============================================================
"use strict";

// can(g): 지금 나올 수 있는지 / apply(g): 효과 / desc(g): 설명
const CARD_DEFS = [
    // ---------------- 일반 ----------------
    { id: "atk", r: "common", name: "날카로운 탄환", icon: "⚔", color: [255, 120, 90], desc: "공격력 +1.5", apply: g => { g.player.atk += 1.5; } },
    { id: "aspd", r: "common", name: "빠른 손놀림", icon: "»", color: [255, 220, 110], desc: "공격 속도 +0.12/초", apply: g => { g.player.shotsPerSec += 0.12; } },
    { id: "hp", r: "common", name: "튼튼한 몸", icon: "♥", color: [255, 100, 130], desc: "최대 체력 +14 · 그만큼 회복", apply: g => { const p = g.player; p.maxHp += 14; p.hp = Math.min(p.maxHp, p.hp + 14); } },
    { id: "spd", r: "common", name: "가벼운 발", icon: "➶", color: [130, 240, 170], desc: "이동 속도 +0.2", can: g => g.player.speed < PLAYER_MOVE_SPEED_CAP, apply: g => { g.player.speed = Math.min(PLAYER_MOVE_SPEED_CAP, g.player.speed + 0.2); } },
    { id: "crit", r: "common", name: "급소 노리기", icon: "✦", color: [255, 200, 80], desc: "치명타 확률 +4%", can: g => g.player.critBonus < 0.4, apply: g => { g.player.critBonus += 0.04; } },
    { id: "critdmg", r: "common", name: "깊은 상처", icon: "✸", color: [255, 160, 60], desc: "치명타 피해 +25%", apply: g => { g.player.critDmg += 0.25; } },
    { id: "heal", r: "common", name: "따뜻한 꿈", icon: "✚", color: [120, 255, 150], desc: "잃은 체력의 50% 회복", can: g => g.player.hp < g.player.maxHp * 0.8, apply: g => { const p = g.player; p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - p.hp) * 0.5); } },
    { id: "steal", r: "common", name: "흡혈", icon: "❦", color: [230, 70, 90], desc: "적을 처치할 때마다 체력 +1", can: g => g.player.lifesteal < 5, apply: g => { g.player.lifesteal += 1; } },
    { id: "skillup", r: "common", name: "기억 단련", icon: "↑", color: [190, 150, 255], desc: g => `기억 하나 +1 강화 (${g.player.skills.length ? "무작위" : "-"})`,
      can: g => g.player.skills.some(s => s.level < SKILL_MAX_LEVEL),
      apply: g => { const s = choice(g.player.skills.filter(s => s.level < SKILL_MAX_LEVEL)); s.level++; g.popup(g.player.x, g.player.y - 44, `${SKILL_BY_ID[s.id].name} +${s.level}`, skillElementColor(SKILL_BY_ID[s.id].el)); } },
    // ---------------- 희귀 ----------------
    { id: "atk2", r: "rare", name: "파괴의 탄환", icon: "⚔", color: [255, 90, 70], desc: "공격력 +3.5", apply: g => { g.player.atk += 3.5; } },
    { id: "aspd2", r: "rare", name: "연사", icon: "»", color: [255, 230, 90], desc: "공격 속도 +0.28/초", apply: g => { g.player.shotsPerSec += 0.28; } },
    { id: "hp2", r: "rare", name: "거인의 심장", icon: "♥", color: [255, 80, 120], desc: "최대 체력 +32 · 그만큼 회복", apply: g => { const p = g.player; p.maxHp += 32; p.hp = Math.min(p.maxHp, p.hp + 32); } },
    { id: "pierce", r: "rare", name: "꿰뚫는 탄환", icon: "➹", color: [150, 230, 255], desc: "총알이 적 1명 더 관통", can: g => g.player.pierceBonus < 3, apply: g => { g.player.pierceBonus += 1; } },
    { id: "newskill", r: "rare", w: 1.8, name: "새로운 기억", icon: "✧", color: [200, 160, 255], desc: "기억(스킬) 3개 중 하나를 얻거나 강화",
      can: g => rollSkillOffers(g.player).length > 0, apply: g => { g.queueFront(() => g.openSkillPick()); } },
    { id: "gunup", r: "rare", name: "총 다듬기", icon: "▲", color: [255, 210, 120], desc: g => g.player.gun ? `총 등급 한 단계 상승 (${g.player.gun.gradeName} → ${GUN_GRADES[g.player.gun.gradeIndex + 1] ? GUN_GRADES[g.player.gun.gradeIndex + 1][1] : ""})` : "총 등급 상승",
      can: g => !!g.player.gun && g.player.gun.gradeIndex < GUN_GRADES.length - 1,
      apply: g => { const gun = g.player.gun; g.player.gun = new Gun(gun.element, GUN_GRADES[gun.gradeIndex + 1][0]); g.checkSynergy(); } },
    { id: "shield", r: "rare", name: "꿈의 방패", icon: "⛨", color: [150, 210, 255], desc: "전투 시작마다 최대 체력 10% 보호막", can: g => g.player.roomShield < 0.3, apply: g => { g.player.roomShield += 0.1; } },
    { id: "giant", r: "rare", name: "거인 사냥꾼", icon: "☗", color: [255, 140, 100], desc: "엘리트·보스에게 주는 피해 +15%", apply: g => { g.player.bigDmg += 0.15; } },
    { id: "gold", r: "rare", name: "꿈의 금화", icon: "$", color: [255, 215, 90], desc: "골드 +30", apply: g => { g.addGold(30); } },
    // ---------------- 전설 ----------------
    { id: "multishot", r: "legend", name: "쌍발 사격", icon: "⁂", color: [255, 190, 70], desc: "양옆으로 총알 +1쌍 (50% 피해)", can: g => g.player.extraShots < 2, apply: g => { g.player.extraShots += 1; } },
    { id: "revive", r: "legend", name: "불사조의 깃털", icon: "❂", color: [255, 120, 60], desc: "쓰러지면 체력 50%로 한 번 부활", can: g => g.player.revives < 2, apply: g => { g.player.revives += 1; } },
    { id: "awaken", r: "legend", name: "기억 각성", icon: "✺", color: [210, 150, 255], desc: "가진 기억 모두 +1 강화",
      can: g => g.player.skills.some(s => s.level < SKILL_MAX_LEVEL), apply: g => { for (const s of g.player.skills) s.level = Math.min(SKILL_MAX_LEVEL, s.level + 1); } },
    { id: "fury", r: "legend", name: "광전사", icon: "☄", color: [255, 70, 50], desc: "공격력 +6, 공격 속도 +0.3/초", apply: g => { g.player.atk += 6; g.player.shotsPerSec += 0.3; } },
    { id: "execute", r: "legend", name: "처형자", icon: "☠", color: [230, 230, 240], desc: "체력 30% 이하인 적에게 피해 +50%", can: g => g.player.execute < 1, apply: g => { g.player.execute += 0.5; } },
    { id: "legendgun", r: "legend", name: "전설의 총", icon: "★", color: [255, 165, 40], desc: g => g.player.gun ? `지금 총(${g.player.gun.elementName})이 전설 등급으로` : "무작위 전설 총 획득",
      can: g => !g.player.gun || g.player.gun.gradeIndex < 3,
      apply: g => { const p = g.player; p.gun = new Gun(p.gun ? p.gun.element : choice(GUN_ELEMENT_ORDER), "legendary"); g.checkSynergy(); } },
];
const CARD_BY_ID = {};
for (const c of CARD_DEFS) CARD_BY_ID[c.id] = c;
function cardDesc(g, c) { return typeof c.desc === "function" ? c.desc(g) : c.desc; }
function cardOk(g, c) { return !c.can || c.can(g); }

// 희귀도 하나 뽑기 (luck: 별자리 "행운", boost: 엘리트 전리품 등)
function rollRarity(luck, boost) {
    let rare = CARD_RARITY.rare[2] + luck * 0.75, legend = CARD_RARITY.legend[2] + luck * 0.25;
    rare *= boost || 1; legend *= boost || 1;
    const r = Math.random();
    return r < legend ? "legend" : r < legend + rare ? "rare" : "common";
}
// n장 뽑기. o.guarantee: 첫 장을 이 희귀도 이상으로 / o.min: 모든 장을 이 희귀도 이상으로 / o.boost
function rollCards(g, n, o) {
    o = o || {};
    const luck = Meta.bonus("luck"), order = ["common", "rare", "legend"];
    const out = [];
    for (let i = 0; i < n; i++) {
        let rar = rollRarity(luck, o.boost);
        if (o.min && order.indexOf(rar) < order.indexOf(o.min)) rar = o.min;
        if (i === 0 && o.guarantee && order.indexOf(rar) < order.indexOf(o.guarantee)) rar = o.guarantee;
        // 그 희귀도에 고를 카드가 없으면 한 단계씩 낮춘다
        let pick = null;
        for (let k = order.indexOf(rar); k >= 0 && !pick; k--) {
            const pool = CARD_DEFS.filter(c => c.r === order[k] && cardOk(g, c) && !out.includes(c));
            if (pool.length) pick = weightedChoice(pool, pool.map(c => c.w || 1));
        }
        if (pick) out.push(pick);
    }
    return out;
}
