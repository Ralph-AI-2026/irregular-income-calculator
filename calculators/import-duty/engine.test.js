/**
 * engine.test.js — Node test suite for the Import Duty / Landed-Cost engine.
 * No external dependencies. Uses built-in assert module.
 * Run: node engine.test.js
 * Exit 0 = all pass. Non-zero = failures found.
 *
 * Hand-verification comments on every case document the arithmetic so this
 * file serves as a permanent audit trail.
 */

'use strict';

var assert = require('assert');
var engine = require('./engine.js');
var calc   = engine.calculateLanded;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
var PASS = 0;
var FAIL = 0;
var results = [];

function run(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ name: name, status: 'PASS', detail: '' });
  } catch (e) {
    FAIL++;
    results.push({ name: name, status: 'FAIL', detail: e.message });
  }
}

/**
 * Assert two numbers are equal to the cent.
 * Compares after rounding both to 2 dp to absorb any floating-point noise.
 */
function assertMoney(label, actual, expected) {
  var a = Math.round(actual   * 100) / 100;
  var e = Math.round(expected * 100) / 100;
  assert.strictEqual(a, e,
    label + ': expected ' + e.toFixed(2) + ' got ' + a.toFixed(2)
  );
}

// ---------------------------------------------------------------------------
// CANADA — REQUIRED CASES (C1-C5): expected values are LOCKED, hand-verified
// ---------------------------------------------------------------------------

/**
 * C1: CA, $50, china, postal, ON, clothing
 * dutyThreshold=20, taxThreshold=20 (china+postal)
 * duty   = 0.18 * 50 = 9.00
 * tax    = 0.13 * (50 + 9) = 0.13 * 59 = 7.67
 * fee    = Canada Post $9.95 (duty+tax=16.67 > 0)
 * total  = 50 + 9.00 + 7.67 + 9.95 = 76.62
 */
