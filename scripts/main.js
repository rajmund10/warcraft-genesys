import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";
import { MagicManager } from "./magic-manager.js";

// =============================================================================
// --- 0. KONFIGURACJA ŚCIEŻEK (Pełne ścieżki modułowe) ---
// =============================================================================
const MODULE_ID = "warcraft-genesys"; // ID z module.json
const BASE_PATH = `modules/${MODULE_ID}/assets/dice/`;

const DICE_IMAGES = {
    "Boost": { // Niebieska
        "":  BASE_PATH + "blue.png",
        "s": BASE_PATH + "blues.png",
        "sa": BASE_PATH + "bluesa.png",
        "aa": BASE_PATH + "blueaa.png",
        "a": BASE_PATH + "bluea.png"
    },
    "Ability": { // Zielona
        "": BASE_PATH + "green.png",
        "s": BASE_PATH + "greens.png",
        "ss": BASE_PATH + "greenss.png",
        "a": BASE_PATH + "greena.png",
        "aa": BASE_PATH + "greenaa.png",
        "sa": BASE_PATH + "greensa.png"
    },
    "Proficiency": { // Żółta
        "": BASE_PATH + "yellow.png",
        "s": BASE_PATH + "yellows.png",
        "ss": BASE_PATH + "yellowss.png",
        "a": BASE_PATH + "yellowa.png",
        "aa": BASE_PATH + "yellowaa.png",
        "sa": BASE_PATH + "yellowsa.png",
        "t": BASE_PATH + "yellowt.png"
    },
    "Setback": { // Czarna
        "": BASE_PATH + "black.png",
        "f": BASE_PATH + "blackf.png",
        "h": BASE_PATH + "blackh.png" 
    },
    "Difficulty": { // Fioletowa
        "": BASE_PATH + "purple.png",
        "f": BASE_PATH + "purplef.png",
        "ff": BASE_PATH + "purpleff.png",
        "h": BASE_PATH + "purpleh.png",   
        "hh": BASE_PATH + "purplehh.png", 
        "fh": BASE_PATH + "purplefh.png"  
    },
    "Challenge": { // Czerwona
        "": BASE_PATH + "red.gif", 
        "f": BASE_PATH + "redf.png",
        "ff": BASE_PATH + "redff.png",
        "h": BASE_PATH + "redh.png",   
        "hh": BASE_PATH + "redhh.png", 
        "fh": BASE_PATH + "redfh.png", 
        "d": BASE_PATH + "redd.png"    
    }
};

// =============================================================================
// --- 1. START SYSTEMU ---
// =============================================================================
Hooks.once('ready', () => {
    console.log("WARCRAFT MOD | Start systemu (Ready)...");

    // --- A. MUTATION OBSERVER (Wykrywanie nowych wiadomości w czasie rzeczywistym) ---
    const chatLog = document.getElementById("chat-log");
    if (chatLog) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element HTML
                        const $node = $(node);
                        if ($node.hasClass('chat-message') || $node.find('.chat-message').length > 0) {
                            // Opóźnienie minimalne, by upewnić się, że Vue wyrenderowało wnętrze
                            setTimeout(() => processChatMessage($node), 10);
                        }
                    }
                });
            });
        });
        observer.observe(chatLog, { childList: true, subtree: true });
    }

    // Konfiguracja arkuszy (z poprzedniego pliku)
    setupSheetsAndModels();
});

// Standardowy Hook (dla pewności przy odświeżaniu F5)
Hooks.on("renderChatMessage", (message, html, data) => {
    setTimeout(() => {
        processChatMessage(html);
    }, 50);
});

// =============================================================================
// --- 2. GŁÓWNA LOGIKA PRZETWARZANIA CZATU ---
// =============================================================================

function processChatMessage(html) {
    const rollContainer = html.find('.roll-skill');
    if (rollContainer.length === 0) return;

    // 1. Zastąp kości systemowe naszymi obrazkami (METODA TOTALNEJ PODMIANY)
    replaceDiceContainer(rollContainer);

    // 2. Przesuń kości na górę
    const diceRow = rollContainer.find('.dice-row');
    if (diceRow.length > 0 && rollContainer.children().first()[0] !== diceRow[0]) {
        rollContainer.prepend(diceRow);
    }

    // 3. Dodaj kartę broni (jeśli to atak)
    // Pobieramy wiadomość z ID elementu HTML
    const messageId = html.data("messageId");
    const message = game.messages.get(messageId);
    if (message) {
        injectWeaponStats(message, rollContainer);
    }
}

