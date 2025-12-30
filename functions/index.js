const {onRequest, onCall} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {defineSecret} = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const docx = require('docx');

// Pdfme for template-based PDF generation
const { generate } = require('@pdfme/generator');
const { BLANK_PDF } = require('@pdfme/common');
const { text, image, line, rectangle } = require('@pdfme/schemas');

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const dailyApiKey = defineSecret('DAILY_API_KEY');
const claudeApiKey = defineSecret('CLAUDE_API_KEY');

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

                                // Send welcome email with reset link
                                const transporter = nodemailer.createTransport({
                                    host: smtpHost.value(),
                                    port: 587,
                                    secure: false,
                                    auth: {
                                        user: smtpUser.value(),
                                        pass: smtpPass.value()
                                    }
                                });

                                await transporter.sendMail({
                                    from: '"APEX Executive" <noreply@apex-executive.de>',
                                    to: customerEmail,
                                    subject: 'Willkommen bei APEX Executive - Bitte Passwort festlegen',
                                    html: `
                                        <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; padding: 40px; color: #fff;">
                                            <div style="text-align: center; margin-bottom: 30px;">
                                                <h1 style="color: #C9B99A; font-size: 28px; margin: 0;">APEX Executive</h1>
                                            </div>
                                            <div style="background: white; padding: 30px; border-radius: 8px; color: #333;">
                                                <h2 style="color: #1a1a2e; margin-top: 0;">Willkommen bei APEX Executive!</h2>
                                                <p>Vielen Dank für Ihre Bestellung. Wir haben automatisch ein Konto für Sie erstellt.</p>
                                                <p>Bitte klicken Sie auf den folgenden Button, um Ihr Passwort festzulegen:</p>
                                                <div style="text-align: center; margin: 30px 0;">
                                                    <a href="${resetLink}" style="background: #C9B99A; color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Passwort festlegen</a>
                                                </div>
                                                <p style="color: #666; font-size: 14px;">Oder kopieren Sie diesen Link in Ihren Browser:<br><a href="${resetLink}" style="color: #1a1a2e;">${resetLink}</a></p>
                                                <p>Sobald Ihr Passwort festgelegt ist, können Sie sich in Ihrem Dashboard einloggen und Ihre Bestellungen einsehen.</p>
                                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                                <p style="color: #666; font-size: 12px;">Bei Fragen stehen wir Ihnen gerne zur Verfügung: concierge@apex-executive.de</p>
                                            </div>
                                        </div>
                                    `
                                });
                                console.log('Welcome email with password reset sent to:', customerEmail);
                            } catch (resetError) {
                                console.error('Error generating password reset link or sending email:', resetError);
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

// ========== SEND APPOINTMENT PROPOSAL EMAIL ==========
exports.sendAppointmentProposalEmail = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, userId, customerEmail, proposals, message } = req.body;

        if (!customerEmail || !proposals || proposals.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Format proposals for email
        const proposalsList = proposals.map((p, idx) => {
            const date = new Date(p.datetime);
            const dateStr = date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return `<tr>
                <td style="padding: 12px; background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'}; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #1f2937;">Option ${idx + 1}:</strong> ${dateStr} um ${timeStr} Uhr
                </td>
            </tr>`;
        }).join('');

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #C9B99A; }
        .logo { font-size: 28px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px; }
        .logo-sub { font-size: 10px; color: #C9B99A; letter-spacing: 2px; text-transform: uppercase; }
        .content { padding: 30px 0; }
        .proposals-table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        .cta-button { display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px 0; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
        .message-box { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0; font-style: italic; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">APEX</div>
            <div class="logo-sub">Executive</div>
        </div>

        <div class="content">
            <h2 style="color: #1a1a2e; margin-bottom: 10px;">Terminvorschläge für Sie</h2>
            <p>Wir haben folgende Terminvorschläge für Ihr Coaching-Gespräch:</p>

            ${message ? `<div class="message-box">"${message}"</div>` : ''}

            <table class="proposals-table">
                ${proposalsList}
            </table>

            <p style="text-align: center;">
                <a href="https://apex-executive.de/#dashboard" class="cta-button">
                    Termin auswählen
                </a>
            </p>

            <p style="color: #6b7280; font-size: 14px;">
                Klicken Sie auf den Button oben, um einen der vorgeschlagenen Termine zu bestätigen.
                Falls keiner der Termine passt, können Sie dies ebenfalls in Ihrem Dashboard angeben.
            </p>
        </div>

        <div class="footer">
            <p>APEX Executive | Premium Career Services</p>
            <p>Diese E-Mail wurde automatisch gesendet.</p>
        </div>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"APEX Executive" <noreply@apex-executive.de>',
            to: customerEmail,
            subject: 'Terminvorschläge für Ihr Coaching | APEX Executive',
            html: emailHtml
        });

        console.log(`Appointment proposal email sent to ${customerEmail} for order ${orderId}`);
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Failed to send appointment proposal email:', error);
        return res.status(500).json({ error: 'Failed to send email', message: error.message });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER ACCEPTED APPOINTMENT ==========
exports.notifyAdminAppointmentAccepted = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, datetime, orderId } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const dateStr = new Date(datetime).toLocaleDateString('de-DE', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        const timeStr = new Date(datetime).toLocaleTimeString('de-DE', {
            hour: '2-digit', minute: '2-digit'
        });

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">APEX</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">EXECUTIVE</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #22c55e; margin-bottom: 10px;">✅ Termin bestätigt!</h2>
        <p>Großartige Neuigkeiten! Ein Kunde hat einen Termin bestätigt:</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            <p style="margin: 5px 0;"><strong>Termin:</strong> ${dateStr} um ${timeStr} Uhr</p>
        </div>
        <p style="text-align: center;">
            <a href="https://apex-executive.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Zum Admin-Bereich
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"APEX Executive" <noreply@apex-executive.de>',
            to: ADMIN_EMAIL,
            subject: `✅ Termin bestätigt von ${customerName} | APEX Executive`,
            html: emailHtml
        });

        console.log(`Admin notified: appointment accepted by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER DECLINED APPOINTMENTS ==========
exports.notifyAdminAppointmentDeclined = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, reason, orderId } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">APEX</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">EXECUTIVE</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #f59e0b; margin-bottom: 10px;">⏳ Neue Terminvorschläge benötigt</h2>
        <p>Ein Kunde hat die vorgeschlagenen Termine abgelehnt und bittet um neue Vorschläge:</p>
        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            ${reason && reason !== 'Keine Angabe' ? `<p style="margin: 5px 0;"><strong>Grund:</strong> "${reason}"</p>` : ''}
        </div>
        <p>Bitte senden Sie dem Kunden neue Terminvorschläge.</p>
        <p style="text-align: center;">
            <a href="https://apex-executive.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Neue Termine vorschlagen
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"APEX Executive" <noreply@apex-executive.de>',
            to: ADMIN_EMAIL,
            subject: `⏳ Neue Terminvorschläge benötigt von ${customerName} | APEX Executive`,
            html: emailHtml
        });

        console.log(`Admin notified: appointments declined by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY CUSTOMER: DOCUMENT UPLOADED BY ADMIN ==========
exports.notifyCustomerDocumentReady = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerEmail, customerName, documentName } = req.body;

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">APEX</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">EXECUTIVE</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #22c55e; margin-bottom: 10px;">📄 Neues Dokument für Sie!</h2>
        <p>Hallo ${customerName || 'geschätzter Kunde'},</p>
        <p>wir freuen uns, Ihnen mitzuteilen, dass ein neues Dokument für Sie bereitsteht:</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="font-size: 18px; font-weight: bold; color: #1a1a2e; margin: 0;">📎 ${documentName}</p>
        </div>
        <p>Sie können das Dokument jetzt in Ihrem Dashboard unter "Ihre Ergebnisse" herunterladen.</p>
        <p style="text-align: center;">
            <a href="https://apex-executive.de/#dashboard" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Zum Dashboard
            </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.<br>
            Herzliche Grüße,<br>
            <strong>Ihr APEX Executive Team</strong>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"APEX Executive" <noreply@apex-executive.de>',
            to: customerEmail,
            subject: '📄 Neues Dokument für Sie bereit | APEX Executive',
            html: emailHtml
        });

        console.log(`Customer notified: document ready for ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify customer:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER UPLOADED DOCUMENT ==========
exports.notifyAdminDocumentUploaded = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, documentName } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">APEX</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">EXECUTIVE</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #3b82f6; margin-bottom: 10px;">📤 Neues Dokument hochgeladen</h2>
        <p>Ein Kunde hat ein neues Dokument hochgeladen:</p>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            <p style="margin: 5px 0;"><strong>Dokument:</strong> ${documentName}</p>
        </div>
        <p style="text-align: center;">
            <a href="https://apex-executive.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Im Admin-Bereich ansehen
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"APEX Executive" <noreply@apex-executive.de>',
            to: ADMIN_EMAIL,
            subject: `📤 Neues Dokument von ${customerName} | APEX Executive`,
            html: emailHtml
        });

        console.log(`Admin notified: document uploaded by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== ADMIN: SET EMAIL VERIFIED ==========
exports.setEmailVerified = onRequest({
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { uid, email, adminEmail } = req.body;

        // Prüfe ob Anfrage von Admin kommt (einfache Prüfung)
        const ADMIN_EMAILS = ['muammer.kizilaslan@gmx.de', 'kizilaslaneva@gmail.com'];
        if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) {
            return res.status(403).json({ error: 'Unauthorized - Admin access required' });
        }

        let userToUpdate;

        if (uid) {
            userToUpdate = await admin.auth().getUser(uid);
        } else if (email) {
            userToUpdate = await admin.auth().getUserByEmail(email);
        } else {
            return res.status(400).json({ error: 'uid or email required' });
        }

        // Setze emailVerified auf true
        await admin.auth().updateUser(userToUpdate.uid, {
            emailVerified: true
        });

        console.log(`Email verified set to true for user: ${userToUpdate.email}`);

        return res.status(200).json({
            success: true,
            message: `Email verified für ${userToUpdate.email} wurde auf true gesetzt`,
            user: {
                uid: userToUpdate.uid,
                email: userToUpdate.email,
                emailVerified: true
            }
        });

    } catch (error) {
        console.error('Error setting email verified:', error);
        return res.status(500).json({
            error: 'Failed to update user',
            message: error.message
        });
    }
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

// ========== DAILY.CO VIDEO INTEGRATION ==========

// Create a Daily.co meeting room for an appointment
exports.createMeetingRoom = onRequest({
    secrets: [dailyApiKey],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, appointmentDatetime, customerName, mentorName } = req.body;

        if (!orderId || !appointmentDatetime) {
            return res.status(400).json({ error: 'orderId and appointmentDatetime required' });
        }

        // Create unique room name based on order ID
        const roomName = `apex-${orderId.slice(-8).toLowerCase()}-${Date.now()}`;

        // Calculate expiry time (appointment time + 2 hours)
        const appointmentDate = new Date(appointmentDatetime);
        const expiryTime = Math.floor(appointmentDate.getTime() / 1000) + (2 * 60 * 60); // +2 hours
        const notBeforeTime = Math.floor(appointmentDate.getTime() / 1000) - (15 * 60); // 15 min before

        // Create Daily.co room via API
        const response = await fetch('https://api.daily.co/v1/rooms', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dailyApiKey.value()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: roomName,
                privacy: 'private',
                properties: {
                    exp: expiryTime,
                    nbf: notBeforeTime,
                    max_participants: 4,
                    enable_chat: true,
                    enable_screenshare: true,
                    enable_recording: 'cloud', // Optional: enable recording
                    start_video_off: false,
                    start_audio_off: false,
                    lang: 'de'
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Daily.co API error:', errorData);
            return res.status(500).json({ error: 'Failed to create meeting room', details: errorData });
        }

        const roomData = await response.json();

        // Store meeting room URL in the order
        const orderRef = admin.firestore().collection('orders').doc(orderId);
        await orderRef.update({
            meetingRoom: {
                url: roomData.url,
                roomName: roomData.name,
                createdAt: new Date(),
                expiresAt: new Date(expiryTime * 1000)
            }
        });

        console.log(`Meeting room created for order ${orderId}: ${roomData.url}`);

        return res.status(200).json({
            success: true,
            meetingUrl: roomData.url,
            roomName: roomData.name,
            expiresAt: new Date(expiryTime * 1000).toISOString()
        });

    } catch (error) {
        console.error('Error creating meeting room:', error);
        return res.status(500).json({ error: 'Failed to create meeting room', message: error.message });
    }
});