run('C1 — china/postal/ON/clothing $50', function() {
  var r = calc({ country: 'CA', orderValue: 50, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  assertMoney('duty',  r.duty,       9.00);
  assertMoney('tax',   r.tax,        7.67);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      76.62);
});

/**
 * C2: CA, $15, china, postal, ON, toys
 * dutyThreshold=20, taxThreshold=20
 * 15 <= 20 -> duty=0, tax=0 (toys rate=0% anyway)
 * fee    = 0 (no duty+tax)
 * total  = 15.00
 */
run('C2 — china/postal/ON/toys $15', function() {
  var r = calc({ country: 'CA', orderValue: 15, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'toys' });
  assertMoney('duty',  r.duty,       0);
  assertMoney('tax',   r.tax,        0);
  assertMoney('fee',   r.carrierFee, 0);
  assertMoney('total', r.total,      15.00);
});

/**
 * C3: CA, $100, china, courier, BC, electronics
 * dutyThreshold=20, taxThreshold=20 (china+courier)
 * duty   = 0.00 * 100 = 0 (electronics free)
 * tax    = 0.12 * (100 + 0) = 12.00
 * fee    = UPS tier for $100 -> 40.01-100 bracket -> $19.45 (duty+tax=12 > 0)
 * total  = 100 + 0 + 12.00 + 19.45 = 131.45
 */
run('C3 — china/courier/BC/electronics $100', function() {
  var r = calc({ country: 'CA', orderValue: 100, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'courier', province: 'BC', category: 'electronics' });
  assertMoney('duty',  r.duty,       0);
  assertMoney('tax',   r.tax,        12.00);
  assertMoney('fee',   r.carrierFee, 19.45);
  assertMoney('total', r.total,      131.45);
});

/**
 * C4: CA, $200, china, courier, AB, clothing
 * dutyThreshold=20, taxThreshold=20
 * duty   = 0.18 * 200 = 36.00
 * tax    = 0.05 * (200 + 36) = 0.05 * 236 = 11.80
 * fee    = UPS tier for $200 -> 100.01-200 bracket -> $29.00 (duty+tax=47.80 > 0)
 * total  = 200 + 36 + 11.80 + 29 = 276.80
 */
run('C4 — china/courier/AB/clothing $200', function() {
  var r = calc({ country: 'CA', orderValue: 200, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'courier', province: 'AB', category: 'clothing' });
  assertMoney('duty',  r.duty,       36.00);
  assertMoney('tax',   r.tax,        11.80);
  assertMoney('fee',   r.carrierFee, 29.00);
  assertMoney('total', r.total,      276.80);
});

/**
 * C5: CA, $100, us-mexico, courier, ON, clothing
 * dutyThreshold=150, taxThreshold=40 (us-mexico+courier = CUSMA tiers)
 * duty   = 100 <= 150 -> 0 (CUSMA note triggered)
 * tax    = 100 > 40 -> 0.13 * (100 + 0) = 13.00
 * fee    = UPS tier for $100 -> 40.01-100 bracket -> $19.45 (duty+tax=13 > 0)
 * total  = 100 + 0 + 13.00 + 19.45 = 132.45
 */
run('C5 — us-mexico/courier/ON/clothing $100 (CUSMA)', function() {
  var r = calc({ country: 'CA', orderValue: 100, currency: 'CAD',
    shipFrom: 'us-mexico', shipMethod: 'courier', province: 'ON', category: 'clothing' });
  assertMoney('duty',  r.duty,       0);
  assertMoney('tax',   r.tax,        13.00);
  assertMoney('fee',   r.carrierFee, 19.45);
  assertMoney('total', r.total,      132.45);
  // Confirm CUSMA note is present
  var hasCusmaNote = r.notes.some(function(n) { return n.indexOf('CUSMA') !== -1; });
  assert.ok(hasCusmaNote, 'Expected CUSMA note in result');
});

// ---------------------------------------------------------------------------
// CANADA — ADDITIONAL CASES (C6-C12): hand-verified
// ---------------------------------------------------------------------------

/**
 * C6: CA, $20.00 exact, china, postal, ON, clothing — exact boundary, should be FREE
 * dutyThreshold=20. orderValue (20) is NOT > 20, so duty=0.
 * taxThreshold=20. orderValue (20) is NOT > 20, so tax=0.
 * fee    = 0 (no duty+tax)
 * total  = 20.00
 * KEY: the condition is strictly-greater-than. $20.00 is NOT over threshold.
 */
run('C6 — exact $20.00 boundary (should be free)', function() {
  var r = calc({ country: 'CA', orderValue: 20.00, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  assertMoney('duty',  r.duty,       0);
  assertMoney('tax',   r.tax,        0);
  assertMoney('fee',   r.carrierFee, 0);
  assertMoney('total', r.total,      20.00);
});

/**
 * C7: CA, $50, china, postal, QC, clothing — QC 14.975% rate
 * dutyThreshold=20, taxThreshold=20
 * duty   = 0.18 * 50 = 9.00
 * tax    = 0.14975 * (50 + 9) = 0.14975 * 59 = 8.83525 -> rounds to 8.84
 * fee    = $9.95 (duty+tax > 0)
 * total  = 50 + 9 + 8.83525 + 9.95 = 77.78525 -> rounds to 77.79
 * Note: round2() rounds each value at output. total = round2(77.78525) = 77.79
 */
run('C7 — china/postal/QC/clothing $50 (QC 14.975%)', function() {
  var r = calc({ country: 'CA', orderValue: 50, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'QC', category: 'clothing' });
  assertMoney('duty',  r.duty,       9.00);
  assertMoney('tax',   r.tax,        8.84);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      77.79);
});

/**
 * C8: CA, $80, china, postal, ON, footwear — 18% duty
 * dutyThreshold=20
 * duty   = 0.18 * 80 = 14.40
 * tax    = 0.13 * (80 + 14.40) = 0.13 * 94.40 = 12.272 -> rounds to 12.27
 * fee    = $9.95
 * total  = 80 + 14.40 + 12.272 + 9.95 = 116.622 -> 116.62
 */
run('C8 — china/postal/ON/footwear $80', function() {
  var r = calc({ country: 'CA', orderValue: 80, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'footwear' });
  assertMoney('duty',  r.duty,       14.40);
  assertMoney('tax',   r.tax,        12.27);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      116.62);
});

/**
 * C9: CA, $150, china, postal, ON, jewelry — 8.5% duty
 * duty   = 0.085 * 150 = 12.75
 * tax    = 0.13 * (150 + 12.75) = 0.13 * 162.75 = 21.1575 -> rounds to 21.16
 * fee    = $9.95
 * total  = 150 + 12.75 + 21.1575 + 9.95 = 193.8575 -> 193.86
 */
run('C9 — china/postal/ON/jewelry $150', function() {
  var r = calc({ country: 'CA', orderValue: 150, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'jewelry' });
  assertMoney('duty',  r.duty,       12.75);
  assertMoney('tax',   r.tax,        21.16);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      193.86);
});

