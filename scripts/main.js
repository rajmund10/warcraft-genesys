import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";

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

                // GŁÓWNA PĘTLA RYSOWANIA
                async _render(force, options) {
                    await super._render(force, options);
                    
                    // Uruchamiamy dodatki tylko w trybie Warcraft
                    if (this.element.hasClass('warcraft-mode')) {
                        
                        // Wstrzykujemy zakładkę Specjalizacji
                        const treeManager = new TalentTreeManager(this, this.element);
                        treeManager.injectTab();

                        // Uruchamiamy strażnika (tylko raz), żeby pilnował zakładki przy przełączaniu widoków
                        if (!this._observer) this._activateObserver();
                    }
                }

                // STRAŻNIK ZMIAN (Pilnuje, żeby zakładka nie zniknęła)
                _activateObserver() {
                    const targetNode = this.element.find('.sheet-body')[0]; 
                    if (!targetNode) return;
                    
                    const callback = (mutationsList, observer) => {
                        if (this._refreshTimeout) clearTimeout(this._refreshTimeout);
                        
                        this._refreshTimeout = setTimeout(() => {
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
            }

            Actors.registerSheet("genesys", WarcraftActorSheet, {
                types: ["character"],
                makeDefault: false,
                label: "Warcraft Genesys Sheet"
            });
        }
    }

    // 2. REJESTRACJA ARKUSZA DLA TYPU 'SPECIALIZATION'
    Items.registerSheet("genesys", SpecializationSheet, {
        types: ["specialization"], 
        makeDefault: true, 
        label: "Edytor Specjalizacji (Warcraft)"
    });

    console.log("WARCRAFT MOD | Gotowy.");
});