// APEX Executive - Application Module v2.1
// Contains: Auth, Cart, Dashboard, Coaches, Articles, Data, Password Reset

// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage, navigateTo } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, reload, applyActionCode } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
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

// Production Logger - suppresses logs in production
const logger = {
    log: (...args) => { if (!IS_PRODUCTION) console.log(...args); },
    warn: (...args) => { if (!IS_PRODUCTION) console.warn(...args); },
    error: (...args) => console.error(...args), // Always log errors
    debug: (...args) => { if (!IS_PRODUCTION) console.debug(...args); }
};

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

export function updateAuthUI(state) {
    const loginBtn = document.getElementById('nav-login-btn');
    const userProfile = document.getElementById('nav-user-profile');
    const dashUsername = document.getElementById('dash-username');
    const userNameDisplay = document.getElementById('user-name-display');

    if (state.user) {
        loginBtn?.classList.add('hidden');
        userProfile?.classList.remove('hidden');
        userProfile?.classList.add('flex');

        const displayName = state.user.displayName || state.user.email.split('@')[0];
        if(dashUsername) dashUsername.textContent = displayName;
        if(userNameDisplay) userNameDisplay.textContent = displayName.substring(0, 12) + (displayName.length > 12 ? '...' : '');

        // Load profile picture if available
        loadProfilePicture(state);
    } else {
        loginBtn?.classList.remove('hidden');
        userProfile?.classList.add('hidden');
        userProfile?.classList.remove('flex');
    }
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

        // Sortiere nach Datum (client-side, um Index-Probleme zu vermeiden)
        orders.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

        renderOrders(orders);

        // Update Dashboard Stats
        updateDashboardStats(orders);

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

    container.innerHTML = orders.map(order => {
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

        return `
            <div class="p-5 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                <!-- Order Header -->
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="text-xs text-gray-400 font-mono">${shortOrderId}</span>
                        <h4 class="font-bold text-brand-dark mt-1">${order.items?.map(i => sanitizeHTML(i.title)).join(', ') || 'Bestellung'}</h4>
                        <p class="text-xs text-gray-500 mt-1"><i class="far fa-calendar-alt mr-1"></i>${date}</p>
                    </div>
                    <div class="text-right">
                        <span class="font-serif text-xl text-brand-dark block">€${(order.total || 0).toFixed(2)}</span>
                    </div>
                </div>

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

                <!-- Actions -->
                ${hasCoach && !hasAppointment ? `
                    <button onclick="app.showAppointmentCalendar('${order.id}')" class="w-full bg-brand-gold/10 text-brand-dark font-bold text-sm py-3 px-4 rounded-lg hover:bg-brand-gold/20 transition flex items-center justify-center gap-2">
                        <i class="fas fa-calendar-alt"></i>
                        Coach-Termin buchen
                    </button>
                ` : hasAppointment ? `
                    <div class="bg-green-50 border border-green-200 px-4 py-3 rounded-lg flex items-center gap-3">
                        <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-check text-green-600"></i>
                        </div>
                        <div>
                            <span class="text-xs text-green-600 font-bold uppercase">Termin gebucht</span>
                            <p class="text-sm text-gray-700 font-medium">${new Date(order.appointment.datetime).toLocaleString('de-DE', {
                                weekday: 'long',
                                day: '2-digit',
                                month: 'long',
                                hour: '2-digit',
                                minute: '2-digit'
                            })} Uhr</p>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    if (badge) badge.textContent = orders.length.toString();
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
    return order.items && order.items.some(item => item.title && item.title.includes('Session:'));
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
    const times = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

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
        const availDoc = await getDoc(doc(db, "availability", state.user.uid));
        if (availDoc.exists()) {
            const data = availDoc.data();
            const slots = data.slots || [];

            if (slots.length > 0) {
                // Filter nur zukünftige Termine
                const now = new Date();
                const futureSlots = slots.filter(slot => new Date(slot.datetime) >= now);

                if (futureSlots.length > 0) {
                    container.innerHTML = `
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                                <i class="fas fa-clock text-brand-gold mr-2"></i>
                                Ihre Wunschtermine
                            </h3>
                            ${futureSlots.map((slot, index) => {
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
                            ${data.notes ? `
                                <div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                    <i class="fas fa-info-circle mr-2"></i>
                                    <strong>Hinweis:</strong> ${data.notes}
                                </div>
                            ` : ''}
                        </div>
                    `;
                    return;
                }
            }
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
        return '<div class="group bg-white rounded-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:border-brand-gold/30 transition-all duration-300 cursor-pointer"><div class="relative h-24 bg-brand-dark overflow-hidden"><div class="absolute inset-0 bg-brand-gold/10"></div></div><div class="px-6 pb-6 relative"><div class="-mt-12 mb-4"><img src="' + coach.image + '" class="w-20 h-20 rounded-sm object-cover border-4 border-white shadow-md" alt="' + name + '" loading="lazy"></div><div onclick="app.openCoachDetail(\'' + coach.id + '\')"><h4 class="font-serif text-lg text-brand-dark font-bold hover:text-brand-gold transition cursor-pointer">' + name + '</h4><p class="text-xs text-brand-gold font-bold uppercase tracking-widest mt-1">' + role + '</p></div><div class="mt-4 pt-4 border-t flex justify-between items-center"><div class="text-xs text-gray-500">' + experience + ' Erfahrung</div><div class="flex gap-2"><button onclick="app.openCoachDetail(\'' + coach.id + '\')" class="text-gray-400 hover:text-brand-dark transition" aria-label="Mentor-Details ansehen"><i class="far fa-eye text-lg" aria-hidden="true"></i></button><button onclick="app.addToCart(\'Executive Mentoring - Single Session\', 350)" class="text-brand-dark hover:text-brand-gold transition" aria-label="Session buchen"><i class="fas fa-plus-circle text-lg" aria-hidden="true"></i></button></div></div></div></div>';
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
}

// Switch Admin Panel Tabs
export function switchAdminTab(tabName) {
    // Tab names: orders, users, strategy, coaches, documents, settings
    const tabIds = ['orders', 'users', 'strategy', 'coaches', 'documents', 'settings'];

    // Update tab buttons
    tabIds.forEach(id => {
        const tabBtn = document.getElementById(`admin-tab-${id}`);
        const content = document.getElementById(`admin-content-${id}`);

        if (tabBtn) {
            if (id === tabName) {
                // Active tab styling
                tabBtn.classList.add('text-brand-dark', 'border-brand-gold');
                tabBtn.classList.remove('text-gray-400', 'border-transparent');
            } else {
                // Inactive tab styling
                tabBtn.classList.remove('text-brand-dark', 'border-brand-gold');
                tabBtn.classList.add('text-gray-400', 'border-transparent');
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
    }
}

// Load coaches for admin panel
export async function loadAdminCoaches() {
    const container = document.getElementById('admin-coaches-list');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-400">Lade Mentoren...</p>';

    try {
        const coaches = await fetchCollection('coaches');

        if (coaches.length === 0) {
            container.innerHTML = '<p class="text-gray-400">Keine Mentoren gefunden.</p>';
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
            <div class="bg-brand-dark/50 rounded-lg p-4 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <img src="${coach.image || 'https://via.placeholder.com/50'}"
                         alt="${coach.name}"
                         class="w-12 h-12 rounded-full object-cover">
                    <div>
                        <h4 class="font-bold text-white">${coach.name}</h4>
                        <p class="text-sm text-gray-400">${coach.role || ''}</p>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm ${coach.visible !== false ? 'text-green-400' : 'text-red-400'}">
                        ${coach.visible !== false ? 'Sichtbar' : 'Versteckt'}
                    </span>
                    <button onclick="app.toggleCoachVisibility('${coach.id}')"
                            class="px-4 py-2 text-sm rounded ${coach.visible !== false ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'} transition">
                        ${coach.visible !== false ? 'Verstecken' : 'Anzeigen'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        logger.error('Error loading admin coaches:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Mentoren.</p>';
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
            <div class="bg-white p-12 rounded-sm shadow-sm text-center text-gray-400">
                <i class="fas fa-inbox text-3xl mb-4"></i>
                <p>Keine Bestellungen gefunden</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Unbekannt';

        const statusColors = {
            processing: 'bg-yellow-100 text-yellow-800',
            confirmed: 'bg-blue-100 text-blue-800',
            completed: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };

        const items = order.items?.map(item => `${item.title} (€${item.price})`).join(', ') || 'Keine Produkte';

        return `
            <div class="bg-white rounded-sm shadow-sm overflow-hidden" data-order-id="${order.id}">
                <div class="p-6">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div>
                            <p class="font-mono text-xs text-gray-400 mb-1">#${order.id.substring(0, 8).toUpperCase()}</p>
                            <p class="font-bold text-brand-dark">${sanitizeHTML(order.customerName || 'Unbekannt')}</p>
                            <p class="text-sm text-gray-500">${sanitizeHTML(order.customerEmail || 'Keine Email')}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs text-gray-400 mb-1">${date}</p>
                            <p class="text-xl font-serif text-brand-dark">€${(order.total || 0).toLocaleString('de-DE')}</p>
                        </div>
                    </div>

                    <div class="border-t border-gray-100 pt-4 mb-4">
                        <p class="text-sm text-gray-600"><strong>Produkte:</strong> ${sanitizeHTML(items)}</p>
                    </div>

                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <span class="text-sm text-gray-500">Status:</span>
                            <select onchange="app.updateOrderStatus('${order.id}', this.value)"
                                    class="border border-gray-200 rounded-sm px-3 py-1 text-sm focus:outline-none focus:border-brand-gold ${statusColors[order.status] || ''}">
                                <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>In Bearbeitung</option>
                                <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Bestätigt</option>
                                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
                                <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Storniert</option>
                            </select>
                        </div>

                        <div class="flex items-center gap-2">
                            <label class="cursor-pointer bg-brand-gold text-brand-dark px-4 py-2 rounded-sm text-xs font-bold uppercase hover:bg-yellow-500 transition">
                                <i class="fas fa-upload mr-2"></i>Dokument hochladen
                                <input type="file" class="hidden" accept=".pdf,.doc,.docx"
                                       onchange="app.uploadDocumentToUser('${order.userId}', '${order.id}', this.files[0])">
                            </label>
                        </div>
                    </div>

                    <!-- Uploaded Documents -->
                    <div id="docs-${order.id}" class="mt-4 border-t border-gray-100 pt-4">
                        <p class="text-xs text-gray-400 uppercase tracking-wider mb-2">Hochgeladene Dokumente</p>
                        <div id="doc-list-${order.id}" class="space-y-2">
                            <p class="text-xs text-gray-400 italic">Lade Dokumente...</p>
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
    const container = document.getElementById(`doc-list-${orderId}`);
    if (!container || !storage) return;

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");
        const listRef = ref(storage, `delivered/${userId}`);
        const result = await listAll(listRef);

        if (result.items.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 italic">Noch keine Dokumente hochgeladen</p>';
            return;
        }

        const docs = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            return { name: item.name, url };
        }));

        container.innerHTML = docs.map(d => `
            <a href="${d.url}" target="_blank" class="flex items-center gap-2 text-sm text-brand-gold hover:text-brand-dark transition">
                <i class="fas fa-file-pdf"></i>
                <span>${sanitizeHTML(d.name)}</span>
                <i class="fas fa-external-link-alt text-xs"></i>
            </a>
        `).join('');

    } catch (e) {
        logger.error('Failed to load documents:', e);
        container.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden</p>';
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

export async function uploadDocumentToUser(userId, orderId, file) {
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
                    <i class="fas fa-file-download text-3xl text-gray-300 mb-3"></i>
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
        const addonName = cb.name === 'addon-interview' ? 'Interview-Simulation (60 Min.)' : 'Zeugnis-Analyse';
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

        // Speichere für Export
        window._adminUsers = users;

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

        container.innerHTML = users.map(user => `
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
        `).join('');
    } catch (e) {
        logger.error('Error loading users:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Benutzer.</p>';
    }
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

        container.innerHTML = calls.map(call => `
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
        `).join('');
    } catch (e) {
        logger.error('Error loading strategy calls:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Anfragen.</p>';
    }
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

