export class TalentTreeManager {
    constructor(app, html, customData = null) {
        this.app = app;
        this.html = html;
        this.document = app.document || app.object; 
        
        // --- NOWOŚĆ: Flaga blokująca transakcje ---
        this.isTransactionPending = false; 
        
        if (customData) {
            this.treeData = customData;
            this.isLocked = false;       
            this.isCreatorMode = true;   
            this.isItem = false;
            this.specializationItem = null;
        } else {
            this.isItem = (this.document.documentName === "Item");
            this.isCreatorMode = false;

            if (this.isItem) {
                this.specializationItem = this.document;
                this.isLocked = false; 
            } else {
                this.specializationItem = this.document.items.find(i => i.type === "specialization");
                const savedLock = this.document.getFlag("warcraft-genesys", "treeLocked");
                this.isLocked = (savedLock === undefined) ? true : savedLock;
            }

            if (this.specializationItem) {
                this.treeData = this.specializationItem.getFlag("warcraft-genesys", "treeData");
            } else {
                this.treeData = this.document.getFlag("warcraft-genesys", "treeData");
            }

            if (!this.treeData) {
                this.treeData = { nodes: {}, connections: {}, backgroundImage: "", bgPosX: "0px", bgPosY: "0px" };
            }
        }
    }

    // --- PODMIEŃ CAŁĄ METODĘ PURCHASE NA TĘ ---
    async purchaseTalent(key, node, cost) {
        if (this.isCreatorMode) return; 
        
        // Zabezpieczenie: jeśli coś się mieli, nie rób nic
        if (this.isTransactionPending) return;

        const [r, c] = key.split('-').map(Number);
        if (!this.checkAccessibility(r, c)) return ui.notifications.warn("Wymagane połączenie!");
        if (this._calculateXP() < cost) return ui.notifications.error("Za mało XP!");

        new Dialog({
            title: "Zakup Talentu", content: `<p>Kupić <strong>${node.name}</strong> za ${cost} PD?</p>`,
            buttons: {
                yes: { label: "Tak", callback: async () => {
                    // Ponowne sprawdzenie wewnątrz callbacka
                    if (this.isTransactionPending) return;
                    this.isTransactionPending = true; // Zablokuj
                    
                    try {
                        await this.updateXP(-cost);
                        const itemData = {
                            name: node.name, type: "talent", img: node.img,
                            system: { description: node.description, ranked: "no", tier: r + 1, activation: { type: "passive" } }
                        };
                        const newItems = await this.document.createEmbeddedDocuments("Item", [itemData]);
                        node.purchased = true;
                        if (newItems.length > 0) node.realItemId = newItems[0].id;
                        await this.saveData(); 
                        this.refresh();
                    } catch (err) {
                        console.error("Błąd zakupu:", err);
                        ui.notifications.error("Wystąpił błąd podczas zakupu.");
                    } finally {
                        this.isTransactionPending = false; // Odblokuj zawsze na końcu
                    }
                }},
                no: { label: "Nie" }
            }
        }).render(true);
    }

    // --- PODMIEŃ CAŁĄ METODĘ REFUND NA TĘ ---
    async refundTalent(key, node, cost) {
        if (this.isCreatorMode) return; 
        
        if (this.isTransactionPending) return; // Zabezpieczenie

        if (!this.checkTreeIntegrity(key)) return ui.notifications.error("Nie możesz odciąć gałęzi drzewka!");

        new Dialog({
            title: "Zwrot Talentu", content: `<p>Zwrócić <strong>${node.name}</strong>?</p>`,
            buttons: {
                yes: { label: "Zwrot", callback: async () => {
                    if (this.isTransactionPending) return;
                    this.isTransactionPending = true;

                    try {
                        await this.updateXP(cost);
                        if (node.realItemId) await this.document.items.get(node.realItemId)?.delete();
                        else await this.document.items.find(i => i.name === node.name)?.delete();
                        node.purchased = false; node.realItemId = null;
                        await this.saveData(); 
                        this.refresh();
                    } catch (err) {
                        console.error("Błąd zwrotu:", err);
                    } finally {
                        this.isTransactionPending = false;
                    }
                }},
                no: { label: "Anuluj" }
            }
        }).render(true);
    }

