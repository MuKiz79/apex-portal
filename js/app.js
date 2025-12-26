// APEX Executive - Application Module
// Contains: Auth, Cart, Dashboard, Coaches, Articles, Data

// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage, navigateTo } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { validateEmail, validatePassword, getFirebaseErrorMessage, showToast, sanitizeHTML, validateEmailRealtime, validatePasswordMatch, saveCartToLocalStorage, loadCartFromLocalStorage } from './core.js';
import { sampleArticles } from './data.js';

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

            if (!userCredential.user.emailVerified) {
                await signOut(auth);
                throw new Error("Bitte bestätigen Sie erst Ihre E-Mail-Adresse.");
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
                url: window.location.origin + '/index-modular.html',
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
        console.error('Failed to load profile picture:', e);
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
    }

    // Entferne existierende Items aus derselben Kategorie
    if (category === 'cv-package') {
        // Entferne alle CV-Pakete (Young, Senior, Executive)
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
        // Komplettpaket ersetzt ALLES (CV + Mentoring)
        state.cart = state.cart.filter(item =>
            !item.title.includes('CV') &&
            !item.title.includes('Executive Mentoring') &&
            !item.title.includes('Session') &&
            !item.title.includes('Retainer')
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
    } else {
        showToast('✅ Zur Auswahl hinzugefügt');
    }
}

export function removeFromCart(state, id) {
    state.cart = state.cart.filter(x => x.id !== id);
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
                    <span class="font-bold text-sm block">${item.title}</span>
                    <span class="text-xs text-gray-500">€${item.price}</span>
                </div>
                <button onclick="app.removeFromCart(${item.id})" class="text-red-500 hover:text-red-700 ml-4" aria-label="Artikel entfernen">
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
        console.error("Stripe Checkout failed:", e);
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
        console.error('Profile picture upload failed:', e);
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
        console.log('🔍 Loading orders for user:', state.user.uid, 'Email:', state.user.email);

        // Versuche zuerst mit userId
        let ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid)
        );

        let snapshot = await getDocs(ordersQuery);
        console.log('📦 Orders found by userId:', snapshot.size);

        // Falls keine Bestellungen gefunden, versuche auch mit customerEmail
        if (snapshot.empty && state.user.email) {
            console.log('🔍 Trying with customerEmail:', state.user.email);
            ordersQuery = query(
                collection(db, "orders"),
                where("customerEmail", "==", state.user.email)
            );
            snapshot = await getDocs(ordersQuery);
            console.log('📦 Orders found by email:', snapshot.size);
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
        console.error('Failed to load orders:', e);
        renderOrders([]);
    }
}

