// APEX Executive - Application Module
// Contains: Auth, Cart, Dashboard, Coaches, Articles, Data

// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { validateEmail, validatePassword, getFirebaseErrorMessage, showToast, sanitizeHTML, validateEmailRealtime, validatePasswordMatch, saveCartToLocalStorage, loadCartFromLocalStorage } from './core.js';

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
    } else {
        loginBtn?.classList.remove('hidden');
        userProfile?.classList.add('hidden');
        userProfile?.classList.remove('flex');
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
    state.cart.push({
        title: sanitizeHTML(title),
        price,
        id: Date.now()
    });

    updateCartUI(state);
    saveCartToLocalStorage(state.cart);
    showToast('✅ Zur Auswahl hinzugefügt');
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

    if(!state.user) {
        showToast('⚠️ Bitte melden Sie sich zuerst an', 3000);
        toggleCart();
        navigateTo('login');
        return;
    }

    const subtotal = state.cart.reduce((sum, item) => sum + item.price, 0);
    const discount = Math.round(subtotal * 0.10 * 100) / 100;
    const total = subtotal - discount;

    const confirmMessage = `Ihre Bestellung:\n\nZwischensumme: €${subtotal.toFixed(2)}\nMitglieder-Rabatt (10%): -€${discount.toFixed(2)}\n────────────────\nGesamt: €${total.toFixed(2)}\n\nJetzt kostenpflichtig bestellen?`;

    if (!confirm(confirmMessage)) return;

    if(db) {
        try {
            await addDoc(collection(db, "orders"), {
                userId: state.user.uid,
                items: state.cart,
                subtotal: subtotal,
                discount: discount,
                total: total,
                status: 'processing',
                date: new Date()
            });

            toggleCart();
            showToast(`✅ Bestellung erfolgreich! Sie haben €${discount.toFixed(2)} gespart.`, 4000);

            state.cart = [];
            updateCartUI(state);
            saveCartToLocalStorage([]);

            navigateTo('dashboard');
            setTimeout(() => loadUserOrders(state), 500);
            return;
        } catch(e) {
            console.error("Order save failed:", e);
            showToast('❌ Bestellung fehlgeschlagen', 3000);
            return;
        }
    }

    // Demo Mode
    toggleCart();
    alert(`Vielen Dank für Ihre Bestellung!\n\nSie haben €${discount.toFixed(2)} durch Ihren Mitglieder-Rabatt gespart.\n\nWir werden uns in Kürze bei Ihnen melden.`);
    state.cart = [];
    updateCartUI(state);
    saveCartToLocalStorage([]);
    navigateTo('dashboard');
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
        if (storage && state.user) {
            const storageRef = ref(storage, `profile-pictures/${state.user.uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            document.getElementById('profile-picture').src = url;

            await updateDoc(doc(db, "users", state.user.uid), {
                profilePicture: url
            });

            showToast('✅ Profilbild aktualisiert');
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profile-picture').src = e.target.result;
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

    try {
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid),
            orderBy("date", "desc")
        );

        const snapshot = await getDocs(ordersQuery);
        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderOrders(orders);
    } catch (e) {
        console.error('Failed to load orders:', e);
        renderOrders([]);
    }
}

export function renderOrders(orders) {
    const container = document.getElementById('orders-list');
    const badge = document.getElementById('order-count-badge');

    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-4xl mb-3 text-gray-300" aria-hidden="true"></i><p class="text-sm">Noch keine Bestellungen</p><button onclick="app.navigateToSection('home', 'cv-packages')" class="mt-4 text-brand-gold font-bold text-xs uppercase hover:underline">Pakete ansehen</button></div>`;
        if (badge) badge.textContent = '0';
        return;
    }

    container.innerHTML = orders.map(order => {
        const date = order.date?.seconds ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE') : 'Unbekannt';
        const hasCoach = hasCoachSession(order);
        const hasAppointment = order.appointment?.datetime;

        return `<div class="border-b pb-4 mb-4 last:border-0"><div class="flex justify-between items-start"><div class="flex-1"><h4 class="font-bold text-sm mb-1">${order.items.map(i => sanitizeHTML(i.title)).join(', ')}</h4><p class="text-xs text-gray-500">${date}</p>${order.discount ? `<div class="text-xs text-green-600 mt-1"><i class="fas fa-tag mr-1" aria-hidden="true"></i>Mitglieder-Rabatt: -€${order.discount.toFixed(2)}</div>` : ''}</div><div class="text-right"><span class="font-serif text-lg block">€${order.total || 0}</span><span class="inline-block text-xs px-2 py-1 rounded ${order.status === 'completed' ? 'bg-green-100 text-green-700' : order.status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}">${getOrderStatusText(order.status || 'processing')}</span></div></div>${hasCoach && !hasAppointment ? `<button onclick="app.showAppointmentCalendar('${order.id}')" class="mt-3 text-brand-gold text-xs font-bold hover:underline flex items-center gap-1"><i class="fas fa-calendar-alt" aria-hidden="true"></i> Termin buchen</button>` : hasAppointment ? `<div class="mt-3 bg-green-50 border border-green-200 px-3 py-2 rounded text-xs"><i class="fas fa-check-circle text-green-600 mr-1" aria-hidden="true"></i><strong>Termin gebucht:</strong> ${new Date(order.appointment.datetime).toLocaleString('de-DE', {weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}</div>` : ''}</div>`;
    }).join('');

    if (badge) badge.textContent = orders.length.toString();
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
    const dbCoaches = await fetchCollection('coaches');
    if(dbCoaches.length > 0) state.coaches = dbCoaches;
    filterCoaches(state);

    const dbArticles = await fetchCollection('articles');
    if(dbArticles.length > 0) state.articles = dbArticles;
    renderArticles(state);
}

export async function fetchCollection(colName) {
    if(!db) return [];
    try {
        const snap = await getDocs(collection(db, colName));
        return snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } catch(e) {
        console.error('Failed to fetch ' + colName + ':', e);
        return [];
    }
}

export function filterCoaches(state) {
    const grid = document.getElementById('coach-grid');
    if(!grid) return;

    const filterSelect = document.getElementById('industry-filter');
    const filter = filterSelect?.value || 'all';

    const filteredCoaches = filter === 'all' ? state.coaches : state.coaches.filter(c => c.industry === filter);

    grid.innerHTML = filteredCoaches.map(coach => {
        const name = sanitizeHTML(coach.name);
        const role = sanitizeHTML(coach.role);
        return '<div class="group bg-white rounded-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:border-brand-gold/30 transition-all duration-300 cursor-pointer"><div class="relative h-24 bg-brand-dark overflow-hidden"><div class="absolute inset-0 bg-brand-gold/10"></div></div><div class="px-6 pb-6 relative"><div class="-mt-12 mb-4"><img src="' + coach.image + '" class="w-20 h-20 rounded-sm object-cover border-4 border-white shadow-md" alt="' + name + '" loading="lazy"></div><div onclick="app.openCoachDetail(\'' + coach.id + '\')"><h4 class="font-serif text-lg text-brand-dark font-bold hover:text-brand-gold transition cursor-pointer">' + name + '</h4><p class="text-xs text-brand-gold font-bold uppercase tracking-widest mt-1">' + role + '</p></div><div class="mt-4 pt-4 border-t flex justify-between items-center"><div class="text-xs text-gray-400 font-bold uppercase tracking-wide">€' + (coach.price || 350) + ' / Std</div><div class="flex gap-2"><button onclick="app.openCoachDetail(\'' + coach.id + '\')" class="text-gray-400 hover:text-brand-dark transition" aria-label="Coach-Details ansehen"><i class="far fa-eye text-lg" aria-hidden="true"></i></button><button onclick="app.addToCart(\'Session: ' + name + '\', ' + (coach.price || 350) + ')" class="text-brand-dark hover:text-brand-gold transition" aria-label="Session buchen"><i class="fas fa-plus-circle text-lg" aria-hidden="true"></i></button></div></div></div></div>';
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

    contentArea.innerHTML = '<div class="flex flex-col md:flex-row gap-8"><div class="w-full md:w-1/3"><img src="' + coach.image + '" class="w-full rounded border-4 border-white shadow-lg object-cover" alt="' + name + '" loading="lazy"></div><div class="w-full md:w-2/3"><h1 class="font-serif text-3xl mb-2">' + name + '</h1><p class="text-brand-gold uppercase font-bold text-xs mb-6">' + role + '</p><p class="text-gray-600 mb-6 leading-relaxed">' + bio + '</p><div class="mb-6"><h4 class="font-bold text-xs uppercase mb-2">Expertise</h4><div class="flex flex-wrap gap-2">' + expertise.map(e => '<span class="bg-brand-dark text-white px-2 py-1 text-[10px] uppercase rounded">' + sanitizeHTML(e) + '</span>').join('') + '</div></div>' + (coach.stats ? '<p class="text-sm text-gray-500 mb-6"><i class="fas fa-chart-line mr-2" aria-hidden="true"></i>' + sanitizeHTML(coach.stats) + '</p>' : '') + '<div class="flex gap-4"><button onclick="app.navigateToSection(\'home\', \'coaches\')" class="border-2 border-brand-dark text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:bg-brand-dark hover:text-white transition">Zurück zur Übersicht</button><button onclick="app.addToCart(\'Session: ' + name + '\', ' + coach.price + '); app.navigateToSection(\'home\', \'coaches\')" class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition">Sitzung Buchen - €' + coach.price + '</button></div></div></div>';

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

        const docRef = doc(db, 'settings', 'about');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const imageUrl = data.imageUrl;

            if (imageUrl) {
                const imgElement = document.getElementById('about-founder-image');
                if (imgElement) {
                    imgElement.src = imageUrl;
                    console.log('✅ About image loaded from Firestore');
                }
            }
        } else {
            console.log('No about image in Firestore, using default');
        }
    } catch (error) {
        console.error('Error loading about image:', error);
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
