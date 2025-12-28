// Firebase Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js";

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
    const app = initializeApp(firebaseConfig);

    // Initialize App Check with correct reCAPTCHA v3 Site Key
    try {
        const appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider('6LcJXzcsAAAAAFROW8bD5BTJV4Lx3_CjzzelPWua'),
            isTokenAutoRefreshEnabled: true
        });
        console.log("✅ App Check initialized successfully");
    } catch(appCheckError) {
        console.warn("⚠️ App Check initialization failed:", appCheckError);
    }

    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("✅ Firebase initialized successfully");
} catch(e) {
    console.warn("⚠️ Firebase initialization failed - running in demo mode", e);
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
        'auth/email-already-in-use': 'Diese E-Mail-Adresse wird bereits verwendet.',
        'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
        'auth/operation-not-allowed': 'Vorgang nicht erlaubt.',
        'auth/weak-password': 'Das Passwort ist zu schwach (mind. 6 Zeichen).',
        'auth/user-disabled': 'Dieser Benutzer wurde deaktiviert.',
        'auth/user-not-found': 'Benutzer nicht gefunden.',
        'auth/wrong-password': 'Falsches Passwort.',
        'auth/too-many-requests': 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
        'auth/network-request-failed': 'Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.'
    };
    return errorMessages[errorCode] || 'Ein unbekannter Fehler ist aufgetreten.';
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
        console.error('LocalStorage save failed:', e);
    }
};

// Load Cart from LocalStorage
export const loadCartFromLocalStorage = () => {
    try {
        const saved = localStorage.getItem('apex-cart');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error('LocalStorage load failed:', e);
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

    // Dispatch custom event for view changes (used by app.js to load orders on dashboard)
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
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
    const btn = document.getElementById('mobile-menu-btn');
    const icon = document.getElementById('mobile-menu-icon');
    if(!menu) return;

    const isOpen = !menu.classList.contains('hidden');

    if (isOpen) {
        // Schließen
        menu.classList.add('hidden');
        btn?.setAttribute('aria-expanded', 'false');
        btn?.setAttribute('aria-label', 'Menü öffnen');
        icon?.classList.remove('fa-times');
        icon?.classList.add('fa-bars');
        document.body.style.overflow = '';
    } else {
        // Öffnen
        menu.classList.remove('hidden');
        btn?.setAttribute('aria-expanded', 'true');
        btn?.setAttribute('aria-label', 'Menü schließen');
        icon?.classList.remove('fa-bars');
        icon?.classList.add('fa-times');
        document.body.style.overflow = 'hidden'; // Verhindert Scrollen im Hintergrund
    }
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

export function toggleSection(id) {
    const element = document.getElementById(id);
    const icon = document.getElementById(`${id}-icon`);
    if(!element) return;

    element.classList.toggle('hidden');
    if(icon) {
        icon.classList.toggle('rotate-180');
    }
}
