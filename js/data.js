// Sample Data (Fallback wenn Firestore leer)

export const sampleCoaches = [
    {
        id: "101",
        name: "Dr. Markus T.",
        role: "CIO @ DAX30",
        industry: "tech",
        price: 350,
        image: "https://randomuser.me/api/portraits/men/32.jpg",
        bio: "15 Jahre Erfahrung in globalen IT-Transformationen.",
        expertise: ["Strategy", "IT"],
        stats: "20y Exp"
    },
    {
        id: "102",
        name: "Sarah L.",
        role: "VP Sales",
        industry: "tech",
        price: 350,
        image: "https://randomuser.me/api/portraits/women/44.jpg",
        bio: "Sales Expert für SaaS Scale-Ups.",
        expertise: ["Sales", "Growth"],
        stats: "100M Revenue"
    },
    {
        id: "103",
        name: "Johannes B.",
        role: "CFO",
        industry: "finance",
        price: 400,
        image: "https://randomuser.me/api/portraits/men/85.jpg",
        bio: "Fokus auf M&A und Corporate Finance.",
        expertise: ["M&A", "Finance"],
        stats: "15 Deals"
    },
    {
        id: "104",
        name: "Elena R.",
        role: "COO",
        industry: "automotive",
        price: 380,
        image: "https://randomuser.me/api/portraits/women/68.jpg",
        bio: "Operative Exzellenz in globalen Konzernen.",
        expertise: ["Operations", "Supply Chain", "Lean"],
        stats: "Global Teams"
    },
    {
        id: "105",
        name: "Christian K.",
        role: "Ex-CTO",
        industry: "tech",
        price: 350,
        image: "https://randomuser.me/api/portraits/men/22.jpg",
        bio: "Tech-Strategie und Produktentwicklung für High-Growth Startups.",
        expertise: ["Tech Strategy", "Product", "Agile"],
        stats: "2 Exits"
    },
    {
        id: "106",
        name: "Petra M.",
        role: "CHRO",
        industry: "finance",
        price: 350,
        image: "https://randomuser.me/api/portraits/women/33.jpg",
        bio: "Strategisches HR-Management und Talententwicklung.",
        expertise: ["HR Strategy", "Talent", "Culture"],
        stats: "30 Jahre Exp"
    }
];

export const sampleArticles = [
    {
        id: "a1",
        cat: "Leadership",
        title: "Boardroom Dynamics",
        preview: "Die ungeschriebenen Gesetze.",
        image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800",
        content: "<p>Erfolgreiche Führung im Boardroom erfordert mehr als fachliche Kompetenz. Es geht um Soft Skills, Timing und die Fähigkeit, komplexe Botschaften prägnant zu vermitteln.</p>"
    },
    {
        id: "a2",
        cat: "Career",
        title: "Der 200k CV",
        preview: "Strategie statt Historie.",
        image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800",
        content: "<p>Ein CV für das Executive-Level ist kein chronologischer Lebenslauf. Es ist ein strategisches Dokument, das Ihre Unique Value Proposition in 30 Sekunden vermittelt.</p>"
    },
    {
        id: "a3",
        cat: "Trends",
        title: "AI im Management",
        preview: "Gefahr oder Chance?",
        image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=800",
        content: "<p>Künstliche Intelligenz verändert die Arbeitswelt radikal. Doch wie können Führungskräfte AI nutzen, ohne sich selbst obsolet zu machen?</p>"
    }
];