// Create meeting token for secure access
exports.createMeetingToken = onRequest({
    secrets: [dailyApiKey],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { roomName, userName, userId, isOwner } = req.body;

        if (!roomName || !userName) {
            return res.status(400).json({ error: 'roomName and userName required' });
        }

        // Token expires in 2 hours
        const expiryTime = Math.floor(Date.now() / 1000) + (2 * 60 * 60);

        // Create meeting token
        const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dailyApiKey.value()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    room_name: roomName,
                    user_name: userName,
                    user_id: userId || undefined,
                    exp: expiryTime,
                    is_owner: isOwner || false,
                    enable_screenshare: true,
                    start_video_off: false,
                    start_audio_off: false
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Daily.co token API error:', errorData);
            return res.status(500).json({ error: 'Failed to create meeting token', details: errorData });
        }

        const tokenData = await response.json();

        return res.status(200).json({
            success: true,
            token: tokenData.token
        });

    } catch (error) {
        console.error('Error creating meeting token:', error);
        return res.status(500).json({ error: 'Failed to create meeting token', message: error.message });
    }
});

// ========== SEND CV QUESTIONNAIRE EMAIL ==========
exports.sendQuestionnaireEmail = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
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
        const { projectId, customerEmail, customerName, questionnaireUrl } = req.body;

        if (!projectId || !customerEmail || !questionnaireUrl) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        // Email content
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CV-Fragebogen - APEX Executive</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 40px 30px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td>
                                        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #C9B99A 0%, #B8A88A 100%); border-radius: 12px; display: inline-block; text-align: center; line-height: 50px;">
                                            <span style="color: #1a1a2e; font-size: 24px; font-weight: bold; font-family: Georgia, serif;">A</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-top: 20px;">
                                        <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-family: Georgia, serif;">CV-Fragebogen</h1>
                                        <p style="color: #C9B99A; font-size: 16px; margin: 10px 0 0;">APEX Executive Career Services</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Guten Tag${customerName ? ' ' + customerName.split(' ')[0] : ''},
                            </p>

                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                vielen Dank für Ihre Bestellung bei APEX Executive. Um Ihren optimierten Lebenslauf zu erstellen, benötigen wir einige Informationen von Ihnen.
                            </p>

                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                                Bitte füllen Sie den folgenden Fragebogen aus. Der Prozess dauert etwa 15-20 Minuten und Ihre Eingaben werden automatisch gespeichert.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 8px; background: linear-gradient(135deg, #C9B99A 0%, #B8A88A 100%);">
                                        <a href="${questionnaireUrl}" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #1a1a2e; text-decoration: none;">
                                            Fragebogen ausfüllen →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
                                Oder kopieren Sie diesen Link:<br>
                                <a href="${questionnaireUrl}" style="color: #C9B99A; word-break: break-all;">${questionnaireUrl}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #333333; font-size: 14px; font-weight: 600; margin: 0 0 10px;">
                                            📋 Was wir benötigen:
                                        </p>
                                        <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                            <li>Persönliche Daten & Karriereziele</li>
                                            <li>Berufserfahrung & Ausbildung</li>
                                            <li>Skills & Qualifikationen</li>
                                            <li>Optional: Aktueller Lebenslauf & Stellenausschreibung</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} APEX Executive Career Services
                            </p>
                            <p style="color: #666666; font-size: 11px; margin: 10px 0 0;">
                                Diese E-Mail wurde automatisch generiert. Bei Fragen kontaktieren Sie uns unter kontakt@apex-executive.de
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        // Send email
        await transporter.sendMail({
            from: `"APEX Executive" <${smtpUser.value()}>`,
            to: customerEmail,
            subject: 'Ihr CV-Fragebogen - APEX Executive',
            html: emailHtml
        });

        console.log(`Questionnaire email sent to ${customerEmail} for project ${projectId}`);

        return res.status(200).json({
            success: true,
            message: 'Email sent successfully'
        });

    } catch (error) {
        console.error('Error sending questionnaire email:', error);
        return res.status(500).json({
            error: 'Failed to send email',
            message: error.message
        });
    }
});

