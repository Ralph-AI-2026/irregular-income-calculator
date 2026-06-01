/**
 * Import Duty / Landed-Cost Calculation Engine
 * Skip the Surprise — import-duty calculator
 *
 * Works in Node.js (module.exports) AND browser (window.ImportDutyEngine).
 * Pure functions, no side effects, no dependencies.
 *
 * Sources:
 *   Canada duty rates  — CBSA Canada Customs Tariff 2025
 *   Canada tax rates   — CBSA Memo D2-3-6 Appendix A
 *   Canada thresholds  — CBSA D8-2-16 / CUSMA Art. 7.8
 *   Canada fees        — Canada Post D17-1-22; UPS broker fee schedule
 *   US rates           — USITC HTS / broker guides 2026, CBP, 19 CFR 24.23; see US_RATES
 *
 * Rates stamp: 2026-06-01
 */

'use strict';

// ---------------------------------------------------------------------------
// CANADA — DUTY RATES (MFN, China-origin, above threshold)
// Source: CBSA Canada Customs Tariff 2025 (verified 2026-06-01)
// ---------------------------------------------------------------------------
var DUTY_RATES_CA = {
  clothing:         0.18,   // Ch. 61/62 — shirts, dresses, pants, jackets
  footwear:         0.18,   // Ch. 64 — shoes, sneakers, sandals
  bags:             0.11,   // 4202 — backpacks, wallets, luggage, suitcases
  jewelry:          0.085,  // 7113/7117 — real + costume jewelry
  watches:          0.05,   // 9101/9102
  sunglasses:       0.05,   // 9004
  electronics:      0.00,   // 8517/8471/8518 — phones, laptops, headphones (WTO ITA)
  toys:             0.00,   // 9503
  video_games:      0.00,   // 9504 — consoles, accessories
  sporting:         0.00,   // 9506 — fitness, gym equipment
  cosmetics:        0.065,  // 3304 — makeup
  skincare:         0.065,  // 3304/3307 — serums, sunscreen
  perfume:          0.065,  // 3303
  tools:            0.065,  // Ch. 82 — hand tools (range 0-11%; 6.5% representative)
  plastic_household:0.065,  // 3924/3926 — kitchenware
  books:            0.00,   // Ch. 49
  small_appliances: 0.065,  // 8509/8516 — toaster, kettle, hair dryer (~6.5%, GAP noted)
  home_ceramic_glass:0.065, // Ch. 69/70 — ceramics, glass (~0-8%; 6.5% conservative default, GAP noted)
  bedding:          0.18,   // Ch. 63 — linens, towels, curtains
  other:            0.065,  // conservative default with note
};

// ---------------------------------------------------------------------------
// CANADA — PROVINCIAL IMPORT TAX RATES
// CBSA collects full combined GST+PST/QST at the border (Memo D2-3-6 App A)
// Tax base = (order value + duty)
// ---------------------------------------------------------------------------
var TAX_RATES_CA = {
  ON: 0.13,      // HST
  NB: 0.15,      // HST
  NL: 0.15,      // HST
  PE: 0.15,      // HST
  NS: 0.14,      // HST (dropped from 15% Apr 1 2025)
  QC: 0.14975,   // 5% GST + 9.975% QST
  BC: 0.12,      // 5% GST + 7% PST
  MB: 0.12,      // 5% GST + 7% PST
  SK: 0.11,      // 5% GST + 6% PST
  AB: 0.05,      // GST only
  YT: 0.05,      // GST only
  NT: 0.05,      // GST only
  NU: 0.05,      // GST only
};

