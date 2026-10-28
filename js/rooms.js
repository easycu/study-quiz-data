// =============================================================
// 특수 방: 보물방 / 상점 / 운명의 제단
//   - 방 가운데의 물건에 다가가면 화면이 열린다
//   - 상점: 골드로 카드·회복 구입 / 제단: 체력을 바치고 보상 뽑기 / 보물: 희귀 이상 카드 3장 중 1장
// =============================================================
"use strict";

const SPECIAL_X = SCREEN_W / 2, SPECIAL_Y = (PLAY_TOP + PLAY_BOTTOM) / 2;
function isSpecialRoom(room) { return room.type === "treasure" || room.type === "shop" || room.type === "altar"; }

function shopPrice(base) { return Math.max(1, Math.round(base * (1 - Meta.bonus("discount")))); }

function initSpecialRoom(g, room) {
    if (room.type === "treasure") room.special = { opened: false };
    else if (room.type === "altar") room.special = { uses: 0, near: false };
    else if (room.type === "shop") {
        // 일반 2장 + 희귀 이상 1장 (전설이 섞일 수도)
        const a = rollCards(g, 3, {}).filter(c => c.id !== "gold").slice(0, 2), b = rollCards(g, 2, { min: Meta.bonus("shopLegend") > 0 ? "legend" : "rare" }).filter(c => c.id !== "gold" && !a.includes(c)).slice(0, 1);
        const items = [...a, ...b]
            .map(c => ({ id: c.id, price: shopPrice(SHOP_PRICE[c.r]), sold: false }));
        items.push({ id: "_heal", price: shopPrice(SHOP_HEAL_PRICE), sold: false });
        room.special = { items, near: false };
    }
}

function updateSpecialRoom(g, room, now) {
    const p = g.player, sp = room.special;
    if (!sp || g.modalOpen || g.queue.length) return;
    const d = hypot(p.x - SPECIAL_X, p.y - SPECIAL_Y);
    if (room.type === "treasure") {
        if (!sp.opened && d < 44 + p.radius) {
            sp.opened = true;
            g.flashUntil = now + 250; g.flashColor = [255, 220, 120];
            spawnHitSparks(g.particles, SPECIAL_X, SPECIAL_Y, [255, 220, 120], now, 20, true);
            g.shake(6, 300);
            Sound.play("clear", { vol: 0.6 });
            g.dropGold(SPECIAL_X, SPECIAL_Y, randInt(6, 12));
            const n = 3 + Meta.bonus("chest4");
            g.openCardPick({ n, min: "rare", boost: 1.4, title: "보물 상자!", sub: `희귀 이상 카드 ${n}장 중 하나`, color: [255, 215, 90] });
            g.wantSave = true;
        }
        return;
    }
    if (d > 110) sp.near = false;
    if (sp.near || d > 50 + p.radius) return;
    sp.near = true;
    if (room.type === "shop") openShop(g, room);
    else openAltar(g, room);
}

// ---------------- 상점 ----------------
function openShop(g, room) {
    g.cardPick = { mode: "shop", room, title: "꿈의 상점", sub: "골드로 카드를 사세요 · 다 샀으면 나가기", color: [140, 220, 255], openedAt: g.now };
    Sound.play("door", { vol: 0.4 });
    Input.releaseJoystick();
}
function shopItems(cp) { return cp.room.special.items; }
function shopBuy(g, i) {
    const it = shopItems(g.cardPick)[i];
    if (!it) return;
    const p = g.player;
    if (it.sold) return;
    if (g.gold < it.price) { Sound.play("wrong", { vol: 0.4, gap: 200 }); g.cardPick.msg = "골드가 부족해요"; g.cardPick.msgAt = g.now; return; }
    if (it.id === "_heal" && p.hp >= p.maxHp) { g.cardPick.msg = "체력이 이미 가득 찼어요"; g.cardPick.msgAt = g.now; return; }
    g.gold -= it.price;
    it.sold = true;
    if (it.id === "_heal") { g.healPlayer(p.maxHp * SHOP_HEAL_RATIO); Sound.play("heal", { vol: 0.5 }); }
    else g.applyCard(CARD_BY_ID[it.id]);
    g.cardPick.msg = "구입 완료!"; g.cardPick.msgAt = g.now;
    g.wantSave = true;
    // "새로운 기억"처럼 화면이 이어지는 카드는 상점을 잠깐 닫는다
    if (g.queue.length) { g.cardPick = null; g.queue.push(gg => openShop(gg, gg.room)); }
}

// ---------------- 운명의 제단 ----------------
function openAltar(g, room) {
    g.cardPick = { mode: "altar", room, title: "운명의 제단", color: [210, 150, 255], openedAt: g.now,
                   sub: `체력 ${Math.round(ALTAR_HP_COST * 100)}%를 바치면 무언가를 얻습니다 (남은 기회 ${ALTAR_USES - room.special.uses}번)` };
    Sound.play("phase", { vol: 0.35 });
    Input.releaseJoystick();
}
function altarCost(p) { return p.maxHp * ALTAR_HP_COST; }
// 0: 바치기 / 1: 떠나기
function altarChoose(g, i) {
    const cp = g.cardPick, sp = cp.room.special, p = g.player;
    if (i === 1) { g.closeCardPick(); return; }
    if (i !== 0) return;
    if (sp.uses >= ALTAR_USES) { cp.msg = "제단의 힘이 다했어요"; cp.msgAt = g.now; return; }
    const cost = altarCost(p);
    if (p.hp <= cost + 1) { cp.msg = "바칠 체력이 부족해요"; cp.msgAt = g.now; Sound.play("wrong", { vol: 0.4 }); return; }
    p.hp -= cost; sp.uses += 1;
    g.popup(p.x, p.y - p.radius - 10, `-${fmtNum(cost)}`, [210, 120, 255]);
    g.wantSave = true;
    const r = Math.random();
    if (r < Math.max(0.05, 0.25 - Meta.bonus("altarLuck"))) {
        g.addGold(5);
        cp.msg = "꽝...  (위로금 5골드)"; cp.msgAt = g.now;
        cp.sub = `남은 기회 ${ALTAR_USES - sp.uses}번`;
        Sound.play("wrong", { vol: 0.45 });
        g.shake(3);
        return;
    }
    const legend = r < 0.45;
    g.cardPick = null;
    g.flashUntil = g.now + 300; g.flashColor = legend ? [255, 190, 80] : [200, 150, 255];
    g.openCardPick(legend
        ? { n: 3, min: "rare", guarantee: "legend", title: "운명의 선물: 전설!", sub: "전설 카드가 포함된 3장", color: [255, 190, 80] }
        : { n: 3, min: "rare", title: "운명의 선물", sub: "희귀 이상 카드 3장 중 하나", color: [200, 150, 255] });
}
