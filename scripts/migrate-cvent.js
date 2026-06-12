/**
 * REC Event Booking Platform — Cvent Data Migration Script
 * 
 * Ingests mock Cvent export data, maps fields to the local REC database schema,
 * handles unique external identifier keys, and prints a reconciliation summary.
 * 
 * Usage:
 *   Dry-Run:   node scripts/migrate-cvent.js
 *   Persist:   node scripts/migrate-cvent.js --confirm
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../event-booking.db');
const isConfirm = process.argv.includes('--confirm');
const isDryRun = !isConfirm;

// Mock Cvent Export Data
const mockCventData = {
  events: [
    {
      CventEventID: 'EV-884192',
      EventTitle: 'Cvent Recruitment Tech Summit 2026',
      EventDesc: 'Exploring AI and automation in contemporary talent acquisition. Migrated from Cvent legacy database.',
      CategoryName: 'Conference',
      StartDate: '2026-09-12T09:00:00',
      EndDate: '2026-09-12T17:00:00',
      VenueName: 'Central Hall, Manchester',
      MaxCapacity: 200,
      TicketClasses: [
        { Name: 'Delegate Pass', PricePence: 19500, Capacity: 150, IsMemberOnly: 0 },
        { Name: 'Member Special Rate', PricePence: 12000, Capacity: 50, IsMemberOnly: 1 }
      ]
    },
    {
      CventEventID: 'EV-331049',
      EventTitle: 'Cvent Masterclass: Vetting Compliance',
      EventDesc: 'An advanced seminar on UK right-to-work laws and candidate screening audits.',
      CategoryName: 'CPD Workshop',
      StartDate: '2026-10-05T13:30:00',
      EndDate: '2026-10-05T16:30:00',
      VenueName: 'Virtual (Zoom)',
      MaxCapacity: 80,
      TicketClasses: [
        { Name: 'Workshop Ticket', PricePence: 8500, Capacity: 80, IsMemberOnly: 0 }
      ]
    }
  ],
  contacts: [
    {
      CventContactID: 'CON-110022',
      FirstName: 'Diana',
      LastName: 'Prince',
      EmailAddress: 'diana.prince@themyscira.gov',
      Company: 'Justice Consulting Ltd',
      PhoneNo: '07700900333',
      Dietary: 'Gluten Free',
      Accessibility: 'None',
      MemberStatus: 'active'
    },
    {
      CventContactID: 'CON-110033',
      FirstName: 'Bruce',
      LastName: 'Wayne',
      EmailAddress: 'bruce@wayneenterprise.com',
      Company: 'Wayne Enterprises',
      PhoneNo: '07700900444',
      Dietary: 'None',
      Accessibility: 'Wheelchair access',
      MemberStatus: 'none'
    },
    {
      CventContactID: 'CON-110044',
      FirstName: 'Clark',
      LastName: 'Kent',
      EmailAddress: 'clark@dailyplanet.com',
      Company: 'Daily Planet Corp',
      PhoneNo: '07700900555',
      Dietary: 'Vegetarian',
      Accessibility: 'None',
      MemberStatus: 'active'
    }
  ],
  registrations: [
    {
      CventRegID: 'REG-901122',
      CventEventID: 'EV-884192',
      CventContactID: 'CON-110022',
      TicketClassName: 'Member Special Rate',
      AmountPaidPence: 12000,
      PaymentStatus: 'paid',
      PaymentRef: 'ch_cvent_1111'
    },
    {
      CventRegID: 'REG-901133',
      CventEventID: 'EV-884192',
      CventContactID: 'CON-110033',
      TicketClassName: 'Delegate Pass',
      AmountPaidPence: 19500,
      PaymentStatus: 'paid',
      PaymentRef: 'ch_cvent_2222'
    },
    {
      CventRegID: 'REG-901144',
      CventEventID: 'EV-331049',
      CventContactID: 'CON-110044',
      TicketClassName: 'Workshop Ticket',
      AmountPaidPence: 8500,
      PaymentStatus: 'paid',
      PaymentRef: 'ch_cvent_3333'
    }
  ]
};

// Open database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
    process.exit(1);
  }
});

// Promise wrapper queries
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (isDryRun) {
        // Log query details without execution
        return resolve({ id: 999 + Math.floor(Math.random() * 100), changes: 1 });
      }
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

async function runMigration() {
  console.log('================================================================');
  console.log(`🚀 REC Cvent Data Migration Utility`);
  console.log(`📂 Database: ${dbPath}`);
  console.log(`⚡ Mode: ${isDryRun ? 'DRY-RUN (No writes will be committed)' : 'LIVE-COMMIT (Writing to DB)'}`);
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('💡 TIP: Run with "--confirm" flag to persist results: node scripts/migrate-cvent.js --confirm\n');
  }

  // Reconciliation Report counters
  const report = {
    eventsProcessed: 0,
    eventsCreated: 0,
    eventsSkipped: 0,
    eventDatesCreated: 0,
    registrationTypesCreated: 0,
    contactsProcessed: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    registrationsProcessed: 0,
    registrationsCreated: 0,
    registrationsSkipped: 0,
    paymentsCreated: 0,
    errors: 0
  };

  try {
    // 1. Get Categories mapping from DB
    const categories = await query.all('SELECT id, name, slug FROM categories');
    const getCategoryId = (cventCatName) => {
      const slug = cventCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const found = categories.find(c => c.slug === slug || c.name.toLowerCase() === cventCatName.toLowerCase());
      return found ? found.id : (categories[0]?.id || 1); // default fallback
    };

    console.log('🔄 Stage 1: Migrating Events & Event Dates...');
    
    const eventIdMap = {}; // Maps CventEventID -> Local EventDateID
    const ticketClassMap = {}; // Maps CventEventID + TicketClassName -> Local RegistrationTypeID

    for (const ev of mockCventData.events) {
      report.eventsProcessed++;
      try {
        // Check if event already exists by Cvent ID
        const existingEvent = await query.get(
          "SELECT id FROM events WHERE source_system = 'cvent' AND external_id = ?",
          [ev.CventEventID]
        );

        let eventId;
        if (existingEvent) {
          eventId = existingEvent.id;
          report.eventsSkipped++;
          console.log(`  - Skipping existing Event: "${ev.EventTitle}" (${ev.CventEventID})`);
        } else {
          // Insert new event
          const catId = getCategoryId(ev.CategoryName);
          console.log(`  + [INSERT] Event: "${ev.EventTitle}" (${ev.CventEventID})`);
          
          const evResult = await query.run(
            `INSERT INTO events (title, description, category_id, type, status, source_system, external_id)
             VALUES (?, ?, ?, 'standalone', 'published', 'cvent', ?)`,
            [ev.EventTitle, ev.EventDesc, catId, ev.CventEventID]
          );
          eventId = evResult.id;
          report.eventsCreated++;
        }

        // Check if event date already exists
        let dateId;
        const existingDate = await query.get(
          "SELECT id FROM event_dates WHERE event_id = ? AND start_datetime = ?",
          [eventId, ev.StartDate]
        );

        if (existingDate) {
          dateId = existingDate.id;
        } else {
          console.log(`    + [INSERT] Event Date: ${ev.StartDate} at "${ev.VenueName}"`);
          const dateResult = await query.run(
            `INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity, sold_count, status)
             VALUES (?, ?, ?, ?, ?, 0, 'open')`,
            [eventId, ev.StartDate, ev.EndDate, ev.VenueName, ev.MaxCapacity]
          );
          dateId = dateResult.id;
          report.eventDatesCreated++;

          // Insert ticket types for this date
          for (const tc of ev.TicketClasses) {
            console.log(`      + [INSERT] Ticket Class: "${tc.Name}" - £${(tc.PricePence / 100).toFixed(2)}`);
            const tcResult = await query.run(
              `INSERT INTO registration_types (event_date_id, name, price_pence, capacity, sold_count, is_member_only)
               VALUES (?, ?, ?, ?, 0, ?)`,
              [dateId, tc.Name, tc.PricePence, tc.Capacity, tc.IsMemberOnly]
            );
            ticketClassMap[`${ev.CventEventID}_${tc.Name}`] = tcResult.id;
            report.registrationTypesCreated++;
          }
        }

        eventIdMap[ev.CventEventID] = dateId;

        // If event date existed but ticket classes weren't mapped, retrieve/map them
        if (existingDate) {
          const tTypes = await query.all('SELECT id, name FROM registration_types WHERE event_date_id = ?', [dateId]);
          tTypes.forEach(tt => {
            ticketClassMap[`${ev.CventEventID}_${tt.name}`] = tt.id;
          });
        }

      } catch (err) {
        report.errors++;
        console.error(`  ❌ Error migrating event ${ev.CventEventID}:`, err.message);
      }
    }

    console.log('\n👤 Stage 2: Migrating Contacts...');
    const contactIdMap = {}; // Maps CventContactID -> Local DelegateID

    for (const c of mockCventData.contacts) {
      report.contactsProcessed++;
      try {
        const existingContact = await query.get(
          "SELECT id, first_name, last_name FROM delegates WHERE (source_system = 'cvent' AND external_id = ?) OR email = ?",
          [c.CventContactID, c.EmailAddress.toLowerCase()]
        );

        let delegateId;
        if (existingContact) {
          delegateId = existingContact.id;
          report.contactsUpdated++;
          console.log(`  ~ [UPDATE] Delegate: "${c.FirstName} ${c.LastName}" (${c.EmailAddress})`);
          await query.run(
            `UPDATE delegates SET first_name = ?, last_name = ?, organisation = ?, phone = ?, dietary_requirements = ?, accessibility_needs = ?, member_status = ?
             WHERE id = ?`,
            [c.FirstName, c.LastName, c.Company, c.PhoneNo, c.Dietary, c.Accessibility, c.MemberStatus, delegateId]
          );
        } else {
          console.log(`  + [INSERT] Delegate: "${c.FirstName} ${c.LastName}" (${c.EmailAddress})`);
          const dResult = await query.run(
            `INSERT INTO delegates (first_name, last_name, email, organisation, phone, dietary_requirements, accessibility_needs, member_status, source_system, external_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cvent', ?)`,
            [c.FirstName, c.LastName, c.EmailAddress.toLowerCase(), c.Company, c.PhoneNo, c.Dietary, c.Accessibility, c.MemberStatus, c.CventContactID]
          );
          delegateId = dResult.id;
          report.contactsCreated++;
        }
        contactIdMap[c.CventContactID] = delegateId;
      } catch (err) {
        report.errors++;
        console.error(`  ❌ Error migrating contact ${c.CventContactID}:`, err.message);
      }
    }

    console.log('\n🎫 Stage 3: Migrating Registrations & Payments...');
    for (const reg of mockCventData.registrations) {
      report.registrationsProcessed++;
      try {
        // Check if booking already exists
        const existingBooking = await query.get(
          "SELECT id FROM bookings WHERE source_system = 'cvent' AND external_id = ?",
          [reg.CventRegID]
        );

        if (existingBooking) {
          report.registrationsSkipped++;
          console.log(`  - Skipping existing Registration: ${reg.CventRegID}`);
          continue;
        }

        const localDateId = eventIdMap[reg.CventEventID];
        const localDelegateId = contactIdMap[reg.CventContactID];
        const localRegTypeId = ticketClassMap[`${reg.CventEventID}_${reg.TicketClassName}`];

        if (!localDateId || !localDelegateId || !localRegTypeId) {
          throw new Error(`Mapping failed! Date: ${localDateId}, Delegate: ${localDelegateId}, TicketClass: ${localRegTypeId}`);
        }

        console.log(`  + [INSERT] Registration: ${reg.CventRegID} (Event: ${reg.CventEventID}, Contact: ${reg.CventContactID})`);
        
        // Insert booking
        const reference = `CV-${reg.CventRegID.replace('REG-', '')}-${Math.floor(100 + Math.random() * 900)}`;
        const qrCodeB64 = `data:image/png;base64,QR_MOCK_PAYLOAD_${reference}`;

        const bkResult = await query.run(
          `INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, stripe_payment_intent_id, qr_code_b64, checked_in, source_system, external_id)
           VALUES (?, ?, ?, ?, 'confirmed', 'paid', ?, ?, ?, 0, 'cvent', ?)`,
          [reference, localDateId, localDelegateId, localRegTypeId, reg.AmountPaidPence, reg.PaymentRef, qrCodeB64, reg.CventRegID]
        );
        const bookingId = bkResult.id;
        report.registrationsCreated++;

        // Update sold counts
        await query.run('UPDATE event_dates SET sold_count = sold_count + 1 WHERE id = ?', [localDateId]);
        await query.run('UPDATE registration_types SET sold_count = sold_count + 1 WHERE id = ?', [localRegTypeId]);

        // Insert payment if applicable
        if (reg.AmountPaidPence > 0) {
          console.log(`    + [INSERT] Payment: ${reg.PaymentRef} (£${(reg.AmountPaidPence / 100).toFixed(2)})`);
          await query.run(
            `INSERT INTO payments (booking_id, stripe_charge_id, amount_pence, vat_pence, status, source_system, external_id)
             VALUES (?, ?, ?, ?, 'succeeded', 'cvent', ?)`,
            [bookingId, reg.PaymentRef, reg.AmountPaidPence, Math.floor(reg.AmountPaidPence * 0.2), `${reg.CventRegID}_PAY`]
          );
          report.paymentsCreated++;
        }

      } catch (err) {
        report.errors++;
        console.error(`  ❌ Error migrating registration ${reg.CventRegID}:`, err.message);
      }
    }

    console.log('\n================================================================');
    console.log(`📊 RECONCILIATION & DATA MIGRATION REPORT`);
    console.log('================================================================');
    console.log(`- Cvent Events Processed:        ${report.eventsProcessed}`);
    console.log(`  - Local Events Created:        ${report.eventsCreated}`);
    console.log(`  - Local Events Skipped:        ${report.eventsSkipped}`);
    console.log(`  - Local Event Dates Created:   ${report.eventDatesCreated}`);
    console.log(`  - Ticket Class Rates Created:  ${report.registrationTypesCreated}`);
    console.log(`- Cvent Contacts Processed:      ${report.contactsProcessed}`);
    console.log(`  - Local Delegates Created:     ${report.contactsCreated}`);
    console.log(`  - Local Delegates Updated:     ${report.contactsUpdated}`);
    console.log(`- Cvent Bookings Processed:      ${report.registrationsProcessed}`);
    console.log(`  - Local Bookings Created:      ${report.registrationsCreated}`);
    console.log(`  - Local Bookings Skipped:      ${report.registrationsSkipped}`);
    console.log(`  - Local Payments Created:      ${report.paymentsCreated}`);
    console.log(`- Errors Encountered:            ${report.errors}`);
    console.log('================================================================');
    
    if (isDryRun) {
      console.log('✨ Dry-Run complete. No records were written to the database.');
    } else {
      console.log('🏆 Migration successfully committed to database.');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Migration crashed:', err);
  } finally {
    db.close();
  }
}

// Run the migration
runMigration();
