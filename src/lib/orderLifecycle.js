// Order lifecycle definitions and helpers for the v2 operations flow.
// This module is the single source of truth for status transitions, stage
// detection, blocked-state logic, date calculations and audit logging.
//
// It is intentionally pure(ish): only the audit logger touches Firestore.
// Everything else takes an order object and returns a value, which keeps the
// UI simple to test and reason about.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

// -----------------------------------------------------------------------------
// Status catalog
// -----------------------------------------------------------------------------
// Lifecycle statuses follow the swimlane the owner provided. We keep the
// legacy strings (Quoted / Pending / In Progress / Active / Delivered / On Hold)
// recognized so existing records render without a migration. New records use
// the v2 set below.
export const LIFECYCLE = {
  QUOTE:               'Quote',
  CONFIRMED:           'Confirmed',
  AWAITING_PO:         'Awaiting PO',
  AWAITING_SUBMITTALS: 'Awaiting Submittals',
  ON_HOLD:             'On Hold',
  SCHEDULED:           'Scheduled',
  IN_PROCUREMENT:      'In Procurement',
  IN_TRANSIT:          'In Transit',
  DELIVERED:           'Delivered',
  CLOSED:              'Closed',
  ISSUE:               'Issue',
};

export const LIFECYCLE_LIST = Object.values(LIFECYCLE);

// Buckets the UI uses for tabs / filters.
export const STATUS_GROUPS = {
  quotes:   [LIFECYCLE.QUOTE],
  blocked:  [LIFECYCLE.AWAITING_PO, LIFECYCLE.AWAITING_SUBMITTALS, LIFECYCLE.ON_HOLD, LIFECYCLE.ISSUE],
  active:   [LIFECYCLE.CONFIRMED, LIFECYCLE.SCHEDULED, LIFECYCLE.IN_PROCUREMENT, LIFECYCLE.IN_TRANSIT],
  closed:   [LIFECYCLE.DELIVERED, LIFECYCLE.CLOSED],
};

// Legacy → v2 status mapping. Used only for display fallback so legacy data
// looks reasonable in the new UI without rewriting it.
export function normalizeStatus(raw) {
  if (!raw) return LIFECYCLE.QUOTE;
  const map = {
    'Quoted':      LIFECYCLE.QUOTE,
    'Pending':     LIFECYCLE.CONFIRMED,
    'In Progress': LIFECYCLE.IN_PROCUREMENT,
    'Active':      LIFECYCLE.IN_TRANSIT,
    'Delivered':   LIFECYCLE.DELIVERED,
    'On Hold':     LIFECYCLE.ON_HOLD,
  };
  if (LIFECYCLE_LIST.includes(raw)) return raw;
  return map[raw] || raw;
}

// -----------------------------------------------------------------------------
// Stage detection
// -----------------------------------------------------------------------------
// The owner's swimlane has 7 visible stages. We collapse to a 7-step pipeline
// that matches the chart so the UI timeline lines up with what he drew.
export const STAGES = [
  { key: 'handoff',     label: 'Sales Handoff' },
  { key: 'validation',  label: 'Operations Review' },
  { key: 'tracking',    label: 'Internal Tracking' },
  { key: 'procurement', label: 'Vendor PO' },
  { key: 'ack',         label: 'Vendor Ack' },
  { key: 'shipment',    label: 'Shipment' },
  { key: 'delivered',   label: 'Delivered' },
];

// Returns { currentStage, completedStages: Set, blockedAt }
export function getStageInfo(order, linkedPOs = []) {
  const completed = new Set();
  const status = normalizeStatus(order?.status);

  // handoff is complete the moment the order exists with a customer
  if (order?.customerId) completed.add('handoff');

  // validation needs PO + submittals + the validation checklist
  const poOk = !!order?.customerPOReceived || !!order?.customerPO;
  const subOk = !!order?.submittalsApproved;
  const valOk = !!order?.validationComplete;
  if (poOk && subOk && valOk) completed.add('validation');

  // tracking = once order has been moved past Quote
  if (status !== LIFECYCLE.QUOTE && status !== LIFECYCLE.AWAITING_PO &&
      status !== LIFECYCLE.AWAITING_SUBMITTALS) {
    completed.add('tracking');
  }

  // procurement = at least one linked PO exists
  if (linkedPOs.length > 0) completed.add('procurement');

  // ack = at least one PO acknowledged
  if (linkedPOs.some(p => p.vendorAckStatus === 'Acknowledged')) completed.add('ack');

  // shipment = at least one PO shipped or has tracking
  if (linkedPOs.some(p => p.status === 'Shipped' || p.status === 'Received' || p.trackingNumber)) {
    completed.add('shipment');
  }

  // delivered
  if (status === LIFECYCLE.DELIVERED || status === LIFECYCLE.CLOSED || order?.actualDeliveryDate) {
    completed.add('delivered');
  }

  // current stage = first one not yet complete
  let currentStage = 'delivered';
  for (const s of STAGES) {
    if (!completed.has(s.key)) { currentStage = s.key; break; }
  }

  // blocked detection
  let blockedAt = null;
  if (status === LIFECYCLE.AWAITING_PO || (!poOk && status === LIFECYCLE.QUOTE)) blockedAt = 'po';
  else if (status === LIFECYCLE.AWAITING_SUBMITTALS || (poOk && !subOk && status !== LIFECYCLE.QUOTE)) blockedAt = 'submittals';
  else if (status === LIFECYCLE.ON_HOLD) blockedAt = 'hold';
  else if (status === LIFECYCLE.ISSUE || (order?.issues || []).some(i => !i.resolved)) blockedAt = 'issue';

  return { currentStage, completedStages: completed, blockedAt };
}