// ---------------------------------------------------------------------------
// US — RATES (sourced 2026-06-01)
// IEEPA "reciprocal tariff" regime struck down by US Supreme Court 2026-02-20.
// Model updated to reflect operative US tariff stack as of 2026-06-01.
// Sources: USITC HTS schedule, broker guides 2026, CBP, 19 CFR 24.23.
// ---------------------------------------------------------------------------
var US_RATES = {
  RATES_STAMP: '2026-06-01',
  DE_MINIMIS: 0, // $800 de minimis suspended for ALL countries (EO 2026-02-20), every parcel dutiable
  // MFN base (Column 1 general) ad valorem rate by category — representative consumer rates, sourced from USITC HTS / broker guides 2026
  MFN_BASE_BY_CATEGORY: {
    clothing:          0.16,   // range 11.5-32% (cotton knit ~16.5%, synthetic up to 32%); 0.16 representative
    footwear:          0.20,   // highly variable 8.5-48% by material/value; 0.20 representative
    bags:              0.176,  // textile/plastic backpacks 16.8-20% (leather 5.3-8%); 0.176 representative
    jewelry:           0.07,   // costume 3.3-11%, fine 0-6.5%; 0.07 representative
    watches:           0.05,   // 3.9-6.4%
    sunglasses:        0.022,  // 2-2.5%
    electronics:       0.00,   // phones/laptops/speakers ITA-free
    toys:              0.00,   // 9503 free
    video_games:       0.00,   // 9504 consoles free
    sporting:          0.046,  // 9506.91 4.6%
    cosmetics:         0.00,   // 3304 free
    skincare:          0.00,   // 3304 free
    perfume:           0.00,   // 3303 free
    tools:             0.04,   // 3.7-9%; 0.04 representative
    plastic_household: 0.034,  // 3924 3.4%
    books:             0.00,   // Ch.49 free
    small_appliances:  0.02,   // FLAG: not firmly sourced
    home_ceramic_glass:0.05,   // FLAG: not firmly sourced
    bedding:           0.119,  // cotton bed linen 11.9%
    other:             0.05,   // representative default
  },
  SECTION_301_CHINA: 0.25,   // China-origin only. Lists 1-3 = 25%, List 4A consumer goods = 7.5%. 0.25 conservative/headline; FLAG the 7.5% possibility in a note. NOT IEEPA — unaffected by the Feb 2026 ruling, fully in force.
  SECTION_122_RATE: 0.10,    // global surcharge, ALL origins incl postal; eff 2026-02-24
  SECTION_122_ACTIVE: true,  // sunsets ~2026-07-24 by statute; under Federal Circuit litigation; set false when it expires/is struck
  // Fees
  MPF_INFORMAL: 2.69,        // informal entry automated MPF (FY2026); USPS regular mail EXEMPT from MPF
  COURIER_CLEARANCE_LOW: 9.75,  // carrier clearance/entry fee, customs value $0-200 (FedEx representative)
  COURIER_CLEARANCE_HIGH: 19.50,// carrier clearance/entry fee, $200.01-800
  POSTAL_DUTIABLE_FEE: 9.35, // USPS dutiable-item delivery fee charged to recipient
};

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Round to 2 decimal places.
 * Uses "round half away from zero" (standard financial rounding).
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Return the UPS Ground brokerage tier fee for Canada courier shipments.
 * Applies ONLY when duty+tax > 0.
 * Source: UPS broker fee schedule (SECONDARY, verified 2026-06-01)
 * @param {number} orderValue - order value in CAD
 * @returns {{ fee: number, approximate: boolean }}
 */
function upsGroundTier(orderValue) {
  if (orderValue <= 20)       return { fee: 0,     approximate: false };
  if (orderValue <= 40)       return { fee: 7.00,  approximate: false };
  if (orderValue <= 100)      return { fee: 19.45, approximate: false };
  if (orderValue <= 200)      return { fee: 29.00, approximate: false };
  if (orderValue <= 350)      return { fee: 42.95, approximate: false };
  if (orderValue <= 500)      return { fee: 48.25, approximate: false };
  /* > 500 */                  return { fee: 48.25, approximate: true  };
}

// ---------------------------------------------------------------------------
// CANADA ENGINE
// ---------------------------------------------------------------------------

