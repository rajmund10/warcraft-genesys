import { TalentTreeManager } from "./tree-manager.js";

export class SpecializationSheet extends ItemSheet {
    
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            // ID musi być unikalne
            id: "warcraft-genesys.SpecializationSheet", 
            classes: ["genesys", "sheet", "item", "specialization-sheet"],
            width: 780,
            height: 850,
            tabs: [],
            
            // --- NAPRAWA BŁĘDU ZAMYKANIA ---
            // Wyłączamy automatyczne zapisywanie formularza, 
            // bo nasz TreeManager robi to ręcznie, a my nie mamy tagu <form>
            submitOnChange: false,
            submitOnClose: false
        });
    }

    get template() {
        return `modules/warcraft-genesys/templates/dummy.html`; 
    }

    async _render(force, options) {
        if (!this.rendered) await super._render(force, options);
        
        const treeManager = new TalentTreeManager(this, this.element);
        treeManager.init(); 
        
        // Ustawiamy tytuł okna
        this.element.find(".window-title").text(`Edytor Specjalizacji: ${this.item.name}`);
    }
}