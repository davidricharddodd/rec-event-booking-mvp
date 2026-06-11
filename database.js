const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'event-booking.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    db.run('PRAGMA foreign_keys = ON;');
  }
});

// Promise wrappers
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
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
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

async function initDatabase() {
  // Create tables in sequence
  await query.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      color_hex TEXT NOT NULL,
      website_section TEXT NOT NULL CHECK(website_section IN ('events', 'training', 'qualifications', 'all'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('standalone', 'umbrella')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      sold_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS registration_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date_id INTEGER REFERENCES event_dates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_pence INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      sold_count INTEGER DEFAULT 0,
      is_member_only INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS delegates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      organisation TEXT,
      phone TEXT,
      dietary_requirements TEXT,
      accessibility_needs TEXT,
      dynamics_contact_id TEXT,
      member_status TEXT DEFAULT 'none',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      event_date_id INTEGER REFERENCES event_dates(id),
      delegate_id INTEGER REFERENCES delegates(id),
      registration_type_id INTEGER REFERENCES registration_types(id),
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'waitlisted', 'cancelled')),
      payment_status TEXT NOT NULL DEFAULT 'paid' CHECK(payment_status IN ('paid', 'refunded', 'pending', 'failed')),
      amount_pence INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      qr_code_b64 TEXT,
      checked_in INTEGER DEFAULT 0 CHECK(checked_in IN (0, 1)),
      checked_in_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      stripe_charge_id TEXT,
      amount_pence INTEGER NOT NULL,
      vat_pence INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('succeeded', 'refunded', 'failed')),
      refunded_amount_pence INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      send_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
      attempts INTEGER DEFAULT 0,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS crm_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK(direction IN ('to_crm', 'from_crm')),
      entity_type TEXT NOT NULL CHECK(entity_type IN ('Contact', 'EventRegistration', 'Payment')),
      entity_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'pending')),
      crm_id TEXT,
      error TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('standalone', 'umbrella')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      default_title TEXT,
      default_description TEXT,
      config_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
      value INTEGER NOT NULL,
      max_uses INTEGER,
      uses_count INTEGER DEFAULT 0,
      expires_at TEXT
    );
  `);

  // Check if categories are already seeded
  const categoryCount = await query.get('SELECT COUNT(*) as count FROM categories');
  if (categoryCount.count === 0) {
    console.log('Seeding categories...');
    await query.run("INSERT INTO categories (name, slug, color_hex, website_section) VALUES ('Conference', 'conference', '#8C66D4', 'events')");
    await query.run("INSERT INTO categories (name, slug, color_hex, website_section) VALUES ('Webinar', 'webinar', '#36BEAE', 'events')");
    await query.run("INSERT INTO categories (name, slug, color_hex, website_section) VALUES ('Legal Helpline Q&A', 'legal-qa', '#FFC03E', 'events')");
    await query.run("INSERT INTO categories (name, slug, color_hex, website_section) VALUES ('CPD Workshop', 'cpd-workshop', '#FF68A7', 'training')");
    await query.run("INSERT INTO categories (name, slug, color_hex, website_section) VALUES ('Qualification', 'qualification', '#FF595D', 'qualifications')");
  } else {
    // Ensure existing categories use the correct brand guide hex colors
    await query.run("UPDATE categories SET color_hex = '#8C66D4' WHERE slug = 'conference'");
    await query.run("UPDATE categories SET color_hex = '#36BEAE' WHERE slug = 'webinar'");
    await query.run("UPDATE categories SET color_hex = '#FFC03E' WHERE slug = 'legal-qa'");
    await query.run("UPDATE categories SET color_hex = '#FF68A7' WHERE slug = 'cpd-workshop'");
    await query.run("UPDATE categories SET color_hex = '#FF595D' WHERE slug = 'qualification'");
  }

  // Seed discount codes
  const codeCount = await query.get('SELECT COUNT(*) as count FROM discount_codes');
  if (codeCount.count === 0) {
    console.log('Seeding discount codes...');
    await query.run("INSERT INTO discount_codes (code, discount_type, value, max_uses, expires_at) VALUES ('REC20', 'percent', 20, 100, '2026-12-31')");
    await query.run("INSERT INTO discount_codes (code, discount_type, value, max_uses, expires_at) VALUES ('MEMBER50', 'percent', 50, 50, '2026-12-31')");
    await query.run("INSERT INTO discount_codes (code, discount_type, value, max_uses, expires_at) VALUES ('FREEPASS', 'percent', 100, 10, '2026-12-31')");
  }

  // Seed templates
  const templateCount = await query.get('SELECT COUNT(*) as count FROM templates');
  if (templateCount.count === 0) {
    console.log('Seeding templates...');
    await query.run(`
      INSERT INTO templates (name, event_type, category_id, default_title, default_description, config_json)
      VALUES (
        'Standard Conference Template', 
        'standalone', 
        1, 
        'REC Conference', 
        'Default description for conferences', 
        '{"registration_types":[{"name":"Member Rate","price_pence":25000,"capacity":100,"is_member_only":1},{"name":"Non-Member Rate","price_pence":45000,"capacity":50,"is_member_only":0}]}'
      )
    `);
    await query.run(`
      INSERT INTO templates (name, event_type, category_id, default_title, default_description, config_json)
      VALUES (
        'Standard CPD Workshop Template', 
        'standalone', 
        4, 
        'CPD Workshop Series', 
        'Default description for CPD workshops', 
        '{"registration_types":[{"name":"Member Ticket","price_pence":9500,"capacity":30,"is_member_only":1},{"name":"Non-Member Ticket","price_pence":15000,"capacity":10,"is_member_only":0}]}'
      )
    `);
  }

  // Check if events are already seeded
  const eventCount = await query.get('SELECT COUNT(*) as count FROM events');
  if (eventCount.count === 0) {
    console.log('Seeding events and registration types...');

    // 1. Standalone: REC Annual Conference 2026
    const confCat = await query.get("SELECT id FROM categories WHERE slug = 'conference'");
    const confEvent = await query.run(`
      INSERT INTO events (title, description, category_id, type, status)
      VALUES (
        'REC Annual Conference 2026', 
        'The premier event for the UK recruitment industry. Join industry leaders, key policy makers, and expert speakers to discuss the future of work, technology trends, and regulatory updates.', 
        ?, 'standalone', 'published'
      )
    `, [confCat.id]);

    const confDate = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity)
      VALUES (?, '2026-06-15T09:00:00', '2026-06-15T17:00:00', 'QEII Centre, Westminster, London', 500)
    `, [confEvent.id]);

    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Member Rate', 29500, 350, 1)`, [confDate.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Non-Member Rate', 49500, 100, 0)`, [confDate.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'VIP Guest Rate', 0, 30, 0)`, [confDate.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Speaker', 0, 20, 0)`, [confDate.id]);

    // 2. Umbrella: Legal Helpline Q&A — Monthly Session
    const legalCat = await query.get("SELECT id FROM categories WHERE slug = 'legal-qa'");
    const legalEvent = await query.run(`
      INSERT INTO events (title, description, category_id, type, status)
      VALUES (
        'Legal Helpline Q&A — Monthly Session', 
        'Get answers to your critical employment law and compliance questions from the REC Legal Advisory team in our interactive monthly Q&A sessions. Free to members.', 
        ?, 'umbrella', 'published'
      )
    `, [legalCat.id]);

    // Session 1
    const s1Date = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity)
      VALUES (?, '2026-06-18T10:00:00', '2026-06-18T11:00:00', 'Virtual (MS Teams)', 50)
    `, [legalEvent.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Member Registration', 0, 40, 1)`, [s1Date.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Non-Member Registration', 5000, 10, 0)`, [s1Date.id]);

    // Session 2
    const s2Date = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity)
      VALUES (?, '2026-07-16T10:00:00', '2026-07-16T11:00:00', 'Virtual (MS Teams)', 50)
    `, [legalEvent.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Member Registration', 0, 40, 1)`, [s2Date.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Non-Member Registration', 5000, 10, 0)`, [s2Date.id]);

    // Session 3 (Pre-fill with some bookings to make it realistic)
    const s3Date = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity, sold_count)
      VALUES (?, '2026-08-20T10:00:00', '2026-08-20T11:00:00', 'Virtual (MS Teams)', 50, 3)
    `, [legalEvent.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, sold_count, is_member_only) VALUES (?, 'Member Registration', 0, 40, 3, 1)`, [s3Date.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, sold_count, is_member_only) VALUES (?, 'Non-Member Registration', 5000, 10, 0, 0)`, [s3Date.id]);

    // Seed 3 delegates for session 3
    await query.run("INSERT OR IGNORE INTO delegates (first_name, last_name, email, organisation, phone, dynamics_contact_id, member_status) VALUES ('Alice', 'Smith', 'alice@company.co.uk', 'Recruiters Ltd', '07700900077', 'CONT-98471', 'active')");
    await query.run("INSERT OR IGNORE INTO delegates (first_name, last_name, email, organisation, phone, dynamics_contact_id, member_status) VALUES ('Bob', 'Johnson', 'bob@hiring.com', 'Hiring Experts', '07700900088', 'CONT-56124', 'active')");
    await query.run("INSERT OR IGNORE INTO delegates (first_name, last_name, email, organisation, phone, dynamics_contact_id, member_status) VALUES ('Charlie', 'Brown', 'charlie@agencies.org', 'Agencies Group', '07700900099', 'CONT-21345', 'active')");

    // Retrieve the actual delegate IDs
    const d1Id = (await query.get("SELECT id FROM delegates WHERE email = 'alice@company.co.uk'")).id;
    const d2Id = (await query.get("SELECT id FROM delegates WHERE email = 'bob@hiring.com'")).id;
    const d3Id = (await query.get("SELECT id FROM delegates WHERE email = 'charlie@agencies.org'")).id;

    const memberRegType = await query.get("SELECT id FROM registration_types WHERE event_date_id = ? AND is_member_only = 1", [s3Date.id]);

    await query.run("INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, checked_in) VALUES ('REC-541293', ?, ?, ?, 'confirmed', 'paid', 0, 0)", [s3Date.id, d1Id, memberRegType.id]);
    await query.run("INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, checked_in) VALUES ('REC-210493', ?, ?, ?, 'confirmed', 'paid', 0, 1)", [s3Date.id, d2Id, memberRegType.id]);
    await query.run("INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, checked_in) VALUES ('REC-998822', ?, ?, ?, 'confirmed', 'paid', 0, 0)", [s3Date.id, d3Id, memberRegType.id]);

    // 3. Standalone: Compliance in Recruitment Workshop
    const cpdCat = await query.get("SELECT id FROM categories WHERE slug = 'cpd-workshop'");
    const cpdEvent = await query.run(`
      INSERT INTO events (title, description, category_id, type, status)
      VALUES (
        'Compliance in Recruitment Workshop', 
        'Ensure your agency stays compliant under the latest UK labour regulations. This intensive half-day CPD workshop covers right-to-work checks, IR35 revisions, and candidate vetting standards.', 
        ?, 'standalone', 'published'
      )
    `, [cpdCat.id]);

    const cpdDate = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity, sold_count)
      VALUES (?, '2026-06-25T13:00:00', '2026-06-25T17:00:00', 'REC HQ, 14 Carteret Street, London', 30, 2)
    `, [cpdEvent.id]);

    const cpdMemberType = await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, sold_count, is_member_only) VALUES (?, 'Member Ticket', 12000, 20, 2, 1)`, [cpdDate.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, sold_count, is_member_only) VALUES (?, 'Non-Member Ticket', 24000, 10, 0, 0)`, [cpdDate.id]);

    // Seed 2 delegates for the CPD event
    await query.run("INSERT OR IGNORE INTO delegates (first_name, last_name, email, organisation, phone, dynamics_contact_id, member_status) VALUES ('Sarah', 'Connor', 'sarah@skynet.net', 'Tech Solutions', '07700900111', 'CONT-10022', 'active')");
    await query.run("INSERT OR IGNORE INTO delegates (first_name, last_name, email, organisation, phone, dynamics_contact_id, member_status) VALUES ('John', 'Doe', 'john@gmail.com', 'Retail Staffing', '07700900222', 'CONT-10023', 'active')");

    const d4Id = (await query.get("SELECT id FROM delegates WHERE email = 'sarah@skynet.net'")).id;
    const d5Id = (await query.get("SELECT id FROM delegates WHERE email = 'john@gmail.com'")).id;

    const b4 = await query.run("INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, stripe_payment_intent_id, checked_in) VALUES ('REC-448821', ?, ?, ?, 'confirmed', 'paid', 12000, 'pi_mock_1111', 1)", [cpdDate.id, d4Id, cpdMemberType.id]);
    const b5 = await query.run("INSERT INTO bookings (reference, event_date_id, delegate_id, registration_type_id, status, payment_status, amount_pence, stripe_payment_intent_id, checked_in) VALUES ('REC-448822', ?, ?, ?, 'confirmed', 'paid', 12000, 'pi_mock_2222', 0)", [cpdDate.id, d5Id, cpdMemberType.id]);

    await query.run("INSERT INTO payments (booking_id, stripe_charge_id, amount_pence, vat_pence, status) VALUES (?, 'ch_mock_1111', 12000, 2000, 'succeeded')", [b4.id]);
    await query.run("INSERT INTO payments (booking_id, stripe_charge_id, amount_pence, vat_pence, status) VALUES (?, 'ch_mock_2222', 12000, 2000, 'succeeded')", [b5.id]);

    // 4. Umbrella: Certificate in Recruitment Practice
    const qualCat = await query.get("SELECT id FROM categories WHERE slug = 'qualification'");
    const qualEvent = await query.run(`
      INSERT INTO events (title, description, category_id, type, status)
      VALUES (
        'Certificate in Recruitment Practice (CertRP)', 
        'The premier professional qualification for individual recruiters. Elevate your status, learn recruitment theory and best practices, and get certified.', 
        ?, 'umbrella', 'published'
      )
    `, [qualCat.id]);

    const q1Date = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity)
      VALUES (?, '2026-07-01T09:00:00', '2026-08-31T17:00:00', 'Online (Blended Study)', 20)
    `, [qualEvent.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Member Enrollment', 75000, 15, 1)`, [q1Date.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Non-Member Enrollment', 110000, 5, 0)`, [q1Date.id]);

    const q2Date = await query.run(`
      INSERT INTO event_dates (event_id, start_datetime, end_datetime, location, capacity)
      VALUES (?, '2026-09-01T09:00:00', '2026-10-31T17:00:00', 'Online (Blended Study)', 20)
    `, [qualEvent.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Member Enrollment', 75000, 15, 1)`, [q2Date.id]);
    await query.run(`INSERT INTO registration_types (event_date_id, name, price_pence, capacity, is_member_only) VALUES (?, 'Non-Member Enrollment', 110000, 5, 0)`, [q2Date.id]);
  }
}

module.exports = {
  db,
  query,
  initDatabase
};
