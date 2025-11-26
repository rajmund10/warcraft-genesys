import { swapSkills } from "./skills-logic.js";
import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";

// SŁOWNIK TŁUMACZEŃ (Wklejony z powrotem tutaj dla bezpieczeństwa)
const HARD_TRANSLATIONS = {
    // Kategorie umiejętności
    "General Skills": "Um. Ogólne",
    "Magic Skills": "Um. Magiczne",
    "Combat Skills": "Um. Bojowe",
    "Social Skills": "Um. Społeczne",
    "Knowledge Skills": "Wiedza",
    
    // Skróty Cech
    "Br": "Krz",
    "Ag": "Zr",
    "Will": "Wola",
    "Cun": "Spr",
    "Pr": "Pre",
    
    // Nagłówki
    "Rank": "Ranga",
    "Career": "Kariera",
    "Dice Pool": "Pula Kości",
    "Total XP": "Suma XP",
    "Available XP": "Obecne XP",
    
    // Inne
    "Soak": "Redukcja",
    "Wounds": "Rany",
    "Strain": "Zmęczenie",
    "Defense": "Obrona",
    "Encumbrance": "Obciążenie",

    // Dodatkowe
    "Experience": "Doświadczenie",
    "Character Name": "Nazwa Postaci"
};

Hooks.once('ready', () => {
    console.log("WARCRAFT MOD | Start systemu...");

    // 1. KONFIGURACJA KARTY POSTACI
    const sheetConfig = CONFIG.Actor.sheetClasses.character;
    if (sheetConfig) {
        const sheetEntry = Object.values(sheetConfig).find(s => s.default) || Object.values(sheetConfig)[0];
        if (sheetEntry) {
            const baseSheetClass = sheetEntry.cls;

            class WarcraftActorSheet extends baseSheetClass {
                static get defaultOptions() {
                    const options = super.defaultOptions;
                    options.classes.push('warcraft-mode');
                    return options;
                }

                _getHeaderButtons() {
                    const buttons = super._getHeaderButtons();
                    buttons.unshift({
                        label: "Warcraft Setup",
                        class: "warcraft-setup-btn",
                        icon: "fas fa-dungeon",
                        onclick: () => swapSkills(this.actor)
                    });
                    return buttons;
                }

                async _render(force, options) {
                    await super._render(force, options);
                    if (this.element.hasClass('warcraft-mode')) {
                        this._translateNow();
                        const treeManager = new TalentTreeManager(this, this.element);
                        treeManager.injectTab();
                        if (!this._observer) this._activateObserver();
                    }
                }

                _activateObserver() {
                    const targetNode = this.element.find('.sheet-body')[0]; 
                    if (!targetNode) return;
                    const callback = (mutationsList, observer) => {
                        if (this._translationTimeout) clearTimeout(this._translationTimeout);
                        this._translationTimeout = setTimeout(() => {
                            this._translateNow();
                            const treeManager = new TalentTreeManager(this, this.element);
                            treeManager.injectTab();
                        }, 50);
                    };
                    this._observer = new MutationObserver(callback);
                    this._observer.observe(targetNode, { childList: true, subtree: true });
                }

                async close(options) {
                    if (this._observer) {
                        this._observer.disconnect();
                        this._observer = null;
                    }
                    return super.close(options);
                }

                _translateNow() {
                    const html = this.element[0];
                    const walk = document.createTreeWalker(html, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while (node = walk.nextNode()) {
                        const text = node.nodeValue.trim();
                        if (text && HARD_TRANSLATIONS[text]) node.nodeValue = HARD_TRANSLATIONS[text];
                    }
                }
            }

            Actors.registerSheet("genesys", WarcraftActorSheet, {
                types: ["character"],
                makeDefault: false,
                label: "Warcraft Genesys Sheet"
            });
        }
    }

    // 2. REJESTRACJA ARKUSZA DLA TYPU 'SPECIALIZATION'
    // (Zakładamy, że dodałeś już typ w template.json)
    Items.registerSheet("genesys", SpecializationSheet, {
        types: ["specialization"], 
        makeDefault: true, 
        label: "Edytor Specjalizacji (Warcraft)"
    });

    console.log("WARCRAFT MOD | Gotowy.");
});