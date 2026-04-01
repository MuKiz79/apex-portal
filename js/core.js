// Firebase Configuration & Initialization - v2.2
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, browserSessionPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// Environment Detection
const IS_PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

// Production Logger
const logger = {
    log: (...args) => { if (!IS_PRODUCTION) console.log(...args); },
    warn: (...args) => { if (!IS_PRODUCTION) console.warn(...args); },
    error: (...args) => console.error(...args),
    debug: (...args) => { if (!IS_PRODUCTION) console.debug(...args); }
};

const firebaseConfig = {
    apiKey: "AIzaSyBZ970mA7-2pJzhbxyFjjmzO97YKZhrSmU",
    authDomain: "apex-executive.firebaseapp.com",
    projectId: "apex-executive",
    storageBucket: "apex-executive.firebasestorage.app",
    messagingSenderId: "525553082138",
    appId: "1:525553082138:web:84d1437b2e150f5fb316a3",
    measurementId: "G-8K4T9MXEZ8"
};

// Initialize Firebase
let auth, db, storage;
try {
    logger.log("🔄 Initializing Firebase...");
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Session-Persistenz: Session wird beim Schließen des Browsers beendet
    setPersistence(auth, browserSessionPersistence)
        .then(() => logger.log("✅ Session persistence set to browser session"))
        .catch((err) => logger.error("❌ Failed to set persistence:", err));

    logger.log("✅ Firebase initialized successfully");
    logger.log("   auth:", auth ? "OK" : "MISSING");
    logger.log("   db:", db ? "OK" : "MISSING");
    logger.log("   storage:", storage ? "OK" : "MISSING");
} catch(e) {
    logger.error("❌ Firebase initialization failed:", e);
    logger.warn("⚠️ Running in demo mode - no data will load");
}

// ========== SESSION TIMEOUT (15 Minuten Inaktivität) ==========
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minuten
let sessionTimeoutId = null;
let lastActivityTime = Date.now();

function resetSessionTimeout() {
    lastActivityTime = Date.now();

    if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
    }

    // Nur wenn ein Nutzer eingeloggt ist
    if (auth?.currentUser) {
        sessionTimeoutId = setTimeout(async () => {
            logger.log("⏰ Session timeout - automatische Abmeldung");
            try {
                await signOut(auth);
                // Zeige Timeout-Nachricht
                const toast = document.getElementById('toast');
                if (toast) {
                    toast.textContent = 'Sie wurden aus Sicherheitsgründen automatisch abgemeldet.';
                    toast.classList.remove('translate-y-20');
                    setTimeout(() => toast.classList.add('translate-y-20'), 5000);
                }
                // Zurück zur Startseite
                window.location.href = '/';
            } catch (e) {
                logger.error("❌ Logout failed:", e);
            }
        }, SESSION_TIMEOUT_MS);
    }
}

// Aktivitäts-Listener registrieren
function initSessionTimeout() {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            // Debounce: Nur alle 30 Sekunden neu starten
            if (Date.now() - lastActivityTime > 30000) {
                resetSessionTimeout();
            }
        }, { passive: true });
    });

    // Initial starten wenn Nutzer eingeloggt
    onAuthStateChanged(auth, (user) => {
        if (user) {
            resetSessionTimeout();
        } else {
            if (sessionTimeoutId) {
                clearTimeout(sessionTimeoutId);
                sessionTimeoutId = null;
            }
        }
    });
}

// Session Timeout initialisieren
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionTimeout);
    } else {
        initSessionTimeout();
    }
}

export { auth, db, storage, onAuthStateChanged };
// Utility Functions

// Validate Email Format
export const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

