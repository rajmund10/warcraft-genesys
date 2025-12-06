import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";
import { MagicManager } from "./magic-manager.js";

// --- 1. WYCISZANIE BŁĘDÓW ---
const ignoreErrors = ["ResizeObserver loop", "loop limit exceeded", "loop completed"];
window.addEventListener('error', e => {
    if (e.message && ignoreErrors.some(msg => e.message.includes(msg))) {
        e.stopImmediatePropagation(); e.preventDefault();
    }
}, { capture: true });

// --- 2. INICJALIZACJA ---
Hooks.once('init', () => {
    console.log("WARCRAFT MOD | Inicjalizacja modułu...");

    // --- PROSEMIRROR: Menu Symboli (Emoji) ---
    Hooks.on("getProseMirrorMenuDropDowns", (menu, dropdowns) => {
        const insertText = (view, text) => {
            const { state, dispatch } = view;
            const tr = state.tr.insertText(text);
            dispatch(tr);
            view.focus();
            return true;
        };

        const symbolData = [
            { title: "🟢 Zdolność (k)",    code: "@dice[A]" },
            { title: "🟡 Biegłość (l)",    code: "@dice[P]" },
            { title: "🟣 Trudność (d)",    code: "@dice[D]" },
            { title: "🔴 Wyzwanie (c)",    code: "@dice[C]" },
            { title: "🟦 Wzmocnienie (b)", code: "@dice[B]" },
            { title: "⬛ Komplikacja (s)",  code: "@dice[S]" },
            { title: "✅ Sukces (s)",      code: "@sym[s]" },
            { title: "❌ Porażka (f)",     code: "@sym[f]" },
            { title: "⬆️ Przewaga (a)",    code: "@sym[a]" },
            { title: "⬇️ Zagrożenie (h)",  code: "@sym[h]" },
            { title: "☀️ Triumf (t)",      code: "@sym[t]" },
            { title: "💀 Rozpacz (y)",     code: "@sym[d]" }
        ];

        const entries = symbolData.map(item => ({
            action: item.title,
            title: item.title,
            cmd: (state, dispatch, view) => insertText(view, item.code)
        }));

        dropdowns['genesys-symbols'] = {
            title: "Symbole Genesys",
            cssClass: "genesys-selector",
            icon: '<i class="fas fa-dice" style="color:var(--color-text-light)"></i>', 
            entries: entries
        };
    });
});

