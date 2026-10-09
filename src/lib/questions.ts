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
    // Section 1 — Marvel Trivia (15s timer each)
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "What is Thor's hammer called?",
        options: ["Stormbreaker", "Mjölnir", "Gungnir", "Excalibur"],
        images: ["/assets/marvel_1.webp"],
        answer: 1, // Mjölnir
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Who is the God of Mischief?",
        options: ["Loki", "Thor", "Odin", "Vision"],
        images: ["/assets/marvel_5.webp"],
        answer: 0, // Loki
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "How many Infinity Stones are there?",
        options: ["4", "5", "6", "7"],
        images: ["/assets/marvel_3.webp"],
        answer: 2, // 6
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "What is Captain America's shield primarily made of?",
        options: ["Vibranium", "Adamantium", "Titanium", "Uru"],
        images: ["/assets/marvel_4.webp"],
        answer: 0, // Vibranium
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Who carries the title 'Sorcerer Supreme'?",
        options: ["Loki", "Doctor Strange", "Wong", "Thor"],
        images: ["/assets/marvel_2.webp"],
        answer: 1, // Doctor Strange
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Who is Thor's father?",
        options: ["Thanos", "Odin", "Loki", "Heimdall"],
        images: ["/assets/marvel_6.webp"],
        answer: 1, // Odin
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "What is Hawkeye's real name?",
        options: ["Clint Barton", "Sam Wilson", "Bucky Barnes", "Scott Lang"],
        images: ["/assets/marvel_7.webp"],
        answer: 0, // Clint Barton
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Who is known as the 'Merc with a Mouth'?",
        options: ["Deadpool", "Wolverine", "Loki", "Star-Lord"],
        images: ["/assets/marvel_10.webp"],
        answer: 0, // Deadpool
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Which Infinity Stone is inside Vision's forehead?",
        options: ["Time Stone", "Mind Stone", "Power Stone", "Reality Stone"],
        images: ["/assets/marvel_9.webp"],
        answer: 1, // Mind Stone
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Which character is known as the 'First Avenger'?",
        options: ["Iron Man", "Thor", "Captain America", "Hulk"],
        images: ["/assets/marvel_8.webp"],
        answer: 2, // Captain America
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "Who created Ultron in the MCU?",
        options: ["Tony Stark and Bruce Banner", "Thor and Loki", "Steve Rogers and Bucky", "Nick Fury and Coulson"],
        images: ["/assets/marvel_11.webp"],
        answer: 0, // Tony Stark and Bruce Banner
        timer: 15
    },
    {
        section: "Section 1 — Marvel Trivia",
        type: "mcq",
        question: "What is the name of Thor's axe?",
        options: ["Mjölnir", "Stormbreaker", "Gungnir", "Necrosword"],
        images: ["/assets/marvel_12.webp"],
        answer: 1, // Stormbreaker
        timer: 15
    },
    
    // Section 2 — Tech Crowd Buster (15s timer each)
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "When your internet suddenly stops working, which device is most likely responsible for connecting your home devices to the network?",
        options: ["Router", "Microwave", "Refrigerator", "Television"],
        answer: 0, // Router
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which computer component temporarily holds the information your running programs need?",
        options: ["RAM", "SSD", "Keyboard", "The computer's emotional support system"],
        answer: 0, // RAM
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which shortcut usually means 'Undo'?",
        options: ["Ctrl + Z", "Ctrl + Y", "Ctrl + OMG", "Alt + F4 and disappear"],
        answer: 0, // Ctrl + Z
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which one of these is actually used by programmers to write software?",
        options: ["Python", "Cobra", "Crocodile", "Komodo Dragon"],
        answer: 0, // Python
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which password would make a hacker's life the most difficult?",
        options: ["123456", "password", "myname123", "T#9vL!72qP@4x"],
        answer: 3, // T#9vL!72qP@4x
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "What kind of cyberattack commonly uses fake messages to trick people into revealing sensitive information?",
        options: ["Phishing", "Fishing", "Swimming", "Net surfing"],
        answer: 0, // Phishing
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which of these is designed for long-term storage of your files?",
        options: ["SSD", "CPU", "RAM", "Your friend's WhatsApp chat"],
        answer: 0, // SSD
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "What does HTTPS primarily indicate?",
        options: ["The website is guaranteed to be safe", "The connection is secured using HTTPS", "The website belongs to the government", "The website has passed a lie detector test"],
        answer: 1, // The connection is secured using HTTPS
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "What does a computer mouse primarily control?",
        options: ["The cursor/pointer", "The Wi-Fi signal", "The computer's temperature", "Actual mice inside the computer"],
        answer: 0, // The cursor/pointer
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "When an AI system learns patterns from huge amounts of data and uses them to generate responses, what field are we generally talking about?",
        options: ["Artificial Intelligence", "Artificial Imagination", "Automatic Intern", "Advanced Google"],
        answer: 0, // Artificial Intelligence
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which is the most reasonable first troubleshooting step if an application has completely frozen?",
        options: ["Restart the application/system if appropriate", "Hit the laptop", "Start shouting 'WORK!'", "Blame the person sitting next to you"],
        answer: 0, // Restart the application/system if appropriate
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which component actually stores the electrical energy used to power your phone?",
        options: ["Battery", "RAM", "SIM card", "Your prayers"],
        answer: 0, // Battery
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Who helps translate a website name into an IP address?",
        options: ["DNS", "GPS", "USB", "Your Wi-Fi password"],
        answer: 0, // DNS
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Which action is actually useful when troubleshooting a slow Wi-Fi connection?",
        options: ["Check the network connection and connected devices", "Hit the router", "Move the router closer to the television", "Give the router a motivational speech"],
        answer: 0, // Check the network connection and connected devices
        timer: 15
    },
    {
        section: "Section 2 — Tech Crowd Buster",
        type: "mcq",
        question: "Your friend sends you a photo on WhatsApp. Where did that image actually have to travel before reaching your phone?",
        options: ["Through a network", "Through the air using magic", "Directly from your friend's phone into your eyes", "Your friend's phone telepathically sent it"],
        answer: 0, // Through a network
        timer: 15
    }
];