    async init() {
        if (!this.isItem && !this.isCreatorMode && !this.specializationItem && !this.treeData.nodes) {
            return;
        }

        if (this.isItem) {
            await this.renderItemView();
        } else if (this.isCreatorMode) {
            this.renderTree(this.html);
        } else {
            this.injectTab();
        }
    }

async renderItemView() {
        this.html.closest('.window-app').addClass('warcraft-mode');
        const container = this.html.find('.window-content');
        container.empty();

        // 1. DANE
        const description = this.document.system.description || "";
        
        // 2. LAYOUT
        const layoutHtml = `
            <div class="specialization-container" style="display: flex; flex-direction: column; height: 100%;">
                
                <div class="specialization-header">
                    <h3 style="border-bottom: 1px solid #ccc; margin-bottom: 5px;">${this.document.name}</h3>
                </div>

                <div class="form-group" style="flex: 0 0 auto; margin-bottom: 10px;">
                    <label style="font-weight: bold; font-family: 'Cinzel';">Opis Specjalizacji:</label>
                    
                    <div class="spec-description-editor" style="position: relative;">
                        
                        <textarea class="simple-editor" style="
                            width: 100%;
                            min-height: 150px;
                            max-height: 250px;
                            background: rgba(0, 0, 0, 0.05);
                            border: 1px solid #7a5c3b;
                            padding: 10px;
                            border-radius: 4px;
                            font-family: 'Roboto Slab', serif;
                            color: #1a1410;
                            outline: none;
                            resize: vertical;
                            margin-bottom: 5px;
                        ">${description}</textarea>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <p style="font-size: 10px; opacity: 0.7; margin: 0;">
                                <i class="fas fa-info-circle"></i> HTML dozwolony.
                            </p>
                            <button class="save-desc-btn" type="button" style="
                                width: auto; 
                                padding: 5px 15px; 
                                background: #2a2016; 
                                color: #f8b700; 
                                border: 1px solid #5c452d;
                                font-family: 'Cinzel';
                                font-size: 11px;
                                cursor: pointer;
                            ">
                                <i class="fas fa-save"></i> Zapisz Opis
                            </button>
                        </div>
                    </div>
                </div>

                <div class="tree-wrapper" style="flex: 1; overflow: hidden; display:flex; flex-direction:column;">
                    <div class="tab talent-tree active" style="flex: 1; overflow-y: auto;"></div>
                </div>
            </div>
        `;

        container.append(layoutHtml);

        // 3. LOGIKA ZAPISU (NA KLIKNIĘCIE)
        if (this.document.isOwner) {
            // Znajdujemy elementy po klasach, nie po name
            const editorBox = container.find('.simple-editor');
            const saveBtn = container.find('.save-desc-btn');
            
            saveBtn.on('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation(); // Zatrzymujemy bąbelkowanie, żeby nie odpalić formularza rodzica

                const newContent = editorBox.val();
                
                console.log("WARCRAFT MOD | Kliknięto Zapisz. Treść:", newContent);

                const btnContent = saveBtn.html();
                saveBtn.html('<i class="fas fa-spinner fa-spin"></i> ...');
                
                try {
                    // Wykonujemy update
                    await this.document.update({ "system.description": newContent });
                    
                    console.log("WARCRAFT MOD | Update zakończony sukcesem.");
                    
                    saveBtn.html('<i class="fas fa-check"></i> Zapisano!');
                    saveBtn.css('border-color', 'green');
                    ui.notifications.info("Opis zapisany!");
                    
                    setTimeout(() => {
                        saveBtn.html(btnContent);
                        saveBtn.css('border-color', '#5c452d');
                    }, 2000);

                } catch (err) {
                    console.error("WARCRAFT MOD | Błąd zapisu:", err);
                    saveBtn.html('<i class="fas fa-exclamation-triangle"></i> Błąd');
                    saveBtn.css('border-color', 'red');
                }
            });
        }

