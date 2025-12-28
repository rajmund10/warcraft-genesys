import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";
import { MagicManager } from "./magic-manager.js";

// =============================================================================
// --- 0. KONFIGURACJA ŚCIEŻEK I DANYCH ---
// =============================================================================
const MODULE_ID = "warcraft-genesys";
const BASE_PATH = `modules/${MODULE_ID}/assets/dice/`;

// Słownik grafik
const DICE_IMAGES = {
    "boost": { "":  BASE_PATH + "blue.png", "s": BASE_PATH + "blues.png", "sa": BASE_PATH + "bluesa.png", "aa": BASE_PATH + "blueaa.png", "a": BASE_PATH + "bluea.png" },
    "ability": { "": BASE_PATH + "green.png", "s": BASE_PATH + "greens.png", "ss": BASE_PATH + "greenss.png", "a": BASE_PATH + "greena.png", "aa": BASE_PATH + "greenaa.png", "sa": BASE_PATH + "greensa.png" },
    "proficiency": { "": BASE_PATH + "yellow.png", "s": BASE_PATH + "yellows.png", "ss": BASE_PATH + "yellowss.png", "a": BASE_PATH + "yellowa.png", "aa": BASE_PATH + "yellowaa.png", "sa": BASE_PATH + "yellowsa.png", "t": BASE_PATH + "yellowt.png" },
    "setback": { "": BASE_PATH + "black.png", "f": BASE_PATH + "blackf.png", "h": BASE_PATH + "blackh.png" },
    "difficulty": { "": BASE_PATH + "purple.png", "f": BASE_PATH + "purplef.png", "ff": BASE_PATH + "purpleff.png", "h": BASE_PATH + "purpleh.png", "hh": BASE_PATH + "purplehh.png", "fh": BASE_PATH + "purplefh.png" },
    "challenge": { "": BASE_PATH + "red.gif", "f": BASE_PATH + "redf.png", "ff": BASE_PATH + "redff.png", "h": BASE_PATH + "redh.png", "hh": BASE_PATH + "redhh.png", "fh": BASE_PATH + "redfh.png", "d": BASE_PATH + "redd.png" }
};

const DIE_TYPE_MAP = {
    "b": "boost", "a": "ability", "k": "ability", "p": "proficiency", "l": "proficiency",
    "s": "setback", "d": "difficulty", "j": "difficulty", "i": "difficulty",
    "c": "challenge", "m": "challenge"
};

// =============================================================================
// --- 1. INICJALIZACJA ---
// =============================================================================

