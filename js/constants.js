// Karriaro - Constants Module
// Extrahiert aus app.js als erster Schritt des Monolith-Splits

// Environment Detection
export const IS_PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

// Order Status Constants
export const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Admin Emails (fallback - primary source is Custom Claims)
export const ADMIN_EMAILS = ['muammer.kizilaslan@gmail.com'];

// File Size Limits (in bytes)
export const FILE_LIMITS = {
    PROFILE_PICTURE: 5 * 1024 * 1024,    // 5MB
    USER_DOCUMENT: 10 * 1024 * 1024,      // 10MB
    ADMIN_DOCUMENT: 20 * 1024 * 1024      // 20MB
};

// Allowed File Types
export const ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// Pagination Settings
export const PAGINATION = {
    USERS_PER_PAGE: 20,
    ORDERS_PER_PAGE: 15,
    CALLS_PER_PAGE: 15,
    DOCS_PER_PAGE: 20,
    COACHES_PER_PAGE: 12
};

// Package Configuration (Single Source of Truth)
export const PACKAGES = {
    // === CV PAKETE ===
    highPotential: {
        id: 'high-potential',
        name: 'High-Potential CV',
        subtitle: 'Young Professionals',
        targetGroup: 'Berufseinsteiger · Young Professionals',
        price: 249,
        description: 'Für Talente am Anfang ihrer Karriere.',
        features: [
            'Kompakter Premium-CV (2 Seiten)',
            'ATS-optimiert',
            'Template-Anschreiben'
        ],
        extras: '1 Feedbackrunde · Abnahmegarantie',
        delivery: '3-5 Werktage',
        revisions: 1,
        strategyCall: null,
        faqDescription: 'Kompaktes Einstiegspaket für Young Professionals. Enthält professionellen CV mit ATS-Optimierung und Template-Anschreiben.'
    },
    seniorProfessional: {
        id: 'senior-professional',
        name: 'Senior Professional',
        subtitle: 'Manager · Senior Experts',
        targetGroup: 'Manager · Senior Experts',
        price: 490,
        description: 'Für Experten, die ihre Strategie schärfen wollen.',
        features: [
            '30 Min. Strategie-Gespräch',
            'Premium-CV + Anschreiben',
            'LinkedIn-Profil Audit'
        ],
        extras: '2 Feedbackrunden · Abnahmegarantie',
        delivery: '5-7 Werktage',
        revisions: 2,
        strategyCall: 30,
        faqDescription: 'Erweitert um USP-Erarbeitung, LinkedIn Profil-Audit, individuelles Anschreiben und Interview-Guide. Für erfahrene Professionals.'
    },
    executiveCSuite: {
        id: 'executive-csuite',
        name: 'Executive & C-Level',
        subtitle: 'Director · VP · C-Level',
        targetGroup: 'Director · VP · C-Level',
        price: 990,
        description: 'Für Führungskräfte mit Board-Ambitionen.',
        features: [
            '60 Min. Executive-Strategie',
            'Board CV + Executive Bio',
            'LinkedIn Premium-Optimierung'
        ],
        extras: 'Unbegrenzte Korrekturen · 30 Tage Support',
        delivery: '7-10 Werktage',
        revisions: 'Unbegrenzt',
        strategyCall: 60,
        faqDescription: 'Das Premium-Paket für C-Level. Inkl. Executive Bio, Board-Ready One-Pager, LinkedIn Rebranding und Headhunter-Intros.'
    },

    // === MENTORING PAKETE ===
    mentoringSingle: {
        id: 'mentoring-single',
        name: 'Single Session',
        price: 350,
        priceNote: 'Einmalig · zzgl. MwSt.',
        features: [
            '60 Min Video-Call',
            'Direkt mit Muammer',
            'Schriftliches Summary'
        ]
    },
    mentoring3Sessions: {
        id: 'mentoring-3-sessions',
        name: '3-Session Paket',
        price: 950,
        priceNote: 'Einmalig · €317/Session · zzgl. MwSt.',
        idealFor: 'Jobwechsel, Gehaltsverhandlung, Interview-Training, die ersten 100 Tage im neuen Job.',
        features: [
            '3× 60 Min über 3 Monate',
            'Persönliche Betreuung durchgehend',
            'E-Mail-Support zwischen Sessions'
        ],
        recommended: true
    },
    mentoringRetainer: {
        id: 'mentoring-retainer',
        name: 'Executive Retainer',
        price: 2500,
        priceNote: 'pro Monat · min. 6 Monate',
        features: [
            'Priority Access & Direct Line',
            'Unbegrenzter Zugang',
            'Netzwerk-Intros & Krisenintervention'
        ],
        isInquiry: true
    }
};

// Bundle-Konfiguration
export const BUNDLES = {
    seniorBundle: {
        id: 'senior-bundle',
        name: 'Executive Transformation: Senior CV + 3 Mentoring-Sessions',
        shortName: 'Senior Bundle',
        cvPackage: 'seniorProfessional',
        mentoringPackage: 'mentoring3Sessions',
        price: 1299,
        get regularPrice() {
            return PACKAGES[this.cvPackage].price + PACKAGES[this.mentoringPackage].price;
        },
        get savings() {
            return this.regularPrice - this.price;
        }
    },
    cSuiteBundle: {
        id: 'csuite-bundle',
        name: 'Executive Transformation: C-Suite CV + 3 Mentoring-Sessions',
        shortName: 'C-Suite Bundle',
        cvPackage: 'executiveCSuite',
        mentoringPackage: 'mentoring3Sessions',
        price: 1799,
        extras: 'Executive Bio + Board-Ready One-Pager',
        get regularPrice() {
            return PACKAGES[this.cvPackage].price + PACKAGES[this.mentoringPackage].price;
        },
        get savings() {
            return this.regularPrice - this.price;
        }
    }
};

// Hilfsfunktion zum Formatieren von Preisen
export function formatPrice(price) {
    return price.toLocaleString('de-DE');
}

// Production Logger
export const logger = {
    log: (...args) => { if (!IS_PRODUCTION) console.log(...args); },
    warn: (...args) => { if (!IS_PRODUCTION) console.warn(...args); },
    error: (...args) => console.error(...args),
    debug: (...args) => { if (!IS_PRODUCTION) console.debug(...args); }
};