// Validate Password Strength
export const validatePassword = (password) => {
    if (!password || password.length < 8) return { valid: false, score: 0, message: 'Mindestens 8 Zeichen erforderlich.' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    if (!hasLower || !hasUpper) return { valid: false, score, message: 'Groß- und Kleinbuchstaben erforderlich.' };
    if (!hasDigit) return { valid: false, score, message: 'Mindestens eine Zahl erforderlich.' };
    if (!hasSpecial) return { valid: false, score, message: 'Mindestens ein Sonderzeichen erforderlich.' };

    return { valid: true, score, message: '' };
};

export const getPasswordStrengthLabel = (score) => {
    if (score <= 1) return { label: 'Schwach', color: 'red' };
    if (score <= 2) return { label: 'Mittel', color: 'yellow' };
    if (score <= 3) return { label: 'Gut', color: 'blue' };
    return { label: 'Sehr stark', color: 'green' };
};

// Sanitize HTML to prevent XSS
export const sanitizeHTML = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// Get Firebase Error Message in German
export const getFirebaseErrorMessage = (errorCode) => {
    const errorMessages = {
        // Login Errors
        'auth/invalid-credential': 'Die eingegebenen Anmeldedaten sind ungültig. Bitte überprüfen Sie E-Mail und Passwort.',
        'auth/invalid-login-credentials': 'Die eingegebenen Anmeldedaten sind ungültig. Bitte überprüfen Sie E-Mail und Passwort.',
        'auth/invalid-email': 'Die E-Mail-Adresse hat ein ungültiges Format.',
        'auth/user-disabled': 'Dieses Benutzerkonto wurde deaktiviert. Bitte kontaktieren Sie unseren Support.',
        'auth/user-not-found': 'Es existiert kein Konto mit dieser E-Mail-Adresse.',
        'auth/wrong-password': 'Das eingegebene Passwort ist nicht korrekt.',

        // Registration Errors
        'auth/email-already-in-use': 'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
        'auth/operation-not-allowed': 'Diese Anmeldemethode ist derzeit nicht verfügbar.',
        'auth/weak-password': 'Das Passwort ist zu schwach. Mindestens 8 Zeichen mit Groß-/Kleinbuchstaben, Zahl und Sonderzeichen.',

        // Rate Limiting
        'auth/too-many-requests': 'Zu viele Anmeldeversuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.',

        // Network
        'auth/network-request-failed': 'Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung.',

        // Password Reset
        'auth/expired-action-code': 'Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.',
        'auth/invalid-action-code': 'Dieser Link ist ungültig oder wurde bereits verwendet.',

        // Generic
        'auth/internal-error': 'Ein technischer Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
        'auth/requires-recent-login': 'Aus Sicherheitsgründen müssen Sie sich erneut anmelden.'
    };
    return errorMessages[errorCode] || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
};

// Show Toast Notification
export const showToast = (message, duration = 2500) => {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove('translate-y-20');

    setTimeout(() => {
        toast.classList.add('translate-y-20');
    }, duration);
};

// Debounce Function (Performance Optimization)
export const debounce = (func, delay = 300) => {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

// Throttle Function (Performance Optimization)
export const throttle = (func, limit = 100) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Real-time Email Validation Feedback
export const validateEmailRealtime = (email) => {
    if (!email) return { valid: false, message: '' };
    if (!validateEmail(email)) {
        return { valid: false, message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' };
    }
    return { valid: true, message: '✓ Gültige E-Mail-Adresse' };
};

// Real-time Password Match Feedback
export const validatePasswordMatch = (password, confirmPassword) => {
    if (!confirmPassword) return { valid: false, message: '' };
    if (password !== confirmPassword) {
        return { valid: false, message: 'Die Passwörter stimmen nicht überein.' };
    }
    return { valid: true, message: '✓ Passwörter stimmen überein' };
};

// Save Cart to LocalStorage
export const saveCartToLocalStorage = (cart) => {
    try {
        localStorage.setItem('apex-cart', JSON.stringify(cart));
    } catch (e) {
        logger.error('LocalStorage save failed:', e);
    }
};

// Load Cart from LocalStorage
export const loadCartFromLocalStorage = () => {
    try {
        const saved = localStorage.getItem('apex-cart');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        logger.error('LocalStorage load failed:', e);
        return [];
    }
};
// Navigation Functions

// SEO Meta-Daten pro View
const VIEW_META = {
    home: { title: 'Karriaro – Premium CV & Executive Mentoring', description: 'Handgefertigte Bewerbungsunterlagen und Executive Mentoring für Führungskräfte. CV-Manufaktur mit persönlicher Beratung.' },
    about: { title: 'Über mich – Karriaro', description: 'Muammer Kizilaslan – VP IT & Digital, ehem. CDO & Vorstand. Persönliche Karriereberatung aus der Perspektive eines aktiven C-Level Executives.' },
    journal: { title: 'Karriere-Insights – Karriaro Blog', description: 'Aktuelle Artikel zu Karriereentwicklung, Bewerbungsstrategien und Executive Coaching.' },
    'inner-circle': { title: 'Inner Circle – Karriaro', description: 'Der exklusive Inner Circle für Führungskräfte. Netzwerk, Opportunities und persönliche Weiterentwicklung.' },
    'package-details': { title: 'CV-Pakete im Detail – Karriaro', description: 'Meine CV-Pakete im Überblick: High-Potential, Senior Professional und Executive C-Suite.' },
    dashboard: { title: 'Mein Dashboard – Karriaro', description: 'Ihr persönlicher Bereich: Bestellungen, Dokumente, Termine und Profil.' },
    impressum: { title: 'Impressum – Karriaro', description: 'Impressum und rechtliche Angaben der Karriaro Plattform.' },
    datenschutz: { title: 'Datenschutz – Karriaro', description: 'Datenschutzerklärung der Karriaro Plattform gemäß DSGVO.' },
    agb: { title: 'AGB – Karriaro', description: 'Allgemeine Geschäftsbedingungen der Karriaro Plattform.' },
    login: { title: 'Anmelden – Karriaro', description: 'Melden Sie sich bei Karriaro an oder erstellen Sie ein neues Konto.' },
    admin: { title: 'Admin – Karriaro', description: '' }
};

let _navigatingFromHash = false;

export function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));

    // Show target view
    const target = document.getElementById('view-' + viewId);
    if(target) target.classList.remove('hidden');

    // Hash-Routing: URL aktualisieren (ohne hashchange-Loop)
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== viewId && !_navigatingFromHash) {
        history.pushState(null, '', '#' + viewId);
    }
    _navigatingFromHash = false;

    // Dynamische Meta-Tags für SEO
    const meta = VIEW_META[viewId];
    if (meta) {
        document.title = meta.title;
        const descTag = document.querySelector('meta[name="description"]');
        if (descTag && meta.description) descTag.setAttribute('content', meta.description);
        const canonicalTag = document.querySelector('link[rel="canonical"]');
        if (canonicalTag) canonicalTag.setAttribute('href', `https://karriaro.de/#${viewId}`);
    }

    // Update nav visibility
    const navLinks = document.getElementById('nav-links');
    const publicViews = ['home','about','journal','impressum','package-details','article-detail','coach-detail'];

    if(publicViews.includes(viewId)) {
        navLinks?.classList.remove('hidden');
        navLinks?.classList.add('md:flex');
    } else {
        navLinks?.classList.add('hidden');
        navLinks?.classList.remove('md:flex');
    }

    window.scrollTo({top: 0, behavior: 'smooth'});
}

