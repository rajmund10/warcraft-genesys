import { SpecializationSheet } from "./specialization-sheet.js";
import { TalentTreeManager } from "./tree-manager.js";
import { MagicManager } from "./magic-manager.js";

// =============================================================================
// 1. MODEL DANYCH (Logika)
// =============================================================================
class SpecializationDataModel extends foundry.abstract.DataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return { 
            // Te pola pokrywają się z szablonem 'basic' z template.json
            description: new fields.HTMLField({ required: false, initial: "" }),
            // Możesz tu dodawać własne pola specyficzne dla modułu
            attributes: new fields.SchemaField({
                cost: new fields.NumberField({ required: true, initial: 0 }),
                ranked: new fields.BooleanField({ initial: false })
            })
        };
    }
}

// =============================================================================
// 2. INICJALIZACJA (Rejestracja Arkusza i Modelu)
// =============================================================================
Hooks.once('init', () => {
    console.log("WARCRAFT MOD | Init...");

    // Podpinamy nasz model pod typ systemowy
    CONFIG.Item.dataModels.specialization = SpecializationDataModel;

    // Rejestrujemy Arkusz (Wygląd)
    Items.registerSheet("genesys", SpecializationSheet, { 
        types: ["specialization"], 
        makeDefault: true, 
        label: "Edytor Specjalizacji (Warcraft)" 
    });

    setupProseMirrorMenu();
});

// =============================================================================
// 3. TŁUMACZENIA (Żebyś nie musiał edytować en.json w systemie)
// =============================================================================
Hooks.once('i18nInit', () => {
    // Wstrzykujemy nazwę wyświetlaną "Specjalizacja" do systemu
    if (!game.i18n.translations.TYPES) game.i18n.translations.TYPES = { Item: {} };
    if (!game.i18n.translations.TYPES.Item) game.i18n.translations.TYPES.Item = {};
    
    game.i18n.translations.TYPES.Item.specialization = "Specjalizacja";
    CONFIG.Item.typeLabels.specialization = "Specjalizacja";
});

// =============================================================================
// 4. START (Logika Arkusza Postaci i Menedżerów)
// =============================================================================
Hooks.once('ready', () => {
    console.log("WARCRAFT MOD | Ready.");
    Handlebars.registerHelper('includes', (arr, val) => Array.isArray(arr) && arr.includes(val));

    setupCharacterSheet();
    setupHeaderButtons();
    setupTooltipInterceptor();
    setupSkillBonusLogic();
});

// =============================================================================
// 5. FUNKCJE POMOCNICZE (Bez zmian - działające)
// =============================================================================

function setupProseMirrorMenu() {
    Hooks.on("getProseMirrorMenuDropDowns", (menu, dropdowns) => {
        const insertText = (view, text) => {
            const { state, dispatch } = view;
            const tr = state.tr.insertText(text);
            dispatch(tr); view.focus(); return true;
        };
        const symbolData = [
            { title: "🟢 Zdolność (k)", code: "@dice[A]" }, { title: "🟡 Biegłość (l)", code: "@dice[P]" },
            { title: "🟣 Trudność (d)", code: "@dice[D]" }, { title: "🔴 Wyzwanie (c)", code: "@dice[C]" },
            { title: "🟦 Wzmocnienie (b)", code: "@dice[B]" }, { title: "⬛ Komplikacja (s)", code: "@dice[S]" },
            { title: "✅ Sukces (s)", code: "@sym[s]" }, { title: "❌ Porażka (f)", code: "@sym[f]" },
            { title: "⬆️ Przewaga (a)", code: "@sym[a]" }, { title: "⬇️ Zagrożenie (h)", code: "@sym[h]" },
            { title: "☀️ Triumf (t)", code: "@sym[t]" }, { title: "💀 Rozpacz (y)", code: "@sym[d]" }
        ];
        dropdowns['genesys-symbols'] = {
            title: "Symbole Genesys", cssClass: "genesys-selector",
            icon: '<i class="fas fa-dice" style="color:var(--color-text-light)"></i>', 
            entries: symbolData.map(item => ({ action: item.title, title: item.title, cmd: (s, d, v) => insertText(v, item.code) }))
        };
    });
}

