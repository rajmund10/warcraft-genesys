import { TalentTreeManager } from "../tree-manager.js"; 

console.log("%cWARCRAFT KREATOR: WERSJA FINALNA (Więź z Niebem -> Jeździectwo)", "color: #00ff00; background: #000; font-weight: bold; font-size: 16px; padding: 5px;");

export class CharacterCreator extends FormApplication {
    
    constructor(actor, options) {
        super(actor, options);
        this.actor = actor;
        
        this.loadedData = {
            races: [], careers: [], skills: [], specializations: [], talents: [], tables: []
        };

        this.creationData = {
            step: 1, speciesId: null, careerId: null, careerSkills: [], specId: null, raceGroup: null,
            attributes: { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 },
            skills: {}, 
            purchasedTalents: [], 
            spentXP: 0, totalXP: 0, charName: "Nowa Postać",
            motivations: {
                strength: { name: "", description: "" },
                flaw: { name: "", description: "" },
                desire: { name: "", description: "" },
                fear: { name: "", description: "" }
            }    
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "warcraft-char-creator",
            title: "Kreator Postaci (Warcraft)",
            template: "modules/warcraft-genesys/templates/apps/creator.html",
            width: 1100, height: 850, resizable: true,
            classes: ["warcraft-mode", "char-creator"]
        });
    }

    // --- FIX BŁĘDÓW TEXT EDITOR ---
    async _enrich(content) {
        if (!content) return "";
        if (foundry.applications?.ux?.TextEditor?.enrichHTML) {
            return await foundry.applications.ux.TextEditor.enrichHTML(content, { async: true });
        }
        return await TextEditor.enrichHTML(content, { async: true });
    }

    _getSkillBonuses() {
        const bonuses = {};
        const itemsToCheck = [];
        
        if (this.creationData.speciesId) {
            const species = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
            if (species) {
                itemsToCheck.push(species);
                if (species.system.grantedItems && Array.isArray(species.system.grantedItems)) {
                    species.system.grantedItems.forEach(i => itemsToCheck.push(i));
                }
                else if (species.items) {
                    const contents = species.items.contents || species.items;
                    if (Array.isArray(contents)) contents.forEach(i => itemsToCheck.push(i));
                    else if (typeof contents.forEach === 'function') contents.forEach(i => itemsToCheck.push(i));
                }
            }
        }

        if (this.creationData.careerId) itemsToCheck.push(this.loadedData.careers.find(c => c.id === this.creationData.careerId));
        if (this.creationData.specId) itemsToCheck.push(this.loadedData.specializations.find(s => s.id === this.creationData.specId));

        if (this.creationData.purchasedTalents.length > 0) {
            this.creationData.purchasedTalents.forEach(uniqueId => {
                const [specId, nodeKey] = uniqueId.split('_');
                const specItem = this.loadedData.specializations.find(s => s.id === specId);
                let treeData = specItem?.flags?.["warcraft-genesys"]?.treeData;
                if (!treeData && specItem?._source?.flags?.["warcraft-genesys"]?.treeData) treeData = specItem._source.flags["warcraft-genesys"].treeData;

                if (treeData?.nodes?.[nodeKey]) {
                    const talentItem = this.loadedData.talents.find(t => t.name === treeData.nodes[nodeKey].name);
                    if (talentItem) itemsToCheck.push(talentItem);
                }
            });
        }

        itemsToCheck.forEach(item => {
            if (!item) return;
            let effectsArray = [];
            if (item.effects) {
                if (Array.isArray(item.effects)) effectsArray = item.effects;
                else if (item.effects instanceof Map || (item.effects.map && item.effects.get)) effectsArray = Array.from(item.effects.values());
                else if (item.effects.contents) effectsArray = item.effects.contents;
            }

            effectsArray.forEach(effect => {
                if (effect.disabled) return; 
                (effect.changes || []).forEach(change => {
                    if (change.key && change.key.startsWith("skill.")) {
                        const skillName = change.key.replace("skill.", "").trim();
                        const value = parseInt(change.value) || 0;
                        if (!bonuses[skillName]) bonuses[skillName] = 0;
                        bonuses[skillName] += value;
                    }
                });
            });
        });
        return bonuses;
    }

    async getData() {
        await this._loadCompendiumData();
        const data = super.getData();
        data.state = this.creationData;
        
        // --- LOGIKA GRUPOWANIA RAS ---
        const groupedRaces = {};
        
        this.loadedData.races.forEach(race => {
            // Pobieramy pierwsze słowo jako nazwę grupy (np. "Człowiek", "Krasnolud")
            // Usuwamy ewentualne dwukropki czy nawiasy
            let groupName = race.name.split(" ")[0].replace(/[:()]/g, "").trim();
            
            if (!groupedRaces[groupName]) groupedRaces[groupName] = [];
            groupedRaces[groupName].push(race);
        });

        // Sortujemy nazwy grup alfabetycznie
        data.raceGroups = Object.keys(groupedRaces).sort((a, b) => a.localeCompare(b));

        // Sprawdzamy, czy wybrana grupa jest poprawna
        if (this.creationData.raceGroup && !groupedRaces[this.creationData.raceGroup]) {
            this.creationData.raceGroup = null;
        }

        // Jeśli grupa jest wybrana, przekazujemy listę ras z tej grupy do 2 dropdowna
        if (this.creationData.raceGroup) {
            data.availableSubRaces = groupedRaces[this.creationData.raceGroup].sort((a, b) => a.name.localeCompare(b.name));
        } else {
            data.availableSubRaces = [];
        }
        
        // (Reszta standardowych danych)
        data.careers = this.loadedData.careers;
        data.specializations = this.loadedData.specializations;

        data.isStep1 = this.creationData.step === 1;
        data.isStep2 = this.creationData.step === 2;
        data.isStep3 = this.creationData.step === 3;
        data.isStep4 = this.creationData.step === 4;
        data.isStep5 = this.creationData.step === 5;

        data.currentSpecies = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
        data.raceImage = "icons/svg/mystery-man.svg";
        data.enrichedRaceDescription = "";
        data.racialAbilities = []; 

        if (data.currentSpecies) {
            let flag = data.currentSpecies.flags?.["warcraft-genesys"]?.racePortrait;
            if (!flag) flag = data.currentSpecies.getFlag?.("warcraft-genesys", "racePortrait");
            data.raceImage = flag || data.currentSpecies.img;
            data.enrichedRaceDescription = await this._enrich(data.currentSpecies.system.description);
            
            let raceItems = [];
            if (data.currentSpecies.system.grantedItems && Array.isArray(data.currentSpecies.system.grantedItems)) {
                raceItems = data.currentSpecies.system.grantedItems;
            } else if (data.currentSpecies.items && data.currentSpecies.items.size > 0) {
                raceItems = data.currentSpecies.items.contents;
            }

            if (raceItems.length > 0) {
                data.racialAbilities = await Promise.all(raceItems.map(async (item) => {
                    let descText = item.system?.description || "";
                    if (typeof descText === 'object' && descText.value) descText = descText.value;
                    return {
                        name: item.name,
                        img: item.img || "icons/svg/item-bag.svg",
                        description: await this._enrich(descText)
                    };
                }));
            }
        }

        data.currentCareer = this.loadedData.careers.find(c => c.id === this.creationData.careerId);
        data.careerImage = "icons/svg/mystery-man.svg";
        data.enrichedCareerDescription = "";
        
        if (data.currentCareer) {
            let flag = data.currentCareer.flags?.["warcraft-genesys"]?.careerPortrait;
            if (!flag) flag = data.currentCareer.getFlag?.("warcraft-genesys", "careerPortrait");
            data.careerImage = flag || data.currentCareer.img;
            data.enrichedCareerDescription = await this._enrich(data.currentCareer.system.description);
        }

        data.currentSpec = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
        data.enrichedSpecDescription = "";
        
        if (data.currentSpec) {
            data.enrichedSpecDescription = await this._enrich(data.currentSpec.system.description);
            const treeData = data.currentSpec.flags?.["warcraft-genesys"]?.treeData;
            if (treeData && treeData.backgroundImage) {
                data.specBg = treeData.backgroundImage;
                data.specPos = `${treeData.bgPosX || '0px'} ${treeData.bgPosY || '0px'}`;
            }
        }

        if (data.currentCareer) {
            const rawSkills = data.currentCareer.system.careerSkills || [];
            data.careerSkillOptions = rawSkills.map(skill => (typeof skill === 'string' ? skill : (skill.name || "Skill")));
        } else {
            data.careerSkillOptions = [];
        }

        const availableXP = this.creationData.totalXP - this.creationData.spentXP;

        data.attributeList = Object.entries(this.creationData.attributes).map(([key, val]) => {
            const nextCost = (val + 1) * 10;
            let baseVal = 1;
            if (data.currentSpecies?.system?.characteristics) {
                baseVal = data.currentSpecies.system.characteristics[key] || 1;
            }
            return {
                key: key, 
                label: this._localizeAttribute(key), 
                value: val, 
                cost: nextCost,
                canBuy: (val < 5) && (availableXP >= nextCost),
                canRefund: val > baseVal
            };
        });

        // --- SKILLS ---
        const categories = {
            "combat": { label: "Walka", skills: [] }, 
            "general": { label: "Ogólne", skills: [] },
            "social": { label: "Społeczne", skills: [] }, 
            "knowledge": { label: "Wiedza", skills: [] },
            "magic": { label: "Magia", skills: [] }
        };

        const skillBonuses = this._getSkillBonuses(); 

        this.loadedData.skills.forEach(skillItem => {
            const key = skillItem.name; 
            
            // --- SPRAWDZANIE CZY SKILL JEST KLASOWY (GWIAZDKA) ---
            const isCareer = this._isCareerSkill(key);
            
            const purchasedRank = this.creationData.skills[key] || 0;
            const bonusRank = skillBonuses[key] || 0;
            const totalRank = purchasedRank + bonusRank;
            
            const nextCost = (totalRank + 1) * 5 + (isCareer ? 0 : 5);
            
            let catKey = skillItem.system.category ? skillItem.system.category.toLowerCase() : "general";
            if (!categories[catKey]) catKey = "general";

            categories[catKey].skills.push({
                key: key, 
                label: skillItem.name, 
                rank: totalRank, 
                isCareer: isCareer, 
                cost: nextCost,
                canBuy: (totalRank < 5) && (availableXP >= nextCost),
                canRefund: purchasedRank > 0 
            });
        });

        for (const cat of Object.values(categories)) {
            cat.skills.sort((a, b) => a.label.localeCompare(b.label));
        }
        data.categorizedSkills = Object.values(categories).filter(c => c.skills.length > 0);

        if (data.currentSpecies) {
            const raceWounds = data.currentSpecies.system.woundThreshold || 10;
            const raceStrain = data.currentSpecies.system.strainThreshold || 10;
            data.derived = {
                wounds: raceWounds + this.creationData.attributes.brawn,
                strain: raceStrain + this.creationData.attributes.willpower,
                soak: this.creationData.attributes.brawn
            };
        } else {
            data.derived = { wounds: 0, strain: 0, soak: 0 };
        }

        data.availableXP = availableXP;
        return data;
    }

    async _loadCompendiumData() {
        if (this.loadedData.races.length > 0) return;
        const packs = {
            races: "warcraft-genesys.warcraft-races", 
            careers: "warcraft-genesys.warcraft-careers",
            skills: "warcraft-genesys.warcraft-skills", 
            talents: "warcraft-genesys.warcraft-talents",
            specializations: "warcraft-genesys.warcraft-specializations",
            tables: "warcraft-genesys.warcraft-tables"
        };
        const getPackContent = async (packKey) => {
            const pack = game.packs.get(packKey);
            return pack ? await pack.getDocuments() : [];
        };
        this.loadedData.races = await getPackContent(packs.races);
        this.loadedData.careers = await getPackContent(packs.careers);
        this.loadedData.skills = await getPackContent(packs.skills);
        this.loadedData.talents = await getPackContent(packs.talents);
        this.loadedData.specializations = await getPackContent(packs.specializations);
        this.loadedData.tables = await getPackContent(packs.tables);
    }

    // --- FUNKCJA GWIAZDKI (WIZUALNA) ---
    _isCareerSkill(skillName) {
        const cleanName = String(skillName).trim();

        // 1. LOGIKA WILDHAMMER (Więź z Niebem -> Jeździectwo = GWIAZDKA)
        if (cleanName === "Jeździectwo" && this.creationData.speciesId) {
            const race = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
            if (race) {
                // Skanujemy zawartość rasy
                const allRaceItems = [];
                // Nowy standard Genesys
                if (race.system.grantedItems && Array.isArray(race.system.grantedItems)) {
                    allRaceItems.push(...race.system.grantedItems);
                }
                // Stary standard (Embedded)
                if (race.items) {
                    const embedded = race.items.contents || race.items;
                    if (Array.isArray(embedded)) allRaceItems.push(...embedded);
                }

                const hasSkyBond = allRaceItems.some(i => 
                    i.name.toLowerCase().includes("więź z niebem") || 
                    i.name.toLowerCase().includes("bond with the sky")
                );

                if (hasSkyBond) return true; // Jest gwiazdka!
            }
        }

        // 2. Czy jest na liście wybranych darmowych (Krok 2)?
        if (this.creationData.careerSkills.includes(cleanName)) return true;

        // 3. Profesja
        if (this.creationData.careerId) {
            const career = this.loadedData.careers.find(c => c.id === this.creationData.careerId);
            if (career && career.system.careerSkills) {
                const careerSkills = career.system.careerSkills.map(s => (typeof s === 'string' ? s : (s.name || "")).trim());
                if (careerSkills.includes(cleanName)) return true;
            }
        }

        // 4. Specjalizacja
        if (this.creationData.specId) {
            const spec = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
            if (spec && spec.system.careerSkills) {
                const specSkills = spec.system.careerSkills.map(s => (typeof s === 'string' ? s : (s.name || "")).trim());
                if (specSkills.includes(cleanName)) return true;
            }
        }

        return false;
    }

    _localizeAttribute(key) {
        const map = { brawn: "Budowa", agility: "Zwinność", intellect: "Intelekt", cunning: "Spryt", willpower: "Siła Woli", presence: "Ogłada" };
        return map[key] || key;
    }

    _validateStep() {
        const d = this.creationData;
        if (d.step === 1 && !d.speciesId) { ui.notifications.warn("Wybierz pochodzenie!"); return false; }
        if (d.step === 2) { if (!d.careerId) { ui.notifications.warn("Wybierz profesję!"); return false; } if (d.careerSkills.length < 4) { ui.notifications.warn("Wybierz 4 darmowe umiejętności."); return false; } }
        if (d.step === 3 && !d.specId) { ui.notifications.warn("Wybierz specjalizację!"); return false; }
        return true;
    }

    _renderActiveTree(html) {
        const container = html.find('#active-tree-canvas');
        if (container.length === 0) return;

        const specItem = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
        if (!specItem) {
            container.html('<p style="text-align:center; margin-top:20px;">Nie wybrano specjalizacji.</p>');
            return;
        }

        let treeData = specItem.flags?.["warcraft-genesys"]?.treeData;
        if (!treeData && specItem._source?.flags?.["warcraft-genesys"]?.treeData) {
            treeData = specItem._source.flags["warcraft-genesys"].treeData;
        }

        if (!treeData) {
            container.html('<p style="text-align:center; margin-top:20px;">Ta specjalizacja nie ma skonfigurowanego drzewka.</p>');
            return;
        }

        const treeDataCopy = JSON.parse(JSON.stringify(treeData));
        for (const [nodeKey, node] of Object.entries(treeDataCopy.nodes)) {
            const uniqueId = `${specItem.id}_${nodeKey}`;
            node.purchased = this.creationData.purchasedTalents.includes(uniqueId);
        }

        const treeManager = new TalentTreeManager(this, container, treeDataCopy);
        
        treeManager.purchaseTalent = async (key, node, cost) => {
            const uniqueId = `${specItem.id}_${key}`;
            if ((this.creationData.totalXP - this.creationData.spentXP) < cost) {
                return ui.notifications.warn("Za mało PD!");
            }
            if (!treeManager.checkAccessibility(parseInt(key.split('-')[0]), parseInt(key.split('-')[1]))) {
                 return ui.notifications.warn("Musisz najpierw kupić połączony talent!");
            }
            this.creationData.spentXP += cost;
            this.creationData.purchasedTalents.push(uniqueId);
            this.render(true);
        };

        treeManager.refundTalent = async (key, node, cost) => {
            const uniqueId = `${specItem.id}_${key}`;
            node.purchased = false; 
            if (!treeManager.checkTreeIntegrity(key)) {
                node.purchased = true; 
                return ui.notifications.warn("Nie możesz zwrócić tego talentu (przerywa ścieżkę)!");
            }
            this.creationData.spentXP -= cost;
            this.creationData.purchasedTalents = this.creationData.purchasedTalents.filter(id => id !== uniqueId);
            this.render(true);
        };

        treeManager.init();
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        html.find('.nav-btn').click(ev => {
            const btn = $(ev.currentTarget);
            if (btn.hasClass('finish-btn')) { this._onFinish(); return; }
            const action = btn.data('action');
            if (action === 'next') { if (!this._validateStep()) return; this.creationData.step++; }
            if (action === 'prev') this.creationData.step--;
            this.render(true);
        });

        html.find('.race-group-select').change(ev => {
            ev.stopPropagation();
            // Zapisujemy wybraną grupę
            this.creationData.raceGroup = ev.target.value;
            // Resetujemy wybór konkretnej rasy, bo zmieniliśmy kategorię
            this.creationData.speciesId = null;
            // Resetujemy bonusy Gnomów/Ludzi przy zmianie grupy
            this.creationData.gnomeBonusSkill = null; 
            
            this.render(true);
        });

        html.find('.species-dropdown').not('.career-dropdown').not('.spec-dropdown').change(ev => {
            ev.stopPropagation();
            this._setSpecies(ev.target.value);
        });

        html.find('.species-dropdown').not('.career-dropdown').not('.spec-dropdown').change(ev => {
            ev.stopPropagation();
            this._setSpecies(ev.target.value);
        });
        html.find('.career-dropdown').change(ev => {
            ev.stopPropagation();
            this.creationData.careerId = ev.target.value;
            this.creationData.careerSkills = []; 
            this.render(true);
        });
        html.find('.spec-dropdown').change(ev => { 
            ev.stopPropagation();
            this.creationData.specId = ev.target.value;
            this.render(true); 
        });
        
        html.find('.skill-check').change(ev => {
            const skillName = $(ev.currentTarget).val();
            const isSelected = this.creationData.careerSkills.includes(skillName);

            if (isSelected) {
                this.creationData.careerSkills = this.creationData.careerSkills.filter(s => s !== skillName);
                delete this.creationData.skills[skillName];
            } else {
                if (this.creationData.careerSkills.length < 4) {
                    this.creationData.careerSkills.push(skillName);
                    this.creationData.skills[skillName] = 1;
                } else {
                    ev.currentTarget.checked = false;
                    ui.notifications.warn("Możesz wybrać maksymalnie 4 darmowe umiejętności.");
                    return; 
                }
            }
            this.render(true); 
        });

        html.find('.attr-buy').click(ev => { 
            const key = $(ev.currentTarget).attr('data-key');
            const currentVal = this.creationData.attributes[key];
            const cost = (currentVal + 1) * 10;
            if (currentVal >= 5) return;
            if ((this.creationData.totalXP - this.creationData.spentXP) < cost) { ui.notifications.warn("Za mało PD!"); return; }
            this.creationData.spentXP += cost;
            this.creationData.attributes[key]++;
            this.render(true); 
        });

        html.find('.attr-refund').click(ev => { 
            const key = $(ev.currentTarget).attr('data-key');
            const currentVal = this.creationData.attributes[key];
            let baseVal = 1;
            const species = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
            if (species?.system?.characteristics?.[key]) baseVal = species.system.characteristics[key];
            if (currentVal <= baseVal) return; 
            this.creationData.spentXP -= (currentVal * 10); 
            this.creationData.attributes[key]--;
            this.render(true); 
        });

        // --- ZAKUPY UMIEJĘTNOŚCI (FIX: STORMWIND + STROMGARDE + GNOMY) ---
        // --- ZAKUPY UMIEJĘTNOŚCI (FIX: WSZYSTKIE RASY) ---
        html.find('.skill-buy').click(ev => { 
            const key = $(ev.currentTarget).attr('data-key'); 
            const bonuses = this._getSkillBonuses();
            
            const purchasedRank = this.creationData.skills[key] || 0; 
            const bonusRank = bonuses[key] || 0;
            const totalRank = purchasedRank + bonusRank;

            // 1. Limit rangi 2
            if (totalRank >= 2) { 
                ui.notifications.warn("Podczas tworzenia postaci nie możesz podnieść umiejętności powyżej rangi 2."); 
                return; 
            }

            const isCareer = this._isCareerSkill(key);
            const skillItem = this.loadedData.skills.find(s => s.name === key);
            const isCombat = skillItem && skillItem.system.category === "combat";
            
            // Definicje skilli rasowych (dla sprawdzenia nazw PL/ENG)
            const isGnomeSkill = ["Alchemia", "Alchemy", "Mechanika", "Mechanics", "Mechanics (ENG)", "Alchemy (ENG)"].includes(key);
            const isFelSkill = ["Przymus", "Coercion", "Odporność", "Resilience"].includes(key);

            let cost = 0;
            let isFreePurchase = false;
            let freeType = null; // 'stormwind', 'stromgarde', 'gnome', 'fel'

            // A. Stromgarde (Walka)
            if (this.creationData.freeCombatMax > 0 &&
                this.creationData.freeCombatUsed < this.creationData.freeCombatMax &&
                isCombat &&
                purchasedRank === 0) {
                
                cost = 0; isFreePurchase = true; freeType = 'stromgarde';
            }
            // B. GNOMY (Alchemia / Mechanika)
            else if (this.creationData.freeGnomeSkillMax > 0 &&
                this.creationData.freeGnomeSkillUsed < this.creationData.freeGnomeSkillMax &&
                isGnomeSkill &&
                purchasedRank === 0) {
                
                cost = 0; isFreePurchase = true; freeType = 'gnome';
            }
            // C. FEL ORC (Przymus / Odporność) - NOWOŚĆ
            else if (this.creationData.freeFelSkillMax > 0 &&
                this.creationData.freeFelSkillUsed < this.creationData.freeFelSkillMax &&
                isFelSkill &&
                purchasedRank === 0) {
                
                cost = 0; isFreePurchase = true; freeType = 'fel';
            }
            // D. Stormwind (Nieklasowe)
            else if (this.creationData.freeNonCareerMax > 0 && 
                this.creationData.freeNonCareerUsed < this.creationData.freeNonCareerMax &&
                !isCareer && 
                purchasedRank === 0) {
                
                cost = 0; isFreePurchase = true; freeType = 'stormwind';
            }
            // E. Standardowy zakup
            else {
                cost = (totalRank + 1) * 5 + (isCareer ? 0 : 5);
            }
            
            // Sprawdzenie PD
            if (!isFreePurchase && (this.creationData.totalXP - this.creationData.spentXP) < cost) { 
                ui.notifications.warn("Za mało PD!"); 
                return; 
            }

            // Aplikacja zmian
            this.creationData.skills[key] = purchasedRank + 1; 
            this.creationData.spentXP += cost;

            if (isFreePurchase) {
                if (freeType === 'stromgarde') {
                    this.creationData.freeCombatUsed++;
                    this.creationData.freeCombatList.push(key);
                    ui.notifications.info(`Wykorzystano darmową walkę dla: ${key}`);
                } else if (freeType === 'gnome') {
                    this.creationData.freeGnomeSkillUsed++;
                    this.creationData.freeGnomeSkillList.push(key);
                    ui.notifications.info(`Gnomia inwencja! Darmowa ranga dla: ${key}`);
                } else if (freeType === 'fel') {
                    // NOWOŚĆ - Zapisujemy wybór Orka
                    this.creationData.freeFelSkillUsed++;
                    this.creationData.freeFelSkillList.push(key);
                    ui.notifications.info(`Wybrano drogę: ${key}`);
                } else {
                    this.creationData.freeNonCareerUsed++;
                    this.creationData.freeNonCareerList.push(key);
                    ui.notifications.info(`Wykorzystano darmowe rozwinięcie dla: ${key}`);
                }
            }

            this.render(true); 
        });

        html.find('.skill-refund').click(ev => { 
            const key = $(ev.currentTarget).attr('data-key'); 
            const bonuses = this._getSkillBonuses();
            const purchasedRank = this.creationData.skills[key] || 0;
            const bonusRank = bonuses[key] || 0;
            const totalRank = purchasedRank + bonusRank;
            const isCareer = this._isCareerSkill(key); 
            
            if (this.creationData.careerSkills.includes(key) && purchasedRank === 1) { 
                ui.notifications.warn("To darmowa ranga z profesji."); return; 
            }
            
            // Sprawdzamy pule
            const stormwindIndex = this.creationData.freeNonCareerList ? this.creationData.freeNonCareerList.indexOf(key) : -1;
            const stromgardeIndex = this.creationData.freeCombatList ? this.creationData.freeCombatList.indexOf(key) : -1;
            const gnomeIndex = this.creationData.freeGnomeSkillList ? this.creationData.freeGnomeSkillList.indexOf(key) : -1;
            const felIndex = this.creationData.freeFelSkillList ? this.creationData.freeFelSkillList.indexOf(key) : -1; // NOWOŚĆ

            // Warunki zwrotu do puli (tylko z rangi 1 na 0)
            const isStormwindReturn = stormwindIndex !== -1 && purchasedRank === 1;
            const isStromgardeReturn = stromgardeIndex !== -1 && purchasedRank === 1;
            const isGnomeReturn = gnomeIndex !== -1 && purchasedRank === 1;
            const isFelReturn = felIndex !== -1 && purchasedRank === 1; // NOWOŚĆ

            if (isStromgardeReturn) {
                this.creationData.freeCombatUsed--;
                this.creationData.freeCombatList.splice(stromgardeIndex, 1);
            } else if (isGnomeReturn) {
                this.creationData.freeGnomeSkillUsed--;
                this.creationData.freeGnomeSkillList.splice(gnomeIndex, 1);
            } else if (isFelReturn) {
                // NOWOŚĆ - Zwrot do puli Orka
                this.creationData.freeFelSkillUsed--;
                this.creationData.freeFelSkillList.splice(felIndex, 1);
            } else if (isStormwindReturn) {
                this.creationData.freeNonCareerUsed--;
                this.creationData.freeNonCareerList.splice(stormwindIndex, 1);
            } else {
                // Normalny zwrot PD
                const refundAmount = totalRank * 5 + (isCareer ? 0 : 5);
                this.creationData.spentXP -= refundAmount; 
            }

            this.creationData.skills[key] = purchasedRank - 1; 
            if (this.creationData.skills[key] <= 0) delete this.creationData.skills[key]; 
            
            this.render(true); 
        });
        html.find('.mot-input').change(ev => {
            const type = $(ev.currentTarget).data('type');
            const field = $(ev.currentTarget).data('field');
            this.creationData.motivations[type][field] = ev.target.value;
        });
        html.find('.mot-roll').click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const type = btn.attr('data-type');       
            const tableName = btn.attr('data-table'); 
            if (!this.loadedData.tables) return;
            const table = this.loadedData.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
            if (!table) return ui.notifications.warn(`Brak tabeli: ${tableName}`);
            const draw = await table.draw({ displayChat: false }); 
            if (!draw.results || draw.results.length === 0) return;
            const result = draw.results[0];
            let resultText = result.text || result.data?.text || result.name || "";
            let name = resultText;
            let desc = "";
            if (resultText.includes(":")) {
                const parts = resultText.split(":");
                name = parts[0].trim();
                desc = parts.slice(1).join(":").trim(); 
            }
            this.creationData.motivations[type].name = name;
            this.creationData.motivations[type].description = desc;
            this.render(true);
        });
        html.find('input[name="charName"]').change(ev => this.creationData.charName = ev.target.value);
        if (this.creationData.step === 4) this._renderActiveTree(html);
    }

    _setSpecies(id) {
        const species = this.loadedData.races.find(r => r.id === id);
        if (!species) return;
        
        // 1. Reset podstawowych danych postaci
        this.creationData.speciesId = id;
        // Kopiujemy atrybuty, żeby nie modyfikować oryginału w pamięci
        this.creationData.attributes = { ...(species.system?.characteristics || { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 }) };
        this.creationData.totalXP = species.system.startingXP || 100;
        this.creationData.spentXP = 0; 
        
        // Resetujemy umiejętności i talenty przy zmianie rasy
        this.creationData.skills = {}; 
        this.creationData.careerSkills = []; 
        this.creationData.purchasedTalents = [];

        // --- DIAGNOSTYKA SPECJALNYCH ZDOLNOŚCI ---
        console.group(`WARCRAFT MOD | Sprawdzanie zdolności rasy: ${species.name}`);
        
        // Flagi dla logiki przyznawania bonusów
        let hasFreeSkills = false;  // Stormwind (2 dowolne nieklasowe)
        let hasCombatSkill = false; // Stromgarde (1 walka)
        let hasGnomeSkill = false;  // Gnom (Alchemia/Mechanika)
        let hasFelSkill = false;    // Fel Orc (Przymus/Odporność)
        
        // Słowa kluczowe do szukania w opisach/nazwach
        const stormwindTerms = ["Starting Skills", "Początkowe Umiejętności", "Wszechstronność"];
        const stromgardeTerms = ["Dziedzictwo Arathi", "Legacy of Arathi"];
        const gnomeTerms = ["rozwiązania tam, gdzie inni widzą problemy", "świat jest zagadką"];
        const felTerms = ["przymus lub odporność", "droga dominacji, czy przetrwania"];

        // Funkcja pomocnicza przeszukująca listę przedmiotów
        const checkItems = (items) => {
            if (!items) return;
            // Obsługa różnych struktur danych Foundry (Array vs Collection)
            const list = Array.isArray(items) ? items : (items.contents || []);
            
            for (const item of list) {
                const name = item.name.toLowerCase();
                const desc = (item.system?.description?.value || item.system?.description || "").toLowerCase();
                
                // A. Stormwind Humans
                if (stormwindTerms.some(term => name.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Stormwind Bonus: ${item.name}`, "color: green; font-weight: bold;");
                    hasFreeSkills = true;
                }
                
                // B. Stromgarde Humans
                if (stromgardeTerms.some(term => name.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Stromgarde Bonus: ${item.name}`, "color: firebrick; font-weight: bold;");
                    hasCombatSkill = true;
                }

                // C. Gnomy
                if (gnomeTerms.some(term => desc.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Gnom Bonus: ${item.name}`, "color: purple; font-weight: bold;");
                    hasGnomeSkill = true;
                }

                // D. Fel Orcs (NOWOŚĆ)
                if (felTerms.some(term => desc.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Fel Orc Bonus: ${item.name}`, "color: darkred; font-weight: bold;");
                    hasFelSkill = true;
                }
            }
        };

        // 1. Sprawdź w grantedItems (Natywne dla nowych systemów)
        if (species.grantedItems) checkItems(species.grantedItems);
        else if (species.system?.grantedItems) checkItems(species.system.grantedItems);
        
        // 2. Sprawdź w items (Legacy / Fallback)
        if (!hasFreeSkills && !hasCombatSkill && !hasGnomeSkill && !hasFelSkill) {
            if (species.items) checkItems(species.items);
        }

        console.groupEnd();

        // --- INICJALIZACJA LICZNIKÓW I PUL ---

        // A. Stormwind (Dowolne nieklasowe)
        this.creationData.freeNonCareerMax = hasFreeSkills ? 2 : 0;
        this.creationData.freeNonCareerUsed = 0;
        this.creationData.freeNonCareerList = [];

        // B. Stromgarde (Dowolna walka)
        this.creationData.freeCombatMax = hasCombatSkill ? 1 : 0;
        this.creationData.freeCombatUsed = 0;
        this.creationData.freeCombatList = [];
        
        // C. Gnomy (Alchemia / Mechanika)
        this.creationData.freeGnomeSkillMax = hasGnomeSkill ? 1 : 0;
        this.creationData.freeGnomeSkillUsed = 0;
        this.creationData.freeGnomeSkillList = [];

        // D. Fel Orcs (Przymus / Odporność) - NOWOŚĆ
        this.creationData.freeFelSkillMax = hasFelSkill ? 1 : 0;
        this.creationData.freeFelSkillUsed = 0;
        this.creationData.freeFelSkillList = [];

        this.render(true);
    }

    // --- FINALIZACJA POSTACI (DODAJE JEŹDZIECTWO) ---
    async _onFinish() {
        console.log("WARCRAFT MOD | Finalizowanie tworzenia postaci...");
        const actorId = this.actor.id;
        let realActor = game.actors.get(actorId);
        if (!realActor) realActor = this.actor;

        const d = this.creationData;
        
        // 1. DANE ŹRÓDŁOWE
        const raceItem = this.loadedData.races.find(r => r.id === d.speciesId);
        const specItem = this.loadedData.specializations.find(s => s.id === d.specId);
        const careerItem = this.loadedData.careers.find(c => c.id === d.careerId);
        
        // Zabezpieczenie na wypadek braku danych w itemie rasy
        const raceWounds = raceItem?.system.woundThreshold || 10;
        const raceStrain = raceItem?.system.strainThreshold || 10;
        
        const xpEntries = [
            { amount: d.totalXP, type: "Starting", data: {} },
            { amount: -d.spentXP, type: "Spent", data: { name: "Kreator Postaci" } }
        ];

        // Drzewko (zapisujemy stan zakupionych talentów)
        let treeDataToSave = { nodes: {}, connections: {}, backgroundImage: "" };
        if (specItem) {
            const originalTree = specItem.getFlag("warcraft-genesys", "treeData") || specItem._source.flags?.["warcraft-genesys"]?.treeData;
            if (originalTree) {
                treeDataToSave = JSON.parse(JSON.stringify(originalTree));
                for (const [key, node] of Object.entries(treeDataToSave.nodes)) {
                    const uniqueId = `${specItem.id}_${key}`;
                    node.purchased = d.purchasedTalents.includes(uniqueId);
                }
            }
        }

        // 2. UPDATE AKTORA (Atrybuty, Rany, Stres, PD)
        const updates = {
            "name": d.charName,
            "flags.warcraft-genesys.characterCreated": true,
            "system.characteristics.brawn": d.attributes.brawn,
            "system.characteristics.agility": d.attributes.agility,
            "system.characteristics.intellect": d.attributes.intellect,
            "system.characteristics.cunning": d.attributes.cunning,
            "system.characteristics.willpower": d.attributes.willpower,
            "system.characteristics.presence": d.attributes.presence,
            "system.wounds.max": raceWounds + d.attributes.brawn,
            "system.wounds.value": 0,
            "system.strain.max": raceStrain + d.attributes.willpower,
            "system.strain.value": 0,
            "system.experienceJournal.entries": xpEntries,
            "system.experience.total": d.totalXP,
            "system.experience.available": d.totalXP - d.spentXP
        };
        
        if (d.motivations) {
            updates["system.motivations.strength.name"] = d.motivations.strength.name;
            updates["system.motivations.strength.description"] = d.motivations.strength.description;
            updates["system.motivations.flaw.name"] = d.motivations.flaw.name;
            updates["system.motivations.flaw.description"] = d.motivations.flaw.description;
            updates["system.motivations.desire.name"] = d.motivations.desire.name;
            updates["system.motivations.desire.description"] = d.motivations.desire.description;
            updates["system.motivations.fear.name"] = d.motivations.fear.name;
            updates["system.motivations.fear.description"] = d.motivations.fear.description;
        }

        await realActor.update(updates, { renderSheet: false });

        // 3. TWORZENIE PRZEDMIOTÓW (Rasa, Klasa, Talenty, Ekwipunek)
        const itemsToCreate = [];
        
        // A. RASA I ZDOLNOŚCI
        if (raceItem) {
            itemsToCreate.push(raceItem.toObject());

            // Pobieranie itemów rasy (obsługa grantedItems i fallback do items)
            let racialItems = [];
            if (raceItem.grantedItems) racialItems = raceItem.grantedItems;
            else if (raceItem.system?.grantedItems) racialItems = raceItem.system.grantedItems;
            else if (raceItem.items) {
                 if (raceItem.items.contents) racialItems = raceItem.items.contents;
                 else if (Array.isArray(raceItem.items)) racialItems = raceItem.items;
            }

            if (racialItems.length > 0) {
                racialItems.forEach(item => {
                    let itemData = (typeof item.toObject === 'function') ? item.toObject() : foundry.utils.deepClone(item);

                    // --- GENEROWANIE EFEKTÓW (Active Effects) ---
                    const itemName = itemData.name.toLowerCase();
                    // Pobieramy opis do detekcji (bezpiecznie)
                    const descLower = (itemData.system.description?.value || itemData.system.description || "").toLowerCase();
                    
                    const newEffects = [];

                    // 1. Stormwind Humans ("Wszechstronność")
                    const isStormwind = ["starting skills", "początkowe umiejętności", "wszechstronność"].some(t => itemName.includes(t));
                    
                    if (isStormwind && d.freeNonCareerList?.length > 0) {
                        d.freeNonCareerList.forEach(skillName => {
                            newEffects.push({
                                name: `Bonus: ${skillName}`,
                                icon: itemData.img,
                                changes: [{ key: `skill.${skillName}`, mode: 2, value: "1" }],
                                transfer: true, disabled: false
                            });
                        });
                    }

                    // 2. Stromgarde ("Dziedzictwo Arathi")
                    const isStromgarde = ["dziedzictwo arathi", "legacy of arathi"].some(t => itemName.includes(t));

                    if (isStromgarde && d.freeCombatList?.length > 0) {
                        d.freeCombatList.forEach(skillName => {
                            newEffects.push({
                                name: `Bonus Walki: ${skillName}`,
                                icon: itemData.img,
                                changes: [{ key: `skill.${skillName}`, mode: 2, value: "1" }],
                                transfer: true, disabled: false
                            });
                        });
                    }

                    // 3. GNOMY ("Świat jest zagadką...")
                    // Szukamy po frazie w opisie, bo nazwa zdolności może być różna
                    const isGnome = ["rozwiązania tam, gdzie inni widzą problemy", "świat jest zagadką"].some(t => descLower.includes(t));

                    if (isGnome && d.freeGnomeSkillList?.length > 0) {
                        d.freeGnomeSkillList.forEach(skillName => {
                            newEffects.push({
                                name: `Gnomia Specjalizacja: ${skillName}`,
                                icon: itemData.img,
                                changes: [{ key: `skill.${skillName}`, mode: 2, value: "1" }],
                                transfer: true, disabled: false
                            });
                        });
                    }

                    const isFel = descLower.includes("przymus (coercion) lub odporność (resilience)") || descLower.includes("dominacji, czy przetrwania");

                    if (isFel && d.freeFelSkillList?.length > 0) {
                        d.freeFelSkillList.forEach(skillName => {
                            newEffects.push({
                                name: `Wybrana Droga: ${skillName}`,
                                icon: itemData.img,
                                // Dodajemy rangę (+1 Rank)
                                changes: [{ key: `skill.${skillName}.rank`, mode: 2, value: "1" }],
                                transfer: true, disabled: false
                            });
                        });
                    }

                    // Dodajemy efekty do przedmiotu, jeśli jakieś wygenerowano
                    if (newEffects.length > 0) {
                        console.log(`WARCRAFT MOD | Dodaję ${newEffects.length} efektów do ${itemData.name}`);
                        itemData.effects = (itemData.effects || []).concat(newEffects);
                    }

                    itemsToCreate.push(itemData);
                });
            }
        }

        // B. PROFESJA
        if (careerItem) itemsToCreate.push(careerItem.toObject());
        
        // C. SPECJALIZACJA
        if (specItem) {
            const specObject = specItem.toObject();
            foundry.utils.setProperty(specObject, "flags.warcraft-genesys.treeData", treeDataToSave);
            itemsToCreate.push(specObject);
        }

        // D. KUPIONE TALENTY Z DRZEWKA
        for (const uniqueId of d.purchasedTalents) {
            const [specId, nodeKey] = uniqueId.split('_');
            if (specItem && specItem.id === specId) {
                const node = treeDataToSave.nodes[nodeKey];
                if (node) {
                    let realTalentItem = this.loadedData.talents.find(t => t.name === node.name);
                    if (realTalentItem) itemsToCreate.push(realTalentItem.toObject());
                    else itemsToCreate.push({
                        name: node.name, type: "talent", img: node.img,
                        system: { description: node.description, tier: parseInt(nodeKey.split('-')[0]) + 1, activation: { type: "passive" } }
                    });
                }
            }
        }

        // E. UMIEJĘTNOŚCI (SKILLS)
        for (const [skillName, rank] of Object.entries(d.skills)) {
            let finalRank = rank;

            // Sprawdzamy czy skill jest darmowy (w którejś z list bonusowych)
            const isFreeStormwind = d.freeNonCareerList && d.freeNonCareerList.includes(skillName);
            const isFreeStromgarde = d.freeCombatList && d.freeCombatList.includes(skillName);
            const isFreeGnome = d.freeGnomeSkillList && d.freeGnomeSkillList.includes(skillName);
            const isFreeFel = d.freeFelSkillList && d.freeFelSkillList.includes(skillName);

            // Jeśli jest darmowy, odejmujemy 1 od bazy (bo Active Effect na Zdolności doda +1)
            // Dzięki temu Ranga 1 = 0 (baza) + 1 (efekt), a Ranga 2 = 1 (baza) + 1 (efekt).
            if (isFreeStormwind || isFreeStromgarde || isFreeGnome || isFreeFel) {
                finalRank = rank - 1;
            }

            const existingSkill = realActor.items.find(i => i.type === "skill" && i.name === skillName);
            const isCareer = this._isCareerSkill(skillName);
            
            if (existingSkill) {
                await existingSkill.update({ "system.rank": finalRank, "system.career": isCareer }, { renderSheet: false });
            } else {
                const originalSkill = this.loadedData.skills.find(s => s.name === skillName);
                if (originalSkill) {
                    const skillData = originalSkill.toObject();
                    skillData.system.rank = finalRank;
                    skillData.system.career = isCareer;
                    itemsToCreate.push(skillData);
                } else {
                    // Fallback jeśli skilla nie ma w kompendium (rzadkie)
                    itemsToCreate.push({
                        name: skillName, type: "skill",
                        system: { rank: finalRank, career: isCareer }
                    });
                }
            }
        }

        if (itemsToCreate.length > 0) {
            await realActor.createEmbeddedDocuments("Item", itemsToCreate, { renderSheet: false });
        }

        ui.notifications.info(`Postać ${d.charName} została utworzona!`);
        this.close();

        // Odświeżenie karty postaci po chwili
        setTimeout(async () => {
            const freshActor = game.actors.get(this.actor.id);
            if (freshActor) {
                freshActor.sheet.render(true);
            }
        }, 500);
    }
}