function replaceDiceContainer(container) {
    // Znajdź oryginalny kontener z kośćmi
    const diceDiv = container.find('.dice');
    if (diceDiv.length === 0) return;
    
    // Jeśli już podmieniliśmy (ma naszą klasę), to kończymy
    if (diceDiv.hasClass('warcraft-replaced')) return;

    let newDiceHtml = "";
    let diceFound = false;

    // Iterujemy po starych kostkach, żeby wyciągnąć dane
    diceDiv.find('.result').each((i, el) => {
        const resultEl = $(el);
        
        // Pobierz Typ i Symbol ze starego HTML
        // System Genesys trzyma to w atrybutach data-type
        const typeEl = resultEl.find('.type');
        const faceEl = resultEl.find('.face');
        
        let rawType = typeEl.attr('data-type') || faceEl.attr('data-type');
        if (!rawType) return;

        let dieType = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase(); // np. "Ability"
        let symbolText = faceEl.text().trim();

        // Znajdź obrazek
        if (DICE_IMAGES[dieType]) {
            let imagePath = DICE_IMAGES[dieType][symbolText];
            // Fallback dla pustej ścianki
            if (!symbolText && DICE_IMAGES[dieType][""] !== undefined) {
                imagePath = DICE_IMAGES[dieType][""];
            }

            if (imagePath) {
                // Budujemy prosty HTML z obrazkiem
                newDiceHtml += `
                    <div class="warcraft-die">
                        <img src="${imagePath}" title="${dieType}: ${symbolText}" />
                    </div>
                `;
                diceFound = true;
            }
        }
    });

    if (diceFound) {
        // --- TOTALNA PODMIANA ---
        // Czyścimy stary kontener .dice i wstawiamy nasz nowy HTML
        diceDiv.html(newDiceHtml);
        
        // Dodajemy klasę, żeby oznaczyć jako zrobione i nadać style flexboxa
        diceDiv.addClass('warcraft-replaced');
        
        // Nadpisujemy style inline kontenera, żeby zresetować marginy/paddingi systemowe
        diceDiv.css({
            "display": "flex",
            "flex-wrap": "wrap",
            "gap": "5px",
            "align-items": "center",
            "padding": "5px"
        });
        
        // Logujemy sukces (widoczne pod F12)
        console.log("WARCRAFT MOD | Kości podmienione na obrazki.");
    }
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
    const contentText = (message.content || "").toLowerCase();
    
    const item = actor.items.find(i => 
        ["weapon", "vehicleWeapon"].includes(i.type) &&
        (flavorText.includes(i.name.toLowerCase()) || contentText.includes(i.name.toLowerCase()))
    );

    if (!item) return;

    let successes = 0;
    if (message.rolls && message.rolls.length > 0) {
        const r = message.rolls[0];
        // Próba bezpiecznego pobrania sukcesów
        if (r.results && r.results.netSuccess !== undefined) successes = r.results.netSuccess;
        else if (r.total !== undefined) successes = r.total;
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

// =============================================================================
// --- 3. KONFIGURACJA ARKUSZY I MODELI (RESZTA KODU) ---
// =============================================================================
function setupSheetsAndModels() {
    class SpecializationDataModel extends foundry.abstract.DataModel {
        static defineSchema() {
            const fields = foundry.data.fields;
            return { description: new fields.HTMLField({ required: false, initial: "" }) };
        }
    }
    CONFIG.Item.dataModels.specialization = SpecializationDataModel;

    Handlebars.registerHelper('includes', (arr, val) => Array.isArray(arr) && arr.includes(val));

    // Rejestracja Arkusza Postaci
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

    // Portrety i inne Hooki UI
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

    // Fix Tooltipów (ProseMirror)
    const SYMBOLS = {
        "a": "ability", "p": "proficiency", "d": "difficulty", "c": "challenge",
        "b": "boost", "s": "setback", "f": "failure", "h": "threat",
        "t": "triumph", "r": "despair"
    };
    const tooltipEl = document.getElementById("tooltip");
    if (tooltipEl) {
        const cleanContent = (originalText) => {
            let text = originalText;
            if (!text) return text;
            if (text.includes("&lt;")) {
                const txt = document.createElement("textarea");
                txt.innerHTML = text;
                text = txt.value;
            }
            if (!text.includes("<p>") && !text.includes("@dice") && !text.includes("@sym")) return null;
            if (text.startsWith("<p>") && text.endsWith("</p>")) text = text.slice(3, -4);
            text = text.replace(/@(dice|sym)\[([a-zA-Z])\]/g, (match, type, code) => {
                const key = code.toLowerCase();
                const cssClass = SYMBOLS[key];
                return cssClass ? `<span class='genesys-pm-icon ${cssClass}'></span>` : match;
            });
            text = text.replace(/"/g, "'");
            return text;
        };
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "childList") {
                    const currentHTML = tooltipEl.innerHTML;
                    const cleanHTML = cleanContent(currentHTML);
                    if (cleanHTML && cleanHTML !== currentHTML) {
                        observer.disconnect();
                        tooltipEl.innerHTML = cleanHTML;
                        observer.observe(tooltipEl, { childList: true, subtree: true });
                    }
                }
            });
        });
        observer.observe(tooltipEl, { childList: true, subtree: true });
    }
}

