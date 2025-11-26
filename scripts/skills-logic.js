// scripts/skills-logic.js

// 1. Pobieramy dane z naszego configu (Magazynu)
import { SKILLS_TO_REMOVE, SKILLS_COMPENDIUM } from "./config.js";

// 2. Eksportujemy funkcję, żeby main.js mógł jej użyć
export async function swapSkills(actor) {
    console.log("WARCRAFT MOD | Rozpoczynam podmianę skilli...");

    const pack = game.packs.get(SKILLS_COMPENDIUM);
    if (!pack) {
        ui.notifications.error("Nie znaleziono kompendium Warcraft Skills!");
        return;
    }

    // A. Usuwanie (korzystamy z listy zaimportowanej z config.js)
    const toDelete = actor.items.filter(i => 
        i.type === 'skill' && SKILLS_TO_REMOVE.includes(i.name)
    ).map(i => i.id);

    if (toDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", toDelete);
    }

    // B. Dodawanie
    const packItems = await pack.getDocuments();
    const currentSkills = actor.items.filter(i => i.type === 'skill').map(i => i.name);
    const toCreate = [];

    for (let item of packItems) {
        if (item.type === 'skill' && !currentSkills.includes(item.name)) {
            toCreate.push(item.toObject());
        }
    }

    if (toCreate.length > 0) {
        await actor.createEmbeddedDocuments("Item", toCreate);
        ui.notifications.success(`Zaktualizowano umiejętności Warcrafta!`);
    }
}