// Hash-Change-Listener für Browser-Navigation (Back/Forward)
if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            _navigatingFromHash = true;
            navigateTo(hash);
        }
    });

    // Initialen Hash bei Seitenlade auslesen
    window.addEventListener('DOMContentLoaded', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            _navigatingFromHash = true;
            navigateTo(hash);
        }
    });
}

export function scrollToSection(id) {
    const isHomeHidden = document.getElementById('view-home')?.classList.contains('hidden');

    if(isHomeHidden) {
        navigateTo('home');
        setTimeout(() => {
            document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
        }, 100);
    } else {
        document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
    }
}

export function navigateToSection(viewId, sectionId) {
    navigateTo(viewId);
    setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({behavior:'smooth', block: 'start'});
    }, 100);
}

export function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if(!menu) return;

    menu.classList.toggle('hidden');
    menu.classList.toggle('flex');
}

export function openPackageDetail() {
    navigateTo('package-details');
}

export function toggleFaq(id) {
    const element = document.getElementById(id);
    if(!element) return;

    const parent = element.parentElement;
    if(!parent) return;

    parent.classList.toggle('faq-open');

    const button = parent.querySelector('button');
    if(button) {
        const isOpen = parent.classList.contains('faq-open');
        button.setAttribute('aria-expanded', isOpen.toString());
    }
}

// Toggle collapsible sections (CV-Process, Mentoring-Process, etc.)
export function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if(!section) return;

    const isHidden = section.classList.contains('hidden');
    section.classList.toggle('hidden');

    // Rotate the chevron icon
    const icon = document.getElementById(sectionId + '-icon');
    if(icon) {
        if(isHidden) {
            icon.classList.add('rotate-180');
        } else {
            icon.classList.remove('rotate-180');
        }
    }
}

// ========== COOKIE CONSENT MANAGEMENT (DSGVO) ==========

// Get current cookie consent settings
export function getCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) return null;
    try {
        return JSON.parse(consent);
    } catch {
        return { necessary: true, functional: true, analytics: false, marketing: false };
    }
}

// Accept all cookies
export function acceptCookies() {
    const consent = {
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consent));
    hideCookieBanner();
}

// Decline optional cookies (only necessary)
export function declineCookies() {
    const consent = {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consent));
    hideCookieBanner();
}

// Show cookie settings panel
export function showCookieSettings() {
    const settingsPanel = document.getElementById('cookie-settings');
    if (settingsPanel) {
        settingsPanel.classList.remove('hidden');

        // Load existing preferences
        const consent = getCookieConsent();
        if (consent) {
            const functional = document.getElementById('cookie-functional');
            const analytics = document.getElementById('cookie-analytics');
            const marketing = document.getElementById('cookie-marketing');

            if (functional) functional.checked = consent.functional;
            if (analytics) analytics.checked = consent.analytics;
            if (marketing) marketing.checked = consent.marketing;
        }
    }
}

// Hide cookie settings panel
export function hideCookieSettings() {
    const settingsPanel = document.getElementById('cookie-settings');
    if (settingsPanel) {
        settingsPanel.classList.add('hidden');
    }
}

// Save custom cookie settings
export function saveCookieSettings() {
    const functional = document.getElementById('cookie-functional')?.checked || false;
    const analytics = document.getElementById('cookie-analytics')?.checked || false;
    const marketing = document.getElementById('cookie-marketing')?.checked || false;

    const consent = {
        necessary: true,
        functional,
        analytics,
        marketing,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consent));
    hideCookieBanner();
}

// Hide the cookie banner
function hideCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
        banner.classList.add('translate-y-full');
    }
}

// Show the cookie banner
export function showCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
        banner.classList.remove('translate-y-full');
    }
}

// Check if analytics is allowed
export function isAnalyticsAllowed() {
    const consent = getCookieConsent();
    return consent?.analytics === true;
}

// Check if marketing is allowed
export function isMarketingAllowed() {
    const consent = getCookieConsent();
    return consent?.marketing === true;
}

// Check cookie consent and show banner if needed
export function checkCookieConsent() {
    const consent = getCookieConsent();
    if (!consent) {
        // No consent given yet, show the banner
        showCookieBanner();
    }
}
