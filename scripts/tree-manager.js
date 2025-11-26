export class TalentTreeManager {
    constructor(app, html) {
        this.app = app;
        this.html = html;
        this.document = app.document; 
        this.isItem = (this.document.documentName === "Item");
        this.isLocked = !this.isItem; 

        this.treeData = this.document.getFlag("warcraft-genesys", "treeData") || {
            nodes: {},      
            connections: {} 
        };
    }

    init() {
        if (this.isItem) {
            this.html.closest('.window-app').addClass('warcraft-mode');
            const container = this.html.find('.window-content');
            container.empty();
            
            container.append(`
                <div class="specialization-header">
                    <h3>${this.document.name}</h3>
                    <p>Szablon Specjalizacji (Edytor)</p>
                </div>
            `);
            
            const treeDiv = $('<div class="tab talent-tree active"></div>');
            container.append(treeDiv);
            this.renderTree(treeDiv);
        } else {
            this.injectTab();
        }
    }

    injectTab() {
        if (this.html.find('.item[data-tab="talent-tree"]').length === 0) {
            const navItem = $('<a class="item" data-tab="talent-tree"><i class="fas fa-sitemap"></i> Drzewko</a>');
            this.html.find('nav.sheet-tabs').append(navItem);
        }

        if (this.html.find('.tab[data-tab="talent-tree"]').length === 0) {
            const tabContent = $('<div class="tab talent-tree" data-group="primary" data-tab="talent-tree"></div>');
            this.html.find('section.sheet-body').append(tabContent);
            this.renderTree(tabContent);
        }
    }

    renderTree(container) {
        const lockIcon = this.isLocked ? "fa-lock" : "fa-lock-open";
        const lockClass = this.isLocked ? "" : "unlocked";
        const lockTitle = this.isLocked ? "Zablokowane (Tryb Gry)" : "Tryb Edycji";
        
        let controls = "";
        if (!this.isItem) {
            // --- POPRAWKA 1: BEZPIECZNE POBIERANIE XP ---
            // Używamy ?. (optional chaining) i || 0 (fallback)
            const currentXP = this.document.system.experience?.available || 0;
            
            controls = `
            <div class="tree-controls">
                <button class="lock-btn ${lockClass}" title="${lockTitle}">
                    <i class="fas ${lockIcon}"></i>
                </button>
                <span class="xp-display">Dostępne XP: <strong>${currentXP}</strong></span>
                <span style="flex:1"></span>
                <small style="color:#555">LPM: Kup / PPM: Edycja</small>
            </div>`;
        } else {
            controls = `<div class="tree-controls" style="text-align:center; color:#777"><small>Edytor Szablonu</small></div>`;
        }

        let html = `${controls}<div class="tree-grid">`;

        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 4; c++) {
                const key = `${r}-${c}`;
                const node = this.treeData.nodes[key];
                const cost = (r + 1) * 5;
                
                if (node) {
                    const purchasedClass = node.purchased ? 'purchased' : '';
                    
                    let availableClass = "";
                    if (!this.isItem && !node.purchased && !this.checkAccessibility(r, c)) {
                        availableClass = "dimmed";
                    }

                    const activationLabel = node.activation ? `Aktywacja: ${node.activation}` : "";

                    html += `
                        <div class="tree-node ${purchasedClass} ${availableClass}" data-key="${key}" data-cost="${cost}">
                            <img src="${node.img}">
                            <div class="node-name">${node.name}</div>
                            <div class="node-cost">${cost} XP</div>
                            <div class="tooltip">
                                <strong>${node.name}</strong>
                                <div class="activation-tag">${activationLabel}</div>
                                <div>${node.description || ""}</div>
                            </div>
                        </div>`;
                } else {
                    const emptyText = this.isLocked ? "" : `Slot<br><small>${cost} XP</small>`;
                    const borderClass = this.isLocked ? "locked-empty" : "empty"; 
                    html += `<div class="tree-node ${borderClass}" data-key="${key}">${emptyText}</div>`;
                }

                if (c < 3) {
                    const hKey = `h-${r}-${c}`;
                    const active = this.treeData.connections[hKey] ? 'active' : '';
                    const cursorClass = this.isLocked ? "" : "editable"; 
                    html += `<div class="connector h ${active} ${cursorClass}" data-conn="${hKey}"></div>`;
                }
            }

            if (r < 4) {
                for (let c = 0; c < 4; c++) {
                    const vKey = `v-${r}-${c}`;
                    const active = this.treeData.connections[vKey] ? 'active' : '';
                    const cursorClass = this.isLocked ? "" : "editable";
                    html += `<div class="connector v ${active} ${cursorClass}" data-conn="${vKey}"></div>`;
                    if (c < 3) html += `<div></div>`; 
                }
            }
        }

        html += '</div>'; 
        container.html(html);
        this.activateListeners(container);
    }

    checkAccessibility(row, col) {
        if (row === 0) return true;

        const upConnKey = `v-${row-1}-${col}`;
        const upNodeKey = `${row-1}-${col}`;
        if (this.treeData.connections[upConnKey] && this.treeData.nodes[upNodeKey]?.purchased) return true;

        if (col > 0) {
            const leftConnKey = `h-${row}-${col-1}`;
            const leftNodeKey = `${row}-${col-1}`;
            if (this.treeData.connections[leftConnKey] && this.treeData.nodes[leftNodeKey]?.purchased) return true;
        }

        if (col < 3) {
            const rightConnKey = `h-${row}-${col}`; 
            const rightNodeKey = `${row}-${col+1}`;
            if (this.treeData.connections[rightConnKey] && this.treeData.nodes[rightNodeKey]?.purchased) return true;
        }

        if (row < 4) {
            const downConnKey = `v-${row}-${col}`;
            const downNodeKey = `${row+1}-${col}`;
            if (this.treeData.connections[downConnKey] && this.treeData.nodes[downNodeKey]?.purchased) return true;
        }

        return false;
    }

    activateListeners(html) {
        html.find('.lock-btn').on('click', (ev) => {
            ev.preventDefault();
            this.isLocked = !this.isLocked;
            this.refresh();
        });

        if (!this.isItem) {
            html.closest('.tab.talent-tree').on('drop', async (ev) => {
                if ($(ev.target).hasClass('tree-node') || $(ev.target).parents('.tree-node').length) return;
                ev.preventDefault();
                
                const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
                if (data.type !== "Item") return;
                const item = await Item.fromDropData(data);
                const specTreeData = item.getFlag("warcraft-genesys", "treeData");
                
                if (specTreeData && item.type === "specialization") {
                    new Dialog({
                        title: "Aktywować Specjalizację?",
                        content: `<p>Czy wgrać drzewko: <strong>${item.name}</strong>?</p>`,
                        buttons: {
                            yes: {
                                label: "Wczytaj",
                                callback: async () => {
                                    const cleanNodes = {};
                                    for (const [k, v] of Object.entries(specTreeData.nodes)) {
                                        cleanNodes[k] = { ...v, purchased: false };
                                    }
                                    this.treeData = { nodes: cleanNodes, connections: specTreeData.connections || {} };
                                    await this.saveData();
                                    this.refresh();
                                }
                            },
                            no: { label: "Anuluj" }
                        }
                    }).render(true);
                }
            });
        }

        html.find('.tree-node').on('drop', async (ev) => {
            if (!this.isItem && this.isLocked) return;
            ev.preventDefault();
            ev.stopPropagation(); 

            const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
            if (data.type !== "Item") return;
            const item = await Item.fromDropData(data);
            if (item.type !== "talent") return;

            const key = $(ev.currentTarget).data('key');
            let activationText = "Pasywna";
            if (item.system.activation?.type) {
                activationText = item.system.activation.type;
                if (item.system.activation.detail) activationText += ` (${item.system.activation.detail})`;
            }

            this.treeData.nodes[key] = {
                name: item.name,
                img: item.img,
                id: item.id,
                description: item.system.description,
                activation: activationText,
                purchased: false
            };
            await this.saveData();
            this.refresh();
        });

        html.find('.tree-node').on('click', async (ev) => {
            const key = $(ev.currentTarget).data('key');
            const cost = $(ev.currentTarget).data('cost');
            const node = this.treeData.nodes[key];
            
            if (!node) return;
            if (this.isItem) return; 

            if (node.purchased) {
                this.refundTalent(key, node, cost);
            } else {
                this.purchaseTalent(key, node, cost);
            }
        });

        html.find('.tree-node').on('contextmenu', async (ev) => {
            if (!this.isItem && this.isLocked) return; 
            const key = $(ev.currentTarget).data('key');
            if (this.treeData.nodes[key]) {
                delete this.treeData.nodes[key];
                await this.saveData();
                this.refresh();
            }
        });

        html.find('.connector').on('click', async (ev) => {
            if (!this.isItem && this.isLocked) return;
            const key = $(ev.currentTarget).data('conn');
            if (this.treeData.connections[key]) delete this.treeData.connections[key];
            else this.treeData.connections[key] = true;
            await this.saveData();
            this.refresh();
        });
    }

    async purchaseTalent(key, node, cost) {
        const [r, c] = key.split('-').map(Number);
        if (!this.checkAccessibility(r, c)) {
            ui.notifications.warn("Musisz najpierw kupić połączony talent z niższego rzędu!");
            return;
        }

        // --- POPRAWKA 2: BEZPIECZNE POBIERANIE XP ---
        const currentXP = this.document.system.experience?.available || 0;
        
        if (currentXP < cost) {
            ui.notifications.error(`Nie masz wystarczająco XP! Koszt: ${cost}, Masz: ${currentXP}`);
            return;
        }

        new Dialog({
            title: "Zakup Talentu",
            content: `<p>Czy chcesz kupić talent <strong>${node.name}</strong> za <strong>${cost} XP</strong>?</p>`,
            buttons: {
                yes: {
                    label: "Kupuję",
                    icon: '<i class="fas fa-check"></i>',
                    callback: async () => {
                        // Aktualizacja XP
                        await this.document.update({
                            "system.experience.available": currentXP - cost
                        });

                        const itemData = {
                            name: node.name,
                            type: "talent",
                            img: node.img,
                            system: {
                                description: node.description,
                                activation: { type: node.activation.split('(')[0].trim(), detail: "" },
                                ranked: false, 
                                tier: r + 1 
                            }
                        };
                        
                        const newItem = await this.document.createEmbeddedDocuments("Item", [itemData]);
                        
                        node.purchased = true;
                        node.realItemId = newItem[0].id; 
                        
                        await this.saveData();
                        this.refresh();
                        
                        AudioHelper.play({src: "sounds/coins.wav", volume: 0.5}, false);
                        ui.notifications.info(`Kupiono talent: ${node.name}`);
                    }
                },
                no: { label: "Anuluj" }
            }
        }).render(true);
    }

    async refundTalent(key, node, cost) {
        new Dialog({
            title: "Zwrot Talentu",
            content: `<p>Czy chcesz cofnąć talent <strong>${node.name}</strong> i odzyskać <strong>${cost} XP</strong>?</p>
                      <p style="font-size:12px; color:#777">Talent zostanie usunięty z Twojej karty.</p>`,
            buttons: {
                yes: {
                    label: "Zwróć",
                    icon: '<i class="fas fa-undo"></i>',
                    callback: async () => {
                        // --- POPRAWKA 3: BEZPIECZNE POBIERANIE XP ---
                        const currentXP = this.document.system.experience?.available || 0;
                        
                        await this.document.update({
                            "system.experience.available": currentXP + cost
                        });

                        if (node.realItemId) {
                            const existingItem = this.document.items.get(node.realItemId);
                            if (existingItem) {
                                await existingItem.delete();
                            }
                        } else {
                            const existingItem = this.document.items.find(i => i.name === node.name && i.type === "talent");
                            if (existingItem) await existingItem.delete();
                        }

                        node.purchased = false;
                        node.realItemId = null;

                        await this.saveData();
                        this.refresh();
                        ui.notifications.info(`Zwrócono talent: ${node.name}`);
                    }
                },
                no: { label: "Anuluj" }
            }
        }).render(true);
    }

    async saveData() {
        await this.document.setFlag("warcraft-genesys", "treeData", this.treeData);
    }

    refresh() {
        const container = this.html.find('.tab.talent-tree');
        const target = this.isItem ? this.html.find('.window-content .talent-tree') : container;
        
        if (target.length) {
            target.empty(); 
            this.renderTree(target);
        } else {
            this.init();
        }
    }
}