function setupCharacterSheet() {
    const sheetConfig = CONFIG.Actor.sheetClasses.character;
    if (!sheetConfig) return;
    const sheetEntry = Object.values(sheetConfig).find(s => s.default) || Object.values(sheetConfig)[0];
    if (!sheetEntry) return;

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
                    label: "Kreator", class: "char-creator-btn", icon: "fas fa-magic",
                    onclick: () => { import("./apps/char-creator.js").then(m => new m.CharacterCreator(this.document).render(true)); }
                });
            }
            return buttons;
        }
        async _render(force, options) {
            await super._render(force, options);
            if (this.element.hasClass('warcraft-mode')) {
                const treeManager = new TalentTreeManager(this, this.element);
                treeManager.injectTab();
                new MagicManager(this, this.element).init();
                setupTooltipInterceptor(this.element);
                if (!this._observer) this._activateObserver();
            }
        }
        _activateObserver() {
            const targetNode = this.element.find('.sheet-body')[0]; 
            if (!targetNode) return;
            const callback = (mutationsList, observer) => {
                if (this._refreshTimeout) clearTimeout(this._refreshTimeout);
                this._refreshTimeout = setTimeout(() => {
                    const treeManager = new TalentTreeManager(this, this.element);
                    treeManager.injectTab();
                    new MagicManager(this, this.element).init();
                }, 50);
            };
            this._observer = new MutationObserver(callback);
            this._observer.observe(targetNode, { childList: true, subtree: true });
        }
        async close(options) {
            if (this._observer) { this._observer.disconnect(); this._observer = null; }
            return super.close(options);
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

function setupHeaderButtons() {
    Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
        if (["archetype", "career"].includes(sheet.document.type)) {
            buttons.unshift({
                label: "Portret", class: "warcraft-portrait-btn", icon: "fas fa-image",
                onclick: async () => {
                    const flagName = sheet.document.type === "archetype" ? "racePortrait" : "careerPortrait";
                    new FilePicker({ type: "image", current: sheet.document.getFlag("warcraft-genesys", flagName) || "", callback: async (path) => {
                        await sheet.document.setFlag("warcraft-genesys", flagName, path);
                        ui.notifications.info(`Zapisano portret dla: ${sheet.document.name}`);
                    }}).browse();
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
                if (target.length > 0 && html.find('.warcraft-portrait-preview').length === 0) {
                    const previewHtml = `<div class="warcraft-portrait-preview" style="width: 100%; height: 300px; margin: 0 0 10px 0; background-image: url('${portrait}'); background-size: cover; background-position: center top; border-bottom: 2px solid #f8b700; box-shadow: 0 5px 15px rgba(0,0,0,0.5); flex: 0 0 100%;"></div>`;
                    target.last().after(previewHtml);
                    setTimeout(() => { app.setPosition({ height: "auto" }); }, 50);
                }
            }
        }
    });
}

function setupTooltipInterceptor(context = document) {
    const target = context === document ? document.getElementById("tooltip") : context;
    if (!target) return;
    if (context === document && window._warcraftTooltipObserver) return;

    const SYMBOLS = { "a": "ability", "p": "proficiency", "d": "difficulty", "c": "challenge", "b": "boost", "s": "setback", "f": "failure", "h": "threat", "t": "triumph", "r": "despair" };
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList" || mutation.type === "characterData") {
                const el = $(target);
                let html = el.html();
                
                if (html && (html.includes("@dice") || html.includes("@sym"))) {
                    if (html.includes("&lt;")) { const t = document.createElement("textarea"); t.innerHTML = html; html = t.value; }
                    const newHtml = html.replace(/@(dice|sym)\[([a-zA-Z])\]/g, (match, type, code) => {
                        const key = code.toLowerCase();
                        return SYMBOLS[key] ? `<span class='genesys-pm-icon ${SYMBOLS[key]}'></span>` : match;
                    });
                    if (html !== newHtml) {
                        observer.disconnect();
                        el.html(newHtml);
                        observer.observe(target, { childList: true, subtree: true });
                    }
                }
            }
        });
    });
    
    observer.observe(target, { childList: true, subtree: true });
    if (context === document) window._warcraftTooltipObserver = observer;
}

function setupSkillBonusLogic() {
    const recalculate = async (actor) => {
        if (!actor || !actor.items) return;
        const skillBonuses = {};
        actor.items.forEach(item => {
            (item.effects || []).forEach(e => {
                if (!e.disabled && !e.isSuppressed) {
                    e.changes.forEach(c => {
                        if (c.key.startsWith("skill.")) {
                            const n = c.key.replace("skill.", "").trim();
                            skillBonuses[n] = (skillBonuses[n] || 0) + (parseInt(c.value) || 0);
                        }
                    });
                }
            });
        });
        const updates = [];
        actor.items.filter(i => i.type === "skill").forEach(s => {
            const cur = s.system.rank || 0;
            const prev = s.getFlag("warcraft-genesys", "activeBonus") || 0;
            const next = skillBonuses[s.name] || 0;
            if (prev !== next) {
                const base = cur - prev;
                updates.push({ _id: s.id, "system.rank": Math.max(0, base + next), "flags.warcraft-genesys.activeBonus": next });
            }
        });
        if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    };

    const trigger = (doc) => {
        const actor = doc.parent || doc.actor;
        if (actor && actor.type === "character") {
            if (actor._recalcT) clearTimeout(actor._recalcT);
            actor._recalcT = setTimeout(() => recalculate(actor), 200);
        }
    };
    Hooks.on("createItem", trigger);
    Hooks.on("deleteItem", trigger);
    Hooks.on("updateItem", (item, ch) => {
        if (ch.effects || (ch.system && ch.system.equipped !== undefined) || (ch.flags && ch.flags["warcraft-genesys"])) trigger(item);
    });
    Hooks.on("createActiveEffect", trigger);
    Hooks.on("deleteActiveEffect", trigger);
    Hooks.on("updateActiveEffect", trigger);
    Hooks.on("dropItemSheetData", async (target, sheet, data) => {
        if (target.type === "archetype" && data.uuid) {
            const item = await fromUuid(data.uuid);
            if (item && ["ability", "talent", "feature"].includes(item.type)) {
                const cur = target.system.grantedItems || [];
                if (!cur.some(i => i.name === item.name)) {
                    await target.update({"system.grantedItems": [...cur, item.toObject()]});
                    ui.notifications.info(`Dodano ${item.name}`);
                }
            }
        }
    });
}