Hooks.once('init', () => {
    console.log("WARCRAFT MOD | Inicjalizacja...");

    // Helper: Symbole (Wyniki netto)
    Handlebars.registerHelper('getWarcraftSymbolImage', (symbol) => {
        const map = { 's': 'success', 'a': 'advantage', 't': 'triumph', 'f': 'failure', 'h': 'threat', 'd': 'despair' };
        const fileName = map[symbol] || 'success'; 
        return `${BASE_PATH}${fileName}.png`;
    });

    // Helper: Kości (Ścianki)
    Handlebars.registerHelper('getWarcraftDiceImage', (die, face) => {
        if (!die) return BASE_PATH + "black.png";
        let rawType = String(die).trim().toLowerCase();
        let dieType = DIE_TYPE_MAP[rawType] || rawType;

        let symbol = "";
        if (typeof face === 'object' && face !== null) {
            if (face.result) symbol = String(face.result);
            else if (face.symbol) symbol = String(face.symbol);
            else symbol = String(face); 
        } else if (face !== undefined && face !== null) {
            symbol = String(face);
        }
        symbol = symbol.trim().toLowerCase();
        if (symbol === "success") symbol = "s"; if (symbol === "advantage") symbol = "a"; if (symbol === "triumph") symbol = "t";
        if (symbol === "failure") symbol = "f"; if (symbol === "threat") symbol = "h"; if (symbol === "despair") symbol = "d";

        if (DICE_IMAGES[dieType]) {
            let path = DICE_IMAGES[dieType][symbol];
            if (!path) path = DICE_IMAGES[dieType][""];
            return path || BASE_PATH + "black.png";
        } 
        return BASE_PATH + "black.png";
    });

    Handlebars.registerHelper('add', (a, b) => (parseInt(a) || 0) + (parseInt(b) || 0));
    Handlebars.registerHelper('sub', (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('or', (a, b) => a || b);
    Handlebars.registerHelper('capitalize', (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "");

    // --- INTERCEPTOR SZABLONÓW ---
    const originalRenderTemplate = renderTemplate;
    globalThis.renderTemplate = async function(path, data, options) {
        if (typeof path === "string") {
            if (path.includes("attack.hbs")) {
                path = `modules/${MODULE_ID}/templates/chat/roll-attack.hbs`;
            } 
            else if (path.includes("skill.hbs")) {
                const skillNameRaw = data?.skillName || data?.item?.name || "";
                const isMagic = ["arcana", "divine", "primal", "magic", "zaklęcie", "czar"].some(s => skillNameRaw.toLowerCase().includes(s));
                const isMagicFlag = data?.flags && data.flags["warcraft-genesys"] && data.flags["warcraft-genesys"].rollType === "magic";

                if (isMagic || isMagicFlag) {
                    path = `modules/${MODULE_ID}/templates/chat/roll-magic.hbs`;
                } else {
                    path = `modules/${MODULE_ID}/templates/chat/roll-skill.hbs`;
                }
            }
        }
        return originalRenderTemplate.apply(this, [path, data, options]);
    };
    
    setupProseMirror();
});

// =============================================================================
// --- 2. FAZA READY ---
// =============================================================================

Hooks.once('ready', () => {
    console.log("WARCRAFT MOD | Ready.");
    setupSheets();
    setupActiveEffects();
    setupChatHooks(); 
});

// =============================================================================
// --- FUNKCJE POMOCNICZE ---
// =============================================================================

function setupChatHooks() {
    Hooks.on("renderChatMessage", (message, html, data) => {
        
        // 1. ZMIANA NAZWY (UKRYWANIE ROLLING...)
        const flavor = html.find('.flavor-text, .roll-description');
        const myLabel = html.find('.warcraft-skill-label');

        if (flavor.length > 0) {
            let fullText = flavor.text().trim(); 
            if (fullText.includes("Rolling")) {
                let skillName = fullText.replace("Rolling", "").trim();
                if (myLabel.length > 0) {
                    myLabel.text(skillName); 
                    flavor.hide(); 
                    flavor.css("margin", "0").css("padding", "0");
                }
            } else if (myLabel.length > 0 && fullText.length > 0 && !fullText.includes("Dice")) {
                myLabel.text(fullText);
                flavor.hide();
            }
        }

        // 2. WSTRZYKIWANIE ELEMENTÓW DO CZATU
        setTimeout(() => {
            const rollContainer = html.find('.roll-skill, .roll-attack');
            
            if (rollContainer.length > 0) {
                // A. Statystyki broni (jeśli dotyczy)
                injectWeaponStats(message, rollContainer);
                
                // B. Dodatkowe symbole w puli kości (NOWOŚĆ!)
                injectAddedSymbols(message, rollContainer);
            }
        }, 50);
    });
}

function injectWeaponStats(message, container) {
    if (container.find('.warcraft-weapon-injector').length > 0) return;

    let actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
    if (!actor && message.speaker?.token) {
        const token = canvas.tokens.get(message.speaker.token);
        if (token) actor = token.actor;
    }
    if (!actor) return;

    const flavorText = (message.flavor || "").toLowerCase();
    const item = actor.items.find(i => ["weapon", "vehicleWeapon"].includes(i.type) && flavorText.includes(i.name.toLowerCase()));
    
    if (!item) return;

    let successes = 0;
    if (message.rolls && message.rolls.length > 0) {
        const r = message.rolls[0];
        if (r.results && r.results.netSuccess !== undefined) successes = r.results.netSuccess;
        else if (r.total !== undefined) successes = r.total;
        else if (r.ffg && r.ffg.success !== undefined) successes = r.ffg.success; 
    } 

    const isSuccess = successes > 0;
    const baseDamage = parseInt(item.system.damage) || 0;
    const totalDamage = isSuccess ? (baseDamage + successes) : baseDamage; 
    const critical = item.system.critical || "-";

    let qualities = item.system.qualities || "";
    if (typeof qualities !== 'string' && Array.isArray(qualities)) {
        qualities = qualities.map(q => `${q.name} ${q.rating || ''}`).join(", ");
    }

    const cardHtml = `
    <div class="warcraft-weapon-injector" style="margin-top: 10px; border-top: 1px solid rgba(0,0,0,0.2); padding-top: 5px;">
        <div class="wc-attack-stats flexrow" style="display:flex; justify-content: space-around; text-align: center; background: rgba(0,0,0,0.05); padding: 5px; border-radius: 4px;">
            <div class="wc-stat-damage">
                <span class="wc-stat-label" style="display:block; font-size:10px; text-transform:uppercase; opacity:0.8;">Obrażenia</span>
                <span class="wc-stat-value" style="font-size:18px; font-weight: bold; color: ${isSuccess ? 'darkred' : 'grey'};">
                    ${totalDamage} <span style="font-size:10px; color:#555;">(${baseDamage}+${isSuccess ? successes : 0})</span>
                </span>
            </div>
            <div class="wc-stat-critical">
                <span class="wc-stat-label" style="display:block; font-size:10px; text-transform:uppercase; opacity:0.8;">Krytyk</span>
                <span class="wc-stat-value" style="font-size:18px; font-weight: bold; color: #a48b5e;">${critical}</span>
            </div>
        </div>
        ${qualities ? `<div style="font-size:11px; margin-top:5px; font-style:italic; text-align:center; color:#555; border-top: 1px dashed #ccc; padding-top:2px;">${qualities}</div>` : ""}
    </div>
    `;
    container.append(cardHtml);
}

function setupProseMirror() {
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
            { title: "⬛ Komplikacja (s)", code: "@dice[S]" },
            { title: "✅ Sukces (s)",      code: "@sym[s]" },
            { title: "❌ Porażka (f)",      code: "@sym[f]" },
            { title: "⬆️ Przewaga (a)",    code: "@sym[a]" },
            { title: "⬇️ Zagrożenie (h)",  code: "@sym[h]" },
            { title: "☀️ Triumf (t)",      code: "@sym[t]" },
            { title: "💀 Rozpacz (y)",     code: "@sym[d]" }
        ];
        const entries = symbolData.map(item => ({ action: item.title, title: item.title, cmd: (state, dispatch, view) => insertText(view, item.code) }));
        dropdowns['genesys-symbols'] = { title: "Symbole Genesys", cssClass: "genesys-selector", icon: '<i class="fas fa-dice"></i>', entries: entries };
    });
}

