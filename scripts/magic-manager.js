import { MAGIC_DATA } from "./magic-data.js";

export class MagicManager {
    constructor(app, html) {
        this.app = app;
        this.html = html;
        this.actor = app.actor;
        
        this.spellState = this.actor.getFlag("warcraft-genesys", "spellState") || {
            selectedSkill: null,
            selectedAction: null,
            modifiers: {} 
        };
    }

    init() {
        const magicSkills = this.actor.items.filter(i => i.type === "skill" && i.system.category === "magic" && i.system.rank > 0);
        
        if (magicSkills.length === 0) {
            this.html.find('.item[data-tab="magic"]').remove();
            this.html.find('.tab[data-tab="magic"]').remove();
            return;
        }

        if (this.html.find('.item[data-tab="magic"]').length === 0) {
            const navItem = $(`<a class="item" data-tab="magic"><i class="fas fa-sparkles"></i> Magia</a>`);
            const treeTab = this.html.find('.item[data-tab="talent-tree"]');
            if (treeTab.length > 0) treeTab.after(navItem);
            else this.html.find('nav.sheet-tabs').append(navItem);
        }

        if (this.html.find('.tab[data-tab="magic"]').length === 0) {
            const tabContent = $('<div class="tab magic-tab" data-group="primary" data-tab="magic"></div>');
            this.html.find('section.sheet-body').append(tabContent);
        }

        const container = this.html.find('.tab[data-tab="magic"]');
        this.renderMagicTab(container, magicSkills);
    }