function updateDashboardStats(orders) {
    // Update order count in stats
    const orderCountEl = document.getElementById('stat-orders-count');
    if (orderCountEl) {
        orderCountEl.textContent = orders.length;
    }

    // Count documents (placeholder - would need real document count)
    const docCountEl = document.getElementById('stat-documents-count');
    if (docCountEl) {
        const docCount = orders.filter(o => o.items?.some(i =>
            i.title?.toLowerCase().includes('cv') ||
            i.title?.toLowerCase().includes('lebenslauf')
        )).length;
        docCountEl.textContent = docCount;
    }

    // Count appointments
    const appointmentCountEl = document.getElementById('stat-appointments-count');
    if (appointmentCountEl) {
        const appointmentCount = orders.filter(o => o.appointment?.datetime).length;
        appointmentCountEl.textContent = appointmentCount;
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
        console.error('Appointment booking failed:', e);
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
        console.error('Availability save failed:', e);
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

    try {
        const availDoc = await getDoc(doc(db, "availability", state.user.uid));
        if (availDoc.exists()) {
            const data = availDoc.data();
            // Could display saved availability if needed
            console.log('Saved availability:', data);
        }
    } catch (e) {
        console.error('Failed to load availability:', e);
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
        console.error('Upload error:', e);
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
    // Load coaches from Firestore ONLY (no fallback to sample data)
    const dbCoaches = await fetchCollection('coaches');
    state.coaches = dbCoaches;
    console.log('✅ Loaded', dbCoaches.length, 'coaches from Firestore');
    filterCoaches(state);

    // Load articles from Firestore and fill up to minimum 3 with sample data
    const dbArticles = await fetchCollection('articles');
    const MIN_ARTICLES = 3;

    if(dbArticles.length >= MIN_ARTICLES) {
        // Genug echte Artikel vorhanden
        state.articles = dbArticles;
        console.log('✅ Loaded', dbArticles.length, 'articles from Firestore');
    } else {
        // Auffüllen mit Sample-Artikeln bis mindestens 3
        const neededSamples = MIN_ARTICLES - dbArticles.length;
        const fillArticles = sampleArticles.slice(0, neededSamples);
        state.articles = [...dbArticles, ...fillArticles];
        console.log(`✅ Loaded ${dbArticles.length} real + ${fillArticles.length} sample articles (total: ${state.articles.length})`);
    }
    renderArticles(state);
}

export async function fetchCollection(colName) {
    if(!db) {
        console.error('❌ Firestore (db) ist nicht initialisiert!');
        return [];
    }
    try {
        console.log('🔄 Lade Collection:', colName);
        const snap = await getDocs(collection(db, colName));
        console.log('✅ Collection geladen:', colName, '- Anzahl:', snap.docs.length);
        return snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } catch(e) {
        console.error('❌ Failed to fetch ' + colName + ':', e);
        return [];
    }
}

export function filterCoaches(state) {
    const grid = document.getElementById('coach-grid');
    if(!grid) return;

    const filterSelect = document.getElementById('industry-filter');
    const filter = filterSelect?.value || 'all';

    const filteredCoaches = filter === 'all' ? state.coaches : state.coaches.filter(c => c.industry === filter);

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
    try {
        if (!db) {
            console.warn('Firestore not available, using default image');
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
                    console.log('✅ About image loaded from Firestore');
                };
                preloadImg.onerror = () => {
                    imgElement.style.opacity = '1';
                    console.warn('Failed to preload about image');
                };
                preloadImg.src = imageUrl;
            } else {
                imgElement.style.opacity = '1';
            }
        } else {
            imgElement.style.opacity = '1';
            console.log('No about image in Firestore, using default');
        }
    } catch (error) {
        console.error('Error loading about image:', error);
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
        console.error('Error updating about image:', error);
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
        console.error('Error uploading about image:', error);
        showToast('❌ ' + error.message, 'error');
        throw error;
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
        console.error('Error submitting waitlist:', error);
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
                <span class="text-sm text-gray-700">${item.title}</span>
                <span class="text-sm font-bold text-brand-dark">€${item.price.toFixed(2)}</span>
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
                    console.error('Registration error:', error);
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
                    console.error('Login error:', error);
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

export function switchDashboardTab(tabName) {
    // Get all tabs and tab contents
    const tabs = document.querySelectorAll('.dashboard-tab');
    const contents = document.querySelectorAll('.dashboard-tab-content');

    // Remove active class from all tabs
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });

    // Hide all tab contents
    contents.forEach(content => {
        content.classList.add('hidden');
    });

    // Find and activate the clicked tab
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    // Show the selected tab content
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
        // Add animation class
        activeContent.classList.add('tab-content');
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
        console.error('Error saving profile:', error);
        showToast('❌ Fehler beim Speichern. Bitte versuchen Sie es erneut.', 'error');
    }
}

export async function changePassword(state) {
    const currentPassword = document.getElementById('current-password')?.value || '';
    const newPassword = document.getElementById('new-password')?.value || '';
    const confirmPassword = document.getElementById('confirm-new-password')?.value || '';

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
        console.error('Error changing password:', error);
        if (error.code === 'auth/wrong-password') {
            showToast('❌ Das aktuelle Passwort ist falsch.', 'error');
        } else {
            showToast('❌ Fehler beim Ändern des Passworts.', 'error');
        }
    }
}
