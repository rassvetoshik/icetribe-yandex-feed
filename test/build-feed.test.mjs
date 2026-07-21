import assert from "node:assert/strict";
import test from "node:test";

import { COLLECTION_RULES, buildCatalogPagesFeed, buildFeed } from "../scripts/build-feed.mjs";

const expectedTitles = new Map([
  ["814872761312", "Инфракрасная сауна с ПЭМП для энергии, похудения и хорошего сна — фиолетовая, M (рост до 180 см)"],
  ["298280027412", "Инфракрасная сауна с ПЭМП для энергии, похудения и хорошего сна — чёрная, XL (рост до 205 см)"],
  ["677485475162", "Инфракрасная сауна с ПЭМП для энергии, похудения и хорошего сна — фиолетовая, XL (рост до 205 см)"],
  ["598776759652", "Инфракрасная сауна с ПЭМП для энергии, похудения и хорошего сна — аквамарин, M (рост до 180 см)"],
  ["803084408192", "Ванна для закаливания ICE TRIBE «Айс Купель»"],
  ["654492486722", "Ванна для закаливания ICE TRIBE «Айс Ванна Про 150 см»"],
  ["402271374662", "Ванна для закаливания ICE TRIBE «Тундра Про»"],
  ["979005474422v1", "Инфракрасная кепка для роста волос"],
  ["186761541822", "Энерджи ПЭМП-мат для восстановления и снижения стресса"],
  ["134090264742", "Офис ПЭМП-мат для восстановления и снижения стресса"],
  ["961362605513", "ПЭМП-пояс для восстановления и снижения стресса"],
  ["821685486332", "Терапия красным светом — панель Супер Редлайт 420 Вт"],
  ["776205184672v2", "LED-щётка ICETRIBE с двумя сменными насадками"],
]);

const sourceFeed = () => `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-07-17 10:00"><shop>
<name>ICE TRIBE</name><company>ICE TRIBE</company><url>https://icetribe.ru</url>
<currencies><currency id="RUR" rate="1"/></currencies>
<categories><category id="1">Выбранное</category><category id="2">Лишнее</category></categories>
<offers>${[...expectedTitles.keys(), "not-selected"].map((id, index) => `
<offer id="${id}" available="true"><name>Source name ${index}</name><url>https://example.test/${id}</url><price>${1000 + index}</price><currencyId>RUR</currencyId><categoryId>${id === "not-selected" ? 2 : 1}</categoryId><picture>https://example.test/${id}.jpg</picture></offer>`).join("")}
</offers></shop></yml_catalog>`;

const offersFrom = (xml) => [...xml.matchAll(/<offer\s+([^>]*)>([\s\S]*?)<\/offer>/g)].map((match) => ({
  id: match[1].match(/\bid="([^"]+)"/)?.[1],
  name: match[2].match(/<name>([\s\S]*?)<\/name>/)?.[1],
  url: match[2].match(/<url>([\s\S]*?)<\/url>/)?.[1],
  price: match[2].match(/<price>([\s\S]*?)<\/price>/)?.[1],
  picture: match[2].match(/<picture>([\s\S]*?)<\/picture>/)?.[1],
}));

test("publishes only approved offers with agreed names and source commerce fields", () => {
  const source = sourceFeed();
  const sourceOffersById = new Map(offersFrom(source).map((offer) => [offer.id, offer]));
  const output = buildFeed(source, new Date("2026-07-17T10:15:30.000Z"));
  const offers = offersFrom(output);

  assert.match(output, /<yml_catalog date="2026-07-17 13:15">/);
  assert.equal(offers.length, 13);
  assert.deepEqual(new Set(offers.map((offer) => offer.id)), new Set(expectedTitles.keys()));

  for (const [id, title] of expectedTitles) {
    const offer = offers.find((item) => item.id === id);
    assert.equal(offer.name, title);
    assert.equal(offer.url, `https://example.test/${id}`);
    assert.equal(offer.picture, `https://example.test/${id}.jpg`);
    assert.equal(offer.price, sourceOffersById.get(id).price);
  }
});

test("rejects a source feed that lacks an approved offer", () => {
  const incomplete = sourceFeed().replace(/<offer id="776205184672v2"[\s\S]*?<\/offer>/, "");
  assert.throws(() => buildFeed(incomplete, new Date("2026-07-17T10:15:30.000Z")), /776205184672v2/);
});

test("catalog-pages feed contains collections and links every approved offer to one", () => {
  const output = buildCatalogPagesFeed(sourceFeed(), new Date("2026-07-17T10:15:30.000Z"));
  const collectionIds = [...output.matchAll(/<collection id="([^"]+)">/g)].map((match) => match[1]);
  const linkedOffers = [...output.matchAll(/<offer\s+[^>]*id="([^"]+)"[^>]*>[\s\S]*?<collectionId>([^<]+)<\/collectionId>[\s\S]*?<\/offer>/g)]
    .map((match) => ({ offerId: match[1], collectionId: match[2] }));

  assert.deepEqual(new Set(collectionIds), new Set(COLLECTION_RULES.map(({ id }) => id)));
  assert.equal(linkedOffers.length, 13);
  assert.deepEqual(new Set(linkedOffers.map(({ offerId }) => offerId)), new Set(expectedTitles.keys()));
  assert.ok(linkedOffers.every(({ collectionId }) => collectionIds.includes(collectionId)));
  assert.match(output, /<url>https:\/\/icetribe\.ru\/katalog#rec768081152<\/url>/);
});
