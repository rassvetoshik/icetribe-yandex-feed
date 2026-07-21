import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_FEED_URL = "https://icetribe.ru/tstore/yml/6aaa63d2ffe6f090367e6716269e1ab6.yml";

export const OFFER_RULES = [
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
].map(([id, title]) => ({ id, title }));

// These previously approved offers disappeared from Tilda's source feed on 2026-07-21.
// Do not replace them automatically or advertise stale/unavailable products.
export const UNAVAILABLE_SOURCE_OFFERS = [
  "295827740382", // sauna, black, M
  "288118574782", // Mega Redlight 1200 W
];

export const COLLECTION_RULES = [
  {
    id: "cold-plunge-baths",
    url: "https://icetribe.ru/katalog#rec768081152",
    name: "Ванны для закаливания",
    description: "Ледяные ванны IceTribe для восстановления, бодрости и закаливания.",
    offerIds: ["803084408192", "654492486722", "402271374662"],
  },
  {
    id: "pemf-mats",
    url: "https://icetribe.ru/katalog#rec1135055361",
    name: "ПЭМП-маты для восстановления",
    description: "ПЭМП-маты и пояс для восстановления и снижения стресса.",
    offerIds: ["186761541822", "134090264742", "961362605513"],
  },
  {
    id: "infrared-saunas",
    url: "https://icetribe.ru/katalog#rec1135057281",
    name: "Инфракрасные сауны с ПЭМП",
    description: "Инфракрасные сауны с ПЭМП для энергии, сна и восстановления.",
    offerIds: ["814872761312", "298280027412", "677485475162", "598776759652"],
  },
  {
    id: "hair-cap",
    url: "https://icetribe.ru/katalog#rec1270404331",
    name: "Инфракрасная кепка для роста волос",
    description: "Инфракрасная кепка для домашнего ухода и роста волос.",
    offerIds: ["979005474422v1"],
  },
  {
    id: "led-toothbrush",
    url: "https://icetribe.ru/katalog#rec2259199781",
    name: "LED-зубная щётка",
    description: "LED-зубная щётка ICETRIBE с двумя сменными насадками.",
    offerIds: ["776205184672v2"],
  },
  {
    id: "red-light-panels",
    url: "https://icetribe.ru/katalog#rec1342180991",
    name: "Панели красного света",
    description: "Панели красного света для домашней световой терапии.",
    offerIds: ["821685486332"],
  },
];

const escapeXml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const tagValue = (body, tag) => body
  .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]
  ?.replace(/<!\[CDATA\[|\]\]>/g, "")
  .trim() || "";

const formatMoscowDate = (now) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
};

