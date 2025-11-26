// scripts/config.js

export const MODULE_ID = "warcraft-genesys";

// ID Twojego kompendium ze skillami
export const SKILLS_COMPENDIUM = "warcraft-genesys.warcraft-skills";

// Lista umiejętności do usunięcia (System Core + Sci-Fi + Standardowe)
// Wpisujemy tu WSZYSTKO, co chcemy podmienić na nasze wersje z ładnymi ikonkami.
export const SKILLS_TO_REMOVE = [
    // --- COMBAT ---
    "Brawl",
    "Gunnery",
    "Melee",
    "Melee (Heavy)",
    "Melee (Light)",
    "Ranged",
    "Ranged (Heavy)",
    "Ranged (Light)",

    // --- GENERAL / SOCIAL ---
    "Alchemy",
    "Athletics",
    "Astrocartography", // Sci-Fi
    "Charm",
    "Coercion",
    "Computers",        // Sci-Fi
    "Cool",
    "Coordination",
    "Deception",
    "Discipline",
    "Driving",          // Modern/Sci-Fi
    "Leadership",
    "Mechanics",
    "Medicine",
    "Negotiation",
    "Operating",        // Sci-Fi
    "Perception",
    "Piloting",         // Sci-Fi
    "Resilience",
    "Riding",
    "Skulduggery",
    "Stealth",
    "Streetwise",
    "Survival",
    "Vigilance",

    // --- MAGIC (Domyślne systemowe) ---
    "Arcana",
    "Divine",
    "Primal",
    "Runes",
    "Verse",

    // --- KNOWLEDGE (Domyślne systemowe) ---
    // System czasem dodaje generyczne "Knowledge", warto je wyciąć
    "Knowledge",
    "Knowledge (Forbidden)",
    "Knowledge (Lore)",
    "Knowledge (Outer Rim)",
    "Knowledge (Core Worlds)",
    "Knowledge (Underworld)",
    "Knowledge (Warfare)",
    "Knowledge (Xenology)"
];