/**
 * C10: CA, $60, china, postal, ON, bedding — 18% duty
 * duty   = 0.18 * 60 = 10.80
 * tax    = 0.13 * (60 + 10.80) = 0.13 * 70.80 = 9.204 -> rounds to 9.20
 * fee    = $9.95
 * total  = 60 + 10.80 + 9.204 + 9.95 = 89.954 -> 89.95
 */
run('C10 — china/postal/ON/bedding $60', function() {
  var r = calc({ country: 'CA', orderValue: 60, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'bedding' });
  assertMoney('duty',  r.duty,       10.80);
  assertMoney('tax',   r.tax,        9.20);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      89.95);
});

/**
 * C11: CA, $60, china, postal, ON, clothing — postal (for postal vs pickup comparison)
 * duty   = 0.18 * 60 = 10.80
 * tax    = 0.13 * (60 + 10.80) = 0.13 * 70.80 = 9.204 -> rounds to 9.20
 * fee    = $9.95 (postal)
 * total  = 60 + 10.80 + 9.204 + 9.95 = 89.954 -> 89.95
 */
run('C11 — china/postal/ON/clothing $60 (postal — for comparison)', function() {
  var r = calc({ country: 'CA', orderValue: 60, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  assertMoney('duty',  r.duty,       10.80);
  assertMoney('tax',   r.tax,        9.20);
  assertMoney('fee',   r.carrierFee, 9.95);
  assertMoney('total', r.total,      89.95);
});

/**
 * C12: CA, $60, china, pickup, ON, clothing — pickup (same order, no carrier fee)
 * duty   = 0.18 * 60 = 10.80
 * tax    = 0.13 * (60 + 10.80) = 9.204 -> rounds to 9.20
 * fee    = 0 (pickup)
 * total  = 60 + 10.80 + 9.204 + 0 = 80.004 -> 80.00
 * COMPARISON: postal (C11) costs $9.95 more at the same order value.
 */
run('C12 — china/pickup/ON/clothing $60 (pickup — for comparison)', function() {
  var r = calc({ country: 'CA', orderValue: 60, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'pickup', province: 'ON', category: 'clothing' });
  assertMoney('duty',  r.duty,       10.80);
  assertMoney('tax',   r.tax,        9.20);
  assertMoney('fee',   r.carrierFee, 0);
  assertMoney('total', r.total,      80.00);
});

// ---------------------------------------------------------------------------
// US CASES — hand-verified against the 2026-06-01 US_RATES model.
// IEEPA regime struck down 2026-02-20. Model uses MFN base + Sec 301 + Sec 122.
// ---------------------------------------------------------------------------

/**
 * USA1: US, $50, china, courier, clothing
 * base       = 0.16 * 50  =  8.00  (MFN clothing 16%)
 * section301 = 0.25 * 50  = 12.50  (China Sec 301 25%)
 * section122 = 0.10 * 50  =  5.00  (global surcharge 10%)
 * fees       = MPF(2.69) + clearance_low(9.75) = 12.44  (orderValue 50 <= 200)
 * total      = 50 + 8.00 + 12.50 + 5.00 + 12.44 = 87.94
 */
run('USA1 — china/courier/clothing $50', function() {
  var r = calc({ country: 'US', orderValue: 50, currency: 'USD',
    shipFrom: 'china', shipMethod: 'courier', state: null, category: 'clothing' });
  assertMoney('duty',      r.duty,       20.50);  // base 8.00 + sec301 12.50
  assertMoney('surcharge', r.surcharge,   5.00);
  assertMoney('carrierFee',r.carrierFee, 12.44);  // MPF 2.69 + clearance 9.75
  assertMoney('total',     r.total,      87.94);
  assert.ok(r.notes.some(function(n) { return n.indexOf('ESTIMATE') !== -1; }),
    'Expected ESTIMATE note');
});

/**
 * USA2: US, $50, china, postal, toys
 * base       = 0.00 * 50  =  0.00  (toys MFN free)
 * section301 = 0.25 * 50  = 12.50  (China Sec 301 25%)
 * section122 = 0.10 * 50  =  5.00
 * fees       = USPS dutiable fee 9.35 (duty+surcharge > 0, no MPF for postal)
 * total      = 50 + 0 + 12.50 + 5.00 + 9.35 = 76.85
 */
run('USA2 — china/postal/toys $50', function() {
  var r = calc({ country: 'US', orderValue: 50, currency: 'USD',
    shipFrom: 'china', shipMethod: 'postal', state: null, category: 'toys' });
  assertMoney('duty',      r.duty,       12.50);  // base 0 + sec301 12.50
  assertMoney('surcharge', r.surcharge,   5.00);
  assertMoney('carrierFee',r.carrierFee,  9.35);  // USPS dutiable fee
  assertMoney('total',     r.total,      76.85);
});

/**
 * USA3: US, $100, china, courier, electronics
 * base       = 0.00 * 100 =  0.00  (electronics ITA-free)
 * section301 = 0.25 * 100 = 25.00
 * section122 = 0.10 * 100 = 10.00
 * fees       = MPF(2.69) + clearance_low(9.75) = 12.44  (100 <= 200)
 * total      = 100 + 0 + 25.00 + 10.00 + 12.44 = 147.44
 */
run('USA3 — china/courier/electronics $100', function() {
  var r = calc({ country: 'US', orderValue: 100, currency: 'USD',
    shipFrom: 'china', shipMethod: 'courier', state: null, category: 'electronics' });
  assertMoney('duty',      r.duty,       25.00);  // base 0 + sec301 25.00
  assertMoney('surcharge', r.surcharge,  10.00);
  assertMoney('carrierFee',r.carrierFee, 12.44);
  assertMoney('total',     r.total,     147.44);
});

/**
 * USA4: US, $100, us-mexico, courier, clothing
 * USMCA qualifying: base=0, section301=0, section122=0, fees=0
 * total = 100.00
 */
run('USA4 — us-mexico/courier/clothing $100 (USMCA)', function() {
  var r = calc({ country: 'US', orderValue: 100, currency: 'USD',
    shipFrom: 'us-mexico', shipMethod: 'courier', state: null, category: 'clothing' });
  assertMoney('duty',      r.duty,        0);
  assertMoney('surcharge', r.surcharge,   0);
  assertMoney('carrierFee',r.carrierFee,  0);
  assertMoney('total',     r.total,     100.00);
  var hasUsmcaNote = r.notes.some(function(n) { return n.indexOf('USMCA') !== -1; });
  assert.ok(hasUsmcaNote, 'Expected USMCA note in result');
});

/**
 * USA5: US, $250, china, courier, clothing — triggers high clearance tier
 * base       = 0.16 * 250 = 40.00  (clothing 16%)
 * section301 = 0.25 * 250 = 62.50
 * section122 = 0.10 * 250 = 25.00
 * fees       = MPF(2.69) + clearance_high(19.50) = 22.19  (250 > 200)
 * total      = 250 + 40.00 + 62.50 + 25.00 + 22.19 = 399.69
 */
run('USA5 — china/courier/clothing $250 (high clearance tier)', function() {
  var r = calc({ country: 'US', orderValue: 250, currency: 'USD',
    shipFrom: 'china', shipMethod: 'courier', state: null, category: 'clothing' });
  assertMoney('duty',      r.duty,      102.50);  // base 40.00 + sec301 62.50
  assertMoney('surcharge', r.surcharge,  25.00);
  assertMoney('carrierFee',r.carrierFee, 22.19);  // MPF 2.69 + clearance_high 19.50
  assertMoney('total',     r.total,     399.69);
});

/**
 * USA6: US, $200, china, postal, bags
 * base       = 0.176 * 200 = 35.20  (bags 17.6%)
 * section301 = 0.25  * 200 = 50.00
 * section122 = 0.10  * 200 = 20.00
 * fees       = USPS dutiable fee 9.35 (duty+surcharge > 0)
 * total      = 200 + 35.20 + 50.00 + 20.00 + 9.35 = 314.55
 */
run('USA6 — china/postal/bags $200', function() {
  var r = calc({ country: 'US', orderValue: 200, currency: 'USD',
    shipFrom: 'china', shipMethod: 'postal', state: null, category: 'bags' });
  assertMoney('duty',      r.duty,       85.20);  // base 35.20 + sec301 50.00
  assertMoney('surcharge', r.surcharge,  20.00);
  assertMoney('carrierFee',r.carrierFee,  9.35);
  assertMoney('total',     r.total,     314.55);
});

// ---------------------------------------------------------------------------
// EDGE / ERROR CASES
// ---------------------------------------------------------------------------

run('ERR1 — unknown province throws', function() {
  assert.throws(function() {
    calc({ country: 'CA', orderValue: 50, currency: 'CAD',
      shipFrom: 'china', shipMethod: 'postal', province: 'XX', category: 'clothing' });
  }, /Unknown province/);
});

run('ERR2 — unknown country throws', function() {
  assert.throws(function() {
    calc({ country: 'MX', orderValue: 50, currency: 'CAD',
      shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  }, /country must be/);
});

run('ERR3 — unknown category falls back to "other" with note', function() {
  var r = calc({ country: 'CA', orderValue: 50, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'spaceship_parts' });
  // Should NOT throw; should use 6.5% default
  assertMoney('duty', r.duty, Math.round(0.065 * 50 * 100) / 100); // 3.25
  var hasNote = r.notes.some(function(n) { return n.indexOf('Unknown category') !== -1; });
  assert.ok(hasNote, 'Expected unknown-category fallback note');
});

run('ERR4 — negative orderValue throws', function() {
  assert.throws(function() {
    calc({ country: 'CA', orderValue: -10, currency: 'CAD',
      shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  }, /orderValue/);
});

run('ERR5 — $0 orderValue returns $0 total', function() {
  var r = calc({ country: 'CA', orderValue: 0, currency: 'CAD',
    shipFrom: 'china', shipMethod: 'postal', province: 'ON', category: 'clothing' });
  assertMoney('total', r.total, 0);
});

// ---------------------------------------------------------------------------
// RESULTS TABLE
// ---------------------------------------------------------------------------

var COL_NAME   = 55;
var COL_STATUS = 6;

function pad(str, len) {
  return String(str).substring(0, len) + ' '.repeat(Math.max(0, len - String(str).length));
}

console.log('');
console.log('='.repeat(80));
console.log('  IMPORT DUTY ENGINE — TEST RESULTS');
console.log('='.repeat(80));
console.log(pad('Case', COL_NAME) + pad('Status', COL_STATUS) + 'Detail');
console.log('-'.repeat(80));

results.forEach(function(r) {
  var status = r.status === 'PASS' ? 'PASS' : 'FAIL';
  var line   = pad(r.name, COL_NAME) + pad(status, COL_STATUS) + (r.detail ? r.detail : '');
  console.log(line);
});

console.log('-'.repeat(80));
console.log('  ' + PASS + ' passed, ' + FAIL + ' failed  (total ' + results.length + ')');
console.log('='.repeat(80));
console.log('');

if (FAIL > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('All tests passed.');
  process.exit(0);
}
