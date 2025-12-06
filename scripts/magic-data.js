export const MAGIC_DATA = {
    // 1. POWIĄZANIE UMIEJĘTNOŚCI Z AKCJAMI
    // Klucze muszą być identyczne jak nazwy umiejętności na karcie postaci!
    skills: {
        "Arkana": ["attack", "barrier", "conjure", "curse", "dispel", "utility", "teleport", "shapechange_arcane"],
        
        // Light -> Światłość
        "Światłość": ["attack", "augment", "barrier", "curse", "heal", "utility"],
        
        // Nature -> Natura (z Przemianą dla Natury)
        "Natura": ["attack", "augment", "conjure", "heal", "utility", "shapechange_nature"],
        
        // Elemental -> Żywioły (bez Przemiany)
        "Żywioły": ["attack", "augment", "conjure", "heal", "utility"],

        // Fel -> Spaczenie
        "Spaczenie": ["attack", "augment", "conjure", "curse", "utility", "teleport"]
    },

    // 2. DEFINICJE AKCJI
    actions: {
        "attack": { 
            label: "Atak", 
            difficulty: "easy", // Łatwy (1k)
            desc: "Zadaje obrażenia równe Intelektowi + sukcesy. Bazowe obrażenia równają się cesze powiązanej z magią powiększonej o liczbę sukcesów." 
        },
        "augment": { 
            label: "Ulepszenie", 
            difficulty: "average", // Przeciętny (2k)
            desc: "Zwiększa cechę celu, rangę umiejętności lub Obronę o 1 do końca następnej rundy. Koncentracja: Tak." 
        },
        "barrier": { 
            label: "Bariera", 
            difficulty: "easy", // Łatwy (1k)
            desc: "Zmniejsza otrzymywane obrażenia o 1 (plus 1 za każdy sukces) LUB zwiększa Obronę o 1. Koncentracja: Tak." 
        },
        "conjure": { 
            label: "Przywołanie", 
            difficulty: "easy", // Łatwy (1k)
            desc: "Tworzy prosty przedmiot lub przywołuje istotę. Koncentracja: Tak." 
        },
        "curse": { 
            label: "Klątwa", 
            difficulty: "average", // Przeciętny (2k)
            desc: "Zmniejsza wybraną cechę lub rangę umiejętności celu o 1. Koncentracja: Tak." 
        },
        "dispel": { 
            label: "Rozproszenie", 
            difficulty: "hard", // Trudny (3k)
            desc: "Kończy działanie efektu magicznego na celu." 
        },
        "heal": { 
            label: "Uzdrowienie", 
            difficulty: "easy", // Łatwy (1k)
            desc: "Leczy rany oraz stres (ilość równa Intelektowi)." 
        },
        "utility": { 
            label: "Użytkowe", 
            difficulty: "easy", // Łatwy (1k)
            desc: "Drobne efekty magiczne: światło, otwarcie zamka, lewitacja małego przedmiotu itp." 
        },
        
        // --- SPECJALNE AKCJE WARCRAFTA ---
        
        "teleport": {
            label: "Teleportacja",
            difficulty: "average", // Przeciętny (2k)
            desc: "Natychmiastowe przemieszczenie na bliski zasięg. Koncentracja: Tak."
        },
        
        // Przemiana dla Natury (na siebie)
        "shapechange_nature": {
            label: "Przemiana",
            difficulty: "easy", // Łatwy (1k)
            desc: "Przesuń 1 punkt cechy (zwiększ jedną, zmniejsz drugą) na sobie. Trwa do momentu wykonania testu Natury (Przeciętny/2k) lub obezwładnienia."
        },

        // Przemiana dla Arkanów (na kogoś)
        "shapechange_arcane": {
            label: "Przemiana",
            difficulty: "easy", // Łatwy (1k)
            desc: "Przesuń 1 punkt cechy celu w zwarciu (innego niż ty). Trwa przez liczbę rund równą randze w Wiedzy (Lore)."
        }
    },

    // 3. EFEKTY DODATKOWE (MODYFIKATORY)
    effects: {
        "range": { label: "Zasięg (+1 pasmo)", mod: 1, type: "difficulty" },
        "targets": { label: "Dodatkowy Cel", mod: 1, type: "difficulty" },
        "magnitude": { label: "Siła Efektu", mod: 1, type: "difficulty" },
        "duration": { label: "Czas Trwania", mod: 1, type: "difficulty" },
        "blood": { label: "Magia Krwi (2 Rany)", mod: -1, type: "difficulty", desc: "Otrzymaj 2 rany (niezredukowane), by obniżyć trudność testu." }
    }
};