// ========== GENERATE CV CONTENT WITH CLAUDE API ==========
exports.generateCvContent = onRequest({
    secrets: [claudeApiKey],
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB'
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
        const {
            projectId,
            templateType,
            language,
            // New design options
            colorScheme = 'classic',
            layout = 'two-column',
            includeCover = false,
            includePhoto = false,
            tone = 'professional',
            focusAreas = []
        } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        // Load CV project data from Firestore
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return res.status(404).json({ error: 'CV Project not found' });
        }

        const projectData = projectDoc.data();
        const questionnaire = projectData.questionnaire || {};
        const documents = projectData.documents || {};

        // Build context from questionnaire
        const personalInfo = questionnaire.personal || {};
        const experience = questionnaire.experience || [];
        const education = questionnaire.education || [];
        const skills = questionnaire.skills || {};
        const additional = questionnaire.additional || {};

        // Template-specific requirements with detailed examples
        const templateExamples = {
            minimalist: {
                description: 'Clean, modern format for Young Professionals (0-5 Jahre Erfahrung). Fokus auf Potenzial und erste Erfolge.',
                summaryExample: 'Ambitionierter Marketing-Spezialist mit 3 Jahren Erfahrung in der Entwicklung datengetriebener Kampagnen. Nachgewiesene Steigerung der Conversion-Rate um 45% durch A/B-Testing und Kundenanalyse. Expertise in Google Analytics, HubSpot und Social Media Marketing.',
                achievementExamples: [
                    'Steigerung der Social-Media-Reichweite um 150% innerhalb von 6 Monaten durch gezielte Content-Strategie',
                    'Einführung eines neuen CRM-Systems, das die Kundenzufriedenheit um 20% erhöhte',
                    'Reduzierung der Bearbeitungszeit um 30% durch Prozessoptimierung'
                ]
            },
            creative: {
                description: 'Modern und kreativ für Marketing, Design und Tech-Rollen. Betont Innovation und kreative Problemlösung.',
                summaryExample: 'Kreativer UX Designer mit Leidenschaft für nutzerzentrierte Produktentwicklung. 5 Jahre Erfahrung in der Gestaltung digitaler Erlebnisse für Fortune-500-Unternehmen. Gewinner des Red Dot Design Award 2023.',
                achievementExamples: [
                    'Redesign der Unternehmens-App führte zu 40% höherer Nutzerengagement und 25% weniger Support-Anfragen',
                    'Entwicklung eines Design-Systems, das die Entwicklungszeit neuer Features um 60% verkürzte',
                    'Leitung eines cross-funktionalen Teams von 8 Designern bei der Neugestaltung der E-Commerce-Plattform'
                ]
            },
            corporate: {
                description: 'Klassisch-professionell für Senior Professionals (5-15 Jahre). Umfassende Darstellung von Verantwortung und Ergebnissen.',
                summaryExample: 'Erfahrener Finanzmanager mit über 10 Jahren Expertise in der strategischen Finanzplanung und Budgetverantwortung bis €50M. Nachgewiesene Erfolgsbilanz in der Optimierung von Finanzprozessen und Kostenreduktion. MBA-Abschluss und CFA-Zertifizierung.',
                achievementExamples: [
                    '20-prozentige Senkung der Betriebskosten durch Implementierung von Lean-Management-Prinzipien',
                    'Jährliche Steigerung der Neukundenaufträge um 15% durch strategische Vertriebspartnerschaften',
                    'Erfolgreiche Integration zweier Tochtergesellschaften mit Synergieeffekten von €2,5M jährlich'
                ]
            },
            executive: {
                description: 'Executive Brief für C-Suite und Direktoren. Fokus auf strategische Vision, P&L-Verantwortung und transformative Führung.',
                summaryExample: 'Visionärer Geschäftsführer mit 20+ Jahren Erfahrung in der Transformation mittelständischer Unternehmen. Nachgewiesene P&L-Verantwortung bis €500M und erfolgreiche Führung von 500+ Mitarbeitern. Spezialisiert auf digitale Transformation und internationales Wachstum.',
                achievementExamples: [
                    'Steigerung des Unternehmensumsatzes von €150M auf €450M innerhalb von 5 Jahren',
                    'Erfolgreiche Durchführung eines IPO mit Bewertung von €800M',
                    'Transformation der Organisation: Reduktion der Time-to-Market um 62% bei gleichzeitiger Kostensenkung von 25%',
                    'Aufbau und Führung eines internationalen Teams von 150+ Mitarbeitern in 8 Ländern'
                ]
            },
            brand: {
                description: 'Personal Branding für Thought Leader. Betont einzigartigen Mehrwert, Expertise und Vordenkerrolle.',
                summaryExample: 'Anerkannter Experte für digitale Transformation und Keynote-Speaker mit über 100 Vorträgen auf internationalen Konferenzen. Autor von "Digital Leadership" (Bestseller 2023). Berater für DAX-30-Unternehmen in Fragen der Innovationsstrategie.',
                achievementExamples: [
                    'Entwicklung einer preisgekrönten Innovationsmethodik, die in 50+ Unternehmen implementiert wurde',
                    'Aufbau einer LinkedIn-Community von 75.000+ Followern als Thought Leader für Digital Leadership',
                    'Beratung von 15 DAX-Unternehmen bei der strategischen Neuausrichtung mit durchschnittlicher Umsatzsteigerung von 30%'
                ]
            }
        };

        const selectedTemplate = templateExamples[templateType] || templateExamples.corporate;

        // Tone descriptions for different writing styles
        const toneDescriptions = {
            professional: 'Sachlich-professionell, fokussiert auf Fakten und Ergebnisse',
            confident: 'Selbstbewusst und durchsetzungsstark, betont Führungsqualitäten',
            dynamic: 'Dynamisch und modern, betont Innovation und Agilität',
            executive: 'Authorativ und visionär, perfekt für C-Level-Positionen'
        };

        // Build the enhanced prompt for Claude
        const prompt = `Du bist ein Premium-CV-Experte bei APEX Executive, einem exklusiven Karriereservice für Führungskräfte. Du erstellst Lebensläufe auf dem Niveau professioneller CV-Writer, die €500-2000 pro CV berechnen.

DEINE AUFGABE:
Erstelle einen perfekt optimierten, professionellen Lebenslauf${includeCover ? ' MIT ANSCHREIBEN' : ''}, der sofort beeindruckt.

=== DESIGN-EINSTELLUNGEN ===
TEMPLATE-TYP: ${templateType || 'corporate'}
TEMPLATE-BESCHREIBUNG: ${selectedTemplate.description}
FARBSCHEMA: ${colorScheme} (beeinflusst Struktur und Ton)
LAYOUT: ${layout === 'single-column' ? 'Eine Spalte (klassisch)' : layout === 'two-column' ? 'Zwei Spalten (modern)' : 'Sidebar (kompakt)'}
FOTO-PLATZHALTER: ${includePhoto ? 'Ja - Platzhalter für Bewerbungsfoto einplanen' : 'Nein'}
SPRACHE: ${language || 'Deutsch'}
TON/STIL: ${toneDescriptions[tone] || toneDescriptions.professional}
${focusAreas.length > 0 ? `FOKUS-BEREICHE (besonders betonen): ${focusAreas.join(', ')}` : ''}

=== BEISPIELE FÜR DIESEN TEMPLATE-TYP ===

BEISPIEL-SUMMARY (so sollte es klingen):
"${selectedTemplate.summaryExample}"

BEISPIEL-ACHIEVEMENTS (diese Qualität erwarten wir):
${selectedTemplate.achievementExamples.map((a, i) => `${i + 1}. "${a}"`).join('\n')}

=== KANDIDATEN-DATEN ===

PERSÖNLICHE DATEN:
- Name: ${personalInfo.fullName || 'Nicht angegeben'}
- E-Mail: ${personalInfo.email || ''}
- Telefon: ${personalInfo.phone || ''}
- Standort: ${personalInfo.location || ''}
- LinkedIn: ${personalInfo.linkedin || ''}
- Website: ${personalInfo.website || ''}
- Gewünschte Position: ${personalInfo.targetRole || ''}
- Karriereziel: ${personalInfo.careerGoal || ''}

BERUFSERFAHRUNG:
${experience.length > 0 ? experience.map((exp, i) => `
Position ${i + 1}:
- Firma: ${exp.company || ''}
- Position: ${exp.role || ''}
- Zeitraum: ${exp.startDate || ''} - ${exp.endDate || 'heute'}
- Beschreibung: ${exp.description || ''}
- Erfolge: ${(exp.achievements || []).join(', ') || 'Keine angegeben'}
`).join('\n') : 'Keine Berufserfahrung angegeben'}

AUSBILDUNG:
${education.length > 0 ? education.map((edu, i) => `
Ausbildung ${i + 1}:
- Institution: ${edu.institution || ''}
- Abschluss: ${edu.degree || ''}
- Fachrichtung: ${edu.field || ''}
- Zeitraum: ${edu.startDate || ''} - ${edu.endDate || ''}
- Note: ${edu.grade || ''}
- Highlights: ${edu.highlights || ''}
`).join('\n') : 'Keine Ausbildung angegeben'}

SKILLS:
- Technische Skills: ${(skills.technical || []).join(', ') || 'Keine angegeben'}
- Soft Skills: ${(skills.soft || []).join(', ') || 'Keine angegeben'}
- Sprachen: ${(skills.languages || []).map(l => `${l.language} (${l.level})`).join(', ') || 'Keine angegeben'}
- Zertifikate: ${(skills.certifications || []).join(', ') || 'Keine angegeben'}

ZUSÄTZLICHE INFORMATIONEN:
- Eigene Zusammenfassung: ${additional.summary || ''}
- Top-Stärken: ${additional.strengths || ''}
- Ziel-Branchen: ${(additional.industries || []).join(', ') || ''}

${documents.existingCv?.extractedText ? `
AKTUELLER LEBENSLAUF (extrahierter Text):
${documents.existingCv.extractedText.substring(0, 4000)}
` : ''}

${documents.targetJob?.extractedText ? `
ZIELSTELLE (Stellenbeschreibung):
${documents.targetJob.extractedText.substring(0, 2500)}
` : ''}

=== PREMIUM-QUALITÄTSSTANDARDS ===

1. POWER-VERBEN für Achievements (IMMER verwenden):
   - Deutsch: Steigerte, Reduzierte, Implementierte, Führte, Entwickelte, Optimierte, Transformierte, Etablierte, Verhandelte, Akquirierte
   - Englisch: Spearheaded, Orchestrated, Championed, Accelerated, Pioneered, Streamlined, Negotiated, Cultivated

2. ACHIEVEMENT-FORMEL (Action + Ergebnis + Metrik + Kontext):
   SCHWACH: "Verantwortlich für Vertrieb"
   STARK: "Steigerung des Vertriebsumsatzes um 35% (€2,4M) durch Einführung eines Key-Account-Programms mit 12 Großkunden"

3. QUANTIFIZIERUNG (IMMER mit Zahlen):
   - Umsatz/Budget in € oder $
   - Prozentuale Verbesserungen
   - Teamgrößen (z.B. "Führung von 25 Mitarbeitern")
   - Zeitersparnisse (z.B. "Reduktion um 40%")
   - Anzahl Projekte/Kunden/Länder

4. ATS-KEYWORDS (aus Zielstelle extrahieren):
   - Strategische Planung, Change Management, P&L-Verantwortung
   - Digital Transformation, Stakeholder Management
   - Cross-funktionale Führung, Business Development

5. SUMMARY-STRUKTUR (3-4 kraftvolle Sätze):
   Satz 1: Titel + Jahre Erfahrung + Hauptexpertise
   Satz 2: Größter quantifizierbarer Erfolg
   Satz 3: Kernkompetenzen/Spezialisierung
   Satz 4 (optional): Einzigartiger Mehrwert/USP

6. EXECUTIVE-FOKUS (bei C-Level/Director):
   - P&L-Verantwortung mit Zahlen
   - Strategische Initiativen
   - Board/Stakeholder-Kommunikation
   - M&A, IPO, Internationalisierung
   - Digitale Transformation

AUSGABEFORMAT:
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt (keine Markdown-Codeblöcke, kein zusätzlicher Text):
{
  "personal": {
    "fullName": "Vollständiger Name",
    "title": "Professioneller Titel (z.B. 'Chief Financial Officer | Strategische Finanzführung')",
    "email": "email@beispiel.de",
    "phone": "+49 170 1234567",
    "location": "München, Deutschland",
    "linkedin": "linkedin.com/in/name",
    "website": "website.de"${includePhoto ? ',\n    "photoPlaceholder": true' : ''}
  },
  "summary": "Kraftvolles Executive Summary nach der 3-4 Satz Struktur. Mit konkreten Zahlen und Erfolgen.",
  "experience": [
    {
      "company": "Firmenname",
      "role": "Exakte Positionsbezeichnung",
      "period": "01/2020 - heute",
      "location": "Stadt, Deutschland",
      "description": "Eine Zeile Kernverantwortung",
      "achievements": [
        "Quantifizierter Erfolg 1 mit Power-Verb und Zahlen",
        "Quantifizierter Erfolg 2 mit messbarem Impact",
        "Quantifizierter Erfolg 3 mit Kontext",
        "Quantifizierter Erfolg 4 (bei Senior-Rollen)"
      ]
    }
  ],
  "education": [
    {
      "institution": "Universität/Hochschule",
      "degree": "Abschlussbezeichnung",
      "field": "Studienrichtung",
      "period": "2010 - 2014",
      "grade": "Note (falls gut)",
      "highlights": "Relevante Auszeichnungen/Stipendien"
    }
  ],
  "skills": {
    "technical": ["Skill 1", "Skill 2", "Skill 3"],
    "soft": ["Leadership", "Strategisches Denken", "Change Management"],
    "languages": [{"language": "Deutsch", "level": "Muttersprache"}, {"language": "Englisch", "level": "Verhandlungssicher"}],
    "certifications": ["Relevante Zertifizierung 1", "Zertifizierung 2"]
  },
  "expertise": ["Kernkompetenz 1", "Kernkompetenz 2", "Kernkompetenz 3", "Kernkompetenz 4", "Kernkompetenz 5"]${includeCover ? `,
  "coverLetter": {
    "greeting": "Sehr geehrte Damen und Herren,",
    "opening": "Kraftvoller Einstieg, der Bezug zur Stelle nimmt und Interesse weckt (2-3 Sätze)",
    "body": "Hauptteil mit konkreten Erfolgen und Mehrwert für das Unternehmen (3-4 Sätze). Zeige Bezug zu den Anforderungen.",
    "closing": "Abschluss mit Call-to-Action und Gesprächswunsch (2 Sätze)",
    "signature": "Mit freundlichen Grüßen"
  }` : ''}
}`;

        console.log(`Generating CV for project ${projectId} with template ${templateType}`);

        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': claudeApiKey.value(),
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Claude API error:', errorData);
            return res.status(500).json({ error: 'Claude API error', details: errorData });
        }

        const claudeResponse = await response.json();
        const responseText = claudeResponse.content[0].text;

        // Parse the JSON response from Claude
        let generatedCvData;
        try {
            // Try to extract JSON from the response (in case Claude adds extra text)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                generatedCvData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Claude response:', parseError);
            console.error('Response text:', responseText);
            return res.status(500).json({
                error: 'Failed to parse CV data',
                message: parseError.message,
                rawResponse: responseText.substring(0, 500)
            });
        }

        // Update the CV project with generated data
        await projectRef.update({
            generatedCv: {
                templateType: templateType || 'corporate',
                language: language || 'Deutsch',
                // Store all design options
                colorScheme: colorScheme,
                layout: layout,
                includeCover: includeCover,
                includePhoto: includePhoto,
                tone: tone,
                focusAreas: focusAreas,
                // Generated content
                data: generatedCvData,
                generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                model: 'claude-sonnet-4-20250514'
            },
            status: 'ready',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`CV generated successfully for project ${projectId} with design options: ${JSON.stringify({ colorScheme, layout, includeCover, includePhoto, tone })}`);

        return res.status(200).json({
            success: true,
            data: generatedCvData,
            templateType: templateType || 'corporate'
        });

    } catch (error) {
        console.error('Error generating CV:', error);
        return res.status(500).json({
            error: 'Failed to generate CV',
            message: error.message
        });
    }
});

