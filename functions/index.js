const {onRequest, onCall} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {defineSecret} = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');

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
exports.createCheckoutSession = onRequest({
    secrets: [stripeSecretKey],
    invoker: 'public'
}, async (req, res) => {
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
            payment_method_types: ['card', 'paypal'],
            line_items: lineItems,
            mode: 'payment',
            customer_email: userEmail || undefined, // Optional - Stripe sammelt Email wenn nicht vorhanden
            client_reference_id: userId || 'new_customer',
            success_url: `${req.headers.origin || 'https://mukiz79.github.io/apex-portal'}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'https://mukiz79.github.io/apex-portal'}?payment=cancelled`,
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
exports.stripeWebhook = onRequest({
    secrets: [stripeSecretKey, stripeWebhookSecret, smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    console.log('🔔 Webhook received! Method:', req.method);

    const sig = req.headers['stripe-signature'];
    console.log('📝 Stripe signature present:', !!sig);

    let event;

    try {
        const stripe = require('stripe')(stripeSecretKey.value());
        const webhookSecret = stripeWebhookSecret.value();
        console.log('🔑 Webhook secret starts with:', webhookSecret ? webhookSecret.substring(0, 10) + '...' : 'NOT SET');

        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            webhookSecret
        );
        console.log('✅ Webhook signature verified! Event type:', event.type);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        console.log('🛒 Processing checkout.session.completed event');
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
            // WICHTIG: Firestore akzeptiert keine undefined-Werte, also filtern wir sie raus
            const orderData = {
                userId: userId || `guest_${session.id}`,
                customerEmail: customerEmail || null,
                customerName: customerName || 'Kunde',
                items: JSON.parse(session.metadata.items || '[]'),
                total: session.amount_total / 100,
                currency: session.currency || 'eur',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                stripePaymentIntent: session.payment_intent || null,
                stripeCustomerId: session.customer || null,
                status: 'confirmed',
                date: admin.firestore.FieldValue.serverTimestamp(),
                billingDetails: session.customer_details || null,
                paymentMethod: session.payment_method_types?.[0] || 'card'
            };

            // Nur hinzufügen wenn vorhanden (vermeidet undefined)
            if (session.shipping_details) {
                orderData.shippingDetails = session.shipping_details;
            }

            const orderRef = await admin.firestore().collection('orders').add(orderData);

            console.log('📦 Order saved successfully:', orderRef.id, 'Session:', session.id, 'User:', userId);

            // Sende Bestellbestätigung mit PDF-Rechnung
            try {
                console.log('📧 Sending order confirmation email to:', customerEmail);
                console.log('📧 SMTP Config - Host:', smtpHost.value() || 'NOT SET', 'User:', smtpUser.value() ? smtpUser.value().substring(0, 5) + '***' : 'NOT SET');
                await sendOrderConfirmationEmail(orderData, orderRef.id, session.id);
                console.log('✅ Order confirmation email sent successfully to:', customerEmail);
            } catch (emailError) {
                console.error('❌ Failed to send order confirmation email:', emailError.message);
                console.error('❌ Email error details:', JSON.stringify(emailError));
                // Wir werfen den Fehler nicht, da die Bestellung trotzdem gespeichert wurde
            }

        } catch (error) {
            console.error('Error processing checkout.session.completed:', error);
        }
    }

    res.status(200).json({ received: true });
});

// ========== SEND ORDER CONFIRMATION EMAIL WITH PDF ==========
async function sendOrderConfirmationEmail(orderData, orderId, sessionId) {
    // Generiere PDF-Rechnung
    const pdfBuffer = await generateInvoicePDF(orderData, orderId, sessionId);

    // Konfiguriere SMTP-Transport
    const host = smtpHost.value() || 'smtp.gmail.com';
    const user = smtpUser.value();
    const pass = smtpPass.value();

    // Gmail-spezifische Konfiguration
    const isGmail = host.includes('gmail.com');

    const transportConfig = {
        host: host,
        port: isGmail ? 587 : 465,
        secure: !isGmail, // Gmail braucht TLS (secure: false), andere SSL (secure: true)
        auth: {
            user: user,
            pass: pass
        }
    };

    // Gmail braucht explizit STARTTLS
    if (isGmail) {
        transportConfig.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transportConfig);

    console.log(`Email configured: host=${host}, user=${user ? user.substring(0, 5) + '***' : 'NOT SET'}`);

    const shortOrderId = 'APEX-' + sessionId.slice(-8).toUpperCase();

    const mailOptions = {
        from: `"APEX Executive" <${smtpUser.value() || 'noreply@apex-executive.de'}>`,
        to: orderData.customerEmail,
        subject: `Bestellbestätigung ${shortOrderId} - APEX Executive`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #0B1120; color: #C6A87C; padding: 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .content { padding: 30px; background: #f9f9f9; }
                    .order-box { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .order-number { font-size: 24px; font-weight: bold; color: #0B1120; letter-spacing: 2px; }
                    .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .items-table th, .items-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                    .items-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; }
                    .total-row { font-weight: bold; font-size: 18px; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    .btn { display: inline-block; background: #C6A87C; color: #0B1120; padding: 12px 30px; text-decoration: none; font-weight: bold; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>APEX EXECUTIVE</h1>
                    </div>
                    <div class="content">
                        <h2>Vielen Dank für Ihre Bestellung!</h2>
                        <p>Hallo ${orderData.customerName || 'geschätzter Kunde'},</p>
                        <p>wir haben Ihre Bestellung erhalten und werden diese schnellstmöglich bearbeiten.</p>

                        <div class="order-box">
                            <p style="margin: 0 0 10px 0; color: #666; font-size: 12px;">BESTELLNUMMER</p>
                            <p class="order-number">${shortOrderId}</p>
                        </div>

                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Produkt</th>
                                    <th style="text-align: right;">Preis</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderData.items.map(item => `
                                    <tr>
                                        <td>${item.title}</td>
                                        <td style="text-align: right;">€${item.price.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                                <tr class="total-row">
                                    <td>Gesamtbetrag</td>
                                    <td style="text-align: right;">€${orderData.total.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <p>Im Anhang finden Sie Ihre Rechnung als PDF.</p>

                        <p style="text-align: center; margin-top: 30px;">
                            <a href="https://mukiz79.github.io/apex-portal/" class="btn">Bestellung im Dashboard ansehen</a>
                        </p>

                        <p style="margin-top: 30px;">Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p>
                        <p>Mit besten Grüßen,<br><strong>Ihr APEX Executive Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>APEX Executive | Premium Career Services</p>
                        <p>Diese E-Mail wurde automatisch generiert.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        attachments: [
            {
                filename: `Rechnung_${shortOrderId}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    await transporter.sendMail(mailOptions);
}

// ========== GENERATE INVOICE PDF ==========
function generateInvoicePDF(orderData, orderId, sessionId) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const shortOrderId = 'APEX-' + sessionId.slice(-8).toUpperCase();
        const invoiceDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const invoiceNumber = `RE-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('APEX EXECUTIVE', 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('Premium Career Services', 50, 80);

        // Rechnung Label
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#0B1120')
           .text('RECHNUNG', 350, 50, { align: 'right' });

        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(`Rechnungsnummer: ${invoiceNumber}`, 350, 85, { align: 'right' })
           .text(`Bestellnummer: ${shortOrderId}`, 350, 100, { align: 'right' })
           .text(`Datum: ${invoiceDate}`, 350, 115, { align: 'right' });

        // Trennlinie
        doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#C6A87C').lineWidth(2).stroke();

        // Kundenadresse
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Rechnungsempfänger:', 50, 170);
        doc.fontSize(10).font('Helvetica').fillColor('#333333')
           .text(orderData.customerName || 'Kunde', 50, 185)
           .text(orderData.customerEmail, 50, 200);

        if (orderData.billingDetails?.address) {
            const addr = orderData.billingDetails.address;
            if (addr.line1) doc.text(addr.line1, 50, 215);
            if (addr.postal_code || addr.city) {
                doc.text(`${addr.postal_code || ''} ${addr.city || ''}`, 50, 230);
            }
            if (addr.country) doc.text(addr.country, 50, 245);
        }

        // Artikeltabelle
        const tableTop = 290;
        const tableHeaders = ['Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt'];
        const colWidths = [250, 60, 100, 85];
        let xPos = 50;

        // Tabellenkopf
        doc.rect(50, tableTop, 495, 25).fillColor('#f3f4f6').fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');

        tableHeaders.forEach((header, i) => {
            doc.text(header, xPos + 5, tableTop + 8, {
                width: colWidths[i] - 10,
                align: i > 0 ? 'right' : 'left'
            });
            xPos += colWidths[i];
        });

        // Artikel
        let yPos = tableTop + 35;
        doc.font('Helvetica').fontSize(10);

        orderData.items.forEach(item => {
            xPos = 50;
            doc.fillColor('#333333')
               .text(item.title, xPos + 5, yPos, { width: colWidths[0] - 10 })
               .text('1', xPos + colWidths[0] + 5, yPos, { width: colWidths[1] - 10, align: 'right' })
               .text(`€${item.price.toFixed(2)}`, xPos + colWidths[0] + colWidths[1] + 5, yPos, { width: colWidths[2] - 10, align: 'right' })
               .text(`€${item.price.toFixed(2)}`, xPos + colWidths[0] + colWidths[1] + colWidths[2] + 5, yPos, { width: colWidths[3] - 10, align: 'right' });

            yPos += 25;

            // Trennlinie zwischen Artikeln
            doc.moveTo(50, yPos - 5).lineTo(545, yPos - 5).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        });

        // Summen
        yPos += 15;
        const netAmount = orderData.total / 1.19; // 19% MwSt zurückrechnen
        const vatAmount = orderData.total - netAmount;

        doc.fontSize(10).font('Helvetica')
           .text('Nettobetrag:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${netAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 20;
        doc.text('USt. 19%:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${vatAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 25;
        doc.rect(350, yPos - 5, 195, 30).fillColor('#0B1120').fill();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#C6A87C')
           .text('Gesamtbetrag:', 355, yPos + 3, { width: 95, align: 'right' })
           .text(`€${orderData.total.toFixed(2)}`, 455, yPos + 3, { width: 85, align: 'right' });

        // Zahlungsinformation
        yPos += 60;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Zahlungsinformation', 50, yPos);
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`Status: Bezahlt`, 50, yPos + 15)
           .text(`Zahlungsmethode: ${orderData.paymentMethod === 'card' ? 'Kreditkarte' : orderData.paymentMethod === 'paypal' ? 'PayPal' : orderData.paymentMethod}`, 50, yPos + 30);

        // Footer
        const footerY = 750;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('APEX Executive | Premium Career Services', 50, footerY + 10, { align: 'center', width: 495 })
           .text('Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig.', 50, footerY + 22, { align: 'center', width: 495 });

        doc.end();
    });
}

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