// --- 3. START SYSTEMU (Ready) ---
Hooks.once('ready', () => {
    console.log("WARCRAFT MOD | Start systemu (Ready)...");
    
    class SpecializationDataModel extends foundry.abstract.DataModel {
        static defineSchema() {
            const fields = foundry.data.fields;
            return { description: new fields.HTMLField({ required: false, initial: "" }) };
        }
    }
    CONFIG.Item.dataModels.specialization = SpecializationDataModel;

    Handlebars.registerHelper('includes', (arr, val) => Array.isArray(arr) && arr.includes(val));

    const sheetConfig = CONFIG.Actor.sheetClasses.character;
    if (sheetConfig) {
        const sheetEntry = Object.values(sheetConfig).find(s => s.default) || Object.values(sheetConfig)[0];
        if (sheetEntry) {
            const BaseSheetClass = sheetEntry.cls;
            class WarcraftActorSheet extends BaseSheetClass {
                static get defaultOptions() {
                    const options = super.defaultOptions;
                    options.classes.push('warcraft-mode');
                    return options;
                }
                _getHeaderButtons() {
                    const buttons = super._getHeaderButtons();
                    const isCreated = this.document.getFlag("warcraft-genesys", "characterCreated");
                    if (this.document.isOwner && !isCreated) {
                        buttons.unshift({
                            label: "Kreator",
                            class: "char-creator-btn",
                            icon: "fas fa-magic",
                            onclick: () => { import("./apps/char-creator.js").then(m => new m.CharacterCreator(this.document).render(true)); }
                        });
                    }
                    return buttons;
                }
                async _render(force, options) {
                    await super._render(force, options);
                    if (this.element.hasClass('warcraft-mode')) {
                        setTimeout(() => {
                            if (this.element.find('.tab.talent-tree .tree-grid').length === 0) new TalentTreeManager(this, this.element).init();
                            new MagicManager(this, this.element).init();
                        }, 100);
                    }
                }
                async _onDropItem(event, data) {
                    if (!this.actor.isOwner) return false;
                    if (!data.uuid) return super._onDropItem(event, data);
                    let item;
                    try { item = await fromUuid(data.uuid); } catch (e) { return super._onDropItem(event, data); }
                    if (!item) return super._onDropItem(event, data);
                    if (item.type === "specialization") {
                        const existingSpec = this.actor.items.find(i => i.type === "specialization");
                        if (existingSpec) {
                            if (existingSpec.id === item.id) return false;
                            const confirmed = await Dialog.confirm({
                                title: "Zmiana Specjalizacji",
                                content: `<p>Masz już <strong>${existingSpec.name}</strong>. Zastąpić ją <strong>${item.name}</strong>?<br><br><span style="color:red">Stracisz postępy w obecnym drzewku!</span></p>`
                            });
                            if (confirmed) {
                                await existingSpec.delete();
                                await this.actor.unsetFlag("warcraft-genesys", "treeData");
                                await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
                                ui.notifications.info(`Zmieniono specjalizację na: ${item.name}`);
                            }
                        } else {
                            await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
                            ui.notifications.info(`Dodano specjalizację: ${item.name}`);
                        }
                        return false; 
                    }
                    return super._onDropItem(event, data);
                }
            }
            Actors.registerSheet("genesys", WarcraftActorSheet, { types: ["character"], makeDefault: true, label: "Warcraft Genesys Sheet" });
        }
    }

    Items.registerSheet("genesys", SpecializationSheet, { types: ["specialization"], makeDefault: true, label: "Edytor Specjalizacji (Warcraft)" });

    Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
        if (["archetype", "career"].includes(sheet.document.type)) {
            buttons.unshift({
                label: "Portret",
                class: "warcraft-portrait-btn",
                icon: "fas fa-image",
                onclick: async () => {
                    const flagName = sheet.document.type === "archetype" ? "racePortrait" : "careerPortrait";
                    new FilePicker({
                        type: "image",
                        current: sheet.document.getFlag("warcraft-genesys", flagName) || "",
                        callback: async (path) => {
                            await sheet.document.setFlag("warcraft-genesys", flagName, path);
                            ui.notifications.info(`Zapisano portret dla: ${sheet.document.name}`);
                        }
                    }).browse();
                }
            });
        }
    });

    Hooks.on("renderItemSheet", (app, html, data) => {
        if (["archetype", "career"].includes(app.document.type)) {
            const flagName = app.document.type === "archetype" ? "racePortrait" : "careerPortrait";
            const portrait = app.document.getFlag("warcraft-genesys", flagName);
            if (portrait) {
                app.element.addClass("warcraft-item-window");
                let target = html.find('header.sheet-header'); 
                if (target.length === 0) target = html.find('header');
                if (target.length === 0) target = html.find('img[data-edit="img"]');
    
                if (target.length > 0 && html.find('.warcraft-portrait-preview').length === 0) {
                    const previewHtml = `<div class="warcraft-portrait-preview" style="width: 100%; height: 300px; margin: 0 0 10px 0; background-image: url('${portrait}'); background-size: cover; background-position: center top; border-bottom: 2px solid #f8b700; box-shadow: 0 5px 15px rgba(0,0,0,0.5); flex: 0 0 100%;"></div>`;
                    target.last().after(previewHtml);
                    setTimeout(() => { app.setPosition({ height: "auto" }); }, 50);
                }
            }
        }
        
        const editors = html.find('.editor, .prosemirror, .editor-content');
        if (editors.length > 0) {
            editors.on('mousedown', (ev) => { ev.stopPropagation(); });
        }
    });

    console.log("WARCRAFT MOD | Gotowy.");
});

// =============================================================================
// --- DYNAMICZNE BONUSY DO UMIEJĘTNOŚCI (Active Effects Handler) ---
// =============================================================================

// Funkcja przeliczająca bonusy dla aktora
async function recalculateSkillBonuses(actor) {
    if (!actor || !actor.items) return;
    
    // 1. Znajdź wszystkie aktywne efekty wpływające na skille
    const skillBonuses = {};
    
    // Pobieramy efekty bezpośrednio z aktora oraz z jego przedmiotów
    // (W Genesys efekty są często na przedmiotach)
    actor.items.forEach(item => {
        const effects = item.effects || [];
        effects.forEach(effect => {
            if (effect.disabled) return; // Pomiń wyłączone
            
            // Sprawdź czy efekt jest aktywny (niezawieszony)
            // Niektóre systemy używają flagi isSuppressed
            if (effect.isSuppressed) return;

            effect.changes.forEach(change => {
                if (change.key.startsWith("skill.")) {
                    const skillName = change.key.replace("skill.", "").trim();
                    const value = parseInt(change.value) || 0;
                    
                    if (!skillBonuses[skillName]) skillBonuses[skillName] = 0;
                    skillBonuses[skillName] += value;
                }
            });
        });
    });

    // 2. Zaktualizuj rangi umiejętności
    const updates = [];
    
    // Iterujemy po wszystkich skillach aktora
    actor.items.filter(i => i.type === "skill").forEach(skillItem => {
        const skillName = skillItem.name;
        
        // Jaki jest aktualny rank?
        const currentRank = skillItem.system.rank || 0;
        
        // Ile z tego to bonus (zapisany w poprzednim przebiegu)?
        const previousBonus = skillItem.getFlag("warcraft-genesys", "activeBonus") || 0;
        
        // Jaki powinien być nowy bonus?
        const newBonus = skillBonuses[skillName] || 0;
        
        // Jeśli bonus się nie zmienił, nic nie robimy
        if (previousBonus === newBonus) return;
        
        // Obliczamy "bazowy" rank (bez bonusów)
        const baseRank = currentRank - previousBonus;
        
        // Nowy rank
        const newRank = Math.max(0, baseRank + newBonus);
        
        console.log(`WARCRAFT MOD | Aktualizacja skilla "${skillName}": Baza ${baseRank} + Bonus ${newBonus} = ${newRank}`);
        
        updates.push({
            _id: skillItem.id,
            "system.rank": newRank,
            "flags.warcraft-genesys.activeBonus": newBonus
        });
    });

    if (updates.length > 0) {
        await actor.updateEmbeddedDocuments("Item", updates);
        ui.notifications.info("Zaktualizowano bonusy umiejętności.");
    }
}

