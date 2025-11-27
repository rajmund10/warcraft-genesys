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
                    <p>${game.i18n.localize("Warcraft.Editor")}</p>
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
            const navItem = $(`<a class="item" data-tab="talent-tree"><i class="fas fa-sitemap"></i> ${game.i18n.localize("Warcraft.SpecTree")}</a>`);
            this.html.find('nav.sheet-tabs').append(navItem);
        }

        if (this.html.find('.tab[data-tab="talent-tree"]').length === 0) {
            const tabContent = $('<div class="tab talent-tree" data-group="primary" data-tab="talent-tree"></div>');
            this.html.find('section.sheet-body').append(tabContent);
            this.renderTree(tabContent);
        }
    }

    _calculateXP() {
        const entries = this.document.system.experienceJournal?.entries || [];
        let total = 0;
        for (let entry of entries) {
            total += (Number(entry.amount) || 0);
        }
        return total;
    }

    renderTree(container) {
        const lockIcon = this.isLocked ? "fa-lock" : "fa-lock-open";
        const lockClass = this.isLocked ? "" : "unlocked";
        const lockTitle = this.isLocked ? game.i18n.localize("Warcraft.Locked") : game.i18n.localize("Warcraft.EditMode");
        
        const xpLabel = game.i18n.localize("Genesys.Labels.AvailableXP") || "Dostępne PD";
        
        let controls = "";
        if (!this.isItem) {
            const currentXP = this._calculateXP();
            const instruction = game.i18n.localize("Warcraft.InstructionActor");
            
            controls = `
            <div class="tree-controls">
                <button class="lock-btn ${lockClass}" title="${lockTitle}">
                    <i class="fas ${lockIcon}"></i>
                </button>
                <span class="xp-display" style="margin-left: 15px; font-family: 'Cinzel'; font-weight: bold; color: #4a3b28;">
                    ${xpLabel}: <span style="color: #2e7d32;">${currentXP}</span>
                </span>
                <span style="flex:1"></span>
                <small style="color:#555">${instruction}</small>
            </div>`;
        } else {
            const instruction = game.i18n.localize("Warcraft.InstructionItem");
            controls = `<div class="tree-controls" style="text-align:center; color:#777"><small>${instruction}</small></div>`;
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

                    let positionClass = "pos-center"; 
                    if (c === 0) positionClass = "pos-left"; 
                    else if (c === 3) positionClass = "pos-right";

                    const activationLabel = node.activation ? `${game.i18n.localize("Genesys.Labels.Activation")}: ${node.activation}` : "";

                    html += `
                        <div class="tree-node ${purchasedClass} ${availableClass} ${positionClass}" data-key="${key}" data-cost="${cost}">
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
                    const hasExistingTree = Object.keys(this.treeData.nodes).length > 0;
                    const dialogTitle = hasExistingTree ? game.i18n.localize("Warcraft.OverwritePrompt") : game.i18n.localize("Warcraft.ImportPrompt");
                    const warning = game.i18n.localize("Warcraft.OverwriteWarning");

                    const dialogContent = hasExistingTree ? 
                        `<p>${dialogTitle}</p><p style="color:#d32f2f; font-size: 12px;">${warning}</p>` :
                        `<p>${dialogTitle} <strong>${item.name}</strong>?</p>`;

                    new Dialog({
                        title: dialogTitle,
                        content: dialogContent,
                        buttons: {
                            yes: {
                                label: hasExistingTree ? "Nadpisz" : "Wczytaj",
                                callback: async () => {
                                    const cleanNodes = {};
                                    for (const [k, v] of Object.entries(specTreeData.nodes)) {
                                        cleanNodes[k] = { ...v, purchased: false };
                                    }
                                    this.treeData = { nodes: cleanNodes, connections: specTreeData.connections || {} };
                                    await this.saveData();
                                    this.refresh();
                                    ui.notifications.info(`Wczytano specjalizację: ${item.name}`);
                                }
                            },
                            no: { label: "Anuluj" }
                        },
                        default: "yes"
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
            ui.notifications.warn(game.i18n.localize("Warcraft.PathRequirement"));
            return;
        }

        const currentXP = this._calculateXP();
        if (currentXP < cost) {
            ui.notifications.error(game.i18n.localize("Warcraft.NotEnoughXP"));
            return;
        }

        new Dialog({
            title: game.i18n.localize("Warcraft.BuyTitle"),
            content: `<p>${game.i18n.format("Warcraft.BuyConfirm", {name: node.name, cost: cost})}</p>`,
            buttons: {
                yes: {
                    label: game.i18n.localize("Genesys.Labels.Yes"),
                    icon: '<i class="fas fa-check"></i>',
                    callback: async () => {
                        try {
                            // ZAPIS W DZIENNIKU (POLSKI)
                            const entries = this.document.system.experienceJournal?.entries || [];
                            const newEntry = {
                                amount: -cost,
                                type: "Spent", 
                                data: { 
                                    name: game.i18n.format("Warcraft.JournalPurchase", {name: node.name}) 
                                }
                            };
                            
                            await this.document.update({
                                "system.experienceJournal.entries": [...entries, newEntry]
                            });

                            const itemData = {
                                name: node.name,
                                type: "talent",
                                img: node.img,
                                system: {
                                    description: node.description,
                                    activation: { 
                                        type: node.activation.toLowerCase().includes("active") ? "active" : "passive", 
                                        detail: node.activation.replace(/passive|active/gi, "").replace(/[()]/g, "").trim() 
                                    },
                                    ranked: "no",
                                    tier: r + 1 
                                }
                            };
                            
                            const newItems = await this.document.createEmbeddedDocuments("Item", [itemData]);
                            const newItem = newItems[0]; 

                            node.purchased = true;
                            node.realItemId = newItem.id; 
                            
                            await this.saveData();
                            this.refresh();
                            
                            AudioHelper.play({src: "sounds/coins.wav", volume: 0.5}, false);
                            ui.notifications.info(game.i18n.format("Warcraft.JournalPurchase", {name: node.name}));

                        } catch (err) {
                            console.error(err);
                        }
                    }
                },
                no: { label: game.i18n.localize("Genesys.Labels.No") }
            }
        }).render(true);
    }

    async refundTalent(key, node, cost) {
        // 1. Szukamy paragonu (wpisu w dzienniku)
        const entries = this.document.system.experienceJournal?.entries || [];
        let receiptIndex = -1;
        
        // Szukamy nazwy talentu w dzienniku
        for (let i = entries.length - 1; i >= 0; i--) {
            const e = entries[i];
            // Sprawdzamy czy nazwa wpisu zawiera nazwę talentu (np. "Zakup talentu: Atak")
            if (e.amount === -cost && e.data?.name && e.data.name.includes(node.name)) {
                receiptIndex = i;
                break;
            }
        }

        const dialogTitle = game.i18n.localize("Warcraft.RefundTitle");
        let dialogContent;
        
        if (receiptIndex > -1) {
            dialogContent = `<p>${game.i18n.format("Warcraft.RefundConfirm", {name: node.name, cost: cost})}</p>`;
        } else {
            dialogContent = `<p style="color:#d32f2f"><strong>UWAGA:</strong> Nie znaleziono wpisu w dzienniku! (Brak zwrotu PD)</p>`;
        }

        new Dialog({
            title: dialogTitle,
            content: dialogContent + `<p style="font-size:12px; color:#777; margin-top:5px">${game.i18n.localize("Warcraft.RefundWarning")}</p>`,
            buttons: {
                yes: {
                    label: receiptIndex > -1 ? "Zwrot" : "Usuń",
                    icon: '<i class="fas fa-undo"></i>',
                    callback: async () => {
                        try {
                            if (receiptIndex > -1) {
                                const newEntries = [...entries];
                                newEntries.splice(receiptIndex, 1); // Usuwamy wpis zakupu
                                await this.document.update({
                                    "system.experienceJournal.entries": newEntries
                                });
                            }

                            if (node.realItemId) {
                                const existingItem = this.document.items.get(node.realItemId);
                                if (existingItem) await existingItem.delete();
                            } else {
                                const existingItem = this.document.items.find(i => i.name === node.name && i.type === "talent");
                                if (existingItem) await existingItem.delete();
                            }

                            node.purchased = false;
                            node.realItemId = null;

                            await this.saveData();
                            this.refresh();
                            ui.notifications.info(game.i18n.format("Warcraft.JournalRefund", {name: node.name}));

                        } catch (err) {
                            console.error(err);
                        }
                    }
                },
                no: { label: game.i18n.localize("Genesys.Labels.No") }
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