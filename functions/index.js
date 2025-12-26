const {onRequest, onCall} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {defineSecret} = require('firebase-functions/params');

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// Set global options
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10
});

admin.initializeApp();

// CORS Headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// ========== CREATE CHECKOUT SESSION ==========
exports.createCheckoutSession = onRequest({secrets: [stripeSecretKey]}, async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }

    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { items, userEmail, userId } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid items' });
        }

        // Initialize Stripe with secret
        const stripe = require('stripe')(stripeSecretKey.value());

        // Create line items
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'eur',
                product_data: {
                    name: item.title,
                    description: `APEX Executive - ${item.title}`
                },
                unit_amount: Math.round(item.price * 100)
            },
            quantity: 1
        }));

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'sepa_debit', 'paypal', 'klarna', 'giropay'],
            line_items: lineItems,
            mode: 'payment',
            customer_email: userEmail || undefined, // Optional - Stripe sammelt Email wenn nicht vorhanden
            client_reference_id: userId || 'new_customer',
            success_url: `${req.headers.origin || 'https://apex-executive.de'}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'https://apex-executive.de'}?payment=cancelled`,
            metadata: {
                userId: userId || '',
                items: JSON.stringify(items),
                createAccount: !userId ? 'true' : 'false' // Flag für Account-Erstellung
            },
            billing_address_collection: 'required',
            phone_number_collection: {
                enabled: true
            },
            locale: 'de'
        });

        return res.status(200).json({
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return res.status(500).json({
            error: 'Failed to create checkout session',
            message: error.message
        });
    }
});

// ========== STRIPE WEBHOOK ==========
exports.stripeWebhook = onRequest({secrets: [stripeSecretKey, stripeWebhookSecret]}, async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        const stripe = require('stripe')(stripeSecretKey.value());

        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            stripeWebhookSecret.value()
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        try {
            let userId = session.client_reference_id;
            const customerEmail = session.customer_email;
            const customerName = session.customer_details?.name || 'APEX User';
            const createAccount = session.metadata.createAccount === 'true';

            // Automatische Account-Erstellung für neue Kunden
            if (createAccount && customerEmail && (!userId || userId === 'new_customer')) {
                try {
                    // Prüfe ob User mit dieser Email bereits existiert
                    let userRecord;
                    try {
                        userRecord = await admin.auth().getUserByEmail(customerEmail);
                        console.log('User exists already:', customerEmail);
                        userId = userRecord.uid;
                    } catch (error) {
                        // User existiert nicht - erstelle neuen Account
                        if (error.code === 'auth/user-not-found') {
                            // Generiere sicheres temporäres Passwort
                            const tempPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

                            userRecord = await admin.auth().createUser({
                                email: customerEmail,
                                password: tempPassword,
                                displayName: customerName,
                                emailVerified: true // Wir vertrauen Stripe's Email-Verifizierung
                            });

                            userId = userRecord.uid;

                            // Erstelle User-Dokument in Firestore
                            await admin.firestore().collection('users').doc(userId).set({
                                email: customerEmail,
                                name: customerName,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                createdVia: 'stripe_checkout',
                                stripeCustomerId: session.customer,
                                needsPasswordReset: true // User soll Passwort zurücksetzen
                            });

                            // Sende Password-Reset Email
                            try {
                                const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);
                                console.log('Password reset link generated:', resetLink);
                                // TODO: Send custom email with reset link
                            } catch (resetError) {
                                console.error('Error generating password reset link:', resetError);
                            }

                            console.log('New user created:', userId, customerEmail);
                        } else {
                            throw error;
                        }
                    }
                } catch (authError) {
                    console.error('Error creating user account:', authError);
                    // Fahre fort mit Order-Erstellung auch wenn Account-Erstellung fehlschlägt
                    userId = `guest_${session.id}`;
                }
            }

            // Order in Firestore speichern
            const orderData = {
                userId: userId || `guest_${session.id}`,
                customerEmail: customerEmail,
                customerName: customerName,
                items: JSON.parse(session.metadata.items),
                total: session.amount_total / 100,
                currency: session.currency,
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                stripePaymentIntent: session.payment_intent,
                stripeCustomerId: session.customer,
                status: 'confirmed',
                date: admin.firestore.FieldValue.serverTimestamp(),
                billingDetails: session.customer_details,
                shippingDetails: session.shipping_details,
                paymentMethod: session.payment_method_types[0] || 'card'
            };

            await admin.firestore().collection('orders').add(orderData);

            console.log('Order saved successfully:', session.id, 'User:', userId);

        } catch (error) {
            console.error('Error processing checkout.session.completed:', error);
        }
    }

    res.status(200).json({ received: true });
});

// ========== GET ORDER BY SESSION ID ==========
exports.getOrderBySessionId = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new Error('User must be authenticated');
    }

    const { sessionId } = request.data;

    try {
        const ordersRef = admin.firestore().collection('orders');
        const snapshot = await ordersRef
            .where('stripeSessionId', '==', sessionId)
            .where('userId', '==', request.auth.uid)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return { found: false };
        }

        const doc = snapshot.docs[0];
        return {
            found: true,
            order: {
                id: doc.id,
                ...doc.data()
            }
        };
    } catch (error) {
        console.error('Error fetching order:', error);
        throw new Error('Failed to fetch order');
    }
});