// -----------------------------------------------------------------------------
// Date math
// -----------------------------------------------------------------------------
export function addDays(dateLike, days) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a), dbb = new Date(b);
  if (isNaN(da) || isNaN(dbb)) return null;
  return Math.round((dbb - da) / (1000 * 60 * 60 * 24));
}

// Compute a planned ship date from a vendor's lead time and an order date.
// Lead time is stored on the vendor in days; if missing we fall back to 14.
export function computePlannedShipDate(orderDate, vendorLeadDays) {
  return addDays(orderDate || new Date().toISOString().slice(0, 10), vendorLeadDays || 14);
}

// On-time evaluation. Returns: 'on_time' | 'at_risk' | 'late' | 'unknown'
export function getDeliveryHealth(order) {
  if (!order) return 'unknown';
  const promise = order.promiseDate;
  const eta = order.eta || order.plannedShipDate;
  const actual = order.actualDeliveryDate;
  if (actual && promise) {
    return new Date(actual) <= new Date(promise) ? 'on_time' : 'late';
  }
  if (!eta || !promise) return 'unknown';
  const diff = daysBetween(eta, promise); // positive = eta before promise = good
  if (diff === null) return 'unknown';
  if (diff >= 3) return 'on_time';
  if (diff >= 0) return 'at_risk';
  return 'late';
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------
// Append-only event log for an order. Best-effort: any failure here must not
// block the user's primary save action, so we swallow errors.
export async function logOrderEvent(orderId, type, message, extra = {}) {
  if (!orderId) return;
  try {
    await addDoc(collection(db, 'order_events'), {
      orderId,
      type,
      message,
      userEmail: auth.currentUser?.email || 'system',
      timestamp: serverTimestamp(),
      ...extra,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('order_events log failed', e);
  }
}

// -----------------------------------------------------------------------------
// Display helpers
// -----------------------------------------------------------------------------
export const STATUS_COLORS = {
  [LIFECYCLE.QUOTE]:               { bg: '#eef2ff', fg: '#4338ca' },
  [LIFECYCLE.CONFIRMED]:           { bg: '#dbeafe', fg: '#1d4ed8' },
  [LIFECYCLE.AWAITING_PO]:         { bg: '#fef3c7', fg: '#92400e' },
  [LIFECYCLE.AWAITING_SUBMITTALS]: { bg: '#fef3c7', fg: '#92400e' },
  [LIFECYCLE.ON_HOLD]:             { bg: '#fee2e2', fg: '#991b1b' },
  [LIFECYCLE.SCHEDULED]:           { bg: '#e0e7ff', fg: '#3730a3' },
  [LIFECYCLE.IN_PROCUREMENT]:      { bg: '#dbeafe', fg: '#1e40af' },
  [LIFECYCLE.IN_TRANSIT]:          { bg: '#cffafe', fg: '#0e7490' },
  [LIFECYCLE.DELIVERED]:           { bg: '#dcfce7', fg: '#15803d' },
  [LIFECYCLE.CLOSED]:              { bg: '#f1f5f9', fg: '#475569' },
  [LIFECYCLE.ISSUE]:               { bg: '#fee2e2', fg: '#991b1b' },
};

export const HEALTH_COLORS = {
  on_time: { bg: '#dcfce7', fg: '#15803d', label: 'On time' },
  at_risk: { bg: '#fef3c7', fg: '#92400e', label: 'At risk' },
  late:    { bg: '#fee2e2', fg: '#991b1b', label: 'Late' },
  unknown: { bg: '#f1f5f9', fg: '#64748b', label: 'No ETA' },
};

export const ROUTE_LABELS = {
  drop_ship: 'Drop Ship',
  warehouse: 'Warehouse',
  '':        'Not routed',
};

export const INCOTERMS = ['FCA', 'CIF', 'EXW'];

export function isReadyToSchedule(order) {
  const s = normalizeStatus(order?.status);
  if (s !== LIFECYCLE.CONFIRMED) return false;
  if (order?.route) return false; // already routed
  // must have customer PO + submittals + validation complete per the swimlane gates
  return !!order?.customerPOReceived && !!order?.submittalsApproved && !!order?.validationComplete;
}

// -----------------------------------------------------------------------------
// Validation checklist
// -----------------------------------------------------------------------------
// The Operations Validation step from the bullet list. Each item is a boolean
// the user ticks off. validationComplete is derived from these but can also be
// set manually (e.g. on legacy records).
export const VALIDATION_ITEMS = [
  { key: 'modelsConfirmed',     label: 'Model numbers confirmed against quote' },
  { key: 'qtyConfirmed',        label: 'Quantities confirmed' },
  { key: 'accessoriesConfirmed',label: 'Accessories / options listed' },
  { key: 'deadlinesNoted',      label: 'Split / phased / deadline notes captured' },
  { key: 'domesticIntlSet',     label: 'Domestic vs international identified' },
];

export function isValidationComplete(order) {
  if (!order) return false;
  if (order.validationComplete) return true;
  const v = order.validation || {};
  return VALIDATION_ITEMS.every(it => !!v[it.key]);
}

// -----------------------------------------------------------------------------
// Shipment plan helpers
// -----------------------------------------------------------------------------
// A shipment plan line: { id, label, qty, plannedDate, status, notes, actualDate, trackingNumber, carrier }
// status: 'Planned' | 'In Transit' | 'Delivered' | 'Backorder'
export const SHIPMENT_STATUSES = ['Planned', 'In Transit', 'Delivered', 'Backorder'];

export function shipmentPlanSummary(order) {
  const plan = order?.shipmentPlan || [];
  if (plan.length === 0) return null;
  const totalQty = plan.reduce((s, l) => s + Number(l.qty || 0), 0);
  const deliveredQty = plan.filter(l => l.status === 'Delivered').reduce((s, l) => s + Number(l.qty || 0), 0);
  const inTransit = plan.filter(l => l.status === 'In Transit').length;
  const backorders = plan.filter(l => l.status === 'Backorder').length;
  return { lines: plan.length, totalQty, deliveredQty, inTransit, backorders };
}

// -----------------------------------------------------------------------------
// Invoicing
// -----------------------------------------------------------------------------
export const PAYMENT_TERMS = ['Net 30', 'Net 45', 'Net 60', 'Due on receipt', '50% deposit / 50% on delivery', 'Prepaid', 'Other'];

export const INVOICE_MILESTONES = ['On order', 'On shipment', 'On delivery', 'Custom'];

// -----------------------------------------------------------------------------
// Warehouse workflow
// -----------------------------------------------------------------------------
// Used only on warehouse-routed orders. Each step is a status the warehouse
// team moves the order through.
export const WAREHOUSE_STEPS = [
  { key: 'awaiting',   label: 'Awaiting receipt' },
  { key: 'received',   label: 'Received' },
  { key: 'inspected',  label: 'Inspected' },
  { key: 'staged',     label: 'Staged' },
  { key: 'dispatched', label: 'Out for delivery' },
  { key: 'delivered',  label: 'Delivered' },
];

export function getWarehouseStepIndex(order) {
  if (!order?.warehouseStep) return 0;
  const idx = WAREHOUSE_STEPS.findIndex(s => s.key === order.warehouseStep);
  return idx === -1 ? 0 : idx;
}

// -----------------------------------------------------------------------------
// Export documents (international)
// -----------------------------------------------------------------------------
export const EXPORT_DOCS = [
  { key: 'commercialInvoice', label: 'Commercial invoice' },
  { key: 'packingList',       label: 'Packing list' },
  { key: 'certOfOrigin',      label: 'Certificate of origin' },
  { key: 'billOfLading',      label: 'Bill of lading / AWB' },
  { key: 'exportDeclaration', label: 'Export declaration (EEI)' },
  { key: 'insurance',         label: 'Insurance certificate' },
];

export function exportDocsComplete(order) {
  if (!order?.isInternational) return true;
  const docs = order.exportDocs || {};
  return EXPORT_DOCS.every(d => !!docs[d.key]);
}

// -----------------------------------------------------------------------------
// On-time / vendor performance helpers (for dashboard + reports)
// -----------------------------------------------------------------------------
export function isOrderOnTime(order) {
  if (!order?.actualDeliveryDate || !order?.promiseDate) return null;
  return new Date(order.actualDeliveryDate) <= new Date(order.promiseDate);
}

export function vendorPOIsLate(po) {
  if (!po) return false;
  if (po.status === 'Received') return false;
  const target = po.vendorCommitDate || po.expectedDate;
  if (!target) return false;
  return new Date(target) < new Date() && po.status !== 'Shipped';
}

export function vendorPOAckOverdue(po, daysSinceOrder = 5) {
  // PO has been Ordered for too long without an acknowledgment
  if (!po || po.vendorAckStatus === 'Acknowledged') return false;
  if (po.status !== 'Ordered') return false;
  if (!po.orderDate) return false;
  const days = daysBetween(po.orderDate, new Date().toISOString().slice(0, 10));
  return days !== null && days >= daysSinceOrder;
}
