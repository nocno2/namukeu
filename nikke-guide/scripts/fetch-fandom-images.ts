/**
 * Fandom 위키에서 캐릭터 이미지를 가져오는 스크립트
 * 전체 캐릭터 목록 조회
 */

const FANDOM_API = "https://nikke-goddess-of-victory-international.fandom.com/api.php";

interface FandomImageResult {
  name: string;
  url: string;
}

async function getCharacterImage(characterName: string): Promise<FandomImageResult | null> {
  const title = characterName.replace(/ /g, "_");

  const url = `${FANDOM_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query?.pages;

    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (pageId === "-1" || !page.thumbnail) {
      return null;
    }

    return {
      name: characterName,
      url: page.thumbnail.source,
    };
  } catch (error) {
    console.error(`Error fetching image for ${characterName}:`, error);
    return null;
  }
}

// 캐릭터 이름 목록 (rawData에서 추출)
const characters = [
  "Anis: Sparkling Summer",
  "Snow White: Heavy Arms",
  "Brid: Silent Track",
  "Diesel: Winter Sweets",
  "Soline: Frost Ticket",
  "Lilirose",
  "Nayuta",
  "Chime",
  "Delta: Ninja Shift",
  "Jill Valentine",
  "Ada Wong",
  "Milk: Blooming Bunny",
  "Ade: Agent Bunny",
  "Besti: Tactical Up",
  "Eunhwa: Tactical Up",
  "Emma: Tactical Up",
  "Elegg: Boom and Shock",
  "Dorothy: Serendipity",
  "Sora",
  "Raven",
  "Eve",
  "Arcana",
  "Mihara: Bonding Chain",
  "Little Mermaid",
  "Mori",
  "Kruust",
  "Bradi",
  "Trina",
  "Ray (Nikke)",
  "Asuka: WILLE",
  "Anchor: Innocent Maid",
  "Mast: Romantic Maid",
  "Mana",
  "Rapi: Red Hood",
  "Guillotine: Winter Slayer",
  "Maiden: Ice Rose",
  "Flora",
  "Grave",
  "Cinderella",
  "Rapunzel: Pure Grace",
  "Rumani",
  "Phantom",
  "Quency: Escape Queen",
  "Ruzu",
  "Mari",
  "Ray",
  "Asuka",
  "Tsubaki",
  "Ein",
  "Rosanna: Chic Ocean",
  "Sakura: Bloom in Summer",
  "Clay",
  "Alice: Wonderland Bunny",
  "Soda: Twinkling Bunny",
  "Troni",
  "Crown",
  "D: Killer Wife",
  "Privaty: Uncanny Maid",
  "Hongren: Black Shadow",
  "Mica: Snow Buddy",
  "Ludmila: Winter Owner",
  "Snow White: Innocent Days",
  "Helm: Aquamarine",
  "Neon: Blue Ocean",
  "Merry: Bay Goddess",
  "Anne: Miracle Fairy",
  "Rupee: Winter Shopper",
  "Hongren",
  "Snow White",
  "Rapi",
  "N-101",
  "Jackal",
  "Viper",
  "Yuni",
  "Leona",
  "Mary",
  "Liter",
  "Noise",
  "Yuria",
  "Power",
  "Cocoa",
  "Dolla",
  "Miranda",
  "Novel",
  "Poli",
  "Tia",
  "Linden",
  " adenosine",
  "Alteisen",
  "Amina",
  "Apricot",
  "Asta",
  "Belle",
  "Blueprint",
  "Centi",
  "Chakeol",
  "Chapel",
  "Charlotte",
  "Chili",
  "Christina",
  "复合",
  "Cross",
  "Cunning",
  "Deckard",
  "Diana",
  "D_Knight",
  "Edge",
  "Ellen",
  "Eukalion",
  "Eunhwa",
  "Exia",
  "Fairy",
  "Flux",
  "Frima",
  "Gley",
  "Grifer",
  "Guilty",
  "Hana",
  "Hansel",
  "Helm",
  "Hera",
  "Heruka",
  "Holly",
  "Huma",
  "Hyugan",
  "Idol",
  "Ingrid",
  "Jade",
  "Jane",
  "Julia",
  "Junker",
  "Kabocha",
  "Kalis",
  "Kama",
  "Kanon",
  "Kapi",
  "Karla",
  "Katagiri",
  "Kilo",
  "Kira",
  "Kleen",
  "K Duchess",
  "La危险性",
  "Lava",
  "Leon",
  "Linkage",
  "Liu",
  "Lovelace",
  "Luna",
  "Maddie",
  "Maid Guillotine",
  "Mals",
  "Marciana",
  "Mast",
  "Maxwell",
  "May",
  "Mea",
  "Medi",
  "Mei",
  "Metis",
  "Miku",
  "Miliam",
  "Mimi",
  "Mini",
  "Mirak",
  "Miyu",
  "Modric",
  "Mona",
  "Moon",
  "N-102",
  "Nadia",
  "Naed",
  "Naga",
  "Nancy",
  "Nastya",
  "Nero",
  "Nesla",
  "Nika",
  "Nikke_A",
  "Nikke_B",
  "Nightingale",
  "Nimrod",
  "Ninia",
  "Noah",
  "Orr",
  "Papillon",
  "Pazuzu",
  "Penny",
  "Perona",
  "Persicaria",
  "Peuse",
  "Picot",
  "Pinne",
  "Plum",
  "Poppy",
  "Quartz",
  "Queen",
  "Raptured",
  "Rem",
  "Rickets",
  "Rin",
  "Riru",
  "Rita",
  "Rookie",
  "Rosanna",
  "Rou",
  "Rudi",
  "Ruina",
  "Sakura",
  "Samantha",
  "Sana",
  "Sangle",
  "Saying",
  "Sekhmet",
  "Shimmering",
  "Shiro",
  "Signal",
  "Sin",
  "Sindy",
  "SIX",
  "Skadi",
  "Sniper",
  "Soldier",
  "Solin",
  "Soman",
  "Sopia",
  "Sophie",
  "Stella",
  "Sugar",
  "Suid",
  "Summer",
  "Sungen",
  "Sylvia",
  "Taing",
  "Tail",
  "Takeming",
  "Talia",
  "Tanya",
  "Tarvos",
  "Tatsumi",
  "Tel",
  "Terminator",
  "Thelma",
  "Tia & Naga",
  "Tiff",
  "Tokarev",
  "Toppy",
  "Tornado",
  "Toya",
  "Trial",
  "Tristan",
  "Turing",
  "Uranus",
  "Valentine",
  "Valkyrie",
  "Vamp",
  "Vanessa",
  "Vars",
  "Vena",
  "Vestigial",
  "Violet",
  "Wanda",
  "Watte",
  "Witch",
  "X-07",
  "Y",
  "Yan",
  "Yong",
  "Yuki",
  "Yul",
  "Z",
  "Zero",
  "Zoe",
  "Zoya",
];

async function main() {
  console.log("Fetching character images from Fandom wiki...\n");

  const results: Record<string, string> = {};
  let success = 0;
  let failed = 0;

  for (const char of characters) {
    const result = await getCharacterImage(char);
    if (result) {
      results[char] = result.url;
      console.log(`✓ ${char}`);
      success++;
    } else {
      console.log(`✗ ${char}`);
      failed++;
    }
    // Rate limiting
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\n--- Summary ---`);
  console.log(`Success: ${success}, Failed: ${failed}`);
  console.log("\n--- Results ---\n");
  console.log(JSON.stringify(results, null, 2));
}

main();