function calculateCanada(input) {
  var orderValue  = input.orderValue;
  var shipFrom    = input.shipFrom;   // 'china' | 'us-mexico' | 'other'
  var shipMethod  = input.shipMethod; // 'postal' | 'courier' | 'pickup'
  var province    = input.province;
  var category    = input.category;

  // Validate province
  if (!TAX_RATES_CA.hasOwnProperty(province)) {
    throw new Error('Unknown province code: ' + province);
  }
  // Validate category; fall back to 'other' with a note
  var resolvedCategory = DUTY_RATES_CA.hasOwnProperty(category) ? category : 'other';
  var unknownCategoryNote = (resolvedCategory !== category)
    ? 'Unknown category "' + category + '" — using 6.5% default duty rate.'
    : null;

  var notes = [];
  var breakdown = [];

  // --- Step 1: Thresholds ---
  var dutyThreshold, taxThreshold;
  if (shipFrom === 'us-mexico' && shipMethod === 'courier') {
    dutyThreshold = 150;
    taxThreshold  = 40;
  } else {
    // china/other, OR any postal method
    dutyThreshold = 20;
    taxThreshold  = 20;
  }

  // --- Step 2: Duty ---
  var dutyRate = DUTY_RATES_CA[resolvedCategory];
  var duty;
  if (orderValue > dutyThreshold) {
    duty = dutyRate * orderValue;
  } else {
    duty = 0;
  }

  // CUSMA note: US/Mexico courier, under $150, duty would have been > 0 due to rate but threshold zeroed it
  if (shipFrom === 'us-mexico' && shipMethod === 'courier' && orderValue <= dutyThreshold) {
    notes.push('CUSMA: no duty under $150 from US/Mexico.');
  }

  // Gap notes for categories with uncertain rates
  if (category === 'small_appliances') {
    notes.push('Small appliances rate ~6.5% (approximate; exact rate varies 0-8% by HS subheading).');
  }
  if (category === 'home_ceramic_glass') {
    notes.push('Ceramics/glass housewares rate ~6.5% used as conservative default (range 0-8%; primary source pending).');
  }
  if (unknownCategoryNote) {
    notes.push(unknownCategoryNote);
  }

  // --- Step 3: Tax ---
  var taxRate = TAX_RATES_CA[province];
  var tax;
  if (orderValue > taxThreshold) {
    tax = taxRate * (orderValue + duty);
  } else {
    tax = 0;
  }

  // --- Step 4: Carrier fee ---
  var carrierFee = 0;
  var dutyPlusTax = duty + tax;
  var upsApproximate = false;

  if (shipMethod === 'postal') {
    // Canada Post $9.95 flat, only if item is dutiable or taxable
    carrierFee = dutyPlusTax > 0 ? 9.95 : 0;
  } else if (shipMethod === 'courier') {
    // UPS Ground representative tier, only if item is dutiable or taxable
    if (dutyPlusTax > 0) {
      var tier = upsGroundTier(orderValue);
      carrierFee = tier.fee;
      upsApproximate = tier.approximate;
    }
  } else {
    // 'pickup'
    carrierFee = 0;
  }

  if (upsApproximate) {
    notes.push('Carrier brokerage fee approximate for orders over $500 CAD.');
  }

  // --- Step 5: Total (keep full precision internally, round at output) ---
  var totalRaw = orderValue + duty + tax + carrierFee;

  // Build breakdown (round individual lines to 2 dp for display)
  breakdown.push({ label: 'Item value',    amount: round2(orderValue) });
  if (duty > 0 || orderValue > dutyThreshold) {
    breakdown.push({ label: 'Duty (' + (dutyRate * 100).toFixed(1) + '%)', amount: round2(duty) });
  }
  if (tax > 0 || orderValue > taxThreshold) {
    breakdown.push({ label: 'Import tax (' + (taxRate * 100 % 1 === 0 ? (taxRate * 100).toFixed(0) : (taxRate * 100).toFixed(3)) + '%)', amount: round2(tax) });
  }
  if (shipMethod === 'postal') {
    breakdown.push({ label: 'Canada Post handling', amount: round2(carrierFee) });
  } else if (shipMethod === 'courier') {
    breakdown.push({ label: 'Courier brokerage (representative)', amount: round2(carrierFee) });
  }

  return {
    country:      'CA',
    itemValue:    round2(orderValue),
    duty:         round2(duty),
    dutyRate:     dutyRate,
    tax:          round2(tax),
    taxRate:      taxRate,
    carrierFee:   round2(carrierFee),
    total:        round2(totalRaw),
    breakdown:    breakdown,
    notes:        notes,
  };
}

// ---------------------------------------------------------------------------
// US ENGINE
// ---------------------------------------------------------------------------

