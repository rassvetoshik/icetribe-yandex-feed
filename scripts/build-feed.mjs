import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_FEED_URL = "https://icetribe.ru/tstore/yml/6aaa63d2ffe6f090367e6716269e1ab6.yml";

export const OFFER_RULES = [
  ["295827740382", "Инфракрасная сауна с ПЭМП для энергии, похудения и хорошего сна — чёрная, M (рост до 180 см)"],
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
  ["288118574782", "Терапия красным светом — панель Мега Редлайт 1200 Вт"],
  ["776205184672v2", "LED-щётка ICETRIBE с двумя сменными насадками"],
].map(([id, title]) => ({ id, title }));

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

async function main() {
  const response = await fetch(SOURCE_FEED_URL, {
    headers: { "User-Agent": "ICE-TRIBE-Yandex-Feed/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Source feed HTTP ${response.status}`);
  }

  const output = buildFeed(await response.text());
  const outputDirectory = path.resolve("docs");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "yandex-direct.yml"), output, "utf8");
  await writeFile(path.join(outputDirectory, ".nojekyll"), "", "utf8");
  console.log(`Generated ${OFFER_RULES.length} offers in docs/yandex-direct.yml`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