const replaceCatalogDate = (xml, date) => xml.replace(/<yml_catalog\b([^>]*)>/i, (whole, attributes) => {
  const nextAttributes = /\sdate=(['"])[\s\S]*?\1/i.test(attributes)
    ? attributes.replace(/\sdate=(['"])[\s\S]*?\1/i, ` date="${date}"`)
    : `${attributes} date="${date}"`;
  return `<yml_catalog${nextAttributes}>`;
});

export function buildFeed(sourceXml, now = new Date()) {
  const sourceOffers = [...sourceXml.matchAll(/(<offer\s+([^>]*)>)([\s\S]*?)(<\/offer>)/gi)].map((match) => ({
    open: match[1],
    attributes: match[2],
    body: match[3],
    close: match[4],
    id: match[2].match(/\bid=(['"])(.*?)\1/i)?.[2] || "",
  }));
  const offersById = new Map(sourceOffers.map((offer) => [offer.id, offer]));
  const missingIds = OFFER_RULES.filter(({ id }) => !offersById.has(id)).map(({ id }) => id);

  if (missingIds.length) {
    throw new Error(`Source feed is missing approved offer IDs: ${missingIds.join(", ")}`);
  }

  const selectedOffers = OFFER_RULES.map(({ id, title }) => {
    const offer = offersById.get(id);
    if (!/<name\b[^>]*>[\s\S]*?<\/name>/i.test(offer.body)) {
      throw new Error(`Offer ${id} has no <name> element`);
    }

    const body = offer.body.replace(/<name\b[^>]*>[\s\S]*?<\/name>/i, `<name>${escapeXml(title)}</name>`);
    return { ...offer, body, categoryId: tagValue(offer.body, "categoryId") };
  });

  const usedCategoryIds = new Set(selectedOffers.map(({ categoryId }) => categoryId).filter(Boolean));
  const categoriesMatch = sourceXml.match(/<categories>([\s\S]*?)<\/categories>/i);
  if (!categoriesMatch) {
    throw new Error("Source feed has no <categories> element");
  }

  const selectedCategories = [...categoriesMatch[1].matchAll(/<category\s+id=(['"])(.*?)\1[^>]*>[\s\S]*?<\/category>/gi)]
    .filter((match) => usedCategoryIds.has(match[2]))
    .map((match) => match[0]);
  if (selectedCategories.length !== usedCategoryIds.size) {
    throw new Error("Source feed has no category for one or more approved offers");
  }

  let output = sourceXml.replace(/<categories>[\s\S]*?<\/categories>/i, `<categories>${selectedCategories.join("\n")}</categories>`);
  output = output.replace(/<offers>[\s\S]*?<\/offers>/i, `<offers>${selectedOffers.map(({ open, body, close }) => `${open}${body}${close}`).join("\n")}</offers>`);
  return replaceCatalogDate(output, formatMoscowDate(now));
}

const collectionsByOfferId = new Map(
  COLLECTION_RULES.flatMap(({ id, offerIds }) => offerIds.map((offerId) => [offerId, id])),
);

const renderCollections = () => `<collections>${COLLECTION_RULES.map((collection) => `
  <collection id="${collection.id}">
    <url>${escapeXml(collection.url)}</url>
    <name>${escapeXml(collection.name)}</name>
    <description>${escapeXml(collection.description)}</description>
  </collection>`).join("\n")}
</collections>`;

export function buildCatalogPagesFeed(sourceXml, now = new Date()) {
  const feed = buildFeed(sourceXml, now);
  const assignedOfferIds = new Set(COLLECTION_RULES.flatMap(({ offerIds }) => offerIds));
  const approvedOfferIds = new Set(OFFER_RULES.map(({ id }) => id));

  if (assignedOfferIds.size !== approvedOfferIds.size || [...assignedOfferIds].some((id) => !approvedOfferIds.has(id))) {
    throw new Error("Catalog collections must assign every approved offer exactly once");
  }

  let output = feed.replace(/<offer\s+([^>]*)>([\s\S]*?)<\/offer>/gi, (whole, attributes, body) => {
    const id = attributes.match(/\bid=(['"])(.*?)\1/i)?.[2];
    const collectionId = collectionsByOfferId.get(id);
    if (!collectionId) {
      return whole;
    }

    const collectionTag = `<collectionId>${collectionId}</collectionId>`;
    const nextBody = /<collectionId\b[^>]*>[\s\S]*?<\/collectionId>/i.test(body)
      ? body.replace(/<collectionId\b[^>]*>[\s\S]*?<\/collectionId>/i, collectionTag)
      : `${body}${collectionTag}`;
    return `<offer ${attributes}>${nextBody}</offer>`;
  });

  output = output.replace(/\s*<collections>[\s\S]*?<\/collections>/i, "");
  return output.replace(/<\/offers>/i, `</offers>\n${renderCollections()}`);
}

async function main() {
  const response = await fetch(SOURCE_FEED_URL, {
    headers: { "User-Agent": "ICE-TRIBE-Yandex-Feed/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Source feed HTTP ${response.status}`);
  }

  const sourceXml = await response.text();
  const output = buildFeed(sourceXml);
  const catalogPagesOutput = buildCatalogPagesFeed(sourceXml);
  const outputDirectory = path.resolve("docs");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "yandex-direct.yml"), output, "utf8");
  await writeFile(path.join(outputDirectory, "catalog-pages.yml"), catalogPagesOutput, "utf8");
  await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
  console.log(`Generated ${OFFER_RULES.length} offers and ${COLLECTION_RULES.length} catalog pages`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