        const treeDiv = container.find('.talent-tree');
        this.renderTree(treeDiv);
    }

    // --- NOWA METODA: ODŚWIEŻANIE WIDOKU ---
    refresh() {
        console.log("WARCRAFT MOD | Odświeżanie drzewka...");
        
        // 1. Tryb Kreatora Postaci
        if (this.isCreatorMode) {
            // W kreatorze 'this.html' to bezpośredni kontener drzewka
            this.renderTree(this.html);
            return;
        }

        // 2. Tryb Przedmiotu (Edycja Specjalizacji w Item Sheet)
        if (this.isItem) {
             const container = this.html.find('.talent-tree');
             if (container.length) this.renderTree(container);
             return;
        }

        // 3. Tryb Aktora (Karta Postaci)
        // Szukamy zakładki z klasą .talent-tree
        const container = this.html.find('.tab.talent-tree');
        if (container.length) {
            this.renderTree(container);
        }
    }

    injectTab() {
        const nav = this.html.find('nav.sheet-tabs');
        if (this.html.find('.item[data-tab="talent-tree"]').length === 0) {
            const navItem = $(`<a class="item" data-tab="talent-tree"><i class="fas fa-sitemap"></i> Drzewko</a>`);
            const anchorTab = this.html.find('.item[data-tab="talents"]');
            if (anchorTab.length > 0) anchorTab.after(navItem);
            else if (nav.length > 0) nav.append(navItem);
        }

        if (this.html.find('.tab[data-tab="talent-tree"]').length === 0) {
            const tabContent = $('<div class="tab talent-tree" data-group="primary" data-tab="talent-tree"></div>');
            const sheetBody = this.html.find('section.sheet-body');
            if (sheetBody.length > 0) {
                sheetBody.append(tabContent);
                this.renderTree(tabContent);
            }
        } else {
            const existingTab = this.html.find('.tab[data-tab="talent-tree"]');
            this.renderTree(existingTab);
        }
    }

    _calculateXP() {
        if (!this.document?.system?.experienceJournal?.entries) return 0;
        const entries = this.document.system.experienceJournal.entries || [];
        return entries.reduce((acc, entry) => acc + (Number(entry.amount) || 0), 0);
    }

    renderTree(container) {
        if (!this.treeData) return;

        const lockIcon = this.isLocked ? "fa-lock" : "fa-lock-open";
        const lockClass = this.isLocked ? "" : "unlocked";
        const lockTitle = this.isLocked ? "Edycja zablokowana" : "Tryb Edycji";
        const isGM = game.user.isGM;
        const canEdit = this.isItem || (isGM && !this.isLocked && !this.isCreatorMode);
        const editableClass = canEdit ? "editable-bg" : "";

        // --- ZABEZPIECZENIE DANYCH TŁA ---
        let posX = this.treeData.bgPosX;
        let posY = this.treeData.bgPosY;

        // Jeśli dane są uszkodzone (np. undefined, null, NaN), resetujemy do 0px
        if (!posX || typeof posX !== 'string') posX = "0px";
        if (!posY || typeof posY !== 'string') posY = "0px";

        let bgStyle = "";
        if (this.treeData.backgroundImage) {
            bgStyle = `style="background-image: url('${this.treeData.backgroundImage}'); background-size: cover; background-position: ${posX} ${posY};"`;
        }

        let specName = "Specjalizacja";
        if (this.specializationItem) specName = this.specializationItem.name;
        else if (this.isItem) specName = this.document.name;

        let headerHtml = "";
        let footerHtml = "";
        
        if (!this.isCreatorMode && !this.isItem) {
            const currentXP = this._calculateXP();
            const xpColor = currentXP >= 0 ? "#2e7d32" : "#d32f2f";

            headerHtml = `
            <div class="tree-header">
                <div class="xp-display">
                    Dostępne PD: <span class="xp-val" style="color: ${xpColor};">${currentXP}</span>
                </div>
                <div class="spec-name-display">${specName}</div>
            </div>`;

            if (isGM) {
                footerHtml = `
                <div class="tree-footer">
                    <button class="lock-btn ${lockClass}" title="${lockTitle}">
                        <i class="fas ${lockIcon}"></i> Tryb MG
                    </button>
                </div>`;
            }
        } 
        else if (this.isItem) {
            // Tryb edycji przedmiotu - tylko wybór tła, pozycja na Drag&Drop
            headerHtml = `
            <div class="tree-header">
                <div style="display:flex; align-items:center; gap:5px; flex:1;">
                    <label style="font-size:12px;">Tło:</label>
                    <input type="text" class="bg-input" value="${this.treeData.backgroundImage || ''}" placeholder="Ścieżka..." style="background:rgba(0,0,0,0.5); color:#fff; border:1px solid #555; height:24px; font-size:11px; flex:1;">
                    <button class="file-picker-btn" title="Wybierz obrazek"><i class="fas fa-image"></i></button>
                </div>
            </div>`;
        }

        let gridHtml = `<div class="tree-grid ${editableClass}" ${bgStyle}>${headerHtml}`;

        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 4; c++) {
                const key = `${r}-${c}`;
                const node = this.treeData.nodes[key];
                const cost = (r + 1) * 5;
                
                if (node) {
                    let stateClass = "available";
                    if (node.purchased) stateClass = "purchased";
                    else if (!this.isItem && !this.checkAccessibility(r, c)) stateClass = "dimmed";
                    
                    const img = node.img || "icons/svg/mystery-man.svg";

// 1. Przygotuj czysty opis (usuń znaczniki HTML, żeby nie psuły dymka)
                    const cleanDesc = (node.description || "").replace(/<[^>]*>?/gm, '');

                    // 2. Generuj HTML z tooltipem
                    gridHtml += `
                        <div class="tree-node ${stateClass}" 
                             data-key="${key}" 
                             data-cost="${cost}" 
                             data-tooltip="<strong>${node.name}</strong><br>${cleanDesc}">
                            <img src="${img}">
                            <div class="node-name">${node.name}</div>
                            <div class="node-cost">${cost} XP</div>
                        </div>`;
                } else {
                    const showEmpty = this.isItem || (isGM && !this.isLocked && !this.isCreatorMode);
                    if (showEmpty) {
                        gridHtml += `<div class="tree-node empty" data-key="${key}">Slot<br><small>${cost} XP</small></div>`;
                    } else {
                        gridHtml += `<div class="tree-node locked-empty" style="visibility: hidden;"></div>`;
                    }
                }

                if (c < 3) {
                    const hKey = `h-${r}-${c}`;
                    const active = this.treeData.connections[hKey] ? 'active' : '';
                    const cursorClass = canEdit ? "editable" : ""; 
                    gridHtml += `<div class="connector h ${active} ${cursorClass}" data-conn="${hKey}"></div>`;
                }
            }

            if (r < 4) {
                for (let c = 0; c < 4; c++) {
                    const vKey = `v-${r}-${c}`;
                    const active = this.treeData.connections[vKey] ? 'active' : '';
                    const cursorClass = canEdit ? "editable" : "";
                    gridHtml += `<div class="connector v ${active} ${cursorClass}" data-conn="${vKey}"></div>`;
                    if (c < 3) gridHtml += `<div></div>`; 
                }
            }
        }
        
        gridHtml += `${footerHtml}</div>`; 
        container.html(gridHtml);
        this.activateListeners(container);
    }

    // ... checkAccessibility i checkTreeIntegrity bez zmian ...
    checkAccessibility(row, col) {
        if (row === 0) return true; 
        const checkNeighbor = (connKey, nodeKey) => {
            return this.treeData.connections[connKey] && this.treeData.nodes[nodeKey]?.purchased;
        };
        if (checkNeighbor(`v-${row-1}-${col}`, `${row-1}-${col}`)) return true; 
        if (col > 0 && checkNeighbor(`h-${row}-${col-1}`, `${row}-${col-1}`)) return true;
        if (col < 3 && checkNeighbor(`h-${row}-${col}`, `${row}-${col+1}`)) return true;
        if (row < 4 && checkNeighbor(`v-${row}-${col}`, `${row+1}-${col}`)) return true;
        return false;
    }

    checkTreeIntegrity(nodeKeyToRemove) {
        const remainingNodes = [];
        for (const [key, node] of Object.entries(this.treeData.nodes)) {
            if (node.purchased && key !== nodeKeyToRemove) {
                remainingNodes.push(key);
            }
        }
        if (remainingNodes.length === 0) return true;
        const roots = remainingNodes.filter(k => k.startsWith("0-"));
        if (roots.length === 0 && remainingNodes.length > 0) return false;
        const reachable = new Set();
        const queue = [...roots];
        roots.forEach(r => reachable.add(r));
        while (queue.length > 0) {
            const currentKey = queue.shift();
            const [r, c] = currentKey.split('-').map(Number);
            const neighbors = [
                [r + 1, c, `v-${r}-${c}`], [r - 1, c, `v-${r-1}-${c}`],
                [r, c + 1, `h-${r}-${c}`], [r, c - 1, `h-${r}-${c-1}`]
            ];
            for (const [nr, nc, connKey] of neighbors) {
                const neighborKey = `${nr}-${nc}`;
                if (this.treeData.connections[connKey] && remainingNodes.includes(neighborKey) && !reachable.has(neighborKey)) {
                    reachable.add(neighborKey);
                    queue.push(neighborKey);
                }
            }
        }
        return reachable.size === remainingNodes.length;
    }

    async purchaseTalent(key, node, cost) {
        if (this.isCreatorMode) return; 
        const [r, c] = key.split('-').map(Number);
        if (!this.checkAccessibility(r, c)) return ui.notifications.warn("Wymagane połączenie!");
        if (this._calculateXP() < cost) return ui.notifications.error("Za mało XP!");

        new Dialog({
            title: "Zakup Talentu", content: `<p>Kupić <strong>${node.name}</strong> za ${cost} PD?</p>`,
            buttons: {
                yes: { label: "Tak", callback: async () => {
                    await this.updateXP(-cost);
                    const itemData = {
                        name: node.name, type: "talent", img: node.img,
                        system: { description: node.description, ranked: "no", tier: r + 1, activation: { type: "passive" } }
                    };
                    const newItems = await this.document.createEmbeddedDocuments("Item", [itemData]);
                    node.purchased = true;
                    if (newItems.length > 0) node.realItemId = newItems[0].id;
                    await this.saveData(); this.refresh();
                }},
                no: { label: "Nie" }
            }
        }).render(true);
    }

    async refundTalent(key, node, cost) {
        if (this.isCreatorMode) return; 
        if (!this.checkTreeIntegrity(key)) return ui.notifications.error("Nie możesz odciąć gałęzi drzewka!");

        new Dialog({
            title: "Zwrot Talentu", content: `<p>Zwrócić <strong>${node.name}</strong>?</p>`,
            buttons: {
                yes: { label: "Zwrot", callback: async () => {
                    await this.updateXP(cost);
                    if (node.realItemId) await this.document.items.get(node.realItemId)?.delete();
                    else await this.document.items.find(i => i.name === node.name)?.delete();
                    node.purchased = false; node.realItemId = null;
                    await this.saveData(); this.refresh();
                }},
                no: { label: "Anuluj" }
            }
        }).render(true);
    }
    
    async updateXP(amount) {
        const entries = this.document.system.experienceJournal?.entries || [];
        await this.document.update({ "system.experienceJournal.entries": [...entries, { amount, type: "Spent" }] });
    }

    async saveData() {
        if (this.isCreatorMode) return;
        if (this.specializationItem) await this.specializationItem.setFlag("warcraft-genesys", "treeData", this.treeData);
    }

