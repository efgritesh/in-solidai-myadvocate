const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');
const pdfParse = require('pdf-parse');
const { GoogleAuth } = require('google-auth-library');
const crypto = require('crypto');
const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', timeoutSeconds: 540, memory: '1GiB' });

const db = admin.firestore();
const bucket = admin.storage().bucket();
const storageClient = new Storage();
const visionClient = new vision.ImageAnnotatorClient();
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const DEFAULT_VERTEX_LOCATION = 'global';
const DEFAULT_VERTEX_MODEL = 'gemini-2.5-flash';
const SUFFICIENT_TEXT_LENGTH = 120;
const ADVOCATE_DRAFT_FIELDS = ['name', 'phone', 'officeAddress', 'enrollmentNumber', 'email'];
const CLIENT_DRAFT_FIELDS = ['name', 'relationLabel', 'relationName', 'age', 'dateOfBirth', 'gender', 'address', 'aadhaarName', 'aadhaarNumber', 'preferredLanguage'];
const TEST_ADVOCATE_PASSWORD = 'solidai';
const PLAN_TIERS = {
  CORE: 'core',
  TRIAL: 'trial',
  AI_PLUS: 'ai_plus',
};
const PLAN_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
};
const TRIAL_STATUS = {
  UNUSED: 'unused',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CONSUMED: 'consumed',
};
const CREDIT_RULES = {
  inputTokensPerCredit: 1000,
  outputTokensPerCredit: 1000,
  inputCreditRate: 1,
  outputCreditRate: 8,
  ocrCreditPerUnit: 5,
};
const BILLING_DEFAULTS = {
  planTier: PLAN_TIERS.CORE,
  planStatus: PLAN_STATUS.INACTIVE,
  trialStatus: TRIAL_STATUS.UNUSED,
  trialCreditsRemaining: 0,
  trialStartedAt: null,
  trialExpiresAt: null,
  includedCreditsMonthly: 0,
  includedCreditsRemaining: 0,
  walletCreditsRemaining: 0,
  currentCycleStart: null,
  currentCycleEnd: null,
  autoRenew: false,
  subscriptionPlan: 'core',
  premiumStatus: 'inactive',
  premiumActive: false,
  premiumSource: '',
  premiumBillingAmountInr: 0,
};
const AI_TRIAL_CREDITS = 300;
const AI_TRIAL_VALIDITY_DAYS = 14;
const AI_PLUS_MONTHLY_PRICE_INR = 299;
const AI_PLUS_INCLUDED_CREDITS = 1500;
const TOPUP_PACKS = {
  starter_500: { id: 'starter_500', amountInr: 99, credits: 500 },
  growth_1500: { id: 'growth_1500', amountInr: 249, credits: 1500 },
  pro_3500: { id: 'pro_3500', amountInr: 499, credits: 3500 },
};

function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
}

function getVertexLocation() {
  return process.env.VERTEX_AI_LOCATION || DEFAULT_VERTEX_LOCATION;
}

function getVertexModel() {
  return process.env.VERTEX_AI_MODEL || DEFAULT_VERTEX_MODEL;
}

function hasFieldValue(value) {
  return String(value || '').trim().length > 0;
}

function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeBillingProfile(profile = {}) {
  return {
    ...BILLING_DEFAULTS,
    ...profile,
  };
}

function calculateCreditCharge({ inputTokens = 0, outputTokens = 0, ocrUnits = 0 }) {
  const inputCredits = Math.ceil(Math.max(0, Number(inputTokens) || 0) / CREDIT_RULES.inputTokensPerCredit) * CREDIT_RULES.inputCreditRate;
  const outputCredits = Math.ceil(Math.max(0, Number(outputTokens) || 0) / CREDIT_RULES.outputTokensPerCredit) * CREDIT_RULES.outputCreditRate;
  const ocrCredits = Math.ceil(Math.max(0, Number(ocrUnits) || 0)) * CREDIT_RULES.ocrCreditPerUnit;
  return {
    inputCredits,
    outputCredits,
    ocrCredits,
    totalCredits: inputCredits + outputCredits + ocrCredits,
  };
}

function getStoredCreditBalances(profile = {}) {
  const normalized = normalizeBillingProfile(profile);
  return {
    trialCreditsRemaining: Math.max(0, Number(normalized.trialCreditsRemaining) || 0),
    includedCreditsRemaining: Math.max(0, Number(normalized.includedCreditsRemaining) || 0),
    walletCreditsRemaining: Math.max(0, Number(normalized.walletCreditsRemaining) || 0),
  };
}

function hasEntitlementWindow(profile = {}) {
  const normalized = normalizeBillingProfile(profile);
  const now = new Date();
  const trialExpiresAt = timestampToDate(normalized.trialExpiresAt);
  const currentCycleEnd = timestampToDate(normalized.currentCycleEnd);
  const trialActive = normalized.trialStatus === TRIAL_STATUS.ACTIVE && trialExpiresAt && trialExpiresAt > now;
  const subscriptionActive =
    normalized.planTier === PLAN_TIERS.AI_PLUS &&
    [PLAN_STATUS.ACTIVE, PLAN_STATUS.CANCELLED].includes(normalized.planStatus) &&
    currentCycleEnd &&
    currentCycleEnd > now;

  return {
    trialActive,
    subscriptionActive,
    hasEntitlement: trialActive || subscriptionActive,
  };
}

function hasUsableAiBalance(profile = {}) {
  const balances = getStoredCreditBalances(profile);
  return balances.trialCreditsRemaining + balances.includedCreditsRemaining + balances.walletCreditsRemaining > 0;
}

function buildBillingSummary(profile = {}) {
  const normalized = normalizeBillingProfile(profile);
  const balances = getStoredCreditBalances(normalized);
  const entitlement = hasEntitlementWindow(normalized);
  return {
    planTier: normalized.planTier,
    planStatus: normalized.planStatus,
    trialStatus: normalized.trialStatus,
    trialCreditsRemaining: balances.trialCreditsRemaining,
    includedCreditsMonthly: Math.max(0, Number(normalized.includedCreditsMonthly) || 0),
    includedCreditsRemaining: balances.includedCreditsRemaining,
    walletCreditsRemaining: balances.walletCreditsRemaining,
    currentCycleStart: normalized.currentCycleStart || null,
    currentCycleEnd: normalized.currentCycleEnd || null,
    trialExpiresAt: normalized.trialExpiresAt || null,
    autoRenew: Boolean(normalized.autoRenew),
    hasEntitlement: entitlement.hasEntitlement,
    canUseAiNow: entitlement.hasEntitlement && hasUsableAiBalance(normalized),
    subscriptionPlan: normalized.subscriptionPlan || 'core',
    premiumActive: Boolean(normalized.premiumActive),
  };
}