// ========== EXTRACT TEXT FROM DOCUMENT ==========
exports.extractDocumentText = onRequest({
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB'
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
        const { projectId, documentType, fileUrl, fileName } = req.body;

        if (!projectId || !documentType || !fileUrl) {
            return res.status(400).json({ error: 'projectId, documentType, and fileUrl are required' });
        }

        console.log(`Extracting text from ${fileName} for project ${projectId}`);

        let extractedText = '';
        const fileExtension = fileName?.toLowerCase().split('.').pop() || '';

        // Download the file
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
            throw new Error('Failed to download file');
        }
        const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

        // Extract text based on file type
        if (fileExtension === 'pdf') {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text;
        } else if (fileExtension === 'docx' || fileExtension === 'doc') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText = result.value;
        } else if (fileExtension === 'txt') {
            extractedText = fileBuffer.toString('utf-8');
        } else {
            return res.status(400).json({ error: 'Unsupported file format. Supported: PDF, DOCX, DOC, TXT' });
        }

        // Clean up the extracted text
        extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Update the CV project with extracted text
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const updateField = `documents.${documentType}.extractedText`;

        await projectRef.update({
            [updateField]: extractedText.substring(0, 10000), // Limit to 10k chars
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Text extracted successfully: ${extractedText.length} characters`);

        return res.status(200).json({
            success: true,
            textLength: extractedText.length,
            preview: extractedText.substring(0, 500)
        });

    } catch (error) {
        console.error('Error extracting document text:', error);
        return res.status(500).json({
            error: 'Failed to extract text',
            message: error.message
        });
    }
});

// ========== GENERATE CV DOCUMENT (WORD & PDF) ==========
exports.generateCvDocument = onRequest({
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '1GiB'
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
        const { projectId, format = 'docx', templateStyle = 'executive' } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        // Load CV project data from Firestore
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return res.status(404).json({ error: 'CV Project not found' });
        }

        const projectData = projectDoc.data();
        const cvData = projectData.generatedCv?.data;

        if (!cvData) {
            return res.status(400).json({ error: 'No generated CV data found. Please generate CV content first.' });
        }

        console.log(`Generating ${format.toUpperCase()} document for project ${projectId} with style ${templateStyle}`);

        let documentBuffer;
        let contentType;
        let fileExtension;

        if (format === 'docx') {
            documentBuffer = await generateWordDocument(cvData, templateStyle, projectData.generatedCv);
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            fileExtension = 'docx';
        } else if (format === 'pdf') {
            // Use Pdfme for template-based PDF generation (new method)
            // Falls back to PDFKit for unsupported templates
            const pdfmeTemplates = ['schwarz-beige-modern', 'green-yellow-modern', 'minimalist', 'corporate'];
            if (pdfmeTemplates.includes(templateStyle)) {
                documentBuffer = await generatePdfWithPdfme(cvData, templateStyle);
            } else {
                documentBuffer = await generatePdfDocument(cvData, templateStyle, projectData.generatedCv);
            }
            contentType = 'application/pdf';
            fileExtension = 'pdf';
        } else {
            return res.status(400).json({ error: 'Invalid format. Supported: docx, pdf' });
        }

        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `cv-exports/${projectId}/${cvData.personal?.fullName?.replace(/\s+/g, '_') || 'CV'}_${templateStyle}_${Date.now()}.${fileExtension}`;
        const file = bucket.file(fileName);

        await file.save(documentBuffer, {
            metadata: {
                contentType: contentType,
                metadata: {
                    projectId: projectId,
                    templateStyle: templateStyle,
                    generatedAt: new Date().toISOString()
                }
            }
        });

        // Get signed URL (valid for 7 days)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Update project with export info
        await projectRef.update({
            [`exportedDocuments.${format}`]: {
                url: signedUrl,
                fileName: fileName,
                templateStyle: templateStyle,
                exportedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`${format.toUpperCase()} document generated successfully for project ${projectId}`);

        return res.status(200).json({
            success: true,
            downloadUrl: signedUrl,
            fileName: fileName,
            format: format
        });

    } catch (error) {
        console.error('Error generating CV document:', error);
        return res.status(500).json({
            error: 'Failed to generate document',
            message: error.message
        });
    }
});

// ========== WORD DOCUMENT GENERATOR ==========
async function generateWordDocument(cvData, templateStyle, generatedCvOptions) {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType, Header, Footer, PageNumber, NumberFormat, convertInchesToTwip, ImageRun } = docx;

    // Route to specific template generators
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'canva-executive') {
        return generateSchwarzBeigeModernTemplate(cvData, generatedCvOptions);
    } else if (templateStyle === 'green-yellow-modern' || templateStyle === 'canva-creative') {
        return generateGreenYellowModernTemplate(cvData, generatedCvOptions);
    }

    // Default template (fallback)
    // Canva-style color schemes based on template style (without # prefix for docx)
    const colorSchemes = {
        // Original schemes
        executive: { primary: '1A365D', secondary: 'C9B99A', accent: '2D3748', text: '1A202C', lightBg: 'F7FAFC' },
        modern: { primary: '2563EB', secondary: '3B82F6', accent: '1E40AF', text: '1F2937', lightBg: 'EFF6FF' },
        classic: { primary: '1F2937', secondary: '6B7280', accent: '374151', text: '111827', lightBg: 'F9FAFB' },
        creative: { primary: '7C3AED', secondary: '8B5CF6', accent: '6D28D9', text: '1F2937', lightBg: 'F5F3FF' },
        minimal: { primary: '000000', secondary: '4B5563', accent: '1F2937', text: '111827', lightBg: 'FFFFFF' },
        // New Canva-style templates
        'elegant-navy': { primary: '1e3a5f', secondary: 'c9a227', accent: '4a6fa5', text: '333333', lightBg: 'f5f5f5' },
        'modern-minimal': { primary: '000000', secondary: '666666', accent: '999999', text: '333333', lightBg: 'ffffff' },
        'creative-bold': { primary: 'e63946', secondary: '1d3557', accent: 'a8dadc', text: '1d3557', lightBg: 'f1faee' },
        'corporate-classic': { primary: '2c3e50', secondary: '3498db', accent: '95a5a6', text: '2c3e50', lightBg: 'ecf0f1' },
        'executive-gold': { primary: '1a1a2e', secondary: 'c9b99a', accent: '4a4a6a', text: '1a1a2e', lightBg: 'f8f6f3' },
        'tech-modern': { primary: '6366f1', secondary: '818cf8', accent: 'a5b4fc', text: '1e293b', lightBg: 'f8fafc' },
        'elegant-burgundy': { primary: '722f37', secondary: 'd4a574', accent: '9c6644', text: '3d2c2e', lightBg: 'faf7f5' },
        'swiss-clean': { primary: '333333', secondary: 'e74c3c', accent: '7f8c8d', text: '333333', lightBg: 'ffffff' }
    };

    const colors = colorSchemes[templateStyle] || colorSchemes['elegant-navy'];
    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const expertise = cvData.expertise || [];

    // Create document sections
    const children = [];

    // === HEADER SECTION ===
    // Name
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: personal.fullName || 'Name',
                bold: true,
                size: 56,
                color: colors.primary,
                font: 'Georgia'
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
    }));

    // Title
    if (personal.title) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: personal.title,
                    size: 24,
                    color: colors.secondary,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));
    }

    // Contact info line
    const contactParts = [];
    if (personal.email) contactParts.push(personal.email);
    if (personal.phone) contactParts.push(personal.phone);
    if (personal.location) contactParts.push(personal.location);

    if (contactParts.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: contactParts.join('  |  '),
                    size: 20,
                    color: colors.accent,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
        }));
    }

    // LinkedIn and Website
    const links = [];
    if (personal.linkedin) links.push(personal.linkedin);
    if (personal.website) links.push(personal.website);

    if (links.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: links.join('  |  '),
                    size: 18,
                    color: colors.secondary,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        }));
    }

    // Divider line
    children.push(new Paragraph({
        border: {
            bottom: { color: colors.secondary, size: 12, style: BorderStyle.SINGLE }
        },
        spacing: { after: 400 }
    }));

    // === SUMMARY SECTION ===
    if (cvData.summary) {
        children.push(createSectionHeading('PROFIL', colors));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: cvData.summary,
                    size: 22,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 400 },
            alignment: AlignmentType.JUSTIFIED
        }));
    }

    // === EXPERTISE SECTION ===
    if (expertise.length > 0) {
        children.push(createSectionHeading('KERNKOMPETENZEN', colors));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: expertise.join('  •  '),
                    size: 20,
                    color: colors.accent,
                    font: 'Arial'
                })
            ],
            spacing: { after: 400 },
            alignment: AlignmentType.CENTER
        }));
    }

    // === EXPERIENCE SECTION ===
    if (experience.length > 0) {
        children.push(createSectionHeading('BERUFSERFAHRUNG', colors));

        experience.forEach((exp, index) => {
            // Company and Role
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.role || 'Position',
                        bold: true,
                        size: 24,
                        color: colors.primary,
                        font: 'Arial'
                    })
                ],
                spacing: { before: index > 0 ? 300 : 0, after: 50 }
            }));

            // Company, Location, Period
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.company || '',
                        bold: true,
                        size: 20,
                        color: colors.text,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: exp.location ? `  |  ${exp.location}` : '',
                        size: 20,
                        color: colors.accent,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: `  |  ${exp.period || ''}`,
                        size: 20,
                        color: colors.secondary,
                        font: 'Arial'
                    })
                ],
                spacing: { after: 100 }
            }));

            // Description
            if (exp.description) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: exp.description,
                            italics: true,
                            size: 20,
                            color: colors.accent,
                            font: 'Arial'
                        })
                    ],
                    spacing: { after: 100 }
                }));
            }

            // Achievements
            if (exp.achievements && exp.achievements.length > 0) {
                exp.achievements.forEach(achievement => {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: '• ',
                                bold: true,
                                size: 20,
                                color: colors.secondary,
                                font: 'Arial'
                            }),
                            new TextRun({
                                text: achievement,
                                size: 20,
                                color: colors.text,
                                font: 'Arial'
                            })
                        ],
                        spacing: { after: 50 },
                        indent: { left: 360 }
                    }));
                });
            }
        });

        children.push(new Paragraph({ spacing: { after: 200 } }));
    }

    // === EDUCATION SECTION ===
    if (education.length > 0) {
        children.push(createSectionHeading('AUSBILDUNG', colors));

        education.forEach((edu, index) => {
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: `${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''}`,
                        bold: true,
                        size: 22,
                        color: colors.primary,
                        font: 'Arial'
                    })
                ],
                spacing: { before: index > 0 ? 200 : 0, after: 50 }
            }));

            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: edu.institution || '',
                        size: 20,
                        color: colors.text,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: `  |  ${edu.period || ''}`,
                        size: 20,
                        color: colors.secondary,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: edu.grade ? `  |  Note: ${edu.grade}` : '',
                        size: 20,
                        color: colors.accent,
                        font: 'Arial'
                    })
                ],
                spacing: { after: 50 }
            }));

            if (edu.highlights) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: edu.highlights,
                            italics: true,
                            size: 18,
                            color: colors.accent,
                            font: 'Arial'
                        })
                    ],
                    spacing: { after: 100 }
                }));
            }
        });

        children.push(new Paragraph({ spacing: { after: 200 } }));
    }

    // === SKILLS SECTION ===
    children.push(createSectionHeading('KENNTNISSE & FÄHIGKEITEN', colors));

    // Technical Skills
    if (skills.technical && skills.technical.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Fachkenntnisse: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.technical.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Soft Skills
    if (skills.soft && skills.soft.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Soft Skills: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.soft.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Languages
    if (skills.languages && skills.languages.length > 0) {
        const langString = skills.languages.map(l => `${l.language} (${l.level})`).join(', ');
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Sprachen: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: langString,
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Certifications
    if (skills.certifications && skills.certifications.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Zertifizierungen: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.certifications.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 200 }
        }));
    }

    // Create the document
    const doc = new Document({
        creator: 'APEX Executive',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV generated by APEX Executive',
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Arial',
                        size: 22
                    }
                }
            }
        },
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,    // 1 inch
                        right: 1440,
                        bottom: 1440,
                        left: 1440
                    }
                }
            },
            children: children
        }]
    });

    // Generate buffer
    return await docx.Packer.toBuffer(doc);

    // Helper function for section headings
    function createSectionHeading(title, colors) {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title,
                    bold: true,
                    size: 26,
                    color: colors.primary,
                    font: 'Georgia',
                    allCaps: true
                })
            ],
            border: {
                bottom: { color: colors.secondary, size: 6, style: BorderStyle.SINGLE }
            },
            spacing: { before: 400, after: 200 }
        });
    }
}

// ========== PDF DOCUMENT GENERATOR ==========
async function generatePdfDocument(cvData, templateStyle, generatedCvOptions) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
            bufferPages: true
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Canva-style color schemes (with # prefix for PDFKit)
        const colorSchemes = {
            // Original schemes
            executive: { primary: '#1A365D', secondary: '#C9B99A', accent: '#2D3748', text: '#1A202C' },
            modern: { primary: '#2563EB', secondary: '#3B82F6', accent: '#1E40AF', text: '#1F2937' },
            classic: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827' },
            creative: { primary: '#7C3AED', secondary: '#8B5CF6', accent: '#6D28D9', text: '#1F2937' },
            minimal: { primary: '#000000', secondary: '#4B5563', accent: '#1F2937', text: '#111827' },
            // New Canva-style templates
            'elegant-navy': { primary: '#1e3a5f', secondary: '#c9a227', accent: '#4a6fa5', text: '#333333' },
            'modern-minimal': { primary: '#000000', secondary: '#666666', accent: '#999999', text: '#333333' },
            'creative-bold': { primary: '#e63946', secondary: '#1d3557', accent: '#a8dadc', text: '#1d3557' },
            'corporate-classic': { primary: '#2c3e50', secondary: '#3498db', accent: '#95a5a6', text: '#2c3e50' },
            'executive-gold': { primary: '#1a1a2e', secondary: '#c9b99a', accent: '#4a4a6a', text: '#1a1a2e' },
            'tech-modern': { primary: '#6366f1', secondary: '#818cf8', accent: '#a5b4fc', text: '#1e293b' },
            'elegant-burgundy': { primary: '#722f37', secondary: '#d4a574', accent: '#9c6644', text: '#3d2c2e' },
            'swiss-clean': { primary: '#333333', secondary: '#e74c3c', accent: '#7f8c8d', text: '#333333' }
        };

        const colors = colorSchemes[templateStyle] || colorSchemes['elegant-navy'];
        const personal = cvData.personal || {};
        const experience = cvData.experience || [];
        const education = cvData.education || [];
        const skills = cvData.skills || {};
        const expertise = cvData.expertise || [];

        let yPos = 50;

        // === HEADER ===
        // Name
        doc.font('Helvetica-Bold')
           .fontSize(28)
           .fillColor(colors.primary)
           .text(personal.fullName || 'Name', 50, yPos, { align: 'center', width: 495 });
        yPos += 40;

        // Title
        if (personal.title) {
            doc.font('Helvetica')
               .fontSize(12)
               .fillColor(colors.secondary)
               .text(personal.title, 50, yPos, { align: 'center', width: 495 });
            yPos += 25;
        }

        // Contact line
        const contactParts = [];
        if (personal.email) contactParts.push(personal.email);
        if (personal.phone) contactParts.push(personal.phone);
        if (personal.location) contactParts.push(personal.location);

        if (contactParts.length > 0) {
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.accent)
               .text(contactParts.join('  |  '), 50, yPos, { align: 'center', width: 495 });
            yPos += 20;
        }

        // Links
        const links = [];
        if (personal.linkedin) links.push(personal.linkedin);
        if (personal.website) links.push(personal.website);

        if (links.length > 0) {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(colors.secondary)
               .text(links.join('  |  '), 50, yPos, { align: 'center', width: 495 });
            yPos += 20;
        }

        // Divider
        yPos += 10;
        doc.moveTo(50, yPos)
           .lineTo(545, yPos)
           .strokeColor(colors.secondary)
           .lineWidth(2)
           .stroke();
        yPos += 25;

        // === SUMMARY ===
        if (cvData.summary) {
            yPos = addSectionHeading(doc, 'PROFIL', yPos, colors);
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.text)
               .text(cvData.summary, 50, yPos, { width: 495, align: 'justify' });
            yPos = doc.y + 20;
        }

        // === EXPERTISE ===
        if (expertise.length > 0) {
            yPos = addSectionHeading(doc, 'KERNKOMPETENZEN', yPos, colors);
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.accent)
               .text(expertise.join('  •  '), 50, yPos, { width: 495, align: 'center' });
            yPos = doc.y + 20;
        }

        // === EXPERIENCE ===
        if (experience.length > 0) {
            yPos = addSectionHeading(doc, 'BERUFSERFAHRUNG', yPos, colors);

            experience.forEach((exp, index) => {
                // Check if we need a new page
                if (yPos > 700) {
                    doc.addPage();
                    yPos = 50;
                }

                // Role
                doc.font('Helvetica-Bold')
                   .fontSize(11)
                   .fillColor(colors.primary)
                   .text(exp.role || 'Position', 50, yPos);
                yPos = doc.y + 3;

                // Company, Location, Period
                const companyLine = [exp.company, exp.location, exp.period].filter(Boolean).join('  |  ');
                doc.font('Helvetica')
                   .fontSize(9)
                   .fillColor(colors.accent)
                   .text(companyLine, 50, yPos);
                yPos = doc.y + 5;

                // Description
                if (exp.description) {
                    doc.font('Helvetica-Oblique')
                       .fontSize(9)
                       .fillColor(colors.accent)
                       .text(exp.description, 50, yPos, { width: 495 });
                    yPos = doc.y + 5;
                }

                // Achievements
                if (exp.achievements && exp.achievements.length > 0) {
                    exp.achievements.forEach(achievement => {
                        doc.font('Helvetica')
                           .fontSize(9)
                           .fillColor(colors.text)
                           .text(`• ${achievement}`, 60, yPos, { width: 485, indent: 10 });
                        yPos = doc.y + 3;
                    });
                }

                yPos += 10;
            });
        }

        // === EDUCATION ===
        if (education.length > 0) {
            if (yPos > 650) {
                doc.addPage();
                yPos = 50;
            }

            yPos = addSectionHeading(doc, 'AUSBILDUNG', yPos, colors);

            education.forEach((edu) => {
                const degreeText = `${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''}`.trim();
                doc.font('Helvetica-Bold')
                   .fontSize(10)
                   .fillColor(colors.primary)
                   .text(degreeText, 50, yPos);
                yPos = doc.y + 3;

                const eduLine = [edu.institution, edu.period, edu.grade ? `Note: ${edu.grade}` : ''].filter(Boolean).join('  |  ');
                doc.font('Helvetica')
                   .fontSize(9)
                   .fillColor(colors.accent)
                   .text(eduLine, 50, yPos);
                yPos = doc.y + 3;

                if (edu.highlights) {
                    doc.font('Helvetica-Oblique')
                       .fontSize(8)
                       .fillColor(colors.accent)
                       .text(edu.highlights, 50, yPos, { width: 495 });
                    yPos = doc.y + 3;
                }

                yPos += 8;
            });
        }

        // === SKILLS ===
        if (yPos > 650) {
            doc.addPage();
            yPos = 50;
        }

        yPos = addSectionHeading(doc, 'KENNTNISSE & FÄHIGKEITEN', yPos, colors);

        if (skills.technical && skills.technical.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Fachkenntnisse: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.technical.join(', '));
            yPos = doc.y + 5;
        }

        if (skills.soft && skills.soft.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Soft Skills: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.soft.join(', '));
            yPos = doc.y + 5;
        }

        if (skills.languages && skills.languages.length > 0) {
            const langString = skills.languages.map(l => `${l.language} (${l.level})`).join(', ');
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Sprachen: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(langString);
            yPos = doc.y + 5;
        }

        if (skills.certifications && skills.certifications.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Zertifizierungen: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.certifications.join(', '));
        }

        doc.end();

        // Helper function for section headings
        function addSectionHeading(doc, title, yPos, colors) {
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .fillColor(colors.primary)
               .text(title, 50, yPos);

            const headingY = doc.y + 2;
            doc.moveTo(50, headingY)
               .lineTo(545, headingY)
               .strokeColor(colors.secondary)
               .lineWidth(1)
               .stroke();

            return headingY + 12;
        }
    });
}

// ========== PDFME TEMPLATE-BASED PDF GENERATION ==========
// Define reusable CV templates for Pdfme
const PDFME_CV_TEMPLATES = {
    // Schwarz Beige Modern - Executive/Senior Template
    'schwarz-beige-modern': {
        name: 'Schwarz Beige Modern',
        colors: {
            headerBg: '#3d3d3d',
            headerText: '#ffffff',
            primary: '#3d3d3d',
            secondary: '#c9a227',
            text: '#333333',
            lightText: '#666666'
        },
        // Template will be built dynamically based on CV data
    },
    // Green Yellow Modern - Young Professional Template
    'green-yellow-modern': {
        name: 'Green Yellow Modern',
        colors: {
            primary: '#2d8a8a',
            secondary: '#f5c842',
            headerBg: '#2d8a8a',
            text: '#333333',
            lightText: '#666666'
        }
    },
    // Minimalist Clean
    'minimalist': {
        name: 'Minimalist Clean',
        colors: {
            primary: '#000000',
            secondary: '#666666',
            text: '#333333',
            lightText: '#999999'
        }
    },
    // Corporate Classic
    'corporate': {
        name: 'Corporate Classic',
        colors: {
            primary: '#1e3a5f',
            secondary: '#c9a227',
            text: '#333333',
            lightText: '#666666'
        }
    }
};

// Generate PDF using Pdfme templates
async function generatePdfWithPdfme(cvData, templateStyle) {
    const templateConfig = PDFME_CV_TEMPLATES[templateStyle] || PDFME_CV_TEMPLATES['corporate'];
    const colors = templateConfig.colors;

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const summary = cvData.summary || '';
    const expertise = cvData.expertise || [];

    // A4 dimensions in mm: 210 x 297
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    // Build schemas dynamically based on CV content
    const schemas = [];
    const inputs = {};
    let yPos = margin;

    // ===== HEADER BACKGROUND (for dark header templates) =====
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate') {
        schemas.push({
            name: 'headerBg',
            type: 'rectangle',
            position: { x: 0, y: 0 },
            width: pageWidth,
            height: 45,
            color: colors.headerBg
        });
        inputs.headerBg = '';
        yPos = 8;
    }

    // ===== NAME =====
    schemas.push({
        name: 'fullName',
        type: 'text',
        position: { x: margin, y: yPos },
        width: contentWidth,
        height: 15,
        fontSize: 28,
        fontColor: templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate' ? colors.headerText : colors.primary,
        alignment: 'center',
        fontName: 'Helvetica-Bold'
    });
    inputs.fullName = (personal.fullName || 'Name').toUpperCase();
    yPos += 12;

    // ===== TITLE =====
    if (personal.title) {
        schemas.push({
            name: 'title',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 8,
            fontSize: 12,
            fontColor: templateStyle === 'schwarz-beige-modern' ? colors.secondary : (templateStyle === 'corporate' ? colors.headerText : colors.secondary),
            alignment: 'center'
        });
        inputs.title = personal.title;
        yPos += 10;
    }

    // ===== CONTACT INFO =====
    const contactParts = [];
    if (personal.email) contactParts.push(personal.email);
    if (personal.phone) contactParts.push(personal.phone);
    if (personal.location) contactParts.push(personal.location);

    if (contactParts.length > 0) {
        schemas.push({
            name: 'contact',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 9,
            fontColor: templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate' ? '#cccccc' : colors.lightText,
            alignment: 'center'
        });
        inputs.contact = contactParts.join('  |  ');
        yPos += 12;
    }

    // Move past header area
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate') {
        yPos = 50;
    }

    // ===== DIVIDER LINE =====
    schemas.push({
        name: 'divider1',
        type: 'line',
        position: { x: margin, y: yPos },
        width: contentWidth,
        height: 1,
        color: colors.secondary
    });
    inputs.divider1 = '';
    yPos += 8;

    // ===== SUMMARY/PROFILE =====
    if (summary) {
        schemas.push({
            name: 'summaryLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.summaryLabel = 'PROFIL';
        yPos += 7;

        schemas.push({
            name: 'summaryText',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 20,
            fontSize: 9,
            fontColor: colors.text,
            lineHeight: 1.4
        });
        inputs.summaryText = summary;
        yPos += 22;
    }

    // ===== EXPERTISE/KERNKOMPETENZEN =====
    if (expertise.length > 0) {
        schemas.push({
            name: 'expertiseLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.expertiseLabel = 'KERNKOMPETENZEN';
        yPos += 7;

        schemas.push({
            name: 'expertiseText',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 8,
            fontSize: 9,
            fontColor: colors.secondary,
            alignment: 'center'
        });
        inputs.expertiseText = expertise.join('  •  ');
        yPos += 12;
    }

    // ===== EXPERIENCE =====
    if (experience.length > 0) {
        schemas.push({
            name: 'expLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.expLabel = 'BERUFSERFAHRUNG';
        yPos += 8;

        experience.forEach((exp, idx) => {
            if (yPos > 260) return; // Prevent overflow (would need multi-page for full support)

            // Role
            schemas.push({
                name: `expRole${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth * 0.7,
                height: 6,
                fontSize: 10,
                fontColor: colors.primary,
                fontName: 'Helvetica-Bold'
            });
            inputs[`expRole${idx}`] = exp.role || 'Position';

            // Period (right aligned)
            schemas.push({
                name: `expPeriod${idx}`,
                type: 'text',
                position: { x: margin + contentWidth * 0.7, y: yPos },
                width: contentWidth * 0.3,
                height: 6,
                fontSize: 9,
                fontColor: colors.lightText,
                alignment: 'right'
            });
            inputs[`expPeriod${idx}`] = exp.period || '';
            yPos += 6;

            // Company
            schemas.push({
                name: `expCompany${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 9,
                fontColor: colors.secondary
            });
            inputs[`expCompany${idx}`] = [exp.company, exp.location].filter(Boolean).join(', ');
            yPos += 6;

            // Description/Achievements
            if (exp.description || (exp.achievements && exp.achievements.length > 0)) {
                const achievementText = exp.achievements ?
                    exp.achievements.map(a => `• ${a}`).join('\n') :
                    (exp.description || '');

                schemas.push({
                    name: `expDesc${idx}`,
                    type: 'text',
                    position: { x: margin + 3, y: yPos },
                    width: contentWidth - 3,
                    height: Math.min(25, 5 * (exp.achievements?.length || 2)),
                    fontSize: 8,
                    fontColor: colors.text,
                    lineHeight: 1.3
                });
                inputs[`expDesc${idx}`] = achievementText;
                yPos += Math.min(25, 5 * (exp.achievements?.length || 2)) + 3;
            }

            yPos += 5;
        });
    }

    // ===== EDUCATION =====
    if (education.length > 0 && yPos < 240) {
        schemas.push({
            name: 'eduLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.eduLabel = 'AUSBILDUNG';
        yPos += 8;

        education.forEach((edu, idx) => {
            if (yPos > 270) return;

            schemas.push({
                name: `eduDegree${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth * 0.7,
                height: 5,
                fontSize: 9,
                fontColor: colors.primary,
                fontName: 'Helvetica-Bold'
            });
            inputs[`eduDegree${idx}`] = `${edu.degree || ''} ${edu.field || ''}`.trim();

            schemas.push({
                name: `eduPeriod${idx}`,
                type: 'text',
                position: { x: margin + contentWidth * 0.7, y: yPos },
                width: contentWidth * 0.3,
                height: 5,
                fontSize: 8,
                fontColor: colors.lightText,
                alignment: 'right'
            });
            inputs[`eduPeriod${idx}`] = edu.period || '';
            yPos += 5;

            schemas.push({
                name: `eduInst${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.lightText
            });
            inputs[`eduInst${idx}`] = edu.institution || '';
            yPos += 8;
        });
    }

    // ===== SKILLS =====
    if (yPos < 260) {
        schemas.push({
            name: 'skillsLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.skillsLabel = 'KENNTNISSE & FÄHIGKEITEN';
        yPos += 8;

        if (skills.technical && skills.technical.length > 0) {
            schemas.push({
                name: 'techSkills',
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.text
            });
            inputs.techSkills = `Fachkenntnisse: ${skills.technical.join(', ')}`;
            yPos += 6;
        }

        if (skills.languages && skills.languages.length > 0) {
            schemas.push({
                name: 'langSkills',
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.text
            });
            inputs.langSkills = `Sprachen: ${skills.languages.map(l => `${l.language} (${l.level})`).join(', ')}`;
            yPos += 6;
        }
    }

    // Build the template
    const template = {
        basePdf: BLANK_PDF,
        schemas: [schemas]
    };

    // Generate PDF
    const plugins = { text, line, rectangle };
    const pdf = await generate({
        template,
        inputs: [inputs],
        plugins
    });

    return Buffer.from(pdf);
}

// ========== SCHWARZ BEIGE MODERN TEMPLATE (Canva Style) ==========
// Two-column layout with dark header, photo placeholder, beige accents
async function generateSchwarzBeigeModernTemplate(cvData, generatedCvOptions) {
    const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType, convertInchesToTwip } = docx;

    const colors = {
        headerBg: '3d3d3d',      // Dark gray/charcoal header
        headerText: 'FFFFFF',    // White text on header
        sidebarBg: 'f5f5f5',     // Light gray sidebar
        primary: '3d3d3d',       // Dark gray for headings
        secondary: 'c9a227',     // Gold/beige accent (not heavily used in this template)
        text: '333333',          // Dark text
        lightText: '666666'      // Light gray text
    };

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const languages = skills.languages || [];

    // Helper to create section heading
    const createSectionHeading = (title) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title.toUpperCase(),
                    bold: true,
                    size: 22,
                    font: 'Arial',
                    color: colors.primary,
                    characterSpacing: 40
                })
            ],
            spacing: { before: 300, after: 200 }
        });
    };

    // ===== HEADER SECTION (Full width dark background) =====
    const headerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    // Photo placeholder cell
                    new TableCell({
                        width: { size: 25, type: WidthType.PERCENTAGE },
                        shading: { fill: colors.headerBg, type: ShadingType.CLEAR },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: '[FOTO]',
                                        color: '888888',
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 400, after: 400 }
                            })
                        ],
                        verticalAlign: 'center'
                    }),
                    // Name and title cell
                    new TableCell({
                        width: { size: 75, type: WidthType.PERCENTAGE },
                        shading: { fill: colors.headerBg, type: ShadingType.CLEAR },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.fullName || 'VORNAME').split(' ')[0]?.toUpperCase() || 'VORNAME',
                                        bold: true,
                                        size: 56,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 60
                                    })
                                ],
                                spacing: { before: 200 }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.fullName || 'NACHNAME').split(' ').slice(1).join(' ')?.toUpperCase() || 'NACHNAME',
                                        bold: true,
                                        size: 56,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 60
                                    })
                                ]
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.title || 'POSITION').toUpperCase(),
                                        size: 20,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 100
                                    })
                                ],
                                spacing: { before: 100, after: 200 }
                            })
                        ],
                        verticalAlign: 'center'
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // ===== CONTACT ROW =====
    const contactInfo = [];
    if (personal.phone) contactInfo.push(`📞 ${personal.phone}`);
    if (personal.email) contactInfo.push(`✉ ${personal.email}`);
    if (personal.location) contactInfo.push(`📍 ${personal.location}`);

    const contactRow = new Paragraph({
        children: [
            new TextRun({
                text: contactInfo.join('     '),
                size: 18,
                font: 'Arial',
                color: colors.lightText
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 300 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'e0e0e0' }
        }
    });

    // ===== MAIN CONTENT (Two columns) =====
    // Left column: Bildung, Skills, Sprachen
    // Right column: Berufserfahrung

    const leftColumnContent = [];
    const rightColumnContent = [];

    // LEFT COLUMN - Education
    leftColumnContent.push(createSectionHeading('Bildung'));
    education.forEach(edu => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: `${edu.degree || ''} ${edu.field || ''}`.trim(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.primary
                })
            ],
            spacing: { before: 100 }
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.institution || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.period || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 150 }
        }));
    });

    // LEFT COLUMN - Skills
    leftColumnContent.push(createSectionHeading('Skills'));
    const allSkills = [...(skills.technical || []), ...(skills.soft || [])];
    allSkills.forEach(skill => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: skill,
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ],
            spacing: { after: 50 }
        }));
    });

    // LEFT COLUMN - Languages
    leftColumnContent.push(createSectionHeading('Sprachen'));
    languages.forEach(lang => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: lang.language || '',
                    bold: true,
                    size: 18,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: lang.level || '',
                    italics: true,
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 100 }
        }));
    });

    // RIGHT COLUMN - Experience
    rightColumnContent.push(createSectionHeading('Berufserfahrung'));
    experience.forEach(exp => {
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.period || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.lightText,
                    characterSpacing: 20
                })
            ],
            spacing: { before: 150 }
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (exp.role || '').toUpperCase(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.company || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        if (exp.description) {
            rightColumnContent.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.description,
                        size: 18,
                        font: 'Arial',
                        color: colors.lightText
                    })
                ],
                spacing: { before: 50, after: 100 }
            }));
        }
        if (exp.achievements && exp.achievements.length > 0) {
            exp.achievements.forEach(achievement => {
                rightColumnContent.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: `• ${achievement}`,
                            size: 18,
                            font: 'Arial',
                            color: colors.text
                        })
                    ],
                    indent: { left: 200 }
                }));
            });
        }
    });

    // Two-column table for main content
    const mainContentTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        children: leftColumnContent,
                        margins: { top: 200, bottom: 200, left: 200, right: 200 }
                    }),
                    new TableCell({
                        width: { size: 65, type: WidthType.PERCENTAGE },
                        children: rightColumnContent,
                        margins: { top: 200, bottom: 200, left: 300, right: 200 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // Create document
    const doc = new Document({
        creator: 'APEX Executive',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV - Schwarz Beige Modern Template',
        sections: [{
            properties: {
                page: {
                    margin: { top: 0, right: 0, bottom: 400, left: 0 }
                }
            },
            children: [headerTable, contactRow, mainContentTable]
        }]
    });

    return await docx.Packer.toBuffer(doc);
}

// ========== GREEN YELLOW MODERN TEMPLATE (Canva Style) ==========
// Creative design with teal/yellow accents, photo, modern layout
async function generateGreenYellowModernTemplate(cvData, generatedCvOptions) {
    const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType } = docx;

    const colors = {
        primary: '2d8a8a',       // Teal/petrol
        secondary: 'f5c842',     // Yellow accent
        headerBg: '2d8a8a',      // Teal header
        sidebarBg: '2d8a8a',     // Teal sidebar
        white: 'FFFFFF',
        text: '333333',
        lightText: '666666'
    };

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const languages = skills.languages || [];

    // Helper for yellow section headings
    const createSectionHeading = (title, color = colors.secondary) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title.toUpperCase(),
                    bold: true,
                    size: 24,
                    font: 'Arial',
                    color: color,
                    characterSpacing: 40
                })
            ],
            spacing: { before: 300, after: 200 }
        });
    };

    // ===== HEADER with yellow accent bar =====
    const yellowBar = new Paragraph({
        shading: { fill: colors.secondary, type: ShadingType.CLEAR },
        spacing: { after: 0 },
        children: [new TextRun({ text: ' ', size: 40 })]
    });

    // ===== HEADER ROW (Photo + Name/Title/Profile) =====
    const headerContent = [];

    // Name
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: (personal.fullName || 'NAME').toUpperCase(),
                bold: true,
                size: 48,
                font: 'Georgia',
                color: colors.secondary
            })
        ],
        spacing: { before: 200 }
    }));

    // Title
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: personal.title || 'POSITION',
                size: 22,
                font: 'Arial',
                color: colors.text
            })
        ],
        spacing: { after: 100 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: colors.text }
        }
    }));

    // Profile section
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: 'P R O F I L E',
                bold: true,
                size: 22,
                font: 'Arial',
                color: colors.secondary,
                characterSpacing: 40
            })
        ],
        spacing: { before: 200, after: 100 }
    }));

    if (cvData.summary) {
        headerContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: cvData.summary,
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ],
            spacing: { after: 200 }
        }));
    }

    const headerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    // Photo placeholder
                    new TableCell({
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: '[FOTO]',
                                        color: '888888',
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 400, after: 400 }
                            })
                        ],
                        shading: { fill: 'f0f0f0', type: ShadingType.CLEAR },
                        verticalAlign: 'center'
                    }),
                    // Name, title, profile
                    new TableCell({
                        width: { size: 70, type: WidthType.PERCENTAGE },
                        children: headerContent,
                        margins: { left: 300, right: 200, top: 200, bottom: 200 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // ===== CONTACT BAR =====
    const contactInfo = [];
    if (personal.phone) contactInfo.push(`• ${personal.phone}`);
    if (personal.email) contactInfo.push(`• ${personal.email}`);
    if (personal.location) contactInfo.push(`• ${personal.location}`);

    const contactBar = new Paragraph({
        children: [
            new TextRun({
                text: contactInfo.join('     '),
                size: 18,
                font: 'Arial',
                color: colors.text
            })
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 100, after: 200 },
        indent: { left: 200 }
    });

    // ===== MAIN CONTENT (Two columns) =====
    const leftColumnContent = [];
    const rightColumnContent = [];

    // LEFT COLUMN - Skills (yellow headings)
    leftColumnContent.push(createSectionHeading('S K I L L S'));
    const allSkills = [...(skills.technical || []), ...(skills.soft || [])];
    allSkills.forEach(skill => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: `• ${skill}`,
                    size: 18,
                    font: 'Arial',
                    color: colors.primary
                })
            ],
            spacing: { after: 50 }
        }));
    });

    // LEFT COLUMN - Education
    leftColumnContent.push(createSectionHeading('E D U C A T I O N'));
    education.forEach(edu => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (edu.degree || '').toUpperCase(),
                    bold: true,
                    size: 18,
                    font: 'Arial',
                    color: colors.secondary
                })
            ],
            spacing: { before: 100 }
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.institution || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.period || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 150 }
        }));
    });

    // RIGHT COLUMN - Experience
    rightColumnContent.push(createSectionHeading('E X P E R I E N C E'));
    experience.forEach(exp => {
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (exp.role || '').toUpperCase(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.secondary
                })
            ],
            spacing: { before: 150 }
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.company || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.period || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ]
        }));
        if (exp.description || (exp.achievements && exp.achievements.length > 0)) {
            const descText = exp.description || (exp.achievements ? exp.achievements[0] : '');
            rightColumnContent.push(new Paragraph({
                children: [
                    new TextRun({
                        text: `• ${descText}`,
                        size: 18,
                        font: 'Arial',
                        color: colors.text
                    })
                ],
                spacing: { before: 50, after: 100 },
                indent: { left: 200 }
            }));
        }
    });

    // Two-column table for main content
    const mainContentTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        children: leftColumnContent,
                        margins: { top: 100, bottom: 200, left: 300, right: 200 }
                    }),
                    new TableCell({
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        children: rightColumnContent,
                        margins: { top: 100, bottom: 200, left: 200, right: 300 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // Create document
    const doc = new Document({
        creator: 'APEX Executive',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV - Green Yellow Modern Template',
        sections: [{
            properties: {
                page: {
                    margin: { top: 0, right: 0, bottom: 400, left: 0 }
                }
            },
            children: [yellowBar, headerTable, contactBar, mainContentTable]
        }]
    });

    return await docx.Packer.toBuffer(doc);
}