activateListeners(html) {
        const isGM = game.user.isGM;

        html.find('.lock-btn').off('click').click(async (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            this.isLocked = !this.isLocked;
            if (!this.isItem) await this.document.setFlag("warcraft-genesys", "treeLocked", this.isLocked);
            this.refresh();
        });

        const canEditStructure = this.isItem || (isGM && !this.isLocked && !this.isCreatorMode);

if (canEditStructure) {
            // --- OPTYMALIZOWANE PRZESUWANIE Z LIMITEREM (BEZ LAGA) ---
            const grid = html.find('.tree-grid.editable-bg');
            const gridEl = grid[0];
            
            let isDragging = false;
            let startX, startY;
            let initialBgX = 0, initialBgY = 0;
            
            // Zmienne do limitera
            let minX = 0, minY = 0;
            
            // Buforujemy obrazek w pamięci, żeby znać jego naturalne wymiary
            // Robimy to raz, przy inicjalizacji listeners, a nie przy każdym kliknięciu
            const bgImg = new Image();
            if (this.treeData.backgroundImage) {
                bgImg.src = this.treeData.backgroundImage;
            }

            let animationFrameId = null;

            grid.on('mousedown', (e) => {
                if (e.target !== e.currentTarget) return; 
                if (!this.treeData.backgroundImage) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                // 1. Pobieramy aktualną pozycję tła
                const style = window.getComputedStyle(gridEl);
                initialBgX = parseFloat(style.backgroundPositionX) || 0;
                initialBgY = parseFloat(style.backgroundPositionY) || 0;

                // 2. OBLICZAMY LIMITY (Matematyka Cover)
                // Musimy wiedzieć, jak bardzo CSS przeskalował obrazek, żeby znać jego "prawdziwą" szerokość w pikselach ekranu.
                const contW = grid.width();
                const contH = grid.height();
                
                // Jeśli obrazek się jeszcze nie załadował do RAMu, używamy kontenera jako fallback (brak ruchu)
                const natW = bgImg.naturalWidth || contW;
                const natH = bgImg.naturalHeight || contH;

                // Obliczamy skalę (tak jak robi to CSS background-size: cover)
                // Cover bierze większą skalę, żeby wypełnić cały kontener
                const scaleX = contW / natW;
                const scaleY = contH / natH;
                const scale = Math.max(scaleX, scaleY);

                // Rzeczywiste wymiary obrazka na ekranie
                const realImgW = natW * scale;
                const realImgH = natH * scale;

                // Limity: Obrazek nie może uciec w lewo bardziej niż jego szerokość minus szerokość kontenera
                // Max X to zawsze 0 (lewa krawędź obrazka przy lewej krawędzi kontenera)
                minX = contW - realImgW;
                minY = contH - realImgH;

                // Korekta: Jeśli obrazek jest mniejszy/równy kontenerowi (przez zaokrąglenia), blokujemy na 0
                if (minX > 0) minX = 0;
                if (minY > 0) minY = 0;

                grid.css('cursor', 'grabbing');
            });

            $(window).on('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();

                if (animationFrameId) return;

                animationFrameId = requestAnimationFrame(() => {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    
                    let newX = initialBgX + dx;
                    let newY = initialBgY + dy;

                    // --- LIMITER (ŚCIANA) ---
                    // 1. Nie wyjedź w prawo (pusta przestrzeń z lewej) -> Max 0
                    if (newX > 0) newX = 0;
                    // 2. Nie wyjedź w lewo (pusta przestrzeń z prawej) -> Min minX
                    if (newX < minX) newX = minX;

                    // To samo dla pionu
                    if (newY > 0) newY = 0;
                    if (newY < minY) newY = minY;

                    gridEl.style.backgroundPosition = `${newX}px ${newY}px`;
                    
                    this.tempX = newX;
                    this.tempY = newY;

                    animationFrameId = null;
                });
            });

            $(window).on('mouseup', async (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                
                grid.css('cursor', 'grab');
                
                if (this.tempX !== undefined && this.tempY !== undefined) {
                    this.treeData.bgPosX = `${this.tempX}px`;
                    this.treeData.bgPosY = `${this.tempY}px`;
                    this.tempX = undefined; 
                    this.tempY = undefined;
                    await this.saveData();
                }
            });

            // --- RESZTA EVENTÓW BEZ ZMIAN ---
            html.find('.file-picker-btn').click(async (ev) => {
                ev.preventDefault();
                new FilePicker({
                    type: "image",
                    current: this.treeData.backgroundImage || "",
                    callback: async (path) => {
                        this.treeData.backgroundImage = path;
                        this.treeData.bgPosX = "0px";
                        this.treeData.bgPosY = "0px";
                        await this.saveData(); this.refresh();
                    }
                }).browse();
            });

            html.find('.bg-input').change(async (ev) => {
                this.treeData.backgroundImage = ev.target.value;
                this.treeData.bgPosX = "0px";
                this.treeData.bgPosY = "0px";
                await this.saveData(); this.refresh();
            });

            html.find('.tree-node').on('drop', async (ev) => {
                ev.preventDefault(); ev.stopPropagation(); 
                const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
                const item = await fromUuid(data.uuid);
                if (!item) return;
                const key = $(ev.currentTarget).data('key');
                this.treeData.nodes[key] = {
                    name: item.name, img: item.img, id: item.id, description: item.system.description, purchased: false
                };
                await this.saveData(); this.refresh();
            });

            html.find('.tree-node').contextmenu(async (ev) => {
                ev.preventDefault();
                const key = $(ev.currentTarget).data('key');
                if (this.treeData.nodes[key]) {
                    delete this.treeData.nodes[key];
                    await this.saveData(); this.refresh();
                }
            });

            html.find('.connector').click(async (ev) => {
                const key = $(ev.currentTarget).data('conn');
                if (this.treeData.connections[key]) delete this.treeData.connections[key];
                else this.treeData.connections[key] = true;
                await this.saveData(); this.refresh();
            });
        }

        html.find('.tree-node').click(async (ev) => {
            if (this.isItem) return;
            const key = $(ev.currentTarget).data('key');
            const cost = $(ev.currentTarget).data('cost');
            const node = this.treeData.nodes[key];
            if (!node) return;

            if (isGM && ev.ctrlKey && !this.isLocked) {
                node.purchased = !node.purchased;
                await this.saveData(); this.refresh();
                return;
            }

            if (node.purchased) this.refundTalent(key, node, cost);
            else this.purchaseTalent(key, node, cost);
        });
    }
}