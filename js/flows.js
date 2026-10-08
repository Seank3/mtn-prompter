// ---------------------------------------------------------------------------
// flows.js — the prompted transaction scripts.
//
// Written for UGANDA (UGX). Airtel Money runs on *100#, MTN MoMo on *165#.
// Menu *positions* move between app/USSD versions between providers, so every
// menu path here is given by LABEL as well as number — teach the label to the
// merchant, and the script survives a carrier update.
//
// Step shape:
//   t     short step title
//   say   spoken to the customer (read aloud by TTS, auto-scrolling in focus mode)
//   do    what the merchant does on their own phone / with the cash
//   check checklist items; {req:true} blocks the Next button
//   cust  big text to hand the customer on screen (their side of the script)
//   flag  red flag — shown as a blocking stop-screen, must be acknowledged
// ---------------------------------------------------------------------------

// Brand colours live in brands.js — that is the single source of truth, so a
// network's UI accent always matches its logo. Previously these were separate
// palette entries that had drifted away from the real brand colours.
import { BRANDS } from './brands.js';

export const NETWORKS = {
  airtel: { id: 'airtel', name: 'Airtel Money',  short: 'Airtel', ussd: '*100#', tint: BRANDS.airtel.tint },
  mtn:    { id: 'mtn',    name: 'MTN MoMo',      short: 'MTN',    ussd: '*165#', tint: BRANDS.mtn.tint },
  visa:   { id: 'visa',   name: 'VISA Card',     short: 'VISA',   ussd: 'Terminal', tint: BRANDS.visa.tint },
  ops:    { id: 'ops',    name: 'Store Operations', short: 'Ops',  ussd: '—',     tint: BRANDS.ops.tint },
};

const req = (t) => ({ t, req: true });
const opt = (t) => ({ t, req: false });

