export interface Question {
    section: string;
    type: 'mcq' | 'mcq-image' | 'emoji';
    question: string;
    options?: string[];
    images?: string[];
    answer: number | string; // index for MCQs, exact string for emoji round
    timer: number; // in seconds
}

export const questions: Question[] = [
    // Section 1 — ProtocolX MCQ (10s timer each)
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which app introduced \"Stories\" first?",
        options: ["Instagram", "Snapchat", "Facebook", "WhatsApp"],
        answer: 1, // Snapchat
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which animal is in the Firefox logo?",
        options: ["Swift Fox", "Red Panda", "Genus Vulpes", "Red Fox"],
        answer: 1, // Red Panda
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which company invented the first mobile phone?",
        options: ["Nokia", "Apple", "Motorola", "Samsung"],
        answer: 2, // Motorola
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which company makes PlayStation?",
        options: ["Microsoft", "Nintendo", "Sony", "Asus"],
        answer: 2, // Sony
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq-image",
        question: "Which is the real BMW logo?",
        options: ["Option A", "Option B"],
        images: ["/assets/bmw_1.png", "/assets/bmw_2.png"],
        answer: 0, // Option A is correct
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq-image",
        question: "Which is the real Microsoft logo?",
        options: ["Option A", "Option B"],
        images: ["/assets/microsoft_1.png", "/assets/microsoft_2.png"],
        answer: 0, // Option A is correct
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which platform was originally a dating app idea?",
        options: ["YouTube", "Instagram", "Snapchat", "Facebook"],
        answer: 0, // YouTube
        timer: 10
    },
    {
        section: "Section 1 — ProtocolX MCQ",
        type: "mcq",
        question: "Which came first?",
        options: ["Netflx", "Google", "YouTube", "Twitter"],
        answer: 0, // Netflx
        timer: 10
    },
    // Section 2 — Keep 'em Guessing MCQ (10s timer each)
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "What platform does the Hogwarts Express leave from?",
        options: ["7¾", "9¾", "9¼", "9⅔"],
        answer: 1, // 9¾
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "What is Voldemort's real name?",
        options: ["Tom Marvolo Riddle", "Sirius Black", "Lucius Malfoy", "Cedric Diggory"],
        answer: 0, // Tom Marvolo Riddle
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "Who was the Half-Blood Prince?",
        options: ["Snape", "Harry Potter", "Draco Malfoy", "Professor Horace Slughorn"],
        answer: 3, // Professor Horace Slughorn
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "From which century does Doraemon come?",
        options: ["21st", "25th", "23rd", "22nd"],
        answer: 3, // 22nd
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "What is Nobita's future son's name?",
        options: ["Sewashi", "Nobisuke", "Dekisugi", "Nobitoshi"],
        answer: 1, // Nobisuke
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "Who sent Doraemon to Nobita?",
        options: ["Nobisuke Nobi", "Doraemon's factory", "Sewashi Nobi", "Nobita's father"],
        answer: 1, // Doraemon's factory
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "What is Shinchan's friend group called?",
        options: ["Kasubkabe Heroes", "Futaba Heroes", "Kasukabe Defence Group", "Action Squad Kids"],
        answer: 2, // Kasukabe Defence Group
        timer: 10
    },
    {
        section: "Section 2 — Keep 'em Guessing",
        type: "mcq",
        question: "Where does Shinchan study?",
        options: ["Futaba Elementary", "Kasukabe School", "Futaba Kindergarten", "Kasukabe Academy"],
        answer: 2, // Futaba Kindergarten
        timer: 10
    },
    // Section 3 — Emoji Guess Game (15s timer each)
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "🚢💧🧊",
        images: ["/assets/titanic.png"],
        answer: "Titanic",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "A❤️ + HARD",
        images: ["/assets/adhm.png"],
        answer: "Ae Dil Hai Mushkil",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "🧊🎲 + 👑",
        images: ["/assets/frozen.png"],
        answer: "Frozen",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "🚆🧟🧟🇰🇷",
        images: ["/assets/train_to_busan.png"],
        answer: "Train to Busan",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "😵🍺 C 🧗🏡",
        images: ["/assets/nashe_se_chad_gaye.png"],
        answer: "Nashe Se Chad Gaye",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "🪦 + 😊",
        images: ["/assets/die_with_a_smile.png"],
        answer: "Die with a Smile",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "👶 + KA + ❤️",
        images: ["/assets/bachpan_ka_pyaar.png"],
        answer: "Bachpan Ka Pyaar",
        timer: 20
    },
    {
        section: "Section 3 — Emoji Guess Game",
        type: "emoji",
        question: "🏃 + 😄 + 👧",
        images: ["/assets/steal_my_girl.png"],
        answer: "Steal My Girl",
        timer: 20
    }
];