function setupSheets() {
    class SpecializationDataModel extends foundry.abstract.DataModel {
        static defineSchema() { const fields = foundry.data.fields; return { description: new fields.HTMLField({ required: false, initial: "" }) }; }
    }
    CONFIG.Item.dataModels.specialization = SpecializationDataModel;

    const sheetConfig = CONFIG.Actor.sheetClasses.character;
    if (sheetConfig) {
        const sheetEntry = Object.values(sheetConfig).find(s => s.default) || Object.values(sheetConfig)[0];
        if (sheetEntry) {
            const BaseSheetClass = sheetEntry.cls;
            class WarcraftActorSheet extends BaseSheetClass {
                static get defaultOptions() { const options = super.defaultOptions; options.classes.push('warcraft-mode'); return options; }
                _getHeaderButtons() {
                    const buttons = super._getHeaderButtons();
                    const isCreated = this.document.getFlag("warcraft-genesys", "characterCreated");
                    if (this.document.isOwner && !isCreated) {
                        buttons.unshift({ label: "Kreator", class: "char-creator-btn", icon: "fas fa-magic", onclick: () => { import("./apps/char-creator.js").then(m => new m.CharacterCreator(this.document).render(true)); } });
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
                    let item; try { item = await fromUuid(data.uuid); } catch (e) { return super._onDropItem(event, data); }
                    if (!item) return super._onDropItem(event, data);
                    if (item.type === "specialization") {
                        const existingSpec = this.actor.items.find(i => i.type === "specialization");
                        if (existingSpec) {
                            if (existingSpec.id === item.id) return false;
                            const confirmed = await Dialog.confirm({ title: "Zmiana Specjalizacji", content: `<p>Masz już <strong>${existingSpec.name}</strong>. Zastąpić ją <strong>${item.name}</strong>?<br><br><span style="color:red">Stracisz postępy w obecnym drzewku!</span></p>` });
                            if (confirmed) {
                                await existingSpec.delete(); await this.actor.unsetFlag("warcraft-genesys", "treeData");
                                await this.actor.createEmbeddedDocuments("Item", [item.toObject()]); ui.notifications.info(`Zmieniono specjalizację na: ${item.name}`);
                            }
                        } else { await this.actor.createEmbeddedDocuments("Item", [item.toObject()]); ui.notifications.info(`Dodano specjalizację: ${item.name}`); }
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
            buttons.unshift({ label: "Portret", class: "warcraft-portrait-btn", icon: "fas fa-image", onclick: async () => {
                    const flagName = sheet.document.type === "archetype" ? "racePortrait" : "careerPortrait";
                    new FilePicker({ type: "image", current: sheet.document.getFlag("warcraft-genesys", flagName) || "", callback: async (path) => { await sheet.document.setFlag("warcraft-genesys", flagName, path); ui.notifications.info(`Zapisano portret dla: ${sheet.document.name}`); } }).browse();
            }});
        }
    });

    Hooks.on("renderItemSheet", (app, html, data) => {
        if (["archetype", "career"].includes(app.document.type)) {
            const flagName = app.document.type === "archetype" ? "racePortrait" : "careerPortrait";
            const portrait = app.document.getFlag("warcraft-genesys", flagName);
            if (portrait) {
                app.element.addClass("warcraft-item-window");
                let target = html.find('header.sheet-header'); if (target.length === 0) target = html.find('header'); if (target.length === 0) target = html.find('img[data-edit="img"]');
                if (target.length > 0 && html.find('.warcraft-portrait-preview').length === 0) {
                    const previewHtml = `<div class="warcraft-portrait-preview" style="width: 100%; height: 300px; margin: 0 0 10px 0; background-image: url('${portrait}'); background-size: cover; background-position: center top; border-bottom: 2px solid #f8b700; box-shadow: 0 5px 15px rgba(0,0,0,0.5); flex: 0 0 100%;"></div>`;
                    target.last().after(previewHtml); setTimeout(() => { app.setPosition({ height: "auto" }); }, 50);
                }
            }
        }
        const editors = html.find('.editor, .prosemirror, .editor-content'); if (editors.length > 0) { editors.on('mousedown', (ev) => { ev.stopPropagation(); }); }
    });
}

function setupActiveEffects() {
    async function recalculateSkillBonuses(actor) {
        if (!actor || !actor.items) return;
        const skillBonuses = {};
        actor.items.forEach(item => {
            const effects = item.effects || [];
            effects.forEach(effect => {
                if (effect.disabled || effect.isSuppressed) return; 
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
        const updates = [];
        actor.items.filter(i => i.type === "skill").forEach(skillItem => {
            const skillName = skillItem.name;
            const currentRank = skillItem.system.rank || 0;
            const previousBonus = skillItem.getFlag("warcraft-genesys", "activeBonus") || 0;
            const newBonus = skillBonuses[skillName] || 0;
            if (previousBonus === newBonus) return;
            const baseRank = currentRank - previousBonus;
            const newRank = Math.max(0, baseRank + newBonus);
            updates.push({ _id: skillItem.id, "system.rank": newRank, "flags.warcraft-genesys.activeBonus": newBonus });
        });
        if (updates.length > 0) { await actor.updateEmbeddedDocuments("Item", updates); }
    }
    const triggerRecalculation = (doc) => {
        const actor = doc.parent ? doc.parent : (doc.actor ? doc.actor : null);
        if (actor && actor.type === "character") {
            if (actor._skillRecalcTimeout) clearTimeout(actor._skillRecalcTimeout);
            actor._skillRecalcTimeout = setTimeout(() => { recalculateSkillBonuses(actor); actor._skillRecalcTimeout = null; }, 200); 
        }
    };
    Hooks.on("createItem", triggerRecalculation); Hooks.on("deleteItem", triggerRecalculation);
    Hooks.on("updateItem", (item, changes) => { if (!item.actor || item.actor.type !== "character") return; const isRelevantChange = changes.effects !== undefined || (changes.system && changes.system.equipped !== undefined); if (isRelevantChange) triggerRecalculation(item); });
    Hooks.on("createActiveEffect", triggerRecalculation); Hooks.on("deleteActiveEffect", triggerRecalculation); Hooks.on("updateActiveEffect", triggerRecalculation);
    Hooks.on("dropItemSheetData", async (targetItem, sheet, dropData) => {
        if (targetItem.type !== "archetype") return;
        if (!dropData.uuid) return;
        const droppedItem = await fromUuid(dropData.uuid); if (!droppedItem) return;
        if (!["ability", "talent", "feature"].includes(droppedItem.type)) return;
        const currentItems = targetItem.system.grantedItems || [];
        if (currentItems.some(i => i.name === droppedItem.name)) { return ui.notifications.warn(`Ta rasa ma już zdolność: ${droppedItem.name}`); }
        const newItems = [...currentItems, droppedItem.toObject()];
        await targetItem.update({"system.grantedItems": newItems}); ui.notifications.info(`Dodano ${droppedItem.name} do rasy ${targetItem.name}`);
    });
}