    renderMagicTab(container, magicSkills) {
        const skillExists = magicSkills.some(s => s.name === this.spellState.selectedSkill);

        if (!this.spellState.selectedSkill || !skillExists) {
            if (magicSkills.length > 0) {
                this.spellState.selectedSkill = magicSkills[0].name;
                this.spellState.selectedAction = null;
                this.spellState.modifiers = {};
                this._saveState(); 
            } else {
                container.html("<p>Brak dostępnych umiejętności magicznych.</p>");
                return;
            }
        }

        const availableActionsKeys = MAGIC_DATA.skills[this.spellState.selectedSkill] || [];
        const dicePoolHTML = this._generateDicePoolHTML();

        let html = `
        <div class="magic-builder">
            <div class="magic-header">
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <select class="magic-skill-select" style="margin-bottom:0;">
                        ${magicSkills.map(s => `<option value="${s.name}" ${s.name === this.spellState.selectedSkill ? 'selected' : ''}>${s.name} (Ranga ${s.system.rank})</option>`).join('')}
                    </select>
                    <div class="difficulty-preview" style="font-size: 11px;">
                        Trudność: <strong>${this._calculateDifficultyLabel()}</strong>
                    </div>
                </div>

                <div class="dice-pool-preview font-genesys-symbols">
                    ${dicePoolHTML}
                </div>

                <button class="cast-btn"><i class="fas fa-dice-d20"></i> Rzuć Czar</button>
            </div>

            <div class="magic-grid">
                <div class="magic-column actions-col">
                    <h3>Typ Zaklęcia</h3>
                    <div class="action-list">
                        ${availableActionsKeys.map(key => {
                            const action = MAGIC_DATA.actions[key];
                            if (!action) return `<div class="error">Brak definicji: ${key}</div>`;
                            
                            const isActive = this.spellState.selectedAction === key ? "active" : "";
                            return `
                            <div class="magic-card ${isActive}" data-action="${key}">
                                <div class="card-name">
                                    ${action.label} 
                                    <span style="float:right; font-size:0.8em; opacity:0.7;">${this._getDiffLabel(action.difficulty)}</span>
                                </div>
                                <div class="card-desc">${action.desc}</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <div class="magic-column mods-col">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <h3 style="margin:0; border:none;">Modyfikatory</h3>
                        <button class="reset-mods-btn" style="font-size:10px; padding:2px 6px; width:auto; height:auto;">
                            <i class="fas fa-undo"></i> Reset
                        </button>
                    </div>
                    ${this.spellState.selectedAction ? this._renderModifiers() : '<p style="text-align:center; opacity:0.5; margin-top:20px;">Wybierz typ zaklęcia</p>'}
                </div>
            </div>
        </div>`;

        container.html(html);
        this.activateListeners(container);
    }

    _renderModifiers() {
        let html = `<div class="mods-list">`;
        for (const [key, effect] of Object.entries(MAGIC_DATA.effects)) {
            const count = this.spellState.modifiers[key] || 0;
            const activeClass = count > 0 ? "active" : "";
            
            html += `
            <div class="mod-row ${activeClass}">
                <label>${effect.label} (+${effect.mod} trudności)</label>
                <div class="mod-controls">
                    <i class="fas fa-minus-circle mod-btn" data-key="${key}" data-val="-1"></i>
                    <span class="mod-val">${count}</span>
                    <i class="fas fa-plus-circle mod-btn" data-key="${key}" data-val="1"></i>
                </div>
            </div>`;
        }
        html += `</div>`;
        return html;
    }

    // --- LOGIKA ---

    _calculateDifficultyLevel() {
        if (!this.spellState.selectedAction) return 0;
        
        const baseDiffStr = MAGIC_DATA.actions[this.spellState.selectedAction].difficulty;
        let difficultyLevel = this._diffToInt(baseDiffStr);
        
        for (const [key, count] of Object.entries(this.spellState.modifiers)) {
            const effect = MAGIC_DATA.effects[key];
            if (effect && effect.type === "difficulty") {
                difficultyLevel += (count * effect.mod);
            }
        }
        
        // Twardy limit do wyświetlania i logiki (max 5)
        return Math.min(5, Math.max(0, difficultyLevel));
    }

    _calculateDifficultyLabel() {
        return this._intToDiffLabel(this._calculateDifficultyLevel());
    }

    _generateDicePoolHTML() {
        if (!this.spellState.selectedSkill) return "";

        const skillItem = this.actor.items.find(i => i.type === "skill" && i.name === this.spellState.selectedSkill);
        let yellow = 0;
        let green = 0;

        if (skillItem) {
            const rank = skillItem.system.rank || 0;
            const characteristic = skillItem.system.characteristic || "intellect";
            const charVal = this.actor.system.characteristics[characteristic] || 0;

            yellow = Math.min(rank, charVal);
            green = Math.max(rank, charVal) - yellow;
        }

        const purple = this._calculateDifficultyLevel();

        let html = "";
        for (let i = 0; i < yellow; i++) html += `<i class="die die-P">P</i>`;
        for (let i = 0; i < green; i++) html += `<i class="die die-A">A</i>`;
        
        if ((yellow + green > 0) && purple > 0) html += `<span style="width:5px;"></span>`;

        for (let i = 0; i < purple; i++) html += `<i class="die die-D">D</i>`;

        if (html === "") html = `<span style="opacity:0.3; font-size:14px; font-family:'Roboto Slab'">Wybierz akcję</span>`;
        return html;
    }

    _diffToInt(diff) {
        const map = { "simple": 0, "easy": 1, "average": 2, "hard": 3, "daunting": 4, "formidable": 5 };
        return map[diff] || 0;
    }

    _intToDiffLabel(int) {
        const map = ["Prosty (0)", "Łatwy (1k)", "Przeciętny (2k)", "Trudny (3k)", "B. Trudny (4k)", "Imponujący (5k)"];
        if (int >= map.length) return `Imponujący (5k)`;
        return map[int];
    }
    
    _getDiffLabel(diff) {
         const map = { "simple": "Prosty", "easy": "Łatwy", "average": "Przeciętny", "hard": "Trudny", "daunting": "B. Trudny", "formidable": "Imponujący" };
         return map[diff] || diff;
    }

    activateListeners(html) {
        html.find('.magic-skill-select').change(async (ev) => {
            this.spellState.selectedSkill = ev.target.value;
            this.spellState.selectedAction = null; 
            this.spellState.modifiers = {};        
            await this._saveState();
            this.init(); 
        });

        html.find('.reset-mods-btn').click(async (ev) => {
            ev.preventDefault();
            this.spellState.modifiers = {}; // Czyścimy obiekt
            await this._saveState();
            this.init();
        });

        html.find('.magic-card').click(async (ev) => {
            const actionKey = $(ev.currentTarget).data('action');
            if (this.spellState.selectedAction !== actionKey) {
                this.spellState.selectedAction = actionKey;
                this.spellState.modifiers = {}; 
            }
            await this._saveState();
            this.init();
        });

        // --- OBSŁUGA PRZYCISKÓW MODYFIKATORÓW (Z WALIDACJĄ) ---
        html.find('.mod-btn').click(async (ev) => {
            const key = $(ev.currentTarget).data('key');
            const val = parseInt($(ev.currentTarget).data('val')); // +1 lub -1
            
            // Inicjalizacja, jeśli brak
            if (!this.spellState.modifiers[key]) this.spellState.modifiers[key] = 0;

            // WALIDACJA: Jeśli próbujemy dodać (+)
            if (val > 0) {
                // Pobierz definicję efektu, żeby sprawdzić, czy zwiększa trudność
                const effectData = MAGIC_DATA.effects[key];
                const difficultyCost = effectData ? effectData.mod : 0;

                // Oblicz obecny poziom trudności
                const currentDiff = this._calculateDifficultyLevel();

                // Jeśli efekt zwiększa trudność (koszt > 0) I już mamy 5, blokujemy
                if (difficultyCost > 0 && currentDiff >= 5) {
                    ui.notifications.warn("Zaklęcie nie może być bardziej wzmocnione (osiągnięto limit 5k trudności).");
                    return; // Przerywamy funkcję, nie dodajemy
                }
            }

            // Jeśli walidacja przeszła (lub odejmujemy), wykonujemy zmianę
            this.spellState.modifiers[key] += val;
            
            // Zabezpieczenie przed ujemnymi ilościami modyfikatora
            if (this.spellState.modifiers[key] < 0) this.spellState.modifiers[key] = 0;
            
            await this._saveState();
            this.init();
        });

        html.find('.cast-btn').click(async (ev) => {
            ev.preventDefault();
            
            if (!this.spellState.selectedAction) {
                ui.notifications.warn("Wybierz najpierw typ zaklęcia!");
                return;
            }
            
            // --- FIX: Lepsze sprawdzanie dostępności DicePrompt ---
            if (typeof window.DicePrompt === "undefined") {
                ui.notifications.error("KRYTYCZNY BŁĄD: Nie znaleziono 'window.DicePrompt'. Upewnij się, że plik genesys.js został zmodyfikowany!");
                console.error("WARCRAFT MOD | Window.DicePrompt is undefined. Did you patch the system?");
                return;
            }

            const difficultyLevel = this._calculateDifficultyLevel(); 
            
            // Zabezpieczenie przed ujemnym poziomem (choć logika wyżej to robi, warto dmuchać na zimne przy generowaniu stringa)
            let safeDiff = Math.max(0, difficultyLevel);
            let diffString = "D".repeat(safeDiff);
            
            try {
                // Wywołanie rzutu
                await window.DicePrompt.promptForRoll(
                    this.actor, 
                    this.spellState.selectedSkill, 
                    { difficulty: diffString }
                );
            } catch (err) {
                console.error("WARCRAFT MOD | Błąd rzutu:", err);
                ui.notifications.error("Wystąpił błąd podczas wywoływania rzutu. Sprawdź konsolę (F12).");
            }
        });
    }

    async _saveState() {
        await this.actor.setFlag("warcraft-genesys", "spellState", this.spellState);
    }
}