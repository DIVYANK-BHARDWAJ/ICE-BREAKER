export interface MascotSplit {
    count: number;
    startIdx: number;
}

export function getMascotSplits(
    optionsCount: number,
    optionDistribution: Record<string, number> | undefined,
    totalResponses: number
): MascotSplit[] {
    const TOTAL_MASCOTS = 10;
    if (!totalResponses || totalResponses <= 0) {
        return Array.from({ length: optionsCount }, () => ({ count: 0, startIdx: 1 }));
    }

    const counts: number[] = [];
    for (let i = 0; i < optionsCount; i++) {
        counts.push(optionDistribution?.[i.toString()] || 0);
    }

    // Proportional fractional allocation out of 10
    const rawAllocations = counts.map(c => (c / totalResponses) * TOTAL_MASCOTS);
    const intAllocations = rawAllocations.map(r => Math.floor(r));
    let assigned = intAllocations.reduce((a, b) => a + b, 0);

    // Give at least 1 mascot to any option with votes > 0 if available
    for (let i = 0; i < optionsCount; i++) {
        if (counts[i] > 0 && intAllocations[i] === 0 && assigned < TOTAL_MASCOTS) {
            intAllocations[i] = 1;
            assigned++;
        }
    }

    // Allocate remainders up to 10
    if (assigned < TOTAL_MASCOTS) {
        const remainders = rawAllocations
            .map((raw, idx) => ({ idx, rem: raw - intAllocations[idx], count: counts[idx] }))
            .filter(r => r.count > 0);

        remainders.sort((a, b) => b.rem - a.rem);

        let rIdx = 0;
        while (assigned < TOTAL_MASCOTS && rIdx < remainders.length) {
            intAllocations[remainders[rIdx].idx]++;
            assigned++;
            rIdx++;
        }
    }

    // Calculate mascot start indices (1..10)
    let currentStart = 1;
    return intAllocations.map(count => {
        const start = currentStart;
        currentStart += count;
        return { count, startIdx: start };
    });
}

export const OPTION_GRADIENTS = [
    'linear-gradient(90deg, #0077b6 0%, #00f2fe 100%)', // Option A: Cyan
    'linear-gradient(90deg, #b7094c 0%, #e8262c 100%)', // Option B: Crimson Accent
    'linear-gradient(90deg, #f77f00 0%, #fcbf49 100%)', // Option C: Amber Gold
    'linear-gradient(90deg, #7209b7 0%, #9d4edd 100%)', // Option D: Electric Purple
];

export const OPTION_BORDER_COLORS = ['#00f2fe', '#e8262c', '#fcbf49', '#9d4edd'];

export const OPTION_GLOW_COLORS = [
    'rgba(0, 242, 254, 0.18)',  // Option A: Restrained Cyan
    'rgba(232, 38, 44, 0.18)',   // Option B: Restrained Red
    'rgba(252, 191, 73, 0.18)', // Option C: Restrained Amber
    'rgba(157, 78, 221, 0.18)', // Option D: Restrained Purple
];

export interface MascotDetail {
    id: number;
    name: string;
    title: string;
    image: string;
    summary?: string;
}

export const MASCOT_DETAILS: Record<number, MascotDetail> = {
    1: { id: 1, name: "Apex Wolf Titan", title: "Tactical Alpha Vanguard", image: "/mascots/mascot_1.webp", summary: "A relentless hunter that leads the pack through the fiercest digital storms." },
    2: { id: 2, name: "Mecha Falcon", title: "Skyline Precision Operator", image: "/mascots/mascot_2.webp", summary: "Soaring above the data streams, striking targets with absolute zero latency." },
    3: { id: 3, name: "Stealth Panther", title: "Obsidian Shadow Stalker", image: "/mascots/mascot_3.webp", summary: "Moving unseen through the network, delivering the right answer from the shadows." },
    4: { id: 4, name: "Mecha Cobra", title: "Cybernetic Plasma Striker", image: "/mascots/mascot_4.webp", summary: "Coiled with energy, executing lightning-fast logic strikes with deadly accuracy." },
    5: { id: 5, name: "Apex Dragon", title: "Titanium Flame Sovereign", image: "/mascots/mascot_5.webp", summary: "Ruling the server heavens, breathing unquenchable fire upon incorrect data." },
    6: { id: 6, name: "Cyber Raven", title: "Quantum Intel Scout", image: "/mascots/mascot_6.webp", summary: "An omnipresent watcher decoding the hardest quantum enigmas with ease." },
    7: { id: 7, name: "Lion Monarch", title: "High-Voltage Overlord", image: "/mascots/mascot_7.webp", summary: "Roaring with electrical fury, commanding absolute authority on the leaderboard." },
    8: { id: 8, name: "Titan Mech Bear", title: "Heavy Armored Enforcer", image: "/mascots/mascot_8.webp", summary: "A juggernaut of raw processing power that shatters all defensive firewalls." },
    9: { id: 9, name: "Shadow Fox", title: "Neon Velocity Ghost", image: "/mascots/mascot_9.webp", summary: "A blur of neon light, outsmarting every trap with cunning agility." },
    10: { id: 10, name: "Omega Phoenix", title: "Immortal Energy Core", image: "/mascots/mascot_10.webp", summary: "Rising from the ashes of bad logic to blaze a trail of absolute perfection." },
    11: { id: 11, name: "Neon Shark", title: "Abyssal Cyber Hunter", image: "/mascots/mascot_11.webp", summary: "Lurking in the digital depths, the Neon Shark strikes with precision and unmatched speed." },
    12: { id: 12, name: "Quantum Owl", title: "Omniscient Logic Oracle", image: "/mascots/mascot_12.webp", summary: "Silently computing every outcome, the Quantum Owl sees straight through the fog of chaos." },
    13: { id: 13, name: "Plasma Tiger", title: "Fierce Plasma Striker", image: "/mascots/mascot_13.webp", summary: "A burning force of nature, tearing through obstacles with sheer brute energy." },
    14: { id: 14, name: "Mecha Gorilla", title: "Impenetrable Siege Breaker", image: "/mascots/mascot_14.webp", summary: "Unyielding and resolute, crushing defensive barriers with heavy mechanical force." },
    15: { id: 15, name: "Cyber Mantis", title: "Lethal Code Assassin", image: "/mascots/mascot_15.webp", summary: "Swift and sharp, slicing through complex problems with razor-edged precision." },
    16: { id: 16, name: "Astro Rhino", title: "Galactic Juggernaut", image: "/mascots/mascot_16.webp", summary: "Unstoppable momentum defines the Astro Rhino as it charges through the cosmos." },
};
