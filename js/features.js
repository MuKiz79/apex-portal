// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { validateEmail, validatePassword, getFirebaseErrorMessage, showToast, sanitizeHTML, validateEmailRealtime, validatePasswordMatch, saveCartToLocalStorage, loadCartFromLocalStorage } from './core.js';

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

export async function handleAuth(isLoginMode, state) {
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
                return;
            }

            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            if (!userCredential.user.emailVerified) {
                await signOut(auth);
                throw new Error("Bitte bestätigen Sie erst Ihre E-Mail-Adresse.");
            }

            showToast('✅ Erfolgreich angemeldet');

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
            await sendEmailVerification(user);
            await signOut(auth);

            document.getElementById('auth-form')?.classList.add('hidden');
            document.getElementById('auth-tabs')?.classList.add('hidden');

            if(successDiv) {
                successDiv.innerHTML = `<div class="text-center py-4"><i class="fas fa-envelope-open-text text-4xl text-brand-gold mb-4"></i><h3 class="text-xl font-serif text-brand-dark mb-2">Fast geschafft!</h3><p class="text-gray-600 mb-4">Wir haben eine Bestätigungs-E-Mail an <strong>${sanitizeHTML(email)}</strong> gesendet.</p><p class="text-xs text-gray-500 mb-4">Bitte klicken Sie auf den Link in der E-Mail, um Ihr Konto zu aktivieren.</p><button onclick="app.resetAuthToLogin()" class="text-brand-gold font-bold underline uppercase tracking-widest text-xs hover:no-underline">Zurück zum Login</button></div>`;
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

        // Client-side Sortierung nach Datum
        orders.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

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

// ========== ADMIN FUNCTIONS ==========

const ADMIN_EMAILS = ['muammer.kizilaslan@gmail.com'];

export function isAdmin(email) {
    return ADMIN_EMAILS.includes(email?.toLowerCase());
}

// Store all orders for filtering
let allAdminOrders = [];

export async function loadAllOrders() {
    if (!db) {
        console.error('Database not available');
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
        snapshot.forEach(doc => {
            allAdminOrders.push({ id: doc.id, ...doc.data() });
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
        console.error('Failed to load orders:', e);
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

    document.getElementById('admin-stat-total').textContent = total;
    document.getElementById('admin-stat-processing').textContent = processing;
    document.getElementById('admin-stat-completed').textContent = completed;
    document.getElementById('admin-stat-revenue').textContent = `€${revenue.toLocaleString('de-DE')}`;
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

        const statusLabels = {
            processing: 'In Bearbeitung',
            confirmed: 'Bestätigt',
            completed: 'Abgeschlossen',
            cancelled: 'Storniert'
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

        container.innerHTML = docs.map(doc => `
            <a href="${doc.url}" target="_blank" class="flex items-center gap-2 text-sm text-brand-gold hover:text-brand-dark transition">
                <i class="fas fa-file-pdf"></i>
                <span>${sanitizeHTML(doc.name)}</span>
                <i class="fas fa-external-link-alt text-xs"></i>
            </a>
        `).join('');

    } catch (e) {
        console.error('Failed to load documents:', e);
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
        console.error('Failed to update status:', e);
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
        console.error('Upload failed:', e);
        showToast('❌ Upload fehlgeschlagen: ' + e.message, 3000);
    }
}