// Inicjalizacja Menu Symboli (ProseMirror)
Hooks.once('init', () => {
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

// Active Effects Logic
async function recalculateSkillBonuses(actor) {
    if (!actor || !actor.items) return;
    const skillBonuses = {};
    actor.items.forEach(item => {
        const effects = item.effects || [];
        effects.forEach(effect => {
            if (effect.disabled) return; 
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
    const updates = [];
    actor.items.filter(i => i.type === "skill").forEach(skillItem => {
        const skillName = skillItem.name;
        const currentRank = skillItem.system.rank || 0;
        const previousBonus = skillItem.getFlag("warcraft-genesys", "activeBonus") || 0;
        const newBonus = skillBonuses[skillName] || 0;
        if (previousBonus === newBonus) return;
        const baseRank = currentRank - previousBonus;
        const newRank = Math.max(0, baseRank + newBonus);
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
const triggerRecalculation = (doc) => {
    const actor = doc.parent ? doc.parent : (doc.actor ? doc.actor : null);
    if (actor && actor.type === "character") {
        if (actor._skillRecalcTimeout) clearTimeout(actor._skillRecalcTimeout);
        actor._skillRecalcTimeout = setTimeout(() => {
            recalculateSkillBonuses(actor);
            actor._skillRecalcTimeout = null;
        }, 200); 
    }
};
Hooks.on("createItem", triggerRecalculation);
Hooks.on("deleteItem", triggerRecalculation);
Hooks.on("updateItem", (item, changes) => {
    if (!item.actor || item.actor.type !== "character") return;
    const isRelevantChange = changes.effects !== undefined || (changes.system && changes.system.equipped !== undefined);
    if (isRelevantChange) triggerRecalculation(item);
});
Hooks.on("createActiveEffect", triggerRecalculation);
Hooks.on("deleteActiveEffect", triggerRecalculation);
Hooks.on("updateActiveEffect", triggerRecalculation);

Hooks.on("dropItemSheetData", async (targetItem, sheet, dropData) => {
    if (targetItem.type !== "archetype") return;
    if (!dropData.uuid) return;
    const droppedItem = await fromUuid(dropData.uuid);
    if (!droppedItem) return;
    if (!["ability", "talent", "feature"].includes(droppedItem.type)) return;
    const currentItems = targetItem.system.grantedItems || [];
    if (currentItems.some(i => i.name === droppedItem.name)) {
        return ui.notifications.warn(`Ta rasa ma już zdolność: ${droppedItem.name}`);
    }
    const newItems = [...currentItems, droppedItem.toObject()];
    await targetItem.update({"system.grantedItems": newItems});
    ui.notifications.info(`Dodano ${droppedItem.name} do rasy ${targetItem.name}`);
});