export const FLOWS = [

/* ======================================================================== *
 *  AIRTEL MONEY
 * ======================================================================== */
{
  id: 'airtel-merchant-pay',
  network: 'airtel',
  title: 'Merchant Pay — the customer pays you',
  short: 'Merchant Pay',
  blurb: 'Customer pays your shop directly from their Airtel wallet. Your float does not move — this is the highest-value, lowest-risk flow you run.',
  ussd: '*100#',
  est: '90 sec',
  risk: 'low',
  cash: 'none',
  steps: [
    {
      t: 'Open the transaction correctly',
      say: 'Welcome. Is this a payment to the shop, or are you taking out cash?',
      do: [
        'Confirm this is a payment TO you before you touch anything.',
        'Deal only from your registered merchant number — never a personal number.',
      ],
      check: [req('Customer confirmed: "I am paying the shop"')],
    },
    {
      t: 'Take the paying number',
      say: 'What is the number you are paying from? I will read it back to you to make sure it is right.',
      do: [
        'Ask the customer to READ OUT their own number. Never take it from their ID card yourself.',
        'Read it back digit by digit: zero, seven, seven, zero, one, two, three, four, five, six.',
        'Only the account holder\'s own phone may be used. If it is a third party\'s number, use Send Money instead.',
      ],
      check: [req('Number read back and confirmed aloud by the customer')],
    },
    {
      t: 'Confirm funds are there',
      say: 'Please check you have enough balance for the full amount, plus any charges. Shall we start?',
      do: [
        'If the customer says the amount is "for somebody else", stop and switch to the Send Money flow.',
        'Check the basket value matches the amount the customer intends to pay.',
      ],
      check: [opt('Customer confirmed their balance covers the amount')],
    },
    {
      t: 'Walk them through the USSD',
      cust: '*185#\nSend Money → Merchant Pay',
      say: 'On your phone, press the star key, then one eight five, then the pound key. You will see Send Money — choose Merchant Pay.',
      do: [
        'The customer holds their own phone. Never dial on their behalf.',
        'If they hand you the phone, they enter the PIN and you shield the screen with your hand.',
      ],
      check: [req('Customer has reached the Merchant Pay screen on their own phone')],
    },
    {
      t: 'Give the merchant code and amount',
      cust: 'Merchant code: [YOUR CODE]\nAmount: [amount]',
      say: 'Now enter my merchant code, then the amount, then your PIN.',
      do: [
        'Say your merchant code and the amount out loud before they type either one.',
        'Write the amount on your own screen. It must match the number on the till.',
      ],
      check: [
        req('Merchant code stated aloud'),
        req('Amount stated aloud and matches the till'),
      ],
    },
    {
      t: 'Make them read the screen back',
      say: 'Please read back what you see: the merchant name and the amount.',
      do: [
        'Wait for the customer to read BOTH the name and the amount before anything moves.',
        'Any mismatch — wrong name, wrong amount — the customer presses Cancel. Never correct it for them.',
      ],
      flag: 'If a "payment" is being approved through a link, a QR code from a stranger, or an app that is not Airtel Money, it is phishing. Stop and do not proceed.',
      check: [req('Customer read back the correct merchant name and amount')],
    },
    {
      t: 'Confirm the credit landed',
      say: 'Thank you, the payment has come through.',
      do: [
        'On your own phone: Agent services → Merchant Pay / Mini statement.',
        'Verify: merchant name is YOUR registered name, amount correct, balance increased.',
        'If nothing arrived, check the mini statement before retrying — confirmation is sometimes delayed. Never re-send on assumption.',
      ],
      check: [req('Credit confirmed in your own balance/statement')],
    },
    {
      t: 'Close cleanly',
      say: 'Here is your receipt. Thank you for shopping with us.',
      do: [
        'Hand over the receipt or the SMS confirmation.',
        'Log the transaction before you serve the next customer.',
        'Release the goods now — the money is in, the receipt is out.',
      ],
      check: [req('Transaction logged')],
    },
  ],
},

{
  id: 'airtel-cash-in',
  network: 'airtel',
  title: 'Cash In — customer deposits cash into their wallet',
  short: 'Cash In',
  blurb: 'Customer hands you cash, you debit your merchant float and credit their wallet. Cash and wallet must always move together, or your float is wrong by end of day.',
  ussd: '*100#',
  est: '2 min',
  risk: 'medium',
  cash: 'in',
  steps: [
    {
      t: 'Take the cash and the number',
      say: 'How much would you like to deposit, and which number should it go to?',
      do: [
        'Count the cash out loud, and count it again in front of the customer. Discrepancies are the biggest source of arguments.',
        'Note the amount on your pad before touching the phone.',
      ],
      check: [
        req('Cash counted twice and the figure agreed with the customer'),
        req('Destination number read back digit by digit'),
      ],
    },
    {
      t: 'Confirm who you are dealing with',
      say: 'Can you tell me your full name, so I can match it to the number?',
      do: [
        'Compare the name the customer gives you with the account-holder name that appears on your screen.',
        'A name that does not match is a STOP. Do not process it "because they know the PIN".',
      ],
      flag: 'Third-party deposits, a customer transacting on someone else\'s phone, or a mismatch between the face and the account name — refuse politely and move on. This is the single most common fraud pattern against Ugandan agents.',
      check: [req('Customer full name matches the account name shown on screen')],
    },
    {
      t: 'Run the agent cash-in',
      say: 'Please wait while I process this for you.',
      do: [
        '*100# → Agent services → Cash In (labelled "Customer pays you" or "Deposit to MoMo" on some versions).',
        'Enter the number, then the amount, then confirm. Check the name preview once more.',
      ],
      cust: 'Cash In\nNumber: [number]\nAmount: [amount]',
      check: [req('Agent cash-in submitted and approved on your device')],
    },
    {
      t: 'Take the ID threshold seriously',
      say: 'Because of the amount, may I take a photo of your ID for our records?',
      do: [
        'Above the ID threshold in Settings, record the customer name, ID number and the transaction reference.',
        'Below the threshold, a name match is enough.',
      ],
      check: [req('ID recorded (or below threshold and noted as not required)')],
    },
    {
      t: 'Confirm before the customer leaves',
      say: 'Please check your phone — the confirmation SMS should arrive in a moment.',
      do: [
        'Never hand over a receipt before your own screen shows success.',
        'Ask the customer to confirm the balance changed. Then log it.',
      ],
      check: [req('Customer confirmed the credit on their phone'), req('Transaction logged')],
    },
  ],
},

{
  id: 'airtel-cash-out',
  network: 'airtel',
  title: 'Cash Out — customer withdraws cash',
  short: 'Cash Out',
  blurb: 'The most fraud-exposed flow you run. The money leaves your hand and their wallet is credited — order of operations is everything.',
  ussd: '*100#',
  est: '2 min',
  risk: 'high',
  cash: 'out',
  steps: [
    {
      t: 'Identify the customer',
      say: 'Which number should I withdraw from, and what is your full name?',
      do: [
        'Ask for the number and the full name together, then verify the name against what appears on your screen.',
        'Refuse if the name does not match. This rule has no exceptions, including for "regulars".',
      ],
      check: [
        req('Number captured'),
        req('Account name matches the customer in front of you'),
      ],
    },
    {
      t: 'Confirm the amount and the purpose',
      say: 'How much would you like to withdraw?',
      do: [
        'Check the amount against your available float. If it exceeds your float, you do not have the cash — say so now.',
        'Check the amount against the daily limit in Settings.',
      ],
      flag: 'A customer asking for a large withdrawal "to pay someone else" is the classic account-takeover pattern. Verify by calling the customer on the number that is withdrawing — not on a number the person in front of you gives you.',
      check: [req('Amount confirmed and within your float and limits')],
    },
    {
      t: 'The customer runs their own side',
      say: 'I will credit your wallet first, then hand you the cash. Please watch your screen.',
      do: [
        'On your phone: Agent services → Cash Out → number → amount → confirm.',
        'The customer enters the PIN on their own device. You never see it, you never ask for it.',
      ],
      cust: 'Cash Out\nNumber: [number]\nAmount: [amount]',
      check: [req('Wallet credit confirmed on your device with success status')],
    },
    {
      t: 'Pay out in the same order, every time',
      do: [
        'Count the cash into the tray in front of the customer BEFORE you count out what they take.',
        'Count out the exact amount, count it back, hand it over, and take the receipt or a signature.',
        'The customer signs, or confirms the note, before they leave the counter.',
      ],
      flag: 'Never hand over cash against a promise ("I will top up tomorrow"). Never run a tab, no matter who asks. A signed receipt is your only protection in a dispute.',
      check: [req('Cash counted out and receipted in front of the customer'), req('Transaction logged')],
    },
  ],
},

{
  id: 'airtel-airtime',
  network: 'airtel',
  title: 'Buy Airtime',
  short: 'Airtime',
  blurb: 'Small, fast, high volume. The discipline is counting bundles against the till and clearing the float before the next queue.',
  ussd: '*100#',
  est: '60 sec',
  risk: 'low',
  cash: 'in',
  steps: [
    {
      t: 'Take the details',
      say: 'Which number, and how much airtime?',
      do: [
        'Read the number back. Check the amount against physical bundles in the till if you sell them as scratch cards.',
      ],
      check: [req('Number and amount confirmed')],
    },
    {
      t: 'Process',
      do: [
        '*100# → Buy Airtime → number → amount → confirm.',
        'For physical airtime, hand the card over and take the counterfoil.',
      ],
      check: [req('Airtime delivered / card handed over')],
    },
    {
      t: 'Close the loop',
      do: [
        'Log it. Airtime is the easiest place to run a short till — reconcile the bundle count at the end of every hour, not just at close of day.',
      ],
      check: [req('Transaction logged')],
    },
  ],
},

{
  id: 'airtel-send-money',
  network: 'airtel',
  title: 'Send Money — wallet to wallet on a customer\'s behalf',
  short: 'Send Money',
  blurb: 'You are a relay, not the owner. Your job is to make the customer\'s intent unambiguous and leave a clean trail.',
  ussd: '*100#',
  est: '90 sec',
  risk: 'high',
  cash: 'none',
  steps: [
    {
      t: 'Understand why',
      say: 'Who are you sending to, and what is it for?',
      do: [
        'If the customer is standing there, prefer the Send Money flow on THEIR phone over doing it from your merchant device.',
        'If you must use your device, treat yourself as a relay: nothing is ever received into your number.',
      ],
      check: [req('Purpose stated by the customer')],
    },
    {
      t: 'Capture both numbers, carefully',
      say: 'Please read the sending number and the receiving number out loud.',
      do: [
        'Read back BOTH numbers digit by digit, from the start.',
        'A wrong digit redirected to a stranger is unrecoverable once the confirmation SMS goes.',
      ],
      check: [req('Both numbers read back and confirmed')],
    },
    {
      t: 'Process and confirm',
      do: [
        '*100# → Agent services → Send Money (or Money Transfer) → number → amount → confirm.',
        'Wait for success, then check your mini statement if nothing is visible.',
      ],
      flag: 'Any request to "test the system", "send one shilling to my other number first", or to receive money into your merchant number and forward it, is not a customer request. Refuse and report it.',
      check: [req('Transfer confirmed'), req('Transaction logged')],
    },
  ],
},

{
  id: 'airtel-bank',
  network: 'airtel',
  title: 'Bank to Wallet / Wallet to Bank',
  short: 'Bank transfer',
  blurb: 'Slower, higher value, higher scrutiny. The account name must match, always.',
  ussd: '*100#',
  est: '4 min',
  risk: 'high',
  cash: 'none',
  steps: [
    {
      t: 'Verify the beneficiary',
      say: 'Which bank account are we sending to, and whose name is on it?',
      do: [
        'Read the account number back in full. Ask for the account-holder name and write it down.',
        'The name on the Airtel/MTN form MUST match the bank account name. If it does not, stop.',
      ],
      check: [req('Account number read back'), req('Account holder name captured and matching')],
    },
    {
      t: 'Stay on the line',
      do: [
        'Bank transfers can take minutes. Keep the customer informed rather than leaving them guessing.',
        'Never promise a completion time you cannot control. Say "the bank confirms, usually within a few minutes".',
      ],
      check: [opt('Customer told the transfer may take a few minutes')],
    },
    {
      t: 'Confirm and record',
      do: [
        '*100# → Agent services → Bank transfer → withdraw/deposit → follow prompts.',
        'Record the reference number and give it to the customer in writing.',
      ],
      flag: 'A customer who wants to pay "a school" or "a company" but will not give you the beneficiary account name is hiding the destination. Refuse.',
      check: [req('Reference number recorded and given to the customer'), req('Transaction logged')],
    },
  ],
},

/* ======================================================================== *
 *  MTN MOMO
 * ======================================================================== */
{
  id: 'mtn-merchant-pay',
  network: 'mtn',
  title: 'Merchant Pay — the customer pays you',
  short: 'Merchant Pay',
  blurb: 'The bread-and-butter flow. Customer\'s MoMo wallet pays your merchant number or your merchant code.',
  ussd: '*165#',
  est: '90 sec',
  risk: 'low',
  cash: 'none',
  steps: [
    {
      t: 'Open the transaction',
      say: 'Welcome. Is this a payment for goods, or a cash withdrawal?',
      do: ['Confirm the flow before touching the phone.', 'Stay on your registered MTN MoMo merchant number.'],
      check: [req('Confirmed this is a payment to the shop')],
    },
    {
      t: 'Take the paying number',
      say: 'What number are you paying from? I will read it back to you.',
      do: [
        'Ask the customer to read their own number aloud.',
        'Read it back digit by digit and let them confirm.',
        'Third-party numbers go to the Send Money flow, never Merchant Pay.',
      ],
      check: [req('Number read back and confirmed')],
    },
    {
      t: 'Walk them through it',
      cust: '*165#\nMobile Money → Send Money → Merchant Pay',
      say: 'Press star, one six five, pound. Choose Mobile Money, then Send Money, then Merchant Pay.',
      do: [
        'The customer holds their own phone and enters their own PIN.',
        'Some MTN versions offer "Pay Number" straight from the home menu — if the customer finds it first, let them, and confirm the same details.',
      ],
      check: [req('Customer is on the Merchant Pay / Pay Number screen')],
    },
    {
      t: 'Merchant number and amount',
      cust: 'Merchant number: [YOUR NUMBER]\nAmount: [amount]',
      say: 'Enter my merchant number, then the amount, then your PIN.',
      do: [
        'State both out loud before they are typed.',
        'Confirm the amount on your own screen matches the till.',
      ],
      check: [req('Merchant number stated aloud'), req('Amount stated aloud and matches the till')],
    },
    {
      t: 'Read-back discipline',
      say: 'Please read back the merchant name and the amount on your screen.',
      do: [
        'Do not release goods until the customer has read back BOTH correctly.',
        'Mismatch means Cancel, at the customer\'s hand, not yours.',
      ],
      flag: 'Any "confirm this payment on this link", a QR code handed over by someone you do not know, or an app that is not MTN MoMo — phishing. Stop the transaction and report it to your supervisor.',
      check: [req('Customer read back the correct name and amount')],
    },
    {
      t: 'Confirm the credit',
      say: 'Thank you, your payment has come through.',
      do: [
        'Agent services → Mini statement, or your MoMo business app, to confirm the credit.',
        'Verify merchant name = your registered name and the amount.',
        'Delayed confirmation is common — check the statement before ever retrying.',
      ],
      check: [req('Credit confirmed in your statement')],
    },
    {
      t: 'Close and log',
      say: 'Here is your receipt. Thank you.',
      do: ['Hand over the receipt.', 'Log it before the next customer.'],
      check: [req('Transaction logged')],
    },
  ],
},

{
  id: 'mtn-cash-in',
  network: 'mtn',
  title: 'Cash In — customer deposits cash into their wallet',
  short: 'Cash In',
  blurb: 'Cash in your hand, wallet credit on their phone. Both, or neither.',
  ussd: '*165#',
  est: '2 min',
  risk: 'medium',
  cash: 'in',
  steps: [
    {
      t: 'Count and capture',
      say: 'How much are you depositing, and to which number?',
      do: [
        'Count the cash twice, out loud, in front of the customer.',
        'Read the destination number back digit by digit.',
      ],
      check: [req('Cash counted twice and agreed'), req('Number read back')],
    },
    {
      t: 'Name check',
      say: 'What is your full name, so I can match it to the account?',
      do: [
        'Compare with the account name on your screen. Mismatch = stop.',
        'The person holding the cash should be the person named on the account.',
      ],
      flag: 'Someone else bringing in cash for a number they do not own — "my son sent me" — is a classic laundering route. Refuse, or take it only under your provider\'s documented third-party policy.',
      check: [req('Name matches the account shown on screen')],
    },
    {
      t: 'Process',
      do: ['*165# → MoMo Agent → Cash In / Deposit to MoMo → number → amount → confirm.'],
      cust: 'Cash In\nNumber: [number]\nAmount: [amount]',
      check: [req('Approved on your device')],
    },
    {
      t: 'ID and confirmation',
      do: [
        'Above the ID threshold, record name, ID number and reference.',
        'Customer confirms the balance changed on their own phone before they leave.',
      ],
      check: [req('Customer confirmed credit on their phone'), req('Transaction logged')],
    },
  ],
},

{
  id: 'mtn-cash-out',
  network: 'mtn',
  title: 'Cash Out — customer withdraws cash',
  short: 'Cash Out',
  blurb: 'Credit first, cash second. Every time, without exception.',
  ussd: '*165#',
  est: '2 min',
  risk: 'high',
  cash: 'out',
  steps: [
    {
      t: 'Identify',
      say: 'Which number, and what is your full name?',
      do: ['Capture the number and name together.', 'Name must match the account on your screen. No exceptions for regulars.'],
      check: [req('Number captured'), req('Account name matches the customer')],
    },
    {
      t: 'Check the money and the limits',
      do: [
        'Confirm the amount is within your float and your daily limit.',
        'If it is above the threshold, call the customer back on the withdrawing number before you pay out.',
      ],
      flag: 'A "stranger" calling you mid-transaction to confirm a large withdrawal is either a family member or a fraudster. Only trust the call, never the stranger standing at your counter.',
      check: [req('Amount within float and limits')],
    },
    {
      t: 'Credit, then pay',
      say: 'I will credit your wallet first, then give you the cash. Please watch your screen.',
      do: [
        '*165# → MoMo Agent → Cash Out / Withdraw from MoMo → number → amount → confirm.',
        'Confirm success on your screen before a single note leaves the till.',
        'Customer enters the PIN themselves. You never ask for it.',
      ],
      cust: 'Cash Out\nNumber: [number]\nAmount: [amount]',
      check: [req('Success confirmed on your device')],
    },
    {
      t: 'Pay out and receipt',
      do: [
        'Count out in front of the customer. Receipt or signature before they leave.',
        'Never extend credit, never take an IOU, never pay out against a promise to top up.',
      ],
      check: [req('Cash counted out and receipted'), req('Transaction logged')],
    },
  ],
},

{
  id: 'mtn-airtime',
  network: 'mtn',
  title: 'Buy Airtime',
  short: 'Airtime',
  blurb: 'High volume, low value, easy to skim. Reconcile bundles hourly.',
  ussd: '*165#',
  est: '60 sec',
  risk: 'low',
  cash: 'in',
  steps: [
    { t: 'Take the details', say: 'Which number and how much?', do: ['Read the number back.', 'Match against physical bundles if you sell cards.'], check: [req('Number and amount confirmed')] },
    { t: 'Process', do: ['*165# → Airtime → number → amount → confirm.', 'Hand over the card and counterfoil if physical.'], check: [req('Airtime delivered / card handed over')] },
    { t: 'Close the loop', do: ['Log it. Reconcile the bundle float every hour.'], check: [req('Transaction logged')] },
  ],
},

{
  id: 'mtn-send-money',
  network: 'mtn',
  title: 'Send Money — wallet to wallet on a customer\'s behalf',
  short: 'Send Money',
  blurb: 'You are a relay. The customer\'s intent must be unambiguous and written down.',
  ussd: '*165#',
  est: '90 sec',
  risk: 'high',
  cash: 'none',
  steps: [
    { t: 'Understand the purpose', say: 'Who are you sending to, and what is it for?', do: ['Prefer the customer running Send Money on their own phone.', 'If you must use your device, you are a relay only — never a holder of the funds.'], check: [req('Purpose stated and recorded')] },
    { t: 'Both numbers, read twice', say: 'Please read the sending number and the receiving number.', do: ['Read back BOTH in full, digit by digit.', 'One wrong digit is money gone.'], check: [req('Both numbers read back and confirmed')] },
    { t: 'Process', do: ['*165# → Send Money → number → amount → confirm.', 'Wait for success; check the mini statement if nothing shows.'], flag: '"Send one shilling to test", "receive it here and I will forward it", or any request to bounce money through your merchant number — refuse and report.', check: [req('Transfer confirmed'), req('Transaction logged')] },
  ],
},

{
  id: 'mtn-bank',
  network: 'mtn',
  title: 'Bank to Wallet / Wallet to Bank',
  short: 'Bank transfer',
  blurb: 'High value, slow, and the most document-heavy flow you run.',
  ussd: '*165#',
  est: '4 min',
  risk: 'high',
  cash: 'none',
  steps: [
    { t: 'Verify the beneficiary', say: 'Which bank account, and whose name is on it?', do: ['Read the account number back in full.', 'The beneficiary name MUST match the MoMo form. No match, no send.'], check: [req('Account number read back'), req('Beneficiary name matches')] },
    { t: 'Manage expectations', do: ['Bank rails are slow. Say "a few minutes", never "it is done".', 'Keep the reference number. It is the only thing that can trace a failed transfer.'], check: [opt('Customer warned about processing time')] },
    { t: 'Send and record', do: ['*165# → Bank transfer → follow prompts.', 'Record the reference and hand it to the customer in writing.'], flag: 'Reluctance to give a beneficiary account name means the destination is being hidden. Refuse.', check: [req('Reference recorded and given to the customer'), req('Transaction logged')] },
  ],
},

/* ======================================================================== *
 *  VISA CARD ACCEPTANCE
 * ======================================================================== */
{
  id: 'visa-payment',
  network: 'visa',
  title: 'Card payment — taking a VISA card payment',
  short: 'Card payment',
  blurb: 'Card-not-present risk, counterfeit risk and chargeback risk all land on you. Approved means approved — not "the terminal looked happy".',
  ussd: 'Terminal',
  est: '90 sec',
  risk: 'medium',
  cash: 'none',
  steps: [
    {
      t: 'Look at the card before you touch the terminal',
      say: 'May I have the card, please? I will just check the name and expiry.',
      do: [
        'Check the card number on the plastic matches the number the terminal reads (chip or tap).',
        'Check the name, the expiry date, and that the card looks normal — not bent, not scratched at the magstripe, no bulky or oddly shaped overlay.',
        'A card that has been cut and re-laminated to hide a stolen number is a counterfeit. It still reads. It still gets charged back to you.',
      ],
      check: [req('Physical card inspected: number, name, expiry, condition')],
    },
    {
      t: 'Enter the amount from your own till',
      do: [
        'Key the amount from the receipt or the till — NEVER from the card, and never from a number the customer says out loud.',
        'Confirm the amount on the terminal display before the customer taps.',
      ],
      flag: 'Any instruction to key in a different amount — "put 500,000 but show 50,000", "just add an extra 100,000" — is card fraud. Refuse the transaction outright.',
      check: [req('Amount keyed from the till and confirmed on screen')],
    },
    {
      t: 'Customer authorises',
      do: [
        'Customer taps, inserts + PIN, or dips. Shield the screen and ask them to enter their own PIN.',
        'Never ask for, repeat back, or write down a PIN. Ever.',
      ],
      cust: 'Please tap or insert your card and enter your PIN.\nYou can enter the PIN yourself — I will turn away.',
      check: [req('Customer authorised the transaction themselves')],
    },
    {
      t: 'Read the result, do not assume it',
      do: [
        'APPROVED (00/01): goods or services released. Keep the customer\'s receipt.',
        'DECLINED (05, 51, 54, 57, 58, 91, etc.): do NOT retry the same card repeatedly. Offer another card or cash.',
        'If the terminal times out or errors, void the transaction on the terminal — never just tell the customer it went through.',
      ],
      flag: 'More than two declines on one card is a counterfeit or stolen-card signal. Stop, and call your acquirer before trying again.',
      check: [req('Result read on the terminal: APPROVED or DECLINED — recorded accurately')],
    },
    {
      t: 'Protect the data',
      do: [
        'Never photograph, copy or write the full card number or CVV. Mask anything you record: 5371 **** **** 1234.',
        'Never store card details in your own notes app, spreadsheet or this app.',
        'Shred or destroy any carbon copy or slip that has a full number.',
      ],
      check: [req('No card data written down or stored anywhere')],
    },
  ],
},

{
  id: 'visa-declines',
  network: 'visa',
  title: 'Declined or failed transaction',
  short: 'Declines',
  blurb: 'What to do in the sixty seconds after a decline — the moment most agents lose money.',
  ussd: 'Terminal',
  est: '60 sec',
  risk: 'medium',
  cash: 'none',
  steps: [
    {
      t: 'Read the decline reason',
      do: [
        'Insufficient funds (51) — offer another card or cash, do not negotiate.',
        'Expired card (54) / invalid card (14) — the card is not usable, end it there.',
        'Do not honour (05) / not permitted (57/58) — the issuer declined. Do not retry in a loop.',
        'Issuer unavailable (91) — try once after a short wait, then offer another way to pay.',
      ],
      check: [req('Decline reason read and understood')],
    },
    {
      t: 'Stop the retry loop',
      do: [
        'Maximum two attempts on the same card. After that, refuse politely — repeated attempts on one card are a fraud indicator and can void your merchant agreement.',
        'Never run the sale on a different terminal or another merchant to "make it work".',
      ],
      check: [req('No more than two attempts made on this card')],
    },
    {
      t: 'Clean up the terminal',
      do: [
        'Void the declined transaction on the terminal so the batch reconciles.',
        'If a card is retained by the terminal, follow your acquirer\'s retention procedure and get a reference number.',
      ],
      flag: 'A customer who becomes angry or offers to "try another card" while the first is still in the terminal is manipulating the terminal. Void everything and stand down.',
      check: [req('Terminal batch left clean')],
    },
  ],
},

{
  id: 'visa-refund',
  network: 'visa',
  title: 'Refund or cancellation',
  short: 'Refunds',
  blurb: 'Refunds go back to the card, to the same card, with the original reference. Cash refunds are how merchants get charged back later.',
  ussd: 'Terminal',
  est: '3 min',
  risk: 'medium',
  cash: 'none',
  steps: [
    { t: 'Find the original sale', do: ['Pull the original transaction by reference or by card mask and date.', 'A refund with no matching original sale will be rejected by the issuer and may be charged back to you.'], check: [req('Original sale located and its reference recorded')] },
    { t: 'Refund to the original card only', do: ['Always refund to the SAME card that paid. Never to a different card, never to a wallet, never in cash.', 'Partial refunds are fine — record the exact amount and why.'], flag: 'The customer asking for the money on a different card, or in cash, is the standard pattern before a disputed transaction. Refuse and escalate to your manager.', check: [req('Refund routed to the original card'), req('Refund reference recorded')] },
    { t: 'Tell the customer what happens next', say: 'The refund goes back to your card. It usually shows within three working days, depending on your bank.', do: ['Set the expectation in writing on the receipt. Do not promise a timing you do not control.'], check: [req('Customer given a refund reference and a written expectation')] },
  ],
},

{
  id: 'visa-preauth',
  network: 'visa',
  title: 'Pre-authorisation — hotels, car hire, deposits',
  short: 'Pre-auth',
  blurb: 'A hold, not a payment. Getting the hold wrong leaves the customer double-charged and you carrying the dispute.',
  ussd: 'Terminal',
  est: '3 min',
  risk: 'medium',
  cash: 'none',
  steps: [
    { t: 'Know the difference out loud', say: 'I am placing a hold for the amount of the final bill, not charging you now. You only pay what you actually use.', do: ['Say it clearly, and write "PRE-AUTHORISATION" on the receipt.', 'A customer who does not understand a hold will treat it as fraud later.'], check: [req('Customer told, in words and on the receipt, that this is a hold not a charge')] },
    { t: 'Set the hold', do: ['Key the full expected amount, with a small buffer agreed with the customer.', 'Record the authorisation code and the hold expiry time.'], check: [req('Authorisation code and expiry time recorded')] },
    { t: 'Close it out properly', do: ['On completion, run the sale for the ACTUAL amount.', 'If the actual amount is lower, the acquirer releases the difference — usually within 3–5 working days. Tell the customer that in writing.', 'If the hold is never completed, it expires and is released automatically. Make sure that is genuinely true before you promise it.'], check: [req('Final sale run for the actual amount, or hold expiry explained to the customer')] },
  ],
},

{
  id: 'visa-chargeback',
  network: 'visa',
  title: 'Chargeback / dispute response',
  short: 'Chargebacks',
  blurb: 'You get a short window to respond. Silence loses the case automatically.',
  ussd: '—',
  est: '30 min',
  risk: 'high',
  cash: 'none',
  steps: [
    { t: 'Read the dispute reason — it decides everything', do: ['Fraud (10.4/10.1): the cardholder says they did not authorise it. Your evidence must show WHO was served.', 'Goods/services not provided (13.1): you need proof of delivery.', 'Processing error (13.2): usually recoverable with your receipt and delivery proof.', 'Duplicate processing (12.6.1): an obvious double-key — answer it, do not ignore it.'], check: [req('Dispute reason and deadline noted')] },
    { t: 'Assemble the evidence pack', do: ['Original signed receipt with the masked card number.', 'Proof of delivery: signed delivery note, GPS/ODD timestamp, till timestamp.', 'The transaction reference, the terminal batch, and the acquirer reference.', 'Any prior warning you gave the cardholder (surcharge, no-refund terms) — signed and dated.'], check: [req('Evidence pack assembled'), req('Submitted before the deadline')] },
    { t: 'Escalate, do not improvise', do: ['Cardholder disputes go to your acquirer or scheme — never answer the cardholder directly with a technical explanation.', 'Keep copies of everything. Disputes recur on the same cards and the same customers.'], check: [req('Case escalated to the acquirer / manager with copies filed')] },
  ],
},

{
  id: 'visa-fraud-check',
  network: 'visa',
  title: 'Suspected card fraud — stop the transaction',
  short: 'Fraud stop',
  blurb: 'The checklist to run the moment something feels wrong. Disagree with your gut, not with the customer.',
  ussd: '—',
  est: '3 min',
  risk: 'high',
  cash: 'none',
  steps: [
    {
      t: 'The pressure signals',
      do: [
        '"I\'ll pay by card but there is a problem with my bank" — then an offer to pay a smaller amount, or to split it.',
        'The cardholder is not the person who will take the goods, and is very relaxed about it.',
        'Repeated declines on card after card, then a sudden "success" on an unfamiliar one.',
        'Buying expensive goods with no interest in the price, the warranty, or the specification.',
        'A card read that does not match the name the customer gives, with the customer unfazed.',
      ],
      check: [req('I have looked for the pressure signals and I am comfortable proceeding')],
    },
    {
      t: 'The safe options',
      do: [
        'Void the transaction. A declined sale costs you nothing; a fraud chargeback costs you the goods AND the fee.',
        'Offer cash, transfer, or "come back with the card and ID".',
        'Call your acquirer\'s fraud line while the customer is in front of you, and speak normally — they can hear consent.',
      ],
      flag: 'Never feel embarrassed to refuse. A merchant who is confident about refusing is the whole reason a scheme merchant programme works.',
      check: [req('Decision made and communicated to the customer')],
    },
    {
      t: 'Record it, then move on',
      do: [
        'Log it as a fraud stop with the terminal reference and the time. These records are your evidence if the sale is disputed later.',
        'Note what you observed, in facts only — not accusations. "Card read did not match the name given" beats "customer was suspicious".',
        'Tell your supervisor the same day. Patterns repeat: the same card, the same face, twice a week.',
      ],
      check: [req('Incident logged'), req('Supervisor informed the same day')],
    },
  ],
},

/* ======================================================================== *
 *  OPERATIONS
 * ======================================================================== */
{
  id: 'ops-open',
  network: 'ops',
  title: 'Opening float and readiness check',
  short: 'Opening float',
  blurb: 'Two minutes at the start of the day that decide whether your till closes at zero.',
  ussd: '—',
  est: '5 min',
  risk: 'low',
  cash: 'none',
  steps: [
    { t: 'Count the opening float', do: ['Count every note and coin. Record the exact figure in the Float tab.', 'Do not start the day on an estimate — "close enough" never survives an audit.'], check: [req('Opening float counted and recorded')] },
    { t: 'Check your systems', do: ['Your phone is charged above 50% and on power.', 'Mobile data or WiFi works, and your MoMo app opens.', 'Your merchant number and PIN are known and unchanged.', 'Airtel Money and MTN both reachable — test with a small self-transfer if unsure.'], check: [req('Both networks reachable'), req('Phone charged and connected')] },
    { t: 'Check your records', do: ['Yesterday closed with a variance under your alert threshold, or you have explained it.', 'No unlogged transactions carried over.'], check: [req('Yesterday closed and no carry-over queries')] },
    { t: 'Confirm your identity practice', do: ['Know your ID threshold from Settings before the first customer arrives.', 'Know which name is on your registered merchant account — it is what customers will read back.'], check: [req('Knows the ID threshold and the registered business name')] },
  ],
},

{
  id: 'ops-close',
  network: 'ops',
  title: 'End-of-day close and reconciliation',
  short: 'Day close',
  blurb: 'Count, reconcile, explain, sign. Skipping the explanation is what turns a small variance into a fraud investigation.',
  ussd: '—',
  est: '20 min',
  risk: 'low',
  cash: 'none',
  steps: [
    { t: 'Stop trading first', do: ['Finish the queue, then stop. No "one last one".'], check: [req('Trading stopped')] },
    { t: 'Count the till', do: ['Count the cash twice — by hand and by machine if you have one.', 'Enter the counted figure in the Float tab. Do not enter what you hope it should be.'], check: [req('Till counted and the counted figure entered')] },
    { t: 'Reconcile against the wallets', do: ['*100# → Agent services → Mini statement / commission. *165# → Agent services → Mini statement.', 'Check every transaction type total against your log.', 'Any difference between your float movements and your wallet movements is a variance — find it tonight, not in three weeks.'], check: [req('Wallet statements checked on both networks')] },
    { t: 'Investigate the variance', do: ['Count the small stuff first: unreturned change, a bundle counted twice, a mis-keyed amount.', 'Check for unlogged transactions and logged-but-not-completed ones.', 'If the variance is over your stop threshold, do NOT close the day. Escalate to your supervisor before you leave.'], flag: 'A variance you cannot explain is a report, not a rounding error. Write down what you checked before you write down what you think it is.', check: [req('Variance explained in writing, or escalated')] },
    { t: 'Export the day', do: ['Export the Z-report from the Report tab and send it to your supervisor.', 'Secure the till and the phone before you leave.'], check: [req('Z-report exported'), req('Till and phone secured')] },
  ],
},
];

/* -------------------- lookups -------------------- */

export const getFlow = (id) => FLOWS.find((f) => f.id === id) || null;

export const flowsFor = (networkId) => FLOWS.filter((f) => f.network === networkId);

export const flowNetwork = (id) => getFlow(id)?.network ?? 'ops';

/** Replace [placeholders] with live values from the merchant profile. */
export function fillPlaceholders(text, profile = {}) {
  if (!text) return '';
  return String(text)
    .replace(/\[YOUR CODE\]/gi, profile.airtelCode || '[YOUR AIRTEL CODE]')
    .replace(/\[YOUR NUMBER\]/gi, profile.mtnNumber || '[YOUR MTN NUMBER]')
    .replace(/\[amount\]/gi, '[AMOUNT]')
    .replace(/\[number\]/gi, '[NUMBER]');
}

export const ALL_PLACEHOLDERS = ['[YOUR CODE]', '[YOUR NUMBER]', '[AMOUNT]', '[NUMBER]'];
