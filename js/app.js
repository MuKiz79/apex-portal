// APEX Executive - Application Module v2.1
// Contains: Auth, Cart, Dashboard, Coaches, Articles, Data, Password Reset

// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage, navigateTo } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, reload, applyActionCode } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, getMetadata, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { validateEmail, validatePassword, getFirebaseErrorMessage, showToast, sanitizeHTML, validateEmailRealtime, validatePasswordMatch, saveCartToLocalStorage, loadCartFromLocalStorage } from './core.js';
import { sampleArticles } from './data.js';

// ========== CONSTANTS ==========

// Environment Detection
const IS_PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

// Order Status Constants
const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Admin Emails (fallback - primary source is Firestore config/admins)
const ADMIN_EMAILS = ['muammer.kizilaslan@gmail.com'];

// Mentor State (will be set on login if user is a mentor)
let currentMentorData = null;

// File Size Limits (in bytes)
const FILE_LIMITS = {
    PROFILE_PICTURE: 5 * 1024 * 1024,    // 5MB
    USER_DOCUMENT: 10 * 1024 * 1024,      // 10MB
    ADMIN_DOCUMENT: 20 * 1024 * 1024      // 20MB
};

// Allowed File Types
const ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// Pagination Settings
const PAGINATION = {
    USERS_PER_PAGE: 20,
    ORDERS_PER_PAGE: 15,
    CALLS_PER_PAGE: 15,
    DOCS_PER_PAGE: 20
};

// Pagination State
const paginationState = {
    users: { page: 1, total: 0, data: [] },
    orders: { page: 1, total: 0, data: [] },
    calls: { page: 1, total: 0, data: [] },
    docs: { page: 1, total: 0, data: [] }
};

// Production Logger - suppresses logs in production
const logger = {
    log: (...args) => { if (!IS_PRODUCTION) console.log(...args); },
    warn: (...args) => { if (!IS_PRODUCTION) console.warn(...args); },
    error: (...args) => console.error(...args), // Always log errors
    debug: (...args) => { if (!IS_PRODUCTION) console.debug(...args); }
};

// ========== PAGINATION HELPERS ==========

function renderPagination(type) {
    const state = paginationState[type];
    const perPage = PAGINATION[`${type.toUpperCase()}_PER_PAGE`] || 20;
    const totalPages = Math.ceil(state.total / perPage);

    if (totalPages <= 1) return '';

    const pages = [];
    const currentPage = state.page;

    // Always show first page
    pages.push(1);

    // Show ellipsis and pages around current
    if (currentPage > 3) pages.push('...');

    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        if (!pages.includes(i)) pages.push(i);
    }

    // Show ellipsis and last page
    if (currentPage < totalPages - 2) pages.push('...');
    if (totalPages > 1 && !pages.includes(totalPages)) pages.push(totalPages);

    return `
        <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
            <div class="text-sm text-gray-400">
                Seite ${currentPage} von ${totalPages} (${state.total} Einträge)
            </div>
            <div class="flex items-center gap-1">
                <button onclick="app.changePage('${type}', ${currentPage - 1})"
                        class="px-3 py-1 rounded ${currentPage === 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition"
                        ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                ${pages.map(p => p === '...'
                    ? '<span class="px-2 text-gray-500">...</span>'
                    : `<button onclick="app.changePage('${type}', ${p})"
                              class="px-3 py-1 rounded ${p === currentPage ? 'bg-brand-gold text-brand-dark font-bold' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition">
                         ${p}
                       </button>`
                ).join('')}
                <button onclick="app.changePage('${type}', ${currentPage + 1})"
                        class="px-3 py-1 rounded ${currentPage === totalPages ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition"
                        ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

export function changePage(type, page) {
    const state = paginationState[type];
    const perPage = PAGINATION[`${type.toUpperCase()}_PER_PAGE`] || 20;
    const totalPages = Math.ceil(state.total / perPage);

    if (page < 1 || page > totalPages) return;

    state.page = page;

    // Re-render the appropriate list
    switch(type) {
        case 'users':
            renderAdminUsersList();
            break;
        case 'calls':
            renderStrategyCallsList();
            break;
    }
}

// ========== AUTHENTICATION ==========

export function toggleAuthMode(isLoginMode) {
    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');

    if(loginTab && registerTab) {
        loginTab.classList.toggle('border-brand-dark', isLoginMode);
        loginTab.classList.toggle('text-gray-400', !isLoginMode);
        registerTab.classList.toggle('border-brand-dark', !isLoginMode);
        registerTab.classList.toggle('border-b-2', !isLoginMode);
        registerTab.classList.toggle('text-gray-400', isLoginMode);
    }

    const loginFields = document.getElementById('login-fields');
    const registerFields = document.getElementById('register-fields');

    if(loginFields && registerFields) {
        loginFields.classList.toggle('hidden', !isLoginMode);
        registerFields.classList.toggle('hidden', isLoginMode);
    }

    const btn = document.getElementById('auth-submit-btn');
    if(btn) btn.innerText = isLoginMode ? "Anmelden" : "Kostenlos Registrieren";

    document.getElementById('auth-error')?.classList.add('hidden');

    // Hide password reset fields when switching modes
    document.getElementById('password-reset-fields')?.classList.add('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    document.getElementById('auth-submit-btn')?.classList.remove('hidden');
}

// Show Password Reset Form
export function showPasswordReset() {
    document.getElementById('login-fields')?.classList.add('hidden');
    document.getElementById('register-fields')?.classList.add('hidden');
    document.getElementById('password-reset-fields')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.add('hidden');
    document.getElementById('auth-submit-btn')?.classList.add('hidden');
    document.getElementById('auth-error')?.classList.add('hidden');
    document.getElementById('auth-success')?.classList.add('hidden');

    // Copy email from login field if present
    const loginEmail = document.getElementById('login-email')?.value;
    if (loginEmail) {
        const resetEmail = document.getElementById('reset-email');
        if (resetEmail) resetEmail.value = loginEmail;
    }
}

// Show Login Form (back from password reset)
export function showLoginForm() {
    document.getElementById('password-reset-fields')?.classList.add('hidden');
    document.getElementById('login-fields')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    document.getElementById('auth-submit-btn')?.classList.remove('hidden');
    document.getElementById('auth-error')?.classList.add('hidden');
    document.getElementById('auth-success')?.classList.add('hidden');
}

// Send Password Reset Email
export async function sendPasswordReset() {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');
    const resetBtn = document.getElementById('reset-submit-btn');
    const email = document.getElementById('reset-email')?.value?.trim();

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    if (!email || !validateEmail(email)) {
        if (errorDiv) {
            errorDiv.textContent = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Show loading state
    const originalText = resetBtn?.innerText;
    if (resetBtn) {
        resetBtn.innerText = 'Wird gesendet...';
        resetBtn.disabled = true;
    }

    try {
        if (!auth) {
            // Demo mode
            if (successDiv) {
                successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.';
                successDiv.classList.remove('hidden');
            }
            return;
        }

        await sendPasswordResetEmail(auth, email);

        if (successDiv) {
            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen an <strong>' + email + '</strong> gesendet. Bitte prüfen Sie auch Ihren Spam-Ordner.';
            successDiv.classList.remove('hidden');
        }

        showToast('E-Mail wurde gesendet');

    } catch (error) {
        logger.error('Password reset error:', error);
        // For security, always show success message (don't reveal if email exists)
        if (successDiv) {
            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte prüfen Sie auch Ihren Spam-Ordner.';
            successDiv.classList.remove('hidden');
        }
    } finally {
        if (resetBtn) {
            resetBtn.innerText = originalText || 'Link senden';
            resetBtn.disabled = false;
        }
    }
}

// Check URL for password reset code or email verification and handle it
export async function handlePasswordResetFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
        // Show the new password form
        showNewPasswordForm(oobCode);
        return true;
    }

    if (mode === 'verifyEmail' && oobCode) {
        // Handle email verification
        await handleEmailVerification(oobCode);
        return true;
    }

    return false;
}

// Handle email verification from URL
async function handleEmailVerification(oobCode) {
    logger.log('📧 Handling email verification with oobCode:', oobCode ? 'present' : 'missing');

    // Navigate to login view
    navigateTo('login');

    try {
        if (!auth) {
            throw new Error('Auth nicht verfügbar');
        }

        // Apply the action code to verify the email
        await applyActionCode(auth, oobCode);

        logger.log('✅ Email verification successful');

        // Show success message
        setTimeout(() => {
            const successDiv = document.getElementById('auth-success');
            const authForm = document.getElementById('auth-form');
            const authTabs = document.getElementById('auth-tabs');

            if (authForm) authForm.classList.add('hidden');
            if (authTabs) authTabs.classList.add('hidden');

            if (successDiv) {
                successDiv.innerHTML = `
                    <div class="text-center py-6 px-4">
                        <div class="mb-6">
                            <i class="fas fa-check-circle text-5xl text-green-500 mb-4 block"></i>
                            <h3 class="text-2xl font-serif text-brand-dark mb-3">E-Mail bestätigt!</h3>
                        </div>

                        <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-6 text-left">
                            <p class="text-gray-700 mb-3">
                                Ihre E-Mail-Adresse wurde erfolgreich verifiziert.
                            </p>
                            <p class="text-sm text-gray-600">
                                Sie können sich jetzt mit Ihrem Konto anmelden.
                            </p>
                        </div>

                        <button
                            onclick="app.resetAuthToLogin()"
                            class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition"
                        >
                            Jetzt anmelden
                        </button>
                    </div>
                `;
                successDiv.classList.remove('hidden');
            }

            showToast('✅ E-Mail erfolgreich verifiziert!');

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);

    } catch (error) {
        logger.error('❌ Email verification failed:', error);

        let errorMessage = 'Die E-Mail-Verifizierung ist fehlgeschlagen.';

        if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Der Verifizierungslink ist ungültig oder bereits verwendet worden.';
        } else if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Der Verifizierungslink ist abgelaufen. Bitte fordern Sie einen neuen an.';
        }

        setTimeout(() => {
            const errorDiv = document.getElementById('auth-error');
            if (errorDiv) {
                errorDiv.innerHTML = `
                    <div class="text-red-600 text-sm">
                        <p class="mb-2">${errorMessage}</p>
                        <p class="text-xs text-gray-600">Fehlercode: ${error.code || 'unbekannt'}</p>
                    </div>
                `;
                errorDiv.classList.remove('hidden');
            }
        }, 100);

        showToast('❌ ' + errorMessage);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Show the form to enter a new password
export function showNewPasswordForm(oobCode) {
    logger.log('🔑 showNewPasswordForm called with oobCode:', oobCode ? 'present' : 'missing');

    // Navigate to login view first
    logger.log('   Navigating to login view...');
    navigateTo('login');

    // Small delay to ensure view is visible
    setTimeout(() => {
        logger.log('   Hiding other fields...');

        // Hide login/register fields, show new password fields
        document.getElementById('login-fields')?.classList.add('hidden');
        document.getElementById('register-fields')?.classList.add('hidden');
        document.getElementById('password-reset-fields')?.classList.add('hidden');
        document.getElementById('auth-tabs')?.classList.add('hidden');
        document.getElementById('auth-submit-btn')?.classList.add('hidden');
        document.getElementById('auth-error')?.classList.add('hidden');
        document.getElementById('auth-success')?.classList.add('hidden');

        // Show new password form
        const newPasswordFields = document.getElementById('new-password-fields');
        logger.log('   new-password-fields element:', newPasswordFields ? 'found' : 'NOT FOUND');

        if (newPasswordFields) {
            newPasswordFields.classList.remove('hidden');
            // Store the oobCode for later use
            newPasswordFields.dataset.oobCode = oobCode;
            logger.log('✅ New password form is now visible');
        } else {
            logger.error('❌ new-password-fields element not found in DOM!');
        }
    }, 50);
}

// Confirm the new password
export async function confirmNewPassword() {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');
    const newPasswordFields = document.getElementById('new-password-fields');
    const submitBtn = document.getElementById('new-password-submit-btn');

    const oobCode = newPasswordFields?.dataset.oobCode;
    const newPassword = document.getElementById('new-password')?.value;
    const confirmPassword = document.getElementById('confirm-new-password')?.value;

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    // Validate passwords
    if (!newPassword || newPassword.length < 6) {
        if (errorDiv) {
            errorDiv.textContent = 'Das Passwort muss mindestens 6 Zeichen lang sein.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if (newPassword !== confirmPassword) {
        if (errorDiv) {
            errorDiv.textContent = 'Die Passwörter stimmen nicht überein.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Show loading state
    const originalText = submitBtn?.innerText;
    if (submitBtn) {
        submitBtn.innerText = 'Wird gespeichert...';
        submitBtn.disabled = true;
    }

    try {
        if (!auth || !oobCode) {
            throw new Error('Ungültiger Reset-Link');
        }

        // Verify the code first
        await verifyPasswordResetCode(auth, oobCode);

        // Confirm the password reset
        await confirmPasswordReset(auth, oobCode, newPassword);

        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);

        if (successDiv) {
            successDiv.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-check-circle text-green-500 text-4xl mb-4"></i>
                    <h3 class="text-lg font-bold text-brand-dark mb-2">Passwort erfolgreich geändert</h3>
                    <p class="text-gray-600 mb-4">Sie können sich jetzt mit Ihrem neuen Passwort anmelden.</p>
                </div>
            `;
            successDiv.classList.remove('hidden');
        }

        newPasswordFields?.classList.add('hidden');

        // Show login button
        setTimeout(() => {
            showLoginForm();
        }, 3000);

        showToast('Passwort erfolgreich geändert');

    } catch (error) {
        logger.error('Password reset confirmation error:', error);
        let errorMessage = getFirebaseErrorMessage(error.code);

        if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.';
        } else if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Dieser Link ist ungültig oder wurde bereits verwendet.';
        }

        if (errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.innerText = originalText || 'Passwort speichern';
            submitBtn.disabled = false;
        }
    }
}

// Handle Firebase email actions (verify email, reset password)
export async function handleEmailAction() {
    const fullUrl = window.location.href;
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    logger.log('🔗 handleEmailAction called');
    logger.log('   Full URL:', fullUrl);
    logger.log('   mode:', mode);
    logger.log('   oobCode:', oobCode ? oobCode.substring(0, 10) + '...' : 'missing');

    if (!mode || !oobCode) {
        logger.log('📝 No email action parameters found in URL');
        return;
    }

    if (mode === 'resetPassword') {
        logger.log('🔄 Password reset mode detected, showing form...');
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            showNewPasswordForm(oobCode);
        }, 100);
    } else if (mode === 'verifyEmail') {
        // Apply the verification code
        try {
            await applyActionCode(auth, oobCode);
            logger.log('✅ Email verified successfully');
            showToast('✅ E-Mail-Adresse wurde bestätigt! Sie können sich jetzt anmelden.');

            // Clean URL and navigate to login
            window.history.replaceState({}, document.title, window.location.pathname);
            navigateTo('login');
        } catch (error) {
            logger.error('❌ Email verification failed:', error);
            if (error.code === 'auth/invalid-action-code') {
                showToast('❌ Der Link ist ungültig oder wurde bereits verwendet.');
            } else if (error.code === 'auth/expired-action-code') {
                showToast('❌ Der Link ist abgelaufen. Bitte fordern Sie einen neuen an.');
            } else {
                showToast('❌ Verifizierung fehlgeschlagen: ' + error.message);
            }
            // Navigate to login anyway so user can request new verification
            navigateTo('login');
        }
    }
}

export async function handleAuth(isLoginMode, state, navigateTo) {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    try {
        if (isLoginMode) {
            // LOGIN
            const email = getVal('login-email');
            const password = getVal('login-password');

            if (!validateEmail(email)) throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
            if (!validatePassword(password)) throw new Error('Das Passwort muss mindestens 6 Zeichen lang sein.');

            if(!auth) {
                state.user = { email, uid: "demo-user" };
                updateAuthUI(state);
                showToast('✅ Erfolgreich angemeldet (Demo-Modus)');
                if(navigateTo) {
                    setTimeout(() => navigateTo('dashboard'), 500);
                }
                return;
            }

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Reload user to get latest emailVerified status from Firebase
            await reload(user);

            // Nach reload den aktuellen User aus auth.currentUser holen
            const currentUser = auth.currentUser;

            console.log('Email verified status:', currentUser?.emailVerified);

            if (!currentUser || !currentUser.emailVerified) {
                // Speichere Email für "erneut senden" Funktion
                window._pendingVerificationEmail = email;
                window._pendingVerificationPassword = password;
                await signOut(auth);

                // Zeige spezielle Fehlermeldung mit Option zum erneuten Senden
                const errorDiv = document.getElementById('auth-error');
                if (errorDiv) {
                    errorDiv.innerHTML = `
                        <div class="text-red-600 text-sm">
                            <p class="mb-2">Bitte bestätigen Sie erst Ihre E-Mail-Adresse.</p>
                            <p class="text-xs text-gray-600 mb-3">Prüfen Sie auch Ihren Spam-Ordner.</p>
                            <button
                                onclick="app.resendVerificationEmail()"
                                class="text-brand-gold underline text-xs font-semibold hover:text-brand-dark"
                            >
                                Bestätigungs-E-Mail erneut senden
                            </button>
                        </div>
                    `;
                    errorDiv.classList.remove('hidden');
                }
                return; // Nicht throw, damit die spezielle Fehlermeldung angezeigt wird
            }

            showToast('✅ Erfolgreich angemeldet');

            // Nach erfolgreichem Login zum Dashboard navigieren
            if(navigateTo) {
                setTimeout(() => navigateTo('dashboard'), 500);
            }

        } else {
            // REGISTRATION
            const firstname = getVal('reg-firstname');
            const lastname = getVal('reg-lastname');
            const email = getVal('reg-email');
            const pass = getVal('reg-password');
            const passConfirm = getVal('reg-password-confirm');

            if(!firstname || !lastname || !email || !pass) {
                throw new Error('Bitte alle Pflichtfelder (*) ausfüllen.');
            }
            if (!validateEmail(email)) throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
            if(pass !== passConfirm) throw new Error('Die Passwörter stimmen nicht überein.');
            if (!validatePassword(pass)) throw new Error('Das Passwort muss mindestens 6 Zeichen lang sein.');

            if(!auth) {
                // Demo Mode
                document.getElementById('auth-form')?.classList.add('hidden');
                document.getElementById('auth-tabs')?.classList.add('hidden');
                if(successDiv) {
                    successDiv.innerHTML = `<div class="text-center py-8"><i class="fas fa-envelope-open-text text-4xl text-brand-gold mb-4"></i><h3 class="text-xl font-serif text-brand-dark mb-2">Fast geschafft!</h3><p class="text-gray-600 mb-6">Demo-Modus: E-Mail-Bestätigung simuliert.</p><button onclick="app.resetAuthToLogin()" class="mt-6 text-brand-gold font-bold underline text-xs uppercase tracking-widest">Zurück zum Login</button></div>`;
                    successDiv.classList.remove('hidden');
                }
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            if(db) {
                await setDoc(doc(db, "users", user.uid), {
                    salutation: getVal('reg-salutation'),
                    title: getVal('reg-title'),
                    firstname, lastname, email,
                    phone: getVal('reg-phone'),
                    address: {
                        street: getVal('reg-street'),
                        houseno: getVal('reg-houseno'),
                        zip: getVal('reg-zip'),
                        city: getVal('reg-city')
                    },
                    role: 'member',
                    joined: new Date()
                });
            }

            await updateProfile(user, { displayName: `${firstname} ${lastname}` });

            // Send verification email with action URL
            const actionCodeSettings = {
                url: window.location.origin + window.location.pathname,
                handleCodeInApp: false
            };
            await sendEmailVerification(user, actionCodeSettings);
            await signOut(auth);

            document.getElementById('auth-form')?.classList.add('hidden');
            document.getElementById('auth-tabs')?.classList.add('hidden');

            if(successDiv) {
                successDiv.innerHTML = `
                    <div class="text-center py-6 px-4">
                        <div class="mb-6">
                            <i class="fas fa-envelope-open-text text-5xl text-brand-gold mb-4 block"></i>
                            <h3 class="text-2xl font-serif text-brand-dark mb-3">Fast geschafft!</h3>
                        </div>

                        <div class="bg-brand-light border-l-4 border-brand-gold p-4 mb-6 text-left">
                            <p class="text-gray-700 mb-3">
                                Wir haben eine Bestätigungs-E-Mail an<br>
                                <strong class="text-brand-dark">${sanitizeHTML(email)}</strong> gesendet.
                            </p>

                            <div class="text-sm text-gray-600 space-y-2">
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Prüfen Sie Ihr Postfach (auch Spam-Ordner)</p>
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Klicken Sie auf den Bestätigungslink in der E-Mail</p>
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Kehren Sie zurück und melden Sie sich an</p>
                            </div>
                        </div>

                        <button
                            onclick="app.resetAuthToLogin()"
                            class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition"
                        >
                            Zurück zum Login
                        </button>
                    </div>
                `;
                successDiv.classList.remove('hidden');
                successDiv.classList.remove('p-2', 'bg-green-50', 'border');
            }
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.code) errorMessage = getFirebaseErrorMessage(error.code);

        if(errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.classList.remove('hidden');
        }
    }
}

export async function handleLogout(state, navigateTo) {
    if(auth) await signOut(auth);
    state.user = null;
    updateAuthUI(state);
    navigateTo('home');
    showToast('✅ Erfolgreich abgemeldet');
}

export async function updateAuthUI(state) {
    const loginBtn = document.getElementById('nav-login-btn');
    const userProfile = document.getElementById('nav-user-profile');
    const dashUsername = document.getElementById('dash-username');
    const userNameDisplay = document.getElementById('user-name-display');
    const adminSection = document.getElementById('admin-section');
    const mentorSection = document.getElementById('mentor-section');
    const mentorTab = document.getElementById('dash-tab-mentor');

    if (state.user) {
        loginBtn?.classList.add('hidden');
        userProfile?.classList.remove('hidden');
        userProfile?.classList.add('flex');

        const displayName = state.user.displayName || state.user.email.split('@')[0];
        if(dashUsername) dashUsername.textContent = displayName;
        if(userNameDisplay) userNameDisplay.textContent = displayName.substring(0, 12) + (displayName.length > 12 ? '...' : '');

        // Show admin section only for admins
        if (adminSection) {
            if (isAdmin(state.user.email)) {
                adminSection.classList.remove('hidden');
            } else {
                adminSection.classList.add('hidden');
            }
        }

        // Check if user is a mentor
        await checkAndSetupMentor(state);

        // Show mentor section/tab if user is a mentor
        if (mentorSection) {
            if (currentMentorData) {
                mentorSection.classList.remove('hidden');
            } else {
                mentorSection.classList.add('hidden');
            }
        }
        if (mentorTab) {
            if (currentMentorData) {
                mentorTab.classList.remove('hidden');
            } else {
                mentorTab.classList.add('hidden');
            }
        }

        // Load profile picture if available
        loadProfilePicture(state);
    } else {
        loginBtn?.classList.remove('hidden');
        userProfile?.classList.add('hidden');
        userProfile?.classList.remove('flex');

        // Hide admin section when logged out
        if (adminSection) {
            adminSection.classList.add('hidden');
        }

        // Hide mentor section when logged out
        if (mentorSection) {
            mentorSection.classList.add('hidden');
        }
        if (mentorTab) {
            mentorTab.classList.add('hidden');
        }

        // Clear mentor data
        currentMentorData = null;
    }
}

// Check if current user is a mentor and set up mentor data
async function checkAndSetupMentor(state) {
    if (!db || !state.user?.email) {
        currentMentorData = null;
        return;
    }

    try {
        // Query coaches collection to find a coach with matching email (case-insensitive)
        const userEmail = state.user.email.toLowerCase();
        const coachesRef = collection(db, 'coaches');

        // First try exact match
        let q = query(coachesRef, where('email', '==', state.user.email));
        let snapshot = await getDocs(q);

        // If no exact match, try lowercase match
        if (snapshot.empty) {
            q = query(coachesRef, where('email', '==', userEmail));
            snapshot = await getDocs(q);
        }

        // If still no match, check all coaches for case-insensitive match
        if (snapshot.empty) {
            const allCoaches = await getDocs(coachesRef);
            allCoaches.forEach(doc => {
                const coachEmail = doc.data().email?.toLowerCase();
                if (coachEmail === userEmail) {
                    snapshot = { empty: false, docs: [doc] };
                }
            });
        }

        console.log('[Mentor Check] User email:', state.user.email, '| Found coach:', !snapshot.empty);

        if (!snapshot.empty) {
            const coachDoc = snapshot.docs[0];
            currentMentorData = {
                id: coachDoc.id,
                ...coachDoc.data()
            };

            // Update coach document with userId if not set
            if (!currentMentorData.userId) {
                await updateDoc(doc(db, 'coaches', coachDoc.id), {
                    userId: state.user.uid
                });
                currentMentorData.userId = state.user.uid;
            }

            console.log('[Mentor Check] ✅ Mentor detected:', currentMentorData.name);
            logger.log('Mentor detected:', currentMentorData.name);
        } else {
            console.log('[Mentor Check] ❌ No matching coach found for email');
            currentMentorData = null;
        }
    } catch (e) {
        console.error('[Mentor Check] Error:', e);
        logger.error('Error checking mentor status:', e);
        currentMentorData = null;
    }
}

// Get current mentor data (for use in other functions)
export function getCurrentMentorData() {
    return currentMentorData;
}

async function loadProfilePicture(state) {
    const img = document.getElementById('profile-picture');
    const icon = document.getElementById('profile-placeholder-icon');
    const navImg = document.getElementById('nav-profile-picture');
    const navIcon = document.getElementById('nav-profile-icon');

    if (!img || !icon) return;

    try {
        if (db && state.user?.uid) {
            const userDoc = await getDoc(doc(db, "users", state.user.uid));
            const profilePicture = userDoc.data()?.profilePicture;

            if (profilePicture) {
                // Dashboard image
                img.src = profilePicture;
                img.classList.remove('hidden');
                icon.classList.add('hidden');

                // Navigation image
                if (navImg && navIcon) {
                    navImg.src = profilePicture;
                    navImg.classList.remove('hidden');
                    navIcon.classList.add('hidden');
                }
            } else {
                // No picture - show icon
                img.classList.add('hidden');
                icon.classList.remove('hidden');

                if (navImg && navIcon) {
                    navImg.classList.add('hidden');
                    navIcon.classList.remove('hidden');
                }
            }
        } else {
            // Demo mode - show icon
            img.classList.add('hidden');
            icon.classList.remove('hidden');

            if (navImg && navIcon) {
                navImg.classList.add('hidden');
                navIcon.classList.remove('hidden');
            }
        }
    } catch (e) {
        logger.error('Failed to load profile picture:', e);
        // On error - show icon
        img.classList.add('hidden');
        icon.classList.remove('hidden');

        if (navImg && navIcon) {
            navImg.classList.add('hidden');
            navIcon.classList.remove('hidden');
        }
    }
}

export function updatePasswordStrength(password) {
    const bar = document.getElementById('password-strength-bar');
    const text = document.getElementById('password-strength-text');

    if (!bar || !text || !password) {
        if(bar) bar.className = 'password-strength-bar h-full';
        if(text) text.textContent = '';
        return;
    }

    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[@$!%*?&#]/.test(password)) strength++;

    let strengthText = '';
    let strengthClass = '';

    if (strength <= 2) {
        strengthText = 'Schwach';
        strengthClass = 'password-weak text-red-500';
    } else if (strength <= 4) {
        strengthText = 'Mittel';
        strengthClass = 'password-medium text-yellow-500';
    } else {
        strengthText = 'Stark';
        strengthClass = 'password-strong text-green-500';
    }

    bar.className = `password-strength-bar h-full ${strengthClass.split(' ')[0]}`;
    text.className = `text-xs mt-1 ${strengthClass}`;
    text.textContent = strengthText;
}

export function validateEmailField(email) {
    const feedbackEl = document.getElementById('email-feedback');
    const inputEl = document.getElementById('reg-email');

    if (!feedbackEl || !inputEl) return;

    const result = validateEmailRealtime(email);

    if (result.message === '') {
        feedbackEl.textContent = '';
        feedbackEl.className = 'form-feedback';
        inputEl.classList.remove('input-valid', 'input-invalid');
    } else if (result.valid) {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback valid';
        inputEl.classList.add('input-valid');
        inputEl.classList.remove('input-invalid');
    } else {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback invalid';
        inputEl.classList.add('input-invalid');
        inputEl.classList.remove('input-valid');
    }
}

export function validatePasswordMatchField() {
    const feedbackEl = document.getElementById('password-match-feedback');
    const passwordEl = document.getElementById('reg-password');
    const confirmEl = document.getElementById('reg-password-confirm');

    if (!feedbackEl || !passwordEl || !confirmEl) return;

    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;
    const result = validatePasswordMatch(password, confirmPassword);

    if (result.message === '') {
        feedbackEl.textContent = '';
        feedbackEl.className = 'form-feedback';
        confirmEl.classList.remove('input-valid', 'input-invalid');
    } else if (result.valid) {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback valid';
        confirmEl.classList.add('input-valid');
        confirmEl.classList.remove('input-invalid');
    } else {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback invalid';
        confirmEl.classList.add('input-invalid');
        confirmEl.classList.remove('input-valid');
    }
}

export function resetAuthToLogin() {
    document.getElementById('auth-success')?.classList.add('hidden');
    document.getElementById('auth-form')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    toggleAuthMode(true);
}

// Funktion zum erneuten Senden der Bestätigungs-E-Mail
export async function resendVerificationEmail() {
    const email = window._pendingVerificationEmail;
    const password = window._pendingVerificationPassword;

    if (!email || !password) {
        showToast('❌ Bitte melden Sie sich erneut an');
        return;
    }

    try {
        // Kurz einloggen um E-Mail zu senden
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        await signOut(auth);

        showToast('✅ Bestätigungs-E-Mail wurde erneut gesendet!');

        // Verstecke die Fehlermeldung
        const errorDiv = document.getElementById('auth-error');
        if (errorDiv) {
            errorDiv.innerHTML = `
                <div class="text-green-600 text-sm">
                    <p>Bestätigungs-E-Mail wurde gesendet!</p>
                    <p class="text-xs text-gray-600 mt-1">Prüfen Sie Ihr Postfach und klicken Sie auf den Link.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        if (error.code === 'auth/too-many-requests') {
            showToast('⚠️ Zu viele Anfragen. Bitte warten Sie einige Minuten.');
        } else {
            showToast('❌ Fehler beim Senden: ' + error.message);
        }
    }
}

export function setupAuthListener(state, navigateTo) {
    if(auth) {
        onAuthStateChanged(auth, (user) => {
            if (user && user.emailVerified) {
                state.user = {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || ''
                };
                updateAuthUI(state);

                if(!document.getElementById('view-login')?.classList.contains('hidden')) {
                    navigateTo('dashboard');
                    loadUserOrders(state);
                }
            } else {
                state.user = null;
                updateAuthUI(state);
            }
        });

        // Listen for view changes - load orders when dashboard is shown
        window.addEventListener('viewChanged', (e) => {
            if (e.detail.viewId === 'dashboard' && state.user) {
                loadUserOrders(state);
            }
        });
    }
}

// ========== CART & CHECKOUT ==========

export function toggleCart() {
    const overlay = document.getElementById('cart-overlay');
    const sidebar = document.getElementById('cart-sidebar');

    if(!overlay || !sidebar) return;

    const isHidden = overlay.classList.contains('hidden');

    if(isHidden) {
        overlay.classList.remove('hidden');
        setTimeout(() => sidebar.classList.remove('translate-x-full'), 10);
    } else {
        sidebar.classList.add('translate-x-full');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

export function addToCart(state, title, price) {
    const sanitizedTitle = sanitizeHTML(title);

    // Bestimme Kategorie
    let category = 'other';
    if (sanitizedTitle.includes('CV') && !sanitizedTitle.includes('Komplettpaket')) {
        category = 'cv-package';
    } else if (sanitizedTitle.includes('Executive Mentoring') || (sanitizedTitle.includes('Session') && !sanitizedTitle.includes('Komplettpaket')) || sanitizedTitle.includes('Retainer')) {
        category = 'mentoring';
    } else if (sanitizedTitle.includes('Komplettpaket')) {
        category = 'bundle';
    } else if (sanitizedTitle.includes('Interview-Simulation') || sanitizedTitle.includes('Zeugnis-Analyse')) {
        category = 'addon';
    }

    // Add-ons: Prüfe auf Duplikate
    if (category === 'addon') {
        const alreadyInCart = state.cart.some(item => item.title === sanitizedTitle);
        if (alreadyInCart) {
            showToast(`⚠️ ${sanitizedTitle} ist bereits im Warenkorb`);
            return;
        }
    }

    // Entferne existierende Items aus derselben Kategorie
    if (category === 'cv-package') {
        // Entferne alle CV-Pakete (Add-ons werden in confirmPackageConfig separat behandelt)
        state.cart = state.cart.filter(item =>
            !item.title.includes('CV') || item.title.includes('Komplettpaket')
        );
    } else if (category === 'mentoring') {
        // Entferne alle Mentoring-Pakete (Single, 3er, Retainer)
        state.cart = state.cart.filter(item =>
            !item.title.includes('Executive Mentoring') &&
            !item.title.includes('Retainer') &&
            !(item.title.includes('Session') && !item.title.includes('Komplettpaket'))
        );
    } else if (category === 'bundle') {
        // Komplettpaket ersetzt ALLES (CV + Mentoring + Add-ons)
        state.cart = state.cart.filter(item =>
            !item.title.includes('CV') &&
            !item.title.includes('Executive Mentoring') &&
            !item.title.includes('Session') &&
            !item.title.includes('Retainer') &&
            !item.title.includes('Interview-Simulation') &&
            !item.title.includes('Zeugnis-Analyse')
        );
    }

    // Wenn Komplettpaket bereits im Warenkorb, nichts weiteres hinzufügen
    const hasBundle = state.cart.some(item => item.title.includes('Komplettpaket'));
    if (hasBundle && category !== 'bundle') {
        showToast('⚠️ Bitte entfernen Sie zuerst das Komplettpaket', 3000);
        return;
    }

    // Füge neues Item hinzu
    state.cart.push({
        title: sanitizedTitle,
        price,
        id: Date.now()
    });

    updateCartUI(state);
    saveCartToLocalStorage(state.cart);

    // Besseres Feedback
    if (category === 'cv-package') {
        showToast('✅ CV-Paket ausgewählt (vorheriges ersetzt)');
    } else if (category === 'mentoring') {
        showToast('✅ Mentoring-Paket ausgewählt (vorheriges ersetzt)');
    } else if (category === 'bundle') {
        showToast('✅ Komplettpaket ausgewählt (ersetzt CV + Mentoring)');
    } else if (category === 'addon') {
        showToast('✅ Add-on hinzugefügt');
    } else {
        showToast('✅ Zur Auswahl hinzugefügt');
    }
}

export function removeFromCart(state, id) {
    // Convert to string for comparison (handles both string and number IDs)
    const idStr = String(id);
    state.cart = state.cart.filter(x => String(x.id) !== idStr);
    updateCartUI(state);
    saveCartToLocalStorage(state.cart);
}

export function updateCartUI(state) {
    const countEl = document.getElementById('cart-count');
    const listEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');

    if(!countEl || !listEl || !totalEl) return;

    const count = state.cart.length;
    const total = state.cart.reduce((sum, item) => sum + item.price, 0);

    countEl.textContent = count.toString();
    countEl.classList.toggle('hidden', count === 0);

    if(count === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-500 mt-10">Ihr Warenkorb ist leer</p>';
    } else {
        listEl.innerHTML = state.cart.map(item => `
            <div class="flex justify-between items-center p-4 border-b hover:bg-gray-50 transition">
                <div class="flex-1">
                    <span class="font-bold text-sm block">${sanitizeHTML(item.title)}</span>
                    <span class="text-xs text-gray-500">€${Number(item.price).toFixed(2)}</span>
                </div>
                <button onclick="app.removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 ml-4" aria-label="Artikel entfernen">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>
        `).join('');
    }

    totalEl.textContent = `€${total}`;
}

export async function checkout(state, navigateTo) {
    if(state.cart.length === 0) {
        showToast('⚠️ Ihr Warenkorb ist leer', 2000);
        return;
    }

    const total = state.cart.reduce((sum, item) => sum + item.price, 0);

    // Zeige Checkout-Modal mit Optionen (Registrieren/Login/Gast)
    const result = await showCheckoutConfirmationModal(state.cart, total, !!state.user);

    // User hat abgebrochen
    if (!result) return;

    // Bestimme Checkout-Typ für spätere Success-Message
    let checkoutType = 'guest';
    let checkoutEmail = null; // Email für Stripe vorausfüllen

    // User hat sich registriert (aber wurde ausgeloggt wegen Email-Verifikation)
    if (result.registered) {
        checkoutType = 'registered';
        checkoutEmail = result.userEmail; // Email die bei Registrierung angegeben wurde
        // User ist NICHT eingeloggt - muss erst Email verifizieren
    } else if (result.loggedIn || result.wasLoggedIn) {
        // User war bereits eingeloggt oder hat sich während Checkout eingeloggt
        checkoutType = 'loggedIn';
        if (result.user) {
            state.user = {
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName || result.user.email.split('@')[0],
                emailVerified: result.user.emailVerified
            };
            // Update UI
            if (typeof updateAuthUI === 'function') {
                updateAuthUI(state);
            }
        }
    }
    // Bei guest: checkoutType bleibt 'guest', checkoutEmail bleibt null

    // Zeige Loading
    showToast('⏳ Zahlungsseite wird vorbereitet...', 3000);
    toggleCart();

    try {
        // Firebase Function URL für Stripe Checkout
        const functionUrl = 'https://createcheckoutsession-plyofowo4a-uc.a.run.app';

        // Verwende state.user wenn eingeloggt, sonst checkoutEmail von Registrierung
        const emailForStripe = state.user?.email || checkoutEmail || null;
        // Bei Registrierung: Nutze die gespeicherte userId vom registrierten User
        const userIdForOrder = state.user?.uid || result.userId || null;

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: state.cart,
                userEmail: emailForStripe,
                userId: userIdForOrder,
                customerEmail: emailForStripe, // Prefill Stripe mit E-Mail
                mode: 'payment'
            })
        });

        if (!response.ok) {
            throw new Error('Checkout session creation failed');
        }

        const { url } = await response.json();

        // Speichere Cart und Checkout-Typ temporär
        sessionStorage.setItem('pending_cart', JSON.stringify(state.cart));
        sessionStorage.setItem('checkout_type', checkoutType);

        // Leite zu Stripe Checkout weiter
        window.location.href = url;

    } catch(e) {
        logger.error("Stripe Checkout failed:", e);
        showToast('❌ Zahlung konnte nicht gestartet werden. Bitte später erneut versuchen.', 4000);
    }
}

// ========== DASHBOARD ==========

export async function handleProfilePictureUpload(state, input) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('❌ Nur Bilddateien erlaubt', 3000);
        input.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Bild zu groß (max. 5MB)', 3000);
        input.value = '';
        return;
    }

    try {
        const img = document.getElementById('profile-picture');
        const icon = document.getElementById('profile-placeholder-icon');
        const navImg = document.getElementById('nav-profile-picture');
        const navIcon = document.getElementById('nav-profile-icon');

        if (storage && state.user) {
            const storageRef = ref(storage, `profile-pictures/${state.user.uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            if (img && icon) {
                img.src = url;
                img.classList.remove('hidden');
                icon.classList.add('hidden');
            }

            // Update nav image too
            if (navImg && navIcon) {
                navImg.src = url;
                navImg.classList.remove('hidden');
                navIcon.classList.add('hidden');
            }

            await updateDoc(doc(db, "users", state.user.uid), {
                profilePicture: url
            });

            showToast('✅ Profilbild aktualisiert');
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (img && icon) {
                    img.src = e.target.result;
                    img.classList.remove('hidden');
                    icon.classList.add('hidden');
                }
                // Update nav image too
                if (navImg && navIcon) {
                    navImg.src = e.target.result;
                    navImg.classList.remove('hidden');
                    navIcon.classList.add('hidden');
                }
            };
            reader.readAsDataURL(file);
            showToast('✅ Profilbild aktualisiert (Demo-Modus)');
        }
    } catch (e) {
        logger.error('Profile picture upload failed:', e);
        showToast('❌ Upload fehlgeschlagen', 3000);
    } finally {
        input.value = '';
    }
}

export async function loadUserOrders(state) {
    if (!db || !state.user) {
        renderOrders([]);
        return;
    }

    const container = document.getElementById('orders-list');
    if (container) {
        container.innerHTML = `
            <div class="p-8 text-center">
                <div class="loader mx-auto mb-3"></div>
                <p class="text-sm text-gray-500">Bestellungen werden geladen...</p>
            </div>
        `;
    }

    try {
        // Versuche zuerst mit userId
        let ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid)
        );

        let snapshot = await getDocs(ordersQuery);

        // Falls keine Bestellungen gefunden, versuche auch mit customerEmail
        if (snapshot.empty && state.user.email) {
            ordersQuery = query(
                collection(db, "orders"),
                where("customerEmail", "==", state.user.email)
            );
            snapshot = await getDocs(ordersQuery);
        }

        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Load CV projects for this user to merge with orders
        let cvProjectsMap = {};
        try {
            const cvProjectsQuery = query(
                collection(db, "cvProjects"),
                where("userId", "==", state.user.uid)
            );
            const cvProjectsSnapshot = await getDocs(cvProjectsQuery);
            cvProjectsSnapshot.forEach(docSnap => {
                const project = { id: docSnap.id, ...docSnap.data() };
                cvProjectsMap[project.orderId] = project;
            });
        } catch (e) {
            logger.warn('Could not load CV projects:', e);
        }

        // Merge orders with CV project data
        const ordersWithCvData = orders.map(order => {
            const cvProject = cvProjectsMap[order.id];
            if (cvProject) {
                return {
                    ...order,
                    cvProject: cvProject,
                    cvProjectId: cvProject.id,
                    cvStatus: cvProject.status || 'new',
                    questionnaire: cvProject.questionnaire || null
                };
            }
            return order;
        });

        // Sortiere nach Datum (client-side, um Index-Probleme zu vermeiden)
        ordersWithCvData.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

        renderOrders(ordersWithCvData);

        // Update Dashboard Stats
        updateDashboardStats(ordersWithCvData);

    } catch (e) {
        logger.error('Failed to load orders:', e);
        // Show empty state instead of infinite loader
        const container = document.getElementById('orders-list');
        if (container) {
            container.innerHTML = `
                <div class="p-12 text-center">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-shopping-bag text-2xl text-gray-400" aria-hidden="true"></i>
                    </div>
                    <h3 class="font-bold text-gray-700 mb-2">Noch keine Bestellungen</h3>
                    <p class="text-sm text-gray-500 mb-4">Entdecken Sie unsere Premium-Services</p>
                    <button onclick="app.navigateToSection('home', 'cv-packages')" class="btn-primary">
                        <i class="fas fa-arrow-right mr-2"></i>Pakete ansehen
                    </button>
                </div>
            `;
        }
        const badge = document.getElementById('order-count-badge');
        if (badge) badge.textContent = '0';
    }
}

// Retry-Funktion für Orders nach Zahlung (Webhook braucht manchmal etwas Zeit)
async function loadUserOrdersWithRetry(state, retries = 3) {
    const previousCount = document.getElementById('order-count-badge')?.textContent || '0';

    await loadUserOrders(state);

    const newCount = document.getElementById('order-count-badge')?.textContent || '0';

    // Wenn keine neue Order gefunden wurde und noch Retries übrig sind
    if (newCount === previousCount && retries > 0) {
        setTimeout(() => {
            loadUserOrdersWithRetry(state, retries - 1);
        }, 2000);
    }
}

function updateDashboardStats(orders) {
    // Update order count in stats
    const orderCountEl = document.getElementById('stat-orders');
    if (orderCountEl) {
        orderCountEl.textContent = orders.length;
    }

    // Count documents (CV packages)
    const docCountEl = document.getElementById('stat-documents');
    if (docCountEl) {
        const docCount = orders.filter(o => o.items?.some(i =>
            i.title?.toLowerCase().includes('cv') ||
            i.title?.toLowerCase().includes('lebenslauf') ||
            i.title?.toLowerCase().includes('professional')
        )).length;
        docCountEl.textContent = docCount;
    }

    // Count sessions (mentoring/coaching)
    const sessionCountEl = document.getElementById('stat-sessions');
    if (sessionCountEl) {
        const sessionCount = orders.filter(o => o.items?.some(i =>
            i.title?.toLowerCase().includes('mentoring') ||
            i.title?.toLowerCase().includes('session') ||
            i.title?.toLowerCase().includes('coaching')
        )).length;
        sessionCountEl.textContent = sessionCount;
    }
}

export function renderOrders(orders) {
    const container = document.getElementById('orders-list');
    const badge = document.getElementById('order-count-badge');

    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="p-12 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-shopping-bag text-2xl text-gray-400" aria-hidden="true"></i>
                </div>
                <h3 class="font-bold text-gray-700 mb-2">Noch keine Bestellungen</h3>
                <p class="text-sm text-gray-500 mb-4">Entdecken Sie unsere Premium-Services</p>
                <button onclick="app.navigateToSection('home', 'cv-packages')" class="btn-primary">
                    <i class="fas fa-arrow-right mr-2"></i>Pakete ansehen
                </button>
            </div>
        `;
        if (badge) badge.textContent = '0';
        return;
    }

    container.innerHTML = orders.map((order, index) => {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            })
            : 'Unbekannt';
        const hasCoach = hasCoachSession(order);
        const hasAppointment = order.appointment?.datetime;
        const shortOrderId = 'APEX-' + (order.stripeSessionId?.slice(-8) || order.id.slice(-8)).toUpperCase();
        const statusInfo = getOrderStatusInfo(order.status || 'confirmed');
        const orderId = `order-${order.id}`;
        // First order expanded by default
        const isExpanded = index === 0;

        return `
            <div class="border-b border-gray-100 last:border-0">
                <!-- Clickable Order Header -->
                <button onclick="app.toggleOrderDetails('${orderId}')"
                        class="w-full p-5 hover:bg-gray-50 transition flex justify-between items-center text-left group">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs text-gray-400 font-mono">${shortOrderId}</span>
                            <span class="status-badge ${statusInfo.class} text-[10px] px-2 py-0.5">
                                ${statusInfo.text}
                            </span>
                        </div>
                        <h4 class="font-bold text-brand-dark truncate">${order.items?.map(i => sanitizeHTML(i.title)).join(', ') || 'Bestellung'}</h4>
                        <p class="text-xs text-gray-500 mt-1"><i class="far fa-calendar-alt mr-1"></i>${date}</p>
                    </div>
                    <div class="flex items-center gap-4 flex-shrink-0 ml-4">
                        <span class="font-serif text-xl text-brand-dark">€${(order.total || 0).toFixed(2)}</span>
                        <i id="${orderId}-icon" class="fas fa-chevron-down text-gray-400 group-hover:text-brand-gold transition-all duration-300 ${isExpanded ? 'rotate-180' : ''}"></i>
                    </div>
                </button>

                <!-- Collapsible Order Details -->
                <div id="${orderId}" class="overflow-hidden transition-all duration-300 ${isExpanded ? '' : 'hidden'}">
                    <div class="px-5 pb-5">
                        <!-- Status Timeline -->
                        <div class="bg-gray-50 rounded-lg p-4 mb-3">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-bold text-gray-600 uppercase tracking-wider">Bestellstatus</span>
                                <span class="status-badge ${statusInfo.class}">
                                    <i class="${statusInfo.icon}"></i>
                                    ${statusInfo.text}
                                </span>
                            </div>

                            <!-- Progress Steps -->
                            <div class="flex items-center gap-1">
                                ${renderOrderProgress(order.status || 'confirmed')}
                            </div>

                            <!-- Status Description -->
                            <p class="text-xs text-gray-500 mt-3">
                                <i class="fas fa-info-circle mr-1"></i>
                                ${statusInfo.description}
                            </p>
                        </div>

                        <!-- Documents Section - Customer Upload & Received Documents -->
                        <div class="bg-gray-50 rounded-lg p-4 mb-3">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    <i class="fas fa-folder-open mr-1"></i>Dokumente
                                </span>
                                <button onclick="app.toggleOrderDocuments('${order.id}')"
                                        class="text-xs text-brand-gold hover:text-brand-dark transition">
                                    <i class="fas fa-chevron-down" id="docs-toggle-${order.id}"></i>
                                </button>
                            </div>

                            <div id="order-docs-${order.id}" class="space-y-4">
                                <!-- Customer Upload Section -->
                                <div class="bg-white rounded-lg p-3 border border-gray-200">
                                    <p class="text-xs font-semibold text-gray-700 mb-2">
                                        <i class="fas fa-upload text-blue-500 mr-1"></i>Ihre Dokumente hochladen
                                    </p>
                                    <div class="flex flex-col sm:flex-row gap-2">
                                        <label class="flex-1 cursor-pointer">
                                            <input type="file"
                                                   onchange="app.uploadOrderDocument('${order.id}', this)"
                                                   accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                   multiple
                                                   class="hidden">
                                            <div class="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-brand-gold hover:bg-brand-gold/5 transition">
                                                <i class="fas fa-cloud-upload-alt text-gray-400 text-lg mb-1"></i>
                                                <p class="text-xs text-gray-500">Klicken oder Datei hierher ziehen</p>
                                                <p class="text-[10px] text-gray-400 mt-1">PDF, Word, Bilder (max. 10MB)</p>
                                            </div>
                                        </label>
                                    </div>

                                    <!-- Uploaded by Customer -->
                                    <div id="customer-docs-${order.id}" class="mt-3 space-y-2">
                                        ${renderCustomerDocuments(order)}
                                    </div>
                                </div>

                                <!-- Received Documents from APEX -->
                                <div class="bg-white rounded-lg p-3 border border-gray-200">
                                    <p class="text-xs font-semibold text-gray-700 mb-2">
                                        <i class="fas fa-download text-green-500 mr-1"></i>Von APEX erhalten
                                    </p>
                                    <div id="received-docs-${order.id}" class="space-y-2">
                                        ${renderReceivedDocuments(order)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CV Project Section (for CV orders) -->
                        ${renderCvProjectSection(order)}

                        <!-- Professional Appointment Section - Mobile Optimized -->
                ${order.appointment?.confirmed ? `
                    <!-- Confirmed Appointment - Mobile-Optimized Design -->
                    <div class="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-check text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <span class="inline-block text-xs font-bold text-green-700 uppercase tracking-wider bg-green-100 px-2 py-1 rounded mb-2">Bestätigt</span>
                                <div class="bg-white rounded-lg p-3 sm:p-4 border border-green-100 shadow-sm">
                                    <div class="flex items-center gap-2 sm:gap-3 mb-2">
                                        <i class="fas fa-calendar-day text-green-600 text-sm"></i>
                                        <span class="font-semibold text-gray-800 text-sm sm:text-base">${new Date(order.appointment.datetime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    <div class="flex items-center gap-2 sm:gap-3">
                                        <i class="fas fa-clock text-green-600 text-sm"></i>
                                        <span class="font-semibold text-gray-800 text-sm sm:text-base">${new Date(order.appointment.datetime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
                                    </div>
                                </div>
                                ${isMeetingTimeNow(order.appointment.datetime) ? `
                                    <button onclick="app.joinMeeting('${order.id}')"
                                            class="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2">
                                        <i class="fas fa-video"></i>
                                        <span>Meeting beitreten</span>
                                    </button>
                                ` : `
                                    <p class="text-xs text-green-600 mt-3 flex items-center gap-1">
                                        <i class="fas fa-video"></i>
                                        Meeting-Button erscheint 15 Min. vor Termin
                                    </p>
                                `}
                            </div>
                        </div>
                    </div>
                ` : order.appointmentProposals?.length > 0 && order.appointmentStatus === 'pending' ? `
                    <!-- Pending Proposals - Mobile-Optimized Selection UI -->
                    <div class="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4 mb-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-brand-gold to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-calendar-alt text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-brand-dark text-base sm:text-lg mb-1">Terminvorschläge</h4>
                                <p class="text-xs sm:text-sm text-gray-600">Wählen Sie Ihren Termin</p>
                            </div>
                        </div>
                        ${order.appointmentProposalMessage ? `
                            <div class="bg-white/80 rounded-lg p-3 sm:p-4 mb-4 border border-amber-100">
                                <p class="text-xs sm:text-sm text-gray-700 italic">
                                    ${sanitizeHTML(order.appointmentProposalMessage)}
                                </p>
                            </div>
                        ` : ''}
                        <div class="space-y-2 sm:space-y-3 mb-4">
                            ${order.appointmentProposals.map((p, idx) => `
                                <button onclick="app.acceptAppointmentProposal('${order.id}', '${p.datetime}')"
                                        class="w-full flex items-center p-3 sm:p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group">
                                    <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-brand-gold to-amber-400 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-sm group-hover:from-green-500 group-hover:to-emerald-600 transition-all duration-200 flex-shrink-0">
                                        ${idx + 1}
                                    </div>
                                    <div class="flex-1 text-left ml-3 min-w-0">
                                        <p class="font-semibold text-brand-dark text-sm sm:text-base truncate">${new Date(p.datetime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                                        <p class="text-xs sm:text-sm text-gray-500">
                                            ${new Date(p.datetime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 ml-2">
                                        <i class="fas fa-chevron-right text-gray-300 group-hover:text-green-500 transition-colors"></i>
                                    </div>
                                </button>
                            `).join('')}
                        </div>
                        <div class="border-t border-amber-200 pt-3 sm:pt-4">
                            <button onclick="app.declineAllAppointmentProposals('${order.id}')"
                                    class="w-full text-center text-xs sm:text-sm text-gray-500 hover:text-red-600 active:text-red-700 transition py-2 flex items-center justify-center gap-2">
                                <i class="fas fa-times"></i>
                                Keiner passt
                            </button>
                        </div>
                    </div>
                ` : order.appointmentStatus === 'declined' ? `
                    <!-- Declined - Mobile-Optimized Waiting State -->
                    <div class="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-hourglass-half text-white text-base sm:text-xl animate-pulse"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-orange-800 text-base sm:text-lg mb-1">Neue Termine</h4>
                                <p class="text-xs sm:text-sm text-orange-700">Wir senden Ihnen neue Vorschläge.</p>
                                <p class="text-xs text-orange-600 mt-2 flex items-center gap-1">
                                    <i class="fas fa-bell"></i>
                                    Per E-Mail
                                </p>
                            </div>
                        </div>
                    </div>
                ` : hasCoach && !hasAppointment && order.assignedCoachId ? `
                    <!-- Mentor assigned - Show appointment selection -->
                    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <!-- Assigned Mentor Info -->
                        <div class="flex items-start gap-3 sm:gap-4 mb-4 pb-4 border-b border-blue-100">
                            <div class="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-brand-dark to-gray-800 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                                <i class="fas fa-user-tie text-brand-gold text-lg sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <span class="inline-block text-xs font-bold text-blue-700 uppercase tracking-wider bg-blue-100 px-2 py-1 rounded mb-1">Ihr Mentor</span>
                                <h4 class="font-bold text-brand-dark text-base sm:text-lg">${sanitizeHTML(order.assignedCoachName || 'Wird zugewiesen')}</h4>
                                <p class="text-xs text-gray-500 mt-1">Bereit für Ihre Session</p>
                            </div>
                        </div>

                        <!-- Executive Info Banner -->
                        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                            <div class="flex items-start gap-2">
                                <i class="fas fa-info-circle text-amber-600 mt-0.5"></i>
                                <div class="text-xs text-amber-800">
                                    <p class="font-semibold mb-1">Hinweis zu Terminzeiten</p>
                                    <p>Unsere Mentoren sind erfahrene Executives und daher in der Regel <strong>ab 18:00 Uhr</strong> verfügbar. Bitte beachten Sie dies bei Ihrer Terminauswahl.</p>
                                </div>
                            </div>
                        </div>

                        <!-- Appointment Selection Button -->
                        <button onclick="app.openMentorAppointmentModal('${order.id}', '${order.assignedCoachId}')"
                                class="w-full bg-gradient-to-r from-brand-gold to-amber-500 hover:from-amber-500 hover:to-amber-600 text-brand-dark font-bold py-3 sm:py-4 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 text-sm sm:text-base">
                            <i class="fas fa-calendar-check"></i>
                            <span>Termin auswählen</span>
                        </button>
                    </div>
                ` : hasCoach && !hasAppointment ? `
                    <!-- Waiting for mentor assignment - Compliance Check -->
                    <div class="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-shield-alt text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-amber-800 text-base sm:text-lg mb-1">Compliance-Check läuft</h4>
                                <p class="text-xs sm:text-sm text-amber-700 leading-relaxed">
                                    Wir führen einen Compliance-Check durch, um Interessenkonflikte auszuschließen
                                    (z.B. gleiche Branche, Wettbewerber). Nach erfolgreicher Prüfung wird Ihnen ein
                                    passender Mentor zugewiesen.
                                </p>
                                <div class="flex flex-wrap items-center gap-3 mt-3">
                                    <span class="text-xs text-amber-600 flex items-center gap-1">
                                        <i class="fas fa-clock"></i>
                                        In der Regel 24-48h
                                    </span>
                                    <span class="text-xs text-amber-600 flex items-center gap-1">
                                        <i class="fas fa-bell"></i>
                                        Benachrichtigung per E-Mail
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (badge) badge.textContent = orders.length.toString();
}

// Toggle order details visibility
export function toggleOrderDetails(orderId) {
    const content = document.getElementById(orderId);
    const icon = document.getElementById(`${orderId}-icon`);

    if (content && icon) {
        const isHidden = content.classList.contains('hidden');

        if (isHidden) {
            content.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    }
}

// Toggle order documents section
export function toggleOrderDocuments(orderId) {
    const docsContainer = document.getElementById(`order-docs-${orderId}`);
    const toggleIcon = document.getElementById(`docs-toggle-${orderId}`);

    if (docsContainer && toggleIcon) {
        const isHidden = docsContainer.classList.contains('hidden');
        if (isHidden) {
            docsContainer.classList.remove('hidden');
            toggleIcon.classList.add('rotate-180');
        } else {
            docsContainer.classList.add('hidden');
            toggleIcon.classList.remove('rotate-180');
        }
    }
}

// Render customer-uploaded documents
function renderCustomerDocuments(order) {
    const docs = order.customerDocuments || [];

    if (docs.length === 0) {
        return `<p class="text-xs text-gray-400 italic">Noch keine Dokumente hochgeladen</p>`;
    }

    return docs.map(doc => `
        <div class="flex items-center justify-between bg-gray-50 rounded-lg p-2 group">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <i class="fas ${getFileIcon(doc.name)} text-gray-400"></i>
                <span class="text-xs text-gray-700 truncate">${sanitizeHTML(doc.name)}</span>
                <span class="text-[10px] text-gray-400">${formatFileSize(doc.size)}</span>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <a href="${doc.url}" target="_blank"
                   class="p-1.5 text-gray-400 hover:text-brand-gold transition" title="Herunterladen">
                    <i class="fas fa-download text-xs"></i>
                </a>
                <button onclick="app.deleteOrderDocument('${order.id}', '${doc.id}')"
                        class="p-1.5 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Löschen">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Render documents received from APEX (admin-uploaded)
function renderReceivedDocuments(order) {
    const docs = order.deliveredDocuments || [];

    if (docs.length === 0) {
        return `<p class="text-xs text-gray-400 italic">Noch keine Dokumente erhalten</p>`;
    }

    return docs.map(doc => `
        <div class="flex items-center justify-between bg-green-50 rounded-lg p-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <i class="fas ${getFileIcon(doc.name)} text-green-500"></i>
                <div class="min-w-0 flex-1">
                    <span class="text-xs text-gray-700 truncate block">${sanitizeHTML(doc.name)}</span>
                    <span class="text-[10px] text-gray-400">
                        ${doc.uploadedAt ? new Date(doc.uploadedAt.seconds * 1000).toLocaleDateString('de-DE') : ''}
                    </span>
                </div>
            </div>
            <a href="${doc.url}" target="_blank" download
               class="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition flex-shrink-0">
                <i class="fas fa-download"></i>
                <span class="hidden sm:inline">Download</span>
            </a>
        </div>
    `).join('');
}

// Get file icon based on extension
function getFileIcon(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'fa-file-pdf text-red-500';
        case 'doc':
        case 'docx': return 'fa-file-word text-blue-500';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif': return 'fa-file-image text-purple-500';
        case 'xls':
        case 'xlsx': return 'fa-file-excel text-green-500';
        default: return 'fa-file text-gray-400';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// CV Status configuration for customer view
const CV_CUSTOMER_STATUS = {
    'new': { label: 'Bestellung erhalten', color: 'bg-blue-100 text-blue-800', icon: 'fa-check-circle', description: 'Ihre Bestellung wurde bestätigt.' },
    'questionnaire_sent': { label: 'Fragebogen bereit', color: 'bg-yellow-100 text-yellow-800', icon: 'fa-edit', description: 'Bitte füllen Sie den Fragebogen aus.' },
    'data_received': { label: 'Daten erhalten', color: 'bg-indigo-100 text-indigo-800', icon: 'fa-check-double', description: 'Wir haben Ihre Daten erhalten und arbeiten an Ihrem CV.' },
    'generating': { label: 'CV wird erstellt', color: 'bg-purple-100 text-purple-800', icon: 'fa-cog fa-spin', description: 'Ihr CV wird gerade von unseren Experten erstellt.' },
    'ready': { label: 'CV fertig', color: 'bg-green-100 text-green-800', icon: 'fa-file-alt', description: 'Ihr CV ist fertig und bereit zum Download!' },
    'delivered': { label: 'Zugestellt', color: 'bg-gray-100 text-gray-800', icon: 'fa-check-double', description: 'Ihr CV wurde Ihnen zugestellt.' }
};

// Check if order contains CV package
function isCvOrder(order) {
    const cvKeywords = ['CV', 'Lebenslauf', 'Quick-Check', 'Young Professional', 'Senior Professional', 'Executive', 'C-Suite'];
    return order.items?.some(item =>
        cvKeywords.some(keyword =>
            item.title?.toLowerCase().includes(keyword.toLowerCase())
        )
    );
}

// Render CV project section for customer order
function renderCvProjectSection(order) {
    // Only show for CV orders
    if (!isCvOrder(order)) return '';

    const cvProject = order.cvProject;
    const cvStatus = order.cvStatus || 'new';
    const statusConfig = CV_CUSTOMER_STATUS[cvStatus] || CV_CUSTOMER_STATUS['new'];
    const questionnaire = order.questionnaire;

    return `
        <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 mb-3 border border-indigo-200">
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    <i class="fas fa-file-alt mr-1"></i>CV-Erstellung
                </span>
                <span class="${statusConfig.color} text-xs px-2 py-1 rounded-full font-medium">
                    <i class="fas ${statusConfig.icon} mr-1"></i>${statusConfig.label}
                </span>
            </div>

            <!-- Status Description -->
            <p class="text-sm text-gray-600 mb-3">
                <i class="fas fa-info-circle text-indigo-400 mr-1"></i>
                ${statusConfig.description}
            </p>

            <!-- CV Progress Bar -->
            <div class="mb-4">
                <div class="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                    ${['new', 'questionnaire_sent', 'data_received', 'generating', 'ready'].map((step, idx) => {
                        const stepOrder = ['new', 'questionnaire_sent', 'data_received', 'generating', 'ready'];
                        const currentIdx = stepOrder.indexOf(cvStatus);
                        const isComplete = idx <= currentIdx;
                        const isCurrent = idx === currentIdx;
                        return `
                            <div class="flex-1 flex flex-col items-center">
                                <div class="w-full h-1.5 rounded-full ${isComplete ? 'bg-indigo-500' : 'bg-gray-200'} ${isCurrent ? 'animate-pulse' : ''}"></div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="flex justify-between text-[9px] text-gray-400">
                    <span>Bestellt</span>
                    <span>Fragebogen</span>
                    <span>Daten</span>
                    <span>Erstellen</span>
                    <span>Fertig</span>
                </div>
            </div>

            ${(cvStatus === 'new' || cvStatus === 'questionnaire_sent') ? `
                ${order.cvProjectId ? `
                    <!-- Questionnaire CTA - Ausfüllen möglich -->
                    <a href="?questionnaire=${order.cvProjectId}"
                       class="block w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-center font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                        <i class="fas fa-edit mr-2"></i>Fragebogen ausfüllen
                    </a>
                ` : `
                    <!-- Fragebogen noch nicht bereit -->
                    <div class="bg-white rounded-lg p-3 border border-amber-200">
                        <div class="flex items-center gap-2 text-amber-700">
                            <i class="fas fa-clock text-amber-500"></i>
                            <span class="text-sm font-medium">Fragebogen wird vorbereitet</span>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">
                            Sie erhalten in Kürze eine E-Mail mit dem Link zum Fragebogen.
                            Alternativ können Sie ihn dann auch hier im Dashboard ausfüllen.
                        </p>
                    </div>
                `}
            ` : ''}

            ${(cvStatus === 'data_received' || cvStatus === 'generating' || cvStatus === 'ready' || cvStatus === 'delivered') ? `
                <!-- Fragebogen bereits ausgefüllt - Read-Only Ansicht -->
                <div class="bg-white rounded-lg p-3 border border-indigo-100">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-semibold text-green-700">
                            <i class="fas fa-check-circle mr-1"></i>Fragebogen ausgefüllt
                        </span>
                        <span class="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            <i class="fas fa-lock mr-1"></i>Nur Ansicht
                        </span>
                    </div>
                    ${questionnaire || cvProject?.documents ? `
                        <button onclick="app.toggleCvQuestionnaireView('${order.id}')"
                                class="w-full flex items-center justify-between text-left pt-2 border-t border-gray-100">
                            <span class="text-xs text-gray-600">
                                <i class="fas fa-list-alt text-indigo-500 mr-1"></i>Eingegebene Daten anzeigen
                            </span>
                            <i class="fas fa-chevron-down text-gray-400 transition-transform" id="cv-q-toggle-${order.id}"></i>
                        </button>

                        <div id="cv-questionnaire-view-${order.id}" class="hidden mt-3 pt-3 border-t border-gray-100 space-y-3 text-xs">
                            ${renderQuestionnaireDataForCustomer(questionnaire, cvProject?.documents, cvProject?.templateSelection)}
                        </div>
                    ` : `
                        <p class="text-xs text-gray-500 italic">Daten werden verarbeitet...</p>
                    `}
                </div>
            ` : ''}

            ${(cvStatus === 'ready' || cvStatus === 'delivered') && order.cvProject?.generatedCv ? `
                <!-- Download CV -->
                <div class="mt-3 bg-green-50 rounded-lg p-3 border border-green-200">
                    <p class="text-xs font-semibold text-green-700 mb-2">
                        <i class="fas fa-check-circle mr-1"></i>Ihr CV ist bereit!
                    </p>
                    <a href="${order.cvProject.generatedCv.url}"
                       target="_blank"
                       download
                       class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg transition">
                        <i class="fas fa-download"></i>
                        CV herunterladen
                    </a>
                </div>
            ` : ''}
        </div>
    `;
}

// Toggle CV questionnaire view
export function toggleCvQuestionnaireView(orderId) {
    const container = document.getElementById(`cv-questionnaire-view-${orderId}`);
    const toggleIcon = document.getElementById(`cv-q-toggle-${orderId}`);

    if (container && toggleIcon) {
        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            toggleIcon.classList.add('rotate-180');
        } else {
            container.classList.add('hidden');
            toggleIcon.classList.remove('rotate-180');
        }
    }
}

// Render questionnaire data summary for customer
function renderQuestionnaireDataForCustomer(questionnaire, documents, templateSelection) {
    if (!questionnaire && !documents && !templateSelection) return '<p class="text-gray-400 italic">Keine Daten vorhanden</p>';

    let html = '';

    // Template Selection
    if (templateSelection) {
        html += `
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded p-2 border border-amber-200">
                <p class="font-semibold text-gray-700 mb-2"><i class="fas fa-palette text-amber-500 mr-1"></i>Gewähltes Design</p>
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-600"><strong>Template:</strong> ${sanitizeHTML(templateSelection.templateName || templateSelection.templateId)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-3 mt-2">
                    <span class="text-gray-500">Farben:</span>
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center gap-1">
                            <span class="w-5 h-5 rounded border border-gray-300 shadow-sm" style="background-color: ${templateSelection.customization?.primaryColor || '#1a3a5c'}"></span>
                            <span class="text-gray-500 text-[10px]">Haupt</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-5 h-5 rounded border border-gray-300 shadow-sm" style="background-color: ${templateSelection.customization?.accentColor || '#d4912a'}"></span>
                            <span class="text-gray-500 text-[10px]">Akzent</span>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    // Personal Info
    if (questionnaire?.personal) {
        const p = questionnaire.personal;
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-user text-indigo-400 mr-1"></i>Persönliche Daten</p>
                <div class="grid grid-cols-2 gap-1 text-gray-600">
                    ${p.fullName ? `<p><span class="text-gray-400">Name:</span> ${sanitizeHTML(p.fullName)}</p>` : ''}
                    ${p.email ? `<p><span class="text-gray-400">E-Mail:</span> ${sanitizeHTML(p.email)}</p>` : ''}
                    ${p.phone ? `<p><span class="text-gray-400">Telefon:</span> ${sanitizeHTML(p.phone)}</p>` : ''}
                    ${p.location ? `<p><span class="text-gray-400">Ort:</span> ${sanitizeHTML(p.location)}</p>` : ''}
                    ${p.targetRole ? `<p class="col-span-2"><span class="text-gray-400">Zielposition:</span> ${sanitizeHTML(p.targetRole)}</p>` : ''}
                    ${p.linkedin ? `<p class="col-span-2"><span class="text-gray-400">LinkedIn:</span> <a href="${sanitizeHTML(p.linkedin)}" target="_blank" class="text-indigo-600 underline">${sanitizeHTML(p.linkedin)}</a></p>` : ''}
                </div>
            </div>
        `;
    }

    // Experience
    if (questionnaire.experience?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-briefcase text-indigo-400 mr-1"></i>Berufserfahrung (${questionnaire.experience.length})</p>
                <div class="space-y-2">
                    ${questionnaire.experience.slice(0, 3).map(exp => `
                        <div class="text-gray-600 border-l-2 border-indigo-200 pl-2">
                            <p class="font-medium">${sanitizeHTML(exp.role || exp.title || 'Position')}</p>
                            <p class="text-gray-400">${sanitizeHTML(exp.company || '')} ${exp.startDate ? `• ${exp.startDate}` : ''}</p>
                        </div>
                    `).join('')}
                    ${questionnaire.experience.length > 3 ? `<p class="text-gray-400">+ ${questionnaire.experience.length - 3} weitere...</p>` : ''}
                </div>
            </div>
        `;
    }

    // Education
    if (questionnaire.education?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-graduation-cap text-indigo-400 mr-1"></i>Ausbildung (${questionnaire.education.length})</p>
                <div class="space-y-1">
                    ${questionnaire.education.slice(0, 2).map(edu => `
                        <div class="text-gray-600">
                            <p>${sanitizeHTML(edu.degree || edu.field || 'Abschluss')} - ${sanitizeHTML(edu.institution || '')}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Skills
    if (questionnaire.skills) {
        const skills = questionnaire.skills;
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-tools text-indigo-400 mr-1"></i>Fähigkeiten</p>
                <div class="flex flex-wrap gap-1">
                    ${(skills.technical || []).slice(0, 5).map(s => `<span class="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">${sanitizeHTML(s)}</span>`).join('')}
                    ${(skills.soft || []).slice(0, 3).map(s => `<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">${sanitizeHTML(s)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Languages
    if (questionnaire?.skills?.languages?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-globe text-indigo-400 mr-1"></i>Sprachen</p>
                <div class="flex flex-wrap gap-2">
                    ${questionnaire.skills.languages.map(lang => `
                        <span class="text-gray-600">${sanitizeHTML(lang.name || lang)} ${lang.level ? `(${lang.level})` : ''}</span>
                    `).join(' • ')}
                </div>
            </div>
        `;
    }

    // Additional notes
    if (questionnaire?.additional?.notes) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-sticky-note text-indigo-400 mr-1"></i>Zusätzliche Hinweise</p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.additional.notes)}</p>
            </div>
        `;
    }

    // Uploaded Documents
    if (documents) {
        let docsHtml = '';

        // Existing CV
        if (documents.existingCv?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-file-pdf text-red-500"></i>
                        <span class="text-gray-700">${sanitizeHTML(documents.existingCv.filename || 'Bestehender Lebenslauf')}</span>
                    </div>
                    <a href="${documents.existingCv.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                        <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                    </a>
                </div>
            `;
        }

        // Target Job / Stellenanzeige
        if (documents.targetJob?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-briefcase text-blue-500"></i>
                        <span class="text-gray-700">${sanitizeHTML(documents.targetJob.filename || 'Stellenanzeige')}</span>
                    </div>
                    <a href="${documents.targetJob.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                        <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                    </a>
                </div>
            `;
        }

        // Other Documents
        if (documents.otherDocuments?.length > 0) {
            documents.otherDocuments.forEach((doc, idx) => {
                if (doc.url) {
                    docsHtml += `
                        <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-file text-gray-500"></i>
                                <span class="text-gray-700">${sanitizeHTML(doc.filename || `Dokument ${idx + 1}`)}</span>
                            </div>
                            <a href="${doc.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                                <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                            </a>
                        </div>
                    `;
                }
            });
        }

        if (docsHtml) {
            html += `
                <div class="bg-gray-50 rounded p-2">
                    <p class="font-semibold text-gray-700 mb-2"><i class="fas fa-folder-open text-indigo-400 mr-1"></i>Hochgeladene Dokumente</p>
                    <div class="space-y-2">
                        ${docsHtml}
                    </div>
                </div>
            `;
        }
    }

    return html || '<p class="text-gray-400 italic">Keine Daten vorhanden</p>';
}

// Upload document to order
export async function uploadOrderDocument(orderId, input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
        if (file.size > maxSize) {
            showToast(`❌ ${file.name} ist zu groß (max. 10MB)`);
            continue;
        }

        showToast(`⏳ ${file.name} wird hochgeladen...`);

        try {
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `order-documents/${orderId}/customer/${timestamp}_${safeName}`;

            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // Add document to order in Firestore
            const orderRef = doc(db, 'orders', orderId);
            const orderDoc = await getDoc(orderRef);

            if (orderDoc.exists()) {
                const currentDocs = orderDoc.data().customerDocuments || [];
                const newDoc = {
                    id: `doc_${timestamp}`,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    url: url,
                    path: path,
                    uploadedAt: new Date()
                };

                await updateDoc(orderRef, {
                    customerDocuments: [...currentDocs, newDoc]
                });

                showToast(`✅ ${file.name} hochgeladen`);

                // Refresh the documents display
                const container = document.getElementById(`customer-docs-${orderId}`);
                if (container) {
                    const updatedOrder = { ...orderDoc.data(), customerDocuments: [...currentDocs, newDoc] };
                    container.innerHTML = renderCustomerDocuments(updatedOrder);
                }
            }
        } catch (error) {
            logger.error('Upload error:', error);
            showToast(`❌ Fehler beim Hochladen: ${file.name}`);
        }
    }

    // Reset input
    input.value = '';
}

// Delete customer document from order
export async function deleteOrderDocument(orderId, docId) {
    if (!confirm('Möchten Sie dieses Dokument wirklich löschen?')) return;

    try {
        const orderRef = doc(db, 'orders', orderId);
        const orderDoc = await getDoc(orderRef);

        if (orderDoc.exists()) {
            const currentDocs = orderDoc.data().customerDocuments || [];
            const docToDelete = currentDocs.find(d => d.id === docId);

            // Delete from Storage
            if (docToDelete?.path) {
                try {
                    const storageRef = ref(storage, docToDelete.path);
                    await deleteObject(storageRef);
                } catch (e) {
                    logger.warn('Could not delete file from storage:', e);
                }
            }

            // Remove from Firestore
            const updatedDocs = currentDocs.filter(d => d.id !== docId);
            await updateDoc(orderRef, {
                customerDocuments: updatedDocs
            });

            showToast('✅ Dokument gelöscht');

            // Refresh the documents display
            const container = document.getElementById(`customer-docs-${orderId}`);
            if (container) {
                const updatedOrder = { ...orderDoc.data(), customerDocuments: updatedDocs };
                container.innerHTML = renderCustomerDocuments(updatedOrder);
            }
        }
    } catch (error) {
        logger.error('Delete error:', error);
        showToast('❌ Fehler beim Löschen');
    }
}

// Check if meeting time is now (15 min before to 2 hours after)
function isMeetingTimeNow(datetime) {
    const meetingTime = new Date(datetime);
    const now = new Date();
    const fifteenMinBefore = new Date(meetingTime.getTime() - 15 * 60 * 1000);
    const twoHoursAfter = new Date(meetingTime.getTime() + 2 * 60 * 60 * 1000);

    return now >= fifteenMinBefore && now <= twoHoursAfter;
}

// Join video meeting
export async function joinMeeting(orderId) {
    showToast('⏳ Meeting wird vorbereitet...');

    try {
        // Get order data to check if meeting room exists
        const orderDoc = await getDoc(doc(db, "orders", orderId));
        if (!orderDoc.exists()) {
            showToast('❌ Bestellung nicht gefunden');
            return;
        }

        const order = orderDoc.data();
        let meetingUrl = order.meetingRoom?.url;
        let roomName = order.meetingRoom?.roomName;

        // If no meeting room exists, create one
        if (!meetingUrl) {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createMeetingRoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    appointmentDatetime: order.appointment.datetime,
                    customerName: order.customerName || 'Kunde'
                })
            });

            const result = await response.json();
            if (!result.success) {
                showToast('❌ Meeting konnte nicht erstellt werden');
                return;
            }

            meetingUrl = result.meetingUrl;
            roomName = result.roomName;
        }

        // Open meeting modal
        openMeetingModal(meetingUrl, roomName, orderId);

    } catch (error) {
        logger.error('Failed to join meeting:', error);
        showToast('❌ Fehler beim Beitreten');
    }
}

// Open meeting modal with embedded Daily.co
function openMeetingModal(meetingUrl, roomName, orderId) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('video-meeting-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'video-meeting-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-50 flex flex-col';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="flex items-center justify-between p-4 bg-brand-dark text-white">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-brand-gold rounded-full flex items-center justify-center">
                    <i class="fas fa-video text-brand-dark"></i>
                </div>
                <div>
                    <h3 class="font-bold">APEX Mentoring Session</h3>
                    <p class="text-xs text-gray-400">Sichere Video-Verbindung</p>
                </div>
            </div>
            <button onclick="app.closeMeetingModal()" class="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition">
                <i class="fas fa-phone-slash"></i>
            </button>
        </div>
        <div class="flex-1 bg-black">
            <iframe
                id="daily-iframe"
                src="${meetingUrl}"
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                class="w-full h-full border-0"
            ></iframe>
        </div>
        <div class="p-3 bg-brand-dark flex items-center justify-center gap-4">
            <button onclick="app.toggleFullscreen()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition flex items-center gap-2">
                <i class="fas fa-expand"></i>
                <span class="hidden sm:inline">Vollbild</span>
            </button>
            <button onclick="app.closeMeetingModal()" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2">
                <i class="fas fa-sign-out-alt"></i>
                <span>Meeting verlassen</span>
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close meeting modal
export function closeMeetingModal() {
    const modal = document.getElementById('video-meeting-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.innerHTML = ''; // Clear iframe
    }
    document.body.style.overflow = '';

    // Exit fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
}

// Toggle fullscreen for meeting
export function toggleFullscreen() {
    const modal = document.getElementById('video-meeting-modal');
    if (!modal) return;

    if (!document.fullscreenElement) {
        modal.requestFullscreen().catch(err => {
            logger.warn('Fullscreen not available:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function renderOrderProgress(status) {
    const steps = [
        { key: 'confirmed', label: 'Bestätigt', icon: 'fa-check' },
        { key: 'processing', label: 'In Bearbeitung', icon: 'fa-cog' },
        { key: 'review', label: 'Qualitätsprüfung', icon: 'fa-search' },
        { key: 'completed', label: 'Abgeschlossen', icon: 'fa-flag-checkered' }
    ];

    const statusOrder = ['confirmed', 'processing', 'review', 'completed'];
    const currentIndex = statusOrder.indexOf(status);

    return steps.map((step, index) => {
        const isCompleted = index <= currentIndex;
        const isCurrent = index === currentIndex;

        return `
            <div class="flex-1 flex flex-col items-center">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    isCompleted
                        ? 'bg-brand-gold text-brand-dark'
                        : 'bg-gray-200 text-gray-400'
                } ${isCurrent ? 'ring-2 ring-brand-gold ring-offset-2' : ''}">
                    <i class="fas ${step.icon}"></i>
                </div>
                <span class="text-[10px] mt-1 text-center ${isCompleted ? 'text-brand-dark font-medium' : 'text-gray-400'}">${step.label}</span>
            </div>
            ${index < steps.length - 1 ? `
                <div class="flex-1 h-0.5 ${index < currentIndex ? 'bg-brand-gold' : 'bg-gray-200'} mt-4"></div>
            ` : ''}
        `;
    }).join('');
}

function getOrderStatusInfo(status) {
    const statusMap = {
        'confirmed': {
            text: 'Bestätigt',
            class: 'paid',
            icon: 'fas fa-check-circle',
            description: 'Ihre Bestellung wurde bestätigt und wird in Kürze bearbeitet.'
        },
        'processing': {
            text: 'In Bearbeitung',
            class: 'processing',
            icon: 'fas fa-cog fa-spin',
            description: 'Unsere Experten arbeiten an Ihrem Auftrag.'
        },
        'review': {
            text: 'Qualitätsprüfung',
            class: 'processing',
            icon: 'fas fa-search',
            description: 'Ihr Dokument wird einer abschließenden Qualitätsprüfung unterzogen.'
        },
        'completed': {
            text: 'Abgeschlossen',
            class: 'paid',
            icon: 'fas fa-flag-checkered',
            description: 'Ihr Auftrag wurde erfolgreich abgeschlossen. Dokumente finden Sie im Vault.'
        },
        'cancelled': {
            text: 'Storniert',
            class: 'pending',
            icon: 'fas fa-times-circle',
            description: 'Diese Bestellung wurde storniert.'
        }
    };

    return statusMap[status] || statusMap['confirmed'];
}

export function hasCoachSession(order) {
    // Check for any mentoring/session products
    const sessionKeywords = ['Session', 'Mentoring', 'Coaching', 'Komplettpaket'];
    return order.items && order.items.some(item =>
        item.title && sessionKeywords.some(keyword => item.title.includes(keyword))
    );
}

export function getOrderStatusText(status) {
    const statusTexts = {
        'processing': 'In Bearbeitung',
        'confirmed': 'Bestätigt',
        'completed': 'Abgeschlossen',
        'cancelled': 'Storniert'
    };
    return statusTexts[status] || 'Unbekannt';
}

export function showAppointmentCalendar(orderId) {
    const calendar = document.getElementById('appointment-calendar');
    if (!calendar) return;

    calendar.classList.remove('hidden');

    const slots = generateTimeSlots(14);
    const slotsContainer = document.getElementById('calendar-slots');
    if (!slotsContainer) return;

    slotsContainer.innerHTML = slots.map(slot => `<button onclick="app.bookAppointment('${orderId}', '${slot.datetime}')" class="border-2 border-gray-300 p-3 rounded hover:border-brand-gold hover:bg-brand-gold/5 transition text-left group"><div class="font-bold text-sm group-hover:text-brand-gold transition">${slot.date}</div><div class="text-xs text-gray-600">${slot.time} Uhr</div></button>`).join('');

    setTimeout(() => {
        calendar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

export function generateTimeSlots(days) {
    const slots = [];
    const now = new Date();
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

    for (let d = 1; d <= days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);

        if (date.getDay() === 0 || date.getDay() === 6) continue;

        times.forEach(time => {
            slots.push({
                datetime: `${date.toISOString().split('T')[0]}T${time}`,
                date: date.toLocaleDateString('de-DE', {weekday: 'short', day: '2-digit', month: 'short'}),
                time: time
            });
        });
    }

    return slots;
}

export async function bookAppointment(state, orderId, datetime) {
    if (!confirm(`Termin am ${new Date(datetime).toLocaleString('de-DE', {weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'})} Uhr buchen?`)) {
        return;
    }

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointment: {
                    datetime: datetime,
                    status: 'confirmed',
                    bookedAt: new Date()
                }
            });

            showToast('✅ Termin gebucht!');
        } else {
            showToast('✅ Termin gebucht! (Demo-Modus)');
        }

        document.getElementById('appointment-calendar')?.classList.add('hidden');
        await loadUserOrders(state);
    } catch (e) {
        logger.error('Appointment booking failed:', e);
        showToast('❌ Terminbuchung fehlgeschlagen', 3000);
    }
}

// ========== APPOINTMENT PROPOSALS (Admin) ==========

export function showAppointmentProposalModal(orderId, userId, customerName, customerEmail) {
    const modal = document.getElementById('appointment-proposal-modal');
    if (!modal) return;

    // Set hidden fields
    document.getElementById('proposal-order-id').value = orderId;
    document.getElementById('proposal-user-id').value = userId;
    document.getElementById('proposal-customer-email').value = customerEmail;
    document.getElementById('proposal-customer-name').textContent = customerName;

    // Clear previous inputs
    document.getElementById('proposal-date-1').value = '';
    document.getElementById('proposal-time-1').value = '';
    document.getElementById('proposal-date-2').value = '';
    document.getElementById('proposal-time-2').value = '';
    document.getElementById('proposal-date-3').value = '';
    document.getElementById('proposal-time-3').value = '';
    document.getElementById('proposal-message').value = 'Vielen Dank für Ihre Bestellung! Bitte wählen Sie einen der folgenden Termine für unser persönliches Gespräch. Wir freuen uns auf Sie!';

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('proposal-date-1').min = today;
    document.getElementById('proposal-date-2').min = today;
    document.getElementById('proposal-date-3').min = today;

    modal.classList.remove('hidden');
}

export function closeAppointmentProposalModal() {
    const modal = document.getElementById('appointment-proposal-modal');
    if (modal) modal.classList.add('hidden');
}

export async function sendAppointmentProposals(state) {
    const orderId = document.getElementById('proposal-order-id')?.value;
    const userId = document.getElementById('proposal-user-id')?.value;
    const customerEmail = document.getElementById('proposal-customer-email')?.value;
    const message = document.getElementById('proposal-message')?.value || '';

    const date1 = document.getElementById('proposal-date-1')?.value;
    const time1 = document.getElementById('proposal-time-1')?.value;
    const date2 = document.getElementById('proposal-date-2')?.value;
    const time2 = document.getElementById('proposal-time-2')?.value;
    const date3 = document.getElementById('proposal-date-3')?.value;
    const time3 = document.getElementById('proposal-time-3')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens Vorschlag 1 ausfüllen', 3000);
        return;
    }

    const proposals = [];
    if (date1 && time1) proposals.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    if (date2 && time2) proposals.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    if (date3 && time3) proposals.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });

    try {
        if (db) {
            // Save proposals to order
            await updateDoc(doc(db, "orders", orderId), {
                appointmentProposals: proposals,
                appointmentProposalMessage: message,
                appointmentProposalSentAt: new Date(),
                appointmentStatus: 'pending'
            });

            // Call Cloud Function to send email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendAppointmentProposalEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId,
                        userId,
                        customerEmail,
                        proposals,
                        message
                    })
                });
                if (!response.ok) {
                    logger.warn('Email notification failed but proposals saved');
                }
            } catch (emailErr) {
                logger.warn('Email notification failed:', emailErr);
            }

            showToast('✅ Terminvorschläge gesendet!');
            closeAppointmentProposalModal();

            // Reload admin orders to show updated status
            if (typeof loadAdminOrders === 'function') {
                await loadAdminOrders(state);
            }
        }
    } catch (e) {
        logger.error('Failed to send appointment proposals:', e);
        showToast('❌ Fehler beim Senden', 3000);
    }
}

// ========== CUSTOMER: Accept/Decline Proposals ==========

// Store pending appointment data for modal confirmation
let pendingAppointmentConfirm = { orderId: null, datetime: null };
let pendingAppointmentDecline = { orderId: null };

export function showAppointmentConfirmModal(orderId, datetime) {
    pendingAppointmentConfirm = { orderId, datetime };

    // Format date and time for display
    const dateStr = new Date(datetime).toLocaleDateString('de-DE', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const timeStr = new Date(datetime).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit'
    }) + ' Uhr';

    const dateEl = document.getElementById('confirm-modal-date');
    const timeEl = document.getElementById('confirm-modal-time');
    const modal = document.getElementById('appointment-confirm-modal');

    if (dateEl) dateEl.textContent = dateStr;
    if (timeEl) timeEl.textContent = timeStr;
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        logger.error('Confirm modal not found');
    }
}

export function closeAppointmentConfirmModal() {
    const modal = document.getElementById('appointment-confirm-modal');
    if (modal) modal.classList.add('hidden');
    pendingAppointmentConfirm = { orderId: null, datetime: null };
}

export async function confirmAppointmentFromModal(state) {
    const { orderId, datetime } = pendingAppointmentConfirm;
    if (!orderId || !datetime) return;

    closeAppointmentConfirmModal();

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointment: {
                    datetime: datetime,
                    confirmed: true,
                    confirmedAt: new Date()
                },
                appointmentStatus: 'confirmed'
            });

            // Notify admin via email
            try {
                await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminAppointmentAccepted', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        datetime: datetime,
                        orderId: orderId
                    })
                });
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }

            showToast('✅ Termin bestätigt!');
            await loadUserOrders(state);
        }
    } catch (e) {
        logger.error('Failed to accept appointment:', e);
        showToast('❌ Fehler beim Bestätigen', 3000);
    }
}

export function showAppointmentDeclineModal(orderId) {
    pendingAppointmentDecline = { orderId };
    const reasonInput = document.getElementById('decline-reason-input');
    const modal = document.getElementById('appointment-decline-modal');

    if (reasonInput) reasonInput.value = '';
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        logger.error('Decline modal not found');
    }
}

export function closeAppointmentDeclineModal() {
    const modal = document.getElementById('appointment-decline-modal');
    if (modal) modal.classList.add('hidden');
    pendingAppointmentDecline = { orderId: null };
}

export async function confirmDeclineFromModal(state) {
    const { orderId } = pendingAppointmentDecline;
    if (!orderId) return;

    const reason = document.getElementById('decline-reason-input').value.trim();
    closeAppointmentDeclineModal();

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointmentStatus: 'declined',
                appointmentDeclineReason: reason || 'Keine Angabe',
                appointmentDeclinedAt: new Date()
            });

            // Notify admin via email
            try {
                await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminAppointmentDeclined', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        reason: reason || 'Keine Angabe',
                        orderId: orderId
                    })
                });
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }

            showToast('Wir melden uns mit neuen Terminvorschlägen.');
            await loadUserOrders(state);
        }
    } catch (e) {
        logger.error('Failed to decline appointments:', e);
        showToast('❌ Fehler', 3000);
    }
}

// Legacy function names for backwards compatibility
export function acceptAppointmentProposal(state, orderId, datetime) {
    showAppointmentConfirmModal(orderId, datetime);
}

export function declineAllAppointmentProposals(state, orderId) {
    showAppointmentDeclineModal(orderId);
}

// ========== MENTOR APPOINTMENT SELECTION ==========

// Open modal to select appointment from mentor's availability
export async function openMentorAppointmentModal(orderId, coachId) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('mentor-appointment-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mentor-appointment-modal';
        modal.className = 'fixed inset-0 z-50 hidden overflow-y-auto';
        document.body.appendChild(modal);
    }

    // Show loading state
    modal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
                <div class="p-8 text-center">
                    <i class="fas fa-spinner fa-spin text-4xl text-brand-gold mb-4"></i>
                    <p class="text-gray-600">Lade Verfügbarkeiten...</p>
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
        // Load mentor data and availability
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        if (!coachDoc.exists()) {
            throw new Error('Mentor nicht gefunden');
        }

        const coach = { id: coachId, ...coachDoc.data() };
        const availability = coach.availability || {};

        // Get available slots in the next 4 weeks
        const availableSlots = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 28; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() + i);
            const dateKey = checkDate.toISOString().split('T')[0];

            if (availability[dateKey] && availability[dateKey].length > 0) {
                availability[dateKey].forEach(time => {
                    const slotDateTime = new Date(`${dateKey}T${time}`);
                    // Only show future slots
                    if (slotDateTime > new Date()) {
                        availableSlots.push({
                            date: dateKey,
                            time: time,
                            datetime: `${dateKey}T${time}`,
                            display: {
                                weekday: checkDate.toLocaleDateString('de-DE', { weekday: 'long' }),
                                date: checkDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' }),
                                time: time
                            }
                        });
                    }
                });
            }
        }

        // Render modal content
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) app.closeMentorAppointmentModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5 flex-shrink-0">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                                    <i class="fas fa-calendar-check text-brand-gold text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="font-serif text-lg font-bold">Termin auswählen</h3>
                                    <p class="text-gray-400 text-sm">mit ${sanitizeHTML(coach.name)}</p>
                                </div>
                            </div>
                            <button onclick="app.closeMentorAppointmentModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                                <i class="fas fa-times text-gray-400"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Executive Info -->
                    <div class="bg-amber-50 border-b border-amber-200 p-4 flex-shrink-0">
                        <div class="flex items-start gap-2">
                            <i class="fas fa-lightbulb text-amber-600 mt-0.5"></i>
                            <p class="text-xs text-amber-800">
                                <strong>Tipp:</strong> Als Executive sind unsere Mentoren meist <strong>ab 18:00 Uhr</strong> verfügbar.
                                Die Termine werden wöchentlich aktualisiert.
                            </p>
                        </div>
                    </div>

                    <!-- Available Slots -->
                    <div class="flex-1 overflow-y-auto p-4">
                        ${availableSlots.length > 0 ? `
                            <p class="text-sm text-gray-600 mb-4">
                                <i class="fas fa-calendar-alt mr-1 text-brand-gold"></i>
                                <strong>${availableSlots.length}</strong> verfügbare Termine gefunden
                            </p>
                            <div class="space-y-2">
                                ${availableSlots.map(slot => `
                                    <button onclick="app.selectMentorAppointment('${orderId}', '${slot.datetime}', true)"
                                            class="w-full flex items-center p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group">
                                        <div class="w-12 h-12 bg-white rounded-lg flex flex-col items-center justify-center border border-gray-200 shadow-sm flex-shrink-0 group-hover:border-green-400">
                                            <span class="text-xs text-gray-500">${slot.display.weekday.slice(0, 2)}</span>
                                            <span class="text-lg font-bold text-brand-dark">${slot.display.date.split(' ')[0]}</span>
                                        </div>
                                        <div class="flex-1 text-left ml-4">
                                            <p class="font-semibold text-brand-dark">${slot.display.weekday}, ${slot.display.date}</p>
                                            <p class="text-sm text-gray-500">
                                                <i class="fas fa-clock mr-1"></i>${slot.display.time} Uhr
                                            </p>
                                        </div>
                                        <div class="flex-shrink-0">
                                            <i class="fas fa-chevron-right text-gray-300 group-hover:text-green-500 transition-colors"></i>
                                        </div>
                                    </button>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-8">
                                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <i class="fas fa-calendar-times text-gray-400 text-2xl"></i>
                                </div>
                                <h4 class="font-bold text-gray-700 mb-2">Keine Termine verfügbar</h4>
                                <p class="text-sm text-gray-500 mb-4">Der Mentor hat aktuell keine freien Termine eingetragen.</p>
                            </div>
                        `}
                    </div>

                    <!-- Alternative Proposal Section -->
                    <div class="border-t border-gray-100 p-4 bg-gray-50 flex-shrink-0">
                        <button onclick="app.showAlternativeProposalForm('${orderId}', '${coachId}')"
                                class="w-full text-center text-sm text-gray-600 hover:text-brand-dark py-2 flex items-center justify-center gap-2 transition">
                            <i class="fas fa-plus-circle"></i>
                            <span>Keiner passt? Eigenen Terminvorschlag senden</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        logger.error('Error loading mentor appointments:', e);
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
                    <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
                    <h3 class="font-bold text-gray-800 mb-2">Fehler beim Laden</h3>
                    <p class="text-sm text-gray-600 mb-4">${e.message}</p>
                    <button onclick="app.closeMentorAppointmentModal()" class="btn-primary">Schließen</button>
                </div>
            </div>
        `;
    }
}

// Close mentor appointment modal
export function closeMentorAppointmentModal() {
    const modal = document.getElementById('mentor-appointment-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Select and confirm appointment from mentor availability
// mentorAlreadyAssigned = true means admin already assigned the mentor, so no compliance check needed
export async function selectMentorAppointment(orderId, datetime, mentorAlreadyAssigned = true) {
    // Show professional confirmation modal
    // Skip compliance check if mentor was already assigned by admin
    showBookingConfirmationModal(orderId, datetime, mentorAlreadyAssigned);
}

// Show professional booking confirmation modal
// skipComplianceCheck = true when mentor was already assigned by admin
function showBookingConfirmationModal(orderId, datetime, skipComplianceCheck = false) {
    const dateObj = new Date(datetime);
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const formattedTime = dateObj.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Create modal
    let confirmModal = document.getElementById('booking-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'booking-confirm-modal';
        document.body.appendChild(confirmModal);
    }

    // Compliance check section - only shown if NOT skipped
    const complianceSection = skipComplianceCheck ? '' : `
        <!-- Compliance Check Info Box -->
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas fa-shield-alt text-amber-600 text-sm"></i>
                </div>
                <div>
                    <h4 class="font-semibold text-amber-800 text-sm mb-1">Compliance-Check erforderlich</h4>
                    <p class="text-amber-700 text-xs leading-relaxed">
                        Vor der finalen Terminbestätigung führen wir einen kurzen Compliance-Check durch,
                        um sicherzustellen, dass wir Ihnen den bestmöglichen Service bieten können.
                        Sie erhalten innerhalb von 24 Stunden eine Bestätigung per E-Mail.
                    </p>
                </div>
            </div>
        </div>

        <!-- Compliance Consent Checkbox -->
        <label class="flex items-start gap-3 cursor-pointer mb-6 group">
            <input type="checkbox" id="compliance-consent-checkbox"
                   onchange="app.toggleBookingButton()"
                   class="w-5 h-5 mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold cursor-pointer">
            <span class="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                Ich stimme dem <strong>Compliance-Check</strong> zu und verstehe, dass die endgültige
                Terminbestätigung nach erfolgreicher Prüfung per E-Mail erfolgt.
            </span>
        </label>
    `;

    // Simple confirmation text when compliance check is skipped
    const simpleConfirmation = skipComplianceCheck ? `
        <p class="text-gray-600 text-sm mb-6">
            Möchten Sie diesen Termin verbindlich buchen? Nach der Bestätigung erhalten Sie und Ihr Mentor eine Benachrichtigung.
        </p>
    ` : '';

    // Button state depends on whether compliance check is needed
    const buttonDisabled = skipComplianceCheck ? '' : 'disabled';
    const buttonClass = skipComplianceCheck
        ? 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer'
        : 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';

    confirmModal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onclick="if(event.target === this) app.closeBookingConfirmModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                            <i class="fas fa-calendar-check text-brand-gold text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-serif text-lg font-bold">Termin bestätigen</h3>
                            <p class="text-gray-300 text-sm">Verbindliche Buchung</p>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Appointment Details -->
                    <div class="bg-gray-50 rounded-xl p-4 mb-4">
                        <div class="flex items-center gap-3 mb-3">
                            <i class="fas fa-calendar text-brand-gold"></i>
                            <span class="font-medium">${formattedDate}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <i class="fas fa-clock text-brand-gold"></i>
                            <span class="font-medium">${formattedTime} Uhr</span>
                        </div>
                    </div>

                    ${simpleConfirmation}
                    ${complianceSection}

                    <!-- Buttons -->
                    <div class="flex gap-3">
                        <button onclick="app.closeBookingConfirmModal()"
                                class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                            Abbrechen
                        </button>
                        <button id="confirm-booking-btn"
                                onclick="app.confirmBooking('${orderId}', '${datetime}')"
                                ${buttonDisabled}
                                class="${buttonClass}">
                            <i class="fas fa-check mr-2"></i>Bestätigen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    confirmModal.classList.remove('hidden');
}

// Toggle booking button based on compliance consent
export function toggleBookingButton() {
    const checkbox = document.getElementById('compliance-consent-checkbox');
    const button = document.getElementById('confirm-booking-btn');

    if (checkbox && button) {
        if (checkbox.checked) {
            button.disabled = false;
            button.className = 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer';
        } else {
            button.disabled = true;
            button.className = 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';
        }
    }
}

// Close booking confirmation modal
export function closeBookingConfirmModal() {
    const modal = document.getElementById('booking-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.innerHTML = '';
    }
}

// Show compliance check modal before adding mentoring session to cart
export function bookSessionWithComplianceCheck(productName, price, coachName) {
    // Create modal
    let confirmModal = document.getElementById('booking-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'booking-confirm-modal';
        document.body.appendChild(confirmModal);
    }

    confirmModal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onclick="if(event.target === this) app.closeBookingConfirmModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                            <i class="fas fa-user-tie text-brand-gold text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-serif text-lg font-bold">Mentoring Session</h3>
                            <p class="text-gray-300 text-sm">${coachName ? `mit ${coachName}` : 'Executive Coaching'}</p>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Product Details -->
                    <div class="bg-gray-50 rounded-xl p-4 mb-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="font-semibold text-brand-dark">${productName}</p>
                                <p class="text-sm text-gray-500">60 Minuten 1:1 Session</p>
                            </div>
                            <p class="text-xl font-bold text-brand-gold">€${price}</p>
                        </div>
                    </div>

                    <!-- Compliance Check Info Box -->
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                <i class="fas fa-shield-alt text-amber-600 text-sm"></i>
                            </div>
                            <div>
                                <h4 class="font-semibold text-amber-800 text-sm mb-1">Compliance-Check erforderlich</h4>
                                <p class="text-amber-700 text-xs leading-relaxed">
                                    Nach Ihrer Bestellung führen wir einen Compliance-Check durch, um Interessenkonflikte
                                    auszuschließen (z.B. gleiche Branche, Wettbewerber). Bei erfolgreicher Prüfung wird
                                    <strong>${coachName || 'Ihr Wunschkandidat'}</strong> Ihr Mentor. Andernfalls wählen wir
                                    einen gleichwertigen Mentor für Sie aus.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Compliance Consent Checkbox -->
                    <label class="flex items-start gap-3 cursor-pointer mb-6 group">
                        <input type="checkbox" id="compliance-consent-checkbox"
                               onchange="app.toggleSessionBookingButton()"
                               class="w-5 h-5 mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold cursor-pointer">
                        <span class="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                            Ich stimme dem <strong>Compliance-Check</strong> zu und verstehe, dass bei erfolgreicher
                            Prüfung ${coachName || 'mein Wunschkandidat'} mein Mentor wird, andernfalls ein gleichwertiger Mentor.
                        </span>
                    </label>

                    <!-- Buttons -->
                    <div class="flex gap-3">
                        <button onclick="app.closeBookingConfirmModal()"
                                class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                            Abbrechen
                        </button>
                        <button id="confirm-session-btn"
                                onclick="app.confirmSessionBooking('${productName}', ${price})"
                                disabled
                                class="flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200">
                            <i class="fas fa-shopping-cart mr-2"></i>In den Warenkorb
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    confirmModal.classList.remove('hidden');
}

// Toggle session booking button based on compliance consent
export function toggleSessionBookingButton() {
    const checkbox = document.getElementById('compliance-consent-checkbox');
    const button = document.getElementById('confirm-session-btn');

    if (checkbox && button) {
        if (checkbox.checked) {
            button.disabled = false;
            button.className = 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer';
        } else {
            button.disabled = true;
            button.className = 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';
        }
    }
}

// Confirm session booking after compliance consent
export function confirmSessionBooking(productName, price) {
    closeBookingConfirmModal();
    // addToCart requires state as first parameter
    if (window.app?.state) {
        addToCart(window.app.state, productName, price);
        showToast('✅ Session zum Warenkorb hinzugefügt');
    } else {
        showToast('❌ Fehler beim Hinzufügen zum Warenkorb');
    }
}

// Actually confirm and save the booking
export async function confirmBooking(orderId, datetime) {
    const confirmBtn = document.querySelector('#booking-confirm-modal button:last-child');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird gebucht...';
    }

    try {
        // ========== VERFÜGBARKEITS-CHECK: Prüfe ob Mentor noch frei ist ==========
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (!orderDoc.exists()) {
            throw new Error('Order nicht gefunden');
        }
        const orderData = orderDoc.data();
        const coachId = orderData.assignedCoachId;

        if (coachId) {
            // Prüfe ob bereits eine andere Buchung für diesen Zeitslot existiert
            const appointmentDate = new Date(datetime);
            const dateKey = appointmentDate.toISOString().split('T')[0];
            const timeKey = appointmentDate.toTimeString().slice(0, 5);

            const conflictQuery = query(
                collection(db, 'orders'),
                where('assignedCoachId', '==', coachId),
                where('appointmentStatus', '==', 'confirmed')
            );
            const conflictSnapshot = await getDocs(conflictQuery);

            let hasConflict = false;
            conflictSnapshot.forEach(docSnap => {
                if (docSnap.id !== orderId) { // Ignoriere aktuelle Order
                    const existingAppointment = docSnap.data().appointment?.datetime;
                    if (existingAppointment) {
                        const existingDate = new Date(existingAppointment);
                        const existingDateKey = existingDate.toISOString().split('T')[0];
                        const existingTimeKey = existingDate.toTimeString().slice(0, 5);

                        if (existingDateKey === dateKey && existingTimeKey === timeKey) {
                            hasConflict = true;
                        }
                    }
                }
            });

            if (hasConflict) {
                showToast('⚠️ Dieser Termin ist leider nicht mehr verfügbar. Bitte wählen Sie einen anderen.', 5000);
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Bestätigen';
                }
                return;
            }
        }

        // ========== MEETING-RAUM ERSTELLEN ==========
        try {
            const meetingResponse = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createMeetingRoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    appointmentDatetime: datetime,
                    customerName: orderData.customerName,
                    mentorName: orderData.assignedCoachName
                })
            });
            if (meetingResponse.ok) {
                logger.log('Meeting room created for order:', orderId);
            }
        } catch (meetingError) {
            logger.warn('Failed to pre-create meeting room:', meetingError);
            // Nicht kritisch - Meeting kann auch später erstellt werden
        }

        await updateDoc(doc(db, 'orders', orderId), {
            appointment: {
                datetime: datetime,
                confirmed: true,
                bookedAt: serverTimestamp()
            },
            appointmentStatus: 'confirmed'
        });

        closeBookingConfirmModal();
        closeMentorAppointmentModal();
        showToast('✅ Termin erfolgreich gebucht!');

        // Reload orders to show updated state
        if (window.app?.state?.user) {
            loadUserOrders(window.app.state);
        }

    } catch (e) {
        logger.error('Error booking appointment:', e);
        showToast('❌ Fehler bei der Buchung. Bitte versuchen Sie es erneut.');

        // Re-enable button on error
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Bestätigen';
        }
    }
}

// Show form to propose alternative appointment
export function showAlternativeProposalForm(orderId, coachId) {
    const modal = document.getElementById('mentor-appointment-modal');
    if (!modal) return;

    // Get minimum date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    // Get maximum date (8 weeks from now)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 56);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) app.closeMentorAppointmentModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-brand-gold/20 rounded-full flex items-center justify-center">
                                <i class="fas fa-paper-plane text-brand-gold"></i>
                            </div>
                            <div>
                                <h3 class="font-serif text-lg font-bold">Terminvorschlag senden</h3>
                            </div>
                        </div>
                        <button onclick="app.closeMentorAppointmentModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                            <i class="fas fa-times text-gray-400"></i>
                        </button>
                    </div>
                </div>

                <!-- Info -->
                <div class="bg-blue-50 border-b border-blue-200 p-4">
                    <div class="flex items-start gap-2">
                        <i class="fas fa-info-circle text-blue-600 mt-0.5"></i>
                        <p class="text-xs text-blue-800">
                            Schlagen Sie bis zu 3 alternative Termine vor. Der Mentor wird diese prüfen und sich bei Ihnen melden.
                            <strong>Empfehlung: Ab 18:00 Uhr.</strong>
                        </p>
                    </div>
                </div>

                <!-- Form -->
                <form id="alternative-proposal-form" class="p-5 space-y-4">
                    <input type="hidden" id="proposal-order-id" value="${orderId}">
                    <input type="hidden" id="proposal-coach-id" value="${coachId}">

                    <!-- Proposal 1 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">1. Wunschtermin *</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-1" min="${minDate}" max="${maxDateStr}" required
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-1" required
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00" selected>18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Proposal 2 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">2. Wunschtermin (optional)</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-2" min="${minDate}" max="${maxDateStr}"
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-2"
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00">18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Proposal 3 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">3. Wunschtermin (optional)</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-3" min="${minDate}" max="${maxDateStr}"
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-3"
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00">18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Note -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">Nachricht (optional)</label>
                        <textarea id="proposal-note" rows="2" placeholder="z.B. Ich bin flexibel bei den Uhrzeiten..."
                                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none"></textarea>
                    </div>
                </form>

                <!-- Actions -->
                <div class="border-t border-gray-100 p-4 bg-gray-50 flex gap-3">
                    <button onclick="app.openMentorAppointmentModal('${orderId}', '${coachId}')"
                            class="flex-1 py-2.5 text-gray-600 hover:text-gray-800 transition text-sm font-medium">
                        <i class="fas fa-arrow-left mr-1"></i> Zurück
                    </button>
                    <button onclick="app.submitAlternativeProposal()"
                            class="flex-1 bg-brand-gold hover:bg-amber-500 text-brand-dark font-bold py-2.5 rounded-lg transition text-sm">
                        <i class="fas fa-paper-plane mr-1"></i> Senden
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Submit alternative appointment proposal
export async function submitAlternativeProposal() {
    const orderId = document.getElementById('proposal-order-id')?.value;
    const date1 = document.getElementById('proposal-date-1')?.value;
    const time1 = document.getElementById('proposal-time-1')?.value;
    const date2 = document.getElementById('proposal-date-2')?.value;
    const time2 = document.getElementById('proposal-time-2')?.value;
    const date3 = document.getElementById('proposal-date-3')?.value;
    const time3 = document.getElementById('proposal-time-3')?.value;
    const note = document.getElementById('proposal-note')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens den 1. Wunschtermin ausfüllen');
        return;
    }

    const customerProposals = [];
    if (date1 && time1) {
        customerProposals.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    }
    if (date2 && time2) {
        customerProposals.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    }
    if (date3 && time3) {
        customerProposals.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });
    }

    try {
        await updateDoc(doc(db, 'orders', orderId), {
            customerProposals: customerProposals,
            customerProposalNote: note || '',
            customerProposalSubmittedAt: serverTimestamp(),
            appointmentStatus: 'customer_proposed'
        });

        closeMentorAppointmentModal();
        showToast('✅ Terminvorschläge gesendet! Wir melden uns.');

        // Reload orders
        if (window.app?.state?.user) {
            loadUserOrders(window.app.state);
        }

    } catch (e) {
        logger.error('Error submitting proposal:', e);
        showToast('❌ Fehler beim Senden. Bitte versuchen Sie es erneut.');
    }
}

// ========== AVAILABILITY ==========

export async function saveAvailability(state) {
    const date1 = document.getElementById('availability-date-1')?.value;
    const time1 = document.getElementById('availability-time-1')?.value;
    const date2 = document.getElementById('availability-date-2')?.value;
    const time2 = document.getElementById('availability-time-2')?.value;
    const date3 = document.getElementById('availability-date-3')?.value;
    const time3 = document.getElementById('availability-time-3')?.value;
    const notes = document.getElementById('availability-notes')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens den 1. Wunschtermin ausfüllen', 3000);
        return;
    }

    if (!state.user) {
        showToast('⚠️ Bitte registrieren Sie sich oder melden Sie sich an', 3000);
        return;
    }

    const availability = {
        slots: [],
        notes: notes || '',
        submittedAt: new Date()
    };

    if (date1 && time1) {
        availability.slots.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    }
    if (date2 && time2) {
        availability.slots.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    }
    if (date3 && time3) {
        availability.slots.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });
    }

    try {
        if (db) {
            await setDoc(doc(db, "availability", state.user.uid), availability, { merge: true });
            showToast('✅ Verfügbarkeit gespeichert!');
        } else {
            showToast('✅ Verfügbarkeit gespeichert! (Demo-Modus)');
        }

        // Show success message
        const savedInfo = document.getElementById('availability-saved-info');
        if (savedInfo) {
            savedInfo.classList.remove('hidden');
            setTimeout(() => savedInfo.classList.add('hidden'), 5000);
        }

        // Clear form
        clearAvailabilityForm();

    } catch (e) {
        logger.error('Availability save failed:', e);
        showToast('❌ Speichern fehlgeschlagen', 3000);
    }
}

function clearAvailabilityForm() {
    document.getElementById('availability-date-1').value = '';
    document.getElementById('availability-time-1').value = '';
    document.getElementById('availability-date-2').value = '';
    document.getElementById('availability-time-2').value = '';
    document.getElementById('availability-date-3').value = '';
    document.getElementById('availability-time-3').value = '';
    document.getElementById('availability-notes').value = '';
}

export async function loadAvailability(state) {
    if (!db || !state.user) return;

    const container = document.getElementById('upcoming-appointments');
    if (!container) return;

    try {
        const now = new Date();
        let confirmedAppointments = [];
        let pendingSlots = [];
        let availabilityNotes = '';

        // 1. Load confirmed appointments from orders (filter client-side due to Firestore rules)
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid)
        );
        const ordersSnapshot = await getDocs(ordersQuery);

        ordersSnapshot.forEach(docSnap => {
            const order = docSnap.data();

            // Filter for confirmed appointments client-side
            // Check both appointmentStatus AND appointment.confirmed for robustness
            const hasConfirmedAppointment = (order.appointmentStatus === 'confirmed' || order.appointment?.confirmed === true)
                && order.appointment?.datetime;

            if (hasConfirmedAppointment) {
                const appointmentDate = new Date(order.appointment.datetime);
                if (appointmentDate >= now) {
                    confirmedAppointments.push({
                        datetime: order.appointment.datetime,
                        packageName: order.packageName || order.items?.[0]?.name || 'Termin',
                        orderId: docSnap.id
                    });
                }
            }
        });

        // Sort confirmed appointments by date
        confirmedAppointments.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

        // 2. Load availability/wish slots
        const availDoc = await getDoc(doc(db, "availability", state.user.uid));
        if (availDoc.exists()) {
            const data = availDoc.data();
            const slots = data.slots || [];
            availabilityNotes = data.notes || '';
            pendingSlots = slots.filter(slot => new Date(slot.datetime) >= now);
        }

        // 3. Render both sections
        if (confirmedAppointments.length > 0 || pendingSlots.length > 0) {
            container.innerHTML = `
                <div class="space-y-6">
                    ${confirmedAppointments.length > 0 ? `
                        <div>
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                                <i class="fas fa-calendar-check text-green-600 mr-2"></i>
                                Bestätigte Termine
                            </h3>
                            <div class="space-y-3">
                                ${confirmedAppointments.map(apt => {
                                    const date = new Date(apt.datetime);
                                    const dateStr = date.toLocaleDateString('de-DE', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                    const timeStr = date.toLocaleTimeString('de-DE', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                    return `
                                        <div class="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-200">
                                            <div class="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                                                <i class="fas fa-check text-white text-lg"></i>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="font-semibold text-gray-900">${dateStr}</div>
                                                <div class="text-sm text-gray-600">${timeStr} Uhr</div>
                                                <div class="text-xs text-green-700 mt-1 truncate">${apt.packageName}</div>
                                            </div>
                                            <div class="flex-shrink-0">
                                                <span class="inline-flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-full font-medium">
                                                    <i class="fas fa-check-circle"></i>
                                                    Bestätigt
                                                </span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${pendingSlots.length > 0 ? `
                        <div>
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                                <i class="fas fa-clock text-brand-gold mr-2"></i>
                                Ihre Wunschtermine
                            </h3>
                            <div class="space-y-3">
                                ${pendingSlots.map((slot, index) => {
                                    const date = new Date(slot.datetime);
                                    const dateStr = date.toLocaleDateString('de-DE', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                    const timeStr = date.toLocaleTimeString('de-DE', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                    return `
                                        <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="w-10 h-10 bg-brand-gold/20 rounded-lg flex items-center justify-center">
                                                <span class="text-brand-gold font-bold">${index + 1}</span>
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-medium text-gray-900">${dateStr}</div>
                                                <div class="text-sm text-gray-500">${timeStr} Uhr</div>
                                            </div>
                                            <span class="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-medium">
                                                Wartet auf Bestätigung
                                            </span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${availabilityNotes ? `
                                <div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                    <i class="fas fa-info-circle mr-2"></i>
                                    <strong>Hinweis:</strong> ${availabilityNotes}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
            return;
        }

        // Empty state wenn keine Termine
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-calendar-alt text-2xl text-gray-400"></i>
                </div>
                <h3 class="font-bold text-gray-700 mb-2">Keine anstehenden Termine</h3>
                <p class="text-sm text-gray-500">Geben Sie unten Ihre Wunschtermine an</p>
            </div>
        `;
    } catch (e) {
        logger.error('Failed to load availability:', e);
    }
}

export function showAvailabilitySection() {
    const section = document.getElementById('availability-section');
    if (section) {
        section.classList.remove('hidden');
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

// ========== FILE UPLOAD ==========

export async function handleFileUpload(state, input) {
    const file = input.files?.[0];
    if(!file) return;

    const uiDefault = document.getElementById('upload-ui-default');
    const uiLoading = document.getElementById('upload-ui-loading');
    const fileList = document.getElementById('file-list');

    if(!uiDefault || !uiLoading || !fileList) return;

    if(file.type !== 'application/pdf') {
        showToast('❌ Nur PDF-Dateien sind erlaubt', 3000);
        input.value = '';
        return;
    }

    if(file.size > 10 * 1024 * 1024) {
        showToast('❌ Datei zu groß (max. 10MB)', 3000);
        input.value = '';
        return;
    }

    uiDefault.classList.add('hidden');
    uiLoading.classList.remove('hidden');

    try {
        if (storage && state.user) {
            const storageRef = ref(storage, `users/${state.user.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);

            // Notify admin via email
            try {
                await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminDocumentUploaded', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        documentName: file.name
                    })
                });
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }
        } else {
            await new Promise(r => setTimeout(r, 1500));
        }

        const fileItem = document.createElement('div');
        fileItem.className = 'flex justify-between items-center p-3 bg-green-50 text-xs rounded border border-green-200';
        fileItem.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-check-circle text-green-600" aria-hidden="true"></i>${sanitizeHTML(file.name)}</span><span class="text-green-700 font-bold">Gesichert</span>`;
        fileList.appendChild(fileItem);

        showToast('✅ Datei erfolgreich hochgeladen');
    } catch(e) {
        logger.error('Upload error:', e);
        showToast('❌ Upload fehlgeschlagen', 3000);
    } finally {
        uiDefault.classList.remove('hidden');
        uiLoading.classList.add('hidden');
        input.value = '';
    }
}

// ========== MENTOR DASHBOARD ==========

// State for availability calendar
let currentWeekOffset = 0;
let mentorAvailability = {};
let mentorBookedSlots = {};

// Initialize mentor dashboard when tab is switched
export async function initMentorDashboard() {
    if (!currentMentorData) return;

    // Update welcome name
    const welcomeName = document.getElementById('mentor-welcome-name');
    if (welcomeName) {
        welcomeName.textContent = `Willkommen, ${currentMentorData.name}`;
    }

    // Load availability from Firestore
    mentorAvailability = currentMentorData.availability || {};

    // Load booked sessions to show in calendar
    await loadMentorBookedSlots();

    // Render calendar
    renderAvailabilityCalendar();

    // Load mentor sessions
    await loadMentorSessions();
}

// Load booked slots for the mentor
async function loadMentorBookedSlots() {
    if (!db || !currentMentorData) return;

    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', currentMentorData.id));
        const snapshot = await getDocs(q);

        mentorBookedSlots = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                const dt = new Date(order.appointment.datetime);
                const dateKey = dt.toISOString().split('T')[0];
                const timeKey = dt.toTimeString().slice(0, 5);
                if (!mentorBookedSlots[dateKey]) {
                    mentorBookedSlots[dateKey] = [];
                }
                mentorBookedSlots[dateKey].push(timeKey);
            }
        });
    } catch (e) {
        logger.error('Error loading booked slots:', e);
    }
}

// Render the availability calendar
function renderAvailabilityCalendar() {
    const container = document.getElementById('availability-calendar');
    const weekLabel = document.getElementById('availability-week-label');
    if (!container) return;

    // Calculate week dates
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (currentWeekOffset * 7)); // Monday

    // Update week label
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = startOfWeek.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    if (weekLabel) {
        weekLabel.textContent = `KW ${weekNumber} - ${monthName}`;
    }

    // Time slots (9:00 - 21:00)
    const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

    // Days of the week
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
    }

    // Build calendar HTML
    let html = `
        <table class="w-full border-collapse">
            <thead>
                <tr>
                    <th class="p-2 text-xs text-gray-500 font-medium"></th>
                    ${days.map(d => `
                        <th class="p-2 text-center ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''}">
                            <div class="text-xs text-gray-500 font-medium">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                            <div class="text-sm font-bold ${isToday(d) ? 'text-brand-gold' : 'text-gray-700'}">${d.getDate()}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(time => {
        html += `<tr>`;
        html += `<td class="p-2 text-xs text-gray-500 font-medium text-right pr-3">${time}</td>`;

        days.forEach(d => {
            const dateKey = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isAvailable = mentorAvailability[dateKey]?.includes(time);
            const isBooked = mentorBookedSlots[dateKey]?.includes(time);
            const isPast = d < new Date() && !isToday(d);

            let cellClass = 'p-1';
            let slotClass = 'w-full h-8 rounded cursor-pointer transition-all ';

            if (isPast) {
                slotClass += 'bg-gray-100 cursor-not-allowed';
            } else if (isBooked) {
                slotClass += 'bg-blue-500 hover:bg-blue-600';
            } else if (isAvailable) {
                slotClass += 'bg-green-500 hover:bg-green-600';
            } else {
                slotClass += 'bg-gray-200 hover:bg-gray-300';
            }

            if (isWeekend) {
                cellClass += ' bg-gray-50';
            }

            const clickHandler = isPast || isBooked ? '' : `onclick="app.toggleTimeSlot('${dateKey}', '${time}')"`;

            html += `<td class="${cellClass}">
                <div class="${slotClass}" ${clickHandler} title="${isBooked ? 'Gebucht' : isAvailable ? 'Verfügbar - Klicken zum Entfernen' : 'Nicht verfügbar - Klicken zum Hinzufügen'}"></div>
            </td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Helper: Check if date is today
function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// Helper: Get ISO week number
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Toggle time slot availability
export function toggleTimeSlot(dateKey, time) {
    if (!mentorAvailability[dateKey]) {
        mentorAvailability[dateKey] = [];
    }

    const index = mentorAvailability[dateKey].indexOf(time);
    if (index > -1) {
        mentorAvailability[dateKey].splice(index, 1);
        if (mentorAvailability[dateKey].length === 0) {
            delete mentorAvailability[dateKey];
        }
    } else {
        mentorAvailability[dateKey].push(time);
        mentorAvailability[dateKey].sort();
    }

    renderAvailabilityCalendar();
}

// Navigate to previous week
export function prevWeek() {
    currentWeekOffset--;
    renderAvailabilityCalendar();
}

// Navigate to next week
export function nextWeek() {
    currentWeekOffset++;
    renderAvailabilityCalendar();
}

// Save mentor availability to Firestore
export async function saveMentorAvailability() {
    if (!db || !currentMentorData) {
        showToast('❌ Fehler: Nicht als Mentor angemeldet');
        return;
    }

    try {
        await updateDoc(doc(db, 'coaches', currentMentorData.id), {
            availability: mentorAvailability
        });
        currentMentorData.availability = mentorAvailability;
        showToast('✅ Verfügbarkeit gespeichert');
    } catch (e) {
        logger.error('Error saving availability:', e);
        showToast('❌ Fehler beim Speichern');
    }
}

// Load mentor's assigned sessions
async function loadMentorSessions() {
    if (!db || !currentMentorData) return;

    const container = document.getElementById('mentor-sessions-list');
    const countBadge = document.getElementById('mentor-session-count');
    if (!container) return;

    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', currentMentorData.id));
        const snapshot = await getDocs(q);

        const sessions = [];
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                sessions.push({
                    id: doc.id,
                    ...order
                });
            }
        });

        // Sort by appointment date
        sessions.sort((a, b) => new Date(a.appointment.datetime) - new Date(b.appointment.datetime));

        // Update count
        if (countBadge) {
            countBadge.textContent = sessions.length;
        }

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="fas fa-calendar-check text-4xl text-gray-300 mb-3"></i>
                    <p>Keine Sessions zugewiesen</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const dt = new Date(session.appointment.datetime);
            const dateStr = dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const isPast = dt < new Date();
            const canJoin = isMeetingTimeNow(session.appointment.datetime);

            return `
                <div class="p-4 hover:bg-gray-50 transition ${isPast ? 'opacity-60' : ''}">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-brand-dark">${sanitizeHTML(session.customerName || 'Kunde')}</h4>
                            <p class="text-sm text-gray-600">${sanitizeHTML(session.customerEmail || '')}</p>
                            <div class="mt-2 flex items-center gap-2 text-sm">
                                <i class="fas fa-calendar text-gray-400"></i>
                                <span>${dateStr}</span>
                                <span class="text-brand-gold font-bold">${timeStr} Uhr</span>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                ${session.items?.map(i => i.title).join(', ') || 'Session'}
                            </div>
                        </div>
                        <div class="flex flex-col gap-2">
                            ${canJoin ? `
                                <button onclick="app.joinMeeting('${session.id}')"
                                        class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                                    <i class="fas fa-video"></i>
                                    Meeting beitreten
                                </button>
                            ` : isPast ? `
                                <span class="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">Abgeschlossen</span>
                            ` : `
                                <span class="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                                    <i class="fas fa-clock"></i> Geplant
                                </span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        logger.error('Error loading mentor sessions:', e);
        container.innerHTML = `
            <div class="p-8 text-center text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                <p>Fehler beim Laden der Sessions</p>
            </div>
        `;
    }
}

// ========== ADMIN: COACH ASSIGNMENT ==========

let currentAssignOrderId = null;

// Show modal to assign a coach to an order
export async function showAssignCoachModal(orderId) {
    currentAssignOrderId = orderId;

    // Create modal if it doesn't exist
    let modal = document.getElementById('assign-coach-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'assign-coach-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 hidden p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
                <div class="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-purple-600">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <i class="fas fa-user-plus text-white"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-white">Mentor zuweisen</h3>
                                <p class="text-xs text-white/70">Wähle einen verfügbaren Mentor</p>
                            </div>
                        </div>
                        <button onclick="app.closeAssignCoachModal()" class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition">
                            <i class="fas fa-times text-white"></i>
                        </button>
                    </div>
                </div>
                <div id="assign-coach-list" class="p-4 overflow-y-auto max-h-[65vh]">
                    <div class="flex justify-center py-8">
                        <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await loadCoachesForAssignment();
}

// Close the assign coach modal
export function closeAssignCoachModal() {
    const modal = document.getElementById('assign-coach-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
    currentAssignOrderId = null;
}

// Load coaches and display in modal with smart recommendations
async function loadCoachesForAssignment() {
    const container = document.getElementById('assign-coach-list');
    if (!container || !db) return;

    try {
        const coachesRef = collection(db, 'coaches');
        const snapshot = await getDocs(coachesRef);

        const coaches = [];
        snapshot.forEach(doc => {
            coaches.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (coaches.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-user-slash text-4xl text-gray-300 mb-3"></i>
                    <p class="mb-3">Keine Mentoren verfügbar</p>
                    <button onclick="app.closeAssignCoachModal(); app.switchAdminTab('coaches'); app.openAddCoachModal();"
                            class="text-sm text-indigo-600 hover:text-indigo-800 underline">
                        Jetzt Mentor anlegen
                    </button>
                </div>
            `;
            return;
        }

        // Calculate availability score for each coach
        const today = new Date();
        const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

        const scoredCoaches = coaches.map(coach => {
            const availability = coach.availability || {};
            let futureSlots = 0;
            let nearSlots = 0;

            Object.entries(availability).forEach(([dateStr, slots]) => {
                const date = new Date(dateStr);
                if (date >= today && date <= twoWeeksLater) {
                    futureSlots += (slots?.length || 0);
                    // Slots in the next 7 days count more
                    if (date <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) {
                        nearSlots += (slots?.length || 0);
                    }
                }
            });

            return {
                ...coach,
                futureSlots,
                nearSlots,
                score: nearSlots * 2 + futureSlots,
                isVisible: coach.visible !== false
            };
        });

        // Sort by availability score (highest first)
        scoredCoaches.sort((a, b) => b.score - a.score);

        // Find the recommended mentor (highest score with visibility)
        const recommended = scoredCoaches.find(c => c.isVisible && c.score > 0);

        container.innerHTML = `
            ${recommended ? `
                <div class="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                    <div class="flex items-center gap-2 text-green-700 text-xs font-medium mb-2">
                        <i class="fas fa-lightbulb"></i>
                        <span>Empfehlung basierend auf Verfügbarkeit</span>
                    </div>
                    <div class="flex items-center gap-3 p-2 bg-white rounded-lg border border-green-200 cursor-pointer hover:shadow-md transition"
                         onclick="app.assignCoachToOrder('${recommended.id}', '${sanitizeHTML(recommended.name || 'Mentor')}')">
                        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ring-2 ring-green-400">
                            ${recommended.image ? `<img src="${recommended.image}" alt="${sanitizeHTML(recommended.name)}" class="w-full h-full object-cover">` : `
                                <div class="w-full h-full flex items-center justify-center bg-green-100">
                                    <i class="fas fa-user text-green-500"></i>
                                </div>
                            `}
                        </div>
                        <div class="flex-1">
                            <h4 class="font-bold text-brand-dark flex items-center gap-2">
                                ${sanitizeHTML(recommended.name || 'Unbekannt')}
                                <span class="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded">Empfohlen</span>
                            </h4>
                            <p class="text-sm text-gray-600">${sanitizeHTML(recommended.role || '')}</p>
                            <p class="text-xs text-green-600 mt-1">
                                <i class="fas fa-calendar-check mr-1"></i>${recommended.futureSlots} Slots in den nächsten 2 Wochen
                            </p>
                        </div>
                        <button class="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
                            Zuweisen
                        </button>
                    </div>
                </div>
            ` : ''}

            <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Alle Mentoren (${scoredCoaches.length})</p>

            ${scoredCoaches.map(coach => {
                const isRecommended = recommended?.id === coach.id;
                if (isRecommended) return ''; // Already shown above

                const availabilityClass = coach.futureSlots > 5 ? 'text-green-600' :
                                          coach.futureSlots > 0 ? 'text-yellow-600' : 'text-red-500';
                const availabilityBg = coach.futureSlots > 5 ? 'bg-green-50 border-green-100' :
                                       coach.futureSlots > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100';

                return `
                    <div class="border border-gray-200 rounded-xl p-3 mb-2 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer ${!coach.isVisible ? 'opacity-50' : ''}"
                         onclick="app.assignCoachToOrder('${coach.id}', '${sanitizeHTML(coach.name || 'Mentor')}')">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                ${coach.image ? `<img src="${coach.image}" alt="${sanitizeHTML(coach.name)}" class="w-full h-full object-cover">` : `
                                    <div class="w-full h-full flex items-center justify-center bg-indigo-100">
                                        <i class="fas fa-user text-indigo-400"></i>
                                    </div>
                                `}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <h4 class="font-bold text-brand-dark truncate">${sanitizeHTML(coach.name || 'Unbekannt')}</h4>
                                    ${!coach.isVisible ? '<span class="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-xs rounded">Versteckt</span>' : ''}
                                </div>
                                <p class="text-sm text-gray-500 truncate">${sanitizeHTML(coach.role || '-')}</p>
                            </div>
                            <div class="flex-shrink-0 text-right">
                                <div class="px-2 py-1 ${availabilityBg} rounded-lg border">
                                    <p class="text-xs ${availabilityClass} font-medium">
                                        ${coach.futureSlots > 0 ? `${coach.futureSlots} Slots` : 'Keine Slots'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

    } catch (e) {
        logger.error('Error loading coaches for assignment:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                <p>Fehler beim Laden der Mentoren</p>
            </div>
        `;
    }
}

// Assign a coach to the order
export async function assignCoachToOrder(coachId, coachName) {
    if (!db || !currentAssignOrderId) {
        showToast('❌ Fehler: Order nicht gefunden');
        return;
    }

    try {
        // Hole Order-Details für Benachrichtigung
        const orderDoc = await getDoc(doc(db, 'orders', currentAssignOrderId));
        const orderData = orderDoc.exists() ? orderDoc.data() : {};

        // Hole Coach-Email für Benachrichtigung
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        const coachData = coachDoc.exists() ? coachDoc.data() : {};
        const coachEmail = coachData.email;

        await updateDoc(doc(db, 'orders', currentAssignOrderId), {
            assignedCoachId: coachId,
            assignedCoachName: coachName,
            assignedAt: new Date()
        });

        showToast(`✅ ${coachName} wurde zugewiesen`);
        closeAssignCoachModal();

        // ========== MENTOR-BENACHRICHTIGUNG ==========
        if (coachEmail) {
            try {
                await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyMentorAssignment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        coachEmail: coachEmail,
                        coachName: coachName,
                        orderId: currentAssignOrderId,
                        customerName: orderData.customerName || 'Kunde',
                        customerEmail: orderData.customerEmail,
                        productTitle: orderData.items?.[0]?.title || 'Mentoring Session'
                    })
                });
                logger.log('Mentor notification sent to:', coachEmail);
            } catch (notifyError) {
                logger.warn('Failed to send mentor notification:', notifyError);
                // Nicht kritisch - Zuweisung war erfolgreich
            }
        }

        // Refresh admin orders
        loadAllOrders();

    } catch (e) {
        logger.error('Error assigning coach:', e);
        showToast('❌ Fehler beim Zuweisen');
    }
}

// ========== COACHES & ARTICLES ==========
// Note: db and sanitizeHTML already imported at top of file

export async function initData(state) {
    logger.log('🔄 initData called - loading data from Firestore...');
    logger.log('   db status:', db ? 'initialized' : 'NOT INITIALIZED');

    // Load coaches from Firestore ONLY (no fallback to sample data)
    const dbCoaches = await fetchCollection('coaches');
    state.coaches = dbCoaches;
    logger.log('✅ Loaded', dbCoaches.length, 'coaches from Firestore');
    filterCoaches(state);

    // Load articles from Firestore and fill up to minimum 3 with sample data
    const dbArticles = await fetchCollection('articles');
    const MIN_ARTICLES = 3;

    if(dbArticles.length >= MIN_ARTICLES) {
        // Genug echte Artikel vorhanden
        state.articles = dbArticles;
        logger.log('✅ Loaded', dbArticles.length, 'articles from Firestore');
    } else {
        // Auffüllen mit Sample-Artikeln bis mindestens 3
        const neededSamples = MIN_ARTICLES - dbArticles.length;
        const fillArticles = sampleArticles.slice(0, neededSamples);
        state.articles = [...dbArticles, ...fillArticles];
        logger.log(`✅ Loaded ${dbArticles.length} real + ${fillArticles.length} sample articles (total: ${state.articles.length})`);
    }
    renderArticles(state);
}

export async function fetchCollection(colName) {
    if(!db) {
        logger.error('❌ Firestore (db) ist nicht initialisiert!');
        return [];
    }
    try {
        logger.log('🔄 Lade Collection:', colName);
        const snap = await getDocs(collection(db, colName));
        logger.log('✅ Collection geladen:', colName, '- Anzahl:', snap.docs.length);
        return snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } catch(e) {
        logger.error('❌ Failed to fetch ' + colName + ':', e);
        return [];
    }
}

export function filterCoaches(state) {
    const grid = document.getElementById('coach-grid');
    if(!grid) return;

    const filterSelect = document.getElementById('industry-filter');
    const filter = filterSelect?.value || 'all';

    // First filter out hidden coaches (visible !== false means visible)
    const visibleCoaches = state.coaches.filter(c => c.visible !== false);

    // Then apply industry filter
    const filteredCoaches = filter === 'all' ? visibleCoaches : visibleCoaches.filter(c => c.industry === filter);

    // Zeige Nachricht wenn keine Coaches vorhanden
    if(filteredCoaches.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500"><p class="text-lg">Keine Mentoren gefunden.</p><p class="text-sm mt-2">Bitte überprüfen Sie die Firestore-Datenbank.</p></div>';
        return;
    }

    grid.innerHTML = filteredCoaches.map(coach => {
        const name = sanitizeHTML(coach.name);
        const role = sanitizeHTML(coach.role);
        const experience = sanitizeHTML(coach.experience || '15+ Jahre');
        const expertise = Array.isArray(coach.expertise) ? coach.expertise.slice(0, 2) : [];
        return `
            <div class="group cursor-pointer" onclick="app.openCoachDetail('${coach.id}')">
                <div class="relative bg-gradient-to-b from-[#0D1321] to-[#1A1F2E] rounded-2xl overflow-hidden border border-white/[0.08] hover:border-brand-gold/30 transition-all duration-500 hover:shadow-2xl hover:shadow-brand-gold/10 hover:-translate-y-1">
                    <!-- Large Image Area -->
                    <div class="relative aspect-[3/4] overflow-hidden">
                        <img src="${coach.image}"
                             class="w-full h-full object-cover object-top transition-all duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                             alt="${name}" loading="lazy">
                        <!-- Gradient Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0D1321] via-transparent to-transparent"></div>
                        <!-- Gold tint on hover -->
                        <div class="absolute inset-0 bg-brand-gold/0 group-hover:bg-brand-gold/10 transition-all duration-500"></div>
                        <!-- Experience Badge -->
                        <div class="absolute top-4 right-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
                            <span class="text-[10px] text-white/80 font-medium uppercase tracking-wider">${experience}</span>
                        </div>
                    </div>
                    <!-- Content -->
                    <div class="relative px-6 pb-6 -mt-16">
                        <!-- Name & Role -->
                        <h4 class="font-serif text-xl text-white mb-1 group-hover:text-brand-gold transition-colors duration-300">${name}</h4>
                        <p class="text-brand-gold text-xs font-semibold uppercase tracking-[0.15em] mb-4">${role}</p>
                        <!-- Expertise Tags -->
                        ${expertise.length > 0 ? `
                        <div class="flex flex-wrap gap-2 mb-5">
                            ${expertise.map(e => `<span class="text-[10px] text-white/50 border border-white/10 rounded-full px-3 py-1 uppercase tracking-wider">${sanitizeHTML(e)}</span>`).join('')}
                        </div>
                        ` : ''}
                        <!-- Action Button -->
                        <button onclick="event.stopPropagation(); app.bookSessionWithComplianceCheck('Executive Mentoring - Single Session', 350, '${name}')"
                                class="w-full bg-white/[0.05] hover:bg-brand-gold border border-white/10 hover:border-brand-gold text-white hover:text-brand-dark font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 group/btn">
                            <span>Session buchen</span>
                            <i class="fas fa-arrow-right text-[10px] group-hover/btn:translate-x-1 transition-transform"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function openCoachDetail(state, id, navigateTo) {
    const coach = state.coaches.find(c => c.id === id);
    if(!coach) return;

    const expertise = Array.isArray(coach.expertise) ? coach.expertise : (coach.expertise ? [coach.expertise] : ['Leadership']);
    const contentArea = document.getElementById('coach-detail-content');
    if(!contentArea) return;

    const name = sanitizeHTML(coach.name);
    const role = sanitizeHTML(coach.role);
    const bio = sanitizeHTML(coach.bio || 'Keine Bio verfügbar.');
    const experience = sanitizeHTML(coach.experience || '15+ Jahre Leadership-Erfahrung');

    contentArea.innerHTML = '<div class="flex flex-col md:flex-row gap-8"><div class="w-full md:w-1/3"><img src="' + coach.image + '" class="w-full rounded border-4 border-white shadow-lg object-cover" alt="' + name + '" loading="lazy"><div class="mt-4 p-4 bg-gray-50 rounded text-sm"><p class="text-gray-600 mb-2"><i class="fas fa-briefcase mr-2 text-brand-gold"></i>' + experience + '</p><p class="text-gray-600"><i class="fas fa-check-circle mr-2 text-brand-gold"></i>Alle Formate verfügbar</p></div></div><div class="w-full md:w-2/3"><h1 class="font-serif text-3xl mb-2">' + name + '</h1><p class="text-brand-gold uppercase font-bold text-xs mb-6">' + role + '</p><p class="text-gray-600 mb-6 leading-relaxed">' + bio + '</p><div class="mb-6"><h4 class="font-bold text-xs uppercase mb-2">Expertise</h4><div class="flex flex-wrap gap-2">' + expertise.map(e => '<span class="bg-brand-dark text-white px-2 py-1 text-[10px] uppercase rounded">' + sanitizeHTML(e) + '</span>').join('') + '</div></div>' + (coach.stats ? '<p class="text-sm text-gray-500 mb-6"><i class="fas fa-chart-line mr-2" aria-hidden="true"></i>' + sanitizeHTML(coach.stats) + '</p>' : '') + '<div class="flex gap-4"><button onclick="app.navigateToSection(\'home\', \'coaches\')" class="border-2 border-brand-dark text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:bg-brand-dark hover:text-white transition">Zurück zur Übersicht</button><button onclick="app.addToCart(\'Executive Mentoring - Single Session\', 350); app.navigateToSection(\'home\', \'coaches\')" class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition">Session Buchen</button></div></div></div>';

    navigateTo('coach-detail');
}

export function renderArticles(state) {
    const grid = document.getElementById('journal-grid');
    if(!grid) return;

    grid.innerHTML = state.articles.map(article => {
        const title = sanitizeHTML(article.title);
        const cat = sanitizeHTML(article.cat);
        const preview = sanitizeHTML(article.preview);
        return '<article class="bg-white border rounded-sm overflow-hidden hover:shadow-xl transition cursor-pointer" onclick="app.openArticle(\'' + article.id + '\')"><div class="h-48 bg-gray-200 relative"><img src="' + article.image + '" class="w-full h-full object-cover" alt="' + title + '" loading="lazy"><span class="absolute top-2 left-2 bg-brand-gold text-brand-dark text-[10px] font-bold px-2 py-1 uppercase">' + cat + '</span></div><div class="p-6"><h3 class="font-serif text-lg font-bold mb-2">' + title + '</h3><p class="text-sm text-gray-500 line-clamp-3">' + preview + '</p></div></article>';
    }).join('');
}

export function openArticle(state, id, navigateTo) {
    const article = state.articles.find(a => a.id === id);
    if(!article) return;

    const contentArea = document.getElementById('article-content-area');
    if(!contentArea) return;

    const title = sanitizeHTML(article.title);
    const cat = sanitizeHTML(article.cat);

    contentArea.innerHTML = '<span class="text-brand-gold font-bold uppercase text-xs">' + cat + '</span><h1 class="font-serif text-3xl my-4">' + title + '</h1><img src="' + article.image + '" class="w-full h-64 object-cover mb-8 rounded" alt="' + title + '" loading="lazy"><div class="prose text-gray-700 leading-relaxed">' + article.content + '</div><button onclick="app.navigateTo(\'journal\')" class="mt-8 text-brand-gold font-bold hover:underline inline-flex items-center gap-2"><i class="fas fa-arrow-left" aria-hidden="true"></i>Zurück zu Insights</button>';

    navigateTo('article-detail');
}

// ========== ABOUT SECTION - DYNAMIC IMAGE ==========

// Load "Über uns" image from Firestore
export async function loadAboutImage() {
    logger.log('🔄 loadAboutImage called');
    try {
        if (!db) {
            logger.error('❌ Firestore (db) not available - cannot load about image');
            return;
        }

        const imgElement = document.getElementById('about-founder-image');
        if (!imgElement) return;

        // Zeige Loading-Zustand
        imgElement.style.opacity = '0.5';
        imgElement.style.transition = 'opacity 0.3s ease-in-out';

        const docRef = doc(db, 'settings', 'about');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const imageUrl = data.imageUrl;

            if (imageUrl) {
                // Preload das Bild im Hintergrund
                const preloadImg = new Image();
                preloadImg.onload = () => {
                    imgElement.src = imageUrl;
                    imgElement.style.opacity = '1';
                    logger.log('✅ About image loaded from Firestore');
                };
                preloadImg.onerror = () => {
                    imgElement.style.opacity = '1';
                    logger.warn('Failed to preload about image');
                };
                preloadImg.src = imageUrl;
            } else {
                imgElement.style.opacity = '1';
            }
        } else {
            imgElement.style.opacity = '1';
            logger.log('No about image in Firestore, using default');
        }
    } catch (error) {
        logger.error('Error loading about image:', error);
        const imgElement = document.getElementById('about-founder-image');
        if (imgElement) imgElement.style.opacity = '1';
    }
}

// Update "Über uns" image in Firestore (Admin function)
export async function updateAboutImage(imageUrl) {
    try {
        if (!db) {
            throw new Error('Firestore not available');
        }

        await setDoc(doc(db, 'settings', 'about'), {
            imageUrl: imageUrl,
            updatedAt: new Date()
        });

        showToast('✅ Über uns Bild aktualisiert');
        loadAboutImage();
    } catch (error) {
        logger.error('Error updating about image:', error);
        showToast('❌ Fehler beim Aktualisieren des Bildes', 'error');
    }
}

// Upload image to Firebase Storage and update Firestore
export async function uploadAboutImage(file) {
    try {
        if (!storage) {
            throw new Error('Firebase Storage not available');
        }

        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Bitte wählen Sie eine Bilddatei aus');
        }

        showToast('⏳ Bild wird hochgeladen...', 'info');

        const timestamp = new Date().getTime();
        const storageRef = ref(storage, 'about/founder-' + timestamp + '.jpg');
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        await updateAboutImage(downloadURL);

        return downloadURL;
    } catch (error) {
        logger.error('Error uploading about image:', error);
        showToast('❌ ' + error.message, 'error');
        throw error;
    }
}

// Load dynamic mentoring slots text from Firestore
export async function loadMentoringSlotsText() {
    try {
        if (!db) {
            logger.warn('Firestore not available for mentoring slots text');
            return;
        }

        const docRef = doc(db, 'settings', 'mentoring');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const slotsText = data.slotsText;

            if (slotsText) {
                // Update all elements with class 'mentoring-slots-text'
                const elements = document.querySelectorAll('.mentoring-slots-text');
                elements.forEach(el => {
                    el.textContent = slotsText;
                });
                logger.log('✅ Mentoring slots text loaded from Firestore');
            }
        }
    } catch (error) {
        logger.warn('Could not load mentoring slots text:', error.message);
    }
}

// ========== INNER CIRCLE - WAITLIST ==========

// Submit Inner Circle waitlist form
export async function submitWaitlist(event) {
    event.preventDefault();

    const name = document.getElementById('waitlist-name').value;
    const email = document.getElementById('waitlist-email').value;
    const linkedin = document.getElementById('waitlist-linkedin').value;
    const position = document.getElementById('waitlist-position').value;
    const company = document.getElementById('waitlist-company').value;
    const experience = document.getElementById('waitlist-experience').value;
    const reason = document.getElementById('waitlist-reason').value;

    try {
        if (!db) {
            throw new Error('Firestore not available');
        }

        // Save to Firestore
        await addDoc(collection(db, 'waitlist'), {
            name: sanitizeHTML(name),
            email: email,
            linkedin: linkedin,
            currentRole: sanitizeHTML(position),
            company: sanitizeHTML(company),
            yearsExperience: experience,
            reason: sanitizeHTML(reason),
            status: 'pending',
            submittedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            notes: '',
            interviewDate: null,
            interviewNotes: ''
        });

        showToast('✅ Erfolgreich auf die Warteliste gesetzt! Wir melden uns innerhalb von 5 Werktagen.');

        // Clear form
        event.target.reset();

        // Navigate to home after 3 seconds
        setTimeout(() => {
            navigateTo('home');
        }, 3000);

    } catch (error) {
        logger.error('Error submitting waitlist:', error);
        showToast('❌ Fehler beim Absenden. Bitte versuchen Sie es später erneut.', 'error');
    }
}

// ========== PAYMENT SUCCESS HANDLING ==========

export function handlePaymentCallback(state, navigateTo) {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
        // Leere den Warenkorb
        state.cart = [];
        updateCartUI(state);
        saveCartToLocalStorage(state.cart);
        sessionStorage.removeItem('pending_cart');

        // Prüfe Checkout-Typ: 'loggedIn', 'registered', oder 'guest'
        const checkoutType = sessionStorage.getItem('checkout_type') || 'guest';
        sessionStorage.removeItem('checkout_type');

        // Warte kurz, damit der Webhook Zeit hat die Order zu speichern
        // Dann lade Orders neu (mit Retry falls noch nicht verfügbar)
        if (state.user) {
            setTimeout(() => {
                loadUserOrdersWithRetry(state, 3);
            }, 2000);
        }

        // Zeige Success Message basierend auf Checkout-Typ
        showPaymentSuccessModal(sessionId, checkoutType, navigateTo);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
        // Stelle Warenkorb wieder her
        const pendingCart = sessionStorage.getItem('pending_cart');
        if (pendingCart) {
            state.cart = JSON.parse(pendingCart);
            updateCartUI(state);
            saveCartToLocalStorage(state.cart);
            sessionStorage.removeItem('pending_cart');
        }

        showToast('⚠️ Zahlung abgebrochen. Ihr Warenkorb wurde wiederhergestellt.', 4000);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showCheckoutConfirmationModal(cart, total, hasUser) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 overflow-y-auto';

        const cartItemsHTML = cart.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-gray-100">
                <span class="text-sm text-gray-700">${sanitizeHTML(item.title)}</span>
                <span class="text-sm font-bold text-brand-dark">€${Number(item.price).toFixed(2)}</span>
            </div>
        `).join('');

        // Wenn User eingeloggt ist, zeige vereinfachtes Modal
        if (hasUser) {
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-lg w-full p-8 my-8">
                    <div class="mb-6 text-center">
                        <div class="w-16 h-16 bg-brand-gold rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-shopping-cart text-brand-dark text-2xl"></i>
                        </div>
                        <h2 class="font-serif text-2xl text-brand-dark mb-2">Bestellung bestätigen</h2>
                        <p class="text-gray-600 text-sm">Bitte überprüfen Sie Ihre Auswahl</p>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <h3 class="font-bold text-sm text-gray-700 mb-3">Ihre Bestellung:</h3>
                        ${cartItemsHTML}
                        <div class="flex justify-between items-center pt-4 mt-4 border-t-2 border-brand-gold">
                            <span class="font-bold text-brand-dark">Gesamtbetrag:</span>
                            <span class="font-serif text-2xl text-brand-dark">€${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-500 mr-3"></i>
                            <p class="text-sm text-gray-700">Sie sind angemeldet. Ihre Bestellung wird Ihrem Account zugeordnet.</p>
                        </div>
                    </div>

                    <div class="flex gap-3">
                        <button id="modal-cancel" class="flex-1 bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded hover:bg-gray-300 transition">
                            <i class="fas fa-times mr-2"></i>Abbrechen
                        </button>
                        <button id="modal-confirm" class="flex-1 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-arrow-right mr-2"></i>Zur Kasse
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Nicht eingeloggt - zeige Optionen
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-lg w-full p-8 my-8">
                    <div class="mb-6 text-center">
                        <div class="w-16 h-16 bg-brand-gold rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-shopping-cart text-brand-dark text-2xl"></i>
                        </div>
                        <h2 class="font-serif text-2xl text-brand-dark mb-2">Bestellung bestätigen</h2>
                        <p class="text-gray-600 text-sm">Bitte überprüfen Sie Ihre Auswahl</p>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <h3 class="font-bold text-sm text-gray-700 mb-3">Ihre Bestellung:</h3>
                        ${cartItemsHTML}
                        <div class="flex justify-between items-center pt-4 mt-4 border-t-2 border-brand-gold">
                            <span class="font-bold text-brand-dark">Gesamtbetrag:</span>
                            <span class="font-serif text-2xl text-brand-dark">€${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <!-- Checkout Options -->
                    <div id="checkout-options" class="space-y-4 mb-6">
                        <p class="text-sm text-gray-600 text-center font-medium">Wie möchten Sie fortfahren?</p>

                        <!-- Option 1: Quick Register -->
                        <button id="btn-quick-register" class="w-full flex items-center gap-4 p-4 border-2 border-brand-gold rounded-lg hover:bg-brand-gold/10 transition group">
                            <div class="w-12 h-12 bg-brand-gold rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-user-plus text-brand-dark text-lg"></i>
                            </div>
                            <div class="text-left">
                                <span class="font-bold text-brand-dark block">Konto erstellen</span>
                                <span class="text-xs text-gray-500">Schnelle Registrierung & sofortiger Zugang</span>
                            </div>
                            <i class="fas fa-chevron-right text-brand-gold ml-auto group-hover:translate-x-1 transition"></i>
                        </button>

                        <!-- Option 2: Login -->
                        <button id="btn-login" class="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-brand-gold hover:bg-gray-50 transition group">
                            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-sign-in-alt text-gray-600 text-lg"></i>
                            </div>
                            <div class="text-left">
                                <span class="font-bold text-brand-dark block">Bereits Kunde?</span>
                                <span class="text-xs text-gray-500">Mit bestehendem Konto anmelden</span>
                            </div>
                            <i class="fas fa-chevron-right text-gray-400 ml-auto group-hover:translate-x-1 transition"></i>
                        </button>

                    </div>

                    <!-- Quick Register Form (initially hidden) -->
                    <div id="quick-register-form" class="hidden mb-6">
                        <div class="flex items-center gap-2 mb-4">
                            <button id="back-to-options" class="text-gray-500 hover:text-brand-dark transition">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <h3 class="font-bold text-brand-dark">Schnell registrieren</h3>
                        </div>

                        <div class="space-y-4">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Vorname *</label>
                                    <input type="text" id="checkout-firstname" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Max">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Nachname *</label>
                                    <input type="text" id="checkout-lastname" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Mustermann">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">E-Mail *</label>
                                <input type="email" id="checkout-email" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="max@beispiel.de">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Passwort *</label>
                                <input type="password" id="checkout-password" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Mindestens 6 Zeichen">
                            </div>
                            <div id="checkout-register-error" class="hidden text-red-500 text-xs"></div>
                        </div>

                        <button id="btn-register-and-pay" class="w-full mt-4 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-user-check mr-2"></i>Registrieren & zur Kasse
                        </button>
                    </div>

                    <!-- Login Form (initially hidden) -->
                    <div id="quick-login-form" class="hidden mb-6">
                        <div class="flex items-center gap-2 mb-4">
                            <button id="back-to-options-login" class="text-gray-500 hover:text-brand-dark transition">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <h3 class="font-bold text-brand-dark">Anmelden</h3>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">E-Mail</label>
                                <input type="email" id="checkout-login-email" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="ihre@email.de">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Passwort</label>
                                <input type="password" id="checkout-login-password" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Ihr Passwort">
                            </div>
                            <div id="checkout-login-error" class="hidden text-red-500 text-xs"></div>
                        </div>

                        <button id="btn-login-and-pay" class="w-full mt-4 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-sign-in-alt mr-2"></i>Anmelden & zur Kasse
                        </button>
                    </div>

                    <button id="modal-cancel" class="w-full bg-gray-100 text-gray-600 font-medium py-2 px-4 rounded hover:bg-gray-200 transition text-sm">
                        Abbrechen
                    </button>
                </div>
            `;
        }

        document.body.appendChild(modal);

        // Event Handlers für eingeloggten User
        if (hasUser) {
            const confirmBtn = modal.querySelector('#modal-confirm');
            const cancelBtn = modal.querySelector('#modal-cancel');

            confirmBtn.addEventListener('click', () => {
                modal.remove();
                resolve({ wasLoggedIn: true }); // User war bereits eingeloggt
            });

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
        } else {
            // Event Handlers für nicht eingeloggten User
            const cancelBtn = modal.querySelector('#modal-cancel');
            const btnQuickRegister = modal.querySelector('#btn-quick-register');
            const btnLogin = modal.querySelector('#btn-login');
            const checkoutOptions = modal.querySelector('#checkout-options');
            const quickRegisterForm = modal.querySelector('#quick-register-form');
            const quickLoginForm = modal.querySelector('#quick-login-form');
            const backToOptions = modal.querySelector('#back-to-options');
            const backToOptionsLogin = modal.querySelector('#back-to-options-login');
            const btnRegisterAndPay = modal.querySelector('#btn-register-and-pay');
            const btnLoginAndPay = modal.querySelector('#btn-login-and-pay');

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });

            // Show register form
            btnQuickRegister.addEventListener('click', () => {
                checkoutOptions.classList.add('hidden');
                quickRegisterForm.classList.remove('hidden');
            });

            // Show login form
            btnLogin.addEventListener('click', () => {
                checkoutOptions.classList.add('hidden');
                quickLoginForm.classList.remove('hidden');
            });

            // Back to options from register
            backToOptions.addEventListener('click', () => {
                quickRegisterForm.classList.add('hidden');
                checkoutOptions.classList.remove('hidden');
            });

            // Back to options from login
            backToOptionsLogin.addEventListener('click', () => {
                quickLoginForm.classList.add('hidden');
                checkoutOptions.classList.remove('hidden');
            });

            // Register and pay
            btnRegisterAndPay.addEventListener('click', async () => {
                const firstname = modal.querySelector('#checkout-firstname').value.trim();
                const lastname = modal.querySelector('#checkout-lastname').value.trim();
                const email = modal.querySelector('#checkout-email').value.trim();
                const password = modal.querySelector('#checkout-password').value;
                const errorDiv = modal.querySelector('#checkout-register-error');

                errorDiv.classList.add('hidden');

                if (!firstname || !lastname || !email || !password) {
                    errorDiv.textContent = 'Bitte alle Felder ausfüllen.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                if (!validateEmail(email)) {
                    errorDiv.textContent = 'Bitte gültige E-Mail-Adresse eingeben.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                if (password.length < 6) {
                    errorDiv.textContent = 'Passwort muss mindestens 6 Zeichen haben.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                btnRegisterAndPay.disabled = true;
                btnRegisterAndPay.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird erstellt...';

                try {
                    // Create user account
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

                    // Update profile with name
                    await updateProfile(userCredential.user, {
                        displayName: `${firstname} ${lastname}`
                    });

                    // Create user document in Firestore
                    if (db) {
                        await setDoc(doc(db, "users", userCredential.user.uid), {
                            email,
                            firstname,
                            lastname,
                            displayName: `${firstname} ${lastname}`,
                            createdAt: new Date(),
                            createdVia: 'checkout_registration'
                        });
                    }

                    // Send email verification
                    await sendEmailVerification(userCredential.user);

                    // Speichere die UID BEVOR wir ausloggen
                    const registeredUserId = userCredential.user.uid;

                    // WICHTIG: User ausloggen nach Registrierung - Email muss erst bestätigt werden
                    await signOut(auth);

                    showToast('✅ Konto erstellt! Bitte bestätigen Sie Ihre E-Mail bevor Sie sich anmelden.');
                    modal.remove();

                    // Zur Kasse weiterleiten mit registrierter User-ID
                    resolve({
                        registered: true,
                        guestCheckout: true, // Zahlung ohne Login, weil Email noch nicht verifiziert
                        userEmail: email, // Email für Stripe vorausfüllen
                        userId: registeredUserId // UID für Order-Zuordnung
                    });

                } catch (error) {
                    logger.error('Registration error:', error);
                    btnRegisterAndPay.disabled = false;
                    btnRegisterAndPay.innerHTML = '<i class="fas fa-user-check mr-2"></i>Registrieren & zur Kasse';

                    if (error.code === 'auth/email-already-in-use') {
                        errorDiv.textContent = 'Diese E-Mail ist bereits registriert. Bitte anmelden.';
                    } else {
                        errorDiv.textContent = 'Fehler bei der Registrierung. Bitte erneut versuchen.';
                    }
                    errorDiv.classList.remove('hidden');
                }
            });

            // Login and pay
            btnLoginAndPay.addEventListener('click', async () => {
                const email = modal.querySelector('#checkout-login-email').value.trim();
                const password = modal.querySelector('#checkout-login-password').value;
                const errorDiv = modal.querySelector('#checkout-login-error');

                errorDiv.classList.add('hidden');

                if (!email || !password) {
                    errorDiv.textContent = 'Bitte E-Mail und Passwort eingeben.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                btnLoginAndPay.disabled = true;
                btnLoginAndPay.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird angemeldet...';

                try {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);

                    showToast('✅ Erfolgreich angemeldet!');
                    modal.remove();
                    resolve({ loggedIn: true, user: userCredential.user });

                } catch (error) {
                    logger.error('Login error:', error);
                    btnLoginAndPay.disabled = false;
                    btnLoginAndPay.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Anmelden & zur Kasse';

                    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                        errorDiv.textContent = 'E-Mail oder Passwort ist falsch.';
                    } else {
                        errorDiv.textContent = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
                    }
                    errorDiv.classList.remove('hidden');
                }
            });
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });

        // Close on ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                resolve(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

function showPaymentSuccessModal(sessionId, checkoutType = 'guest', navigateTo = null) {
    // Generiere kurze Bestellnummer aus Session ID
    const shortOrderId = 'APEX-' + sessionId.slice(-8).toUpperCase();

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4';

    // Unterschiedliche Inhalte je nach Checkout-Typ
    let infoContent, buttonContent, buttonDestination;

    if (checkoutType === 'loggedIn') {
        // User war bereits eingeloggt
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-box text-brand-gold mr-2"></i>Die Bestellung wurde Ihrem Konto zugeordnet</p>
                <p><i class="fas fa-tachometer-alt text-brand-gold mr-2"></i>Details finden Sie in Ihrem Dashboard</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-tachometer-alt mr-2"></i>Zum Dashboard
           </button>`;
        buttonDestination = 'dashboard';
    } else if (checkoutType === 'registered') {
        // User hat sich während Checkout registriert
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-user-check text-green-500 mr-2"></i>Ihr Account wurde erfolgreich erstellt</p>
                <p><i class="fas fa-shield-alt text-orange-500 mr-2"></i><strong>Bitte bestätigen Sie Ihre E-Mail</strong> über den Link in Ihrem Postfach</p>
                <p><i class="fas fa-sign-in-alt text-brand-gold mr-2"></i>Danach können Sie sich anmelden</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-sign-in-alt mr-2"></i>Zum Login
           </button>`;
        buttonDestination = 'login';
    } else {
        // Gast-Checkout - Account wird automatisch erstellt
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-user-plus text-brand-gold mr-2"></i>Ein Account wurde automatisch für Sie erstellt</p>
                <p><i class="fas fa-key text-brand-gold mr-2"></i>Sie erhalten einen Link um Ihr Passwort festzulegen</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-home mr-2"></i>Zur Startseite
           </button>`;
        buttonDestination = 'home';
    }

    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full p-8 text-center">
            <div class="mb-6">
                <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-check text-white text-3xl"></i>
                </div>
                <h2 class="font-serif text-2xl text-brand-dark mb-2">Zahlung erfolgreich!</h2>
                <p class="text-gray-600 text-sm">Vielen Dank für Ihre Bestellung.</p>
            </div>

            <div class="bg-gray-50 rounded p-4 mb-6 text-left">
                <p class="text-xs text-gray-500 mb-2">Bestellnummer:</p>
                <p class="text-2xl font-bold text-brand-dark tracking-wider">${shortOrderId}</p>
            </div>

            ${infoContent}
            ${buttonContent}
        </div>
    `;

    document.body.appendChild(modal);

    // Button Click Handler
    const btn = modal.querySelector('#success-modal-btn');
    btn.addEventListener('click', () => {
        modal.remove();
        if (navigateTo) {
            navigateTo(buttonDestination);
        } else if (window.app?.navigateTo) {
            window.app.navigateTo(buttonDestination);
        }
    });

    // Modal bleibt offen bis User es schließt - kein Auto-remove
}

// ========== DASHBOARD TAB SYSTEM ==========

export function switchDashboardTab(tabName, state) {
    // Get all tabs and tab contents
    const tabs = document.querySelectorAll('.dashboard-tab');
    const contents = document.querySelectorAll('.dashboard-tab-content');

    // Update all tabs - remove active styling, add inactive styling
    tabs.forEach(tab => {
        tab.classList.remove('active', 'text-white', 'border-brand-gold');
        tab.classList.add('text-white/50', 'border-transparent');
    });

    // Hide all tab contents
    contents.forEach(content => {
        content.classList.add('hidden');
    });

    // Find and activate the clicked tab
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active', 'text-white', 'border-brand-gold');
        activeTab.classList.remove('text-white/50', 'border-transparent');
    }

    // Show the selected tab content
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
        // Add animation class
        activeContent.classList.add('tab-content');
    }

    // Load data for specific tabs
    if (tabName === 'appointments' && state) {
        loadAvailability(state);
    }

    // Initialize mentor dashboard when switching to mentor tab
    if (tabName === 'mentor') {
        initMentorDashboard();
    }
}

// Switch Admin Panel Tabs
export function switchAdminTab(tabName) {
    // Tab names: orders, users, strategy, coaches, documents, settings, mentor-preview, cv-generator
    const tabIds = ['orders', 'users', 'strategy', 'coaches', 'documents', 'settings', 'mentor-preview', 'cv-generator'];

    // Update tab buttons
    tabIds.forEach(id => {
        const tabBtn = document.getElementById(`admin-tab-${id}`);
        const content = document.getElementById(`admin-content-${id}`);

        if (tabBtn) {
            if (id === tabName) {
                // Active tab styling - new design with rounded-t-lg and bg-gray-50
                tabBtn.classList.add('bg-gray-50', 'text-brand-dark');
                tabBtn.classList.remove('text-gray-300', 'hover:bg-white/10');
            } else {
                // Inactive tab styling
                tabBtn.classList.remove('bg-gray-50', 'text-brand-dark');
                tabBtn.classList.add('text-gray-300', 'hover:bg-white/10');
            }
        }

        if (content) {
            if (id === tabName) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        }
    });

    // Load data for specific tabs
    if (tabName === 'coaches') {
        loadAdminCoaches();
    } else if (tabName === 'users') {
        loadAdminUsers();
    } else if (tabName === 'strategy') {
        loadStrategyCalls();
    } else if (tabName === 'orders') {
        loadAllOrders();
    } else if (tabName === 'documents') {
        loadAdminDocuments();
    } else if (tabName === 'settings') {
        loadAdminSettings();
    } else if (tabName === 'mentor-preview') {
        loadMentorPreviewOptions();
    } else if (tabName === 'cv-generator') {
        loadCvProjects();
    }
}

// Load coaches for admin panel
export async function loadAdminCoaches() {
    const container = document.getElementById('admin-coaches-list');
    if (!container) return;

    container.innerHTML = '<div class="bg-white p-8 rounded-xl border border-gray-100 text-center text-gray-400 col-span-full"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p class="text-sm">Lade Mentoren...</p></div>';

    try {
        const coaches = await fetchCollection('coaches');

        // Update state for edit function
        if (window.app?.state) {
            window.app.state.coaches = coaches;
        }

        if (coaches.length === 0) {
            container.innerHTML = `
                <div class="bg-white p-12 rounded-xl border border-dashed border-gray-200 text-center col-span-full">
                    <i class="fas fa-user-tie text-gray-300 text-4xl mb-4"></i>
                    <p class="text-gray-500 mb-4">Noch keine Mentoren angelegt</p>
                    <button onclick="app.openAddCoachModal()" class="px-4 py-2 bg-brand-gold text-brand-dark font-bold rounded-lg hover:bg-yellow-500 transition text-sm">
                        <i class="fas fa-plus mr-2"></i>Ersten Mentor anlegen
                    </button>
                </div>
            `;
            return;
        }

        // Update statistics
        const totalCoaches = coaches.length;
        const visibleCoaches = coaches.filter(c => c.visible !== false).length;
        const hiddenCoaches = coaches.filter(c => c.visible === false).length;

        const statTotal = document.getElementById('admin-stat-coaches-total');
        const statVisible = document.getElementById('admin-stat-coaches-visible');
        const statHidden = document.getElementById('admin-stat-coaches-hidden');

        if (statTotal) statTotal.textContent = totalCoaches;
        if (statVisible) statVisible.textContent = visibleCoaches;
        if (statHidden) statHidden.textContent = hiddenCoaches;

        container.innerHTML = coaches.map(coach => `
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition group">
                <!-- Header mit Bild -->
                <div class="relative h-32 bg-gradient-to-br from-brand-dark to-gray-800">
                    <div class="absolute -bottom-8 left-4">
                        <img src="${coach.image || 'https://via.placeholder.com/80'}"
                             alt="${sanitizeHTML(coach.name)}"
                             class="w-16 h-16 rounded-xl object-cover border-4 border-white shadow-lg">
                    </div>
                    <!-- Status Badge -->
                    <div class="absolute top-3 right-3">
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${coach.visible !== false ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}">
                            ${coach.visible !== false ? 'Sichtbar' : 'Versteckt'}
                        </span>
                    </div>
                </div>

                <!-- Content -->
                <div class="pt-10 px-4 pb-4">
                    <h4 class="font-bold text-brand-dark text-lg">${sanitizeHTML(coach.name)}</h4>
                    <p class="text-sm text-gray-500">${sanitizeHTML(coach.role || '-')}</p>
                    ${coach.email ? `<p class="text-xs text-brand-gold mt-1"><i class="fas fa-envelope mr-1"></i>${sanitizeHTML(coach.email)}</p>` : ''}

                    <!-- Tags -->
                    ${coach.expertise && coach.expertise.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-3">
                            ${coach.expertise.slice(0, 3).map(exp => `
                                <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">${sanitizeHTML(exp)}</span>
                            `).join('')}
                            ${coach.expertise.length > 3 ? `<span class="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">+${coach.expertise.length - 3}</span>` : ''}
                        </div>
                    ` : ''}

                    <!-- Info -->
                    <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                        ${coach.experience ? `<p><i class="fas fa-briefcase mr-1 w-4"></i>${sanitizeHTML(coach.experience)}</p>` : ''}
                        ${coach.industry ? `<p><i class="fas fa-building mr-1 w-4"></i>${sanitizeHTML(coach.industry)}</p>` : ''}
                    </div>

                    <!-- Actions -->
                    <div class="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                        <button onclick="app.openEditCoachModal('${coach.id}')"
                                class="flex-1 px-3 py-2 text-sm font-medium text-brand-dark bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                            <i class="fas fa-edit mr-1"></i>Bearbeiten
                        </button>
                        <button onclick="app.toggleCoachVisibility('${coach.id}')"
                                class="px-3 py-2 text-sm ${coach.visible !== false ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'} rounded-lg transition"
                                title="${coach.visible !== false ? 'Verstecken' : 'Anzeigen'}">
                            <i class="fas ${coach.visible !== false ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button onclick="app.deleteCoach('${coach.id}')"
                                class="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                                title="Löschen">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        logger.error('Error loading admin coaches:', e);
        container.innerHTML = '<div class="bg-white p-8 rounded-xl border border-red-100 text-center text-red-500 col-span-full"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p class="text-sm">Fehler beim Laden der Mentoren</p></div>';
    }
}

// Toggle coach visibility
export async function toggleCoachVisibility(coachId) {
    try {
        const coachRef = doc(db, 'coaches', coachId);
        const coachSnap = await getDoc(coachRef);

        if (!coachSnap.exists()) {
            showToast('Mentor nicht gefunden');
            return;
        }

        const currentVisible = coachSnap.data().visible !== false;
        await updateDoc(coachRef, { visible: !currentVisible });

        showToast(currentVisible ? 'Mentor versteckt' : 'Mentor sichtbar');

        // Reload the admin coaches list
        loadAdminCoaches();

        // Also refresh the public coaches list if state is available
        if (window.app && window.app.state) {
            // Update the coach in state
            const coachIndex = window.app.state.coaches.findIndex(c => c.id === coachId);
            if (coachIndex !== -1) {
                window.app.state.coaches[coachIndex].visible = !currentVisible;
            }
            // Re-render the public coach grid
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error toggling coach visibility:', e);
        showToast('Fehler beim Aktualisieren');
    }
}

// ========== MENTOR PREVIEW FUNCTIONS (Admin) ==========

// Store preview state
let previewMentorData = null;
let previewAvailability = {};
let previewBookedSlots = {};
let previewWeekOffset = 0;

// Load mentor options for the preview dropdown
export async function loadMentorPreviewOptions() {
    const select = document.getElementById('admin-mentor-preview-select');
    if (!select) return;

    try {
        const coaches = await fetchCollection('coaches');

        select.innerHTML = '<option value="">-- Mentor auswählen --</option>';
        coaches.forEach(coach => {
            const option = document.createElement('option');
            option.value = coach.id;
            option.textContent = `${coach.name}${coach.visible === false ? ' (versteckt)' : ''}`;
            select.appendChild(option);
        });
    } catch (e) {
        logger.error('Error loading mentor preview options:', e);
    }
}

// Load mentor preview dashboard
export async function loadMentorPreview() {
    const select = document.getElementById('admin-mentor-preview-select');
    const container = document.getElementById('admin-mentor-preview-container');

    if (!select || !container) return;

    const coachId = select.value;
    if (!coachId) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <i class="fas fa-user-tie text-5xl mb-4 opacity-50"></i>
                <p class="text-lg font-medium">Wähle einen Mentor aus</p>
                <p class="text-sm mt-1">um dessen Dashboard-Ansicht zu sehen</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-3xl text-brand-gold"></i><p class="mt-3 text-gray-500">Lade Mentor-Dashboard...</p></div>';

    try {
        // Load coach data
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        if (!coachDoc.exists()) {
            container.innerHTML = '<div class="p-8 text-center text-red-500">Mentor nicht gefunden</div>';
            return;
        }

        previewMentorData = { id: coachId, ...coachDoc.data() };
        previewAvailability = previewMentorData.availability || {};
        previewWeekOffset = 0;

        // Load booked slots for this mentor
        await loadPreviewBookedSlots(coachId);

        // Load sessions
        const sessions = await loadPreviewSessions(coachId);

        // Render the preview dashboard
        renderMentorPreviewDashboard(sessions);

    } catch (e) {
        logger.error('Error loading mentor preview:', e);
        container.innerHTML = '<div class="p-8 text-center text-red-500">Fehler beim Laden</div>';
    }
}

// Load booked slots for preview
async function loadPreviewBookedSlots(coachId) {
    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', coachId));
        const snapshot = await getDocs(q);

        previewBookedSlots = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                const dt = new Date(order.appointment.datetime);
                const dateKey = dt.toISOString().split('T')[0];
                const timeKey = dt.toTimeString().slice(0, 5);
                if (!previewBookedSlots[dateKey]) {
                    previewBookedSlots[dateKey] = [];
                }
                previewBookedSlots[dateKey].push(timeKey);
            }
        });
    } catch (e) {
        logger.error('Error loading preview booked slots:', e);
    }
}

// Load sessions for preview
async function loadPreviewSessions(coachId) {
    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', coachId));
        const snapshot = await getDocs(q);

        const sessions = [];
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                sessions.push({
                    id: doc.id,
                    ...order
                });
            }
        });

        // Sort by appointment date
        sessions.sort((a, b) => new Date(a.appointment.datetime) - new Date(b.appointment.datetime));
        return sessions;
    } catch (e) {
        logger.error('Error loading preview sessions:', e);
        return [];
    }
}

// Render the mentor preview dashboard
function renderMentorPreviewDashboard(sessions) {
    const container = document.getElementById('admin-mentor-preview-container');
    if (!container || !previewMentorData) return;

    // Count stats
    const totalSlots = Object.values(previewAvailability).reduce((sum, slots) => sum + (slots?.length || 0), 0);
    const totalBookings = Object.values(previewBookedSlots).reduce((sum, slots) => sum + (slots?.length || 0), 0);
    const upcomingSessions = sessions.filter(s => new Date(s.appointment.datetime) >= new Date()).length;

    container.innerHTML = `
        <div class="border-2 border-brand-gold/30 rounded-2xl overflow-hidden">
            <!-- Preview Banner -->
            <div class="bg-gradient-to-r from-brand-gold/20 to-yellow-100 px-4 py-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-eye text-brand-gold"></i>
                    <span class="text-sm font-medium text-brand-dark">Vorschau-Modus für: <strong>${previewMentorData.name}</strong></span>
                </div>
                <span class="text-xs text-gray-600 bg-white/50 px-2 py-1 rounded">Nur Ansicht - Keine echten Änderungen</span>
            </div>

            <!-- Mentor Header -->
            <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-6">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full bg-brand-gold/20 flex items-center justify-center overflow-hidden">
                        ${previewMentorData.image
                            ? `<img src="${previewMentorData.image}" class="w-full h-full object-cover" alt="${previewMentorData.name}">`
                            : `<i class="fas fa-user-tie text-brand-gold text-2xl"></i>`
                        }
                    </div>
                    <div>
                        <h2 class="text-xl font-serif font-bold">Willkommen, ${previewMentorData.name}</h2>
                        <p class="text-gray-400 text-sm">${previewMentorData.role || 'Mentor'} • ${previewMentorData.email || 'Keine E-Mail'}</p>
                    </div>
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-green-600">${totalSlots}</div>
                    <div class="text-xs text-gray-500">Verfügbare Slots</div>
                </div>
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-blue-600">${totalBookings}</div>
                    <div class="text-xs text-gray-500">Gebuchte Termine</div>
                </div>
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-brand-gold">${upcomingSessions}</div>
                    <div class="text-xs text-gray-500">Anstehende Sessions</div>
                </div>
            </div>

            <!-- Two Column Layout -->
            <div class="grid md:grid-cols-2 gap-4 p-4">
                <!-- Availability Calendar -->
                <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-calendar-alt text-brand-gold"></i>
                            <h3 class="font-bold text-brand-dark">Meine Verfügbarkeit</h3>
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick="app.previewPrevWeek()" class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition">
                                <i class="fas fa-chevron-left text-gray-500"></i>
                            </button>
                            <span id="preview-week-label" class="text-sm text-gray-600 min-w-[140px] text-center">KW 1</span>
                            <button onclick="app.previewNextWeek()" class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition">
                                <i class="fas fa-chevron-right text-gray-500"></i>
                            </button>
                        </div>
                    </div>
                    <div id="preview-calendar" class="p-2 overflow-x-auto">
                        ${renderPreviewCalendarHTML()}
                    </div>
                    <div class="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div class="flex items-center gap-4 text-xs">
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500"></span> Verfügbar</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-500"></span> Gebucht</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-200"></span> Nicht verfügbar</span>
                        </div>
                    </div>
                </div>

                <!-- Sessions List -->
                <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-users text-brand-gold"></i>
                            <h3 class="font-bold text-brand-dark">Meine Sessions</h3>
                        </div>
                        <span class="bg-brand-gold text-brand-dark text-xs font-bold px-2 py-1 rounded-full">${sessions.length}</span>
                    </div>
                    <div class="max-h-[350px] overflow-y-auto">
                        ${sessions.length === 0
                            ? `<div class="p-8 text-center text-gray-400">
                                <i class="fas fa-calendar-check text-3xl mb-2 opacity-50"></i>
                                <p class="text-sm">Keine Sessions zugewiesen</p>
                              </div>`
                            : sessions.map(session => {
                                const dt = new Date(session.appointment.datetime);
                                const dateStr = dt.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                                const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const isPast = dt < new Date();

                                return `
                                    <div class="p-4 border-b border-gray-50 hover:bg-gray-50 transition ${isPast ? 'opacity-50' : ''}">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <div class="font-medium text-sm text-brand-dark">${session.customerName || 'Unbekannt'}</div>
                                                <div class="text-xs text-gray-500 mt-1">
                                                    <i class="fas fa-calendar mr-1"></i>${dateStr} um ${timeStr}
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                ${isPast
                                                    ? '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Vergangen</span>'
                                                    : '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Anstehend</span>'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Render preview calendar HTML
function renderPreviewCalendarHTML() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (previewWeekOffset * 7));

    // Update week label
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = startOfWeek.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    // Schedule update of week label after render
    setTimeout(() => {
        const weekLabel = document.getElementById('preview-week-label');
        if (weekLabel) weekLabel.textContent = `KW ${weekNumber} - ${monthName}`;
    }, 0);

    const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
    }

    let html = `
        <table class="w-full border-collapse text-xs">
            <thead>
                <tr>
                    <th class="p-1 text-gray-500 font-medium"></th>
                    ${days.map(d => `
                        <th class="p-1 text-center ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''}">
                            <div class="text-gray-500 font-medium">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                            <div class="font-bold ${isToday(d) ? 'text-brand-gold' : 'text-gray-700'}">${d.getDate()}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(time => {
        html += `<tr>`;
        html += `<td class="p-1 text-gray-500 font-medium text-right pr-2">${time}</td>`;

        days.forEach(d => {
            const dateKey = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isAvailable = previewAvailability[dateKey]?.includes(time);
            const isBooked = previewBookedSlots[dateKey]?.includes(time);
            const isPast = d < new Date() && !isToday(d);

            let cellClass = 'p-0.5';
            let slotClass = 'w-full h-6 rounded ';

            if (isPast) {
                slotClass += 'bg-gray-100';
            } else if (isBooked) {
                slotClass += 'bg-blue-500';
            } else if (isAvailable) {
                slotClass += 'bg-green-500';
            } else {
                slotClass += 'bg-gray-200';
            }

            if (isWeekend) {
                cellClass += ' bg-gray-50';
            }

            html += `<td class="${cellClass}"><div class="${slotClass}"></div></td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    return html;
}

// Preview calendar navigation
export function previewPrevWeek() {
    previewWeekOffset--;
    updatePreviewCalendar();
}

export function previewNextWeek() {
    previewWeekOffset++;
    updatePreviewCalendar();
}

function updatePreviewCalendar() {
    const calendarContainer = document.getElementById('preview-calendar');
    if (calendarContainer) {
        calendarContainer.innerHTML = renderPreviewCalendarHTML();
    }
}

// ========== COACH MODAL FUNCTIONS ==========

export function openAddCoachModal() {
    const modal = document.getElementById('coach-modal');
    if (!modal) return;

    // Reset form
    document.getElementById('coach-form').reset();
    document.getElementById('coach-edit-id').value = '';
    document.getElementById('coach-visible').checked = true;

    // Set modal to "Add" mode
    document.getElementById('coach-modal-title').textContent = 'Neuen Mentor anlegen';
    document.getElementById('coach-modal-icon').className = 'fas fa-user-plus text-brand-dark';
    document.getElementById('coach-save-btn-text').textContent = 'Speichern';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function openEditCoachModal(coachId) {
    const modal = document.getElementById('coach-modal');
    if (!modal) return;

    // Find coach data
    const coach = window.app?.state?.coaches?.find(c => c.id === coachId);
    if (!coach) {
        showToast('Mentor nicht gefunden');
        return;
    }

    // Fill form with coach data
    document.getElementById('coach-edit-id').value = coachId;
    document.getElementById('coach-name').value = coach.name || '';
    document.getElementById('coach-email').value = coach.email || '';
    document.getElementById('coach-role').value = coach.role || '';
    document.getElementById('coach-experience').value = coach.experience || '';
    document.getElementById('coach-industry').value = coach.industry || '';
    document.getElementById('coach-expertise').value = (coach.expertise || []).join(', ');
    document.getElementById('coach-bio').value = coach.bio || '';
    document.getElementById('coach-image').value = coach.image || '';
    document.getElementById('coach-visible').checked = coach.visible !== false;

    // Set modal to "Edit" mode
    document.getElementById('coach-modal-title').textContent = 'Mentor bearbeiten';
    document.getElementById('coach-modal-icon').className = 'fas fa-user-edit text-brand-dark';
    document.getElementById('coach-save-btn-text').textContent = 'Aktualisieren';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeCoachModal() {
    const modal = document.getElementById('coach-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

export async function saveCoach() {
    const editId = document.getElementById('coach-edit-id').value;
    const name = document.getElementById('coach-name').value.trim();
    const email = document.getElementById('coach-email').value.trim();
    const role = document.getElementById('coach-role').value.trim();

    // Validate required fields
    if (!name || !email || !role) {
        showToast('Bitte alle Pflichtfelder ausfüllen');
        return;
    }

    const coachData = {
        name,
        email,
        role,
        experience: document.getElementById('coach-experience').value.trim(),
        industry: document.getElementById('coach-industry').value.trim(),
        expertise: document.getElementById('coach-expertise').value.split(',').map(e => e.trim()).filter(e => e),
        bio: document.getElementById('coach-bio').value.trim(),
        image: document.getElementById('coach-image').value.trim() || 'https://via.placeholder.com/200',
        visible: document.getElementById('coach-visible').checked
    };

    try {
        if (editId) {
            // Update existing coach
            await updateDoc(doc(db, 'coaches', editId), coachData);
            showToast('Mentor aktualisiert');
        } else {
            // Create new coach
            coachData.createdAt = new Date();
            await addDoc(collection(db, 'coaches'), coachData);
            showToast('Mentor erstellt');
        }

        closeCoachModal();
        loadAdminCoaches();

        // Refresh state coaches
        if (window.app?.state) {
            const coaches = await fetchCollection('coaches');
            window.app.state.coaches = coaches;
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error saving coach:', e);
        showToast('Fehler beim Speichern');
    }
}

export async function deleteCoach(coachId) {
    if (!confirm('Mentor wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'coaches', coachId));
        showToast('Mentor gelöscht');
        loadAdminCoaches();

        // Refresh state coaches
        if (window.app?.state) {
            const coaches = await fetchCollection('coaches');
            window.app.state.coaches = coaches;
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error deleting coach:', e);
        showToast('Fehler beim Löschen');
    }
}

// Load all documents for admin panel
export async function loadAdminDocuments() {
    const container = document.getElementById('admin-documents-list');
    if (!container || !storage) {
        logger.log('Documents container or storage not available');
        return;
    }

    container.innerHTML = `
        <div class="p-8 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">Lade Dokumente...</p>
        </div>
    `;

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");

        // Load all users to get their info
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersMap = {};
        usersSnapshot.forEach(doc => {
            usersMap[doc.id] = doc.data();
        });

        let allDocuments = [];
        let uploadedCount = 0;
        let deliveredCount = 0;
        const usersWithDocs = new Set();

        // Load uploaded documents (from users folder - users/{userId}/)
        const usersRef = ref(storage, 'users');
        try {
            const usersResult = await listAll(usersRef);

            // Each folder is a userId
            for (const userFolder of usersResult.prefixes) {
                const userId = userFolder.name;
                usersWithDocs.add(userId);

                // List all files in user folder
                const userFiles = await listAll(userFolder);

                for (const file of userFiles.items) {
                    uploadedCount++;
                    const url = await getDownloadURL(file);
                    const metadata = await file.getMetadata();
                    allDocuments.push({
                        type: 'uploaded',
                        userId,
                        orderId: null,
                        fileName: file.name,
                        url,
                        size: metadata.size || 0,
                        createdAt: metadata.timeCreated || null,
                        userEmail: usersMap[userId]?.email || 'Unbekannt',
                        userName: `${usersMap[userId]?.firstname || ''} ${usersMap[userId]?.lastname || ''}`.trim() || 'Unbekannt'
                    });
                }
            }
        } catch (e) {
            logger.log('No users folder or error:', e.message);
        }

        // Load delivered documents (from admin to users)
        const deliveredRef = ref(storage, 'delivered');
        try {
            const deliveredResult = await listAll(deliveredRef);

            for (const userFolder of deliveredResult.prefixes) {
                const userId = userFolder.name;
                usersWithDocs.add(userId);

                const userDelivered = await listAll(userFolder);
                for (const file of userDelivered.items) {
                    deliveredCount++;
                    const url = await getDownloadURL(file);
                    const metadata = await file.getMetadata();
                    allDocuments.push({
                        type: 'delivered',
                        userId,
                        orderId: null,
                        fileName: file.name,
                        url,
                        size: metadata.size || 0,
                        createdAt: metadata.timeCreated || null,
                        userEmail: usersMap[userId]?.email || 'Unbekannt',
                        userName: `${usersMap[userId]?.firstname || ''} ${usersMap[userId]?.lastname || ''}`.trim() || 'Unbekannt'
                    });
                }
            }
        } catch (e) {
            logger.log('No delivered folder or error:', e.message);
        }

        // Update statistics
        const statUploaded = document.getElementById('admin-stat-docs-uploaded');
        const statDelivered = document.getElementById('admin-stat-docs-delivered');
        const statUsers = document.getElementById('admin-stat-docs-users');

        if (statUploaded) statUploaded.textContent = uploadedCount;
        if (statDelivered) statDelivered.textContent = deliveredCount;
        if (statUsers) statUsers.textContent = usersWithDocs.size;

        if (allDocuments.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-folder-open text-3xl mb-3"></i>
                    <p class="text-sm">Noch keine Dokumente vorhanden</p>
                </div>
            `;
            return;
        }

        // Sort by date (newest first)
        allDocuments.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
        });

        // Format file size
        const formatSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };

        container.innerHTML = allDocuments.map(doc => `
            <div class="p-4 hover:bg-gray-50 transition">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center ${doc.type === 'uploaded' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}">
                            <i class="fas ${doc.type === 'uploaded' ? 'fa-user' : 'fa-user-shield'}"></i>
                        </div>
                        <div>
                            <p class="font-bold text-brand-dark text-sm">${sanitizeHTML(doc.fileName)}</p>
                            <p class="text-xs text-gray-500">
                                ${doc.type === 'uploaded' ? 'Kunde: ' : 'An: '}
                                <span class="font-medium">${sanitizeHTML(doc.userName)}</span>
                                (${sanitizeHTML(doc.userEmail)})
                            </p>
                            <p class="text-xs text-gray-400">
                                ${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Datum unbekannt'}
                                • ${formatSize(doc.size)}
                                • <span class="font-semibold ${doc.type === 'uploaded' ? 'text-blue-600' : 'text-green-600'}">${doc.type === 'uploaded' ? '📥 Vom Kunden hochgeladen' : '📤 Von dir gesendet'}</span>
                            </p>
                        </div>
                    </div>
                    <a href="${doc.url}" target="_blank" download="${doc.fileName}"
                       class="px-4 py-2 bg-brand-dark text-white text-sm rounded hover:bg-gray-800 transition flex items-center gap-2">
                        <i class="fas fa-download"></i>
                        Download
                    </a>
                </div>
            </div>
        `).join('');

    } catch (e) {
        logger.error('Error loading admin documents:', e);
        container.innerHTML = `
            <div class="p-8 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">Fehler beim Laden der Dokumente: ${e.message}</p>
            </div>
        `;
    }
}

export async function saveProfile(state) {
    const firstnameInput = document.getElementById('profile-firstname');
    const lastnameInput = document.getElementById('profile-lastname');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');
    const companyInput = document.getElementById('profile-company');

    const firstname = firstnameInput?.value?.trim() || '';
    const lastname = lastnameInput?.value?.trim() || '';
    const phone = phoneInput?.value?.trim() || '';
    const company = companyInput?.value?.trim() || '';

    if (!firstname || !lastname) {
        showToast('❌ Vor- und Nachname sind erforderlich.', 'error');
        return;
    }

    try {
        if (db && state.user?.uid) {
            await updateDoc(doc(db, "users", state.user.uid), {
                firstname,
                lastname,
                phone,
                company,
                updatedAt: new Date()
            });

            // Update display name in auth
            if (auth?.currentUser) {
                await updateProfile(auth.currentUser, {
                    displayName: `${firstname} ${lastname}`
                });
            }

            showToast('✅ Profil erfolgreich gespeichert!');
        } else {
            showToast('✅ Profil gespeichert (Demo-Modus)');
        }
    } catch (error) {
        logger.error('Error saving profile:', error);
        showToast('❌ Fehler beim Speichern. Bitte versuchen Sie es erneut.', 'error');
    }
}

export async function changePassword(state) {
    const currentPassword = document.getElementById('current-password')?.value || '';
    const newPassword = document.getElementById('dashboard-new-password')?.value || '';
    const confirmPassword = document.getElementById('dashboard-confirm-password')?.value || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('❌ Bitte füllen Sie alle Passwort-Felder aus.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('❌ Die neuen Passwörter stimmen nicht überein.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('❌ Das neue Passwort muss mindestens 6 Zeichen lang sein.', 'error');
        return;
    }

    try {
        if (auth?.currentUser) {
            // Re-authenticate user first
            const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js');

            const credential = EmailAuthProvider.credential(
                auth.currentUser.email,
                currentPassword
            );

            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPassword);

            // Clear form fields
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';

            showToast('✅ Passwort erfolgreich geändert!');
        } else {
            showToast('✅ Passwort geändert (Demo-Modus)');
        }
    } catch (error) {
        logger.error('Error changing password:', error);
        if (error.code === 'auth/wrong-password') {
            showToast('❌ Das aktuelle Passwort ist falsch.', 'error');
        } else {
            showToast('❌ Fehler beim Ändern des Passworts.', 'error');
        }
    }
}

// ========== ADMIN FUNCTIONS ==========

export function isAdmin(email) {
    return ADMIN_EMAILS.includes(email?.toLowerCase());
}

// Store all orders for filtering
let allAdminOrders = [];

export async function loadAllOrders() {
    if (!db) {
        logger.error('Database not available');
        return;
    }

    const container = document.getElementById('admin-orders-list');
    if (!container) return;

    container.innerHTML = `
        <div class="bg-white p-12 rounded-sm shadow-sm text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
            <p>Lade Bestellungen...</p>
        </div>
    `;

    try {
        const ordersRef = collection(db, 'orders');
        const snapshot = await getDocs(ordersRef);

        allAdminOrders = [];
        snapshot.forEach(docSnap => {
            allAdminOrders.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Load all CV projects to merge with orders
        let cvProjectsMap = {};
        try {
            const cvProjectsSnapshot = await getDocs(collection(db, 'cvProjects'));
            cvProjectsSnapshot.forEach(docSnap => {
                const project = { id: docSnap.id, ...docSnap.data() };
                if (project.orderId) {
                    cvProjectsMap[project.orderId] = project;
                }
            });
        } catch (e) {
            logger.warn('Could not load CV projects for admin:', e);
        }

        // Merge orders with CV project data
        allAdminOrders = allAdminOrders.map(order => {
            const cvProject = cvProjectsMap[order.id];
            if (cvProject) {
                return {
                    ...order,
                    cvProject: cvProject,
                    cvProjectId: cvProject.id,
                    cvStatus: cvProject.status || 'new',
                    questionnaire: cvProject.questionnaire || null
                };
            }
            return order;
        });

        // Sort by date (newest first)
        allAdminOrders.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

        updateAdminStats(allAdminOrders);
        renderAdminOrders(allAdminOrders);

    } catch (e) {
        logger.error('Failed to load orders:', e);
        container.innerHTML = `
            <div class="bg-white p-12 rounded-sm shadow-sm text-center text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-4"></i>
                <p>Fehler beim Laden: ${e.message}</p>
            </div>
        `;
    }
}

function updateAdminStats(orders) {
    const total = orders.length;
    const processing = orders.filter(o => o.status === 'processing').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    const totalEl = document.getElementById('admin-stat-total');
    const processingEl = document.getElementById('admin-stat-processing');
    const completedEl = document.getElementById('admin-stat-completed');
    const revenueEl = document.getElementById('admin-stat-revenue');

    if (totalEl) totalEl.textContent = total;
    if (processingEl) processingEl.textContent = processing;
    if (completedEl) completedEl.textContent = completed;
    if (revenueEl) revenueEl.textContent = `€${revenue.toLocaleString('de-DE')}`;
}

// ========== ADMIN EXPORT FUNKTIONEN ==========

// CSV Export für Bestellungen
export function exportOrdersToCSV() {
    if (allAdminOrders.length === 0) {
        showToast('❌ Keine Bestellungen zum Exportieren');
        return;
    }

    const headers = ['Bestellnummer', 'Datum', 'Kunde', 'Email', 'Produkte', 'Betrag', 'Status'];
    const rows = allAdminOrders.map(order => {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE')
            : '-';
        const items = order.items?.map(i => i.title).join('; ') || '-';
        const status = {
            'processing': 'In Bearbeitung',
            'confirmed': 'Bestätigt',
            'completed': 'Abgeschlossen',
            'cancelled': 'Storniert'
        }[order.status] || order.status;

        return [
            order.id.substring(0, 8).toUpperCase(),
            date,
            order.customerName || '-',
            order.customerEmail || '-',
            items,
            `€${(order.total || 0).toFixed(2)}`,
            status
        ];
    });

    const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `APEX_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('✅ CSV-Export erfolgreich');
}

// CSV Export für Benutzer
export function exportUsersToCSV() {
    const container = document.getElementById('admin-users-list');
    if (!container || !window._adminUsers || window._adminUsers.length === 0) {
        showToast('❌ Keine Benutzer zum Exportieren');
        return;
    }

    const users = window._adminUsers;
    const headers = ['Vorname', 'Nachname', 'Email', 'Telefon', 'Unternehmen', 'Cookie-Consent', 'Registriert'];
    const rows = users.map(user => {
        const joined = user.joined?.seconds
            ? new Date(user.joined.seconds * 1000).toLocaleDateString('de-DE')
            : '-';
        const consent = user.cookieConsent === 'all' || user.cookieConsent === true
            ? 'Alle Cookies'
            : user.cookieConsent === 'essential' ? 'Nur notwendige' : 'Keine Auswahl';

        return [
            user.firstname || '-',
            user.lastname || '-',
            user.email || '-',
            user.phone || '-',
            user.company || '-',
            consent,
            joined
        ];
    });

    const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `APEX_Benutzer_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('✅ CSV-Export erfolgreich');
}

// ========== ADMIN BENUTZER-VERWALTUNG ==========

// Benutzer löschen (mit Bestätigung)
export async function deleteUser(userId, email) {
    if (!confirm(`Möchten Sie den Benutzer "${email}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
        return;
    }

    try {
        showToast('⏳ Lösche Benutzer...');

        // Lösche aus Firestore
        await updateDoc(doc(db, 'users', userId), {
            deleted: true,
            deletedAt: new Date()
        });

        showToast('✅ Benutzer wurde deaktiviert');
        loadAdminUsers(); // Refresh list
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('❌ Fehler beim Löschen: ' + error.message);
    }
}

export function filterAdminOrders() {
    const searchTerm = document.getElementById('admin-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('admin-filter-status')?.value || '';

    let filtered = allAdminOrders;

    if (searchTerm) {
        filtered = filtered.filter(order => {
            const email = (order.customerEmail || '').toLowerCase();
            const name = (order.customerName || '').toLowerCase();
            const id = order.id.toLowerCase();
            return email.includes(searchTerm) || name.includes(searchTerm) || id.includes(searchTerm);
        });
    }

    if (statusFilter) {
        filtered = filtered.filter(order => order.status === statusFilter);
    }

    renderAdminOrders(filtered);
}

function renderAdminOrders(orders) {
    const container = document.getElementById('admin-orders-list');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400">
                <i class="fas fa-inbox text-4xl mb-4"></i>
                <p>Keine Bestellungen gefunden</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Unbekannt';
        const time = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : '';

        const statusConfig = {
            processing: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: 'fa-clock', label: 'In Bearbeitung' },
            confirmed: { bg: 'bg-blue-100', text: 'text-blue-800', icon: 'fa-check', label: 'Bestätigt' },
            completed: { bg: 'bg-green-100', text: 'text-green-800', icon: 'fa-check-double', label: 'Abgeschlossen' },
            cancelled: { bg: 'bg-red-100', text: 'text-red-800', icon: 'fa-times', label: 'Storniert' }
        };
        const status = statusConfig[order.status] || statusConfig.processing;

        // Determine what type of order this is
        const isSession = hasCoachSession(order);
        const isCvOrderType = isCvOrder(order);
        const hasAppointment = order.appointment?.confirmed;
        const hasPendingProposals = order.appointmentProposals && !order.appointment?.confirmed && order.appointmentStatus !== 'declined';
        const needsAttention = isSession && !order.assignedCoachId;

        // First item title shortened
        const mainItem = order.items?.[0]?.title || 'Produkt';
        const itemCount = order.items?.length || 0;

        return `
            <div class="bg-white rounded-xl border ${needsAttention ? 'border-orange-300 ring-2 ring-orange-100' : 'border-gray-100'} overflow-hidden hover:shadow-md transition" data-order-id="${order.id}">
                <!-- Compact Header - Always Visible -->
                <div class="p-4 cursor-pointer" onclick="app.toggleOrderExpand('${order.id}')">
                    <div class="flex items-center gap-4">
                        <!-- Status Indicator -->
                        <div class="flex-shrink-0">
                            <div class="w-10 h-10 ${status.bg} rounded-lg flex items-center justify-center">
                                <i class="fas ${status.icon} ${status.text}"></i>
                            </div>
                        </div>

                        <!-- Main Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="font-bold text-brand-dark truncate">${sanitizeHTML(order.customerName || 'Unbekannt')}</span>
                                <span class="text-xs font-mono text-gray-400">#${order.id.substring(0, 6).toUpperCase()}</span>
                            </div>
                            <div class="flex items-center gap-3 text-xs text-gray-500">
                                <span><i class="fas fa-box mr-1"></i>${sanitizeHTML(mainItem.substring(0, 25))}${mainItem.length > 25 ? '...' : ''}${itemCount > 1 ? ` +${itemCount - 1}` : ''}</span>
                                <span><i class="fas fa-calendar mr-1"></i>${date}</span>
                            </div>
                        </div>

                        <!-- Quick Info Badges -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                            ${isSession ? `
                                ${order.assignedCoachId ? `
                                    <span class="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full flex items-center gap-1">
                                        <i class="fas fa-user-tie"></i>
                                        <span class="hidden sm:inline">${sanitizeHTML((order.assignedCoachName || 'Mentor').split(' ')[0])}</span>
                                    </span>
                                ` : `
                                    <span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full flex items-center gap-1 animate-pulse">
                                        <i class="fas fa-exclamation"></i>
                                        <span class="hidden sm:inline">Mentor fehlt</span>
                                    </span>
                                `}
                            ` : ''}
                            ${hasAppointment ? `
                                <span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                                    <i class="fas fa-calendar-check"></i>
                                    <span class="hidden sm:inline">Termin</span>
                                </span>
                            ` : hasPendingProposals ? `
                                <span class="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1">
                                    <i class="fas fa-hourglass-half"></i>
                                    <span class="hidden sm:inline">Wartet</span>
                                </span>
                            ` : ''}
                        </div>

                        <!-- Price & Expand -->
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="font-bold text-brand-dark">€${(order.total || 0).toLocaleString('de-DE')}</span>
                            <i id="expand-icon-${order.id}" class="fas fa-chevron-down text-gray-400 transition-transform"></i>
                        </div>
                    </div>
                </div>

                <!-- Expandable Content -->
                <div id="order-details-${order.id}" class="hidden border-t border-gray-100">
                    <div class="p-4 bg-gray-50 space-y-4">
                        <!-- Customer & Order Info -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-white rounded-lg p-3 border border-gray-100">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">Kunde</p>
                                <p class="font-medium text-brand-dark">${sanitizeHTML(order.customerName || 'Unbekannt')}</p>
                                <p class="text-sm text-gray-500">${sanitizeHTML(order.customerEmail || 'Keine Email')}</p>
                                <p class="text-xs text-gray-400 mt-1">${date} um ${time}</p>
                            </div>
                            <div class="bg-white rounded-lg p-3 border border-gray-100">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">Produkte</p>
                                ${order.items?.map(item => `
                                    <div class="flex justify-between text-sm">
                                        <span class="text-gray-700">${sanitizeHTML(item.title)}</span>
                                        <span class="font-medium">€${item.price}</span>
                                    </div>
                                `).join('') || '<p class="text-gray-400 text-sm">Keine Produkte</p>'}
                            </div>
                        </div>

                        <!-- Status & Actions Row -->
                        <div class="flex flex-wrap items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-500">Status:</span>
                                <select onchange="app.updateOrderStatus('${order.id}', this.value)"
                                        class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-gold ${status.bg} ${status.text}">
                                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>In Bearbeitung</option>
                                    <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Bestätigt</option>
                                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
                                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Storniert</option>
                                </select>
                            </div>
                            <div class="flex-1"></div>
                            <button onclick="app.showAppointmentProposalModal('${order.id}', '${order.userId}', '${sanitizeHTML(order.customerName || 'Kunde')}', '${sanitizeHTML(order.customerEmail || '')}')"
                                    class="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition">
                                <i class="fas fa-calendar-plus"></i>
                                <span>Termin</span>
                            </button>
                            <label class="flex items-center gap-2 px-3 py-1.5 bg-brand-gold text-brand-dark text-xs font-medium rounded-lg hover:bg-yellow-500 transition cursor-pointer">
                                <i class="fas fa-upload"></i>
                                <span>Dokument</span>
                                <input type="file" class="hidden" accept=".pdf,.doc,.docx"
                                       onchange="app.uploadDocumentToUser('${order.userId}', '${order.id}', this.files[0], '${sanitizeHTML(order.customerEmail || '')}', '${sanitizeHTML(order.customerName || 'Kunde')}')">
                            </label>
                        </div>

                        <!-- Mentor Section (only for sessions) -->
                        ${isSession ? `
                            <div class="bg-white rounded-lg p-3 border ${order.assignedCoachId ? 'border-indigo-200' : 'border-orange-200'}">
                                <div class="flex items-center justify-between mb-3">
                                    <p class="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <i class="fas fa-user-tie ${order.assignedCoachId ? 'text-indigo-500' : 'text-orange-500'}"></i>
                                        Mentor-Zuweisung
                                    </p>
                                    ${!order.assignedCoachId ? `
                                        <span class="text-xs text-orange-600 font-medium animate-pulse">Aktion erforderlich</span>
                                    ` : ''}
                                </div>
                                ${order.assignedCoachId ? `
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                <i class="fas fa-user text-indigo-600"></i>
                                            </div>
                                            <div>
                                                <p class="font-medium text-brand-dark">${sanitizeHTML(order.assignedCoachName || 'Mentor')}</p>
                                                <p class="text-xs text-green-600"><i class="fas fa-check mr-1"></i>Zugewiesen</p>
                                            </div>
                                        </div>
                                        <button onclick="app.showAssignCoachModal('${order.id}')"
                                                class="text-sm text-indigo-600 hover:text-indigo-800 underline">
                                            Ändern
                                        </button>
                                    </div>
                                ` : `
                                    <button onclick="app.showAssignCoachModal('${order.id}')"
                                            class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                                        <i class="fas fa-user-plus"></i>
                                        Mentor zuweisen
                                    </button>
                                `}
                            </div>
                        ` : ''}

                        <!-- CV Questionnaire Section (only for CV orders) -->
                        ${isCvOrderType ? `
                            <div class="bg-white rounded-lg p-3 border ${order.cvProjectId ? 'border-indigo-200' : 'border-amber-200'}">
                                <div class="flex items-center justify-between mb-3">
                                    <p class="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <i class="fas fa-file-alt ${order.cvProjectId ? 'text-indigo-500' : 'text-amber-500'}"></i>
                                        CV-Fragebogen
                                    </p>
                                    ${!order.cvProjectId ? `
                                        <span class="text-xs text-amber-600 font-medium">Noch nicht gesendet</span>
                                    ` : `
                                        <span class="text-xs ${order.cvStatus === 'data_received' || order.cvStatus === 'ready' || order.cvStatus === 'delivered' ? 'text-green-600 bg-green-50' : 'text-indigo-600 bg-indigo-50'} px-2 py-0.5 rounded font-medium">
                                            ${order.cvStatus === 'data_received' ? 'Daten erhalten' :
                                              order.cvStatus === 'generating' ? 'In Erstellung' :
                                              order.cvStatus === 'ready' ? 'CV fertig' :
                                              order.cvStatus === 'delivered' ? 'Zugestellt' : 'Wartet auf Kunde'}
                                        </span>
                                    `}
                                </div>
                                ${order.cvProjectId ? `
                                    ${(order.cvStatus === 'data_received' || order.cvStatus === 'generating' || order.cvStatus === 'ready' || order.cvStatus === 'delivered') && order.questionnaire ? `
                                        <!-- Ausgefüllter Fragebogen -->
                                        <div class="mb-3">
                                            <button onclick="app.toggleAdminQuestionnaireView('${order.id}')"
                                                    class="w-full flex items-center justify-between text-left p-2 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition">
                                                <span class="text-sm font-medium text-green-700">
                                                    <i class="fas fa-check-circle mr-2"></i>Fragebogen ausgefüllt - Daten ansehen
                                                </span>
                                                <i class="fas fa-chevron-down text-green-500 transition-transform" id="admin-cv-q-toggle-${order.id}"></i>
                                            </button>
                                            <div id="admin-cv-questionnaire-view-${order.id}" class="hidden mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200 max-h-96 overflow-y-auto">
                                                ${renderAdminQuestionnaireData(order.questionnaire, order.cvProject?.documents, order.cvProject?.templateSelection)}
                                            </div>
                                        </div>
                                    ` : `
                                        <!-- Fragebogen gesendet, warte auf Kunde -->
                                        <div class="flex items-center justify-between p-2 bg-indigo-50 rounded-lg">
                                            <div class="flex items-center gap-2">
                                                <i class="fas fa-hourglass-half text-indigo-500 animate-pulse"></i>
                                                <span class="text-sm text-indigo-700">Wartet auf Kundenantwort</span>
                                            </div>
                                            <a href="?questionnaire=${order.cvProjectId}" target="_blank"
                                               class="text-xs text-indigo-600 hover:text-indigo-800 underline">
                                                Link kopieren
                                            </a>
                                        </div>
                                    `}
                                ` : `
                                    <button onclick="app.sendCvQuestionnaireFromOrder('${order.id}', '${sanitizeHTML(order.customerEmail || '')}', '${sanitizeHTML(order.customerName || 'Kunde')}')"
                                            class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                                        <i class="fas fa-paper-plane"></i>
                                        Fragebogen senden
                                    </button>
                                `}
                            </div>
                        ` : ''}

                        <!-- Appointment Section -->
                        ${order.appointmentProposals || order.appointment || order.appointmentStatus ? `
                            <div class="bg-white rounded-lg p-3 border border-gray-100">
                                <p class="text-xs text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <i class="fas fa-calendar-alt text-brand-gold"></i>
                                    Terminplanung
                                </p>
                                ${order.appointmentStatus === 'confirmed' && order.appointment?.confirmed ? `
                                    <div class="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                        <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                            <i class="fas fa-check text-white"></i>
                                        </div>
                                        <div>
                                            <p class="font-medium text-green-800">Termin bestätigt</p>
                                            <p class="text-sm text-green-700">
                                                ${new Date(order.appointment.datetime).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr
                                            </p>
                                        </div>
                                    </div>
                                ` : order.appointmentStatus === 'declined' ? `
                                    <div class="p-3 bg-orange-50 rounded-lg border border-orange-200">
                                        <div class="flex items-center gap-3 mb-2">
                                            <i class="fas fa-times-circle text-orange-500"></i>
                                            <span class="font-medium text-orange-800">Termine abgelehnt</span>
                                        </div>
                                        ${order.appointmentDeclineReason ? `
                                            <p class="text-sm text-gray-600 italic mb-2">"${sanitizeHTML(order.appointmentDeclineReason)}"</p>
                                        ` : ''}
                                        <button onclick="app.showAppointmentProposalModal('${order.id}', '${order.userId}', '${sanitizeHTML(order.customerName || 'Kunde')}', '${sanitizeHTML(order.customerEmail || '')}')"
                                                class="text-sm text-orange-600 hover:text-orange-800 underline">
                                            Neue Termine vorschlagen
                                        </button>
                                    </div>
                                ` : order.appointmentProposals ? `
                                    <div class="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                        <div class="flex items-center gap-3 mb-2">
                                            <i class="fas fa-hourglass-half text-yellow-600 animate-pulse"></i>
                                            <span class="font-medium text-yellow-800">Warte auf Kundenauswahl</span>
                                        </div>
                                        <div class="text-sm text-yellow-700 space-y-1">
                                            ${order.appointmentProposals.slice(0, 3).map(prop => `
                                                <p><i class="fas fa-calendar text-yellow-500 mr-2"></i>${new Date(prop).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr</p>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}

                        <!-- Documents Section (Collapsed by Default) -->
                        <div class="bg-white rounded-lg border border-gray-100 overflow-hidden">
                            <button onclick="app.toggleOrderDocs('${order.id}')" class="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 transition">
                                <span class="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <i class="fas fa-folder text-gray-400"></i>
                                    Dokumente
                                </span>
                                <i id="docs-icon-${order.id}" class="fas fa-chevron-down text-gray-400 text-xs transition-transform"></i>
                            </button>
                            <div id="docs-content-${order.id}" class="hidden border-t border-gray-100 p-3">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <p class="text-xs text-blue-600 font-medium mb-2"><i class="fas fa-upload mr-1"></i>Vom Kunden</p>
                                        <div id="doc-list-customer-${order.id}" class="space-y-1 text-sm">
                                            <p class="text-gray-400 italic text-xs">Lade...</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p class="text-xs text-green-600 font-medium mb-2"><i class="fas fa-paper-plane mr-1"></i>Von dir</p>
                                        <div id="doc-list-admin-${order.id}" class="space-y-1 text-sm">
                                            <p class="text-gray-400 italic text-xs">Lade...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Load documents for each order
    orders.forEach(order => {
        if (order.userId) {
            loadOrderDocuments(order.userId, order.id);
        }
    });
}

async function loadOrderDocuments(userId, orderId) {
    const customerContainer = document.getElementById(`doc-list-customer-${orderId}`);
    const adminContainer = document.getElementById(`doc-list-admin-${orderId}`);
    if (!storage) return;

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");

        // Load customer uploaded documents (from users/{userId}/)
        if (customerContainer) {
            try {
                const customerRef = ref(storage, `users/${userId}`);
                const customerResult = await listAll(customerRef);

                if (customerResult.items.length === 0) {
                    customerContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Keine Dokumente</p>';
                } else {
                    const docs = await Promise.all(customerResult.items.map(async item => {
                        const url = await getDownloadURL(item);
                        // Extract original filename (remove timestamp prefix)
                        const nameParts = item.name.split('_');
                        const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
                        return { name: displayName, fullName: item.name, url };
                    }));

                    customerContainer.innerHTML = docs.map(d => `
                        <a href="${d.url}" target="_blank" download="${d.name}"
                           class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition bg-blue-50 px-3 py-2 rounded">
                            <i class="fas fa-file-alt"></i>
                            <span>${sanitizeHTML(d.name)}</span>
                            <i class="fas fa-download text-xs ml-auto"></i>
                        </a>
                    `).join('');
                }
            } catch (e) {
                customerContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Keine Dokumente</p>';
            }
        }

        // Load admin delivered documents (from delivered/{userId}/)
        if (adminContainer) {
            try {
                const adminRef = ref(storage, `delivered/${userId}`);
                const adminResult = await listAll(adminRef);

                if (adminResult.items.length === 0) {
                    adminContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Noch nichts gesendet</p>';
                } else {
                    const docs = await Promise.all(adminResult.items.map(async item => {
                        const url = await getDownloadURL(item);
                        // Extract original filename (remove timestamp prefix)
                        const nameParts = item.name.split('_');
                        const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
                        return { name: displayName, fullName: item.name, url };
                    }));

                    adminContainer.innerHTML = docs.map(d => `
                        <a href="${d.url}" target="_blank" download="${d.name}"
                           class="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 transition bg-green-50 px-3 py-2 rounded">
                            <i class="fas fa-file-pdf"></i>
                            <span>${sanitizeHTML(d.name)}</span>
                            <i class="fas fa-download text-xs ml-auto"></i>
                        </a>
                    `).join('');
                }
            } catch (e) {
                adminContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Noch nichts gesendet</p>';
            }
        }

    } catch (e) {
        logger.error('Failed to load documents:', e);
        if (customerContainer) customerContainer.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden</p>';
        if (adminContainer) adminContainer.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden</p>';
    }
}

// Toggle order card expand/collapse
export function toggleOrderExpand(orderId) {
    const details = document.getElementById(`order-details-${orderId}`);
    const icon = document.getElementById(`expand-icon-${orderId}`);

    if (details && icon) {
        const isHidden = details.classList.contains('hidden');
        details.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

        // Load documents when expanded
        if (isHidden) {
            const order = allAdminOrders.find(o => o.id === orderId);
            if (order?.userId) {
                loadOrderDocuments(order.userId, orderId);
            }
        }
    }
}

// Toggle documents section within order
export function toggleOrderDocs(orderId) {
    const docs = document.getElementById(`docs-content-${orderId}`);
    const icon = document.getElementById(`docs-icon-${orderId}`);

    if (docs && icon) {
        const isHidden = docs.classList.contains('hidden');
        docs.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

export async function updateOrderStatus(orderId, newStatus) {
    if (!db) return;

    try {
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
            status: newStatus,
            updatedAt: new Date()
        });

        // Update local data
        const order = allAdminOrders.find(o => o.id === orderId);
        if (order) order.status = newStatus;

        updateAdminStats(allAdminOrders);
        showToast(`✅ Status auf "${newStatus}" geändert`);

    } catch (e) {
        logger.error('Failed to update status:', e);
        showToast('❌ Status-Update fehlgeschlagen', 3000);
    }
}

export async function uploadDocumentToUser(userId, orderId, file, customerEmail, customerName) {
    if (!file || !storage || !userId) {
        showToast('❌ Upload nicht möglich', 3000);
        return;
    }

    try {
        showToast('⏳ Dokument wird hochgeladen...');

        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        const storageRef = ref(storage, `delivered/${userId}/${fileName}`);

        await uploadBytes(storageRef, file);

        // Notify customer via email
        if (customerEmail) {
            try {
                await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyCustomerDocumentReady', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerEmail: customerEmail,
                        customerName: customerName || 'Kunde',
                        documentName: file.name
                    })
                });
            } catch (emailErr) {
                logger.warn('Failed to send customer notification:', emailErr);
            }
        }

        showToast('✅ Dokument erfolgreich hochgeladen');

        // Reload documents for this order
        loadOrderDocuments(userId, orderId);

    } catch (e) {
        logger.error('Upload failed:', e);
        showToast('❌ Upload fehlgeschlagen: ' + e.message, 3000);
    }
}

// Load delivered documents for user dashboard
export async function loadDeliveredDocuments(state) {
    logger.log('Loading delivered documents for user:', state.user?.uid);

    if (!state.user || !storage) {
        logger.log('No user or storage available');
        return;
    }

    const container = document.getElementById('downloads-list');
    if (!container) {
        logger.log('Downloads container not found');
        return;
    }

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");
        const storagePath = `delivered/${state.user.uid}`;
        logger.log('Checking storage path:', storagePath);
        const listRef = ref(storage, storagePath);
        const result = await listAll(listRef);
        logger.log('Found documents:', result.items.length);

        if (result.items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-award text-3xl text-gray-300 mb-3"></i>
                    <p class="text-sm">Noch keine fertigen Dokumente verfügbar</p>
                </div>
            `;
            return;
        }

        const docs = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            // Extract original filename (remove timestamp prefix)
            const nameParts = item.name.split('_');
            const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
            return { name: displayName, fullName: item.name, url };
        }));

        container.innerHTML = `
            <div class="space-y-3">
                ${docs.map(doc => `
                    <a href="${doc.url}" target="_blank" download="${doc.name}"
                       class="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition group">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                                <i class="fas fa-file-pdf text-white"></i>
                            </div>
                            <div>
                                <p class="font-bold text-brand-dark">${sanitizeHTML(doc.name)}</p>
                                <p class="text-xs text-gray-500">Klicken zum Download</p>
                            </div>
                        </div>
                        <i class="fas fa-download text-green-600 group-hover:scale-110 transition-transform"></i>
                    </a>
                `).join('')}
            </div>
        `;

    } catch (e) {
        logger.error('Failed to load delivered documents:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">Fehler beim Laden der Dokumente</p>
            </div>
        `;
    }
}

// Load user uploaded documents for user dashboard
export async function loadUserUploads(state) {
    logger.log('Loading user uploads for user:', state.user?.uid);

    if (!state.user || !storage) {
        logger.log('No user or storage available');
        return;
    }

    const container = document.getElementById('user-uploads-list');
    if (!container) {
        logger.log('User uploads container not found');
        return;
    }

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");
        const storagePath = `users/${state.user.uid}`;
        logger.log('Checking user uploads path:', storagePath);
        const listRef = ref(storage, storagePath);
        const result = await listAll(listRef);
        logger.log('Found user uploads:', result.items.length);

        if (result.items.length === 0) {
            container.innerHTML = `
                <div class="flex items-center gap-3 text-gray-400">
                    <i class="fas fa-folder-open text-lg"></i>
                    <span class="text-sm">Keine Uploads vorhanden</span>
                </div>
            `;
            return;
        }

        const docs = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            const metadata = await getMetadata(item);
            // Extract original filename (remove timestamp prefix)
            const nameParts = item.name.split('_');
            const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
            return {
                name: displayName,
                fullName: item.name,
                url,
                uploadedAt: metadata.timeCreated || null
            };
        }));

        // Sort by date (newest first)
        docs.sort((a, b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt) : new Date(0);
            const dateB = b.uploadedAt ? new Date(b.uploadedAt) : new Date(0);
            return dateB - dateA;
        });

        container.innerHTML = `
            <div class="flex items-center gap-2 text-gray-500 mb-3">
                <i class="fas fa-folder-open text-lg"></i>
                <span class="text-sm font-medium">Ihre Uploads (${docs.length})</span>
            </div>
            <div class="space-y-2">
                ${docs.map(doc => `
                    <a href="${doc.url}" target="_blank" download="${doc.name}"
                       class="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition group">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 bg-gray-400 rounded flex items-center justify-center">
                                <i class="fas fa-file-alt text-white text-sm"></i>
                            </div>
                            <div>
                                <p class="font-medium text-brand-dark text-sm">${sanitizeHTML(doc.name)}</p>
                                <p class="text-xs text-gray-400">
                                    ${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                                </p>
                            </div>
                        </div>
                        <i class="fas fa-download text-gray-400 group-hover:text-gray-600 group-hover:scale-110 transition-all"></i>
                    </a>
                `).join('')}
            </div>
        `;

    } catch (e) {
        logger.error('Failed to load user uploads:', e);
        container.innerHTML = `
            <div class="flex items-center gap-3 text-gray-400">
                <i class="fas fa-folder-open text-lg"></i>
                <span class="text-sm">Keine Uploads vorhanden</span>
            </div>
        `;
    }
}

// Cookie Consent Functions
export function checkCookieConsent() {
    const consent = localStorage.getItem('apex-cookie-consent');
    const banner = document.getElementById('cookie-banner');

    if (!banner) return;

    // Akzeptiere auch alte Werte 'accepted' und 'declined'
    if (consent === 'all' || consent === 'essential' || consent === 'accepted' || consent === 'declined') {
        banner.classList.add('hidden');

        // Migriere alte Werte zu neuen
        if (consent === 'accepted') {
            localStorage.setItem('apex-cookie-consent', 'all');
        } else if (consent === 'declined') {
            localStorage.setItem('apex-cookie-consent', 'essential');
        }
    } else {
        // Zeige Banner mit Animation
        banner.classList.remove('hidden');
        setTimeout(() => {
            banner.style.transform = 'translateY(0)';
        }, 100);
    }
}

export async function acceptAllCookies() {
    localStorage.setItem('apex-cookie-consent', 'all');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('hidden');

    // Speichere in Firestore wenn User eingeloggt ist
    await saveCookieConsentToFirestore('all');
    showToast('✅ Cookie-Einstellungen gespeichert');
}

export async function acceptEssentialCookies() {
    localStorage.setItem('apex-cookie-consent', 'essential');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('hidden');

    // Speichere in Firestore wenn User eingeloggt ist
    await saveCookieConsentToFirestore('essential');
    showToast('✅ Cookie-Einstellungen gespeichert');
}

// Legacy-Funktionen für Kompatibilität
export function acceptCookies() {
    acceptAllCookies();
}

export function declineCookies() {
    acceptEssentialCookies();
}

// Speichere Cookie-Consent in Firestore
async function saveCookieConsentToFirestore(consentType) {
    try {
        const user = auth?.currentUser;
        if (!user || !db) return;

        await updateDoc(doc(db, 'users', user.uid), {
            cookieConsent: consentType,
            cookieConsentDate: new Date()
        });
        console.log('Cookie consent saved to Firestore:', consentType);
    } catch (error) {
        console.error('Error saving cookie consent:', error);
    }
}

// ========== STRATEGY CALL MODAL ==========

export function openStrategyModal() {
    const modal = document.getElementById('strategy-call-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

export function closeStrategyModal() {
    const modal = document.getElementById('strategy-call-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    // Reset form
    const form = document.getElementById('strategy-call-form');
    if (form) form.reset();
}

export async function submitStrategyCall(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gesendet...';
    }

    try {
        const formData = {
            name: form.querySelector('[name="name"]')?.value || '',
            email: form.querySelector('[name="email"]')?.value || '',
            phone: form.querySelector('[name="phone"]')?.value || '',
            message: form.querySelector('[name="message"]')?.value || '',
            createdAt: new Date().toISOString(),
            status: 'new'
        };

        if (!db) {
            showToast('Fehler: Datenbank nicht verfügbar');
            return;
        }

        await addDoc(collection(db, 'strategyCalls'), formData);

        showToast('Anfrage erfolgreich gesendet!');
        closeStrategyModal();

    } catch (error) {
        logger.error('Error submitting strategy call:', error);
        showToast('Fehler beim Senden. Bitte versuchen Sie es erneut.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// ========== PACKAGE CONFIG MODAL ==========

export function openPackageConfigModal(state, name, price) {
    const modal = document.getElementById('package-config-modal');
    if (!modal) {
        // Fallback: direkt zum Warenkorb hinzufügen
        addToCart(state, name, price);
        return;
    }

    // Set package info - use IDs from HTML
    const titleEl = document.getElementById('config-modal-title');
    const basePriceEl = document.getElementById('config-base-price');
    const totalPriceEl = document.getElementById('config-total-price');

    if (titleEl) titleEl.textContent = name;
    if (basePriceEl) basePriceEl.textContent = `€${price}`;
    if (totalPriceEl) totalPriceEl.textContent = `€${price}`;

    // Store in modal data
    modal.dataset.packageName = name;
    modal.dataset.packagePrice = price;

    // Reset all options to default
    const languageRadios = modal.querySelectorAll('input[name="language"]');
    const deliveryRadios = modal.querySelectorAll('input[name="delivery"]');
    const addonCheckboxes = modal.querySelectorAll('input[type="checkbox"]');

    languageRadios.forEach(r => r.checked = r.value === 'de');
    deliveryRadios.forEach(r => r.checked = r.value === 'standard');
    addonCheckboxes.forEach(c => c.checked = false);

    // Show/hide sections based on package
    const isQuickCheck = name.includes('Quick-Check');
    const isExecutive = name.includes('Executive') || name.includes('C-Suite');

    const languageSection = document.getElementById('config-language-section');
    const languageIncluded = document.getElementById('config-language-included');
    const addonsSection = document.getElementById('config-addons-section');

    if (languageSection) languageSection.classList.toggle('hidden', isExecutive || isQuickCheck);
    if (languageIncluded) languageIncluded.classList.toggle('hidden', !isExecutive);
    if (addonsSection) addonsSection.classList.toggle('hidden', isQuickCheck);

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Scroll content to top
    const content = document.getElementById('config-modal-content');
    if (content) content.scrollTop = 0;

    checkModalScroll();
}

export function closePackageConfigModal() {
    const modal = document.getElementById('package-config-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

export function checkModalScroll() {
    const content = document.getElementById('config-modal-content');
    if (!content) return;

    const scrollIndicator = document.getElementById('config-scroll-indicator');
    if (scrollIndicator) {
        // Show indicator if there's more content to scroll
        const hasMoreContent = content.scrollHeight > content.clientHeight + 10;
        const isAtBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 10;

        if (hasMoreContent && !isAtBottom) {
            scrollIndicator.classList.remove('hidden');
        } else {
            scrollIndicator.classList.add('hidden');
        }
    }
}

export function confirmPackageConfig(state) {
    const modal = document.getElementById('package-config-modal');
    if (!modal) return;

    const baseName = modal.dataset.packageName;
    const basePrice = parseInt(modal.dataset.packagePrice) || 0;
    let total = basePrice;
    let nameSuffix = [];

    // Check if this is a package that has language options
    const languageSection = document.getElementById('config-language-section');
    const languageIncluded = document.getElementById('config-language-included');
    const hasLanguageOption = languageSection && !languageSection.classList.contains('hidden');
    const isExecutive = languageIncluded && !languageIncluded.classList.contains('hidden');

    // Check language option
    const languageRadio = modal.querySelector('input[name="language"]:checked');
    if (isExecutive) {
        // Executive packages have bilingual included
        nameSuffix.push('DE/EN');
    } else if (hasLanguageOption && languageRadio) {
        if (languageRadio.value === 'both') {
            total += 99;
            nameSuffix.push('DE/EN');
        } else if (languageRadio.value === 'en') {
            nameSuffix.push('EN');
        } else {
            nameSuffix.push('DE');
        }
    }

    // Check delivery option - always show
    const deliveryRadio = modal.querySelector('input[name="delivery"]:checked');
    if (deliveryRadio?.value === 'express') {
        total += 99;
        nameSuffix.push('Express');
    } else {
        nameSuffix.push('Standard');
    }

    // Check add-ons
    const addonCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
    addonCheckboxes.forEach(cb => {
        const addonPrice = parseInt(cb.value) || 0;
        total += addonPrice;
    });

    // Build final name
    let finalName = baseName;
    if (nameSuffix.length > 0) {
        finalName = `${baseName} (${nameSuffix.join(', ')})`;
    }

    // WICHTIG: Zuerst alle alten Add-ons entfernen (Interview-Simulation, Zeugnis-Analyse)
    // bevor das neue Paket hinzugefügt wird
    state.cart = state.cart.filter(item =>
        !item.title.includes('Interview-Simulation') &&
        !item.title.includes('Zeugnis-Analyse')
    );

    // Add main package (addToCart entfernt auch alte CV-Pakete)
    addToCart(state, finalName, total - getAddonsTotal(addonCheckboxes));

    // Add add-ons separately to cart (diese sind jetzt definitiv neu)
    addonCheckboxes.forEach(cb => {
        let addonName;
        if (cb.name === 'addon-interview') {
            addonName = 'Interview-Simulation (60 Min.)';
        } else if (cb.name === 'addon-zeugnis') {
            addonName = 'Zeugnis-Analyse';
        } else if (cb.name === 'addon-website') {
            addonName = 'Executive Landing Page';
        } else {
            addonName = 'Add-on';
        }
        const addonPrice = parseInt(cb.value) || 0;

        // Add as separate item with unique integer ID
        state.cart.push({
            title: addonName,
            price: addonPrice,
            id: Date.now() + Math.floor(Math.random() * 1000)
        });
    });

    if (addonCheckboxes.length > 0) {
        updateCartUI(state);
        saveCartToLocalStorage(state.cart);
    }

    closePackageConfigModal();
}

function getAddonsTotal(checkboxes) {
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseInt(cb.value) || 0;
    });
    return total;
}

export function updatePackageConfigTotal() {
    const modal = document.getElementById('package-config-modal');
    if (!modal) return;

    const basePrice = parseInt(modal.dataset.packagePrice) || 0;
    let total = basePrice;

    // Check language option (bilingual = +99)
    const languageRadio = modal.querySelector('input[name="language"]:checked');
    if (languageRadio?.value === 'both') {
        total += 99;
    }

    // Check delivery option (express = +99)
    const deliveryRadio = modal.querySelector('input[name="delivery"]:checked');
    if (deliveryRadio?.value === 'express') {
        total += 99;
    }

    // Check add-ons
    const addonCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
    addonCheckboxes.forEach(cb => {
        const addonPrice = parseInt(cb.value) || 0;
        total += addonPrice;
    });

    const totalEl = document.getElementById('config-total-price');
    if (totalEl) {
        totalEl.textContent = `€${total}`;
    }
}

export function addToCartWithExpress(state, name, basePrice, expressPrice, checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    const isExpress = checkbox?.checked || false;

    const finalPrice = isExpress ? basePrice + expressPrice : basePrice;
    const finalName = isExpress ? `${name} (Express)` : name;

    addToCart(state, finalName, finalPrice);
}

// ========== EMAIL VERIFICATION ==========

export function checkEmailVerification() {
    // This is called to check if email was recently verified
    // Usually handled by handleEmailAction
}

export function closeEmailVerifiedModal() {
    const modal = document.getElementById('email-verified-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========== ADMIN FUNCTIONS ==========

export async function loadAdminUsers() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-400">Lade Benutzer...</p>';

    try {
        if (!db) {
            container.innerHTML = '<p class="text-red-400">Datenbank nicht verfügbar</p>';
            return;
        }

        const usersSnap = await getDocs(collection(db, 'users'));
        const users = usersSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => !u.deleted); // Gelöschte Benutzer ausblenden

        // Speichere für Export und Pagination
        window._adminUsers = users;
        paginationState.users.data = users;
        paginationState.users.total = users.length;
        paginationState.users.page = 1; // Reset to first page on reload

        if (users.length === 0) {
            container.innerHTML = '<p class="text-gray-400">Keine Benutzer gefunden.</p>';
            return;
        }

        // Update statistics
        const totalUsers = users.length;
        const cookiesAll = users.filter(u => u.cookieConsent === 'all' || u.cookieConsent === true).length;
        const cookiesEssential = users.filter(u => u.cookieConsent === 'essential').length;

        const statUsers = document.getElementById('admin-stat-users');
        const statCookiesAll = document.getElementById('admin-stat-cookies-all');
        const statCookiesEssential = document.getElementById('admin-stat-cookies-essential');

        if (statUsers) statUsers.textContent = totalUsers;
        if (statCookiesAll) statCookiesAll.textContent = cookiesAll;
        if (statCookiesEssential) statCookiesEssential.textContent = cookiesEssential;

        renderAdminUsersList();
    } catch (e) {
        logger.error('Error loading users:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Benutzer.</p>';
    }
}

function renderAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    const state = paginationState.users;
    const perPage = PAGINATION.USERS_PER_PAGE;
    const start = (state.page - 1) * perPage;
    const end = start + perPage;
    const usersToShow = state.data.slice(start, end);

    container.innerHTML = usersToShow.map(user => `
        <div class="bg-brand-dark/50 rounded-lg p-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center">
                    <span class="text-brand-gold font-bold">${(user.firstname || user.email || '?')[0].toUpperCase()}</span>
                </div>
                <div>
                    <h4 class="font-bold text-white">${user.firstname || ''} ${user.lastname || ''}</h4>
                    <p class="text-sm text-gray-400">${user.email || user.id}</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="app.verifyUserEmail('${user.email}')" class="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark transition" title="E-Mail als verifiziert markieren">
                    <i class="fas fa-check-circle mr-1"></i>Verifizieren
                </button>
                <button onclick="app.deleteUser('${user.id}', '${user.email}')" class="text-xs px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition" title="Benutzer deaktivieren">
                    <i class="fas fa-trash mr-1"></i>Löschen
                </button>
                <span class="text-xs px-2 py-1 rounded ${user.cookieConsent === 'all' || user.cookieConsent === true ? 'bg-green-500/20 text-green-400' : user.cookieConsent === 'essential' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}">
                    ${user.cookieConsent === 'all' || user.cookieConsent === true ? 'Alle Cookies' : user.cookieConsent === 'essential' ? 'Nur notwendige' : 'Keine Auswahl'}
                </span>
                <div class="text-sm text-gray-400">
                    ${user.company || ''}
                </div>
            </div>
        </div>
    `).join('') + renderPagination('users');
}

// Admin: E-Mail eines Users als verifiziert markieren
export async function verifyUserEmail(email) {
    if (!email) {
        showToast('❌ Keine E-Mail angegeben');
        return;
    }

    // Hole Admin-Email aus aktuellem User
    const adminEmail = auth?.currentUser?.email;
    if (!adminEmail) {
        showToast('❌ Nicht als Admin eingeloggt');
        return;
    }

    try {
        showToast('⏳ Verifiziere E-Mail...');

        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/setEmailVerified', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, adminEmail })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`✅ ${email} wurde verifiziert!`);
        } else {
            showToast(`❌ Fehler: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Verify email error:', error);
        showToast('❌ Fehler beim Verifizieren');
    }
}

export async function loadStrategyCalls() {
    const container = document.getElementById('admin-strategy-list');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-400">Lade Anfragen...</p>';

    try {
        if (!db) {
            container.innerHTML = '<p class="text-red-400">Datenbank nicht verfügbar</p>';
            return;
        }

        const callsSnap = await getDocs(collection(db, 'strategyCalls'));
        const calls = callsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (calls.length === 0) {
            container.innerHTML = '<p class="text-gray-400">Keine Anfragen gefunden.</p>';
            return;
        }

        // Sort by date (newest first)
        calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Store for pagination
        paginationState.calls.data = calls;
        paginationState.calls.total = calls.length;
        paginationState.calls.page = 1;

        // Update statistics
        const totalCalls = calls.length;
        const newCalls = calls.filter(c => !c.status || c.status === 'new').length;
        const doneCalls = calls.filter(c => c.status === 'completed').length;

        const statTotal = document.getElementById('admin-stat-strategy-total');
        const statNew = document.getElementById('admin-stat-strategy-new');
        const statDone = document.getElementById('admin-stat-strategy-done');

        if (statTotal) statTotal.textContent = totalCalls;
        if (statNew) statNew.textContent = newCalls;
        if (statDone) statDone.textContent = doneCalls;

        renderStrategyCallsList();
    } catch (e) {
        logger.error('Error loading strategy calls:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Anfragen.</p>';
    }
}

function renderStrategyCallsList() {
    const container = document.getElementById('admin-strategy-list');
    if (!container) return;

    const state = paginationState.calls;
    const perPage = PAGINATION.CALLS_PER_PAGE;
    const start = (state.page - 1) * perPage;
    const end = start + perPage;
    const callsToShow = state.data.slice(start, end);

    container.innerHTML = callsToShow.map(call => `
        <div class="bg-brand-dark/50 rounded-lg p-4">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h4 class="font-bold text-white">${call.name || 'Unbekannt'}</h4>
                    <p class="text-sm text-gray-400">${call.email || ''}</p>
                    ${call.phone ? `<p class="text-sm text-gray-400">${call.phone}</p>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <select onchange="app.updateStrategyCallStatus('${call.id}', this.value)"
                            class="bg-brand-dark border border-gray-600 rounded px-2 py-1 text-sm text-white">
                        <option value="new" ${call.status === 'new' ? 'selected' : ''}>Neu</option>
                        <option value="contacted" ${call.status === 'contacted' ? 'selected' : ''}>Kontaktiert</option>
                        <option value="completed" ${call.status === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
                    </select>
                </div>
            </div>
            ${call.message ? `<p class="text-sm text-gray-300 mt-2">${call.message}</p>` : ''}
            <p class="text-xs text-gray-500 mt-2">${new Date(call.createdAt).toLocaleString('de-DE')}</p>
        </div>
    `).join('') + renderPagination('calls');
}

export async function updateStrategyCallStatus(callId, status) {
    try {
        if (!db) {
            showToast('Datenbank nicht verfügbar');
            return;
        }

        await updateDoc(doc(db, 'strategyCalls', callId), { status });
        showToast('Status aktualisiert');
    } catch (e) {
        logger.error('Error updating strategy call:', e);
        showToast('Fehler beim Aktualisieren');
    }
}

export async function loadAdminSettings() {
    // Load mentoring slots text
    await loadMentoringSlotsText();
}

export async function saveMentoringSlots() {
    const input = document.getElementById('mentoring-slots-input');
    if (!input) return;

    const text = input.value.trim();

    try {
        if (!db) {
            showToast('Datenbank nicht verfügbar');
            return;
        }

        await setDoc(doc(db, 'settings', 'mentoring'), { slotsText: text });
        showToast('Einstellung gespeichert');
    } catch (e) {
        logger.error('Error saving mentoring slots:', e);
        showToast('Fehler beim Speichern');
    }
}

// ============================================
// CV-GENERATOR FUNCTIONS
// ============================================

// Store for CV projects
let cvProjectsCache = [];

// CV Package identifiers (to filter CV-related orders)
const CV_PACKAGE_KEYWORDS = ['CV', 'Lebenslauf', 'Quick-Check', 'Young Professional', 'Senior Professional', 'Executive', 'C-Suite'];

// Status labels and colors
const CV_STATUS_CONFIG = {
    'new': { label: 'Neu', color: 'bg-blue-100 text-blue-800', icon: 'fa-plus-circle' },
    'questionnaire_sent': { label: 'Fragebogen gesendet', color: 'bg-yellow-100 text-yellow-800', icon: 'fa-paper-plane' },
    'data_received': { label: 'Daten erhalten', color: 'bg-indigo-100 text-indigo-800', icon: 'fa-check-circle' },
    'generating': { label: 'Wird generiert', color: 'bg-purple-100 text-purple-800', icon: 'fa-cog fa-spin' },
    'ready': { label: 'CV fertig', color: 'bg-green-100 text-green-800', icon: 'fa-file-alt' },
    'delivered': { label: 'Zugestellt', color: 'bg-gray-100 text-gray-800', icon: 'fa-check-double' }
};

// Load CV projects from orders
export async function loadCvProjects() {
    const listContainer = document.getElementById('cv-projects-list');
    const emptyContainer = document.getElementById('cv-projects-empty');

    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
            <p>Lade CV-Projekte...</p>
        </div>
    `;

    try {
        // Load all orders and filter for CV packages
        const ordersRef = collection(db, 'orders');
        const ordersSnapshot = await getDocs(ordersRef);

        // Filter orders that contain CV packages
        const cvOrders = [];
        ordersSnapshot.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            // Check if any item contains CV-related keywords
            const hasCvPackage = order.items?.some(item =>
                CV_PACKAGE_KEYWORDS.some(keyword =>
                    item.title?.toLowerCase().includes(keyword.toLowerCase())
                )
            );
            if (hasCvPackage) {
                cvOrders.push(order);
            }
        });

        // Also load any existing cvProjects to merge status
        const cvProjectsRef = collection(db, 'cvProjects');
        const cvProjectsSnapshot = await getDocs(cvProjectsRef);
        const cvProjectsMap = {};
        cvProjectsSnapshot.forEach(docSnap => {
            cvProjectsMap[docSnap.data().orderId] = { id: docSnap.id, ...docSnap.data() };
        });

        // Merge orders with cvProjects data
        cvProjectsCache = cvOrders.map(order => {
            const project = cvProjectsMap[order.id] || {};
            return {
                ...order,
                cvProjectId: project.id || null,
                cvStatus: project.status || 'new',
                questionnaire: project.questionnaire || null,
                documents: project.documents || null,
                generatedCv: project.generatedCv || null
            };
        });

        // Sort by date (newest first)
        cvProjectsCache.sort((a, b) => {
            const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
            const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
            return dateB - dateA;
        });

        renderCvProjects();

    } catch (e) {
        logger.error('Error loading CV projects:', e);
        listContainer.innerHTML = `
            <div class="bg-white rounded-xl border border-red-200 p-8 text-center text-red-500">
                <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                <p>Fehler beim Laden der CV-Projekte</p>
                <p class="text-sm mt-2">${e.message}</p>
            </div>
        `;
    }
}

// Render CV projects list
function renderCvProjects() {
    const listContainer = document.getElementById('cv-projects-list');
    const emptyContainer = document.getElementById('cv-projects-empty');

    if (!listContainer) return;

    // Apply filters
    const searchTerm = document.getElementById('cv-project-search')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('cv-project-status-filter')?.value || '';

    let filteredProjects = cvProjectsCache.filter(project => {
        // Search filter
        const matchesSearch = !searchTerm ||
            project.id?.toLowerCase().includes(searchTerm) ||
            project.customerName?.toLowerCase().includes(searchTerm) ||
            project.customerEmail?.toLowerCase().includes(searchTerm);

        // Status filter
        const matchesStatus = !statusFilter || project.cvStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filteredProjects.length === 0) {
        listContainer.innerHTML = '';
        if (emptyContainer) {
            emptyContainer.classList.remove('hidden');
        }
        return;
    }

    if (emptyContainer) {
        emptyContainer.classList.add('hidden');
    }

    listContainer.innerHTML = filteredProjects.map(project => {
        const statusConfig = CV_STATUS_CONFIG[project.cvStatus] || CV_STATUS_CONFIG['new'];
        const orderDate = project.date?.toDate?.() || new Date(project.date);
        const formattedDate = orderDate.toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // Get CV package name from items
        const cvItem = project.items?.find(item =>
            CV_PACKAGE_KEYWORDS.some(keyword =>
                item.title?.toLowerCase().includes(keyword.toLowerCase())
            )
        );
        const packageName = cvItem?.title || 'CV-Paket';

        // Check what data is available
        const hasQuestionnaire = !!project.questionnaire;
        const hasDocuments = project.documents?.existingCv || project.documents?.targetJob;
        const hasCv = !!project.generatedCv;

        return `
            <div class="bg-white rounded-xl border border-gray-100 hover:border-brand-gold/50 transition-all overflow-hidden">
                <div class="p-4 sm:p-6">
                    <!-- Header Row -->
                    <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div class="flex-1 min-w-[200px]">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-mono text-gray-400">${project.id}</span>
                                <span class="text-xs text-gray-300">|</span>
                                <span class="text-xs text-gray-400">${formattedDate}</span>
                            </div>
                            <h3 class="font-medium text-brand-dark">${project.customerName || 'Unbekannt'}</h3>
                            <p class="text-sm text-gray-500">${project.customerEmail || ''}</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}">
                                <i class="fas ${statusConfig.icon} mr-1"></i>
                                ${statusConfig.label}
                            </span>
                        </div>
                    </div>

                    <!-- Package Info -->
                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <div class="flex items-center gap-2 text-sm">
                            <i class="fas fa-file-alt text-brand-gold"></i>
                            <span class="font-medium text-brand-dark">${packageName}</span>
                        </div>
                    </div>

                    <!-- Progress Indicators -->
                    <div class="flex items-center gap-4 mb-4 text-xs">
                        ${project.mode === 'smart' ? `
                            <div class="flex items-center gap-1.5 text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                                <i class="fas fa-magic"></i>
                                <span>Smart Upload</span>
                            </div>
                        ` : ''}
                        <div class="flex items-center gap-1.5 ${hasQuestionnaire || hasDocuments ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasQuestionnaire || hasDocuments ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>Daten</span>
                        </div>
                        <div class="flex items-center gap-1.5 ${hasDocuments ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasDocuments ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>Dokumente</span>
                        </div>
                        <div class="flex items-center gap-1.5 ${hasCv ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasCv ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>CV generiert</span>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex flex-wrap gap-2">
                        ${project.cvStatus === 'new' ? `
                            <button onclick="app.sendCvQuestionnaire('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-paper-plane"></i>
                                Fragebogen senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'questionnaire_sent' ? `
                            <button onclick="app.openCvQuestionnaireView('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                Status prüfen
                            </button>
                            <button onclick="app.resendCvQuestionnaire('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-redo"></i>
                                Erneut senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'data_received' ? `
                            <button onclick="app.openCvGenerator('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-magic"></i>
                                CV generieren
                            </button>
                            <button onclick="app.viewCvData('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                Daten ansehen
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'ready' ? `
                            <button onclick="app.openCvPreview('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-eye"></i>
                                CV Vorschau
                            </button>
                            <button onclick="app.exportCvWord('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                                <i class="fas fa-file-word"></i>
                                Word
                            </button>
                            <button onclick="app.exportCvPdf('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition">
                                <i class="fas fa-file-pdf"></i>
                                PDF
                            </button>
                            <button onclick="app.sendCvToCustomer('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-envelope"></i>
                                An Kunde senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'delivered' ? `
                            <button onclick="app.openCvPreview('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                CV ansehen
                            </button>
                            <button onclick="app.exportCvWord('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                                <i class="fas fa-file-word"></i>
                                Word
                            </button>
                            <button onclick="app.exportCvPdf('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-file-pdf"></i>
                                PDF
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter CV projects
export function filterCvProjects() {
    renderCvProjects();
}

// Send questionnaire to customer
export async function sendCvQuestionnaire(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) {
        showToast('Projekt nicht gefunden');
        return;
    }

    // Show confirmation modal
    const modal = document.createElement('div');
    modal.id = 'cv-questionnaire-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-brand-gold/20 rounded-xl flex items-center justify-center">
                    <i class="fas fa-paper-plane text-brand-gold text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">Fragebogen senden</h3>
                    <p class="text-sm text-gray-500">An: ${project.customerEmail}</p>
                </div>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Der Kunde erhält eine E-Mail mit einem Link zum CV-Fragebogen.
                    Nach Ausfüllen werden Sie benachrichtigt.
                </p>
            </div>

            <div class="flex gap-3 justify-end">
                <button onclick="app.closeCvQuestionnaireModal()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Abbrechen
                </button>
                <button onclick="app.confirmSendCvQuestionnaire('${orderId}')"
                        class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Jetzt senden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Close questionnaire modal
export function closeCvQuestionnaireModal() {
    const modal = document.getElementById('cv-questionnaire-modal');
    if (modal) modal.remove();
}

// Confirm and send questionnaire
export async function confirmSendCvQuestionnaire(orderId) {
    closeCvQuestionnaireModal();

    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) return;

    showToast('Erstelle CV-Projekt...');

    try {
        // Create cvProject document if not exists
        let projectId = project.cvProjectId;
        if (!projectId) {
            const cvProjectRef = await addDoc(collection(db, 'cvProjects'), {
                orderId: orderId,
                userId: project.userId,
                customerEmail: project.customerEmail,
                customerName: project.customerName,
                status: 'questionnaire_sent',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            projectId = cvProjectRef.id;
            project.cvProjectId = projectId;
        } else {
            await updateDoc(doc(db, 'cvProjects', projectId), {
                status: 'questionnaire_sent',
                updatedAt: serverTimestamp()
            });
        }

        // Generate questionnaire link
        const questionnaireUrl = `${window.location.origin}/?questionnaire=${projectId}`;

        // Try to send email via Cloud Function (optional - may not be deployed yet)
        try {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendQuestionnaireEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    projectId: projectId,
                    customerEmail: project.customerEmail,
                    customerName: project.customerName,
                    questionnaireUrl: questionnaireUrl
                })
            });

            if (response.ok) {
                showToast('Fragebogen-Link wurde per E-Mail gesendet!');
            } else {
                // Email sending failed, but project was created - show link to copy
                showQuestionnaireLink(projectId, project.customerEmail, questionnaireUrl);
            }
        } catch (emailError) {
            // Cloud Function not available - show link to copy manually
            logger.warn('Email function not available:', emailError);
            showQuestionnaireLink(projectId, project.customerEmail, questionnaireUrl);
        }

        await loadCvProjects();

    } catch (e) {
        logger.error('Error creating CV project:', e);
        showToast('Fehler: ' + e.message);
    }
}

// Show questionnaire link modal for manual copying
function showQuestionnaireLink(projectId, customerEmail, url) {
    const modal = document.createElement('div');
    modal.id = 'questionnaire-link-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <i class="fas fa-check text-green-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">CV-Projekt erstellt</h3>
                    <p class="text-sm text-gray-500">Fragebogen-Link bereit</p>
                </div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p class="text-sm text-amber-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Die automatische E-Mail-Funktion ist noch nicht aktiviert. Bitte senden Sie den Link manuell an den Kunden.
                </p>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Kunde:</label>
                <p class="text-sm text-gray-600">${customerEmail}</p>
            </div>

            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-1">Fragebogen-Link:</label>
                <div class="flex items-center gap-2">
                    <input type="text" value="${url}" readonly
                           class="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono">
                    <button onclick="navigator.clipboard.writeText('${url}'); this.innerHTML='<i class=\\'fas fa-check\\'></i>'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i>', 2000)"
                            class="px-3 py-2 bg-brand-gold text-brand-dark rounded-lg hover:bg-yellow-500 transition">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>

            <div class="flex justify-end">
                <button onclick="document.getElementById('questionnaire-link-modal')?.remove()"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Resend questionnaire
export async function resendCvQuestionnaire(orderId) {
    await sendCvQuestionnaire(orderId);
}

// Send CV questionnaire directly from admin orders view
// Extract package type from order item title
function extractPackageType(orderItems) {
    if (!orderItems || orderItems.length === 0) return 'young-professional';

    // Find CV package in order items
    const cvItem = orderItems.find(item => {
        const title = (item.title || '').toLowerCase();
        return title.includes('cv') || title.includes('lebenslauf') || title.includes('quick-check');
    });

    if (!cvItem) return 'young-professional';

    const title = cvItem.title.toLowerCase();

    if (title.includes('executive') || title.includes('c-suite') || title.includes('c-level')) {
        return 'executive';
    } else if (title.includes('senior')) {
        return 'senior-professional';
    } else if (title.includes('quick-check') || title.includes('quickcheck')) {
        return 'quick-check';
    } else {
        return 'young-professional';
    }
}

// Get CV item title from order
function getCvItemTitle(orderItems) {
    if (!orderItems || orderItems.length === 0) return 'CV';

    const cvItem = orderItems.find(item => {
        const title = (item.title || '').toLowerCase();
        return title.includes('cv') || title.includes('lebenslauf') || title.includes('quick-check');
    });

    return cvItem?.title || 'CV';
}

export async function sendCvQuestionnaireFromOrder(orderId, customerEmail, customerName) {
    if (!orderId) {
        showToast('Fehler: Keine Bestell-ID');
        return;
    }

    // Get the order to find userId
    try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (!orderDoc.exists()) {
            showToast('Bestellung nicht gefunden');
            return;
        }

        const order = orderDoc.data();
        const userId = order.userId;
        const email = customerEmail || order.customerEmail;
        const name = customerName || order.customerName || 'Kunde';

        // Extract package type and item title from order
        const packageType = extractPackageType(order.items);
        const orderItemTitle = getCvItemTitle(order.items);

        showToast('Erstelle CV-Projekt...');

        // Create cvProject document
        const cvProjectRef = await addDoc(collection(db, 'cvProjects'), {
            orderId: orderId,
            userId: userId,
            customerEmail: email,
            customerName: name,
            packageType: packageType,
            orderItemTitle: orderItemTitle,
            status: 'questionnaire_sent',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        const projectId = cvProjectRef.id;
        const questionnaireUrl = `${window.location.origin}/?questionnaire=${projectId}`;

        // Try to send email via Cloud Function
        try {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendQuestionnaireEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    projectId: projectId,
                    customerEmail: email,
                    customerName: name,
                    questionnaireUrl: questionnaireUrl
                })
            });

            if (response.ok) {
                showToast('✅ Fragebogen wurde per E-Mail gesendet!');
            } else {
                showQuestionnaireLink(projectId, email, questionnaireUrl);
            }
        } catch (emailError) {
            logger.warn('Email function not available:', emailError);
            showQuestionnaireLink(projectId, email, questionnaireUrl);
        }

        // Refresh admin orders to show updated status
        await loadAllOrders();

    } catch (e) {
        logger.error('Error sending questionnaire:', e);
        showToast('Fehler: ' + e.message);
    }
}

// Toggle admin questionnaire view
export function toggleAdminQuestionnaireView(orderId) {
    const container = document.getElementById(`admin-cv-questionnaire-view-${orderId}`);
    const toggleIcon = document.getElementById(`admin-cv-q-toggle-${orderId}`);

    if (container && toggleIcon) {
        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            toggleIcon.classList.add('rotate-180');
        } else {
            container.classList.add('hidden');
            toggleIcon.classList.remove('rotate-180');
        }
    }
}

// Render questionnaire data for admin view (more detailed than customer view)
function renderAdminQuestionnaireData(questionnaire, documents, templateSelection) {
    if (!questionnaire && !documents && !templateSelection) return '<p class="text-gray-400 italic text-sm">Keine Daten vorhanden</p>';

    let html = '<div class="space-y-4 text-sm">';

    // Template Selection (show at top for admin)
    if (templateSelection) {
        html += `
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-300">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-palette text-amber-500"></i>Gewähltes Template & Farben
                </p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-gray-400">Template:</p>
                        <p class="font-semibold text-gray-800">${sanitizeHTML(templateSelection.templateName || templateSelection.templateId)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Farbschema:</p>
                        <div class="flex items-center gap-3">
                            <span class="inline-flex items-center gap-1">
                                <span class="w-6 h-6 rounded border-2 border-gray-300 shadow" style="background-color: ${templateSelection.customization?.primaryColor || '#1a3a5c'}"></span>
                                <span class="text-xs text-gray-500">Haupt</span>
                            </span>
                            <span class="inline-flex items-center gap-1">
                                <span class="w-6 h-6 rounded border-2 border-gray-300 shadow" style="background-color: ${templateSelection.customization?.accentColor || '#d4912a'}"></span>
                                <span class="text-xs text-gray-500">Akzent</span>
                            </span>
                        </div>
                    </div>
                </div>
                ${templateSelection.customization ? `
                    <div class="mt-2 pt-2 border-t border-amber-200 text-xs text-gray-500">
                        <span class="font-mono">Primary: ${templateSelection.customization.primaryColor}</span> |
                        <span class="font-mono">Accent: ${templateSelection.customization.accentColor}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Personal Info
    if (questionnaire?.personal) {
        const p = questionnaire.personal;
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-user text-indigo-500"></i>Persönliche Daten
                </p>
                <div class="grid grid-cols-2 gap-2 text-gray-600">
                    ${p.fullName ? `<p><span class="text-gray-400 text-xs">Name:</span><br><strong>${sanitizeHTML(p.fullName)}</strong></p>` : ''}
                    ${p.email ? `<p><span class="text-gray-400 text-xs">E-Mail:</span><br><strong>${sanitizeHTML(p.email)}</strong></p>` : ''}
                    ${p.phone ? `<p><span class="text-gray-400 text-xs">Telefon:</span><br><strong>${sanitizeHTML(p.phone)}</strong></p>` : ''}
                    ${p.location ? `<p><span class="text-gray-400 text-xs">Ort:</span><br><strong>${sanitizeHTML(p.location)}</strong></p>` : ''}
                    ${p.birthDate ? `<p><span class="text-gray-400 text-xs">Geburtsdatum:</span><br><strong>${sanitizeHTML(p.birthDate)}</strong></p>` : ''}
                    ${p.nationality ? `<p><span class="text-gray-400 text-xs">Nationalität:</span><br><strong>${sanitizeHTML(p.nationality)}</strong></p>` : ''}
                    ${p.targetRole ? `<p class="col-span-2"><span class="text-gray-400 text-xs">Zielposition:</span><br><strong>${sanitizeHTML(p.targetRole)}</strong></p>` : ''}
                    ${p.linkedin ? `<p class="col-span-2"><span class="text-gray-400 text-xs">LinkedIn:</span><br><a href="${sanitizeHTML(p.linkedin)}" target="_blank" class="text-indigo-600 underline">${sanitizeHTML(p.linkedin)}</a></p>` : ''}
                </div>
            </div>
        `;
    }

    // Summary
    if (questionnaire?.summary) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-quote-left text-indigo-500"></i>Zusammenfassung / Profil
                </p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.summary)}</p>
            </div>
        `;
    }

    // Experience
    if (questionnaire.experience?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-briefcase text-indigo-500"></i>Berufserfahrung (${questionnaire.experience.length})
                </p>
                <div class="space-y-3">
                    ${questionnaire.experience.map((exp, idx) => `
                        <div class="border-l-3 border-indigo-300 pl-3 ${idx > 0 ? 'pt-3 border-t border-gray-100' : ''}">
                            <p class="font-semibold text-gray-800">${sanitizeHTML(exp.role || exp.title || 'Position')}</p>
                            <p class="text-indigo-600">${sanitizeHTML(exp.company || '')}</p>
                            <p class="text-xs text-gray-400">${exp.startDate || ''} ${exp.endDate ? '- ' + exp.endDate : exp.current ? '- Heute' : ''}</p>
                            ${exp.achievements ? `<p class="text-gray-600 mt-1 text-xs whitespace-pre-line">${sanitizeHTML(Array.isArray(exp.achievements) ? exp.achievements.join('\\n• ') : exp.achievements)}</p>` : ''}
                            ${exp.description ? `<p class="text-gray-600 mt-1 text-xs">${sanitizeHTML(exp.description)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Education
    if (questionnaire.education?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-graduation-cap text-indigo-500"></i>Ausbildung (${questionnaire.education.length})
                </p>
                <div class="space-y-3">
                    ${questionnaire.education.map((edu, idx) => `
                        <div class="border-l-3 border-indigo-300 pl-3 ${idx > 0 ? 'pt-3 border-t border-gray-100' : ''}">
                            <p class="font-semibold text-gray-800">${sanitizeHTML(edu.degree || edu.title || 'Abschluss')}</p>
                            <p class="text-indigo-600">${sanitizeHTML(edu.institution || edu.school || '')}</p>
                            <p class="text-xs text-gray-400">${edu.startDate || ''} ${edu.endDate ? '- ' + edu.endDate : ''}</p>
                            ${edu.field ? `<p class="text-gray-600 text-xs">Fachrichtung: ${sanitizeHTML(edu.field)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Skills
    if (questionnaire?.skills) {
        const skills = questionnaire.skills;
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-tools text-indigo-500"></i>Fähigkeiten
                </p>
                <div class="space-y-2">
                    ${skills.technical?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Technische Skills:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.technical.map(s => `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${skills.soft?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Soft Skills:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.soft.map(s => `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${skills.languages?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Sprachen:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.languages.map(l => `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(typeof l === 'string' ? l : l.language + (l.level ? ' (' + l.level + ')' : ''))}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Certificates
    if (questionnaire?.certificates?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-certificate text-indigo-500"></i>Zertifikate (${questionnaire.certificates.length})
                </p>
                <div class="space-y-1">
                    ${questionnaire.certificates.map(cert => `
                        <p class="text-gray-600">• ${sanitizeHTML(typeof cert === 'string' ? cert : cert.name + (cert.issuer ? ' (' + cert.issuer + ')' : ''))}</p>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Additional Notes
    if (questionnaire?.additional?.notes) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-sticky-note text-indigo-500"></i>Zusätzliche Hinweise
                </p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.additional.notes)}</p>
            </div>
        `;
    }

    // Uploaded Documents
    if (documents) {
        let docsHtml = '';

        // Existing CV
        if (documents.existingCv?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-file-pdf text-red-500"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${sanitizeHTML(documents.existingCv.filename || 'Bestehender Lebenslauf')}</p>
                            <p class="text-xs text-gray-400">Original CV des Kunden</p>
                        </div>
                    </div>
                    <a href="${documents.existingCv.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <i class="fas fa-download mr-1"></i>Herunterladen
                    </a>
                </div>
            `;
        }

        // Target Job / Stellenanzeige
        if (documents.targetJob?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-briefcase text-blue-500"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${sanitizeHTML(documents.targetJob.filename || 'Stellenanzeige')}</p>
                            <p class="text-xs text-gray-400">Ziel-Stellenanzeige</p>
                        </div>
                    </div>
                    <a href="${documents.targetJob.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <i class="fas fa-download mr-1"></i>Herunterladen
                    </a>
                </div>
            `;
        }

        // Other Documents
        if (documents.otherDocuments?.length > 0) {
            documents.otherDocuments.forEach((doc, idx) => {
                if (doc.url) {
                    docsHtml += `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-file text-gray-500"></i>
                                </div>
                                <div>
                                    <p class="font-medium text-gray-800">${sanitizeHTML(doc.filename || `Dokument ${idx + 1}`)}</p>
                                    <p class="text-xs text-gray-400">Zusätzliches Dokument</p>
                                </div>
                            </div>
                            <a href="${doc.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                                <i class="fas fa-download mr-1"></i>Herunterladen
                            </a>
                        </div>
                    `;
                }
            });
        }

        if (docsHtml) {
            html += `
                <div class="bg-white rounded-lg p-3 border border-gray-200">
                    <p class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <i class="fas fa-folder-open text-indigo-500"></i>Hochgeladene Dokumente
                    </p>
                    <div class="space-y-2">
                        ${docsHtml}
                    </div>
                </div>
            `;
        }
    }

    html += '</div>';
    return html;
}

// Open CV questionnaire view (to check status)
export function openCvQuestionnaireView(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) return;

    // Create questionnaire link
    const questionnaireUrl = `${window.location.origin}?questionnaire=${project.cvProjectId || orderId}`;

    const modal = document.createElement('div');
    modal.id = 'cv-status-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-brand-dark">Fragebogen-Status</h3>
                <button onclick="document.getElementById('cv-status-modal')?.remove()"
                        class="text-gray-400 hover:text-gray-600 transition">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div class="flex items-center gap-2 text-yellow-800 mb-2">
                        <i class="fas fa-clock"></i>
                        <span class="font-medium">Warte auf Kundenantwort</span>
                    </div>
                    <p class="text-sm text-yellow-700">
                        Der Fragebogen wurde an <strong>${project.customerEmail}</strong> gesendet.
                    </p>
                </div>

                <div class="bg-gray-50 rounded-xl p-4">
                    <p class="text-xs text-gray-500 mb-2">Fragebogen-Link:</p>
                    <div class="flex items-center gap-2">
                        <input type="text" value="${questionnaireUrl}" readonly
                               class="flex-1 text-xs bg-white border border-gray-200 rounded px-3 py-2">
                        <button onclick="navigator.clipboard.writeText('${questionnaireUrl}'); app.showToast('Link kopiert!')"
                                class="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition">
                            <i class="fas fa-copy text-gray-600"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex justify-end mt-6">
                <button onclick="document.getElementById('cv-status-modal')?.remove()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// View CV data collected from questionnaire
export async function viewCvData(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Keine Daten verfügbar');
        return;
    }

    try {
        // Load latest project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists()) {
            showToast('Projekt nicht gefunden');
            return;
        }

        const data = projectDoc.data();
        const q = data.questionnaire || {};
        const docs = data.documents || {};

        const modal = document.createElement('div');
        modal.id = 'cv-data-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl my-4">
                <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                    <h3 class="text-xl font-medium text-brand-dark">Gesammelte Daten</h3>
                    <button onclick="document.getElementById('cv-data-modal')?.remove()"
                            class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Upload Mode Badge -->
                    ${data.mode === 'smart' ? `
                    <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-magic text-purple-600"></i>
                        </div>
                        <div>
                            <p class="font-medium text-purple-800">Smart Upload</p>
                            <p class="text-sm text-purple-600">Der Kunde hat seine Dokumente per Smart Upload hochgeladen</p>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Personal Data -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-user mr-2 text-brand-gold"></i>Persönliche Daten</h4>
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div><span class="text-gray-500">Name:</span> <span class="font-medium">${q.personal?.fullName || '-'}</span></div>
                            <div><span class="text-gray-500">E-Mail:</span> <span class="font-medium">${q.personal?.email || '-'}</span></div>
                            <div><span class="text-gray-500">Telefon:</span> <span class="font-medium">${q.personal?.phone || '-'}</span></div>
                            <div><span class="text-gray-500">Standort:</span> <span class="font-medium">${q.personal?.location || '-'}</span></div>
                            <div><span class="text-gray-500">Zielposition:</span> <span class="font-medium">${q.personal?.targetRole || '-'}</span></div>
                            <div><span class="text-gray-500">LinkedIn:</span> <span class="font-medium">${q.personal?.linkedin || '-'}</span></div>
                        </div>
                        ${q.personal?.careerGoal ? `<p class="mt-3 text-sm"><span class="text-gray-500">Karriereziel:</span> ${q.personal.careerGoal}</p>` : ''}
                    </div>

                    <!-- Experience -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-briefcase mr-2 text-brand-gold"></i>Berufserfahrung</h4>
                        ${(q.experience || []).length > 0 ? q.experience.map(exp => `
                            <div class="border-l-2 border-brand-gold pl-3 mb-3">
                                <p class="font-medium">${exp.role || 'Position'} <span class="text-gray-400">@</span> ${exp.company || 'Firma'}</p>
                                <p class="text-sm text-gray-500">${exp.startDate || ''} - ${exp.endDate || 'heute'}</p>
                                ${exp.description ? `<p class="text-sm mt-1">${exp.description}</p>` : ''}
                                ${(exp.achievements || []).length > 0 ? `<ul class="text-sm mt-2 space-y-1">${exp.achievements.map(a => `<li class="text-green-700">✓ ${a}</li>`).join('')}</ul>` : ''}
                            </div>
                        `).join('') : '<p class="text-gray-400 text-sm">Keine Berufserfahrung angegeben</p>'}
                    </div>

                    <!-- Education -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-graduation-cap mr-2 text-brand-gold"></i>Ausbildung</h4>
                        ${(q.education || []).length > 0 ? q.education.map(edu => `
                            <div class="border-l-2 border-brand-gold pl-3 mb-3">
                                <p class="font-medium">${edu.degree || 'Abschluss'} - ${edu.field || ''}</p>
                                <p class="text-sm text-gray-500">${edu.institution || ''} | ${edu.startDate || ''} - ${edu.endDate || ''}</p>
                            </div>
                        `).join('') : '<p class="text-gray-400 text-sm">Keine Ausbildung angegeben</p>'}
                    </div>

                    <!-- Skills -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-cogs mr-2 text-brand-gold"></i>Skills</h4>
                        <div class="space-y-2 text-sm">
                            <div><span class="text-gray-500">Technisch:</span> ${(q.skills?.technical || []).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Soft Skills:</span> ${(q.skills?.soft || []).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Sprachen:</span> ${(q.skills?.languages || []).map(l => `${l.language} (${l.level})`).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Zertifikate:</span> ${(q.skills?.certifications || []).join(', ') || '-'}</div>
                        </div>
                    </div>

                    <!-- Documents -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-file-alt mr-2 text-brand-gold"></i>Hochgeladene Dokumente</h4>
                        <div class="space-y-2">
                            ${docs.existingCv ? `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-file-pdf text-red-500 mr-2"></i>Aktueller Lebenslauf: ${docs.existingCv.filename || 'CV'}</span>
                                    <a href="${docs.existingCv.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            ` : ''}
                            ${docs.targetJob ? `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-briefcase text-blue-500 mr-2"></i>Stellenausschreibung: ${docs.targetJob.filename || 'Stellenbeschreibung'}</span>
                                    <a href="${docs.targetJob.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            ` : ''}
                            ${(docs.otherDocuments || []).length > 0 ? docs.otherDocuments.map((doc, i) => `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-file text-gray-500 mr-2"></i>Weiteres Dokument: ${doc.filename || 'Dokument ' + (i + 1)}</span>
                                    <a href="${doc.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            `).join('') : ''}
                            ${!docs.existingCv && !docs.targetJob && (!docs.otherDocuments || docs.otherDocuments.length === 0) ? '<p class="text-gray-400 text-sm">Keine Dokumente hochgeladen</p>' : ''}
                        </div>
                    </div>

                    <!-- Notes (Smart Upload) -->
                    ${q.additional?.notes ? `
                    <div class="bg-amber-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-sticky-note mr-2 text-brand-gold"></i>Besondere Hinweise</h4>
                        <p class="text-sm text-gray-700">${q.additional.notes}</p>
                    </div>
                    ` : ''}
                </div>

                <div class="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
                    <button onclick="document.getElementById('cv-data-modal')?.remove()"
                            class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                        Schließen
                    </button>
                    <button onclick="document.getElementById('cv-data-modal')?.remove(); app.openCvGenerator('${orderId}')"
                            class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        <i class="fas fa-magic mr-2"></i>CV generieren
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (e) {
        logger.error('Error loading CV data:', e);
        showToast('Fehler beim Laden der Daten');
    }
}

// Scale CV template previews to fit their containers
function scaleCvPreviews() {
    const previewBoxes = document.querySelectorAll('.cv-preview-box');
    previewBoxes.forEach(box => {
        const scaled = box.querySelector('.cv-preview-scaled');
        if (scaled) {
            const containerWidth = box.offsetWidth;
            const scale = containerWidth / 210;
            scaled.style.transform = `scale(${scale})`;
        }
    });
}

// Also scale on window resize
window.addEventListener('resize', () => {
    if (document.querySelector('.cv-preview-box')) {
        scaleCvPreviews();
    }
});

// CV Generator State
let cvGeneratorState = {
    step: 1,
    projectId: null,
    orderId: null,
    customerName: '',
    // Step 1: Design
    template: 'corporate',
    colorScheme: 'classic',
    layout: 'two-column',
    includeCover: false,
    includePhoto: false,
    // Step 2: Options
    language: 'Deutsch',
    focusAreas: [],
    tone: 'professional'
};

// Open CV generator (two-step wizard)
export async function openCvGenerator(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    // Reset state - use first Canva template as default
    cvGeneratorState = {
        step: 1,
        projectId: project.cvProjectId,
        orderId: orderId,
        customerName: project.customerName,
        template: 'elegant-navy',  // Default to first Canva template
        colorScheme: 'elegant-navy',
        layout: 'sidebar',
        includeCover: false,
        includePhoto: false,
        language: 'Deutsch',
        focusAreas: [],
        tone: 'professional'
    };

    const modal = document.createElement('div');
    modal.id = 'cv-generator-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-8 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-4xl w-full shadow-2xl mb-8 flex flex-col" style="max-height: calc(100vh - 4rem);">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-brand-gold to-yellow-600 rounded-xl flex items-center justify-center">
                        <i class="fas fa-magic text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-medium text-brand-dark">CV Generator</h3>
                        <p class="text-sm text-gray-500">${project.customerName}</p>
                    </div>
                </div>
                <button onclick="document.getElementById('cv-generator-modal')?.remove()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <!-- Progress Steps -->
            <div class="px-6 py-4 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center justify-center gap-4">
                    <div class="flex items-center gap-2" id="step-indicator-1">
                        <div class="w-8 h-8 rounded-full bg-brand-gold text-white flex items-center justify-center font-bold text-sm">1</div>
                        <span class="text-sm font-medium text-brand-dark">Design wählen</span>
                    </div>
                    <div class="w-16 h-0.5 bg-gray-300" id="step-line"></div>
                    <div class="flex items-center gap-2" id="step-indicator-2">
                        <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">2</div>
                        <span class="text-sm font-medium text-gray-500">Inhalt generieren</span>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div id="cv-generator-content" class="p-6 overflow-y-auto flex-1">
                ${renderCvGeneratorStep1()}
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
                <button onclick="app.cvGeneratorBack()" id="cv-gen-back-btn" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition hidden">
                    <i class="fas fa-arrow-left mr-2"></i>Zurück
                </button>
                <div class="flex-1"></div>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('cv-generator-modal')?.remove()" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition" id="cv-gen-cancel-btn">
                        Abbrechen
                    </button>
                    <button onclick="app.cvGeneratorNext()" id="cv-gen-next-btn" class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        Weiter <i class="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Initialize handlers
    initCvGeneratorHandlers();

    // Scale previews after modal is rendered
    setTimeout(() => scaleCvPreviews(), 100);
}

// Custom PDF templates loaded from cv-templates folder
let customPdfTemplates = [];

// Load custom templates from JSON file
async function loadCustomTemplates() {
    try {
        const response = await fetch('/cv-templates/templates.json');
        if (response.ok) {
            customPdfTemplates = await response.json();
            console.log('Loaded custom templates:', customPdfTemplates);
        }
    } catch (error) {
        console.log('No custom templates found:', error);
    }
}

// Initialize custom templates on page load
loadCustomTemplates();

// Get all templates (custom PDF templates + built-in HTML templates)
function getAllCvTemplates() {
    // Custom templates first, then built-in templates
    const customWithPreview = customPdfTemplates.map(t => ({
        ...t,
        isCustomPdf: true,
        preview: `<img src="${t.previewImage}" alt="${t.name}" class="w-full h-full object-cover object-top" />`
    }));
    return [...customWithPreview, ...canvaTemplates];
}

// Canva-style CV Template definitions with visual previews
const canvaTemplates = [
    {
        id: 'schwarz-beige-modern',
        name: 'Schwarz Beige Modern',
        category: 'Executive',
        colors: { primary: '#3d3d3d', secondary: '#c9a227', accent: '#f5f5f5', text: '#333333' },
        layout: 'two-column',
        description: 'Elegantes Design mit dunklem Header und Beige-Akzenten',
        tags: ['Executive', 'Senior', 'Klassisch', 'Canva'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col text-[8px]">
                <div class="bg-[#3d3d3d] text-white flex" style="height: 85px;">
                    <div class="w-[65px] bg-[#2d2d2d] flex-shrink-0"></div>
                    <div class="flex-1 flex flex-col justify-center px-3">
                        <div class="h-[14px] bg-white rounded w-3/4 mb-1"></div>
                        <div class="h-[10px] bg-white/60 rounded w-1/2"></div>
                    </div>
                </div>
                <div class="h-[14px] bg-white flex items-center px-3 gap-4 text-[6px] text-gray-600">
                    <span>📞 0221-123456</span>
                    <span>✉ email@test.de</span>
                </div>
                <div class="flex-1 flex">
                    <div class="w-[65px] bg-[#f5f0e8] p-3">
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-full mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                            <div class="h-[4px] bg-gray-400 rounded w-4/5"></div>
                        </div>
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                        </div>
                    </div>
                    <div class="flex-1 bg-white p-3">
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-300 rounded"></div>
                            <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                        </div>
                        <div class="h-[6px] bg-gray-500 rounded w-1/3 mb-1"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'green-yellow-modern',
        name: 'Green Yellow Modern',
        category: 'Young Professional',
        colors: { primary: '#2d8a8a', secondary: '#f5c842', accent: '#ffffff', text: '#333333' },
        layout: 'two-column',
        description: 'Kreatives Design mit Teal und Gelb-Akzenten',
        tags: ['Young Professional', 'Kreativ', 'Modern', 'Canva'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white text-[8px]">
                <div class="h-[4px] bg-[#f5c842]"></div>
                <div class="p-4 flex gap-3">
                    <div class="w-[50px] h-[65px] rounded bg-gray-300 flex-shrink-0"></div>
                    <div class="flex-1 pt-2">
                        <div class="h-[12px] bg-[#f5c842] rounded w-3/4 mb-2"></div>
                        <div class="h-[8px] bg-[#2d8a8a] rounded w-1/2"></div>
                    </div>
                </div>
                <div class="flex-1 px-4 flex gap-4">
                    <div class="w-2/5">
                        <div class="h-[8px] bg-[#f5c842] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-[#2d8a8a]/60 rounded"></div>
                            <div class="h-[4px] bg-[#2d8a8a]/60 rounded w-4/5"></div>
                        </div>
                    </div>
                    <div class="w-3/5">
                        <div class="h-[8px] bg-[#f5c842] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-300 rounded"></div>
                            <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'elegant-navy',
        name: 'Elegant Navy',
        category: 'Executive',
        colors: { primary: '#1e3a5f', secondary: '#c9a227', accent: '#f5f5f5', text: '#333333' },
        layout: 'sidebar',
        description: 'Zeitloses Design mit Navy-Seitenleiste',
        tags: ['C-Suite', 'Führungskraft', 'Klassisch'],
        preview: `
            <div class="w-[210px] h-[297px] flex text-[8px]">
                <div class="w-[70px] bg-[#1e3a5f] text-white p-4">
                    <div class="w-[40px] h-[40px] rounded-full bg-gray-300 mx-auto mb-3"></div>
                    <div class="h-[8px] bg-white/80 rounded mb-2"></div>
                    <div class="h-[6px] bg-white/40 rounded w-3/4 mx-auto mb-4"></div>
                    <div class="h-[6px] bg-[#c9a227] rounded w-full mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-white/30 rounded"></div>
                        <div class="h-[4px] bg-white/30 rounded w-4/5"></div>
                    </div>
                </div>
                <div class="flex-1 bg-white p-4">
                    <div class="h-[8px] bg-[#1e3a5f] rounded w-1/2 mb-3"></div>
                    <div class="space-y-1 mb-4">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                    <div class="h-[6px] bg-[#c9a227] rounded w-1/3 mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-200 rounded"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'modern-minimal',
        name: 'Modern Minimal',
        category: 'Young Professional',
        colors: { primary: '#000000', secondary: '#666666', accent: '#ffffff', text: '#333333' },
        layout: 'single-column',
        description: 'Sauberes, minimalistisches Design',
        tags: ['Modern', 'Tech', 'Startup'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white p-6 text-[8px]">
                <div class="text-center mb-4">
                    <div class="h-[12px] bg-black rounded w-1/2 mx-auto mb-2"></div>
                    <div class="h-[8px] bg-gray-400 rounded w-1/3 mx-auto"></div>
                </div>
                <div class="border-t border-b border-gray-200 py-2 mb-4">
                    <div class="flex justify-center gap-4">
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                    </div>
                </div>
                <div class="h-[8px] bg-black rounded w-1/4 mb-2"></div>
                <div class="space-y-1 mb-4">
                    <div class="h-[4px] bg-gray-200 rounded"></div>
                    <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                </div>
                <div class="h-[8px] bg-black rounded w-1/4 mb-2"></div>
                <div class="space-y-1">
                    <div class="h-[4px] bg-gray-200 rounded"></div>
                    <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                </div>
            </div>
        `
    },
    {
        id: 'creative-bold',
        name: 'Creative Bold',
        category: 'Creative',
        colors: { primary: '#e63946', secondary: '#1d3557', accent: '#f1faee', text: '#1d3557' },
        layout: 'two-column',
        description: 'Auffälliges Design für Kreative',
        tags: ['Design', 'Marketing', 'Kreativ'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#f1faee] text-[8px]">
                <div class="bg-[#e63946] p-4 mb-4">
                    <div class="h-[12px] bg-white rounded w-1/2 mb-2"></div>
                    <div class="h-[8px] bg-white/70 rounded w-1/3"></div>
                </div>
                <div class="px-4 flex gap-4">
                    <div class="w-1/2">
                        <div class="h-[8px] bg-[#1d3557] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                            <div class="h-[4px] bg-gray-400 rounded w-4/5"></div>
                        </div>
                    </div>
                    <div class="w-1/2">
                        <div class="h-[8px] bg-[#e63946] rounded w-2/3 mb-2"></div>
                        <div class="flex gap-1 flex-wrap">
                            <div class="h-[10px] w-[25px] bg-[#1d3557]/20 rounded"></div>
                            <div class="h-[10px] w-[30px] bg-[#1d3557]/20 rounded"></div>
                            <div class="h-[10px] w-[20px] bg-[#1d3557]/20 rounded"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'corporate-classic',
        name: 'Corporate Classic',
        category: 'Senior Professional',
        colors: { primary: '#2c3e50', secondary: '#3498db', accent: '#ecf0f1', text: '#2c3e50' },
        layout: 'single-column',
        description: 'Professionell für Konzernumfeld',
        tags: ['Konzern', 'Finance', 'Consulting'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white text-[8px]">
                <div class="bg-[#2c3e50] p-4">
                    <div class="h-[12px] bg-white rounded w-2/3 mb-2"></div>
                    <div class="h-[4px] bg-[#3498db] rounded w-1/2"></div>
                </div>
                <div class="p-4">
                    <div class="flex gap-3 mb-3 text-gray-400 text-[7px]">
                        <span>✉ email</span>
                        <span>📱 phone</span>
                        <span>📍 location</span>
                    </div>
                    <div class="h-[8px] bg-[#2c3e50] rounded w-1/3 mb-2"></div>
                    <div class="h-[3px] bg-[#3498db] rounded w-full mb-3"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-200 rounded"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'executive-gold',
        name: 'Executive Gold',
        category: 'C-Suite',
        colors: { primary: '#1a1a2e', secondary: '#c9b99a', accent: '#f8f6f3', text: '#1a1a2e' },
        layout: 'sidebar',
        description: 'Premium-Design für Top-Manager',
        tags: ['CEO', 'Vorstand', 'Executive'],
        preview: `
            <div class="w-[210px] h-[297px] flex text-[8px]">
                <div class="w-[70px] bg-[#1a1a2e] text-white p-4">
                    <div class="w-[40px] h-[40px] rounded-full bg-[#c9b99a] mx-auto mb-3"></div>
                    <div class="h-[4px] bg-[#c9b99a] rounded mb-3"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-white/40 rounded"></div>
                        <div class="h-[4px] bg-white/40 rounded w-4/5"></div>
                    </div>
                    <div class="mt-4 h-[4px] bg-[#c9b99a] rounded mb-2"></div>
                    <div class="flex gap-1 flex-wrap">
                        <div class="h-[8px] w-[20px] bg-white/20 rounded"></div>
                        <div class="h-[8px] w-[25px] bg-white/20 rounded"></div>
                    </div>
                </div>
                <div class="flex-1 bg-[#f8f6f3] p-4">
                    <div class="h-[12px] bg-[#1a1a2e] rounded w-2/3 mb-2"></div>
                    <div class="h-[4px] bg-[#c9b99a] rounded w-1/2 mb-4"></div>
                    <div class="h-[8px] bg-[#1a1a2e] rounded w-1/3 mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'tech-modern',
        name: 'Tech Modern',
        category: 'Tech & IT',
        colors: { primary: '#6366f1', secondary: '#818cf8', accent: '#f8fafc', text: '#1e293b' },
        layout: 'two-column',
        description: 'Modern für Tech-Industrie',
        tags: ['IT', 'Software', 'Developer'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#f8fafc] text-[8px]">
                <div class="p-4">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-[40px] h-[40px] rounded-lg bg-gradient-to-br from-[#6366f1] to-[#818cf8]"></div>
                        <div>
                            <div class="h-[10px] bg-[#1e293b] rounded w-[80px] mb-1"></div>
                            <div class="h-[6px] bg-[#6366f1] rounded w-[50px]"></div>
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <div class="w-1/2">
                            <div class="h-[8px] bg-[#6366f1] rounded w-2/3 mb-2"></div>
                            <div class="space-y-1">
                                <div class="h-[4px] bg-gray-300 rounded"></div>
                                <div class="h-[4px] bg-gray-300 rounded w-4/5"></div>
                            </div>
                        </div>
                        <div class="w-1/2">
                            <div class="h-[8px] bg-[#818cf8] rounded w-2/3 mb-2"></div>
                            <div class="flex gap-1 flex-wrap">
                                <div class="h-[10px] px-2 bg-[#6366f1]/20 rounded text-[6px] flex items-center">React</div>
                                <div class="h-[10px] px-2 bg-[#6366f1]/20 rounded text-[6px] flex items-center">Node</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'elegant-burgundy',
        name: 'Elegant Burgundy',
        category: 'Senior Professional',
        colors: { primary: '#722f37', secondary: '#d4a574', accent: '#faf7f5', text: '#3d2c2e' },
        layout: 'single-column',
        description: 'Elegantes Weinrot für Führungskräfte',
        tags: ['Luxury', 'Fashion', 'Hospitality'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#faf7f5] text-[8px]">
                <div class="border-b-2 border-[#722f37] p-4 text-center">
                    <div class="h-[12px] bg-[#722f37] rounded w-1/2 mx-auto mb-2"></div>
                    <div class="h-[6px] bg-[#d4a574] rounded w-1/3 mx-auto"></div>
                </div>
                <div class="p-4">
                    <div class="flex justify-center gap-3 mb-4 text-[#722f37] text-[7px]">
                        <span>✉ email</span><span>📱 phone</span><span>🔗 link</span>
                    </div>
                    <div class="h-[8px] bg-[#722f37] rounded w-1/4 mb-2"></div>
                    <div class="border-l-2 border-[#d4a574] pl-2 space-y-1">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'swiss-clean',
        name: 'Swiss Clean',
        category: 'Universal',
        colors: { primary: '#333333', secondary: '#e74c3c', accent: '#ffffff', text: '#333333' },
        layout: 'two-column',
        description: 'Swiss Design - Klarheit & Präzision',
        tags: ['Design', 'Architecture', 'Engineering'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white p-4 text-[8px]">
                <div class="flex gap-4 flex-1">
                    <div class="w-1/3">
                        <div class="h-[12px] bg-[#333333] rounded mb-2"></div>
                        <div class="h-[4px] bg-[#e74c3c] rounded w-2/3 mb-3"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                        </div>
                    </div>
                    <div class="w-2/3 border-l border-gray-200 pl-4">
                        <div class="h-[8px] bg-[#333333] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                        </div>
                        <div class="h-[8px] bg-[#e74c3c] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
];

// Render Step 1: Design Selection with Canva-style previews
function renderCvGeneratorStep1() {
    const allTemplates = getAllCvTemplates();
    const categories = ['Alle', 'Executive', 'Senior Professional', 'Young Professional', 'Creative', 'Tech & IT', 'Professional'];

    return `
        <!-- Category Filter -->
        <div class="mb-6">
            <div class="flex flex-wrap gap-2 justify-center">
                ${categories.map(cat => `
                    <button onclick="window.filterCvTemplates('${cat}')" data-category="${cat}"
                            class="category-btn px-4 py-2 rounded-full text-sm font-medium transition
                                   ${cat === 'Alle' ? 'bg-brand-gold text-brand-dark' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Template Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" id="cv-template-grid">
            ${allTemplates.map(t => `
                <div class="template-card cursor-pointer group" data-template="${t.id}" data-category="${t.category}"
                     onclick="window.selectCvTemplate('${t.id}')">
                    <div class="relative border-2 ${cvGeneratorState.template === t.id ? 'border-brand-gold ring-2 ring-brand-gold/20' : 'border-gray-200'}
                                rounded-xl overflow-hidden transition-all hover:border-brand-gold hover:shadow-lg">
                        <!-- Preview -->
                        <div class="aspect-[210/297] bg-gray-50 relative overflow-hidden">
                            ${t.isCustomPdf ? `
                                <img src="${t.previewImage}" alt="${t.name}" class="w-full h-full object-cover object-top" />
                            ` : `
                                <div style="position: absolute; top: 0; left: 0; width: 210px; height: 297px; transform-origin: top left; transform: scale(0.76);">
                                    ${t.preview}
                                </div>
                            `}
                            <!-- Hover overlay -->
                            <div class="absolute inset-0 bg-brand-gold/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span class="text-brand-dark font-medium text-sm">Auswählen</span>
                            </div>
                            <!-- Selected checkmark -->
                            ${cvGeneratorState.template === t.id ? `
                                <div class="absolute top-2 right-2 w-6 h-6 bg-brand-gold rounded-full flex items-center justify-center z-10">
                                    <i class="fas fa-check text-brand-dark text-xs"></i>
                                </div>
                            ` : ''}
                        </div>
                        <!-- Info -->
                        <div class="p-3 bg-white">
                            <p class="font-medium text-brand-dark text-sm truncate">${t.name}</p>
                            <p class="text-xs text-gray-500">${t.category}</p>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Selected Template Details -->
        <div id="selected-template-info" class="bg-gradient-to-br from-brand-gold/10 to-yellow-50 rounded-xl p-4 mb-6">
            ${renderSelectedTemplateInfo()}
        </div>

        <!-- Additional Options -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-50 rounded-xl p-4">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="cv-include-cover" ${cvGeneratorState.includeCover ? 'checked' : ''}
                           onchange="window.selectCvDesign('includeCover', this.checked)"
                           class="w-5 h-5 text-brand-gold rounded border-gray-300 focus:ring-brand-gold">
                    <div>
                        <p class="font-medium text-brand-dark">Anschreiben generieren</p>
                        <p class="text-xs text-gray-500">Passendes Cover Letter zur Bewerbung</p>
                    </div>
                </label>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="cv-include-photo" ${cvGeneratorState.includePhoto ? 'checked' : ''}
                           onchange="window.selectCvDesign('includePhoto', this.checked)"
                           class="w-5 h-5 text-brand-gold rounded border-gray-300 focus:ring-brand-gold">
                    <div>
                        <p class="font-medium text-brand-dark">Foto-Platzhalter</p>
                        <p class="text-xs text-gray-500">Bereich für Profilbild reservieren</p>
                    </div>
                </label>
            </div>
        </div>
    `;
}

// Render selected template info panel
function renderSelectedTemplateInfo() {
    const allTemplates = getAllCvTemplates();
    const selected = allTemplates.find(t => t.id === cvGeneratorState.template) || allTemplates[0];

    // Handle preview differently for custom PDF templates vs built-in templates
    const previewHtml = selected.isCustomPdf
        ? `<img src="${selected.previewImage}" alt="${selected.name}" class="w-full h-full object-cover object-top" />`
        : selected.preview;

    return `
        <div class="flex items-start gap-4">
            <div class="w-20 h-28 rounded-lg overflow-hidden border-2 border-brand-gold flex-shrink-0">
                ${previewHtml}
            </div>
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <h4 class="text-lg font-medium text-brand-dark">${selected.name}</h4>
                    <span class="px-2 py-0.5 bg-brand-gold/20 text-brand-dark text-xs rounded-full">${selected.category}</span>
                </div>
                <p class="text-sm text-gray-600 mb-2">${selected.description}</p>
                ${selected.layout ? `
                <div class="flex items-center gap-4 text-xs text-gray-500">
                    <span><i class="fas fa-palette mr-1"></i>Layout: ${selected.layout === 'sidebar' ? 'Seitenleiste' : selected.layout === 'two-column' ? 'Zwei Spalten' : 'Eine Spalte'}</span>
                    ${selected.colors ? `
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-3 rounded-full" style="background-color: ${selected.colors.primary}"></span>
                        <span class="w-3 h-3 rounded-full" style="background-color: ${selected.colors.secondary}"></span>
                    </span>
                    ` : ''}
                </div>
                ` : ''}
                <div class="flex flex-wrap gap-1 mt-2">
                    ${(selected.tags || []).map(tag => `<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

// Render Step 2: Content Options & Generation
function renderCvGeneratorStep2() {
    return `
        <!-- Language -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-language mr-2 text-brand-gold"></i>
                Sprache
            </h4>
            <div class="grid grid-cols-2 gap-4">
                ${['Deutsch', 'Englisch'].map(lang => `
                    <button onclick="window.selectCvDesign('language', '${lang}')" data-design="lang-${lang}"
                            class="design-option p-4 border-2 ${cvGeneratorState.language === lang ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'} rounded-xl hover:border-brand-gold transition text-center">
                        <i class="fas fa-flag text-2xl ${cvGeneratorState.language === lang ? 'text-brand-gold' : 'text-gray-400'} mb-2"></i>
                        <p class="font-medium text-brand-dark">${lang}</p>
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Tone -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-comment-alt mr-2 text-brand-gold"></i>
                Tonalität
            </h4>
            <div class="grid grid-cols-3 gap-4">
                ${[
                    { id: 'professional', name: 'Professionell', desc: 'Sachlich & seriös' },
                    { id: 'confident', name: 'Selbstbewusst', desc: 'Stark & überzeugend' },
                    { id: 'dynamic', name: 'Dynamisch', desc: 'Energisch & modern' }
                ].map(t => `
                    <button onclick="window.selectCvDesign('tone', '${t.id}')" data-design="tone-${t.id}"
                            class="design-option p-4 border-2 ${cvGeneratorState.tone === t.id ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'} rounded-xl hover:border-brand-gold transition text-center">
                        <p class="font-medium text-brand-dark text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500">${t.desc}</p>
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Focus Areas -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-bullseye mr-2 text-brand-gold"></i>
                Schwerpunkte (optional)
            </h4>
            <div class="flex flex-wrap gap-2">
                ${['Leadership', 'Strategie', 'Digitalisierung', 'Innovation', 'Vertrieb', 'Finanzen', 'Internationales', 'Teamführung', 'Change Management', 'Projektmanagement'].map(area => `
                    <button onclick="window.toggleFocusArea('${area}')" data-focus="${area}"
                            class="focus-area-btn px-4 py-2 border ${cvGeneratorState.focusAreas.includes(area) ? 'border-brand-gold bg-brand-gold/10 text-brand-dark' : 'border-gray-200 text-gray-600'} rounded-full text-sm hover:border-brand-gold transition">
                        ${area}
                    </button>
                `).join('')}
            </div>
            <p class="text-xs text-gray-500 mt-2">Die KI wird diese Bereiche besonders hervorheben</p>
        </div>

        <!-- Summary -->
        <div class="bg-gradient-to-br from-brand-gold/10 to-yellow-50 rounded-xl p-6 mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-list-check mr-2 text-brand-gold"></i>
                Zusammenfassung
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                    <p class="text-gray-500">Template</p>
                    <p class="font-medium text-brand-dark capitalize">${cvGeneratorState.template}</p>
                </div>
                <div>
                    <p class="text-gray-500">Farbschema</p>
                    <p class="font-medium text-brand-dark capitalize">${cvGeneratorState.colorScheme}</p>
                </div>
                <div>
                    <p class="text-gray-500">Layout</p>
                    <p class="font-medium text-brand-dark">${cvGeneratorState.layout === 'single-column' ? 'Eine Spalte' : cvGeneratorState.layout === 'two-column' ? 'Zwei Spalten' : 'Sidebar'}</p>
                </div>
                <div>
                    <p class="text-gray-500">Extras</p>
                    <p class="font-medium text-brand-dark">${[cvGeneratorState.includeCover ? 'Cover' : '', cvGeneratorState.includePhoto ? 'Foto' : ''].filter(Boolean).join(', ') || 'Keine'}</p>
                </div>
            </div>
        </div>

        <!-- Info Box -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p class="text-sm text-blue-800">
                <i class="fas fa-robot mr-2"></i>
                Die KI analysiert alle Daten und erstellt einen optimierten Lebenslauf${cvGeneratorState.includeCover ? ' mit Anschreiben' : ''}.
                Dies kann 30-60 Sekunden dauern.
            </p>
        </div>

        <!-- Progress (hidden initially) -->
        <div id="cv-generation-progress" class="hidden mb-6">
            <div class="flex items-center gap-3 text-brand-dark">
                <i class="fas fa-spinner fa-spin text-xl"></i>
                <span id="cv-generation-status">CV wird generiert...</span>
            </div>
            <div class="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div id="cv-generation-bar" class="bg-brand-gold h-full transition-all duration-500" style="width: 0%"></div>
            </div>
        </div>
    `;
}

// Initialize CV Generator handlers
function initCvGeneratorHandlers() {
    window.selectCvDesign = function(type, value) {
        cvGeneratorState[type] = value;

        // Update UI for selection buttons
        if (['template', 'colorScheme', 'layout', 'language', 'tone'].includes(type)) {
            const prefix = type === 'template' ? 'template' : type === 'colorScheme' ? 'color' : type === 'layout' ? 'layout' : type === 'language' ? 'lang' : 'tone';
            document.querySelectorAll(`[data-design^="${prefix}-"]`).forEach(btn => {
                btn.classList.remove('border-brand-gold', 'bg-brand-gold/5');
                btn.classList.add('border-gray-200');
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.remove('text-brand-gold');
                    icon.classList.add('text-gray-400');
                }
            });
            const selected = document.querySelector(`[data-design="${prefix}-${value}"]`);
            if (selected) {
                selected.classList.remove('border-gray-200');
                selected.classList.add('border-brand-gold', 'bg-brand-gold/5');
                const icon = selected.querySelector('i');
                if (icon) {
                    icon.classList.remove('text-gray-400');
                    icon.classList.add('text-brand-gold');
                }
            }
        }
    };

    // Select Canva-style template
    window.selectCvTemplate = function(templateId) {
        cvGeneratorState.template = templateId;

        // Find the selected template to get its properties
        const allTemplates = getAllCvTemplates();
        const template = allTemplates.find(t => t.id === templateId);
        if (template) {
            cvGeneratorState.colorScheme = templateId; // Use template id as color scheme reference
            cvGeneratorState.layout = template.layout || 'two-column';
            cvGeneratorState.isCustomPdf = template.isCustomPdf || false;
            if (template.pdfFile) {
                cvGeneratorState.pdfFile = template.pdfFile;
            }
        }

        // Update all template cards UI
        document.querySelectorAll('.template-card').forEach(card => {
            const border = card.querySelector('.border-2');
            if (card.dataset.template === templateId) {
                border.classList.add('border-brand-gold', 'ring-2', 'ring-brand-gold/20');
                border.classList.remove('border-gray-200');
                // Add checkmark if not exists
                const previewDiv = border.querySelector('.aspect-\\[3\\/4\\]');
                if (previewDiv && !previewDiv.querySelector('.fa-check')) {
                    const checkmark = document.createElement('div');
                    checkmark.className = 'absolute top-2 right-2 w-6 h-6 bg-brand-gold rounded-full flex items-center justify-center';
                    checkmark.innerHTML = '<i class="fas fa-check text-brand-dark text-xs"></i>';
                    previewDiv.appendChild(checkmark);
                }
            } else {
                border.classList.remove('border-brand-gold', 'ring-2', 'ring-brand-gold/20');
                border.classList.add('border-gray-200');
                // Remove checkmark
                const checkmark = border.querySelector('.fa-check')?.parentElement;
                if (checkmark) checkmark.remove();
            }
        });

        // Update the selected template info panel
        const infoPanel = document.getElementById('selected-template-info');
        if (infoPanel) {
            infoPanel.innerHTML = renderSelectedTemplateInfo();
        }
    };

    // Filter templates by category
    window.filterCvTemplates = function(category) {
        // Update category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('bg-brand-gold', 'text-brand-dark');
                btn.classList.remove('bg-gray-100', 'text-gray-600');
            } else {
                btn.classList.remove('bg-brand-gold', 'text-brand-dark');
                btn.classList.add('bg-gray-100', 'text-gray-600');
            }
        });

        // Filter template cards
        document.querySelectorAll('.template-card').forEach(card => {
            if (category === 'Alle' || card.dataset.category === category) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    };

    window.toggleFocusArea = function(area) {
        const index = cvGeneratorState.focusAreas.indexOf(area);
        if (index > -1) {
            cvGeneratorState.focusAreas.splice(index, 1);
        } else {
            cvGeneratorState.focusAreas.push(area);
        }

        // Update button UI
        const btn = document.querySelector(`[data-focus="${area}"]`);
        if (btn) {
            if (cvGeneratorState.focusAreas.includes(area)) {
                btn.classList.add('border-brand-gold', 'bg-brand-gold/10', 'text-brand-dark');
                btn.classList.remove('border-gray-200', 'text-gray-600');
            } else {
                btn.classList.remove('border-brand-gold', 'bg-brand-gold/10', 'text-brand-dark');
                btn.classList.add('border-gray-200', 'text-gray-600');
            }
        }
    };
}

// CV Generator navigation
export function cvGeneratorNext() {
    if (cvGeneratorState.step === 1) {
        // Go to step 2
        cvGeneratorState.step = 2;
        updateCvGeneratorUI();
    } else {
        // Start generation
        startCvGeneration(cvGeneratorState.projectId, cvGeneratorState.orderId);
    }
}

export function cvGeneratorBack() {
    if (cvGeneratorState.step === 2) {
        cvGeneratorState.step = 1;
        updateCvGeneratorUI();
    }
}

// Update CV Generator UI based on step
function updateCvGeneratorUI() {
    const content = document.getElementById('cv-generator-content');
    const backBtn = document.getElementById('cv-gen-back-btn');
    const nextBtn = document.getElementById('cv-gen-next-btn');
    const step1Indicator = document.getElementById('step-indicator-1');
    const step2Indicator = document.getElementById('step-indicator-2');
    const stepLine = document.getElementById('step-line');

    if (cvGeneratorState.step === 1) {
        content.innerHTML = renderCvGeneratorStep1();
        backBtn.classList.add('hidden');
        nextBtn.innerHTML = 'Weiter <i class="fas fa-arrow-right ml-2"></i>';

        // Apply preview scaling after DOM is ready
        setTimeout(() => scaleCvPreviews(), 50);

        // Update indicators
        step1Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step1Indicator.querySelector('div').classList.remove('bg-gray-300', 'text-gray-600');
        step1Indicator.querySelector('span').classList.add('text-brand-dark');
        step1Indicator.querySelector('span').classList.remove('text-gray-500');

        step2Indicator.querySelector('div').classList.remove('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.add('bg-gray-300', 'text-gray-600');
        step2Indicator.querySelector('span').classList.remove('text-brand-dark');
        step2Indicator.querySelector('span').classList.add('text-gray-500');

        stepLine.classList.remove('bg-brand-gold');
        stepLine.classList.add('bg-gray-300');
    } else {
        content.innerHTML = renderCvGeneratorStep2();
        backBtn.classList.remove('hidden');
        nextBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>CV generieren';

        // Update indicators
        step1Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.remove('bg-gray-300', 'text-gray-600');
        step2Indicator.querySelector('span').classList.add('text-brand-dark');
        step2Indicator.querySelector('span').classList.remove('text-gray-500');

        stepLine.classList.add('bg-brand-gold');
        stepLine.classList.remove('bg-gray-300');
    }

    initCvGeneratorHandlers();
}

// Start CV generation with Claude API
export async function startCvGeneration(projectId, orderId) {
    // Use the wizard buttons (cv-gen-next-btn becomes the generate button in step 2)
    const startBtn = document.getElementById('cv-gen-next-btn');
    const backBtn = document.getElementById('cv-gen-back-btn');
    const progressDiv = document.getElementById('cv-generation-progress');
    const statusSpan = document.getElementById('cv-generation-status');
    const progressBar = document.getElementById('cv-generation-bar');

    // Get all design options from cvGeneratorState
    const {
        template,
        colorScheme,
        layout,
        includeCover,
        includePhoto,
        language,
        tone,
        focusAreas
    } = cvGeneratorState;

    // Update UI to show progress
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird generiert...';
    }
    if (backBtn) backBtn.classList.add('hidden');
    if (progressDiv) progressDiv.classList.remove('hidden');

    // Animate progress bar
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 15, 90);
        if (progressBar) progressBar.style.width = `${progress}%`;

        if (statusSpan) {
            if (progress < 30) {
                statusSpan.textContent = 'Analysiere Fragebogen-Daten...';
            } else if (progress < 60) {
                statusSpan.textContent = includeCover ? 'Generiere CV & Anschreiben...' : 'Generiere optimierten CV...';
            } else {
                statusSpan.textContent = 'Finalisiere Dokument...';
            }
        }
    }, 800);

    // Check if this is a custom PDF template
    const allTemplates = getAllCvTemplates();
    const selectedTemplateInfo = allTemplates.find(t => t.id === template);
    const isCustomPdf = selectedTemplateInfo?.isCustomPdf || false;
    const pdfFile = selectedTemplateInfo?.pdfFile || null;

    try {
        // Call Cloud Function to generate CV with all design options
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/generateCvContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: projectId,
                templateType: template,
                language: language,
                // New design options
                colorScheme: colorScheme,
                layout: layout,
                includeCover: includeCover,
                includePhoto: includePhoto,
                tone: tone,
                focusAreas: focusAreas,
                // Custom PDF template info
                isCustomPdf: isCustomPdf,
                pdfFile: pdfFile
            })
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'CV-Generierung fehlgeschlagen');
        }

        const result = await response.json();

        // Complete progress
        if (progressBar) progressBar.style.width = '100%';
        if (statusSpan) statusSpan.textContent = 'CV erfolgreich generiert!';

        showToast('CV wurde erfolgreich generiert!');

        // Close modal and refresh list
        setTimeout(async () => {
            document.getElementById('cv-generator-modal')?.remove();
            await loadCvProjects();
            // Open preview automatically
            openCvPreview(orderId);
        }, 1000);

    } catch (e) {
        clearInterval(progressInterval);
        logger.error('Error generating CV:', e);

        if (progressDiv) {
            progressDiv.innerHTML = `
                <div class="flex items-center gap-3 text-red-600">
                    <i class="fas fa-exclamation-circle text-xl"></i>
                    <span>Fehler: ${e.message}</span>
                </div>
            `;
        }

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-redo mr-2"></i>Erneut versuchen';
        }
        if (backBtn) backBtn.classList.remove('hidden');
    }
}

// Open CV preview
export async function openCvPreview(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    try {
        showToast('Lade CV-Vorschau...');

        // Load latest project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
            showToast('Kein generierter CV gefunden');
            return;
        }

        const data = projectDoc.data();
        const cv = data.generatedCv.data;
        const template = data.generatedCv.templateType || 'corporate';

        // Render CV preview
        const cvHtml = renderCvTemplate(cv, template);

        const modal = document.createElement('div');
        modal.id = 'cv-preview-modal';
        modal.className = 'fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-4xl w-full shadow-2xl my-4 flex flex-col">
                <!-- Header -->
                <div class="bg-brand-dark text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-4">
                        <h3 class="text-lg font-medium">CV Vorschau</h3>
                        <span class="text-xs bg-brand-gold/20 text-brand-gold px-2 py-1 rounded">${template.charAt(0).toUpperCase() + template.slice(1)}</span>
                    </div>
                    <button onclick="document.getElementById('cv-preview-modal')?.remove()"
                            class="text-white/60 hover:text-white transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- CV Content -->
                <div class="flex-1 overflow-y-auto p-6 bg-gray-100">
                    <div id="cv-preview-content" class="bg-white shadow-lg mx-auto" style="max-width: 210mm;">
                        ${cvHtml}
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-500">Template:</span>
                        <select id="preview-template-select" onchange="app.changeCvTemplate('${project.cvProjectId}', '${orderId}')"
                                class="text-sm border border-gray-200 rounded px-2 py-1">
                            ${buildTemplateOptions(template)}
                        </select>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="app.regenerateCv('${project.cvProjectId}', '${orderId}')"
                                class="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                            <i class="fas fa-redo mr-2"></i>Neu generieren
                        </button>
                        <button onclick="app.exportCvWord('${orderId}')"
                                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                            <i class="fas fa-file-word mr-2"></i>Word
                        </button>
                        <button onclick="app.exportCvPdf('${orderId}')"
                                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                            <i class="fas fa-file-pdf mr-2"></i>PDF
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (e) {
        logger.error('Error loading CV preview:', e);
        showToast('Fehler beim Laden der Vorschau');
    }
}

// Build template options for dropdown
function buildTemplateOptions(selectedTemplate) {
    const allTemplates = getAllCvTemplates();
    return allTemplates.map(t => `
        <option value="${t.id}" ${selectedTemplate === t.id ? 'selected' : ''}>
            ${t.name}${t.isCustomPdf ? ' (PDF)' : ''}
        </option>
    `).join('');
}

// Render CV template HTML
function renderCvTemplate(cv, template) {
    // Check if this is a custom PDF template
    const allTemplates = getAllCvTemplates();
    const customTemplate = allTemplates.find(t => t.id === template && t.isCustomPdf);

    if (customTemplate) {
        // For custom PDF templates, show an embedded PDF viewer or preview image
        return `
            <div class="cv-template cv-template-custom-pdf p-8 text-center">
                <div class="mb-6">
                    <img src="${customTemplate.previewImage}" alt="${customTemplate.name}"
                         class="max-w-full h-auto mx-auto shadow-lg rounded-lg" style="max-height: 800px;" />
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Dies ist ein PDF-Template. Die generierten Inhalte werden beim PDF-Export in dieses Layout eingefügt.
                    <br><br>
                    <a href="${customTemplate.pdfFile}" target="_blank" class="text-blue-600 hover:underline">
                        <i class="fas fa-external-link-alt mr-1"></i>Original-PDF öffnen
                    </a>
                </div>
            </div>
        `;
    }
    const personal = cv.personal || {};
    const summary = cv.summary || '';
    const experience = cv.experience || [];
    const education = cv.education || [];
    const skills = cv.skills || {};
    const expertise = cv.expertise || [];

    // Template-specific styling
    const templateStyles = {
        'schwarz-beige-modern': {
            headerBg: 'bg-[#3d3d3d]',
            headerText: 'text-white',
            accentColor: 'text-[#c9a227]',
            sectionTitle: 'text-[#3d3d3d] border-b border-[#c9a227]',
            bodyText: 'text-gray-700'
        },
        'green-yellow-modern': {
            headerBg: 'bg-[#2d8a8a]',
            headerText: 'text-white',
            accentColor: 'text-[#f5c842]',
            sectionTitle: 'text-[#f5c842] border-b border-[#2d8a8a]',
            bodyText: 'text-[#2d8a8a]'
        },
        minimalist: {
            headerBg: 'bg-white',
            headerText: 'text-gray-900',
            accentColor: 'text-gray-600',
            sectionTitle: 'text-gray-800 border-b border-gray-200',
            bodyText: 'text-gray-700'
        },
        creative: {
            headerBg: 'bg-gradient-to-r from-purple-600 to-indigo-600',
            headerText: 'text-white',
            accentColor: 'text-purple-600',
            sectionTitle: 'text-purple-700 border-b-2 border-purple-200',
            bodyText: 'text-gray-700'
        },
        corporate: {
            headerBg: 'bg-brand-dark',
            headerText: 'text-white',
            accentColor: 'text-brand-gold',
            sectionTitle: 'text-brand-dark border-b-2 border-brand-gold',
            bodyText: 'text-gray-700'
        },
        executive: {
            headerBg: 'bg-slate-900',
            headerText: 'text-white',
            accentColor: 'text-amber-500',
            sectionTitle: 'text-slate-800 border-b-2 border-amber-500',
            bodyText: 'text-gray-700'
        },
        brand: {
            headerBg: 'bg-gradient-to-br from-brand-dark to-brand-dark/90',
            headerText: 'text-white',
            accentColor: 'text-brand-gold',
            sectionTitle: 'text-brand-dark border-l-4 border-brand-gold pl-4',
            bodyText: 'text-gray-700'
        }
    };

    const style = templateStyles[template] || templateStyles.corporate;

    return `
        <div class="cv-template cv-template-${template}" style="font-family: 'Georgia', serif;">
            <!-- Header -->
            <div class="${style.headerBg} ${style.headerText} p-8">
                <h1 class="text-3xl font-bold mb-1">${personal.fullName || 'Name'}</h1>
                <p class="text-xl opacity-90 mb-4">${personal.title || ''}</p>
                <div class="flex flex-wrap gap-4 text-sm opacity-80">
                    ${personal.email ? `<span><i class="fas fa-envelope mr-1"></i>${personal.email}</span>` : ''}
                    ${personal.phone ? `<span><i class="fas fa-phone mr-1"></i>${personal.phone}</span>` : ''}
                    ${personal.location ? `<span><i class="fas fa-map-marker-alt mr-1"></i>${personal.location}</span>` : ''}
                    ${personal.linkedin ? `<span><i class="fab fa-linkedin mr-1"></i>${personal.linkedin}</span>` : ''}
                </div>
            </div>

            <div class="p-8 space-y-6">
                <!-- Summary -->
                ${summary ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">PROFIL</h2>
                        <p class="${style.bodyText} leading-relaxed">${summary}</p>
                    </div>
                ` : ''}

                <!-- Expertise -->
                ${expertise.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">KERNKOMPETENZEN</h2>
                        <div class="flex flex-wrap gap-2">
                            ${expertise.map(e => `<span class="px-3 py-1 bg-gray-100 rounded-full text-sm ${style.accentColor}">${e}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Experience -->
                ${experience.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">BERUFSERFAHRUNG</h2>
                        <div class="space-y-4">
                            ${experience.map(exp => `
                                <div class="border-l-2 ${style.accentColor.replace('text-', 'border-')} pl-4">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <h3 class="font-bold ${style.bodyText}">${exp.role || ''}</h3>
                                            <p class="${style.accentColor} text-sm">${exp.company || ''}${exp.location ? ` | ${exp.location}` : ''}</p>
                                        </div>
                                        <span class="text-sm text-gray-500">${exp.period || ''}</span>
                                    </div>
                                    ${exp.description ? `<p class="text-sm ${style.bodyText} mt-2">${exp.description}</p>` : ''}
                                    ${(exp.achievements || []).length > 0 ? `
                                        <ul class="mt-2 space-y-1">
                                            ${exp.achievements.map(a => `<li class="text-sm ${style.bodyText} flex items-start gap-2"><span class="${style.accentColor}">•</span>${a}</li>`).join('')}
                                        </ul>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Education -->
                ${education.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">AUSBILDUNG</h2>
                        <div class="space-y-3">
                            ${education.map(edu => `
                                <div class="flex justify-between items-start">
                                    <div>
                                        <h3 class="font-bold ${style.bodyText}">${edu.degree || ''} ${edu.field ? `- ${edu.field}` : ''}</h3>
                                        <p class="text-sm ${style.accentColor}">${edu.institution || ''}</p>
                                        ${edu.highlights ? `<p class="text-sm text-gray-500 mt-1">${edu.highlights}</p>` : ''}
                                    </div>
                                    <span class="text-sm text-gray-500">${edu.period || ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Skills -->
                <div class="grid grid-cols-2 gap-6">
                    ${(skills.technical || []).length > 0 ? `
                        <div>
                            <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">FACHKENNTNISSE</h2>
                            <div class="flex flex-wrap gap-2">
                                ${skills.technical.map(s => `<span class="px-2 py-1 bg-gray-100 rounded text-sm">${s}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${(skills.languages || []).length > 0 ? `
                        <div>
                            <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">SPRACHEN</h2>
                            <div class="space-y-1">
                                ${skills.languages.map(l => `<p class="text-sm"><span class="font-medium">${l.language}</span> - ${l.level}</p>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${(skills.certifications || []).length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">ZERTIFIKATE</h2>
                        <div class="flex flex-wrap gap-2">
                            ${skills.certifications.map(c => `<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${c}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Change CV template and re-render preview
export async function changeCvTemplate(projectId, orderId) {
    const newTemplate = document.getElementById('preview-template-select')?.value;
    if (!newTemplate) return;

    try {
        const projectDoc = await getDoc(doc(db, 'cvProjects', projectId));
        if (!projectDoc.exists()) return;

        const cv = projectDoc.data().generatedCv?.data;
        if (!cv) return;

        const cvHtml = renderCvTemplate(cv, newTemplate);
        const previewContent = document.getElementById('cv-preview-content');
        if (previewContent) {
            previewContent.innerHTML = cvHtml;
        }

        // Update template in Firestore
        await updateDoc(doc(db, 'cvProjects', projectId), {
            'generatedCv.templateType': newTemplate
        });

    } catch (e) {
        logger.error('Error changing template:', e);
    }
}

// Regenerate CV with new Claude API call
export async function regenerateCv(projectId, orderId) {
    document.getElementById('cv-preview-modal')?.remove();
    openCvGenerator(orderId);
}

// Export CV as PDF (Server-side generation for professional quality)
export async function exportCvPdf(orderId) {
    await exportCvDocument(orderId, 'pdf');
}

// Export CV as Word document
export async function exportCvWord(orderId) {
    await exportCvDocument(orderId, 'docx');
}

// Generic function to export CV in different formats
async function exportCvDocument(orderId, format = 'docx') {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    const formatLabel = format === 'docx' ? 'Word' : 'PDF';
    showToast(`${formatLabel}-Dokument wird generiert...`);

    try {
        // Get the project data to determine template style
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
            showToast('Kein generierter CV gefunden. Bitte zuerst CV generieren.');
            return;
        }

        const projectData = projectDoc.data();
        const templateStyle = projectData.generatedCv.templateType || 'executive';

        // Call the Cloud Function to generate the document
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/generateCvDocument', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: project.cvProjectId,
                format: format,
                templateStyle: templateStyle
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Dokumentgenerierung fehlgeschlagen');
        }

        const result = await response.json();

        if (result.success && result.downloadUrl) {
            // Download the file
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `CV_${project.customerName?.replace(/\s+/g, '_') || 'APEX'}_${new Date().toISOString().split('T')[0]}.${format}`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast(`${formatLabel}-Dokument wurde heruntergeladen!`);
        } else {
            throw new Error('Keine Download-URL erhalten');
        }

    } catch (e) {
        logger.error(`Error generating ${format}:`, e);
        showToast(`Fehler beim ${formatLabel}-Export: ` + e.message);
    }
}

// Export CV as PDF using html2pdf (client-side fallback)
export async function exportCvPdfClientSide(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    showToast('PDF wird generiert...');

    try {
        // Load html2pdf.js dynamically if not loaded
        if (!window.html2pdf) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }

        // Get the CV preview content
        let cvContent = document.getElementById('cv-preview-content');

        // If preview modal is not open, we need to load and render the CV
        if (!cvContent) {
            const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
            if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
                showToast('Kein generierter CV gefunden');
                return;
            }

            const data = projectDoc.data();
            const cv = data.generatedCv.data;
            const template = data.generatedCv.templateType || 'corporate';

            // Create temporary container
            const tempContainer = document.createElement('div');
            tempContainer.id = 'temp-cv-content';
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.innerHTML = `<div style="width: 210mm; background: white;">${renderCvTemplate(cv, template)}</div>`;
            document.body.appendChild(tempContainer);
            cvContent = tempContainer.querySelector('div');
        }

        // Configure html2pdf options
        const opt = {
            margin: 0,
            filename: `CV_${project.customerName?.replace(/\s+/g, '_') || 'APEX'}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            }
        };

        // Generate PDF
        await html2pdf().set(opt).from(cvContent).save();

        // Clean up temp container if it exists
        document.getElementById('temp-cv-content')?.remove();

        showToast('PDF wurde heruntergeladen!');

    } catch (e) {
        logger.error('Error generating PDF:', e);
        showToast('Fehler beim PDF-Export: ' + e.message);
    }
}

// Helper function to load external scripts
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Send CV to customer
export async function sendCvToCustomer(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'send-cv-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <i class="fas fa-envelope text-green-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">CV an Kunden senden</h3>
                    <p class="text-sm text-gray-500">${project.customerEmail}</p>
                </div>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Der Kunde erhält eine E-Mail mit dem fertigen CV als PDF-Anhang.
                </p>
            </div>

            <div class="flex gap-3 justify-end">
                <button onclick="document.getElementById('send-cv-modal')?.remove()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Abbrechen
                </button>
                <button onclick="app.confirmSendCvToCustomer('${project.cvProjectId}', '${orderId}')"
                        class="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Jetzt senden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Confirm and send CV to customer
export async function confirmSendCvToCustomer(projectId, orderId) {
    document.getElementById('send-cv-modal')?.remove();
    showToast('CV wird an Kunden gesendet...');

    try {
        // Update status to delivered
        await updateDoc(doc(db, 'cvProjects', projectId), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
        });

        // TODO: Send email with PDF attachment via Cloud Function

        showToast('CV wurde als zugestellt markiert!');
        await loadCvProjects();

    } catch (e) {
        logger.error('Error sending CV:', e);
        showToast('Fehler: ' + e.message);
    }
}

// ============================================
// CV QUESTIONNAIRE FUNCTIONS
// ============================================

let cvQuestionnaireStep = 1;
let cvQuestionnaireProjectId = null;
let cvQuestionnaireMode = null; // 'smart' or 'manual'
let smartQuestionnaireStep = 1;
let cvQuestionnaireData = {
    personal: {},
    experience: [],
    education: [],
    skills: {},
    additional: {},
    documents: {}
};
let smartUploadData = {
    cvFile: null,
    cvUrl: null,
    jobFile: null,
    jobUrl: null,
    otherFiles: [],
    otherUrls: [],
    name: '',
    email: '',
    targetRole: '',
    linkedin: '',
    links: '',
    notes: '',
    // Template selection fields
    selectedTemplate: null,
    selectedTemplateName: '',
    primaryColor: '#1a3a5c',
    accentColor: '#d4912a'
};

// Current cv project data (loaded from Firestore)
let currentCvProjectData = null;
let experienceCounter = 0;
let educationCounter = 0;
let languageCounter = 0;

// Initialize CV Questionnaire from URL parameter
export async function initCvQuestionnaire() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('questionnaire');

    if (!projectId) return false;

    // ========== VALIDIERUNG: ProjectId Format prüfen ==========
    // Verhindert dass zufällige IDs probiert werden
    if (!projectId.match(/^[a-zA-Z0-9]{20,}$/)) {
        showToast('❌ Ungültiger Fragebogen-Link');
        window.location.href = window.location.origin;
        return false;
    }

    cvQuestionnaireProjectId = projectId;

    try {
        // Load existing project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', projectId));

        // ========== VALIDIERUNG: Projekt muss existieren ==========
        if (!projectDoc.exists()) {
            showToast('❌ Fragebogen nicht gefunden oder abgelaufen');
            window.location.href = window.location.origin;
            return false;
        }

        const data = projectDoc.data();

        // Store project data for template loading
        currentCvProjectData = data;

        // ========== VALIDIERUNG: Status prüfen ==========
        // Fragebogen ist nicht mehr bearbeitbar nach Absenden (data_received, generating, ready, delivered)
        const completedStatuses = ['data_received', 'generating', 'ready', 'delivered'];
        if (completedStatuses.includes(data.status)) {
            showToast('ℹ️ Dieser Fragebogen wurde bereits ausgefüllt und kann nicht mehr bearbeitet werden.');
            // Weiterleiten zum Dashboard nach 2 Sekunden
            setTimeout(() => {
                window.location.href = window.location.origin + '?view=dashboard';
            }, 2000);
            return false;
        }

        // Pre-fill form with existing data
        if (data.questionnaire) {
            cvQuestionnaireData = { ...cvQuestionnaireData, ...data.questionnaire };
        }

        // Pre-fill email and name for both modes
        if (data.customerEmail) {
            smartUploadData.email = data.customerEmail;
            const emailInput = document.getElementById('cv-q-email');
            const smartEmailInput = document.getElementById('cv-q-smart-email');
            if (emailInput) emailInput.value = data.customerEmail;
            if (smartEmailInput) smartEmailInput.value = data.customerEmail;
        }
        if (data.customerName) {
            smartUploadData.name = data.customerName;
            const nameInput = document.getElementById('cv-q-fullname');
            const smartNameInput = document.getElementById('cv-q-smart-name');
            if (nameInput) nameInput.value = data.customerName;
            if (smartNameInput) smartNameInput.value = data.customerName;
        }

        // Show questionnaire view with mode selection
        hideAllViews();
        document.getElementById('view-cv-questionnaire')?.classList.remove('hidden');

        // Reset to mode selection
        resetQuestionnaireView();

        return true;
    } catch (e) {
        logger.error('Error loading questionnaire:', e);
        showToast('Fehler beim Laden des Fragebogens');
        return false;
    }
}

// Reset questionnaire view to initial state
function resetQuestionnaireView() {
    // Show mode selection
    document.getElementById('cv-q-mode-selection')?.classList.remove('hidden');

    // Hide both modes
    document.getElementById('cv-q-smart-mode')?.classList.add('hidden');
    document.getElementById('cv-q-manual-mode')?.classList.add('hidden');
    document.getElementById('cv-q-manual-progress')?.classList.add('hidden');

    cvQuestionnaireMode = null;
    smartQuestionnaireStep = 1;
    cvQuestionnaireStep = 1;
}

// Select questionnaire mode (smart or manual)
export function selectQuestionnaireMode(mode) {
    cvQuestionnaireMode = mode;

    // Hide mode selection
    document.getElementById('cv-q-mode-selection')?.classList.add('hidden');

    if (mode === 'smart') {
        // Show smart upload mode
        document.getElementById('cv-q-smart-mode')?.classList.remove('hidden');
        document.getElementById('cv-q-manual-mode')?.classList.add('hidden');
        document.getElementById('cv-q-manual-progress')?.classList.add('hidden');

        // Pre-fill smart mode fields
        const smartEmailInput = document.getElementById('cv-q-smart-email');
        const smartNameInput = document.getElementById('cv-q-smart-name');
        if (smartEmailInput && smartUploadData.email) smartEmailInput.value = smartUploadData.email;
        if (smartNameInput && smartUploadData.name) smartNameInput.value = smartUploadData.name;

        // Reset smart mode
        smartQuestionnaireStep = 1;
        updateSmartQuestionnaireUI();

        // Initialize smart mode input listeners (with small delay to ensure DOM is ready)
        setTimeout(() => initSmartModeListeners(), 100);
    } else {
        // Show manual mode
        document.getElementById('cv-q-smart-mode')?.classList.add('hidden');
        document.getElementById('cv-q-manual-mode')?.classList.remove('hidden');
        document.getElementById('cv-q-manual-progress')?.classList.remove('hidden');

        // Initialize manual mode entries
        if (cvQuestionnaireData.experience.length === 0) {
            addCvExperienceEntry();
        }
        if (cvQuestionnaireData.education.length === 0) {
            addCvEducationEntry();
        }
        if (!cvQuestionnaireData.skills.languages?.length) {
            addCvLanguageEntry();
        }

        // Pre-fill manual mode
        if (cvQuestionnaireData.questionnaire) {
            prefillQuestionnaireForm(cvQuestionnaireData.questionnaire);
        }

        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
    }
}

// Back to mode selection
export function backToModeSelection() {
    resetQuestionnaireView();
}

// ============================================
// SMART UPLOAD MODE FUNCTIONS
// ============================================

// Handle CV file upload in smart mode
export async function handleSmartCvUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showToast('CV wird hochgeladen...');

    try {
        const url = await uploadQuestionnaireFile(file, 'existingCv');
        smartUploadData.cvFile = file;
        smartUploadData.cvUrl = url;

        // Update UI
        document.getElementById('cv-q-smart-cv-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-cv-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-cv-filename').textContent = file.name;

        // Enable next button
        updateSmartNextButton();

        showToast('CV erfolgreich hochgeladen!');
    } catch (e) {
        logger.error('Error uploading CV:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Handle job description upload in smart mode
export async function handleSmartJobUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showToast('Stellenausschreibung wird hochgeladen...');

    try {
        const url = await uploadQuestionnaireFile(file, 'targetJob');
        smartUploadData.jobFile = file;
        smartUploadData.jobUrl = url;

        // Update UI
        document.getElementById('cv-q-smart-job-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-job-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-job-filename').textContent = file.name;

        showToast('Stellenausschreibung erfolgreich hochgeladen!');
    } catch (e) {
        logger.error('Error uploading job description:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Handle other documents upload in smart mode
export async function handleSmartOtherUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    showToast('Dokumente werden hochgeladen...');

    try {
        for (const file of files) {
            const url = await uploadQuestionnaireFile(file, 'other');
            smartUploadData.otherFiles.push(file);
            smartUploadData.otherUrls.push(url);
        }

        // Update UI
        document.getElementById('cv-q-smart-other-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-other-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-other-filename').textContent =
            smartUploadData.otherFiles.map(f => f.name).join(', ');

        showToast(`${files.length} Dokument(e) erfolgreich hochgeladen!`);
    } catch (e) {
        logger.error('Error uploading documents:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Upload file to Firebase Storage for questionnaire
async function uploadQuestionnaireFile(file, docType) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `cv-documents/${cvQuestionnaireProjectId}/${docType}_${timestamp}_${safeName}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// Update smart mode next button state
export function updateSmartNextButton() {
    const nextBtn = document.getElementById('cv-q-smart-next-btn');
    if (!nextBtn) return;

    if (smartQuestionnaireStep === 1) {
        // Step 1: Need CV uploaded
        nextBtn.disabled = !smartUploadData.cvUrl;
    } else if (smartQuestionnaireStep === 2) {
        // Step 2: Need name, email, and target role
        const name = document.getElementById('cv-q-smart-name')?.value?.trim();
        const email = document.getElementById('cv-q-smart-email')?.value?.trim();
        const targetRole = document.getElementById('cv-q-smart-target-role')?.value?.trim();
        nextBtn.disabled = !name || !email || !targetRole;
    } else if (smartQuestionnaireStep === 3) {
        // Step 3: Need template selected
        nextBtn.disabled = !smartUploadData.selectedTemplate;
    }
}

// Update smart questionnaire UI based on current step
function updateSmartQuestionnaireUI() {
    // Hide all steps
    document.querySelectorAll('.cv-q-smart-step').forEach(el => el.classList.add('hidden'));

    // Show current step
    document.getElementById(`cv-q-smart-step-${smartQuestionnaireStep}`)?.classList.remove('hidden');

    // Update progress indicators (now 4 steps)
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`smart-step-${i}-indicator`);
        const line = document.getElementById(`smart-step-line-${i - 1}`);

        if (indicator) {
            if (i <= smartQuestionnaireStep) {
                indicator.classList.remove('bg-gray-200', 'text-gray-500');
                indicator.classList.add('bg-brand-gold', 'text-white');
            } else {
                indicator.classList.add('bg-gray-200', 'text-gray-500');
                indicator.classList.remove('bg-brand-gold', 'text-white');
            }
        }
        if (line && i > 1) {
            if (i <= smartQuestionnaireStep) {
                line.classList.remove('bg-gray-200');
                line.classList.add('bg-brand-gold');
            } else {
                line.classList.add('bg-gray-200');
                line.classList.remove('bg-brand-gold');
            }
        }
    }

    // Update navigation buttons
    const backBtn = document.getElementById('cv-q-smart-back-btn');
    const nextBtn = document.getElementById('cv-q-smart-next-btn');
    const submitBtn = document.getElementById('cv-q-smart-submit-btn');

    if (smartQuestionnaireStep === 1) {
        backBtn.onclick = () => backToModeSelection();
    } else {
        backBtn.onclick = () => smartQuestionnaireBack();
    }

    // Step 3: Load templates when entering template selection
    if (smartQuestionnaireStep === 3) {
        loadAvailableTemplates();
    }

    // Step 4: Show submit button and fill summary
    if (smartQuestionnaireStep === 4) {
        nextBtn?.classList.add('hidden');
        submitBtn?.classList.remove('hidden');

        // Fill summary
        fillSmartSummary();
    } else {
        nextBtn?.classList.remove('hidden');
        submitBtn?.classList.add('hidden');
    }

    updateSmartNextButton();
}

// Navigate to next step in smart mode
export function smartQuestionnaireNext() {
    if (smartQuestionnaireStep === 1) {
        if (!smartUploadData.cvUrl) {
            showToast('Bitte laden Sie Ihren Lebenslauf hoch');
            return;
        }
    } else if (smartQuestionnaireStep === 2) {
        // Save form data
        smartUploadData.name = document.getElementById('cv-q-smart-name')?.value?.trim() || '';
        smartUploadData.email = document.getElementById('cv-q-smart-email')?.value?.trim() || '';
        smartUploadData.targetRole = document.getElementById('cv-q-smart-target-role')?.value?.trim() || '';
        smartUploadData.linkedin = document.getElementById('cv-q-smart-linkedin')?.value?.trim() || '';
        smartUploadData.links = document.getElementById('cv-q-smart-links')?.value?.trim() || '';
        smartUploadData.notes = document.getElementById('cv-q-smart-notes')?.value?.trim() || '';

        if (!smartUploadData.name || !smartUploadData.email || !smartUploadData.targetRole) {
            showToast('Bitte füllen Sie alle Pflichtfelder aus');
            return;
        }
    } else if (smartQuestionnaireStep === 3) {
        // Validate template selection
        if (!smartUploadData.selectedTemplate) {
            showToast('Bitte wählen Sie ein Template aus');
            return;
        }
        // Save color customization
        smartUploadData.primaryColor = document.getElementById('cv-q-primary-color')?.value || '#1a3a5c';
        smartUploadData.accentColor = document.getElementById('cv-q-accent-color')?.value || '#d4912a';
    }

    smartQuestionnaireStep++;
    updateSmartQuestionnaireUI();
}

// Navigate back in smart mode
export function smartQuestionnaireBack() {
    if (smartQuestionnaireStep > 1) {
        smartQuestionnaireStep--;
        updateSmartQuestionnaireUI();
    } else {
        backToModeSelection();
    }
}

// Fill summary for smart mode step 3
function fillSmartSummary() {
    const summaryContent = document.getElementById('cv-q-smart-summary-content');
    if (!summaryContent) return;

    let html = `
        <div class="flex items-center gap-2">
            <i class="fas fa-user text-brand-gold"></i>
            <span><strong>Name:</strong> ${smartUploadData.name}</span>
        </div>
        <div class="flex items-center gap-2">
            <i class="fas fa-envelope text-brand-gold"></i>
            <span><strong>E-Mail:</strong> ${smartUploadData.email}</span>
        </div>
        <div class="flex items-center gap-2">
            <i class="fas fa-bullseye text-brand-gold"></i>
            <span><strong>Zielposition:</strong> ${smartUploadData.targetRole}</span>
        </div>
    `;

    if (smartUploadData.linkedin) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fab fa-linkedin text-blue-600"></i>
                <span><strong>LinkedIn:</strong> <a href="${smartUploadData.linkedin}" target="_blank" class="text-brand-gold hover:underline">${smartUploadData.linkedin}</a></span>
            </div>
        `;
    }

    if (smartUploadData.links) {
        html += `
            <div class="flex items-start gap-2">
                <i class="fas fa-link text-brand-gold mt-0.5"></i>
                <span><strong>Weitere Links:</strong> ${smartUploadData.links}</span>
            </div>
        `;
    }

    html += `
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <i class="fas fa-file-pdf text-green-500"></i>
            <span><strong>CV:</strong> ${smartUploadData.cvFile?.name || 'Hochgeladen'}</span>
        </div>
    `;

    if (smartUploadData.jobUrl) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fas fa-briefcase text-green-500"></i>
                <span><strong>Stellenausschreibung:</strong> ${smartUploadData.jobFile?.name || 'Hochgeladen'}</span>
            </div>
        `;
    }

    if (smartUploadData.otherUrls.length > 0) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fas fa-file-alt text-green-500"></i>
                <span><strong>Weitere Dokumente:</strong> ${smartUploadData.otherFiles.length} Datei(en)</span>
            </div>
        `;
    }

    if (smartUploadData.notes) {
        html += `
            <div class="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                <i class="fas fa-sticky-note text-brand-gold mt-0.5"></i>
                <span><strong>Hinweise:</strong> ${smartUploadData.notes}</span>
            </div>
        `;
    }

    // Template selection summary
    if (smartUploadData.selectedTemplate) {
        html += `
            <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                <i class="fas fa-file-alt text-brand-gold"></i>
                <span><strong>Template:</strong> ${smartUploadData.selectedTemplateName || smartUploadData.selectedTemplate}</span>
            </div>
            <div class="flex items-center gap-2">
                <i class="fas fa-palette text-brand-gold"></i>
                <span><strong>Farben:</strong>
                    <span class="inline-block w-4 h-4 rounded" style="background-color: ${smartUploadData.primaryColor}; vertical-align: middle;"></span>
                    <span class="inline-block w-4 h-4 rounded ml-1" style="background-color: ${smartUploadData.accentColor}; vertical-align: middle;"></span>
                </span>
            </div>
        `;
    }

    summaryContent.innerHTML = html;
}

// ========== TEMPLATE SELECTION FUNCTIONS ==========

// Load available templates based on package type
async function loadAvailableTemplates() {
    const packageType = currentCvProjectData?.packageType || 'young-professional';
    const orderItemTitle = currentCvProjectData?.orderItemTitle || '';

    // Update package info display
    const packageNameEl = document.getElementById('cv-q-template-package-name');
    if (packageNameEl) {
        packageNameEl.textContent = orderItemTitle || getPackageDisplayName(packageType);
    }

    const templateGrid = document.getElementById('cv-q-template-grid');
    if (!templateGrid) return;

    try {
        // Load templates from static JSON file
        const response = await fetch('/cv-templates/templates.json');
        const templatesData = await response.json();

        // Get templates for this package type
        const templates = templatesData[packageType] || templatesData['young-professional'] || [];

        if (templates.length === 0) {
            templateGrid.innerHTML = `
                <div class="col-span-full text-center py-8 text-gray-500">
                    <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                    <p>Keine Templates für dieses Paket verfügbar.</p>
                </div>
            `;
            return;
        }

        // Render template cards
        templateGrid.innerHTML = templates.map(template => `
            <div class="template-card cursor-pointer rounded-xl border-2 border-gray-200 overflow-hidden hover:border-brand-gold hover:shadow-lg transition-all ${smartUploadData.selectedTemplate === template.id ? 'border-brand-gold ring-2 ring-brand-gold/30' : ''}"
                 onclick="app.selectTemplate('${template.id}', '${template.name}', '${template.previewImage}', '${template.defaultColors?.primary || '#1a3a5c'}', '${template.defaultColors?.accent || '#d4912a'}')">
                <div class="aspect-[3/4] bg-gray-100 relative">
                    <img src="${template.previewImage}" alt="${template.name}"
                         class="w-full h-full object-cover"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 133%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22133%22/><text x=%2250%22 y=%2266%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22>Template</text></svg>'">
                    ${smartUploadData.selectedTemplate === template.id ? `
                        <div class="absolute top-2 right-2 w-8 h-8 bg-brand-gold rounded-full flex items-center justify-center">
                            <i class="fas fa-check text-white"></i>
                        </div>
                    ` : ''}
                </div>
                <div class="p-3 bg-white">
                    <p class="font-medium text-sm text-gray-800 truncate">${template.name}</p>
                    <p class="text-xs text-gray-500 mt-1 truncate">${template.description || ''}</p>
                </div>
            </div>
        `).join('');

    } catch (error) {
        logger.error('Error loading templates:', error);
        templateGrid.innerHTML = `
            <div class="col-span-full text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>Fehler beim Laden der Templates.</p>
            </div>
        `;
    }
}

// Get display name for package type
function getPackageDisplayName(packageType) {
    const names = {
        'young-professional': 'Young Professional CV',
        'senior-professional': 'Senior Professional CV',
        'executive': 'Executive CV',
        'quick-check': 'Quick Check'
    };
    return names[packageType] || packageType;
}

// Select a template
export function selectTemplate(templateId, templateName, previewImage, defaultPrimary, defaultAccent) {
    smartUploadData.selectedTemplate = templateId;
    smartUploadData.selectedTemplateName = templateName;

    // Set default colors if not already customized
    if (!smartUploadData.colorsCustomized) {
        smartUploadData.primaryColor = defaultPrimary;
        smartUploadData.accentColor = defaultAccent;
        document.getElementById('cv-q-primary-color').value = defaultPrimary;
        document.getElementById('cv-q-accent-color').value = defaultAccent;
    }

    // Update template cards to show selection
    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('border-brand-gold', 'ring-2', 'ring-brand-gold/30');
        const checkmark = card.querySelector('.fa-check')?.parentElement;
        if (checkmark) checkmark.remove();
    });

    // Find and highlight selected card
    const selectedCard = document.querySelector(`.template-card[onclick*="'${templateId}'"]`);
    if (selectedCard) {
        selectedCard.classList.add('border-brand-gold', 'ring-2', 'ring-brand-gold/30');
        const imgContainer = selectedCard.querySelector('.aspect-\\[3\\/4\\]');
        if (imgContainer && !imgContainer.querySelector('.fa-check')) {
            const checkmark = document.createElement('div');
            checkmark.className = 'absolute top-2 right-2 w-8 h-8 bg-brand-gold rounded-full flex items-center justify-center';
            checkmark.innerHTML = '<i class="fas fa-check text-white"></i>';
            imgContainer.appendChild(checkmark);
        }
    }

    // Show preview container
    const previewContainer = document.getElementById('cv-q-template-preview-container');
    const previewName = document.getElementById('cv-q-selected-template-name');

    if (previewContainer) {
        previewContainer.classList.remove('hidden');
        if (previewName) previewName.textContent = templateName;

        // Update pdfme preview via iframe
        updatePdfmePreviewColors();
    }

    // Update next button state
    updateSmartNextButton();
}

// Set template color preset
export function setTemplateColor(type, color) {
    smartUploadData.colorsCustomized = true;

    if (type === 'primary') {
        smartUploadData.primaryColor = color;
        document.getElementById('cv-q-primary-color').value = color;
    } else {
        smartUploadData.accentColor = color;
        document.getElementById('cv-q-accent-color').value = color;
    }

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();
}

// Update colors from color picker
export function updateTemplateColors() {
    smartUploadData.colorsCustomized = true;
    smartUploadData.primaryColor = document.getElementById('cv-q-primary-color')?.value || '#1a3a5c';
    smartUploadData.accentColor = document.getElementById('cv-q-accent-color')?.value || '#d4912a';

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();
}

// Track if preview iframe is ready
let previewIframeReady = false;
let pendingColorUpdate = null;

// Listen for preview ready message
window.addEventListener('message', (event) => {
    if (event.data.type === 'previewReady') {
        previewIframeReady = true;
        // Send any pending color update
        if (pendingColorUpdate) {
            updatePdfmePreviewColors();
            pendingColorUpdate = null;
        }
    }
});

// Update pdfme preview with current colors via postMessage
function updatePdfmePreviewColors() {
    const iframe = document.getElementById('cv-q-preview-iframe');
    if (!iframe || !iframe.contentWindow) return;

    const message = {
        type: 'updateColors',
        primaryColor: smartUploadData.primaryColor,
        accentColor: smartUploadData.accentColor
    };

    if (previewIframeReady) {
        iframe.contentWindow.postMessage(message, '*');
    } else {
        // Queue the update until iframe is ready
        pendingColorUpdate = message;
    }
}

// Reset colors to template defaults
export function resetTemplateColors() {
    smartUploadData.colorsCustomized = false;

    // Reset to default colors
    smartUploadData.primaryColor = '#1a3a5c';
    smartUploadData.accentColor = '#d4912a';

    document.getElementById('cv-q-primary-color').value = '#1a3a5c';
    document.getElementById('cv-q-accent-color').value = '#d4912a';

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();

    showToast('Farben zurückgesetzt');
}

// ========== ADMIN TEMPLATE PREVIEW ==========

// Track admin preview iframe ready state
let adminPreviewIframeReady = false;

// Listen for admin preview ready message
window.addEventListener('message', (event) => {
    if (event.data.type === 'previewReady') {
        // Check if it's from the admin iframe
        const adminIframe = document.getElementById('admin-preview-iframe');
        if (adminIframe && event.source === adminIframe.contentWindow) {
            adminPreviewIframeReady = true;
        }
    }
});

// Update admin preview colors
export function updateAdminPreviewColors() {
    const primaryColor = document.getElementById('admin-primary-color')?.value || '#1a3a5c';
    const accentColor = document.getElementById('admin-accent-color')?.value || '#d4912a';

    // Update text inputs
    const primaryText = document.getElementById('admin-primary-color-text');
    const accentText = document.getElementById('admin-accent-color-text');
    if (primaryText) primaryText.value = primaryColor;
    if (accentText) accentText.value = accentColor;

    // Send to iframe
    const iframe = document.getElementById('admin-preview-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'updateColors',
            primaryColor: primaryColor,
            accentColor: accentColor
        }, '*');
    }
}

// Set admin preview preset colors
export function setAdminPreviewPreset(primary, accent) {
    document.getElementById('admin-primary-color').value = primary;
    document.getElementById('admin-accent-color').value = accent;
    document.getElementById('admin-primary-color-text').value = primary;
    document.getElementById('admin-accent-color-text').value = accent;

    updateAdminPreviewColors();
}

// Submit smart questionnaire
export async function submitSmartQuestionnaire() {
    if (!cvQuestionnaireProjectId) {
        showToast('Fehler: Projekt nicht gefunden');
        return;
    }

    showToast('Daten werden übermittelt...');

    try {
        // Prepare data
        const updateData = {
            mode: 'smart',
            questionnaire: {
                personal: {
                    fullName: smartUploadData.name,
                    email: smartUploadData.email,
                    targetRole: smartUploadData.targetRole,
                    linkedin: smartUploadData.linkedin || '',
                    links: smartUploadData.links || ''
                },
                additional: {
                    notes: smartUploadData.notes
                }
            },
            documents: {
                existingCv: {
                    url: smartUploadData.cvUrl,
                    filename: smartUploadData.cvFile?.name,
                    uploadedAt: serverTimestamp()
                }
            },
            status: 'data_received',
            updatedAt: serverTimestamp(),
            submittedAt: serverTimestamp()
        };

        // Add optional documents
        if (smartUploadData.jobUrl) {
            updateData.documents.targetJob = {
                url: smartUploadData.jobUrl,
                filename: smartUploadData.jobFile?.name,
                uploadedAt: serverTimestamp()
            };
        }

        if (smartUploadData.otherUrls.length > 0) {
            updateData.documents.otherDocuments = smartUploadData.otherUrls.map((url, i) => ({
                url,
                filename: smartUploadData.otherFiles[i]?.name,
                uploadedAt: new Date().toISOString()
            }));
        }

        // Add template selection
        if (smartUploadData.selectedTemplate) {
            updateData.templateSelection = {
                templateId: smartUploadData.selectedTemplate,
                templateName: smartUploadData.selectedTemplateName,
                selectedAt: serverTimestamp(),
                customization: {
                    primaryColor: smartUploadData.primaryColor,
                    accentColor: smartUploadData.accentColor
                }
            };
        }

        // Update Firestore
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), updateData);

        // Show success
        showSmartSubmitSuccess();

    } catch (e) {
        logger.error('Error submitting smart questionnaire:', e);
        showToast('Fehler beim Übermitteln: ' + e.message);
    }
}

// Show success message after smart submit
function showSmartSubmitSuccess() {
    const container = document.getElementById('cv-q-smart-mode');
    if (!container) return;

    container.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-8 text-center">
                <div class="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-check-circle text-green-500 text-5xl"></i>
                </div>
                <h2 class="font-serif text-2xl text-brand-dark mb-3">Vielen Dank!</h2>
                <p class="text-gray-500 mb-6">
                    Ihr Fragebogen wurde erfolgreich übermittelt. Unser Team wird sich umgehend an die Erstellung Ihres optimierten Lebenslaufs machen.
                </p>
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                    <h4 class="font-medium text-blue-800 mb-2 flex items-center gap-2">
                        <i class="fas fa-info-circle"></i>
                        Was passiert als Nächstes?
                    </h4>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Unsere KI analysiert Ihre Dokumente</li>
                        <li>• Ein Experte überprüft und optimiert Ihren CV</li>
                        <li>• Sie erhalten Ihren fertigen Lebenslauf per E-Mail</li>
                    </ul>
                </div>
                <a href="/" class="inline-flex items-center gap-2 px-6 py-3 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                    <i class="fas fa-home"></i>
                    Zur Startseite
                </a>
            </div>
        </div>
    `;
}

// Add event listeners for smart mode form inputs
export function initSmartModeListeners() {
    // Add input listeners for step 2 validation
    const fields = ['cv-q-smart-name', 'cv-q-smart-email', 'cv-q-smart-target-role', 'cv-q-smart-linkedin', 'cv-q-smart-links'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Remove existing listener first to avoid duplicates
            el.removeEventListener('input', updateSmartNextButton);
            el.addEventListener('input', updateSmartNextButton);
        }
    });
}

// Pre-fill form with existing data
function prefillQuestionnaireForm(data) {
    // Personal data
    if (data.personal) {
        setInputValue('cv-q-fullname', data.personal.fullName);
        setInputValue('cv-q-email', data.personal.email);
        setInputValue('cv-q-phone', data.personal.phone);
        setInputValue('cv-q-location', data.personal.location);
        setInputValue('cv-q-linkedin', data.personal.linkedin);
        setInputValue('cv-q-website', data.personal.website);
        setInputValue('cv-q-target-role', data.personal.targetRole);
        setInputValue('cv-q-career-goal', data.personal.careerGoal);
    }

    // Experience
    if (data.experience?.length > 0) {
        data.experience.forEach((exp, i) => {
            if (i > 0) addCvExperienceEntry();
            // Fields will be filled after entry is added
        });
    }

    // Skills
    if (data.skills) {
        setInputValue('cv-q-technical-skills', data.skills.technical?.join(', '));
        setInputValue('cv-q-soft-skills', data.skills.soft?.join(', '));
        setInputValue('cv-q-certifications', data.skills.certifications?.join(', '));
    }

    // Additional
    if (data.additional) {
        setInputValue('cv-q-summary', data.additional.summary);
        setInputValue('cv-q-strengths', data.additional.strengths);
        setInputValue('cv-q-industries', data.additional.industries?.join(', '));
        setInputValue('cv-q-availability', data.additional.availability);
        setInputValue('cv-q-additional-notes', data.additional.notes);
    }
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
}

// Navigate to next step
export function nextCvQuestionnaireStep() {
    if (cvQuestionnaireStep >= 5) return;

    // Save current step data
    saveCvQuestionnaireStepData();

    cvQuestionnaireStep++;
    updateCvQuestionnaireUI();

    // Auto-save
    autosaveCvQuestionnaire();
}

// Navigate to previous step
export function prevCvQuestionnaireStep() {
    if (cvQuestionnaireStep <= 1) return;

    saveCvQuestionnaireStepData();
    cvQuestionnaireStep--;
    updateCvQuestionnaireUI();
}

// Update UI based on current step
function updateCvQuestionnaireUI() {
    // Hide all steps
    document.querySelectorAll('.cv-q-step').forEach(el => el.classList.add('hidden'));

    // Show current step
    document.getElementById(`cv-q-step-${cvQuestionnaireStep}`)?.classList.remove('hidden');

    // Update progress
    const progress = (cvQuestionnaireStep / 5) * 100;
    document.getElementById('cv-q-current-step').textContent = cvQuestionnaireStep;
    document.getElementById('cv-q-progress-percent').textContent = `${progress}%`;
    document.getElementById('cv-q-progress-bar').style.width = `${progress}%`;

    // Update step labels
    const stepLabels = document.querySelectorAll('#view-cv-questionnaire .flex.justify-between.mt-3 span');
    stepLabels.forEach((label, i) => {
        if (i + 1 <= cvQuestionnaireStep) {
            label.classList.remove('text-gray-400');
            label.classList.add('text-brand-gold', 'font-medium');
        } else {
            label.classList.add('text-gray-400');
            label.classList.remove('text-brand-gold', 'font-medium');
        }
    });

    // Update buttons
    const prevBtn = document.getElementById('cv-q-prev-btn');
    const nextBtn = document.getElementById('cv-q-next-btn');
    const submitBtn = document.getElementById('cv-q-submit-btn');

    prevBtn.disabled = cvQuestionnaireStep === 1;

    if (cvQuestionnaireStep === 5) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

// Save current step data to cvQuestionnaireData
function saveCvQuestionnaireStepData() {
    switch (cvQuestionnaireStep) {
        case 1:
            cvQuestionnaireData.personal = {
                fullName: document.getElementById('cv-q-fullname')?.value || '',
                email: document.getElementById('cv-q-email')?.value || '',
                phone: document.getElementById('cv-q-phone')?.value || '',
                location: document.getElementById('cv-q-location')?.value || '',
                linkedin: document.getElementById('cv-q-linkedin')?.value || '',
                website: document.getElementById('cv-q-website')?.value || '',
                targetRole: document.getElementById('cv-q-target-role')?.value || '',
                careerGoal: document.getElementById('cv-q-career-goal')?.value || ''
            };
            break;

        case 2:
            cvQuestionnaireData.experience = collectExperienceEntries();
            break;

        case 3:
            cvQuestionnaireData.education = collectEducationEntries();
            break;

        case 4:
            cvQuestionnaireData.skills = {
                technical: parseCommaSeparated(document.getElementById('cv-q-technical-skills')?.value),
                soft: parseCommaSeparated(document.getElementById('cv-q-soft-skills')?.value),
                languages: collectLanguageEntries(),
                certifications: parseCommaSeparated(document.getElementById('cv-q-certifications')?.value)
            };
            break;

        case 5:
            cvQuestionnaireData.additional = {
                summary: document.getElementById('cv-q-summary')?.value || '',
                strengths: document.getElementById('cv-q-strengths')?.value || '',
                industries: parseCommaSeparated(document.getElementById('cv-q-industries')?.value),
                availability: document.getElementById('cv-q-availability')?.value || '',
                notes: document.getElementById('cv-q-additional-notes')?.value || ''
            };
            break;
    }
}

function parseCommaSeparated(str) {
    if (!str) return [];
    return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// Add experience entry
export function addCvExperienceEntry() {
    const container = document.getElementById('cv-q-experience-list');
    if (!container) return;

    const entryId = `exp-${experienceCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="bg-gray-50 rounded-xl p-4 relative">
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-times"></i>
            </button>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unternehmen *</label>
                    <input type="text" class="exp-company w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Firma GmbH">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                    <input type="text" class="exp-role w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Senior Manager">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Von</label>
                    <input type="month" class="exp-start w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                    <div class="flex items-center gap-2">
                        <input type="month" class="exp-end flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                        <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                            <input type="checkbox" class="exp-current rounded text-brand-gold">
                            Aktuell
                        </label>
                    </div>
                </div>
            </div>

            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea class="exp-description w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none" rows="2"
                          placeholder="Hauptverantwortlichkeiten und Tätigkeiten..."></textarea>
            </div>

            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Erfolge & Achievements</label>
                <textarea class="exp-achievements w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none" rows="2"
                          placeholder="z.B. Umsatzsteigerung um 20%, Teamaufbau von 5 auf 15 Mitarbeiter... (eines pro Zeile)"></textarea>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Add education entry
export function addCvEducationEntry() {
    const container = document.getElementById('cv-q-education-list');
    if (!container) return;

    const entryId = `edu-${educationCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="bg-gray-50 rounded-xl p-4 relative">
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-times"></i>
            </button>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Institution *</label>
                    <input type="text" class="edu-institution w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Universität / Hochschule">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Abschluss</label>
                    <input type="text" class="edu-degree w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Bachelor, Master, Diplom">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fachrichtung</label>
                    <input type="text" class="edu-field w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Betriebswirtschaft">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Von</label>
                    <input type="month" class="edu-start w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                    <input type="month" class="edu-end w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" class="edu-grade w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. 1,5">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Schwerpunkte</label>
                    <input type="text" class="edu-highlights w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Finance, Marketing">
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Add language entry
export function addCvLanguageEntry() {
    const container = document.getElementById('cv-q-languages-list');
    if (!container) return;

    const entryId = `lang-${languageCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="flex items-center gap-2">
            <input type="text" class="lang-name flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                   placeholder="Sprache">
            <select class="lang-level border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold bg-white">
                <option value="">Niveau</option>
                <option value="Muttersprache">Muttersprache</option>
                <option value="Verhandlungssicher (C2)">Verhandlungssicher (C2)</option>
                <option value="Fließend (C1)">Fließend (C1)</option>
                <option value="Fortgeschritten (B2)">Fortgeschritten (B2)</option>
                <option value="Mittelstufe (B1)">Mittelstufe (B1)</option>
                <option value="Grundkenntnisse (A1-A2)">Grundkenntnisse (A1-A2)</option>
            </select>
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="text-gray-400 hover:text-red-500 transition p-1">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Remove entry
export function removeCvEntry(entryId) {
    document.getElementById(entryId)?.remove();
}

// Collect all experience entries
function collectExperienceEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-experience-list > div').forEach(entry => {
        entries.push({
            company: entry.querySelector('.exp-company')?.value || '',
            role: entry.querySelector('.exp-role')?.value || '',
            startDate: entry.querySelector('.exp-start')?.value || '',
            endDate: entry.querySelector('.exp-current')?.checked ? 'heute' : (entry.querySelector('.exp-end')?.value || ''),
            description: entry.querySelector('.exp-description')?.value || '',
            achievements: (entry.querySelector('.exp-achievements')?.value || '').split('\n').filter(a => a.trim())
        });
    });
    return entries;
}

// Collect all education entries
function collectEducationEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-education-list > div').forEach(entry => {
        entries.push({
            institution: entry.querySelector('.edu-institution')?.value || '',
            degree: entry.querySelector('.edu-degree')?.value || '',
            field: entry.querySelector('.edu-field')?.value || '',
            startDate: entry.querySelector('.edu-start')?.value || '',
            endDate: entry.querySelector('.edu-end')?.value || '',
            grade: entry.querySelector('.edu-grade')?.value || '',
            highlights: entry.querySelector('.edu-highlights')?.value || ''
        });
    });
    return entries;
}

// Collect all language entries
function collectLanguageEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-languages-list > div').forEach(entry => {
        const name = entry.querySelector('.lang-name')?.value || '';
        const level = entry.querySelector('.lang-level')?.value || '';
        if (name) {
            entries.push({ language: name, level: level });
        }
    });
    return entries;
}

// Autosave questionnaire data
async function autosaveCvQuestionnaire() {
    if (!cvQuestionnaireProjectId) return;

    const statusEl = document.getElementById('cv-q-autosave-status');
    if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Speichern...';
    }

    try {
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), {
            questionnaire: cvQuestionnaireData,
            updatedAt: serverTimestamp()
        });

        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check text-green-500"></i> Gespeichert';
            setTimeout(() => {
                statusEl.innerHTML = '<i class="fas fa-cloud"></i> Fortschritt wird automatisch gespeichert';
            }, 2000);
        }
    } catch (e) {
        logger.error('Error autosaving questionnaire:', e);
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500"></i> Speichern fehlgeschlagen';
        }
    }
}

// Handle document upload
export async function handleCvDocumentUpload(docType, input) {
    const file = input.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showToast('Datei zu groß (max. 10MB)');
        return;
    }

    const filenameEl = document.getElementById(`cv-q-${docType === 'existingCv' ? 'existing-cv' : 'target-job'}-filename`);
    const uploadEl = document.getElementById(`cv-q-${docType === 'existingCv' ? 'existing-cv' : 'target-job'}-upload`);

    try {
        // Show uploading state
        if (uploadEl) {
            uploadEl.innerHTML = `
                <i class="fas fa-spinner fa-spin text-2xl text-brand-gold mb-2"></i>
                <p class="text-sm text-gray-500">Wird hochgeladen...</p>
            `;
        }

        // Upload to Firebase Storage
        const storageRef = ref(storage, `cv-documents/${cvQuestionnaireProjectId}/${docType}/${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Store in questionnaire data
        cvQuestionnaireData.documents[docType] = {
            url: downloadUrl,
            filename: file.name,
            uploadedAt: new Date().toISOString()
        };

        // Update UI
        if (filenameEl) {
            filenameEl.textContent = `✓ ${file.name}`;
            filenameEl.classList.remove('hidden');
        }
        if (uploadEl) {
            uploadEl.innerHTML = `
                <i class="fas fa-check-circle text-2xl text-green-500 mb-2"></i>
                <p class="text-sm text-gray-500">${file.name}</p>
            `;
        }

        // Autosave
        autosaveCvQuestionnaire();

        showToast('Datei hochgeladen');
    } catch (e) {
        logger.error('Error uploading document:', e);
        showToast('Fehler beim Hochladen');

        // Reset UI
        if (uploadEl) {
            const icon = docType === 'existingCv' ? 'fa-file-pdf' : 'fa-briefcase';
            const text = docType === 'existingCv' ? 'PDF oder Word hochladen' : 'PDF, Word oder Screenshot';
            uploadEl.innerHTML = `
                <i class="fas ${icon} text-2xl text-gray-400 mb-2"></i>
                <p class="text-sm text-gray-500">${text}</p>
            `;
        }
    }
}

// Submit questionnaire
export async function submitCvQuestionnaire() {
    // Save final step data
    saveCvQuestionnaireStepData();

    // Validate required fields
    if (!cvQuestionnaireData.personal.fullName || !cvQuestionnaireData.personal.email) {
        showToast('Bitte Name und E-Mail ausfüllen');
        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
        return;
    }

    if (!cvQuestionnaireData.personal.targetRole) {
        showToast('Bitte gewünschte Position angeben');
        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
        return;
    }

    try {
        showToast('Fragebogen wird gesendet...');

        // Update Firestore
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), {
            questionnaire: cvQuestionnaireData,
            status: 'data_received',
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Show success message
        const container = document.getElementById('view-cv-questionnaire');
        if (container) {
            container.innerHTML = `
                <div class="max-w-lg mx-auto px-4 py-20 text-center">
                    <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-check text-4xl text-green-600"></i>
                    </div>
                    <h1 class="font-serif text-2xl text-brand-dark mb-4">Vielen Dank!</h1>
                    <p class="text-gray-600 mb-6">
                        Ihr Fragebogen wurde erfolgreich übermittelt. Unser Team wird sich umgehend an die Erstellung Ihres optimierten Lebenslaufs machen.
                    </p>
                    <p class="text-sm text-gray-500 mb-8">
                        Sie erhalten eine Benachrichtigung per E-Mail, sobald Ihr Lebenslauf fertig ist.
                    </p>
                    <a href="/" class="inline-flex items-center gap-2 px-6 py-3 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        <i class="fas fa-home"></i>
                        Zur Startseite
                    </a>
                </div>
            `;
        }

    } catch (e) {
        logger.error('Error submitting questionnaire:', e);
        showToast('Fehler beim Senden. Bitte versuchen Sie es erneut.');
    }
}

// Hide all views helper
function hideAllViews() {
    document.querySelectorAll('[id^="view-"]').forEach(view => {
        view.classList.add('hidden');
    });
}