// Rejestracja Hooków do nasłuchiwania zmian
const triggerRecalculation = (doc) => {
    // Sprawdzamy czy dokument należy do aktora typu "character"
    const actor = doc.parent ? doc.parent : (doc.actor ? doc.actor : null);
    if (actor && actor.type === "character") {
        // Debounce, żeby nie odpalać 10 razy przy masowym dodawaniu
        if (actor._skillRecalcTimeout) clearTimeout(actor._skillRecalcTimeout);
        actor._skillRecalcTimeout = setTimeout(() => {
            recalculateSkillBonuses(actor);
            actor._skillRecalcTimeout = null;
        }, 200); // 200ms opóźnienia
    }
};

// Nasłuchujemy zmian w przedmiotach (dodanie/usunięcie itemu z efektem)
Hooks.on("createItem", triggerRecalculation);
Hooks.on("deleteItem", triggerRecalculation);

// ZMODYFIKOWANY HOOK UPDATE (OPTYMALIZACJA)
Hooks.on("updateItem", (item, changes) => {
    // Sprawdzamy czy to item należący do postaci
    if (!item.actor || item.actor.type !== "character") return;

    // Reaguj tylko jeśli zmieniono efekty, stan wyposażenia (equipped) 
    // lub flagi naszego modułu (np. ręczne bonusy)
    const isRelevantChange = 
        changes.effects !== undefined || 
        (changes.system && changes.system.equipped !== undefined) ||
        (changes.flags && changes.flags["warcraft-genesys"]);

    if (isRelevantChange) {
        triggerRecalculation(item);
    }
});

// =============================================================================
// --- OBSŁUGA DRAG & DROP DLA RASY (System Native: grantedItems) ---
// =============================================================================

Hooks.on("dropItemSheetData", async (targetItem, sheet, dropData) => {
    // 1. Działamy tylko, jeśli upuszczamy coś na Rasę (Archetype)
    if (targetItem.type !== "archetype") return;

    // 2. Pobieramy upuszczony przedmiot (musi istnieć)
    if (!dropData.uuid) return;
    const droppedItem = await fromUuid(dropData.uuid);
    if (!droppedItem) return;

    // 3. Sprawdzamy, czy to Zdolność lub Talent (lub Feature)
    if (!["ability", "talent", "feature"].includes(droppedItem.type)) return;

    // 4. Pobieramy aktualną listę z natywnego pola systemowego Genesys
    // W Genesys DataModel pole to nazywa się 'grantedItems'
    const currentItems = targetItem.system.grantedItems || [];
    
    // Sprawdzamy duplikaty po nazwie, żeby nie dodać tego samego dwa razy
    if (currentItems.some(i => i.name === droppedItem.name)) {
        return ui.notifications.warn(`Ta rasa ma już zdolność: ${droppedItem.name}`);
    }

    // 5. Przygotowujemy nową tablicę
    // Musimy użyć .toObject(), aby zapisać surowe dane przedmiotu, a nie link do niego
    const newItems = [...currentItems, droppedItem.toObject()];

    // 6. Wykonujemy aktualizację natywnego pola w systemie
    await targetItem.update({"system.grantedItems": newItems});
    
    ui.notifications.info(`Dodano ${droppedItem.name} do rasy ${targetItem.name}`);
});

// Nasłuchujemy zmian w samych efektach
Hooks.on("createActiveEffect", triggerRecalculation);
Hooks.on("deleteActiveEffect", triggerRecalculation);
Hooks.on("updateActiveEffect", triggerRecalculation);