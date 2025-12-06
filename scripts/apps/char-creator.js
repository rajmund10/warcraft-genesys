import { TalentTreeManager } from "../tree-manager.js"; 

export class CharacterCreator extends FormApplication {
    
    constructor(actor, options) {
        super(actor, options);
        this.actor = actor;
        
        this.loadedData = {
            races: [], careers: [], skills: [], specializations: [], talents: [], tables: []
        };

        this.creationData = {
            step: 1, speciesId: null, careerId: null, careerSkills: [], specId: null, 
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

    // --- SKANOWANIE BONUSÓW DO SKILLI ---
    // --- SKANOWANIE BONUSÓW DO SKILLI (FIX: Skanowanie grantedItems) ---
    _getSkillBonuses() {
        const bonuses = {};
        const itemsToCheck = [];
        
        // 1. RASA - Skanujemy główny obiekt ORAZ jego wewnętrzne przedmioty
        if (this.creationData.speciesId) {
            const species = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
            if (species) {
                // Dodajemy samą rasę (gdyby miała efekt bezpośrednio na sobie)
                itemsToCheck.push(species);

                // FIX: Dodajemy przedmioty zagnieżdżone w rasie (Zdolności rasowe)
                // To tutaj zazwyczaj ukryty jest efekt "+1 do Survival"
                if (species.system.grantedItems && Array.isArray(species.system.grantedItems)) {
                    species.system.grantedItems.forEach(i => itemsToCheck.push(i));
                }
                // Fallback dla starszych danych (.items)
                else if (species.items) {
                    const contents = species.items.contents || species.items;
                    if (Array.isArray(contents)) contents.forEach(i => itemsToCheck.push(i));
                    else if (typeof contents.forEach === 'function') contents.forEach(i => itemsToCheck.push(i));
                }
            }
        }

        if (this.creationData.careerId) itemsToCheck.push(this.loadedData.careers.find(c => c.id === this.creationData.careerId));
        if (this.creationData.specId) itemsToCheck.push(this.loadedData.specializations.find(s => s.id === this.creationData.specId));

        // Talenty z Drzewka
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

        // Skanowanie efektów
        itemsToCheck.forEach(item => {
            if (!item) return;
            let effectsArray = [];
            
            // Obsługa różnych formatów efektów (Dokument, Obiekt surowy, Mapa, Tablica)
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
                        console.log(`WARCRAFT MOD | Wykryto bonus: ${skillName} +${value} ze źródła: ${item.name}`);
                    }
                });
            });
        });
        return bonuses;
    }

    async getData() {
        // Upewnij się, że dane są załadowane
        await this._loadCompendiumData();
        
        const data = super.getData();
        data.state = this.creationData;
        
        // Listy wyboru
        data.races = this.loadedData.races;
        data.careers = this.loadedData.careers;
        data.specializations = this.loadedData.specializations;

        // Flagi kroków
        data.isStep1 = this.creationData.step === 1;
        data.isStep2 = this.creationData.step === 2;
        data.isStep3 = this.creationData.step === 3;
        data.isStep4 = this.creationData.step === 4;
        data.isStep5 = this.creationData.step === 5;

        // =====================================================
        // --- 1. RASA (ARCHETYPE) ---
        // =====================================================
        data.currentSpecies = this.loadedData.races.find(r => r.id === this.creationData.speciesId);
        data.raceImage = "icons/svg/mystery-man.svg";
        data.enrichedRaceDescription = "";
        data.racialAbilities = []; 

        if (data.currentSpecies) {
            // Portret rasy (Custom Flag lub domyślny obrazek)
            let flag = data.currentSpecies.flags?.["warcraft-genesys"]?.racePortrait;
            if (!flag) flag = data.currentSpecies.getFlag?.("warcraft-genesys", "racePortrait");
            data.raceImage = flag || data.currentSpecies.img;
            
            // Opis rasy
            data.enrichedRaceDescription = await TextEditor.enrichHTML(data.currentSpecies.system.description, { async: true });
            
            // --- POBIERANIE ZDOLNOŚCI RASOWYCH (FIX NATYWNY) ---
            let raceItems = [];
            
            // A. Czytamy z natywnego pola Genesys: system.grantedItems
            // To tutaj lądują itemy po naszym nowym Drag&Drop w main.js
            if (data.currentSpecies.system.grantedItems && Array.isArray(data.currentSpecies.system.grantedItems)) {
                raceItems = data.currentSpecies.system.grantedItems;
            }
            // B. Fallback: sprawdźmy też standardową kolekcję .items (dla kompatybilności)
            else if (data.currentSpecies.items && data.currentSpecies.items.size > 0) {
                raceItems = data.currentSpecies.items.contents;
            }

            // Mapowanie i HTML opisów
            if (raceItems.length > 0) {
                data.racialAbilities = await Promise.all(raceItems.map(async (item) => {
                    // Wyciąganie opisu (może być stringiem lub obiektem .value)
                    let descText = item.system?.description || "";
                    if (typeof descText === 'object' && descText.value) descText = descText.value;
                    
                    return {
                        name: item.name,
                        img: item.img || "icons/svg/item-bag.svg",
                        description: await TextEditor.enrichHTML(descText, {async: true})
                    };
                }));
            }
        }

        // =====================================================
        // --- 2. PROFESJA (CAREER) ---
        // =====================================================
        data.currentCareer = this.loadedData.careers.find(c => c.id === this.creationData.careerId);
        data.careerImage = "icons/svg/mystery-man.svg";
        data.enrichedCareerDescription = "";
        
        if (data.currentCareer) {
            let flag = data.currentCareer.flags?.["warcraft-genesys"]?.careerPortrait;
            if (!flag) flag = data.currentCareer.getFlag?.("warcraft-genesys", "careerPortrait");
            data.careerImage = flag || data.currentCareer.img;
            data.enrichedCareerDescription = await TextEditor.enrichHTML(data.currentCareer.system.description, { async: true });
        }

        // =====================================================
        // --- 3. SPECJALIZACJA ---
        // =====================================================
        data.currentSpec = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
        data.enrichedSpecDescription = "";
        
        if (data.currentSpec) {
            data.enrichedSpecDescription = await TextEditor.enrichHTML(data.currentSpec.system.description, { async: true });
            
            // Tło specjalizacji (jeśli zdefiniowane w drzewku)
            const treeData = data.currentSpec.flags?.["warcraft-genesys"]?.treeData;
            if (treeData && treeData.backgroundImage) {
                data.specBg = treeData.backgroundImage;
                data.specPos = `${treeData.bgPosX || '0px'} ${treeData.bgPosY || '0px'}`;
            }
        }

        // Opcje umiejętności klasowych
        if (data.currentCareer) {
            const rawSkills = data.currentCareer.system.careerSkills || [];
            data.careerSkillOptions = rawSkills.map(skill => (typeof skill === 'string' ? skill : (skill.name || "Skill")));
        } else {
            data.careerSkillOptions = [];
        }

        // =====================================================
        // --- 4. KALKULACJE PD I ATRYBUTÓW ---
        // =====================================================
        const availableXP = this.creationData.totalXP - this.creationData.spentXP;

        // ATTRYBUTY (Characteristics)
        data.attributeList = Object.entries(this.creationData.attributes).map(([key, val]) => {
            const nextCost = (val + 1) * 10;
            let baseVal = 1;
            // Pobieramy bazę z rasy
            if (data.currentSpecies?.system?.characteristics) {
                baseVal = data.currentSpecies.system.characteristics[key] || 1;
            }
            
            return {
                key: key, 
                label: this._localizeAttribute(key), 
                value: val, 
                cost: nextCost,
                // Można kupić jeśli nie max (5) i stać nas na to
                canBuy: (val < 5) && (availableXP >= nextCost),
                // Można zwrócić tylko jeśli jest wyższe niż baza rasowa
                canRefund: val > baseVal
            };
        });

        // =====================================================
        // --- 5. UMIEJĘTNOŚCI (SKILLS) ---
        // =====================================================
        const categories = {
            "combat": { label: "Walka", skills: [] }, 
            "general": { label: "Ogólne", skills: [] },
            "social": { label: "Społeczne", skills: [] }, 
            "knowledge": { label: "Wiedza", skills: [] },
            "magic": { label: "Magia", skills: [] }
        };

        // Pobieramy bonusy z talentów/rasy
        const skillBonuses = this._getSkillBonuses(); 

        this.loadedData.skills.forEach(skillItem => {
            const key = skillItem.name; 
            const isCareer = this._isCareerSkill(key);
            
            const purchasedRank = this.creationData.skills[key] || 0;
            const bonusRank = skillBonuses[key] || 0;
            const totalRank = purchasedRank + bonusRank;
            
            // Koszt: (Rank+1)*5, +5 jeśli nieklasowa
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

        // Sortowanie alfabetyczne w kategoriach
        for (const cat of Object.values(categories)) {
            cat.skills.sort((a, b) => a.label.localeCompare(b.label));
        }
        
        // Filtrowanie pustych kategorii
        data.categorizedSkills = Object.values(categories).filter(c => c.skills.length > 0);

        // =====================================================
        // --- 6. STATYSTYKI POCHODNE ---
        // =====================================================
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

    _isCareerSkill(skillName) {
        if (!this.creationData.careerId) return false;
        if (this.creationData.careerSkills.includes(skillName)) return true;
        const career = this.loadedData.careers.find(c => c.id === this.creationData.careerId);
        if (career && career.system.careerSkills) {
             const skills = career.system.careerSkills.map(s => (typeof s === 'string' ? s : s.name));
             if (skills.includes(skillName)) return true;
        }
        const spec = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
        if (spec && spec.system.careerSkills) {
            const specSkills = spec.system.careerSkills.map(s => (typeof s === 'string' ? s : s.name));
            if (specSkills.includes(skillName)) return true;
        }
        return false;
    }

    _localizeAttribute(key) {
        const map = { brawn: "Budowa", agility: "Zwinność", intellect: "Intelekt", cunning: "Spryt", willpower: "Siła Woli", presence: "Ogłada" };
        return map[key] || key;
    }

    // --- WALIDACJA KROKÓW (Naprawione) ---
    _validateStep() {
        const d = this.creationData;
        if (d.step === 1 && !d.speciesId) { ui.notifications.warn("Wybierz pochodzenie!"); return false; }
        if (d.step === 2) { if (!d.careerId) { ui.notifications.warn("Wybierz profesję!"); return false; } if (d.careerSkills.length < 4) { ui.notifications.warn("Wybierz 4 darmowe umiejętności."); return false; } }
        if (d.step === 3 && !d.specId) { ui.notifications.warn("Wybierz specjalizację!"); return false; }
        return true;
    }

    // --- RENDEROWANIE DRZEWKA W KREATORZE (KROK 4) ---
    _renderActiveTree(html) {
        // Znajdź kontener w DOM
        const container = html.find('#active-tree-canvas');
        if (container.length === 0) return;

        // Pobierz dane specjalizacji
        const specItem = this.loadedData.specializations.find(s => s.id === this.creationData.specId);
        if (!specItem) {
            container.html('<p style="text-align:center; margin-top:20px;">Nie wybrano specjalizacji.</p>');
            return;
        }

        // Wyciągnij dane drzewka (treeData)
        let treeData = specItem.flags?.["warcraft-genesys"]?.treeData;
        
        // Fallback dla surowych danych
        if (!treeData && specItem._source?.flags?.["warcraft-genesys"]?.treeData) {
            treeData = specItem._source.flags["warcraft-genesys"].treeData;
        }

        if (!treeData) {
            container.html('<p style="text-align:center; margin-top:20px;">Ta specjalizacja nie ma skonfigurowanego drzewka.</p>');
            return;
        }

        // Przygotuj kopię danych z zaznaczonymi zakupionymi talentami
        // Musimy zrobić głęboką kopię, żeby nie modyfikować oryginału w pamięci
        const treeDataCopy = JSON.parse(JSON.stringify(treeData));
        
        for (const [nodeKey, node] of Object.entries(treeDataCopy.nodes)) {
            const uniqueId = `${specItem.id}_${nodeKey}`;
            // Sprawdź czy talent jest na liście kupionych w kreatorze
            node.purchased = this.creationData.purchasedTalents.includes(uniqueId);
        }

        // Zainicjuj Managera w trybie Kreatora
        // Przekazujemy 'treeDataCopy' jako 3 argument -> to włącza tryb isCreatorMode w TreeManagerze
        const treeManager = new TalentTreeManager(this, container, treeDataCopy);
        
        // Nadpisujemy funkcje managera, żeby działały na danych kreatora, a nie na aktorze
        treeManager.purchaseTalent = async (key, node, cost) => {
            const uniqueId = `${specItem.id}_${key}`;
            
            // Walidacja kosztu
            if ((this.creationData.totalXP - this.creationData.spentXP) < cost) {
                return ui.notifications.warn("Za mało PD!");
            }
            // Walidacja połączeń (używamy logiki managera)
            if (!treeManager.checkAccessibility(parseInt(key.split('-')[0]), parseInt(key.split('-')[1]))) {
                 return ui.notifications.warn("Musisz najpierw kupić połączony talent!");
            }

            // Kupno
            this.creationData.spentXP += cost;
            this.creationData.purchasedTalents.push(uniqueId);
            this.render(true);
        };

        treeManager.refundTalent = async (key, node, cost) => {
            const uniqueId = `${specItem.id}_${key}`;
            
            // Walidacja spójności (czy nie odcinamy gałęzi)
            // Musimy tymczasowo usunąć node z "zakupionych" w danych managera, żeby sprawdzić integrity
            node.purchased = false; 
            if (!treeManager.checkTreeIntegrity(key)) {
                node.purchased = true; // przywracamy
                return ui.notifications.warn("Nie możesz zwrócić tego talentu (przerywa ścieżkę)!");
            }

            // Zwrot
            this.creationData.spentXP -= cost;
            this.creationData.purchasedTalents = this.creationData.purchasedTalents.filter(id => id !== uniqueId);
            this.render(true);
        };

        // Renderuj drzewko
        treeManager.init();
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Nawigacja
        html.find('.nav-btn').click(ev => {
            const btn = $(ev.currentTarget);
            if (btn.hasClass('finish-btn')) { this._onFinish(); return; }
            const action = btn.data('action');
            if (action === 'next') { if (!this._validateStep()) return; this.creationData.step++; }
            if (action === 'prev') this.creationData.step--;
            this.render(true);
        });

        // Dropdowny
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
        
        // Skill Check (Darmowe klasowe)
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

        // Atrybuty
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

        // --- ZAKUPY UMIEJĘTNOŚCI (FIX: STORMWIND + STROMGARDE) ---
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
            
            // Pobieramy dane skilla, żeby sprawdzić kategorię
            const skillItem = this.loadedData.skills.find(s => s.name === key);
            const isCombat = skillItem && skillItem.system.category === "combat";

            let cost = 0;
            let isFreePurchase = false;
            let freeType = null; // 'stormwind' lub 'stromgarde'

            // A. Czy to darmowa walka (Stromgarde)?
            if (this.creationData.freeCombatMax > 0 &&
                this.creationData.freeCombatUsed < this.creationData.freeCombatMax &&
                isCombat &&
                purchasedRank === 0) {
                
                cost = 0;
                isFreePurchase = true;
                freeType = 'stromgarde';
            }
            // B. Czy to darmowa nieklasowa (Stormwind)?
            else if (this.creationData.freeNonCareerMax > 0 && 
                this.creationData.freeNonCareerUsed < this.creationData.freeNonCareerMax &&
                !isCareer && 
                purchasedRank === 0) {
                
                cost = 0;
                isFreePurchase = true;
                freeType = 'stormwind';
            }
            // C. Standardowy zakup
            else {
                cost = (totalRank + 1) * 5 + (isCareer ? 0 : 5);
            }
            
            // Sprawdzenie PD
            if (!isFreePurchase && (this.creationData.totalXP - this.creationData.spentXP) < cost) { 
                ui.notifications.warn("Za mało PD!"); 
                return; 
            }

            // Aplikacja
            this.creationData.skills[key] = purchasedRank + 1; 
            this.creationData.spentXP += cost;

            if (isFreePurchase) {
                if (freeType === 'stromgarde') {
                    this.creationData.freeCombatUsed++;
                    this.creationData.freeCombatList.push(key);
                    ui.notifications.info(`Wykorzystano darmową walkę dla: ${key}`);
                } else {
                    this.creationData.freeNonCareerUsed++;
                    this.creationData.freeNonCareerList.push(key);
                    ui.notifications.info(`Wykorzystano darmowe rozwinięcie dla: ${key}`);
                }
            }

            this.render(true); 
        });

        // --- ZWROT UMIEJĘTNOŚCI (FIX: OBA TYPY) ---
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
            
            // Sprawdzenie, z której puli pochodzi skill (jeśli w ogóle)
            const stormwindIndex = this.creationData.freeNonCareerList ? this.creationData.freeNonCareerList.indexOf(key) : -1;
            const stromgardeIndex = this.creationData.freeCombatList ? this.creationData.freeCombatList.indexOf(key) : -1;

            // Zwracamy do puli TYLKO jeśli zjeżdżamy z rangi 1 na 0
            const isStormwindReturn = stormwindIndex !== -1 && purchasedRank === 1;
            const isStromgardeReturn = stromgardeIndex !== -1 && purchasedRank === 1;

            if (isStromgardeReturn) {
                this.creationData.freeCombatUsed--;
                this.creationData.freeCombatList.splice(stromgardeIndex, 1);
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

        // Reszta listenerów bez zmian
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
        
        // Reset danych
        this.creationData.speciesId = id;
        this.creationData.attributes = { ...(species.system?.characteristics || { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 }) };
        this.creationData.totalXP = species.system.startingXP || 100;
        this.creationData.spentXP = 0; 
        this.creationData.skills = {}; 
        this.creationData.careerSkills = []; 
        this.creationData.purchasedTalents = [];

        // --- DIAGNOSTYKA SPECJALNYCH ZDOLNOŚCI ---
        console.group(`WARCRAFT MOD | Sprawdzanie zdolności rasy: ${species.name}`);
        
        let hasFreeSkills = false; // Stormwind Humans
        let hasCombatSkill = false; // Stromgarde (Dziedzictwo Arathi)
        
        // Listy nazw do szukania
        const stormwindTerms = ["Starting Skills", "Początkowe Umiejętności", "Wszechstronność"];
        const stromgardeTerms = ["Dziedzictwo Arathi", "Legacy of Arathi"];

        // Funkcja pomocnicza do szukania w itemach
        const checkItems = (items) => {
            if (!items) return;
            // Obsługa różnych formatów (tablica vs kolekcja)
            const list = Array.isArray(items) ? items : (items.contents || []);
            
            for (const item of list) {
                const name = item.name.toLowerCase();
                
                // Sprawdzanie Stormwind
                if (stormwindTerms.some(term => name.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Stormwind Bonus: ${item.name}`, "color: green; font-weight: bold;");
                    hasFreeSkills = true;
                }
                
                // Sprawdzanie Stromgarde
                if (stromgardeTerms.some(term => name.includes(term.toLowerCase()))) {
                    console.log(`%c   ✅ Stromgarde Bonus: ${item.name}`, "color: firebrick; font-weight: bold;");
                    hasCombatSkill = true;
                }
            }
        };

        // 1. Sprawdź w grantedItems (Natywne)
        checkItems(species.system.grantedItems);
        // 2. Sprawdź w items (Legacy)
        if (!hasFreeSkills && !hasCombatSkill) checkItems(species.items);

        console.groupEnd();

        // Inicjalizacja liczników
        
        // A. Stormwind (Dowolne nieklasowe)
        this.creationData.freeNonCareerMax = hasFreeSkills ? 2 : 0;
        this.creationData.freeNonCareerUsed = 0;
        this.creationData.freeNonCareerList = [];

        // B. Stromgarde (Dowolna walka)
        this.creationData.freeCombatMax = hasCombatSkill ? 1 : 0;
        this.creationData.freeCombatUsed = 0;
        this.creationData.freeCombatList = [];

        this.render(true);
    }

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
        const raceWounds = raceItem?.system.woundThreshold || 10;
        const raceStrain = raceItem?.system.strainThreshold || 10;
        const xpEntries = [
            { amount: d.totalXP, type: "Starting", data: {} },
            { amount: -d.spentXP, type: "Spent", data: { name: "Kreator Postaci" } }
        ];

        // Drzewko
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

        // 2. UPDATE AKTORA
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

        // 3. TWORZENIE PRZEDMIOTÓW
        const itemsToCreate = [];
        
        // A. RASA I ZDOLNOŚCI
        if (raceItem) {
            itemsToCreate.push(raceItem.toObject());

            let racialItems = [];
            if (raceItem.system.grantedItems && Array.isArray(raceItem.system.grantedItems)) {
                racialItems = raceItem.system.grantedItems;
            } else if (raceItem.items && raceItem.items.size > 0) {
                racialItems = raceItem.items.contents;
            }

            if (racialItems.length > 0) {
                racialItems.forEach(item => {
                    let itemData = (typeof item.toObject === 'function') ? item.toObject() : foundry.utils.deepClone(item);

                    // --- GENEROWANIE EFEKTÓW ---
                    const itemName = itemData.name.toLowerCase();
                    const newEffects = [];

                    // 1. Stormwind Humans ("Wszechstronność" etc.)
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

        // D. KUPIONE TALENTY
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

            // Sprawdzamy czy skill jest darmowy (w którejś z list)
            const isFreeStormwind = d.freeNonCareerList && d.freeNonCareerList.includes(skillName);
            const isFreeStromgarde = d.freeCombatList && d.freeCombatList.includes(skillName);

            // Jeśli jest darmowy, odejmujemy 1 od bazy (bo Active Effect doda +1)
            if (isFreeStormwind || isFreeStromgarde) {
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
                }
            }
        }

        if (itemsToCreate.length > 0) {
            await realActor.createEmbeddedDocuments("Item", itemsToCreate, { renderSheet: false });
        }

        ui.notifications.info(`Postać ${d.charName} została utworzona!`);
        this.close();

        setTimeout(async () => {
            const freshActor = game.actors.get(this.actor.id);
            if (freshActor) {
                if (freshActor.sheet.rendered) freshActor.sheet.render(true);
                else freshActor.sheet.render(true);
            }
        }, 500);
    }
}