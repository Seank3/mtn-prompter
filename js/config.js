// ---------------------------------------------------------------------------
// config.js — DEFAULT limits, commission rates and compliance thresholds.
//
//  !! IMPORTANT !!
//  Every number below is a STARTING PLACEHOLDER, not a verified tariff.
//  Providers change tiers, caps and commission schedules regularly and they
//  differ per agent contract. Before going live, open Settings and overwrite
//  these with the figures from YOUR Airtel / MTN contract and your card
//  acquirer's merchant agreement. Everything here is user-editable at runtime.
// ---------------------------------------------------------------------------

export const DEFAULT_LIMITS = {
  /* --- customer wallet ceilings (full KYC) --- */
  airtelDaily: 5_000_000,
  airtelMonthly: 20_000_000,
  mtnDaily: 5_000_000,
  mtnMonthly: 20_000_000,

  /* --- per-transaction ceiling for you as the agent --- */
  airtelAgentTxCap: 5_000_000,
  mtnAgentTxCap: 5_000_000,
  visaCardPaymentCap: 5_000_000,

  /* --- compliance triggers (verify against your provider's tier matrix) --- */
  idRequiredAbove: 1_000_000,   // take a photo/copy of ID at or above this
  managerApprovalAbove: 10_000_000, // escalate before processing
  suspiciousStructuring: 1_000_000,  // several amounts under this = one big
  cardDeclineRetryCap: 2,       // retries on one card after this = refuse
  floatVarianceAlert: 500,      // UGX difference worth investigating
  floatVarianceStop: 2_000,     // UGX difference = do not close the day
};

export const DEFAULT_RATES = {
  /* Commission, in percent, unless a field says otherwise. */
  airtel: {
    merchantPay: 0.6, cashIn: 0.9, cashOut: 1.0,
    airtime: 1.0, sendMoney: 0.6, bankTransfer: 0.5,
  },
  mtn: {
    merchantPay: 0.6, cashIn: 0.9, cashOut: 1.0,
    airtime: 1.0, sendMoney: 0.6, bankTransfer: 0.5,
  },
  visa: {
    // Interchange: what your acquirer passes through. Net take is
    // interchange minus your scheme/acquirer fees — set your own fee below.
    cardPayment: 1.4,
    refundFeePct: 0,
    acqFeePct: 0.9,      // cost charged by the acquirer on a settled sale
    fixedPerSale: 50,    // UGX per settled sale, typical acquirer ticket
  },
  floors: {
    /* Minimum earn per transaction, UGX. */
    airtelCashIn: 0, airtelCashOut: 0, airtelMerchantPay: 0, mtnCashIn: 0,
    mtnCashOut: 0, mtnMerchantPay: 0, visa: 0,
  },
};

export const DEFAULT_PROFILE = {
  businessName: 'My Mobile Money Shop',
  merchantName: '',
  airtelCode: '',
  mtnNumber: '',
  visaMid: '',
  agentTier: 'Tier 2',
  city: 'Kampala',
};

export const DEFAULT_UI = {
  theme: 'dark',
  prompterSpeed: 55,      // px per second while auto-scrolling the "say" text
  prompterFontScale: 1,   // 0.8 – 1.6
  ttsEnabled: true,
  ttsRate: 0.95,
  ttsVoiceURI: '',
  cardNetwork: 'visa',    // which card scheme's logo to show on card flows
  // The shipped rates/limits are PLACEHOLDERS. The merchant must tick this
  // after checking them against their own provider contracts. While false, the
  // app keeps showing a banner — the numbers themselves are never silently
  // changed, because doing so would be worse than a visible warning.
  ratesConfirmed: false,
  ratesConfirmedAt: '',
  keepAwake: true,
  requireChecks: true,    // block "next" until required checkboxes are ticked
  soundOnAdvance: true,
};

