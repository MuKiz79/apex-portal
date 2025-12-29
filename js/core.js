// Firebase Configuration & Initialization - v2.1
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
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
    logger.log("✅ Firebase initialized successfully");
    logger.log("   auth:", auth ? "OK" : "MISSING");
    logger.log("   db:", db ? "OK" : "MISSING");
    logger.log("   storage:", storage ? "OK" : "MISSING");
} catch(e) {
    logger.error("❌ Firebase initialization failed:", e);
    logger.warn("⚠️ Running in demo mode - no data will load");
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
    return password && password.length >= 6;
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
        'auth/weak-password': 'Das Passwort ist zu schwach. Bitte wählen Sie mindestens 6 Zeichen.',

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

export function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));

    // Show target view
    const target = document.getElementById('view-' + viewId);
    if(target) target.classList.remove('hidden');

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