async function recordBillingEvent(advocateId, event = {}) {
  await db.collection('billing_events').add({
    advocate_id: advocateId,
    ...event,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function recordUsageEvent(advocateId, event = {}) {
  await db.collection('usage_events').add({
    advocate_id: advocateId,
    ...event,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function refreshBillingState(userRef, profile = {}) {
  const normalized = normalizeBillingProfile(profile);
  const now = new Date();
  const patch = {};

  const trialExpiresAt = timestampToDate(normalized.trialExpiresAt);
  if (normalized.trialStatus === TRIAL_STATUS.ACTIVE && trialExpiresAt && trialExpiresAt <= now) {
    patch.trialStatus = normalized.trialCreditsRemaining > 0 ? TRIAL_STATUS.EXPIRED : TRIAL_STATUS.CONSUMED;
    patch.trialCreditsRemaining = 0;
  }

  const currentCycleEnd = timestampToDate(normalized.currentCycleEnd);
  if (
    normalized.planTier === PLAN_TIERS.AI_PLUS &&
    currentCycleEnd &&
    currentCycleEnd <= now
  ) {
    if (normalized.autoRenew) {
      const nextStart = now;
      const nextEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      patch.planStatus = PLAN_STATUS.ACTIVE;
      patch.currentCycleStart = admin.firestore.Timestamp.fromDate(nextStart);
      patch.currentCycleEnd = admin.firestore.Timestamp.fromDate(nextEnd);
      patch.includedCreditsMonthly = normalized.includedCreditsMonthly || AI_PLUS_INCLUDED_CREDITS;
      patch.includedCreditsRemaining = normalized.includedCreditsMonthly || AI_PLUS_INCLUDED_CREDITS;
      patch.premiumActive = true;
      patch.premiumStatus = 'active';
      await recordBillingEvent(userRef.id, {
        type: 'subscription_renewed',
        amountInr: AI_PLUS_MONTHLY_PRICE_INR,
        credits: patch.includedCreditsRemaining,
      });
    } else {
      patch.planTier = PLAN_TIERS.CORE;
      patch.planStatus = PLAN_STATUS.INACTIVE;
      patch.subscriptionPlan = 'core';
      patch.premiumActive = false;
      patch.premiumStatus = 'inactive';
      patch.includedCreditsRemaining = 0;
      patch.includedCreditsMonthly = 0;
      patch.currentCycleStart = null;
      patch.currentCycleEnd = null;
    }
  }

  if (!Object.keys(patch).length) {
    return normalized;
  }

  const firestorePatch = { ...patch };
  if (patch.currentCycleStart === null) firestorePatch.currentCycleStart = null;
  if (patch.currentCycleEnd === null) firestorePatch.currentCycleEnd = null;
  await userRef.set(firestorePatch, { merge: true });

  return normalizeBillingProfile({
    ...normalized,
    ...patch,
  });
}

async function consumeCreditsForUsage({ userRef, profile, usage, event }) {
  const normalized = normalizeBillingProfile(profile);
  const charge = calculateCreditCharge(usage);

  if (charge.totalCredits <= 0) {
    return {
      charge,
      sourceBreakdown: { trial: 0, included: 0, wallet: 0 },
      remaining: getStoredCreditBalances(normalized),
    };
  }

  const entitlement = hasEntitlementWindow(normalized);
  if (!entitlement.hasEntitlement) {
    throw new HttpsError('failed-precondition', 'Start an AI plan or trial before using OCR or drafting.');
  }

  const balances = getStoredCreditBalances(normalized);
  if (balances.trialCreditsRemaining + balances.includedCreditsRemaining + balances.walletCreditsRemaining < charge.totalCredits) {
    throw new HttpsError('failed-precondition', 'You do not have enough AI credits left. Please top up or renew your plan.');
  }

  const sourceBreakdown = { trial: 0, included: 0, wallet: 0 };
  let remaining = charge.totalCredits;

  const nextBalances = { ...balances };
  const applyBucket = (key) => {
    if (remaining <= 0) return;
    const consumed = Math.min(nextBalances[key], remaining);
    nextBalances[key] -= consumed;
    remaining -= consumed;
    if (key === 'trialCreditsRemaining') sourceBreakdown.trial += consumed;
    if (key === 'includedCreditsRemaining') sourceBreakdown.included += consumed;
    if (key === 'walletCreditsRemaining') sourceBreakdown.wallet += consumed;
  };

  applyBucket('trialCreditsRemaining');
  applyBucket('includedCreditsRemaining');
  applyBucket('walletCreditsRemaining');

  const patch = {
    trialCreditsRemaining: nextBalances.trialCreditsRemaining,
    includedCreditsRemaining: nextBalances.includedCreditsRemaining,
    walletCreditsRemaining: nextBalances.walletCreditsRemaining,
    trialStatus:
      normalized.trialStatus === TRIAL_STATUS.ACTIVE && nextBalances.trialCreditsRemaining === 0
        ? TRIAL_STATUS.CONSUMED
        : normalized.trialStatus,
    updatedAt: new Date().toISOString(),
  };

  await userRef.set(patch, { merge: true });
  await recordUsageEvent(userRef.id, {
    ...event,
    input_tokens: usage.inputTokens || 0,
    output_tokens: usage.outputTokens || 0,
    ocr_units: usage.ocrUnits || 0,
    credits_consumed: charge.totalCredits,
    credit_breakdown: sourceBreakdown,
  });

  return {
    charge,
    sourceBreakdown,
    remaining: nextBalances,
  };
}

function isAdvocateDraftReady(profile = {}) {
  return ADVOCATE_DRAFT_FIELDS.every((field) => hasFieldValue(profile[field]));
}

function isClientDraftReady(client = {}) {
  return CLIENT_DRAFT_FIELDS.every((field) => hasFieldValue(client[field]));
}

function missingFields(fields, payload = {}) {
  return fields.filter((field) => !hasFieldValue(payload[field]));
}

async function requireAdvocate(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const userRef = db.collection('users').doc(request.auth.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists || userSnap.data()?.role !== 'advocate') {
    throw new HttpsError('permission-denied', 'Only advocates can use drafting tools.');
  }

  const refreshedProfile = await refreshBillingState(userRef, userSnap.data());
  if (!buildBillingSummary(refreshedProfile).canUseAiNow) {
    throw new HttpsError('failed-precondition', 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.');
  }

  if (!isAdvocateDraftReady(refreshedProfile)) {
    throw new HttpsError('failed-precondition', 'Complete your advocate profile before starting AI drafting.');
  }

  return {
    uid: request.auth.uid,
    profile: refreshedProfile,
    userRef,
  };
}

async function requireSignedInUser(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const userRef = db.collection('users').doc(request.auth.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  const refreshedProfile = await refreshBillingState(userRef, userSnap.data());

  return {
    uid: request.auth.uid,
    profile: refreshedProfile,
    userRef,
  };
}

async function requireAdvocateRoleOnly(request) {
  const user = await requireSignedInUser(request);
  if (user.profile.role !== 'advocate') {
    throw new HttpsError('permission-denied', 'Only advocates can access this action.');
  }
  return user;
}

async function requireAdminHttp(request, response) {
  const user = await getHttpUser(request, response);
  if (!user) {
    return null;
  }

  if (user.profile.role !== 'admin') {
    response.status(403).json({ error: 'Only admins can run this action.' });
    return null;
  }

  return user;
}

async function subscribeAiPlusForUser({ uid, profile, data }) {
  if (profile.role !== 'advocate') {
    throw new HttpsError('permission-denied', 'Only advocates can activate the premium plan.');
  }

  const billingAmountInr = Number(data?.billingAmountInr || AI_PLUS_MONTHLY_PRICE_INR);
  const activatedAt = admin.firestore.Timestamp.now();
  const cycleEnd = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );
  const cycleStart = activatedAt;

  await db.collection('users').doc(uid).update({
    planTier: PLAN_TIERS.AI_PLUS,
    planStatus: PLAN_STATUS.ACTIVE,
    subscriptionPlan: 'ai_plus_monthly',
    trialStatus: profile.trialStatus || TRIAL_STATUS.UNUSED,
    includedCreditsMonthly: AI_PLUS_INCLUDED_CREDITS,
    includedCreditsRemaining: AI_PLUS_INCLUDED_CREDITS,
    autoRenew: true,
    currentCycleStart: cycleStart,
    currentCycleEnd: cycleEnd,
    premiumSource: data?.source || 'dummy_checkout',
    premiumBillingAmountInr: billingAmountInr,
    premiumActivatedAt: activatedAt,
    premiumRenewalDate: cycleEnd,
    premiumStatus: 'active',
    premiumActive: true,
    updatedAt: new Date().toISOString(),
  });

  await recordBillingEvent(uid, {
    type: 'subscription_started',
    amountInr: billingAmountInr,
    credits: AI_PLUS_INCLUDED_CREDITS,
  });

  return {
    planTier: PLAN_TIERS.AI_PLUS,
    premiumActive: true,
    subscriptionPlan: 'ai_plus_monthly',
    billingAmountInr,
    includedCreditsMonthly: AI_PLUS_INCLUDED_CREDITS,
  };
}

const ALLOWED_HTTP_ORIGINS = new Set([
  'https://in-solidai-myadvocate.web.app',
  'https://iadvocate.solidai.in',
]);

function applyCors(request, response) {
  const requestOrigin = request.headers.origin || '';
  const allowedOrigin = ALLOWED_HTTP_ORIGINS.has(requestOrigin)
    ? requestOrigin
    : 'https://in-solidai-myadvocate.web.app';

  response.set('Vary', 'Origin');
  response.set('Access-Control-Allow-Origin', allowedOrigin);
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getHttpUser(request, response) {
  applyCors(request, response);

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return null;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return null;
  }

  const header = request.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    response.status(401).json({ error: 'Missing authorization token.' });
    return null;
  }

  const decodedToken = await admin.auth().verifyIdToken(match[1]);
  const userRef = db.collection('users').doc(decodedToken.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    response.status(404).json({ error: 'User profile not found.' });
    return null;
  }

  const refreshedProfile = await refreshBillingState(userRef, userSnap.data());

  return {
    uid: decodedToken.uid,
    profile: refreshedProfile,
    userRef,
  };
}

function mapHttpsErrorStatus(error) {
  if (!(error instanceof HttpsError)) return 500;
  if (error.code === 'permission-denied') return 403;
  if (error.code === 'unauthenticated') return 401;
  if (error.code === 'not-found') return 404;
  if (error.code === 'failed-precondition') return 412;
  if (error.code === 'invalid-argument') return 400;
  return 400;
}

function formatDateOffset(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function createSeedLifecycleStep({
  id,
  title,
  status = 'pending',
  eta = '',
  scheduledDate = '',
  notes = '',
  stageType = 'general',
}) {
  return {
    id,
    title,
    status,
    eta,
    scheduled_date: scheduledDate,
    notes,
    stage_type: stageType,
  };
}

function buildSeedLifecycle(overrides = {}) {
  return [
    createSeedLifecycleStep({
      id: 'consultation',
      title: overrides.consultationTitle || 'Initial consultation',
      status: overrides.consultationStatus || 'done',
      scheduledDate: overrides.consultationDate || formatDateOffset(-10),
      notes: overrides.consultationNotes || 'Client consultation completed and briefing recorded.',
    }),
    createSeedLifecycleStep({
      id: 'drafting',
      title: overrides.draftingTitle || 'Drafting and filing prep',
      status: overrides.draftingStatus || 'in_progress',
      eta: overrides.draftingEta || formatDateOffset(3).slice(0, 7),
      notes: overrides.draftingNotes || 'Next filing set is being prepared.',
    }),
    createSeedLifecycleStep({
      id: 'hearing',
      title: overrides.hearingTitle || 'Next hearing',
      status: overrides.hearingStatus || 'pending',
      scheduledDate: overrides.hearingDate || formatDateOffset(7),
      notes: overrides.hearingNotes || 'Upcoming hearing already listed on the calendar.',
      stageType: 'hearing',
    }),
  ];
}

function getIsolationSeedBlueprints() {
  return [
    {
      email: 'advocate1@solidai.in',
      name: 'Advocate One',
      phone: '9876500001',
      enrollmentNumber: 'D/2020/1144',
      officeAddress: '12 Defence Colony, New Delhi',
      preferredLanguage: 'en',
      clients: [
        {
          name: 'R.K. Chaturvedi',
          phone: '9810011111',
          email: 'rk.chaturvedi@example.com',
          preferredLanguage: 'hi',
          relationLabel: 'S/o',
          relationName: 'M.K. Chaturvedi',
          age: '38',
          dateOfBirth: '1988-06-25',
          gender: 'Male',
          address: 'C-903 Palash Society, Pune, Maharashtra, 411057',
          aadhaarName: 'R K Chaturvedi',
          aadhaarNumber: '6496 2842 8068',
        },
        {
          name: 'Sunita Rao',
          phone: '9810022222',
          email: 'sunita.rao@example.com',
          preferredLanguage: 'en',
          relationLabel: 'W/o',
          relationName: 'Kiran Rao',
          age: '42',
          dateOfBirth: '1984-02-11',
          gender: 'Female',
          address: '7 Lodhi Estate, New Delhi',
          aadhaarName: 'Sunita Kiran Rao',
          aadhaarNumber: '7921 2211 8833',
        },
      ],
      cases: [
        {
          case_number: 'DL-BAIL-101/2026',
          client_name: 'R.K. Chaturvedi',
          client_email: 'rk.chaturvedi@example.com',
          client_phone: '9810011111',
          client_language: 'hi',
          status: 'Open',
          court: 'Sessions Court, Saket',
          place: 'New Delhi',
          police_station: 'Kalkaji',
          summary: 'Regular bail application arising from FIR on financial fraud allegations.',
          next_step: 'Settle factual chronology and bail grounds before the next date.',
          lifecycle: buildSeedLifecycle({
            draftingTitle: 'Bail application drafting',
            hearingTitle: 'Bail hearing',
            hearingDate: formatDateOffset(2),
            hearingNotes: 'Arguments on maintainability and parity.',
          }),
          payments: [
            {
              amount: 30000,
              date: formatDateOffset(-3),
              description: 'Bail drafting and appearance fee',
              stage: 'Drafting',
              status: 'Paid',
              requested_from_client: true,
            },
          ],
          documents: [
            {
              type: 'FIR copy',
              name: 'rk-fir-copy.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              uploaded_by_role: 'advocate',
            },
          ],
          comments: [
            {
              author_role: 'advocate',
              author_name: 'Advocate One',
              message: 'Collected bail instructions and marked parity grounds for drafting.',
              created_at: `${formatDateOffset(-1)}T09:30:00.000Z`,
            },
          ],
        },
        {
          case_number: 'DL-NI138-233/2026',
          client_name: 'Sunita Rao',
          client_email: 'sunita.rao@example.com',
          client_phone: '9810022222',
          client_language: 'en',
          status: 'Pending',
          court: 'Metropolitan Magistrate, Patiala House',
          place: 'New Delhi',
          police_station: 'Tilak Marg',
          summary: 'Cheque dishonour complaint with notice compliance already completed.',
          next_step: 'Prepare affidavit evidence and compile banking trail.',
          lifecycle: buildSeedLifecycle({
            consultationTitle: 'Initial complaint review',
            draftingTitle: 'Affidavit evidence drafting',
            hearingTitle: 'Summoning stage hearing',
            hearingDate: formatDateOffset(6),
            draftingStatus: 'done',
            hearingStatus: 'in_progress',
          }),
          payments: [
            {
              amount: 18000,
              date: formatDateOffset(1),
              description: 'Evidence affidavit fee request',
              stage: 'Evidence',
              status: 'Requested',
              requested_from_client: true,
            },
          ],
          documents: [
            {
              type: 'Legal notice',
              name: 'ni138-demand-notice.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              uploaded_by_role: 'advocate',
            },
          ],
          comments: [
            {
              author_role: 'advocate',
              author_name: 'Advocate One',
              message: 'Bank memo and service proof have been reviewed for summons stage.',
              created_at: `${formatDateOffset(0)}T11:00:00.000Z`,
            },
          ],
        },
      ],
    },
    {
      email: 'advocate2@solidai.in',
      name: 'Advocate Two',
      phone: '9876500002',
      enrollmentNumber: 'MH/2019/2288',
      officeAddress: '304 Nyati Plaza, Pune',
      preferredLanguage: 'en',
      clients: [
        {
          name: 'Ankita Deshmukh',
          phone: '9823011111',
          email: 'ankita.deshmukh@example.com',
          preferredLanguage: 'hi',
          relationLabel: 'D/o',
          relationName: 'Ravindra Deshmukh',
          age: '29',
          dateOfBirth: '1997-03-14',
          gender: 'Female',
          address: 'Baner Road, Pune, Maharashtra, 411045',
          aadhaarName: 'Ankita Ravindra Deshmukh',
          aadhaarNumber: '8344 5511 9002',
        },
        {
          name: 'Prakash Nair',
          phone: '9823022222',
          email: 'prakash.nair@example.com',
          preferredLanguage: 'en',
          relationLabel: 'S/o',
          relationName: 'Madhavan Nair',
          age: '47',
          dateOfBirth: '1979-09-22',
          gender: 'Male',
          address: 'Kharadi IT Park Road, Pune',
          aadhaarName: 'Prakash Madhavan Nair',
          aadhaarNumber: '9011 5522 8834',
        },
      ],
      cases: [
        {
          case_number: 'PN-FAM-044/2026',
          client_name: 'Ankita Deshmukh',
          client_email: 'ankita.deshmukh@example.com',
          client_phone: '9823011111',
          client_language: 'hi',
          status: 'Open',
          court: 'Family Court Pune',
          place: 'Pune',
          police_station: 'Chaturshringi',
          summary: 'Domestic violence and maintenance matter at interim relief stage.',
          next_step: 'Prepare updated expense chart and rejoinder notes.',
          lifecycle: buildSeedLifecycle({
            draftingTitle: 'Interim maintenance reply',
            hearingTitle: 'Interim maintenance hearing',
            hearingDate: formatDateOffset(4),
            hearingNotes: 'Expense chart and interim maintenance submissions.',
          }),
          payments: [
            {
              amount: 15000,
              date: formatDateOffset(-4),
              description: 'Reply drafting fee',
              stage: 'Reply',
              status: 'Paid',
              requested_from_client: true,
            },
          ],
          documents: [
            {
              type: 'Expense chart',
              name: 'ankita-expense-chart.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              uploaded_by_role: 'advocate',
            },
          ],
          comments: [
            {
              author_role: 'advocate',
              author_name: 'Advocate Two',
              message: 'Client has shared updated school fee details for children.',
              created_at: `${formatDateOffset(-2)}T14:15:00.000Z`,
            },
          ],
        },
        {
          case_number: 'PN-COM-188/2026',
          client_name: 'Prakash Nair',
          client_email: 'prakash.nair@example.com',
          client_phone: '9823022222',
          client_language: 'en',
          status: 'Open',
          court: 'Commercial Court Pune',
          place: 'Pune',
          police_station: 'Yerwada',
          summary: 'Vendor agreement dispute involving unpaid software implementation invoices.',
          next_step: 'Finalize legal notice and preserve project correspondence bundle.',
          lifecycle: buildSeedLifecycle({
            consultationTitle: 'Contract review',
            draftingTitle: 'Legal notice drafting',
            hearingTitle: 'Pre-filing strategy review',
            hearingDate: formatDateOffset(8),
            hearingNotes: 'Internal strategy review before formal filing.',
            hearingStatus: 'pending',
          }),
          payments: [
            {
              amount: 22000,
              date: formatDateOffset(2),
              description: 'Commercial notice fee request',
              stage: 'Notice',
              status: 'Requested',
              requested_from_client: true,
            },
          ],
          documents: [
            {
              type: 'Agreement',
              name: 'vendor-agreement.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              uploaded_by_role: 'advocate',
            },
          ],
          comments: [
            {
              author_role: 'advocate',
              author_name: 'Advocate Two',
              message: 'Contract annexures and invoice trail uploaded for notice drafting.',
              created_at: `${formatDateOffset(0)}T16:20:00.000Z`,
            },
          ],
        },
      ],
    },
  ];
}

async function ensureEmailPasswordUser({ email, name }) {
  let userRecord;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    userRecord = await admin.auth().updateUser(userRecord.uid, {
      password: TEST_ADVOCATE_PASSWORD,
      displayName: name,
      disabled: false,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    userRecord = await admin.auth().createUser({
      email,
      password: TEST_ADVOCATE_PASSWORD,
      displayName: name,
    });
  }

  return userRecord;
}

async function deleteCollectionDocs(snapshot) {
  for (const docSnap of snapshot.docs) {
    await docSnap.ref.delete();
  }
}

async function deleteClientAccessDoc(docRef) {
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) {
    const subSnap = await subcollection.get();
    await deleteCollectionDocs(subSnap);
  }
  await docRef.delete();
}

async function clearAdvocateTestData(advocateId) {
  const collectionNames = [
    'drafting_outputs',
    'drafting_sources',
    'drafting_sessions',
    'comments',
    'documents',
    'payments',
    'clients',
    'cases',
  ];

  const clientAccessSnap = await db.collection('client_access').where('advocate_id', '==', advocateId).get();
  for (const accessDoc of clientAccessSnap.docs) {
    await deleteClientAccessDoc(accessDoc.ref);
  }

  for (const collectionName of collectionNames) {
    const snapshot = await db.collection(collectionName).where('advocate_id', '==', advocateId).get();
    await deleteCollectionDocs(snapshot);
  }
}

async function seedIsolationDataForAdvocate(blueprint) {
  const userRecord = await ensureEmailPasswordUser(blueprint);
  const advocateId = userRecord.uid;
  await clearAdvocateTestData(advocateId);

  const userDoc = {
    uid: advocateId,
    email: blueprint.email,
    role: 'advocate',
    name: blueprint.name,
    phone: blueprint.phone,
    officeAddress: blueprint.officeAddress,
    address: blueprint.officeAddress,
    enrollmentNumber: blueprint.enrollmentNumber,
    preferredLanguage: blueprint.preferredLanguage || 'en',
    profileComplete: true,
    premiumActive: true,
    premiumStatus: 'active',
    subscriptionPlan: 'premium_monthly',
    premiumSource: 'test_seed',
    premiumBillingAmountInr: 200,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await db.collection('users').doc(advocateId).set(userDoc, { merge: true });

  const clientMap = new Map();
  for (const client of blueprint.clients) {
    const clientRef = await db.collection('clients').add({
      advocate_id: advocateId,
      ...client,
      aadhaarReferencePath: '',
      aadhaarOcrStatus: client.aadhaarNumber ? 'completed' : 'not_started',
      created_at: new Date().toISOString(),
    });
    clientMap.set(client.name, clientRef.id);
  }

  const createdCaseNumbers = [];
  for (const caseBlueprint of blueprint.cases) {
    const clientAccessToken = createCaseAccessToken(caseBlueprint.case_number);
    const casePayload = {
      advocate_id: advocateId,
      client_id: clientMap.get(caseBlueprint.client_name) || '',
      case_number: caseBlueprint.case_number,
      client_name: caseBlueprint.client_name,
      client_email: caseBlueprint.client_email,
      client_phone: caseBlueprint.client_phone,
      advocate_language: blueprint.preferredLanguage || 'en',
      client_language: caseBlueprint.client_language || blueprint.preferredLanguage || 'en',
      status: caseBlueprint.status,
      court: caseBlueprint.court,
      place: caseBlueprint.place,
      police_station: caseBlueprint.police_station,
      summary: caseBlueprint.summary,
      next_step: caseBlueprint.next_step,
      lifecycle: caseBlueprint.lifecycle || [],
      client_access_token: clientAccessToken,
      client_access_enabled: true,
      created_at: new Date().toISOString(),
    };

    const caseRef = await db.collection('cases').add(casePayload);
    const createdCase = { id: caseRef.id, ...casePayload };
    createdCaseNumbers.push(createdCase.case_number);

    await db.collection('client_access').doc(clientAccessToken).set(buildClientAccessSnapshot(createdCase), { merge: true });

    for (const payment of caseBlueprint.payments || []) {
      const paymentPayload = {
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        client_access_token: clientAccessToken,
        ...payment,
      };
      const paymentRef = await db.collection('payments').add(paymentPayload);
      await db.collection('client_access').doc(clientAccessToken).collection('payments').doc(paymentRef.id).set({
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        amount: payment.amount || 0,
        date: payment.date || '',
        description: payment.description || '',
        stage: payment.stage || '',
        status: payment.status || '',
        requested_from_client: !!payment.requested_from_client,
        source_role: payment.uploaded_by_role || payment.author_role || (payment.status === 'Client Submitted' ? 'client' : 'advocate'),
        synced_at: new Date().toISOString(),
      }, { merge: true });
    }

    for (const documentRecord of caseBlueprint.documents || []) {
      const documentPayload = {
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        client_access_token: clientAccessToken,
        ...documentRecord,
      };
      const documentRef = await db.collection('documents').add(documentPayload);
      await db.collection('client_access').doc(clientAccessToken).collection('documents').doc(documentRef.id).set({
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        type: documentRecord.type || '',
        url: documentRecord.url || '',
        name: documentRecord.name || '',
        uploaded_by_role: documentRecord.uploaded_by_role || 'advocate',
        synced_at: new Date().toISOString(),
      }, { merge: true });
    }

    for (const comment of caseBlueprint.comments || []) {
      const commentPayload = {
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        client_access_token: clientAccessToken,
        ...comment,
      };
      const commentRef = await db.collection('comments').add(commentPayload);
      await db.collection('client_access').doc(clientAccessToken).collection('comments').doc(commentRef.id).set({
        advocate_id: advocateId,
        case_id: createdCase.case_number,
        author_role: comment.author_role || 'advocate',
        author_name: comment.author_name || blueprint.name,
        message: comment.message || '',
        created_at: comment.created_at || new Date().toISOString(),
        synced_at: new Date().toISOString(),
      }, { merge: true });
    }
  }

  return {
    uid: advocateId,
    email: blueprint.email,
    password: TEST_ADVOCATE_PASSWORD,
    clients: blueprint.clients.map((client) => client.name),
    cases: createdCaseNumbers,
  };
}

async function getUsageSummaryForAdvocate(advocateId, profile = {}) {
  const normalized = normalizeBillingProfile(profile);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const usageSnapshot = await db
    .collection('usage_events')
    .where('advocate_id', '==', advocateId)
    .get();

  const allUsageItems = usageSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => (timestampToDate(b.created_at)?.getTime() || 0) - (timestampToDate(a.created_at)?.getTime() || 0))
    .slice(0, 25);
  const monthlyUsage = allUsageItems.filter((item) => {
    const createdAt = timestampToDate(item.created_at);
    return createdAt && createdAt >= monthStart;
  });

  return {
    ...buildBillingSummary(normalized),
    pricing: {
      aiTrialCredits: AI_TRIAL_CREDITS,
      aiTrialDays: AI_TRIAL_VALIDITY_DAYS,
      aiPlusMonthlyPriceInr: AI_PLUS_MONTHLY_PRICE_INR,
      aiPlusIncludedCredits: AI_PLUS_INCLUDED_CREDITS,
      topupPacks: Object.values(TOPUP_PACKS),
      creditRules: CREDIT_RULES,
    },
    monthUsage: summarizeUsageLedger(monthlyUsage),
    recentUsage: allUsageItems.map((item) => ({
      id: item.id,
      feature: item.feature || '',
      caseId: item.case_id || '',
      clientId: item.client_id || '',
      inputTokens: item.input_tokens || 0,
      outputTokens: item.output_tokens || 0,
      ocrUnits: item.ocr_units || 0,
      creditsConsumed: item.credits_consumed || 0,
      createdAt: formatTimestamp(item.created_at),
    })),
  };
}

async function getOwnedSession(sessionId, advocateId) {
  const sessionSnap = await db.collection('drafting_sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Drafting session not found.');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() };
  if (session.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This drafting session belongs to another advocate.');
  }

  return session;
}

async function getOwnedCase(caseId, advocateId) {
  if (!caseId) {
    return null;
  }

  const caseSnap = await db.collection('cases').doc(caseId).get();
  if (!caseSnap.exists) {
    throw new HttpsError('not-found', 'Case not found.');
  }

  const caseRecord = { id: caseSnap.id, ...caseSnap.data() };
  if (caseRecord.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This case belongs to another advocate.');
  }

  return caseRecord;
}

async function getOwnedClient(clientId, advocateId) {
  if (!clientId) {
    return null;
  }

  const clientSnap = await db.collection('clients').doc(clientId).get();
  if (!clientSnap.exists) {
    throw new HttpsError('not-found', 'Client not found.');
  }

  const clientRecord = { id: clientSnap.id, ...clientSnap.data() };
  if (clientRecord.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This client belongs to another advocate.');
  }

  return clientRecord;
}

async function resolveClientForDrafting({ clientId, caseRecord, advocateId }) {
  if (clientId) {
    return getOwnedClient(clientId, advocateId);
  }

  if (!caseRecord) {
    return null;
  }

  if (caseRecord.client_id) {
    return getOwnedClient(caseRecord.client_id, advocateId);
  }

  const clientsSnap = await db.collection('clients').where('advocate_id', '==', advocateId).get();
  const matched = clientsSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((client) =>
      client.name === caseRecord.client_name ||
      (client.email && client.email === caseRecord.client_email) ||
      (client.phone && client.phone === caseRecord.client_phone)
    );

  return matched || null;
}

async function getOwnedDocument(documentId, advocateId) {
  const docSnap = await db.collection('documents').doc(documentId).get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', 'Document not found.');
  }

  const documentRecord = { id: docSnap.id, ...docSnap.data() };
  if (documentRecord.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This document belongs to another advocate.');
  }

  return documentRecord;
}

function cleanExtractedText(text) {
  return (text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function hasSufficientText(text) {
  return cleanExtractedText(text).length >= SUFFICIENT_TEXT_LENGTH;
}

function buildAdvocateSnapshot(profile = {}) {
  return {
    name: profile.name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    officeAddress: profile.officeAddress || profile.address || '',
    enrollmentNumber: profile.enrollmentNumber || '',
  };
}

function buildClientSnapshot(client = {}) {
  return {
    clientId: client.id || '',
    name: client.name || '',
    phone: client.phone || '',
    email: client.email || '',
    preferredLanguage: client.preferredLanguage || 'en',
    relationLabel: client.relationLabel || '',
    relationName: client.relationName || '',
    age: client.age || '',
    dateOfBirth: client.dateOfBirth || '',
    gender: client.gender || '',
    address: client.address || '',
    aadhaarName: client.aadhaarName || '',
    aadhaarNumber: client.aadhaarNumber || '',
  };
}

function buildCaseSnapshot(caseRecord = {}) {
  return {
    caseId: caseRecord.id || '',
    caseNumber: caseRecord.case_number || '',
    clientName: caseRecord.client_name || '',
    court: caseRecord.court || '',
    place: caseRecord.place || '',
    policeStation: caseRecord.police_station || '',
    status: caseRecord.status || '',
    summary: caseRecord.summary || '',
    nextStep: caseRecord.next_step || '',
  };
}

function extractDraftPlaceholders(text) {
  const matches = [...String(text || '').matchAll(/\[([^\]]+)\]/g)];
  return matches
    .map((match) => match[1].trim())
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, 10);
}

function buildFactValidationFields({ session, draftText }) {
  const advocate = session.advocate_profile_snapshot || {};
  const client = session.client_profile_snapshot || {};
  const caseRecord = session.case_snapshot || {};
  const validatedFacts = session.validated_facts || {};

  const baseFields = [
    { key: 'client_name', label: 'Client name', value: validatedFacts.client_name || client.name || '', required: true, target: 'client', sourceField: 'name' },
    { key: 'client_relation_label', label: 'Relation label', value: validatedFacts.client_relation_label || client.relationLabel || '', required: true, target: 'client', sourceField: 'relationLabel' },
    { key: 'client_relation_name', label: 'Relation name', value: validatedFacts.client_relation_name || client.relationName || '', required: true, target: 'client', sourceField: 'relationName' },
    { key: 'client_age', label: 'Age', value: validatedFacts.client_age || client.age || '', required: true, target: 'client', sourceField: 'age' },
    { key: 'client_date_of_birth', label: 'Date of birth', value: validatedFacts.client_date_of_birth || client.dateOfBirth || '', required: true, target: 'client', sourceField: 'dateOfBirth' },
    { key: 'client_gender', label: 'Gender', value: validatedFacts.client_gender || client.gender || '', required: true, target: 'client', sourceField: 'gender' },
    { key: 'client_address', label: 'Client address', value: validatedFacts.client_address || client.address || '', required: true, target: 'client', sourceField: 'address' },
    { key: 'place', label: 'Place', value: validatedFacts.place || caseRecord.place || '', required: false, target: 'case', sourceField: 'place' },
    { key: 'court', label: 'Court', value: validatedFacts.court || caseRecord.court || '', required: false, target: 'case', sourceField: 'court' },
    { key: 'police_station', label: 'Police station', value: validatedFacts.police_station || caseRecord.policeStation || '', required: false, target: 'case', sourceField: 'police_station' },
    { key: 'advocate_name', label: 'Advocate name', value: validatedFacts.advocate_name || advocate.name || '', required: true, target: 'advocate', sourceField: 'name' },
    { key: 'advocate_enrollment_number', label: 'Enrollment number', value: validatedFacts.advocate_enrollment_number || advocate.enrollmentNumber || '', required: true, target: 'advocate', sourceField: 'enrollmentNumber' },
    { key: 'advocate_phone', label: 'Advocate phone', value: validatedFacts.advocate_phone || advocate.phone || '', required: true, target: 'advocate', sourceField: 'phone' },
    { key: 'advocate_email', label: 'Advocate email', value: validatedFacts.advocate_email || advocate.email || '', required: true, target: 'advocate', sourceField: 'email' },
    { key: 'advocate_office_address', label: 'Advocate office address', value: validatedFacts.advocate_office_address || advocate.officeAddress || '', required: true, target: 'advocate', sourceField: 'officeAddress' },
  ].map((field) => ({
    ...field,
    status: field.required && !hasFieldValue(field.value) ? 'missing' : 'ready',
  }));

  const placeholderFields = extractDraftPlaceholders(draftText).map((placeholder) => ({
    key: `placeholder_${placeholder.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    label: placeholder,
    value: validatedFacts[`placeholder_${placeholder.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`] || '',
    required: true,
    status: 'missing',
    target: 'session',
    sourceField: '',
    placeholder,
  }));

  const fields = [...baseFields, ...placeholderFields];
  return {
    fields,
    requiresValidation: fields.some((field) => field.status === 'missing'),
  };
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value.toDate) {
    return value.toDate().toISOString();
  }
  return String(value);
}

function createCaseAccessToken(seed = '') {
  const normalizedSeed = String(seed || 'case').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return `${normalizedSeed}-${crypto.randomBytes(8).toString('hex')}`;
}

function buildClientAccessSnapshot(caseRecord = {}) {
  return {
    advocate_id: caseRecord.advocate_id,
    case_id: caseRecord.id || '',
    case_number: caseRecord.case_number || '',
    client_name: caseRecord.client_name || '',
    client_email: caseRecord.client_email || '',
    client_phone: caseRecord.client_phone || '',
    advocate_language: caseRecord.advocate_language || 'en',
    client_language: caseRecord.client_language || caseRecord.advocate_language || 'en',
    status: caseRecord.status || 'Open',
    enabled: caseRecord.client_access_enabled !== false,
    summary: caseRecord.summary || '',
    next_step: caseRecord.next_step || '',
    lifecycle: caseRecord.lifecycle || [],
    court: caseRecord.court || '',
    updated_at: new Date().toISOString(),
  };
}

function buildStandaloneCaseNumber(session = {}) {
  const year = new Date().getFullYear();
  const clientSlug = (session.client_name || 'client')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase()
    .slice(0, 6) || 'CLIENT';
  const suffix = Date.now().toString().slice(-4);
  return `IADV-DRAFT-${clientSlug}-${suffix}/${year}`;
}

async function ensureSessionCaseForPublish(session, advocate) {
  if (session.case_id) {
    return getOwnedCase(session.case_id, advocate.uid);
  }

  const caseNumber = session.case_number || buildStandaloneCaseNumber(session);
  const clientSnapshot = session.client_profile_snapshot || {};
  const advocateLanguage = advocate.profile.preferredLanguage || 'en';
  const clientLanguage = clientSnapshot.preferredLanguage || advocateLanguage;
  const clientAccessToken = createCaseAccessToken(caseNumber);
  const summary = session.instructions?.trim() || 'AI drafting workflow created from a standalone drafting session.';
  const nextStep = 'Review drafted document and continue matter setup.';

  const casePayload = {
    advocate_id: advocate.uid,
    client_id: session.client_id || '',
    case_number: caseNumber,
    client_name: session.client_name || clientSnapshot.name || '',
    client_email: clientSnapshot.email || '',
    client_phone: clientSnapshot.phone || '',
    summary,
    next_step: nextStep,
    court: session.case_snapshot?.court || '',
    place: session.case_snapshot?.place || '',
    police_station: session.case_snapshot?.policeStation || '',
    status: 'Open',
    client_access_enabled: true,
    client_access_token: clientAccessToken,
    advocate_language: advocateLanguage,
    client_language: clientLanguage,
    lifecycle: session.case_snapshot?.lifecycle || [],
  };

  const caseRef = await db.collection('cases').add(casePayload);
  const createdCase = { id: caseRef.id, ...casePayload };

  await db.collection('client_access').doc(clientAccessToken).set(buildClientAccessSnapshot(createdCase), { merge: true });
  await db.collection('drafting_sessions').doc(session.id).update({
    case_id: createdCase.id,
    case_number: createdCase.case_number,
    case_snapshot: buildCaseSnapshot(createdCase),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return createdCase;
}

function getGsUriForPath(storagePath) {
  return `gs://${bucket.name}/${storagePath}`;
}

async function bufferFromSource(source) {
  if (source.storage_path) {
    const [buffer] = await bucket.file(source.storage_path).download();
    return buffer;
  }

  if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Source download failed with status ${response.status}.`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('No supported source location was found.');
}

async function ensurePdfGcsUri(source, buffer) {
  if (source.storage_path && source.storage_path.endsWith('.pdf')) {
    return {
      uri: getGsUriForPath(source.storage_path),
      tempPath: null,
    };
  }

  const tempPath = `drafting-system/${source.advocate_id}/sessions/${source.session_id}/ocr-inputs/${source.id}.pdf`;
  await bucket.file(tempPath).save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });
  return {
    uri: getGsUriForPath(tempPath),
    tempPath,
  };
}

async function cleanupBucketPrefix(prefix) {
  const [files] = await storageClient.bucket(bucket.name).getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete().catch(() => null)));
}

async function runPdfVisionOcr(source, buffer) {
  const { uri, tempPath } = await ensurePdfGcsUri(source, buffer);
  const outputPrefix = `drafting-system/${source.advocate_id}/sessions/${source.session_id}/ocr-output/${source.id}/`;
  const outputUri = `gs://${bucket.name}/${outputPrefix}`;

  try {
    const [operation] = await visionClient.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            gcsSource: { uri },
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          outputConfig: {
            gcsDestination: { uri: outputUri },
            batchSize: 1,
          },
        },
      ],
    });

    await operation.promise();
    const [files] = await storageClient.bucket(bucket.name).getFiles({ prefix: outputPrefix });
    let fullText = '';

    for (const file of files) {
      const [contents] = await file.download();
      const payload = JSON.parse(contents.toString('utf8'));
      const responses = payload.responses || [];
      for (const response of responses) {
        fullText += `${response.fullTextAnnotation?.text || ''}\n`;
      }
    }

    return cleanExtractedText(fullText);
  } finally {
    if (tempPath) {
      await bucket.file(tempPath).delete().catch(() => null);
    }
    await cleanupBucketPrefix(outputPrefix).catch(() => null);
  }
}

async function runImageVisionOcr(buffer) {
  const [result] = await visionClient.documentTextDetection({
    image: { content: buffer.toString('base64') },
  });
  return cleanExtractedText(result.fullTextAnnotation?.text || '');
}

async function extractSourceText(source) {
  if (source.source_type === 'typed_text') {
    const manualText = cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '');
    if (!manualText) {
      throw new Error('Manual text is empty.');
    }

    return {
      rawText: manualText,
      reviewedText: manualText,
      extractionMethod: 'manual_text',
      usedOcr: false,
    };
  }

  const mimeType = source.mime_type || '';
  const buffer = await bufferFromSource(source);

  if (mimeType.startsWith('text/')) {
    const text = cleanExtractedText(buffer.toString('utf8'));
    return {
      rawText: text,
      reviewedText: text,
      extractionMethod: 'native_text',
      usedOcr: false,
      ocrUnits: 0,
    };
  }

  if (mimeType === 'application/pdf' || source.name?.toLowerCase().endsWith('.pdf')) {
    let nativeText = '';
    let pageCount = 1;
    try {
      const parsed = await pdfParse(buffer);
      nativeText = cleanExtractedText(parsed.text || '');
      pageCount = parsed.numpages || pageCount;
    } catch (error) {
      nativeText = '';
    }

    if (hasSufficientText(nativeText)) {
      return {
        rawText: nativeText,
        reviewedText: nativeText,
        extractionMethod: 'native_text',
        usedOcr: false,
        ocrUnits: 0,
      };
    }

    const ocrText = await runPdfVisionOcr(source, buffer);
    if (!ocrText) {
      throw new Error('OCR could not extract any readable text from the PDF.');
    }

    return {
      rawText: ocrText,
      reviewedText: ocrText,
      extractionMethod: 'vision_ocr',
      usedOcr: true,
      ocrUnits: pageCount,
    };
  }

  if (mimeType.startsWith('image/')) {
    const ocrText = await runImageVisionOcr(buffer);
    if (!ocrText) {
      throw new Error('OCR could not extract any readable text from the image.');
    }

    return {
      rawText: ocrText,
      reviewedText: ocrText,
      extractionMethod: 'vision_ocr',
      usedOcr: true,
      ocrUnits: 1,
    };
  }

  throw new Error('This file type is not supported for drafting yet.');
}

function parseAadhaarDetailsFromText(text) {
  const cleanedText = cleanExtractedText(text || '');
  const rawLines = cleanedText.split('\n').map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.map((line) => line.replace(/\s{2,}/g, ' '));
  const lowerText = cleanedText.toLowerCase();

  const aadhaarNumberMatch = cleanedText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  const dobMatch = cleanedText.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/);
  const yobMatch =
    cleanedText.match(/(?:year of birth|yob)[:\s-]*(\d{4})/i) ||
    cleanedText.match(/(?:जन्म वर्ष)[:\s-]*(\d{4})/i);
  const genderMatch = cleanedText.match(/\b(Male|Female|Other|पुरुष|महिला|अन्य)\b/i);

  const nameCandidates = lines.filter((line) => {
    const lowerLine = line.toLowerCase();
    if (line.length < 3 || /\d{4}/.test(line)) return false;
    if (
      lowerLine.includes('government of india') ||
      lowerLine.includes('unique identification authority') ||
      lowerLine.includes('आधार') ||
      lowerLine.includes('aadhaar') ||
      lowerLine.includes('dob') ||
      lowerLine.includes('year of birth') ||
      lowerLine.includes('male') ||
      lowerLine.includes('female') ||
      lowerLine.includes('address') ||
      lowerLine.includes('vid') ||
      lowerLine.includes('downloaded')
    ) {
      return false;
    }
    return /^[a-zA-Z.\-'\s]+$|^[\u0900-\u097F.\-'\s]+$/u.test(line);
  });

  const addressIndex = lines.findIndex((line) => /^address\b[:\-]?/i.test(line) || /^पता[:\-]?/i.test(line));
  const addressLines = addressIndex >= 0 ? lines.slice(addressIndex, Math.min(addressIndex + 4, lines.length)) : [];
  const normalizedAddress = addressLines
    .join(' ')
    .replace(/^address[:\s-]*/i, '')
    .replace(/^पता[:\s-]*/i, '')
    .trim();

  const dateOfBirth = dobMatch ? dobMatch[1].replace(/\//g, '-') : '';
  const age = !dateOfBirth && yobMatch ? String(Math.max(0, new Date().getFullYear() - Number(yobMatch[1]))) : '';

  const extracted = {
    name: nameCandidates[0] || '',
    aadhaarName: nameCandidates[0] || '',
    aadhaarNumber: aadhaarNumberMatch ? aadhaarNumberMatch[0].replace(/\s+/g, ' ').trim() : '',
    dateOfBirth,
    age,
    gender: genderMatch ? genderMatch[1] : '',
    address: normalizedAddress,
    rawText: cleanedText,
  };

  const warnings = [];
  if (!extracted.aadhaarName) warnings.push('Name could not be confidently read from the Aadhaar document.');
  if (!extracted.aadhaarNumber) warnings.push('Aadhaar number could not be confidently read from the Aadhaar document.');
  if (!extracted.dateOfBirth && !extracted.age && !lowerText.includes('year of birth') && !lowerText.includes('dob')) {
    warnings.push('Date of birth or year of birth could not be confidently read.');
  }
  if (!extracted.address) warnings.push('Address could not be confidently read from the Aadhaar document.');

  return {
    extracted,
    warnings,
    success: Boolean(extracted.aadhaarName || extracted.aadhaarNumber || extracted.address),
  };
}

async function extractAadhaarDetailsFromSource(source) {
  const extraction = await extractSourceText(source);
  const parsed = parseAadhaarDetailsFromText(extraction.reviewedText || extraction.rawText || '');
  let aiMapped = null;
  let aiUsage = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };

  try {
    const mapped = await mapAadhaarDetailsWithVertex(extraction.reviewedText || extraction.rawText || '');
    aiMapped = mapped;
    aiUsage = mapped.usage || aiUsage;
  } catch (error) {
    aiMapped = null;
  }

  const extracted = {
    ...parsed.extracted,
    ...(aiMapped || {}),
    rawText: parsed.extracted.rawText,
  };

  const warnings = [
    ...(parsed.warnings || []),
    ...((aiMapped?.warnings || []).filter(Boolean)),
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  return {
    extracted,
    warnings,
    success: Boolean(extracted.aadhaarName || extracted.aadhaarNumber || extracted.address),
    extractionMethod: extraction.extractionMethod,
    usedOcr: extraction.usedOcr,
    ocrUnits: extraction.ocrUnits || 0,
    aiUsage,
  };
}

function buildPrompt({ session, caseRecord, sources }) {
  const draftType = session.custom_draft_type?.trim() || session.draft_type || 'legal draft';
  const language = session.output_language === 'hi' ? 'Hindi' : 'English';
  const advocateContext = session.advocate_profile_snapshot
    ? [
        `Advocate name: ${session.advocate_profile_snapshot.name || ''}`,
        `Enrollment number: ${session.advocate_profile_snapshot.enrollmentNumber || ''}`,
        `Phone: ${session.advocate_profile_snapshot.phone || ''}`,
        `Email: ${session.advocate_profile_snapshot.email || ''}`,
        `Office address: ${session.advocate_profile_snapshot.officeAddress || ''}`,
      ].filter(Boolean).join('\n')
    : 'No advocate profile was attached.';
  const clientContext = session.client_profile_snapshot
    ? [
        `Client name: ${session.client_profile_snapshot.name || ''}`,
        `Relation: ${session.client_profile_snapshot.relationLabel || ''} ${session.client_profile_snapshot.relationName || ''}`.trim(),
        `Age: ${session.client_profile_snapshot.age || ''}`,
        `Date of birth: ${session.client_profile_snapshot.dateOfBirth || ''}`,
        `Gender: ${session.client_profile_snapshot.gender || ''}`,
        `Address: ${session.client_profile_snapshot.address || ''}`,
        `Aadhaar-aligned name: ${session.client_profile_snapshot.aadhaarName || ''}`,
        `Aadhaar number: ${session.client_profile_snapshot.aadhaarNumber || ''}`,
      ].filter(Boolean).join('\n')
    : 'No client profile was linked.';
  const caseContext = caseRecord
    ? [
        `Case number: ${caseRecord.case_number || caseRecord.caseNumber || ''}`,
        `Client name: ${caseRecord.client_name || caseRecord.clientName || ''}`,
        `Court: ${caseRecord.court || caseRecord.court || ''}`,
        `Place: ${caseRecord.place || ''}`,
        `Police station: ${caseRecord.police_station || caseRecord.policeStation || ''}`,
        `Current status: ${caseRecord.status || ''}`,
        `Matter summary: ${caseRecord.summary || ''}`,
        `Next step: ${caseRecord.next_step || caseRecord.nextStep || ''}`,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No case metadata was linked for this drafting session.';
  const validatedFacts = Object.entries(session.validated_facts || {})
    .filter(([, value]) => hasFieldValue(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const sourceText = sources
    .map((source, index) => {
      const heading = `Source ${index + 1}: ${source.name || source.label || source.source_type}`;
      return `${heading}\n${source.reviewed_text || source.raw_extracted_text || ''}`;
    })
    .join('\n\n---\n\n') || 'No uploaded source material was attached. Draft from the structured matter details and advocate instructions only.';

  return [
    `You are an AI legal drafting assistant for an Indian advocate.`,
    `Prepare a first-draft ${draftType === 'auto' ? 'legal document inferred from the advocate instructions' : draftType} in ${language}.`,
    `The draft must be professional, structured, and ready for advocate review.`,
    `Do not invent facts that are missing from the source material.`,
    `If a fact is uncertain, mark it as [To be confirmed].`,
    `Use headings and numbered paragraphs where appropriate.`,
    `Include a short "Review notes" section at the end listing factual gaps or items that need advocate validation.`,
    '',
    'Advocate profile:',
    advocateContext,
    '',
    'Client profile:',
    clientContext,
    '',
    'Case context:',
    caseContext,
    '',
    'Confirmed facts:',
    validatedFacts || 'No additional fact confirmations were provided.',
    '',
    'Advocate instructions:',
    session.instructions?.trim() || 'No extra instructions were provided.',
    '',
    'Source materials:',
    sourceText,
  ].join('\n');
}

function estimatePromptTokensFromText(text = '') {
  return Math.ceil(String(text || '').length / 4);
}

function estimateDraftGenerationUsage({ session, caseRecord, sources }) {
  const prompt = buildPrompt({ session, caseRecord, sources });
  const inputTokens = estimatePromptTokensFromText(prompt);
  const outputTokens = 2500;
  const charge = calculateCreditCharge({ inputTokens, outputTokens, ocrUnits: 0 });
  return {
    promptLength: prompt.length,
    inputTokens,
    outputTokens,
    estimatedCredits: charge.totalCredits,
    charge,
  };
}

function summarizeUsageLedger(items = []) {
  return items.reduce((summary, item) => {
    summary.inputTokens += Number(item.input_tokens) || 0;
    summary.outputTokens += Number(item.output_tokens) || 0;
    summary.ocrUnits += Number(item.ocr_units) || 0;
    summary.creditsConsumed += Number(item.credits_consumed) || 0;
    return summary;
  }, {
    inputTokens: 0,
    outputTokens: 0,
    ocrUnits: 0,
    creditsConsumed: 0,
  });
}

async function generateWithVertex(prompt) {
  const projectId = getProjectId();
  const location = getVertexLocation();
  const model = getVertexModel();
  const authClient = await googleAuth.getClient();
  const accessTokenResponse = await authClient.getAccessToken();
  const accessToken = accessTokenResponse?.token || accessTokenResponse;

  if (!accessToken) {
    throw new Error('Could not obtain a Google access token for AI generation.');
  }

  const serviceHost = location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${location}-aiplatform.googleapis.com`;
  const endpoint = `${serviceHost}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI generation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || '').join('\n').trim();

  if (!text) {
    throw new Error('Vertex AI returned an empty draft.');
  }

  return {
    text,
    model,
    location,
    usage: {
      promptTokenCount: payload.usageMetadata?.promptTokenCount || 0,
      candidatesTokenCount: payload.usageMetadata?.candidatesTokenCount || 0,
      totalTokenCount: payload.usageMetadata?.totalTokenCount || 0,
    },
  };
}

function extractJsonObject(text = '') {
  const trimmed = String(text || '').trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI response did not contain a JSON object.');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function mapAadhaarDetailsWithVertex(ocrText) {
  const prompt = [
    'Extract structured Aadhaar holder details from the OCR text below.',
    'Return only a JSON object with these keys:',
    'name, aadhaarName, aadhaarNumber, dateOfBirth, age, gender, address, warnings',
    'Rules:',
    '- Do not return any markdown.',
    '- Do not confuse government headers with the person name.',
    '- Ignore lines like Government of India, भारत सरकार, UIDAI, Unique Identification Authority of India, AADHAAR, Print Date.',
    '- Pick the actual Aadhaar holder name only.',
    '- Keep aadhaarNumber in grouped format like 1234 5678 9012 when possible.',
    '- warnings must be an array of strings.',
    '- Use empty string for unknown fields.',
    '- If date of birth is available, return it in YYYY-MM-DD when possible, otherwise keep the exact OCR date string.',
    '',
    'OCR text:',
    ocrText || '',
  ].join('\n');

  const result = await generateWithVertex(prompt);
  const parsed = extractJsonObject(result.text);
  return {
    name: String(parsed.name || '').trim(),
    aadhaarName: String(parsed.aadhaarName || parsed.name || '').trim(),
    aadhaarNumber: String(parsed.aadhaarNumber || '').trim(),
    dateOfBirth: String(parsed.dateOfBirth || '').trim(),
    age: String(parsed.age || '').trim(),
    gender: String(parsed.gender || '').trim(),
    address: String(parsed.address || '').trim(),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => String(item).trim()).filter(Boolean) : [],
    usage: result.usage,
  };
}

function buildDocxDocument(title, body, session, caseRecord) {
  const paragraphs = body.split(/\n{2,}/).map((block) =>
    new Paragraph({
      spacing: { after: 220 },
      children: [new TextRun(block.trim())],
    })
  );

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Generated by iAdvocate on ${new Date().toLocaleString('en-IN')}`,
                italics: true,
              }),
            ],
          }),
          caseRecord?.case_number
            ? new Paragraph({
                text: `Case number: ${caseRecord.case_number}`,
                spacing: { after: 180 },
              })
            : new Paragraph(''),
          ...paragraphs,
          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun({
                text: 'AI-assisted first draft. Advocate review is mandatory before use or sharing.',
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });
}

async function upsertDraftingOutput(sessionId, advocateId, payload) {
  const outputQuery = await db
    .collection('drafting_outputs')
    .where('session_id', '==', sessionId)
    .limit(1)
    .get();

  if (outputQuery.empty) {
    const ref = await db.collection('drafting_outputs').add({
      session_id: sessionId,
      advocate_id: advocateId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      ...payload,
    });
    return ref.id;
  }

  const docRef = outputQuery.docs[0].ref;
  await docRef.update({
    ...payload,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

exports.createDraftingSession = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const caseRecord = await getOwnedCase(data.caseId || '', advocate.uid);
  const clientRecord = await resolveClientForDrafting({ clientId: data.clientId || '', caseRecord, advocateId: advocate.uid });
  if (!clientRecord) {
    throw new HttpsError('failed-precondition', 'Select a client before starting AI drafting.');
  }
  if (!isClientDraftReady(clientRecord)) {
    throw new HttpsError('failed-precondition', `Complete the client profile before drafting. Missing: ${missingFields(CLIENT_DRAFT_FIELDS, clientRecord).join(', ')}`);
  }
  const now = admin.firestore.FieldValue.serverTimestamp();

  const sessionRef = await db.collection('drafting_sessions').add({
    advocate_id: advocate.uid,
    client_id: clientRecord.id,
    case_id: caseRecord?.id || '',
    case_number: caseRecord?.case_number || '',
    client_name: clientRecord.name || caseRecord?.client_name || '',
    draft_type: data.draftType || 'auto',
    custom_draft_type: data.customDraftType || '',
    output_language: data.outputLanguage || clientRecord.preferredLanguage || caseRecord?.client_language || advocate.profile.preferredLanguage || 'en',
    instructions: data.instructions || '',
    advocate_profile_snapshot: buildAdvocateSnapshot(advocate.profile),
    client_profile_snapshot: buildClientSnapshot(clientRecord),
    case_snapshot: caseRecord ? buildCaseSnapshot(caseRecord) : {},
    validated_facts: {},
    status: 'draft',
    source_count: 0,
    ocr_source_count: 0,
    created_at: now,
    updated_at: now,
  });

  return {
    sessionId: sessionRef.id,
  };
});

exports.createDraftingSessionHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can use AI drafting.' });
      return;
    }
    if (!buildBillingSummary(advocate.profile).canUseAiNow) {
      response.status(412).json({ error: 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }

    const data = request.body || {};
    const caseRecord = await getOwnedCase(data.caseId || '', advocate.uid);
    const clientRecord = await resolveClientForDrafting({ clientId: data.clientId || '', caseRecord, advocateId: advocate.uid });
    if (!clientRecord) {
      response.status(412).json({ error: 'Select a client before starting AI drafting.' });
      return;
    }
    if (!isClientDraftReady(clientRecord)) {
      response.status(412).json({ error: `Complete the client profile before drafting. Missing: ${missingFields(CLIENT_DRAFT_FIELDS, clientRecord).join(', ')}` });
      return;
    }
    const now = admin.firestore.FieldValue.serverTimestamp();

    const sessionRef = await db.collection('drafting_sessions').add({
      advocate_id: advocate.uid,
      client_id: clientRecord.id,
      case_id: caseRecord?.id || '',
      case_number: caseRecord?.case_number || '',
      client_name: clientRecord.name || caseRecord?.client_name || '',
      draft_type: data.draftType || 'auto',
      custom_draft_type: data.customDraftType || '',
      output_language: data.outputLanguage || clientRecord.preferredLanguage || caseRecord?.client_language || advocate.profile.preferredLanguage || 'en',
      instructions: data.instructions || '',
      advocate_profile_snapshot: buildAdvocateSnapshot(advocate.profile),
      client_profile_snapshot: buildClientSnapshot(clientRecord),
      case_snapshot: caseRecord ? buildCaseSnapshot(caseRecord) : {},
      validated_facts: {},
      status: 'draft',
      source_count: 0,
      ocr_source_count: 0,
      created_at: now,
      updated_at: now,
    });

    response.status(200).json({ sessionId: sessionRef.id });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to create drafting session.' });
  }
});

exports.registerDraftingSource = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);

  let sourcePayload = {
    session_id: session.id,
    advocate_id: advocate.uid,
    source_type: data.sourceType,
    label: data.label || '',
    name: data.name || '',
    mime_type: data.mimeType || '',
    url: data.url || '',
    storage_path: data.storagePath || '',
    existing_document_id: data.existingDocumentId || '',
    extraction_method: data.sourceType === 'typed_text' ? 'manual_text' : '',
    raw_extracted_text: '',
    reviewed_text: '',
    status: data.sourceType === 'typed_text' ? 'ready_for_review' : 'pending',
    used_ocr: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (data.sourceType === 'existing_document' && data.existingDocumentId) {
    const documentRecord = await getOwnedDocument(data.existingDocumentId, advocate.uid);
    sourcePayload = {
      ...sourcePayload,
      name: documentRecord.name || sourcePayload.name,
      mime_type: documentRecord.mime_type || sourcePayload.mime_type,
      url: documentRecord.url || sourcePayload.url,
      storage_path: documentRecord.storage_path || sourcePayload.storage_path,
      case_id: documentRecord.case_id || '',
    };
  }

  if (data.sourceType === 'typed_text') {
    const manualText = cleanExtractedText(data.typedText || '');
    if (!manualText) {
      throw new HttpsError('invalid-argument', 'Typed text cannot be empty.');
    }
    sourcePayload.raw_extracted_text = manualText;
    sourcePayload.reviewed_text = manualText;
  }

  const sourceRef = await db.collection('drafting_sources').add(sourcePayload);
  await db.collection('drafting_sessions').doc(session.id).update({
    source_count: admin.firestore.FieldValue.increment(1),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    sourceId: sourceRef.id,
  };
});

exports.registerDraftingSourceHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can use AI drafting.' });
      return;
    }
    if (!buildBillingSummary(advocate.profile).canUseAiNow) {
      response.status(412).json({ error: 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }

    const data = request.body || {};
    const session = await getOwnedSession(data.sessionId, advocate.uid);

    let sourcePayload = {
      session_id: session.id,
      advocate_id: advocate.uid,
      source_type: data.sourceType,
      label: data.label || '',
      name: data.name || '',
      mime_type: data.mimeType || '',
      url: data.url || '',
      storage_path: data.storagePath || '',
      existing_document_id: data.existingDocumentId || '',
      extraction_method: data.sourceType === 'typed_text' ? 'manual_text' : '',
      raw_extracted_text: '',
      reviewed_text: '',
      status: data.sourceType === 'typed_text' ? 'ready_for_review' : 'pending',
      used_ocr: false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (data.sourceType === 'existing_document' && data.existingDocumentId) {
      const documentRecord = await getOwnedDocument(data.existingDocumentId, advocate.uid);
      sourcePayload = {
        ...sourcePayload,
        name: documentRecord.name || sourcePayload.name,
        mime_type: documentRecord.mime_type || sourcePayload.mime_type,
        url: documentRecord.url || sourcePayload.url,
        storage_path: documentRecord.storage_path || sourcePayload.storage_path,
        case_id: documentRecord.case_id || '',
      };
    }

    if (data.sourceType === 'typed_text') {
      const manualText = cleanExtractedText(data.typedText || '');
      if (!manualText) {
        response.status(400).json({ error: 'Typed text cannot be empty.' });
        return;
      }
      sourcePayload.raw_extracted_text = manualText;
      sourcePayload.reviewed_text = manualText;
    }

    const sourceRef = await db.collection('drafting_sources').add(sourcePayload);
    await db.collection('drafting_sessions').doc(session.id).update({
      source_count: admin.firestore.FieldValue.increment(1),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    response.status(200).json({ sourceId: sourceRef.id });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to register drafting source.' });
  }
});

exports.extractDraftingSources = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds : [];

  let sourceQuery = db.collection('drafting_sources')
    .where('session_id', '==', session.id);

  const snapshot = await sourceQuery.get();
  const targets = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ref: docSnap.ref, ...docSnap.data() }))
    .filter((source) => (sourceIds.length ? sourceIds.includes(source.id) : source.status !== 'ready_for_review'));

  if (!targets.length) {
    throw new HttpsError('failed-precondition', 'No drafting sources are waiting for extraction.');
  }

  await db.collection('drafting_sessions').doc(session.id).update({
    status: 'extracting',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  let readyCount = 0;
  let ocrCount = 0;
  const results = [];

  for (const source of targets) {
    try {
      const extraction = await extractSourceText(source);
      await source.ref.update({
        raw_extracted_text: extraction.rawText,
        reviewed_text: extraction.reviewedText,
        extraction_method: extraction.extractionMethod,
        used_ocr: extraction.usedOcr,
        status: 'ready_for_review',
        error_message: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      readyCount += 1;
      if (extraction.usedOcr) {
        ocrCount += 1;
      }
      results.push({
        sourceId: source.id,
        status: 'ready_for_review',
        extractionMethod: extraction.extractionMethod,
      });
    } catch (error) {
      await source.ref.update({
        status: 'failed',
        error_message: error.message,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({
        sourceId: source.id,
        status: 'failed',
        errorMessage: error.message,
      });
    }
  }

  const refreshed = await db
    .collection('drafting_sources')
    .where('session_id', '==', session.id)
    .get();

  const readySources = refreshed.docs.filter((docSnap) => docSnap.data().status === 'ready_for_review').length;
  const totalOcrSources = refreshed.docs.filter((docSnap) => docSnap.data().used_ocr === true).length;

  await db.collection('drafting_sessions').doc(session.id).update({
    status: readySources > 0 ? 'ready_for_review' : 'failed',
    ocr_source_count: totalOcrSources,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    results,
    readyCount,
    ocrCount,
  };
});

exports.extractDraftingSourcesHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can use AI drafting.' });
      return;
    }
    if (!buildBillingSummary(advocate.profile).canUseAiNow) {
      response.status(412).json({ error: 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }

    const data = request.body || {};
    const session = await getOwnedSession(data.sessionId, advocate.uid);
    const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds : [];
    const snapshot = await db.collection('drafting_sources').where('session_id', '==', session.id).get();
    const targets = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ref: docSnap.ref, ...docSnap.data() }))
      .filter((source) => (sourceIds.length ? sourceIds.includes(source.id) : source.status !== 'ready_for_review'));

    if (!targets.length) {
      response.status(412).json({ error: 'No drafting sources are waiting for extraction.' });
      return;
    }

    await db.collection('drafting_sessions').doc(session.id).update({
      status: 'extracting',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    let readyCount = 0;
    let ocrCount = 0;
    let ocrUnits = 0;
    const results = [];

    for (const source of targets) {
      try {
        const extraction = await extractSourceText(source);
        await source.ref.update({
          raw_extracted_text: extraction.rawText,
          reviewed_text: extraction.reviewedText,
          extraction_method: extraction.extractionMethod,
          used_ocr: extraction.usedOcr,
          status: 'ready_for_review',
          error_message: admin.firestore.FieldValue.delete(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        readyCount += 1;
        if (extraction.usedOcr) {
          ocrCount += 1;
          ocrUnits += extraction.ocrUnits || 0;
        }
        results.push({ sourceId: source.id, status: 'ready_for_review', extractionMethod: extraction.extractionMethod });
      } catch (error) {
        await source.ref.update({
          status: 'failed',
          error_message: error.message,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.push({ sourceId: source.id, status: 'failed', errorMessage: error.message });
      }
    }

    const refreshed = await db.collection('drafting_sources').where('session_id', '==', session.id).get();
    const readySources = refreshed.docs.filter((docSnap) => docSnap.data().status === 'ready_for_review').length;
    const totalOcrSources = refreshed.docs.filter((docSnap) => docSnap.data().used_ocr === true).length;

    await db.collection('drafting_sessions').doc(session.id).update({
      status: readySources > 0 ? 'ready_for_review' : 'failed',
      ocr_source_count: totalOcrSources,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const billing = await consumeCreditsForUsage({
      userRef: user.userRef,
      profile: advocate.profile,
      usage: { ocrUnits },
      event: {
        feature: 'drafting_ocr',
        case_id: session.case_number || '',
        client_id: session.client_id || '',
        session_id: session.id,
      },
    });

    response.status(200).json({
      results,
      readyCount,
      ocrCount,
      ocrUnits,
      creditsUsed: billing.charge.totalCredits,
      creditBreakdown: billing.sourceBreakdown,
      remainingCredits: billing.remaining,
    });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to extract drafting sources.' });
  }
});

exports.extractAadhaarDetailsHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can read Aadhaar details.' });
      return;
    }
    if (!buildBillingSummary(user.profile).canUseAiNow) {
      response.status(412).json({ error: 'Aadhaar OCR is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }

    const data = request.body || {};
    const source = {
      advocate_id: user.uid,
      session_id: 'aadhaar-intake',
      id: 'aadhaar-intake',
      source_type: 'uploaded_file',
      name: data.name || '',
      mime_type: data.mimeType || '',
      storage_path: data.storagePath || '',
      url: data.url || '',
    };

    const result = await extractAadhaarDetailsFromSource(source);
    const billing = await consumeCreditsForUsage({
      userRef: user.userRef,
      profile: user.profile,
      usage: {
        ocrUnits: result.ocrUnits || 0,
        inputTokens: result.aiUsage?.promptTokenCount || 0,
        outputTokens: result.aiUsage?.candidatesTokenCount || 0,
      },
      event: {
        feature: 'aadhaar_ocr',
        client_id: '',
      },
    });
    response.status(200).json({
      ...result,
      creditsUsed: billing.charge.totalCredits,
      creditBreakdown: billing.sourceBreakdown,
      remainingCredits: billing.remaining,
    });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to read Aadhaar details.' });
  }
});

exports.generateDraftingOutput = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);

  const sourcesSnapshot = await db
    .collection('drafting_sources')
    .where('session_id', '==', session.id)
    .get();

  const sources = sourcesSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((source) => cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '').length > 0);
  const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
  const promptReady = sources.length > 0 || hasFieldValue(session.instructions) || hasFieldValue(session.client_name);
  if (!promptReady) {
    throw new HttpsError('failed-precondition', 'Add instructions or a usable source before generation.');
  }

  await db.collection('drafting_sessions').doc(session.id).update({
    status: 'generating',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  const prompt = buildPrompt({ session, caseRecord, sources });

  try {
    const generation = await generateWithVertex(prompt);
    const validation = buildFactValidationFields({ session, draftText: generation.text });
    const outputId = await upsertDraftingOutput(session.id, advocate.uid, {
      generated_text: generation.text,
      edited_text: generation.text,
      model: generation.model,
      provider: 'vertex_ai',
      fact_validation_fields: validation.fields,
      fact_validation_required: validation.requiresValidation,
      prompt_summary: {
        draft_type: session.custom_draft_type?.trim() || session.draft_type,
        output_language: session.output_language,
        source_count: sources.length,
        includes_case_context: Boolean(caseRecord),
      },
    });

    await db.collection('drafting_sessions').doc(session.id).update({
      status: validation.requiresValidation ? 'ready_for_review' : 'completed',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      outputId,
      generatedText: generation.text,
      requiresValidation: validation.requiresValidation,
    };
  } catch (error) {
    await db.collection('drafting_sessions').doc(session.id).update({
      status: 'failed',
      last_error: error.message,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('internal', error.message);
  }
});

exports.generateDraftingOutputHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can use AI drafting.' });
      return;
    }
    if (!buildBillingSummary(advocate.profile).canUseAiNow) {
      response.status(412).json({ error: 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }

    const data = request.body || {};
    const session = await getOwnedSession(data.sessionId, advocate.uid);
    const sourcesSnapshot = await db.collection('drafting_sources').where('session_id', '==', session.id).get();
    const sources = sourcesSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((source) => cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '').length > 0);
    const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
    const promptReady = sources.length > 0 || hasFieldValue(session.instructions) || hasFieldValue(session.client_name);
    if (!promptReady) {
      response.status(412).json({ error: 'Add instructions or a usable source before generation.' });
      return;
    }

    await db.collection('drafting_sessions').doc(session.id).update({
      status: 'generating',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const prompt = buildPrompt({ session, caseRecord, sources });
    const estimate = estimateDraftGenerationUsage({ session, caseRecord, sources });
    if (!hasUsableAiBalance(advocate.profile) || buildBillingSummary(advocate.profile).hasEntitlement === false) {
      response.status(412).json({ error: 'AI drafting is available only with active AI credits. Start a trial, subscribe, or top up.' });
      return;
    }
    const generation = await generateWithVertex(prompt);
    const validation = buildFactValidationFields({ session, draftText: generation.text });
    const outputId = await upsertDraftingOutput(session.id, advocate.uid, {
      generated_text: generation.text,
      edited_text: generation.text,
      model: generation.model,
      provider: 'vertex_ai',
      fact_validation_fields: validation.fields,
      fact_validation_required: validation.requiresValidation,
      prompt_summary: {
        draft_type: session.custom_draft_type?.trim() || session.draft_type,
        output_language: session.output_language,
        source_count: sources.length,
        includes_case_context: Boolean(caseRecord),
      },
    });

    await db.collection('drafting_sessions').doc(session.id).update({
      status: validation.requiresValidation ? 'ready_for_review' : 'completed',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const billing = await consumeCreditsForUsage({
      userRef: user.userRef,
      profile: advocate.profile,
      usage: {
        inputTokens: generation.usage?.promptTokenCount || estimate.inputTokens,
        outputTokens: generation.usage?.candidatesTokenCount || estimate.outputTokens,
      },
      event: {
        feature: 'draft_generation',
        case_id: session.case_number || '',
        client_id: session.client_id || '',
        session_id: session.id,
      },
    });

    response.status(200).json({
      outputId,
      generatedText: generation.text,
      requiresValidation: validation.requiresValidation,
      creditsUsed: billing.charge.totalCredits,
      creditBreakdown: billing.sourceBreakdown,
      remainingCredits: billing.remaining,
      usage: generation.usage,
    });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to generate drafting output.' });
  }
});

exports.exportDraftingDocx = onCall(async (request) => {
  const advocate = await requireAdvocateRoleOnly(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();

  if (!outputSnap.exists) {
    throw new HttpsError('not-found', 'Draft output not found.');
  }

  const output = { id: outputSnap.id, ...outputSnap.data() };
  if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
    throw new HttpsError('permission-denied', 'This draft output belongs to another advocate.');
  }

  const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
  const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
  const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
  const buffer = await Packer.toBuffer(document);
  const exportPath = `drafting/${advocate.uid}/sessions/${session.id}/exports/${Date.now()}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}.docx`;

  await bucket.file(exportPath).save(buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });

  await outputSnap.ref.update({
    docx_export_path: exportPath,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    exportPath,
  };
});

exports.exportDraftingDocxHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can export drafts.' });
      return;
    }

    const data = request.body || {};
    const session = await getOwnedSession(data.sessionId, advocate.uid);
    const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();
    if (!outputSnap.exists) {
      response.status(404).json({ error: 'Draft output not found.' });
      return;
    }

    const output = { id: outputSnap.id, ...outputSnap.data() };
    if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
      response.status(403).json({ error: 'This draft output belongs to another advocate.' });
      return;
    }

    const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
    const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
    const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
    const buffer = await Packer.toBuffer(document);
    const exportPath = `drafting/${advocate.uid}/sessions/${session.id}/exports/${Date.now()}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.docx`;

    await bucket.file(exportPath).save(buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    });

    await outputSnap.ref.update({
      docx_export_path: exportPath,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    response.status(200).json({ exportPath });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to export DOCX.' });
  }
});

exports.publishDraftingOutput = onCall(async (request) => {
  const advocate = await requireAdvocateRoleOnly(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const caseRecord = await ensureSessionCaseForPublish(session, advocate);
  const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();

  if (!outputSnap.exists) {
    throw new HttpsError('not-found', 'Draft output not found.');
  }

  const output = { id: outputSnap.id, ...outputSnap.data() };
  if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
    throw new HttpsError('permission-denied', 'This draft output belongs to another advocate.');
  }

  const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
  const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
  const buffer = await Packer.toBuffer(document);
  const publishedPath = `documents/${advocate.uid}/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`;

  await bucket.file(publishedPath).save(buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });

  const documentRef = await db.collection('documents').add({
    advocate_id: advocate.uid,
    case_id: caseRecord.case_number || '',
    type: title,
    name: `${title}.docx`,
    storage_path: publishedPath,
    url: '',
    uploaded_by_role: 'advocate',
    client_access_token: '',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await outputSnap.ref.update({
    published_document_id: documentRef.id,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    documentId: documentRef.id,
    storagePath: publishedPath,
  };
});

exports.publishDraftingOutputHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const advocate = { uid: user.uid, profile: user.profile };
    if (advocate.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can publish drafts.' });
      return;
    }

    const data = request.body || {};
    const session = await getOwnedSession(data.sessionId, advocate.uid);
    const caseRecord = await ensureSessionCaseForPublish(session, advocate);
    const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();

    if (!outputSnap.exists) {
      response.status(404).json({ error: 'Draft output not found.' });
      return;
    }

    const output = { id: outputSnap.id, ...outputSnap.data() };
    if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
      response.status(403).json({ error: 'This draft output belongs to another advocate.' });
      return;
    }

    const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
    const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
    const buffer = await Packer.toBuffer(document);
    const publishedPath = `documents/${advocate.uid}/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`;

    await bucket.file(publishedPath).save(buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    });

    const documentRef = await db.collection('documents').add({
      advocate_id: advocate.uid,
      case_id: caseRecord.case_number || '',
      type: title,
      name: `${title}.docx`,
      storage_path: publishedPath,
      url: '',
      uploaded_by_role: 'advocate',
      client_access_token: '',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await outputSnap.ref.update({
      published_document_id: documentRef.id,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    response.status(200).json({
      documentId: documentRef.id,
      storagePath: publishedPath,
    });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to publish draft.' });
  }
});

exports.activatePremiumSubscription = onCall(async (request) => {
  const user = await requireSignedInUser(request);
  return subscribeAiPlusForUser({
    uid: user.uid,
    profile: user.profile,
    data: request.data,
  });
});

exports.activatePremiumSubscriptionHttp = onRequest(async (request, response) => {
  applyCors(request, response);

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const header = request.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      response.status(401).json({ error: 'Missing authorization token.' });
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(match[1]);
    const userSnap = await db.collection('users').doc(decodedToken.uid).get();
    if (!userSnap.exists) {
      response.status(404).json({ error: 'User profile not found.' });
      return;
    }

    const result = await subscribeAiPlusForUser({
      uid: decodedToken.uid,
      profile: await refreshBillingState(db.collection('users').doc(decodedToken.uid), userSnap.data()),
      data: request.body || {},
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof HttpsError ? error.message : 'Unable to activate premium.';
    const status = error instanceof HttpsError
      ? (error.code === 'permission-denied' ? 403 : error.code === 'unauthenticated' ? 401 : 400)
      : 500;
    response.status(status).json({ error: message });
  }
});

exports.activateAiTrialHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can start the AI trial.' });
      return;
    }

    const profile = normalizeBillingProfile(user.profile);
    if (profile.trialStatus !== TRIAL_STATUS.UNUSED) {
      response.status(412).json({ error: 'Your AI trial has already been used.' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + AI_TRIAL_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    await user.userRef.set({
      planTier: PLAN_TIERS.TRIAL,
      planStatus: PLAN_STATUS.ACTIVE,
      trialStatus: TRIAL_STATUS.ACTIVE,
      trialCreditsRemaining: AI_TRIAL_CREDITS,
      trialStartedAt: admin.firestore.Timestamp.fromDate(now),
      trialExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      premiumActive: true,
      premiumStatus: 'active',
      subscriptionPlan: 'ai_trial',
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await recordBillingEvent(user.uid, {
      type: 'trial_activated',
      amountInr: 0,
      credits: AI_TRIAL_CREDITS,
    });

    const summary = await getUsageSummaryForAdvocate(user.uid, {
      ...profile,
      planTier: PLAN_TIERS.TRIAL,
      planStatus: PLAN_STATUS.ACTIVE,
      trialStatus: TRIAL_STATUS.ACTIVE,
      trialCreditsRemaining: AI_TRIAL_CREDITS,
      trialStartedAt: admin.firestore.Timestamp.fromDate(now),
      trialExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      premiumActive: true,
      premiumStatus: 'active',
      subscriptionPlan: 'ai_trial',
    });

    response.status(200).json(summary);
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to activate the AI trial.' });
  }
});

exports.subscribeAiPlusHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    const result = await subscribeAiPlusForUser({
      uid: user.uid,
      profile: user.profile,
      data: request.body || {},
    });
    const summary = await getUsageSummaryForAdvocate(user.uid, {
      ...user.profile,
      ...result,
      planTier: PLAN_TIERS.AI_PLUS,
      planStatus: PLAN_STATUS.ACTIVE,
      includedCreditsMonthly: AI_PLUS_INCLUDED_CREDITS,
      includedCreditsRemaining: AI_PLUS_INCLUDED_CREDITS,
      autoRenew: true,
      subscriptionPlan: 'ai_plus_monthly',
      premiumActive: true,
      premiumStatus: 'active',
    });
    response.status(200).json(summary);
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to activate AI Plus.' });
  }
});

exports.cancelAiPlusRenewalHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can manage subscription settings.' });
      return;
    }

    await user.userRef.set({
      autoRenew: false,
      planStatus: PLAN_STATUS.CANCELLED,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await recordBillingEvent(user.uid, {
      type: 'subscription_cancelled',
      amountInr: 0,
      credits: 0,
    });

    const summary = await getUsageSummaryForAdvocate(user.uid, {
      ...user.profile,
      autoRenew: false,
      planStatus: PLAN_STATUS.CANCELLED,
    });
    response.status(200).json(summary);
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to update renewal settings.' });
  }
});

exports.createWalletTopupHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can top up AI credits.' });
      return;
    }

    const packId = request.body?.packId || '';
    const pack = TOPUP_PACKS[packId];
    if (!pack) {
      response.status(400).json({ error: 'Invalid top-up pack selected.' });
      return;
    }

    const orderRef = await db.collection('topup_orders').add({
      advocate_id: user.uid,
      pack_id: pack.id,
      amount_inr: pack.amountInr,
      credits: pack.credits,
      status: 'success',
      source: 'mock_checkout',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await user.userRef.set({
      walletCreditsRemaining: (Number(user.profile.walletCreditsRemaining) || 0) + pack.credits,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await recordBillingEvent(user.uid, {
      type: 'wallet_topup',
      amountInr: pack.amountInr,
      credits: pack.credits,
      orderId: orderRef.id,
    });

    const summary = await getUsageSummaryForAdvocate(user.uid, {
      ...user.profile,
      walletCreditsRemaining: (Number(user.profile.walletCreditsRemaining) || 0) + pack.credits,
    });
    response.status(200).json(summary);
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to top up wallet credits.' });
  }
});

exports.getAiAccessSummaryHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can view AI access summary.' });
      return;
    }

    const summary = await getUsageSummaryForAdvocate(user.uid, user.profile);
    response.status(200).json(summary);
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to load AI access summary.' });
  }
});

exports.estimateAiUsageHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const user = await getHttpUser(request, response);
    if (!user) return;
    if (user.profile.role !== 'advocate') {
      response.status(403).json({ error: 'Only advocates can estimate AI usage.' });
      return;
    }

    const data = request.body || {};
    let estimate;

    if (data.feature === 'draft_generation') {
      const session = await getOwnedSession(data.sessionId, user.uid);
      const sourcesSnapshot = await db.collection('drafting_sources').where('session_id', '==', session.id).get();
      const sources = sourcesSnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((source) => cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '').length > 0);
      const caseRecord = session.case_id ? await getOwnedCase(session.case_id, user.uid) : null;
      estimate = estimateDraftGenerationUsage({ session, caseRecord, sources });
    } else if (data.feature === 'aadhaar_ocr') {
      const ocrUnits = 1;
      const inputTokens = 1500;
      const outputTokens = 300;
      estimate = {
        inputTokens,
        outputTokens,
        ocrUnits,
        estimatedCredits: calculateCreditCharge({ inputTokens, outputTokens, ocrUnits }).totalCredits,
      };
    } else {
      response.status(400).json({ error: 'Unsupported feature for usage estimate.' });
      return;
    }

    response.status(200).json({
      feature: data.feature,
      ...estimate,
      billing: buildBillingSummary(user.profile),
    });
  } catch (error) {
    response.status(mapHttpsErrorStatus(error)).json({ error: error.message || 'Unable to estimate AI usage.' });
  }
});

exports.reseedIsolationTestDataHttp = onRequest({ invoker: 'public' }, async (request, response) => {
  try {
    const adminUser = await requireAdminHttp(request, response);
    if (!adminUser) {
      return;
    }

    const seededAdvocates = [];
    for (const blueprint of getIsolationSeedBlueprints()) {
      const result = await seedIsolationDataForAdvocate(blueprint);
      seededAdvocates.push(result);
    }

    response.status(200).json({
      ok: true,
      requestedBy: adminUser.uid,
      seededAdvocates,
    });
  } catch (error) {
    console.error('reseedIsolationTestDataHttp failed', error);
    response.status(mapHttpsErrorStatus(error)).json({
      error: error.message || 'Unable to reseed isolation test data.',
    });
  }
});