export const TX_TYPES = {
  // key            label                 network   rate key
  airtelMerchantPay: { label: 'Airtel Merchant Pay', network: 'airtel', rate: 'merchantPay' },
  airtelCashIn:      { label: 'Airtel Cash In',      network: 'airtel', rate: 'cashIn' },
  airtelCashOut:     { label: 'Airtel Cash Out',     network: 'airtel', rate: 'cashOut' },
  airtelAirtime:     { label: 'Airtel Airtime',      network: 'airtel', rate: 'airtime' },
  airtelSendMoney:   { label: 'Airtel Send Money',   network: 'airtel', rate: 'sendMoney' },
  airtelBank:        { label: 'Airtel Bank / Wallet', network: 'airtel', rate: 'bankTransfer' },
  mtnMerchantPay:    { label: 'MTN Merchant Pay',    network: 'mtn',    rate: 'merchantPay' },
  mtnCashIn:         { label: 'MTN Cash In',         network: 'mtn',    rate: 'cashIn' },
  mtnCashOut:        { label: 'MTN Cash Out',        network: 'mtn',    rate: 'cashOut' },
  mtnAirtime:        { label: 'MTN Airtime',         network: 'mtn',    rate: 'airtime' },
  mtnSendMoney:      { label: 'MTN Send Money',      network: 'mtn',    rate: 'sendMoney' },
  mtnBank:           { label: 'MTN Bank / Wallet',   network: 'mtn',    rate: 'bankTransfer' },
  visaPayment:       { label: 'VISA Card Payment',   network: 'visa',   rate: 'cardPayment' },
  visaRefund:        { label: 'VISA Refund',         network: 'visa',   rate: 'refundFeePct' },
  visaPreauth:       { label: 'VISA Pre-auth',       network: 'visa',   rate: 'cardPayment' },
  // Advisory flows: loggable for your records and for dispute evidence,
  // but they earn nothing, so `rate` is null.
  visaDecline:       { label: 'VISA Declined / failed', network: 'visa', rate: null },
  visaDispute:       { label: 'VISA Chargeback / dispute', network: 'visa', rate: null },
  visaFraudStop:     { label: 'VISA Fraud stop (no sale)', network: 'visa', rate: null },
  other:             { label: 'Other',               network: 'other',  rate: null },
};

export const FLOW_TYPE_FOR = {
  'airtel-merchant-pay': 'airtelMerchantPay',
  'airtel-cash-in': 'airtelCashIn',
  'airtel-cash-out': 'airtelCashOut',
  'airtel-airtime': 'airtelAirtime',
  'airtel-send-money': 'airtelSendMoney',
  'airtel-bank': 'airtelBank',
  'mtn-merchant-pay': 'mtnMerchantPay',
  'mtn-cash-in': 'mtnCashIn',
  'mtn-cash-out': 'mtnCashOut',
  'mtn-airtime': 'mtnAirtime',
  'mtn-send-money': 'mtnSendMoney',
  'mtn-bank': 'mtnBank',
  'visa-payment': 'visaPayment',
  'visa-refund': 'visaRefund',
  'visa-preauth': 'visaPreauth',
  'visa-declines': 'visaDecline',
  'visa-chargeback': 'visaDispute',
  'visa-fraud-check': 'visaFraudStop',
  'ops-open': 'other',
  'ops-close': 'other',
};

/** Cash effect on your till when a transaction is logged. */
export const CASH_DIRECTION = {
  airtelCashIn: 0,        // cash in to you, wallet debited — float moves with it
  airtelCashOut: 1,       // cash leaves you
  airtelMerchantPay: 0,   // pure wallet-to-wallet into your merchant account
  airtelAirtime: 0,
  airtelSendMoney: 0,
  airtelBank: 0,
  mtnCashIn: 0,
  mtnCashOut: 1,
  mtnMerchantPay: 0,
  mtnAirtime: 0,
  mtnSendMoney: 0,
  mtnBank: 0,
  visaPayment: 0,
  visaRefund: 0,
  visaPreauth: 0,
  visaDecline: 0,
  visaDispute: 0,
  visaFraudStop: 0,
  other: 0,
};

/** Load a settings bundle, filling gaps from the defaults. */
export function mergeSettings(loaded = {}) {
  return {
    limits: { ...DEFAULT_LIMITS, ...(loaded.limits || {}) },
    rates: {
      ...DEFAULT_RATES,
      ...(loaded.rates || {}),
      airtel: { ...DEFAULT_RATES.airtel, ...(loaded.rates?.airtel || {}) },
      mtn: { ...DEFAULT_RATES.mtn, ...(loaded.rates?.mtn || {}) },
      visa: { ...DEFAULT_RATES.visa, ...(loaded.rates?.visa || {}) },
      floors: { ...DEFAULT_RATES.floors, ...(loaded.rates?.floors || {}) },
    },
    profile: { ...DEFAULT_PROFILE, ...(loaded.profile || {}) },
    ui: { ...DEFAULT_UI, ...(loaded.ui || {}) },
  };
}

export const SETTINGS_KEY = 'settings';