function calculateUS(input) {
  var orderValue  = input.orderValue;
  var shipFrom    = input.shipFrom;   // 'china' | 'us-mexico' | 'other'
  var shipMethod  = input.shipMethod; // 'postal' | 'courier' | 'pickup'
  var category    = input.category;

  var notes = [];
  var breakdown = [];

  // Resolve category; fall back to 'other' with a note
  var resolvedCategory = US_RATES.MFN_BASE_BY_CATEGORY.hasOwnProperty(category)
    ? category : 'other';
  if (resolvedCategory !== category) {
    notes.push('Unknown category "' + category + '" — using 5% default duty rate.');
  }

  // MFN base duty (USMCA: exempt)
  var mfnRate = US_RATES.MFN_BASE_BY_CATEGORY[resolvedCategory];
  var base = 0;
  if (shipFrom === 'us-mexico') {
    base = 0;
    notes.push('Assumes goods qualify under USMCA (most US/Mexico-made goods) — duty-free.');
  } else {
    base = mfnRate * orderValue;
  }

  // China Section 301 tariff (NOT IEEPA — unaffected by Feb 2026 ruling)
  var section301 = (shipFrom === 'china') ? US_RATES.SECTION_301_CHINA * orderValue : 0;

  // Section 122 global surcharge (exempt for USMCA/us-mexico)
  var section122 = 0;
  if (US_RATES.SECTION_122_ACTIVE && shipFrom !== 'us-mexico') {
    section122 = US_RATES.SECTION_122_RATE * orderValue;
  }

  // Fees — none if nothing to clear (us-mexico USMCA qualifying with zero duty/surcharge)
  var totalDutyAndSurcharge = base + section301 + section122;
  var mpf = 0;
  var clearance = 0;
  var postalFee = 0;

  if (totalDutyAndSurcharge > 0) {
    if (shipMethod === 'courier') {
      mpf       = US_RATES.MPF_INFORMAL;
      clearance = (orderValue <= 200)
        ? US_RATES.COURIER_CLEARANCE_LOW
        : US_RATES.COURIER_CLEARANCE_HIGH;
    } else if (shipMethod === 'postal') {
      // USPS regular mail is exempt from MPF; dutiable-item fee applies instead
      postalFee = US_RATES.POSTAL_DUTIABLE_FEE;
    }
    // pickup: 0
  }

  var carrierFeeTotal = mpf + clearance + postalFee;
  var totalRaw = orderValue + base + section301 + section122 + carrierFeeTotal;

  // Breakdown — only show nonzero lines, but always show base if category is dutiable
  breakdown.push({ label: 'Item value', amount: round2(orderValue) });
  if (base > 0 || mfnRate > 0) {
    breakdown.push({
      label: 'US import duty (' + (mfnRate * 100).toFixed(1) + '%)',
      amount: round2(base),
    });
  }
  if (section301 > 0) {
    breakdown.push({ label: 'China Section 301 tariff (25%)', amount: round2(section301) });
  }
  if (section122 > 0) {
    breakdown.push({ label: 'Section 122 surcharge (10%)', amount: round2(section122) });
  }
  if (mpf > 0) {
    breakdown.push({ label: 'MPF', amount: round2(mpf) });
  }
  if (clearance > 0) {
    breakdown.push({ label: 'Carrier clearance', amount: round2(clearance) });
  }
  if (postalFee > 0) {
    breakdown.push({ label: 'USPS dutiable-item fee', amount: round2(postalFee) });
  }

  // Standing notes always present
  notes.push(
    'ESTIMATE — US tariffs are volatile and contested. Rates as of ' + US_RATES.RATES_STAMP + '.'
  );
  notes.push('$800 de minimis eliminated — every parcel is dutiable regardless of value.');
  if (shipFrom === 'china') {
    notes.push(
      'China Section 301 tariff shown at 25% (Lists 1-3); some consumer goods (List 4A) are 7.5% — ' +
      'your actual rate may be lower.'
    );
  }
  if (US_RATES.SECTION_122_ACTIVE) {
    notes.push(
      'Section 122 surcharge (10%) is under court challenge and expires ~Jul 24 2026; ' +
      'the total may drop after that.'
    );
  }

  return {
    country:      'US',
    itemValue:    round2(orderValue),
    duty:         round2(base + section301),
    dutyRate:     mfnRate + (shipFrom === 'china' ? US_RATES.SECTION_301_CHINA : 0),
    surcharge:    round2(section122),
    tax:          0,
    taxRate:      0,
    carrierFee:   round2(carrierFeeTotal),
    total:        round2(totalRaw),
    breakdown:    breakdown,
    notes:        notes,
    ratesStamp:   US_RATES.RATES_STAMP,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * calculateLanded(input) -> result
 *
 * input = {
 *   country:    'CA' | 'US',
 *   orderValue: number,            // CAD for CA, USD for US
 *   currency:   string,            // informational only ('CAD' | 'USD')
 *   shipFrom:   'china' | 'us-mexico' | 'other',
 *   shipMethod: 'postal' | 'courier' | 'pickup',
 *   province:   string,            // CA only — 2-letter code e.g. 'ON'
 *   state:      string | null,     // US only — may be null
 *   category:   string,            // see DUTY_RATES_CA keys
 * }
 *
 * result = {
 *   country:    'CA' | 'US',
 *   itemValue:  number,
 *   duty:       number,
 *   dutyRate:   number,
 *   tax:        number,
 *   taxRate:    number,
 *   carrierFee: number,
 *   total:      number,
 *   breakdown:  [ { label: string, amount: number } ],
 *   notes:      [ string ],
 * }
 */
function calculateLanded(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('calculateLanded: input must be an object');
  }
  if (typeof input.orderValue !== 'number' || input.orderValue < 0) {
    throw new Error('calculateLanded: orderValue must be a non-negative number');
  }
  var country = (input.country || '').toUpperCase();
  if (country === 'CA') {
    return calculateCanada(input);
  } else if (country === 'US') {
    return calculateUS(input);
  } else {
    throw new Error('calculateLanded: country must be "CA" or "US"');
  }
}

// ---------------------------------------------------------------------------
// MODULE EXPORT (Node) + BROWSER ATTACH
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateLanded: calculateLanded };
} else if (typeof window !== 'undefined') {
  window.ImportDutyEngine = { calculateLanded: calculateLanded };
}
