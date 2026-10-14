-- SaloonBaba database schema (MySQL 8)
-- All times are stored as local salon time (Asia/Kolkata), money in INR.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE,
  phone VARCHAR(15) UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','franchisor','area_manager','owner','manager','stylist','customer','vendor') NOT NULL,
  gender ENUM('F','M','O') NULL,
  lang VARCHAR(5) NOT NULL DEFAULT 'en',
  city VARCHAR(60),
  gold_until DATE NULL,
  referral_code VARCHAR(20) UNIQUE,
  is_active TINYINT NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) UNIQUE,
  owner_user_id INT NOT NULL,
  royalty_pct DECIMAL(5,2) NOT NULL DEFAULT 6,
  marketing_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 2,
  hue INT NOT NULL DEFAULT 280,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE brand_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('area_manager','hq_staff') NOT NULL DEFAULT 'area_manager',
  UNIQUE KEY (brand_id, user_id),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Salons, staff, services
-- ---------------------------------------------------------------
CREATE TABLE salons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NULL,
  owner_user_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  tagline VARCHAR(200),
  description TEXT,
  address VARCHAR(255),
  area VARCHAR(80),
  city VARCHAR(60),
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  phone VARCHAR(15),
  whatsapp VARCHAR(15),
  gender_type ENUM('unisex','women','men') NOT NULL DEFAULT 'unisex',
  price_level TINYINT NOT NULL DEFAULT 2,
  open_time TIME NOT NULL DEFAULT '09:00:00',
  close_time TIME NOT NULL DEFAULT '21:00:00',
  women_staff TINYINT NOT NULL DEFAULT 0,
  home_service TINYINT NOT NULL DEFAULT 0,
  private_rooms TINYINT NOT NULL DEFAULT 0,
  gold_partner TINYINT NOT NULL DEFAULT 0,
  hygiene_score INT NOT NULL DEFAULT 80,
  rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  gst_number VARCHAR(20),
  upi_id VARCHAR(60),
  hue INT NOT NULL DEFAULT 280,
  plan ENUM('starter','growth','pro','franchise') NOT NULL DEFAULT 'growth',
  deposit_pct INT NOT NULL DEFAULT 20,
  deposit_min_duration INT NOT NULL DEFAULT 90,
  discount_limit_pct INT NOT NULL DEFAULT 10,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (city), KEY (brand_id), KEY (owner_user_id),
  FOREIGN KEY (brand_id) REFERENCES brands(id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE salon_staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('manager','stylist','receptionist') NOT NULL DEFAULT 'stylist',
  level ENUM('trainee','junior','senior','educator','manager') NOT NULL DEFAULT 'junior',
  title VARCHAR(80),
  specialities VARCHAR(255),
  bio VARCHAR(400),
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 15000,
  service_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10,
  retail_incentive_pct DECIMAL(5,2) NOT NULL DEFAULT 5,
  target_amount DECIMAL(10,2) NOT NULL DEFAULT 80000,
  slabs JSON NULL,
  hue INT NOT NULL DEFAULT 200,
  rating DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  joined_on DATE,
  is_active TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY (salon_id, user_id),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE chairs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  type ENUM('chair','room','station') NOT NULL DEFAULT 'chair',
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE brand_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  duration_min INT NOT NULL,
  cycle_days INT NULL,
  gender ENUM('unisex','women','men') NOT NULL DEFAULT 'unisex',
  tags VARCHAR(255),
  allow_override TINYINT NOT NULL DEFAULT 1,
  is_active TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  brand_service_id INT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  duration_min INT NOT NULL,
  cycle_days INT NULL,
  gender ENUM('unisex','women','men') NOT NULL DEFAULT 'unisex',
  tags VARCHAR(255),
  description VARCHAR(300),
  is_active TINYINT NOT NULL DEFAULT 1,
  KEY (salon_id, category),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE staff_services (
  staff_id INT NOT NULL,
  service_id INT NOT NULL,
  PRIMARY KEY (staff_id, service_id),
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Clients (salon-owned client cloud)
-- ---------------------------------------------------------------
CREATE TABLE clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  user_id INT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  gender ENUM('F','M','O') NULL,
  dob DATE NULL,
  source VARCHAR(30) DEFAULT 'walkin',
  allergies VARCHAR(255),
  colour_formula VARCHAR(255),
  notes VARCHAR(500),
  preferred_staff_id INT NULL,
  wallet_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  no_show_count INT NOT NULL DEFAULT 0,
  visits INT NOT NULL DEFAULT 0,
  total_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
  first_visit DATE NULL,
  last_visit DATE NULL,
  referral_code VARCHAR(20),
  referred_by_client_id INT NULL,
  marketing_opt_in TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (salon_id, phone),
  KEY (user_id), KEY (salon_id, last_visit),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Bookings and walk-in queue
-- ---------------------------------------------------------------
CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  client_id INT NOT NULL,
  staff_id INT NULL,
  chair_id INT NULL,
  group_ref VARCHAR(20) NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('booked','confirmed','checked_in','in_service','completed','cancelled','no_show') NOT NULL DEFAULT 'booked',
  source ENUM('app','walkin','phone','whatsapp','instagram','google','website','rebook') NOT NULL DEFAULT 'phone',
  deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_status ENUM('none','pending','paid','refunded','adjusted','forfeited') NOT NULL DEFAULT 'none',
  offer_id INT NULL,
  campaign_id INT NULL,
  notes VARCHAR(300),
  rebooked_from_invoice_id INT NULL,
  invoice_id INT NULL,
  reminder_sent TINYINT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (salon_id, start_at), KEY (staff_id, start_at), KEY (client_id),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE appointment_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  service_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  duration_min INT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE queue_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  client_id INT NULL,
  user_id INT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(15),
  token_no INT NOT NULL,
  service_id INT NULL,
  staff_id INT NULL,
  status ENUM('waiting','serving','done','left') NOT NULL DEFAULT 'waiting',
  source ENUM('walkin','app','whatsapp') NOT NULL DEFAULT 'walkin',
  joined_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  done_at DATETIME NULL,
  KEY (salon_id, status),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Offers & campaigns (declared before invoices for attribution)
-- ---------------------------------------------------------------
CREATE TABLE offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NULL,
  brand_id INT NULL,
  code VARCHAR(30),
  title VARCHAR(120) NOT NULL,
  description VARCHAR(300),
  type ENUM('percent','flat') NOT NULL DEFAULT 'percent',
  value DECIMAL(10,2) NOT NULL,
  min_bill DECIMAL(10,2) NOT NULL DEFAULT 0,
  first_visit_only TINYINT NOT NULL DEFAULT 0,
  happy_hour TINYINT NOT NULL DEFAULT 0,
  days VARCHAR(20) NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (salon_id), KEY (brand_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NULL,
  brand_id INT NULL,
  name VARCHAR(120) NOT NULL,
  channel ENUM('whatsapp','sms','push') NOT NULL DEFAULT 'whatsapp',
  segment ENUM('all','new','regular','vip','at_risk','lapsed','due','birthday') NOT NULL DEFAULT 'all',
  offer_id INT NULL,
  message TEXT,
  status ENUM('draft','sent') NOT NULL DEFAULT 'draft',
  sent_count INT NOT NULL DEFAULT 0,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campaign_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  client_id INT NOT NULL,
  sent_at DATETIME NOT NULL,
  KEY (client_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Billing / POS
-- ---------------------------------------------------------------
CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  client_id INT NOT NULL,
  appointment_id INT NULL,
  invoice_no VARCHAR(30) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_reason VARCHAR(120),
  approval_id INT NULL,
  taxable DECIMAL(12,2) NOT NULL,
  cgst DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  tip_staff_id INT NULL,
  status ENUM('paid','void') NOT NULL DEFAULT 'paid',
  void_reason VARCHAR(200),
  voided_by INT NULL,
  offer_id INT NULL,
  campaign_id INT NULL,
  public_token VARCHAR(40),
  created_by INT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY (salon_id, invoice_no),
  KEY (salon_id, created_at), KEY (client_id), KEY (public_token),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  item_type ENUM('service','product','package','membership') NOT NULL,
  ref_id INT NULL,
  name VARCHAR(160) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  duration_min INT NULL,
  staff_id INT NULL,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  client_package_id INT NULL,
  KEY (staff_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NULL,
  client_id INT NULL,
  salon_id INT NOT NULL,
  mode ENUM('cash','upi','card','wallet','deposit') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  purpose ENUM('bill','wallet_topup') NOT NULL DEFAULT 'bill',
  ref VARCHAR(80),
  created_at DATETIME NOT NULL,
  KEY (salon_id, created_at),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE approval_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  type ENUM('discount','void') NOT NULL,
  requested_by INT NOT NULL,
  payload JSON,
  otp_hash VARCHAR(100),
  status ENUM('pending','approved','rejected','used') NOT NULL DEFAULT 'pending',
  decided_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  KEY (salon_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Packages, memberships, wallet
-- ---------------------------------------------------------------
CREATE TABLE packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('package','membership') NOT NULL DEFAULT 'package',
  price DECIMAL(10,2) NOT NULL,
  sessions INT NULL,
  service_id INT NULL,
  value_amount DECIMAL(10,2) NULL,
  discount_pct DECIMAL(5,2) NULL,
  validity_days INT NOT NULL DEFAULT 365,
  description VARCHAR(300),
  is_active TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE client_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  package_id INT NOT NULL,
  salon_id INT NOT NULL,
  sessions_total INT NULL,
  sessions_left INT NULL,
  price_paid DECIMAL(10,2) NOT NULL,
  discount_pct DECIMAL(5,2) NULL,
  purchased_at DATETIME NOT NULL,
  expires_at DATE NOT NULL,
  invoice_id INT NULL,
  status ENUM('active','exhausted','expired') NOT NULL DEFAULT 'active',
  KEY (client_id), KEY (salon_id, status),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE wallet_txns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  salon_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  type ENUM('credit','debit') NOT NULL,
  note VARCHAR(160),
  invoice_id INT NULL,
  created_at DATETIME NOT NULL,
  KEY (client_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Vendors (needed by inventory)
-- ---------------------------------------------------------------
CREATE TABLE vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('distributor','brand','equipment','academy') NOT NULL,
  city VARCHAR(60),
  phone VARCHAR(15),
  gstin VARCHAR(20),
  about VARCHAR(400),
  hue INT NOT NULL DEFAULT 30,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80),
  category VARCHAR(40),
  unit VARCHAR(12) NOT NULL DEFAULT 'pc',
  trade_price DECIMAL(10,2) NOT NULL,
  mrp DECIMAL(10,2) NOT NULL,
  moq INT NOT NULL DEFAULT 1,
  scheme VARCHAR(120),
  stock INT NOT NULL DEFAULT 100,
  is_active TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  salon_id INT NOT NULL,
  credit_limit DECIMAL(12,2) NOT NULL DEFAULT 50000,
  credit_days INT NOT NULL DEFAULT 30,
  UNIQUE KEY (vendor_id, salon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE brand_vendor_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  vendor_product_id INT NOT NULL,
  negotiated_price DECIMAL(10,2) NOT NULL,
  UNIQUE KEY (brand_id, vendor_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Retail & inventory
-- ---------------------------------------------------------------
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  vendor_product_id INT NULL,
  preferred_vendor_id INT NULL,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(80),
  category VARCHAR(40),
  barcode VARCHAR(40),
  kind ENUM('retail','backbar','both') NOT NULL DEFAULT 'retail',
  unit VARCHAR(12) NOT NULL DEFAULT 'pc',
  mrp DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(10,2) NOT NULL DEFAULT 5,
  reorder_qty DECIMAL(10,2) NOT NULL DEFAULT 10,
  expiry_date DATE NULL,
  refill_days INT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  KEY (salon_id), KEY (barcode),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  product_id INT NOT NULL,
  qty DECIMAL(10,3) NOT NULL,
  UNIQUE KEY (service_id, product_id),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- type: purchase(+), sale(-), backbar(- auto from recipe), adjustment(+/- stock count),
-- issue (0 stock effect: what a stylist physically took, used for variance)
CREATE TABLE stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  salon_id INT NOT NULL,
  type ENUM('purchase','sale','backbar','adjustment','issue','return') NOT NULL,
  qty DECIMAL(10,3) NOT NULL,
  staff_id INT NULL,
  ref_type VARCHAR(20),
  ref_id INT NULL,
  note VARCHAR(200),
  created_by INT NULL,
  created_at DATETIME NOT NULL,
  KEY (salon_id, created_at), KEY (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  vendor_id INT NOT NULL,
  po_no VARCHAR(30) NOT NULL,
  status ENUM('draft','placed','accepted','dispatched','delivered','cancelled') NOT NULL DEFAULT 'draft',
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  notes VARCHAR(300),
  created_by INT NULL,
  created_at DATETIME NOT NULL,
  placed_at DATETIME NULL,
  delivered_at DATETIME NULL,
  KEY (vendor_id, status), KEY (salon_id),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE po_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_id INT NOT NULL,
  vendor_product_id INT NULL,
  product_id INT NULL,
  name VARCHAR(160) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  salon_id INT NOT NULL,
  po_id INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'upi',
  ref VARCHAR(80),
  paid_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(400),
  target_city VARCHAR(60) NULL,
  target_plan VARCHAR(20) NULL,
  scheme VARCHAR(160),
  starts_on DATE,
  ends_on DATE,
  views INT NOT NULL DEFAULT 0,
  claims INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE promotion_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  promotion_id INT NOT NULL,
  salon_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (promotion_id, salon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE authenticity_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  vendor_product_id INT NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  batch_no VARCHAR(30),
  mfg_date DATE,
  expiry_date DATE,
  verified_count INT NOT NULL DEFAULT 0,
  last_verified_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  vendor_id INT NULL,
  name VARCHAR(120) NOT NULL,
  serial_no VARCHAR(60),
  purchased_on DATE,
  warranty_until DATE,
  amc_until DATE,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT NOT NULL,
  salon_id INT NOT NULL,
  vendor_id INT NULL,
  issue VARCHAR(300) NOT NULL,
  status ENUM('open','scheduled','closed') NOT NULL DEFAULT 'open',
  visit_on DATE NULL,
  resolution VARCHAR(300),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Staff: roster, attendance, leave, payroll
-- ---------------------------------------------------------------
CREATE TABLE roster (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  salon_id INT NOT NULL,
  date DATE NOT NULL,
  shift_start TIME NULL,
  shift_end TIME NULL,
  is_off TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY (staff_id, date),
  KEY (salon_id, date),
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  salon_id INT NOT NULL,
  date DATE NOT NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  lat DECIMAL(9,6) NULL,
  lng DECIMAL(9,6) NULL,
  distance_m INT NULL,
  selfie_path VARCHAR(200),
  status ENUM('present','late','absent','leave','off') NOT NULL DEFAULT 'present',
  UNIQUE KEY (staff_id, date),
  KEY (salon_id, date),
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  salon_id INT NOT NULL,
  type ENUM('leave','swap','shift_change') NOT NULL DEFAULT 'leave',
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  swap_with_staff_id INT NULL,
  reason VARCHAR(300),
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE advances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  salon_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  given_on DATE NOT NULL,
  note VARCHAR(200),
  recovered_in CHAR(7) NULL,
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payslips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  salon_id INT NOT NULL,
  month CHAR(7) NOT NULL,
  days_in_month INT NOT NULL,
  days_paid DECIMAL(5,1) NOT NULL,
  base DECIMAL(10,2) NOT NULL,
  service_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission DECIMAL(10,2) NOT NULL DEFAULT 0,
  retail_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  retail_incentive DECIMAL(10,2) NOT NULL DEFAULT 0,
  slab_bonus DECIMAL(10,2) NOT NULL DEFAULT 0,
  tips DECIMAL(10,2) NOT NULL DEFAULT 0,
  advances DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross DECIMAL(10,2) NOT NULL,
  net DECIMAL(10,2) NOT NULL,
  status ENUM('draft','finalised','paid') NOT NULL DEFAULT 'draft',
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (staff_id, month),
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE staff_voice (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  user_id INT NULL,
  category ENUM('workload','pay','manager','safety','idea','other') NOT NULL DEFAULT 'other',
  message VARCHAR(1000) NOT NULL,
  status ENUM('new','seen','resolved') NOT NULL DEFAULT 'new',
  reply VARCHAR(600),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(40),
  before_hue INT NOT NULL DEFAULT 30,
  after_hue INT NOT NULL DEFAULT 300,
  image_path VARCHAR(200) NULL,
  likes INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES salon_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE prescriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  client_id INT NOT NULL,
  staff_id INT NOT NULL,
  product_id INT NOT NULL,
  invoice_id INT NULL,
  note VARCHAR(300),
  status ENUM('suggested','bought','ordered') NOT NULL DEFAULT 'suggested',
  created_at DATETIME NOT NULL,
  KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------
CREATE TABLE expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  category ENUM('rent','electricity','salary','maintenance','product','marketing','royalty','amc','laundry','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  note VARCHAR(200),
  bill_path VARCHAR(200),
  recurring_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (salon_id, expense_date),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recurring_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  category VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  day_of_month INT NOT NULL DEFAULT 1,
  note VARCHAR(200),
  is_active TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cash_closings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  date DATE NOT NULL,
  opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
  cash_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  cash_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_cash DECIMAL(12,2) NOT NULL,
  counted_cash DECIMAL(12,2) NOT NULL,
  upi_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  variance DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes VARCHAR(300),
  closed_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (salon_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Reviews, checklists, audits
-- ---------------------------------------------------------------
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NOT NULL,
  staff_id INT NULL,
  client_id INT NULL,
  user_id INT NULL,
  invoice_id INT NULL,
  r_result TINYINT NOT NULL,
  r_hygiene TINYINT NOT NULL,
  r_wait TINYINT NOT NULL,
  r_value TINYINT NOT NULL,
  r_behaviour TINYINT NOT NULL,
  overall DECIMAL(2,1) NOT NULL,
  comment VARCHAR(800),
  stage ENUM('private','public','recovered') NOT NULL DEFAULT 'public',
  recovery_note VARCHAR(400),
  created_at DATETIME NOT NULL,
  KEY (salon_id, stage), KEY (staff_id),
  UNIQUE KEY (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE checklist_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NULL,
  brand_id INT NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('opening','closing','hygiene','service') NOT NULL,
  items JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE checklist_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  salon_id INT NOT NULL,
  run_date DATE NOT NULL,
  done_by INT NULL,
  items JSON NOT NULL,
  score INT NOT NULL,
  photo_path VARCHAR(200),
  created_at DATETIME NOT NULL,
  UNIQUE KEY (template_id, salon_id, run_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  salon_id INT NOT NULL,
  auditor_id INT NOT NULL,
  audit_date DATE NOT NULL,
  score INT NOT NULL,
  items JSON NOT NULL,
  summary VARCHAR(600),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (salon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_id INT NOT NULL,
  salon_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  due_date DATE,
  status ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  outlet_note VARCHAR(300),
  closed_at DATETIME NULL,
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Franchise: royalty, leads
-- ---------------------------------------------------------------
CREATE TABLE royalty_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  salon_id INT NOT NULL,
  month CHAR(7) NOT NULL,
  net_sales DECIMAL(12,2) NOT NULL,
  royalty_pct DECIMAL(5,2) NOT NULL,
  royalty_amount DECIMAL(12,2) NOT NULL,
  marketing_fee DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  status ENUM('due','paid') NOT NULL DEFAULT 'due',
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  UNIQUE KEY (salon_id, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NULL,
  salon_id INT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  city VARCHAR(60),
  area VARCHAR(80),
  lat DECIMAL(9,6) NULL,
  lng DECIMAL(9,6) NULL,
  service_interest VARCHAR(120),
  source ENUM('instagram','google','website','campaign','referral','facebook') NOT NULL DEFAULT 'instagram',
  status ENUM('new','assigned','contacted','booked','lost') NOT NULL DEFAULT 'new',
  notes VARCHAR(300),
  assigned_at DATETIME NULL,
  contacted_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY (brand_id, status), KEY (salon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------
CREATE TABLE courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NULL,
  vendor_id INT NULL,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(40),
  level ENUM('basic','intermediate','advanced') NOT NULL DEFAULT 'basic',
  duration_min INT NOT NULL DEFAULT 5,
  lessons JSON NOT NULL,
  badge_name VARCHAR(60),
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_published TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE course_enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_by INT NULL,
  done_lessons JSON NULL,
  progress INT NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  source VARCHAR(40),
  awarded_at DATETIME NOT NULL,
  UNIQUE KEY (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Customer app: favourites, shop, payment orders
-- ---------------------------------------------------------------
CREATE TABLE favourites (
  user_id INT NOT NULL,
  salon_id INT NOT NULL,
  PRIMARY KEY (user_id, salon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shop_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  salon_id INT NOT NULL,
  client_id INT NULL,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('placed','paid','ready','delivered','cancelled') NOT NULL DEFAULT 'placed',
  fulfilment ENUM('pickup','delivery') NOT NULL DEFAULT 'pickup',
  address VARCHAR(300),
  payment_ref VARCHAR(80),
  created_at DATETIME NOT NULL,
  KEY (salon_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shop_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  qty INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  purpose ENUM('deposit','shop','gold','po','royalty') NOT NULL,
  ref_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  provider_order_id VARCHAR(80),
  provider_payment_id VARCHAR(80),
  status ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (provider_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- Messaging, notifications, audit trail, platform
-- ---------------------------------------------------------------
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500),
  link VARCHAR(200),
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE message_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NULL,
  channel ENUM('whatsapp','sms','email','push') NOT NULL,
  to_phone VARCHAR(20),
  to_name VARCHAR(120),
  template VARCHAR(40),
  body TEXT,
  status ENUM('sent','failed','simulated') NOT NULL,
  provider VARCHAR(30),
  provider_ref VARCHAR(120),
  error VARCHAR(300),
  ref_type VARCHAR(30),
  ref_id INT NULL,
  created_at DATETIME NOT NULL,
  KEY (salon_id, created_at), KEY (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  salon_id INT NULL,
  user_id INT NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(30),
  entity_id INT NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL,
  KEY (salon_id, action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE demo_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(160),
  business_name VARCHAR(160),
  city VARCHAR(60),
  outlets INT,
  role VARCHAR(30),
  message VARCHAR(600),
  status ENUM('new','contacted','demo_done','won','lost') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
