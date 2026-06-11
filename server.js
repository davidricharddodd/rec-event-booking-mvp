const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDatabase, query } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper to generate a booking reference (e.g. REC-123456)
function generateReference() {
  return 'REC-' + Math.floor(100000 + Math.random() * 900000);
}

// ----------------------------------------------------
// BACKGROUND WORKERS (Simulators)
// ----------------------------------------------------
// Simulated Email Worker: polls pending emails and marks them sent
setInterval(async () => {
  try {
    const pendingJobs = await query.all(
      "SELECT * FROM email_jobs WHERE status = 'pending' AND send_at <= ?",
      [new Date().toISOString()]
    );
    for (const job of pendingJobs) {
      await query.run(
        "UPDATE email_jobs SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?",
        [new Date().toISOString(), job.id]
      );
      console.log(`[Email Simulator] Sent email: "${job.subject}" to ${job.recipient_email}`);
    }
  } catch (err) {
    console.error('Error in email background worker:', err);
  }
}, 5000);

// ----------------------------------------------------
// PUBLIC API: CATEGORIES & EVENTS
// ----------------------------------------------------
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await query.all('SELECT * FROM categories');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const { section, category, status } = req.query;
    let sql = `
      SELECT e.*, c.name as category_name, c.color_hex, c.website_section,
             MIN(ed.start_datetime) as next_start,
             SUM(ed.capacity) as total_capacity,
             SUM(ed.sold_count) as total_sold
      FROM events e
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN event_dates ed ON e.id = ed.event_id
    `;
    const params = [];
    const conditions = [];

    if (section) {
      conditions.push("(c.website_section = ? OR c.website_section = 'all')");
      params.push(section);
    }
    if (category) {
      conditions.push("c.slug = ?");
      params.push(category);
    }
    if (status) {
      conditions.push("e.status = ?");
      params.push(status);
    } else {
      conditions.push("e.status = 'published'");
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY e.id ORDER BY next_start ASC';

    const events = await query.all(sql, params);
    
    // For each event, fetch dates details
    for (const event of events) {
      event.dates = await query.all(
        'SELECT * FROM event_dates WHERE event_id = ? ORDER BY start_datetime ASC',
        [event.id]
      );
    }

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await query.get(
      `SELECT e.*, c.name as category_name, c.color_hex, c.website_section
       FROM events e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.id = ?`,
      [req.params.id]
    );

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Fetch dates
    event.dates = await query.all(
      'SELECT * FROM event_dates WHERE event_id = ? ORDER BY start_datetime ASC',
      [event.id]
    );

    // Fetch registration types for each date
    for (const date of event.dates) {
      date.registration_types = await query.all(
        'SELECT * FROM registration_types WHERE event_date_id = ? ORDER BY price_pence ASC',
        [date.id]
      );
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new event (Admin)
app.post('/api/events', async (req, res) => {
  try {
    const { title, description, category_id, type, status, dates } = req.body;
    
    const eventResult = await query.run(
      'INSERT INTO events (title, description, category_id, type, status) VALUES (?, ?, ?, ?, ?)',
      [title, description, category_id, type, status || 'draft']
    );
    const eventId = eventResult.id;

    if (dates && dates.length > 0) {
      for (const date of dates) {
        const dateResult = await query.run(
          'INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity) VALUES (?, ?, ?, ?, ?)',
          [eventId, date.start_datetime, date.end_datetime, date.location, date.capacity]
        );
        const dateId = dateResult.id;

        if (date.registration_types && date.registration_types.length > 0) {
          for (const regType of date.registration_types) {
            await query.run(
              'INSERT INTO registration_types (event_date_id, name, price_pence, capacity) VALUES (?, ?, ?, ?)',
              [dateId, regType.name, regType.price_pence, regType.capacity]
            );
          }
        }
      }
    }

    res.status(201).json({ id: eventId, message: 'Event created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// INTEGRATION: DYNAMICS 365 CRM SIMULATOR
// ----------------------------------------------------
app.post('/api/membership/lookup', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const emailLower = email.toLowerCase();
    const isMember = 
      emailLower.endsWith('rec.uk.com') ||
      emailLower.endsWith('company.co.uk') ||
      emailLower.endsWith('hiring.com') ||
      emailLower.endsWith('agencies.org') ||
      emailLower.includes('member') ||
      emailLower === 'sarah@skynet.net';

    res.json({
      email,
      member_status: isMember ? 'active' : 'none',
      dynamics_contact_id: isMember ? 'CONT-' + Math.floor(10000 + Math.random() * 90000) : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// BOOKING & CHECKOUT (WITH MOCK STRIPE WEBHOOKS)
// ----------------------------------------------------
app.post('/api/checkout', async (req, res) => {
  try {
    const { delegate, basketItems } = req.body;
    if (!delegate || !basketItems || basketItems.length === 0) {
      return res.status(400).json({ error: 'Missing delegate or basket items' });
    }

    // Verify capacities before payment
    for (const item of basketItems) {
      const regType = await query.get(
        'SELECT sold_count, capacity FROM registration_types WHERE id = ?',
        [item.registration_type_id]
      );
      if (!regType) {
        return res.status(404).json({ error: `Registration type ${item.registration_type_id} not found` });
      }
      if (regType.sold_count >= regType.capacity) {
        return res.status(409).json({ error: `Ticket class "${item.name}" is sold out.` });
      }
    }

    // Upsert delegate
    let delegateRecord = await query.get('SELECT * FROM delegates WHERE email = ?', [delegate.email]);
    let delegateId;
    if (delegateRecord) {
      delegateId = delegateRecord.id;
      await query.run(
        'UPDATE delegates SET first_name = ?, last_name = ?, organisation = ?, phone = ?, dietary_requirements = ?, accessibility_needs = ?, member_status = ? WHERE id = ?',
        [delegate.first_name, delegate.last_name, delegate.organisation, delegate.phone, delegate.dietary_requirements, delegate.accessibility_needs, delegate.member_status || 'none', delegateId]
      );
    } else {
      const result = await query.run(
        'INSERT INTO delegates (first_name, last_name, email, organisation, phone, dietary_requirements, accessibility_needs, member_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [delegate.first_name, delegate.last_name, delegate.email, delegate.organisation, delegate.phone, delegate.dietary_requirements, delegate.accessibility_needs, delegate.member_status || 'none']
      );
      delegateId = result.id;
    }

    // Create simulated Stripe Payment Intent ID
    const totalAmount = basketItems.reduce((acc, item) => acc + item.price_pence, 0);
    const stripePI = totalAmount > 0 ? 'pi_mock_' + Math.floor(100000 + Math.random() * 900000) : null;

    const confirmedBookings = [];

    for (const item of basketItems) {
      const reference = generateReference();
      const qrCodeB64 = `data:image/png;base64,QR_MOCK_PAYLOAD_${reference}`;

      // Insert booking
      const bookingResult = await query.run(
        `INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, stripe_payment_intent_id, qr_code_b64, checked_in)
         VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 0)`,
        [reference, item.event_date_id, delegateId, item.registration_type_id, totalAmount > 0 ? 'pending' : 'paid', item.price_pence, stripePI, qrCodeB64]
      );
      const bookingId = bookingResult.id;

      confirmedBookings.push({
        id: bookingId,
        reference,
        event_name: item.event_name,
        date_id: item.event_date_id,
        price_pence: item.price_pence,
        qr_code_b64: qrCodeB64
      });
    }

    res.json({
      success: true,
      stripe_payment_intent_id: stripePI,
      bookings: confirmedBookings,
      total_amount_pence: totalAmount,
      delegate_id: delegateId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm payment completion
app.post('/api/checkout/confirm', async (req, res) => {
  try {
    const { stripe_payment_intent_id, delegate_id, bookings } = req.body;

    for (const booking of bookings) {
      await query.run(
        "UPDATE bookings SET payment_status = 'paid' WHERE id = ?",
        [booking.id]
      );

      const bInfo = await query.get(
        `SELECT b.*, ed.start_datetime, ed.end_datetime, ed.location, ed.event_id, e.title as event_title, rt.name as ticket_name, d.email, d.first_name, d.organisation
         FROM bookings b
         JOIN event_dates ed ON b.event_date_id = ed.id
         JOIN events e ON ed.event_id = e.id
         JOIN registration_types rt ON b.registration_type_id = rt.id
         JOIN delegates d ON b.delegate_id = d.id
         WHERE b.id = ?`,
        [booking.id]
      );

      if (bInfo) {
        await query.run('UPDATE event_dates SET sold_count = sold_count + 1 WHERE id = ?', [bInfo.event_date_id]);
        await query.run('UPDATE registration_types SET sold_count = sold_count + 1 WHERE id = ?', [bInfo.registration_type_id]);

        const payResult = await query.run(
          "INSERT INTO payments (booking_id, stripe_charge_id, amount_pence, vat_pence, status) VALUES (?, ?, ?, ?, 'succeeded')",
          [booking.id, 'ch_mock_' + Math.floor(100000 + Math.random() * 900000), bInfo.amount_pence, Math.floor(bInfo.amount_pence * 0.2)]
        );

        const now = new Date();
        
        // Instant Confirmation HTML (with mock .ics file details)
        await query.run(
          `INSERT INTO email_jobs (type, booking_id, recipient_email, subject, body_html, send_at, status)
           VALUES ('confirmation', ?, ?, ?, ?, ?, 'pending')`,
          [
            booking.id,
            bInfo.email,
            `Booking Confirmed: ${bInfo.event_title}`,
            `<h1>Hi ${bInfo.first_name},</h1>
             <p>Your booking for <strong>${bInfo.event_title}</strong> is confirmed!</p>
             <p><strong>Booking Ref:</strong> ${bInfo.reference}</p>
             <p><strong>Ticket Type:</strong> ${bInfo.ticket_name}</p>
             <p><strong>Date/Time:</strong> ${bInfo.start_datetime}</p>
             <p><strong>Venue:</strong> ${bInfo.location}</p>
             <div style="margin:20px 0; padding:15px; border: 1px dashed #ccc; border-radius: 8px; max-width: 300px;">
               <div style="font-weight:bold; font-size:16px; margin-bottom:5px;">🎫 REC DELEGATE BADGE</div>
               <img src="${bInfo.qr_code_b64}" width="200" alt="Ticket QR Badge"/>
               <div style="font-size:12px; color:#555; text-align:center; margin-top:5px;">Scan at check-in desk</div>
             </div>
             <p>Present this badge on your mobile device for immediate entry on the day.</p>`,
            now.toISOString()
          ]
        );

        // Instant Receipt
        await query.run(
          `INSERT INTO email_jobs (type, booking_id, recipient_email, subject, body_html, send_at, status)
           VALUES ('receipt', ?, ?, ?, ?, ?, 'pending')`,
          [
            booking.id,
            bInfo.email,
            `Payment Receipt for booking ${bInfo.reference}`,
            `<h1>Hi ${bInfo.first_name},</h1>
             <p>Here is your receipt for transaction: ${bInfo.reference}</p>
             <hr />
             <p>${bInfo.event_title} - ${bInfo.ticket_name}: £${(bInfo.amount_pence / 100).toFixed(2)}</p>
             <p>VAT (20%): £${((bInfo.amount_pence * 0.2) / 100).toFixed(2)}</p>
             <h3>Total Paid: £${(bInfo.amount_pence / 100).toFixed(2)}</h3>`,
            now.toISOString()
          ]
        );

        // Schedule 24h Reminder
        const startDt = new Date(bInfo.start_datetime);
        const reminderTime = new Date(startDt.getTime() - 24 * 60 * 60 * 1000);
        await query.run(
          `INSERT INTO email_jobs (type, booking_id, recipient_email, subject, body_html, send_at, status)
           VALUES ('reminder', ?, ?, ?, ?, ?, 'pending')`,
          [
            booking.id,
            bInfo.email,
            `Reminder: ${bInfo.event_title} is tomorrow!`,
            `<p>Hi ${bInfo.first_name}, this is a reminder that <strong>${bInfo.event_title}</strong> starts tomorrow at ${bInfo.start_datetime}.</p>
             <p>Location: ${bInfo.location}</p>`,
            reminderTime.toISOString()
          ]
        );

        // Log Dynamics CRM Sync (Simulated Integration Queue)
        let contactStatus = 'success';
        let contactError = null;
        if (bInfo.email.toLowerCase() === 'conflict@test.com') {
          contactStatus = 'failed';
          contactError = 'Dynamics CRM Sync Conflict: Multiple contact records match email conflict@test.com';
        }

        await query.run(
          "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, crm_id, error, payload) VALUES ('to_crm', 'Contact', ?, ?, ?, ?, ?)",
          [
            delegate_id,
            contactStatus,
            contactStatus === 'success' ? 'CONT-' + Math.floor(10000 + Math.random() * 90000) : null,
            contactError,
            JSON.stringify({ first_name: bInfo.first_name, email: bInfo.email, organisation: bInfo.organisation })
          ]
        );

        if (contactStatus === 'success') {
          await query.run(
            "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, crm_id, payload) VALUES ('to_crm', 'EventRegistration', ?, 'success', ?, ?)",
            [
              booking.id,
              'REG-' + Math.floor(10000 + Math.random() * 90000),
              JSON.stringify({ booking_reference: bInfo.reference, event_title: bInfo.event_title, ticket_name: bInfo.ticket_name })
            ]
          );

          await query.run(
            "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, crm_id, payload) VALUES ('to_crm', 'Payment', ?, 'success', ?, ?)",
            [
              payResult.id,
              'PAY-' + Math.floor(10000 + Math.random() * 90000),
              JSON.stringify({ charge_id: stripe_payment_intent_id, amount: bInfo.amount_pence })
            ]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// ADMIN API: DASHBOARD & MANAGEMENT
// ----------------------------------------------------
app.get('/api/admin/dashboard/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const regToday = await query.get(
      "SELECT COUNT(*) as count FROM bookings WHERE DATE(created_at) = ?",
      [today]
    );

    const revenue = await query.get(
      "SELECT SUM(amount_pence) as total FROM payments WHERE status = 'succeeded'"
    );

    const activeEvents = await query.get(
      "SELECT COUNT(*) as count FROM events WHERE status = 'published'"
    );

    const totalRegs = await query.get(
      "SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'"
    );

    const events = await query.all(`
      SELECT e.*, c.name as category_name, c.color_hex,
             MIN(ed.start_datetime) as next_start,
             SUM(ed.capacity) as total_capacity,
             SUM(ed.sold_count) as total_sold
      FROM events e
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN event_dates ed ON e.id = ed.event_id
      GROUP BY e.id
      ORDER BY next_start ASC
    `);

    // Needs attention panel (Events at < 50% capacity starting within 14 days)
    const needsAttention = await query.all(`
      SELECT e.title, ed.start_datetime, ed.capacity, ed.sold_count, ed.id as event_date_id
      FROM event_dates ed
      JOIN events e ON ed.event_id = e.id
      WHERE ed.start_datetime >= datetime('now') 
        AND ed.start_datetime <= datetime('now', '+14 days')
        AND (CAST(ed.sold_count AS FLOAT) / ed.capacity) < 0.5
    `);

    res.json({
      stats: {
        registrations_today: regToday.count,
        total_revenue_pence: revenue.total || 0,
        active_events: activeEvents.count,
        total_registrations: totalRegs.count
      },
      events,
      needsAttention
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/events/:dateId/attendees', async (req, res) => {
  try {
    const attendees = await query.all(
      `SELECT b.id as booking_id, b.reference, b.payment_status, b.status as booking_status, b.amount_pence, b.created_at, b.checked_in, b.checked_in_at,
              d.first_name, d.last_name, d.email, d.organisation, d.phone, d.dietary_requirements, d.accessibility_needs,
              rt.name as ticket_name,
              EXISTS(SELECT 1 FROM crm_sync_logs WHERE entity_type='EventRegistration' AND entity_id=b.id AND status='success') as crm_synced
       FROM bookings b
       JOIN delegates d ON b.delegate_id = d.id
       JOIN registration_types rt ON b.registration_type_id = rt.id
       WHERE b.event_date_id = ?`,
      [req.params.dateId]
    );
    res.json(attendees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/bookings/:id/refund', async (req, res) => {
  try {
    const booking = await query.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    await query.run("UPDATE bookings SET payment_status = 'refunded', status = 'cancelled' WHERE id = ?", [req.params.id]);
    await query.run(
      "UPDATE payments SET status = 'refunded', refunded_amount_pence = amount_pence WHERE booking_id = ?",
      [req.params.id]
    );

    await query.run('UPDATE event_dates SET sold_count = MAX(0, sold_count - 1) WHERE id = ?', [booking.event_date_id]);
    await query.run('UPDATE registration_types SET sold_count = MAX(0, sold_count - 1) WHERE id = ?', [booking.registration_type_id]);

    const bInfo = await query.get(
      `SELECT b.*, d.email, d.first_name, e.title as event_title
       FROM bookings b
       JOIN delegates d ON b.delegate_id = d.id
       JOIN event_dates ed ON b.event_date_id = ed.id
       JOIN events e ON ed.event_id = e.id
       WHERE b.id = ?`,
      [req.params.id]
    );

    if (bInfo) {
      await query.run(
        `INSERT INTO email_jobs (type, booking_id, recipient_email, subject, body_html, send_at, status)
         VALUES ('cancellation', ?, ?, ?, ?, ?, 'pending')`,
        [
          booking.id,
          bInfo.email,
          `Booking Cancelled: ${bInfo.event_title}`,
          `<h1>Hi ${bInfo.first_name},</h1>
           <p>Your booking for <strong>${bInfo.event_title}</strong> (Ref: ${bInfo.reference}) has been cancelled and a full refund of £${(bInfo.amount_pence/100).toFixed(2)} has been processed.</p>`,
          new Date().toISOString()
        ]
      );

      await query.run(
        "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, payload) VALUES ('to_crm', 'EventRegistration', ?, 'success', ?)",
        [booking.id, JSON.stringify({ booking_id: booking.id, refund_processed: true, status: 'cancelled' })]
      );
    }

    res.json({ success: true, message: 'Refund and cancellation completed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// EMAIL QUEUE VIEWER & CONTROLLER
// ----------------------------------------------------
app.get('/api/email-queue', async (req, res) => {
  try {
    const emails = await query.all('SELECT * FROM email_jobs ORDER BY send_at DESC');
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/email-queue/:id/send', async (req, res) => {
  try {
    await query.run(
      "UPDATE email_jobs SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?",
      [new Date().toISOString(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DYNAMICS CRM LOGS & CONFLICT RESOLUTION
// ----------------------------------------------------
app.get('/api/crm/logs', async (req, res) => {
  try {
    const logs = await query.all('SELECT * FROM crm_sync_logs ORDER BY created_at DESC');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/resolve-conflict', async (req, res) => {
  try {
    const { log_id, crm_contact_id } = req.body;
    
    await query.run(
      "UPDATE crm_sync_logs SET status = 'success', crm_id = ?, error = NULL WHERE id = ?",
      [crm_contact_id, log_id]
    );

    const log = await query.get('SELECT * FROM crm_sync_logs WHERE id = ?', [log_id]);
    if (log && log.entity_type === 'Contact') {
      await query.run('UPDATE delegates SET dynamics_contact_id = ? WHERE id = ?', [crm_contact_id, log.entity_id]);

      const pendingBookings = await query.all('SELECT id, reference, amount_pence FROM bookings WHERE delegate_id = ?', [log.entity_id]);
      for (const booking of pendingBookings) {
        await query.run(
          "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, crm_id, payload) VALUES ('to_crm', 'EventRegistration', ?, 'success', ?, ?)",
          [
            booking.id,
            'REG-' + Math.floor(10000 + Math.random() * 90000),
            JSON.stringify({ booking_reference: booking.reference, resolved_parent_crm_id: crm_contact_id })
          ]
        );
      }
    }

    res.json({ success: true, message: 'Conflict resolved successfully and downstream events synced.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// MOBILE APP CHECK-IN SIMULATOR APIs
// ----------------------------------------------------
app.get('/api/app/events', async (req, res) => {
  try {
    const events = await query.all(`
      SELECT ed.id as event_date_id, e.title, ed.start_datetime, ed.location, ed.capacity, ed.sold_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.event_date_id = ed.id AND b.payment_status = 'paid' AND b.status = 'confirmed') as confirmed_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.event_date_id = ed.id AND b.checked_in = 1) as checked_in_count
      FROM event_dates ed
      JOIN events e ON ed.event_id = e.id
      WHERE ed.start_datetime >= datetime('now', '-30 days')
      ORDER BY ed.start_datetime ASC
    `);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/app/events/:dateId/attendees', async (req, res) => {
  try {
    const attendees = await query.all(
      `SELECT b.id as booking_id, b.reference, b.checked_in, b.checked_in_at, b.status as booking_status,
              d.first_name, d.last_name, d.email, d.organisation, rt.name as ticket_name
       FROM bookings b
       JOIN delegates d ON b.delegate_id = d.id
       JOIN registration_types rt ON b.registration_type_id = rt.id
       WHERE b.event_date_id = ? AND b.status = 'confirmed'`,
      [req.params.dateId]
    );
    res.json(attendees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/app/checkin', async (req, res) => {
  try {
    const { booking_reference, checked_in } = req.body;
    await query.run(
      "UPDATE bookings SET checked_in = ?, checked_in_at = ? WHERE reference = ?",
      [checked_in ? 1 : 0, checked_in ? new Date().toISOString() : null, booking_reference]
    );
    
    // Log Dynamics CRM Sync for Attendance updates
    const booking = await query.get('SELECT id FROM bookings WHERE reference = ?', [booking_reference]);
    if (booking) {
      await query.run(
        "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, payload) VALUES ('to_crm', 'EventRegistration', ?, 'success', ?)",
        [booking.id, JSON.stringify({ booking_reference, checked_in: checked_in ? 1 : 0, checkin_time: new Date().toISOString() })]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/app/checkin/qr', async (req, res) => {
  try {
    const { qr_payload } = req.body;
    const booking = await query.get(
      `SELECT b.id, b.reference, b.checked_in, b.payment_status, b.status,
              d.first_name, d.last_name, rt.name as ticket_name, e.title as event_title
       FROM bookings b
       JOIN delegates d ON b.delegate_id = d.id
       JOIN registration_types rt ON b.registration_type_id = rt.id
       JOIN event_dates ed ON b.event_date_id = ed.id
       JOIN events e ON ed.event_id = e.id
       WHERE b.reference = ?`,
      [qr_payload]
    );

    if (!booking) {
      return res.status(404).json({ error: 'Invalid QR Code' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'This booking has been cancelled.' });
    }

    if (booking.checked_in === 1) {
      return res.json({
        already_checked_in: true,
        name: `${booking.first_name} ${booking.last_name}`,
        ticket_name: booking.ticket_name,
        event_title: booking.event_title
      });
    }

    await query.run(
      "UPDATE bookings SET checked_in = 1, checked_in_at = ? WHERE id = ?",
      [new Date().toISOString(), booking.id]
    );

    // Sync checkin state to Dynamics
    await query.run(
      "INSERT INTO crm_sync_logs (direction, entity_type, entity_id, status, payload) VALUES ('to_crm', 'EventRegistration', ?, 'success', ?)",
      [booking.id, JSON.stringify({ booking_reference: booking.reference, checked_in: 1, method: 'QR_Scan' })]
    );

    res.json({
      success: true,
      name: `${booking.first_name} ${booking.last_name}`,
      ticket_name: booking.ticket_name,
      event_title: booking.event_title
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// FINANCIAL & AUDIT REPORTING
// ----------------------------------------------------
app.get('/api/admin/reports', async (req, res) => {
  try {
    const revenueByCategory = await query.all(`
      SELECT c.name as category, SUM(p.amount_pence) as revenue_pence
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN event_dates ed ON b.event_date_id = ed.id
      JOIN events e ON ed.event_id = e.id
      JOIN categories c ON e.category_id = c.id
      WHERE p.status = 'succeeded'
      GROUP BY c.id
    `);

    const attendanceStats = await query.all(`
      SELECT e.title, ed.start_datetime, ed.sold_count,
             SUM(CASE WHEN b.checked_in = 1 THEN 1 ELSE 0 END) as checked_in,
             SUM(CASE WHEN b.checked_in = 0 AND b.status = 'confirmed' THEN 1 ELSE 0 END) as no_show
      FROM bookings b
      JOIN event_dates ed ON b.event_date_id = ed.id
      JOIN events e ON ed.event_id = e.id
      WHERE b.status = 'confirmed'
      GROUP BY ed.id
    `);

    const memberSplit = await query.all(`
      SELECT d.member_status, COUNT(*) as count, SUM(b.amount_pence) as revenue_pence
      FROM bookings b
      JOIN delegates d ON b.delegate_id = d.id
      WHERE b.status = 'confirmed'
      GROUP BY d.member_status
    `);

    res.json({
      revenueByCategory,
      attendanceStats,
      memberSplit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// PRODUCTION HOSTING: SERVING FRONTEND BUILD
// ----------------------------------------------------
app.use(express.static(path.join(__dirname, 'client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
