// OrderDetail — v2 detail view for a single sales order.
// Built to match the operations swimlane: shows stage progression, the sales
// handoff package, operations validation checklist, billing/invoicing,
// procurement (linked POs + vendor ack), shipment plan (with split/phased
// shipment support), fulfillment view that adapts to drop-ship vs warehouse,
// issues, and an audit log.

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, query, where, orderBy, doc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Customers';
import OrderAttachments from './OrderAttachments';
import {
  LIFECYCLE, STAGES, STATUS_COLORS, HEALTH_COLORS, ROUTE_LABELS, INCOTERMS,
  VALIDATION_ITEMS, isValidationComplete, SHIPMENT_STATUSES, shipmentPlanSummary,
  PAYMENT_TERMS, INVOICE_MILESTONES, WAREHOUSE_STEPS, getWarehouseStepIndex,
  EXPORT_DOCS, exportDocsComplete, computeEstimatedDelivery,
  getStageInfo, getDeliveryHealth, normalizeStatus, daysBetween,
  computePlannedShipDate, logOrderEvent,
} from '../lib/orderLifecycle';
import './Shared.css';

const F = n => '$' + Number(n || 0).toLocaleString();
const newId = () => Math.random().toString(36).slice(2, 10);

function StatusBadge({ status }) {
  const s = normalizeStatus(status);
  const c = STATUS_COLORS[s] || { bg: '#f1f5f9', fg: '#475569' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
      background: c.bg, color: c.fg, letterSpacing: '0.02em', textTransform: 'uppercase',
    }}>{s}</span>
  );
}

function HealthBadge({ order }) {
  const h = getDeliveryHealth(order);
  const c = HEALTH_COLORS[h];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
      background: c.bg, color: c.fg,
    }}>{c.label}</span>
  );
}

function StageRail({ order, pos }) {
  const { currentStage, completedStages, blockedAt } = getStageInfo(order, pos);
  return (
    <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
      {STAGES.map((s, i) => {
        const done = completedStages.has(s.key);
        const current = s.key === currentStage && !done;
        const blocked = current && blockedAt;
        const color = blocked ? '#ef4444' : done ? '#22c55e' : current ? '#1d4ed8' : '#e2e8f0';
        const fg = (done || current || blocked) ? '#fff' : '#94a3b8';
        return (
          <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {i > 0 && <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : '#e2e8f0' }} />}
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: fg, fontWeight: 700, flexShrink: 0,
              }}>{done ? '✓' : blocked ? '!' : i + 1}</div>
              {i < STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: STAGES[i + 1] && completedStages.has(STAGES[i + 1].key) ? '#22c55e' : '#e2e8f0' }} />
              )}
            </div>
            <div style={{
              fontSize: 10, marginTop: 6, textAlign: 'center', maxWidth: 90,
              color: blocked ? '#991b1b' : done ? '#15803d' : current ? '#1d4ed8' : '#94a3b8',
              fontWeight: (done || current) ? 600 : 400,
            }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function BlockedBanner({ blockedAt, order, onResolve }) {
  if (!blockedAt) return null;
  const messages = {
    po:         { title: 'Awaiting customer PO', sub: 'Project is on hold until customer PO number is recorded.' },
    submittals: { title: 'Awaiting approved submittals', sub: 'Project is on hold until submittals are approved.' },
    hold:       { title: 'Project on hold', sub: order?.onHoldReason || 'Reason not specified.' },
    issue:      { title: 'Open issue requires attention', sub: 'See Issues section below.' },
  };
  const m = messages[blockedAt];
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
      padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 24 }}>⚠️</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13 }}>{m.title}</div>
        <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>{m.sub}</div>
      </div>
      {onResolve && (
        <button className="btn" style={{ background: '#fff', borderColor: '#fecaca', color: '#991b1b', fontSize: 12 }} onClick={onResolve}>
          Resolve
        </button>
      )}
    </div>
  );
}

function DateRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight ? '#1d4ed8' : '#0f172a' }}>{value || '—'}</span>
    </div>
  );
}

export default function OrderDetail({ order: initialOrder, customers, vendors, perms, onBack, goDetail, refreshList }) {
  const [order, setOrder] = useState(initialOrder);
  const [pos, setPOs] = useState([]);
  const [events, setEvents] = useState([]);
  const [forwarders, setForwarders] = useState([]);
  const [comms, setComms] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [routeModal, setRouteModal] = useState(false);
  const [issueModal, setIssueModal] = useState(false);
  const [issueForm, setIssueForm] = useState({});
  const [shipLineModal, setShipLineModal] = useState(false);
  const [shipLineForm, setShipLineForm] = useState({});
  const [billingModal, setBillingModal] = useState(false);
  const [billingForm, setBillingForm] = useState({});
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({});
  const [forwarderModal, setForwarderModal] = useState(false);
  const [forwarderForm, setForwarderForm] = useState({});
  const [commModal, setCommModal] = useState(false);
  const [commForm, setCommForm] = useState({});

  const customer = customers.find(c => c.id === order.customerId);
  const linkedPOs = pos;
  const stageInfo = useMemo(() => getStageInfo(order, linkedPOs), [order, linkedPOs]);
  const canEdit = perms?.canEdit;
  const canSeeMoney = perms?.canViewFinancials;
  const totalValue = Number(order.qty || 0) * Number(order.unitPrice || 0);
  const planSummary = shipmentPlanSummary(order);

  const loadAssoc = async () => {
    // Use simple where() queries and sort client-side. Avoids requiring
    // composite Firestore indexes for where+orderBy combinations.
    const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0);
    const [psSnap, evSnap, fwSnap, cmSnap] = await Promise.all([
      getDocs(collection(db, 'purchase_orders')),
      getDocs(query(collection(db, 'order_events'), where('orderId', '==', order.id))).catch((e) => { console.warn('order_events load failed', e); return { docs: [] }; }),
      getDocs(collection(db, 'forwarders')).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'order_comms'), where('orderId', '==', order.id))).catch((e) => { console.warn('order_comms load failed', e); return { docs: [] }; }),
    ]);
    setPOs(psSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.relatedSO === order.id));
    setEvents(evSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.timestamp) - tsMs(a.timestamp)));
    setForwarders(fwSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setComms(cmSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.timestamp) - tsMs(a.timestamp)));
  };

  useEffect(() => { loadAssoc(); /* eslint-disable-next-line */ }, [order.id]);

  const persist = async (patch, eventType, eventMsg) => {
    await updateDoc(doc(db, 'orders', order.id), patch);
    if (eventType) await logOrderEvent(order.id, eventType, eventMsg);
    setOrder({ ...order, ...patch });
    if (refreshList) refreshList();
  };

  // ---------------- gate / status quick actions ----------------
  const markPOReceived = () => persist(
    { customerPOReceived: true, status: order.submittalsApproved ? LIFECYCLE.CONFIRMED : LIFECYCLE.AWAITING_SUBMITTALS },
    'po_received', `Customer PO ${order.customerPO || ''} marked received`
  );
  const markSubmittalsApproved = () => persist(
    { submittalsApproved: true, status: order.customerPOReceived ? LIFECYCLE.CONFIRMED : LIFECYCLE.AWAITING_PO },
    'submittals_approved', 'Submittals approved'
  );
  const placeOnHold = () => {
    const reason = window.prompt('Reason for hold?');
    if (reason == null) return;
    persist({ status: LIFECYCLE.ON_HOLD, onHoldReason: reason }, 'hold', `On hold: ${reason}`);
  };
  const releaseHold = () => persist(
    { status: order.customerPOReceived && order.submittalsApproved ? LIFECYCLE.CONFIRMED : (!order.customerPOReceived ? LIFECYCLE.AWAITING_PO : LIFECYCLE.AWAITING_SUBMITTALS), onHoldReason: '' },
    'hold_released', 'Hold released'
  );
  const confirmDelivery = () => {
    const today = new Date().toISOString().slice(0, 10);
    persist({ status: LIFECYCLE.DELIVERED, actualDeliveryDate: today }, 'delivered', 'Order delivered');
  };
  const closeOrder = () => persist({ status: LIFECYCLE.CLOSED }, 'closed', 'Order closed');

  // ---------------- validation checklist ----------------
  const toggleValidation = async (key) => {
    const v = { ...(order.validation || {}) };
    v[key] = !v[key];
    const allDone = VALIDATION_ITEMS.every(it => !!v[it.key]);
    const patch = { validation: v, validationComplete: allDone };
    await persist(patch, allDone ? 'validation_complete' : 'validation_progress', allDone ? 'Operations validation complete' : `Validation: ${key} ${v[key] ? 'checked' : 'unchecked'}`);
  };

  // ---------------- routing ----------------
  const saveRoute = async () => {
    const route = editForm.route;
    const isInternational = !!editForm.isInternational;
    const incoterm = isInternational ? (editForm.incoterm || 'FCA') : '';
    await persist(
      {
        route,
        isInternational,
        incoterm,
        promiseDate: editForm.promiseDate || order.promiseDate || '',
        plannedShipDate: editForm.plannedShipDate || order.plannedShipDate || '',
        status: LIFECYCLE.SCHEDULED,
      },
      'routed', `Routed as ${ROUTE_LABELS[route]}${isInternational ? ` (${incoterm})` : ''}`
    );
    setRouteModal(false);
  };

  // ---------------- issues ----------------
  const addIssue = async () => {
    const list = Array.isArray(order.issues) ? [...order.issues] : [];
    const newIssue = {
      date: new Date().toISOString().slice(0, 10),
      type: issueForm.type || 'Other',
      withParty: issueForm.withParty || '',
      description: issueForm.description || '',
      nextSteps: issueForm.nextSteps || '',
      resolved: false,
    };
    list.push(newIssue);
    await persist({ issues: list, status: LIFECYCLE.ISSUE }, 'issue_added', `Issue: ${newIssue.type} — ${newIssue.description.slice(0, 80)}`);
    setIssueModal(false);
    setIssueForm({});
  };
  const resolveIssue = async (idx) => {
    const list = (order.issues || []).map((it, i) => i === idx ? { ...it, resolved: true, resolvedDate: new Date().toISOString().slice(0, 10) } : it);
    const anyOpen = list.some(i => !i.resolved);
    const patch = { issues: list };
    if (!anyOpen && order.status === LIFECYCLE.ISSUE) {
      patch.status = order.actualDeliveryDate ? LIFECYCLE.DELIVERED : LIFECYCLE.IN_TRANSIT;
    }
    await persist(patch, 'issue_resolved', `Issue resolved: ${list[idx].type}`);
  };

  // ---------------- shipment plan (split / phased shipments) ----------------
  const saveShipLine = async () => {
    const list = Array.isArray(order.shipmentPlan) ? [...order.shipmentPlan] : [];
    const editing = list.find(l => l.id === shipLineForm.id);
    const data = {
      id: shipLineForm.id || newId(),
      label: shipLineForm.label || `Shipment ${list.length + 1}`,
      qty: Number(shipLineForm.qty) || 0,
      plannedDate: shipLineForm.plannedDate || '',
      status: shipLineForm.status || 'Planned',
      notes: shipLineForm.notes || '',
      poId: shipLineForm.poId || '',
      carrier: shipLineForm.carrier || '',
      trackingNumber: shipLineForm.trackingNumber || '',
      actualDate: shipLineForm.actualDate || '',
    };
    let next;
    if (editing) {
      next = list.map(l => l.id === data.id ? data : l);
    } else {
      next = [...list, data];
    }
    // Order status logic: if any line is In Transit, status is In Transit; if all are Delivered, status is Delivered.
    let newStatus = order.status;
    if (next.some(l => l.status === 'In Transit')) newStatus = LIFECYCLE.IN_TRANSIT;
    if (next.length > 0 && next.every(l => l.status === 'Delivered')) newStatus = LIFECYCLE.DELIVERED;
    await persist(
      { shipmentPlan: next, status: newStatus, ...(newStatus === LIFECYCLE.DELIVERED && !order.actualDeliveryDate ? { actualDeliveryDate: new Date().toISOString().slice(0, 10) } : {}) },
      editing ? 'shipment_updated' : 'shipment_added',
      `${editing ? 'Updated' : 'Added'} shipment line: ${data.label} (${data.qty} units, ${data.status})`
    );
    setShipLineModal(false);
    setShipLineForm({});
  };
  const removeShipLine = async (id) => {
    if (!window.confirm('Remove this shipment line?')) return;
    const next = (order.shipmentPlan || []).filter(l => l.id !== id);
    await persist({ shipmentPlan: next }, 'shipment_removed', 'Shipment line removed');
  };

  // ---------------- billing / invoicing ----------------
  const saveBilling = async () => {
    const patch = {
      paymentTerms: billingForm.paymentTerms || '',
      billingAddress: billingForm.billingAddress || '',
      invoiceMilestone: billingForm.invoiceMilestone || '',
      invoiceNumber: billingForm.invoiceNumber || '',
      invoiceDate: billingForm.invoiceDate || '',
      invoiceSent: !!billingForm.invoiceSent,
      invoicePaid: !!billingForm.invoicePaid,
    };
    await persist(patch, 'billing_updated', 'Billing details updated');
    setBillingModal(false);
  };

  // ---------------- warehouse workflow ----------------
  const advanceWarehouse = async (stepKey, extra = {}) => {
    const step = WAREHOUSE_STEPS.find(s => s.key === stepKey);
    const stamp = new Date().toISOString().slice(0, 10);
    const history = Array.isArray(order.warehouseHistory) ? [...order.warehouseHistory] : [];
    history.push({ step: stepKey, date: stamp, notes: extra.notes || '' });
    const patch = { warehouseStep: stepKey, warehouseHistory: history };
    if (stepKey === 'received') patch.warehouseReceivedDate = stamp;
    if (stepKey === 'inspected') {
      patch.warehouseInspectionResult = extra.inspectionResult || 'Pass';
      patch.warehouseInspectionNotes = extra.notes || '';
    }
    if (stepKey === 'dispatched') patch.warehouseDispatchedDate = stamp;
    if (stepKey === 'delivered') {
      patch.actualDeliveryDate = stamp;
      patch.status = LIFECYCLE.DELIVERED;
    }
    if (stepKey === 'staged') patch.status = LIFECYCLE.IN_TRANSIT;
    await persist(patch, 'warehouse_step', `Warehouse: ${step.label}${extra.notes ? ` — ${extra.notes}` : ''}`);
  };

  const saveWarehouseStep = async () => {
    await advanceWarehouse(warehouseForm.step, {
      notes: warehouseForm.notes,
      inspectionResult: warehouseForm.inspectionResult,
    });
    setWarehouseModal(false);
    setWarehouseForm({});
  };

  // ---------------- export docs ----------------
  const toggleExportDoc = async (key) => {
    const docs = { ...(order.exportDocs || {}) };
    docs[key] = !docs[key];
    const allDone = exportDocsComplete({ ...order, exportDocs: docs });
    await persist(
      { exportDocs: docs, exportDocsComplete: allDone },
      'export_doc',
      `Export doc "${EXPORT_DOCS.find(d => d.key === key)?.label}" ${docs[key] ? 'received' : 'unchecked'}`
    );
  };

  // ---------------- forwarder assignment ----------------
  const saveForwarder = async () => {
    const fw = forwarders.find(f => f.id === forwarderForm.forwarderId);
    await persist(
      {
        forwarderId: forwarderForm.forwarderId || '',
        forwarderName: fw ? fw.name : '',
        forwarderRef: forwarderForm.forwarderRef || '',
      },
      'forwarder_assigned',
      `Forwarder ${fw ? fw.name : 'cleared'}${forwarderForm.forwarderRef ? ` (ref ${forwarderForm.forwarderRef})` : ''}`
    );
    setForwarderModal(false);
    setForwarderForm({});
  };

  // ---------------- comms log ----------------
  const addComm = async () => {
    if (!commForm.message) return;
    await addDoc(collection(db, 'order_comms'), {
      orderId: order.id,
      direction: commForm.direction || 'Internal',
      party: commForm.party || '',
      channel: commForm.channel || 'Email',
      message: commForm.message,
      userEmail: order.userEmail || '',
      timestamp: serverTimestamp(),
    });
    await logOrderEvent(order.id, 'comm', `${commForm.direction || 'Internal'} via ${commForm.channel || 'Email'}: ${commForm.message.slice(0, 80)}`);
    setCommModal(false);
    setCommForm({});
    loadAssoc();
  };

  // ---------------- edit core fields ----------------
  const editFields = [
    { key: 'product', label: 'Product / model', type: 'text' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    ...(canSeeMoney ? [{ key: 'unitPrice', label: 'Unit price ($)', type: 'number' }] : []),
    { key: 'date', label: 'Order date', type: 'date' },
    { key: 'customerPO', label: 'Customer PO #', type: 'text' },
    { key: 'quoteRef', label: 'Quote reference', type: 'text' },
    { key: 'contractNumber', label: 'Internal contract #', type: 'text' },
    { key: 'accessories', label: 'Accessories / options', type: 'textarea' },
    { key: 'projectContacts', label: 'Project contacts (JIS)', type: 'textarea' },
    { key: 'promiseDate', label: 'Promise date to customer', type: 'date' },
    { key: 'specialNotes', label: 'Special notes / phasing / deadlines', type: 'textarea' },
    { key: 'notes', label: 'General notes', type: 'textarea' },
  ];
  const saveEdit = async () => {
    const { id, ...rest } = editForm;
    rest.qty = Number(rest.qty) || 1;
    rest.unitPrice = Number(rest.unitPrice) || 0;
    await persist(rest, 'edited', 'Order details updated');
    setEditModal(false);
  };

  // ---------------- header dates strip ----------------
  const promise = order.promiseDate;
  const eta = order.eta || order.plannedShipDate;
  const actual = order.actualDeliveryDate;
  const slippage = (promise && eta) ? daysBetween(promise, eta) : null;
  const valDone = isValidationComplete(order);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>
            Sales order · {customer?.name || order.customerName || 'Unknown customer'}
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {order.contractNumber || order.id}
            {order.isInternational && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: '#ecfeff', color: '#0e7490' }}>
                INT'L · {order.incoterm}
              </span>
            )}
            {order.route && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: '#f1f5f9', color: '#475569' }}>
                {ROUTE_LABELS[order.route]}
              </span>
            )}
          </h1>
        </div>
        <div className="topbar-actions">
          <StatusBadge status={order.status} />
          <HealthBadge order={order} />
          {canEdit && <button className="btn" onClick={() => { setEditForm(order); setEditModal(true); }}>Edit</button>}
        </div>
      </div>

      <div className="content">
        <button className="back-btn" onClick={onBack}>← Back to orders</button>

        <BlockedBanner
          blockedAt={stageInfo.blockedAt}
          order={order}
          onResolve={
            stageInfo.blockedAt === 'po' ? markPOReceived :
            stageInfo.blockedAt === 'submittals' ? markSubmittalsApproved :
            stageInfo.blockedAt === 'hold' ? releaseHold :
            null
          }
        />

        {/* Stage rail */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Operations stage</div>
          <StageRail order={order} pos={linkedPOs} />
        </div>

        {/* Quote-stage estimated delivery banner */}
        {normalizeStatus(order.status) === LIFECYCLE.QUOTE && order.estimatedDelivery && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
            background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 24 }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated delivery to customer</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#312e81', marginTop: 2 }}>{order.estimatedDelivery}</div>
              <div style={{ fontSize: 11, color: '#6366f1', marginTop: 2 }}>
                Based on {order.eddVendorName || 'vendor'} lead time of {order.eddVendorLeadDays || 14} days + 7d buffer. Use this in your quote to the customer.
              </div>
            </div>
          </div>
        )}

        {/* Dates strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <div className="metric">
            <div className="metric-label">Promised</div>
            <div className="metric-val" style={{ fontSize: 16 }}>{promise || '—'}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Planned ship</div>
            <div className="metric-val" style={{ fontSize: 16 }}>{order.plannedShipDate || '—'}</div>
          </div>
          <div className="metric">
            <div className="metric-label">ETA</div>
            <div className="metric-val" style={{ fontSize: 16, color: slippage !== null && slippage < 0 ? '#ef4444' : '#0f172a' }}>
              {eta || '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Actual delivery</div>
            <div className="metric-val" style={{ fontSize: 16, color: actual ? '#15803d' : '#94a3b8' }}>{actual || '—'}</div>
          </div>
        </div>

        {/* Two columns: Handoff + Validation/Billing  |  Routing + Procurement */}
        <div className="two-col" style={{ marginBottom: 20 }}>
          {/* LEFT */}
          <div>
            {/* Sales handoff package */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Sales handoff package</div>
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Customer</label>
                  <p className="link" onClick={() => goDetail && goDetail('customers', order.customerId)}>
                    {customer?.name || order.customerName || '—'}
                  </p>
                </div>
                <div className="detail-field"><label>Customer PO #</label><p>{order.customerPO || '—'}</p></div>
                <div className="detail-field"><label>Quote reference</label><p>{order.quoteRef || '—'}</p></div>
                <div className="detail-field"><label>Internal contract #</label><p>{order.contractNumber || '—'}</p></div>
                <div className="detail-field"><label>Order date</label><p>{order.date || '—'}</p></div>
                <div className="detail-field"><label>Product / model</label><p>{order.product || '—'}</p></div>
                <div className="detail-field"><label>Quantity</label><p>{order.qty} unit{order.qty > 1 ? 's' : ''}</p></div>
                {canSeeMoney && (
                  <>
                    <div className="detail-field"><label>Unit price</label><p>{F(order.unitPrice)}</p></div>
                    <div className="detail-field">
                      <label>Total value</label>
                      <p style={{ fontSize: 16, fontWeight: 700 }}>{F(totalValue)}</p>
                    </div>
                  </>
                )}
              </div>

              {order.accessories && (
                <div className="notes-box" style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Accessories / options</div>
                  {order.accessories}
                </div>
              )}

              {/* gates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: order.customerPOReceived ? '#dcfce7' : '#fef3c7',
                  border: '1px solid ' + (order.customerPOReceived ? '#86efac' : '#fcd34d'),
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: order.customerPOReceived ? '#15803d' : '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {order.customerPOReceived ? '✓ PO received' : 'PO not yet received'}
                  </div>
                  {!order.customerPOReceived && canEdit && (
                    <button className="btn" style={{ marginTop: 8, fontSize: 11, padding: '4px 10px' }} onClick={markPOReceived}>Mark received</button>
                  )}
                </div>
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: order.submittalsApproved ? '#dcfce7' : '#fef3c7',
                  border: '1px solid ' + (order.submittalsApproved ? '#86efac' : '#fcd34d'),
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: order.submittalsApproved ? '#15803d' : '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {order.submittalsApproved ? '✓ Submittals approved' : 'Submittals pending'}
                  </div>
                  {!order.submittalsApproved && canEdit && (
                    <button className="btn" style={{ marginTop: 8, fontSize: 11, padding: '4px 10px' }} onClick={markSubmittalsApproved}>Mark approved</button>
                  )}
                </div>
              </div>

              {order.projectContacts && (
                <div className="notes-box" style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Project contacts</div>
                  {order.projectContacts}
                </div>
              )}
              {order.specialNotes && <div className="notes-box" style={{ marginTop: 8 }}><strong>Special notes:</strong> {order.specialNotes}</div>}
            </div>

            {/* Validation checklist */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Operations validation</div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
                  background: valDone ? '#dcfce7' : '#fef3c7',
                  color: valDone ? '#15803d' : '#92400e',
                  textTransform: 'uppercase',
                }}>{valDone ? 'Complete' : 'Pending'}</span>
              </div>
              <div>
                {VALIDATION_ITEMS.map(it => {
                  const checked = !!(order.validation || {})[it.key];
                  return (
                    <label key={it.key} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: '1px solid #f1f5f9', cursor: canEdit ? 'pointer' : 'default',
                      opacity: canEdit ? 1 : 0.6,
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={() => canEdit && toggleValidation(it.key)}
                        style={{ width: 16, height: 16, cursor: canEdit ? 'pointer' : 'default' }}
                      />
                      <span style={{ fontSize: 13, color: checked ? '#0f172a' : '#475569', textDecoration: checked ? 'line-through' : 'none' }}>
                        {it.label}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!valDone && (
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 10, padding: '6px 10px', background: '#fef3c7', borderRadius: 6 }}>
                  Order cannot be routed until validation is complete.
                </div>
              )}
            </div>

            {/* Billing / Invoicing */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Billing & invoicing</div>
                {canEdit && (
                  <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setBillingForm({
                    ...order,
                    invoiceSent: order.invoiceSent ? 'true' : '',
                    invoicePaid: order.invoicePaid ? 'true' : '',
                  }); setBillingModal(true); }}>
                    {order.paymentTerms ? 'Edit' : 'Set up'}
                  </button>
                )}
              </div>
              {order.paymentTerms || order.invoiceMilestone || order.invoiceNumber ? (
                <>
                  <div className="detail-grid">
                    <div className="detail-field"><label>Payment terms</label><p>{order.paymentTerms || '—'}</p></div>
                    <div className="detail-field"><label>Invoice milestone</label><p>{order.invoiceMilestone || '—'}</p></div>
                    <div className="detail-field"><label>Invoice #</label><p>{order.invoiceNumber || '—'}</p></div>
                    <div className="detail-field"><label>Invoice date</label><p>{order.invoiceDate || '—'}</p></div>
                  </div>
                  {order.billingAddress && (
                    <div className="notes-box" style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Billing address</div>
                      {order.billingAddress}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 4,
                      background: order.invoiceSent ? '#dcfce7' : '#f1f5f9',
                      color: order.invoiceSent ? '#15803d' : '#64748b',
                    }}>{order.invoiceSent ? '✓ Invoice sent' : 'Invoice not sent'}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 4,
                      background: order.invoicePaid ? '#dcfce7' : '#f1f5f9',
                      color: order.invoicePaid ? '#15803d' : '#64748b',
                    }}>{order.invoicePaid ? '✓ Paid' : 'Unpaid'}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>
                  No billing details yet.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div>
            {/* Routing card */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Routing</div>
              {order.route ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                    {ROUTE_LABELS[order.route]} {order.isInternational && `· International (${order.incoterm})`}
                  </div>
                  <DateRow label="Promise to customer" value={order.promiseDate} />
                  <DateRow label="Planned ship date" value={order.plannedShipDate} highlight />
                  {canEdit && (
                    <button className="btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => { setEditForm(order); setRouteModal(true); }}>
                      Re-route
                    </button>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Not yet routed</div>
                  {canEdit && (
                    <button
                      className="btn btn-primary"
                      disabled={!order.customerPOReceived || !order.submittalsApproved || !valDone}
                      onClick={() => { setEditForm({ ...order, route: 'drop_ship' }); setRouteModal(true); }}
                      title={!order.customerPOReceived || !order.submittalsApproved || !valDone ? 'PO, submittals, and validation must all be complete first' : ''}
                    >
                      Route order
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Procurement card */}
            <div className="card">
              <div className="section-title">Procurement</div>
              {linkedPOs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>No vendor PO yet</div>
                  {canEdit && !perms.salesOnly && (
                    <button className="btn btn-primary" onClick={() => goDetail('purchase_orders_v2', 'new:' + order.id)}>+ Issue vendor PO</button>
                  )}
                </div>
              ) : (
                linkedPOs.map(p => (
                  <div key={p.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div className="link" style={{ fontSize: 13, fontWeight: 700 }} onClick={() => goDetail('purchase_orders_v2', p.id)}>{p.id.slice(0, 8)}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{p.vendorName}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>{p.status}</span>
                        {p.vendorAckStatus && (
                          <div style={{ fontSize: 10, marginTop: 4, color: p.vendorAckStatus === 'Acknowledged' ? '#15803d' : p.vendorAckStatus === 'Discrepancy' ? '#991b1b' : '#92400e', fontWeight: 600 }}>
                            Ack: {p.vendorAckStatus}
                          </div>
                        )}
                      </div>
                    </div>
                    {(p.vendorCommitDate || p.expectedDate || p.trackingNumber) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                        {p.vendorCommitDate && <div style={{ fontSize: 11, color: '#64748b' }}>Commit: <strong style={{ color: '#0f172a' }}>{p.vendorCommitDate}</strong></div>}
                        {p.expectedDate && <div style={{ fontSize: 11, color: '#64748b' }}>Expected: <strong style={{ color: '#0f172a' }}>{p.expectedDate}</strong></div>}
                        {p.trackingNumber && <div style={{ fontSize: 11, color: '#64748b', gridColumn: '1 / -1' }}>Tracking: <strong style={{ color: '#1d4ed8' }}>{p.carrier} {p.trackingNumber}</strong></div>}
                      </div>
                    )}
                  </div>
                ))
              )}
              {linkedPOs.length > 0 && canEdit && !perms.salesOnly && (
                <button className="btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => goDetail('purchase_orders_v2', 'new:' + order.id)}>+ Add another PO</button>
              )}
            </div>
          </div>
        </div>

        {/* Shipment plan (split / phased shipments) */}
        {order.route && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="section-title" style={{ margin: 0 }}>Shipment plan</div>
              {canEdit && (
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setShipLineForm({ status: 'Planned' }); setShipLineModal(true); }}>
                  + Add shipment line
                </button>
              )}
            </div>

            {planSummary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                <div className="metric"><div className="metric-label">Lines</div><div className="metric-val" style={{ fontSize: 16 }}>{planSummary.lines}</div></div>
                <div className="metric"><div className="metric-label">Total qty</div><div className="metric-val" style={{ fontSize: 16 }}>{planSummary.totalQty}</div></div>
                <div className="metric"><div className="metric-label">Delivered qty</div><div className="metric-val" style={{ fontSize: 16, color: '#15803d' }}>{planSummary.deliveredQty}</div></div>
                <div className="metric"><div className="metric-label">Backorders</div><div className="metric-val" style={{ fontSize: 16, color: planSummary.backorders ? '#ef4444' : '#0f172a' }}>{planSummary.backorders}</div></div>
              </div>
            )}

            {(!order.shipmentPlan || order.shipmentPlan.length === 0) ? (
              <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>
                No shipment lines yet. Use lines for split or phased shipments. For a single shipment, just add one line.
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Qty</th>
                    <th>Planned</th>
                    <th>Actual</th>
                    <th>Carrier / tracking</th>
                    <th>Status</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {order.shipmentPlan.map(l => {
                    const c = {
                      Planned:      { bg: '#eef2ff', fg: '#4338ca' },
                      'In Transit': { bg: '#cffafe', fg: '#0e7490' },
                      Delivered:    { bg: '#dcfce7', fg: '#15803d' },
                      Backorder:    { bg: '#fee2e2', fg: '#991b1b' },
                    }[l.status] || { bg: '#f1f5f9', fg: '#475569' };
                    return (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>{l.label}</td>
                        <td>{l.qty}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{l.plannedDate || '—'}</td>
                        <td style={{ fontSize: 12, color: l.actualDate ? '#15803d' : '#94a3b8' }}>{l.actualDate || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {l.trackingNumber ? <span style={{ color: '#1d4ed8' }}>{l.carrier} {l.trackingNumber}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: c.bg, color: c.fg, textTransform: 'uppercase' }}>
                            {l.status}
                          </span>
                        </td>
                        {canEdit && (
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setShipLineForm(l); setShipLineModal(true); }}>Edit</button>
                            <button className="btn" style={{ fontSize: 10, padding: '3px 8px', color: '#ef4444', borderColor: '#fecaca' }} onClick={() => removeShipLine(l.id)}>×</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Fulfillment guidance */}
        {order.route && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="section-title" style={{ margin: 0 }}>Fulfillment — {ROUTE_LABELS[order.route]}</div>
              {canEdit && order.status !== LIFECYCLE.DELIVERED && order.status !== LIFECYCLE.CLOSED && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {order.status === LIFECYCLE.IN_TRANSIT && (
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={confirmDelivery}>Confirm full delivery</button>
                  )}
                  {order.status === LIFECYCLE.DELIVERED && (
                    <button className="btn" style={{ fontSize: 12 }} onClick={closeOrder}>Close order</button>
                  )}
                  {order.status !== LIFECYCLE.ON_HOLD && (
                    <button className="btn" style={{ fontSize: 12, color: '#92400e', borderColor: '#fcd34d' }} onClick={placeOnHold}>Place on hold</button>
                  )}
                </div>
              )}
            </div>
            {order.route === 'drop_ship' ? (
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                Material ships <strong>direct from vendor to {order.isInternational ? 'freight forwarder / customer' : 'customer or jobsite'}</strong>.
                {order.isInternational && (
                  <> Incoterm <strong>{order.incoterm}</strong> — {order.incoterm === 'FCA' && 'handoff complete on delivery to forwarder.'}{order.incoterm === 'CIF' && 'coordinate freight through destination port.'}{order.incoterm === 'EXW' && 'notify customer when goods are ready for pickup.'}</>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                Material routes through <strong>Protec warehouse</strong>: receive, inspect, stage, then coordinate outbound delivery to customer.
              </div>
            )}
          </div>
        )}

        {/* Warehouse workflow (only when warehouse-routed) */}
        {order.route === 'warehouse' && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="section-title" style={{ margin: 0 }}>Warehouse workflow</div>
              {canEdit && order.warehouseStep !== 'delivered' && (
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => {
                  const idx = getWarehouseStepIndex(order);
                  const next = WAREHOUSE_STEPS[Math.min(idx + (order.warehouseStep ? 1 : 0), WAREHOUSE_STEPS.length - 1)];
                  setWarehouseForm({ step: next.key });
                  setWarehouseModal(true);
                }}>Advance step</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {WAREHOUSE_STEPS.map((s, i) => {
                const idx = getWarehouseStepIndex(order);
                const done = order.warehouseStep && i <= idx;
                const current = order.warehouseStep === s.key;
                const color = current ? '#1d4ed8' : done ? '#22c55e' : '#e2e8f0';
                const fg = (current || done) ? '#fff' : '#94a3b8';
                return (
                  <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {i > 0 && <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : '#e2e8f0' }} />}
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: fg, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : i + 1}</div>
                      {i < WAREHOUSE_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? '#22c55e' : '#e2e8f0' }} />}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 6, textAlign: 'center', maxWidth: 80, color: current ? '#1d4ed8' : done ? '#15803d' : '#94a3b8', fontWeight: (current || done) ? 600 : 400 }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
            {(order.warehouseReceivedDate || order.warehouseInspectionResult || order.warehouseDispatchedDate) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
                {order.warehouseReceivedDate && <div className="info-box"><div className="info-box-label">Received</div><div className="info-box-value">{order.warehouseReceivedDate}</div></div>}
                {order.warehouseInspectionResult && <div className="info-box"><div className="info-box-label">Inspection</div><div className="info-box-value" style={{ color: order.warehouseInspectionResult === 'Pass' ? '#15803d' : '#ef4444' }}>{order.warehouseInspectionResult}</div></div>}
                {order.warehouseDispatchedDate && <div className="info-box"><div className="info-box-label">Dispatched</div><div className="info-box-value">{order.warehouseDispatchedDate}</div></div>}
              </div>
            )}
            {order.warehouseInspectionNotes && (
              <div className="notes-box" style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Inspection notes</div>
                {order.warehouseInspectionNotes}
              </div>
            )}
          </div>
        )}

        {/* International section: forwarder + export docs */}
        {order.isInternational && (
          <div className="two-col" style={{ marginBottom: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Freight forwarder</div>
                {canEdit && (
                  <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => { setForwarderForm({ forwarderId: order.forwarderId || '', forwarderRef: order.forwarderRef || '' }); setForwarderModal(true); }}>
                    {order.forwarderId ? 'Change' : 'Assign'}
                  </button>
                )}
              </div>
              {order.forwarderId && order.forwarderName ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    <span className="link" onClick={() => goDetail && goDetail('forwarders', order.forwarderId)}>{order.forwarderName}</span>
                  </div>
                  {order.forwarderRef && <div style={{ fontSize: 12, color: '#64748b' }}>Reference: <strong style={{ color: '#0f172a' }}>{order.forwarderRef}</strong></div>}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Incoterm: <strong style={{ color: '#0f172a' }}>{order.incoterm}</strong></div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No forwarder assigned.</div>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Export documents</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: exportDocsComplete(order) ? '#dcfce7' : '#fef3c7', color: exportDocsComplete(order) ? '#15803d' : '#92400e', textTransform: 'uppercase' }}>
                  {exportDocsComplete(order) ? 'Complete' : 'Pending'}
                </span>
              </div>
              <div>
                {EXPORT_DOCS.map(d => {
                  const checked = !!(order.exportDocs || {})[d.key];
                  return (
                    <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9', cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.6 }}>
                      <input type="checkbox" checked={checked} disabled={!canEdit} onChange={() => canEdit && toggleExportDoc(d.key)} style={{ width: 16, height: 16 }} />
                      <span style={{ fontSize: 13, color: checked ? '#0f172a' : '#475569', textDecoration: checked ? 'line-through' : 'none' }}>{d.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Documents (attachments) */}
        <OrderAttachments order={order} perms={perms} onUpdated={(patch) => setOrder({ ...order, ...patch })} />

        {/* Communications log */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Communications</div>
            {canEdit && <button className="btn" style={{ fontSize: 12 }} onClick={() => { setCommForm({ direction: 'Outbound', channel: 'Email' }); setCommModal(true); }}>+ Log communication</button>}
          </div>
          {comms.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No communications logged.</div>
          ) : (
            <div>
              {comms.map(c => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: c.direction === 'Inbound' ? '#dbeafe' : c.direction === 'Outbound' ? '#dcfce7' : '#f1f5f9', color: c.direction === 'Inbound' ? '#1d4ed8' : c.direction === 'Outbound' ? '#15803d' : '#475569', textTransform: 'uppercase' }}>{c.direction}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{c.channel}</span>
                    {c.party && <span style={{ fontSize: 11, color: '#64748b' }}>→ {c.party}</span>}
                    <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{c.timestamp?.toDate ? c.timestamp.toDate().toLocaleString() : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{c.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Issues */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Issues</div>
            {canEdit && <button className="btn" style={{ fontSize: 12 }} onClick={() => setIssueModal(true)}>+ Log issue</button>}
          </div>
          {(!order.issues || order.issues.length === 0) ? (
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No issues logged.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Date</th><th>Type</th><th>With</th><th>Description</th><th>Next steps</th><th>Status</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {order.issues.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{it.date}</td>
                    <td style={{ fontWeight: 600 }}>{it.type}</td>
                    <td style={{ fontSize: 12 }}>{it.withParty || '—'}</td>
                    <td style={{ fontSize: 12 }}>{it.description}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{it.nextSteps || '—'}</td>
                    <td>
                      {it.resolved
                        ? <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d' }}>✓ Resolved {it.resolvedDate || ''}</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b' }}>Open</span>}
                    </td>
                    {canEdit && (
                      <td>
                        {!it.resolved && <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => resolveIssue(idx)}>Resolve</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit log */}
        <div className="card">
          <div className="section-title">Activity</div>
          {events.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No activity yet.</div>
          ) : (
            <div>
              {events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', width: 130, flexShrink: 0 }}>
                    {ev.timestamp?.toDate ? ev.timestamp.toDate().toLocaleString() : '—'}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: '#0f172a' }}>{ev.message}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{ev.userEmail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editModal && (
        <Modal
          form={editForm} setForm={setEditForm} save={saveEdit}
          close={() => setEditModal(false)}
          title="Edit order"
          fields={editFields}
        />
      )}

      {/* Route modal */}
      {routeModal && (
        <RouteModal
          order={order}
          form={editForm}
          setForm={setEditForm}
          vendors={vendors}
          save={saveRoute}
          close={() => setRouteModal(false)}
        />
      )}

      {/* Issue modal */}
      {issueModal && (
        <Modal
          form={issueForm} setForm={setIssueForm} save={addIssue}
          close={() => setIssueModal(false)}
          title="Log issue"
          fields={[
            { key: 'type', label: 'Type', type: 'select', options: [
              { value: 'Shortage', label: 'Shortage' },
              { value: 'Damage', label: 'Damage' },
              { value: 'Missing documents', label: 'Missing documents' },
              { value: 'Late shipment', label: 'Late shipment' },
              { value: 'Wrong material', label: 'Wrong material' },
              { value: 'Other', label: 'Other' },
            ]},
            { key: 'withParty', label: 'Coordinating with', type: 'select', options: [
              { value: 'Vendor', label: 'Vendor' },
              { value: 'Warehouse', label: 'Warehouse' },
              { value: 'Forwarder/Carrier', label: 'Forwarder / Carrier' },
              { value: 'Customer', label: 'Customer' },
              { value: 'Internal', label: 'Internal' },
            ]},
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'nextSteps', label: 'Revised plan / next steps', type: 'textarea' },
          ]}
        />
      )}

      {/* Shipment line modal */}
      {shipLineModal && (
        <Modal
          form={shipLineForm} setForm={setShipLineForm} save={saveShipLine}
          close={() => { setShipLineModal(false); setShipLineForm({}); }}
          title={shipLineForm.id ? 'Edit shipment line' : 'Add shipment line'}
          fields={[
            { key: 'label', label: 'Label (e.g. "Phase 1", "Backordered units")', type: 'text' },
            { key: 'qty', label: 'Quantity', type: 'number' },
            { key: 'plannedDate', label: 'Planned ship date', type: 'date' },
            { key: 'status', label: 'Status', type: 'select', options: SHIPMENT_STATUSES.map(s => ({ value: s, label: s })) },
            { key: 'poId', label: 'Linked vendor PO (optional)', type: 'select', options: [
              { value: '', label: '— None —' },
              ...linkedPOs.map(p => ({ value: p.id, label: `${p.id.slice(0,8)} — ${p.vendorName}` })),
            ]},
            { key: 'carrier', label: 'Carrier', type: 'text' },
            { key: 'trackingNumber', label: 'Tracking #', type: 'text' },
            { key: 'actualDate', label: 'Actual ship/delivery date', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ]}
        />
      )}

      {/* Billing modal */}
      {billingModal && (
        <Modal
          form={billingForm} setForm={setBillingForm} save={saveBilling}
          close={() => setBillingModal(false)}
          title="Billing & invoicing"
          fields={[
            { key: 'paymentTerms', label: 'Payment terms', type: 'select', options: [
              { value: '', label: '— Select —' },
              ...PAYMENT_TERMS.map(t => ({ value: t, label: t })),
            ]},
            { key: 'billingAddress', label: 'Billing address', type: 'textarea' },
            { key: 'invoiceMilestone', label: 'Invoice milestone', type: 'select', options: [
              { value: '', label: '— Select —' },
              ...INVOICE_MILESTONES.map(t => ({ value: t, label: t })),
            ]},
            { key: 'invoiceNumber', label: 'Invoice #', type: 'text' },
            { key: 'invoiceDate', label: 'Invoice date', type: 'date' },
            { key: 'invoiceSent', label: 'Invoice sent', type: 'select', options: [
              { value: '', label: 'No' },
              { value: 'true', label: 'Yes' },
            ]},
            { key: 'invoicePaid', label: 'Invoice paid', type: 'select', options: [
              { value: '', label: 'No' },
              { value: 'true', label: 'Yes' },
            ]},
          ]}
        />
      )}

      {/* Warehouse step modal */}
      {warehouseModal && (
        <Modal
          form={warehouseForm} setForm={setWarehouseForm} save={saveWarehouseStep}
          close={() => { setWarehouseModal(false); setWarehouseForm({}); }}
          title="Advance warehouse step"
          fields={[
            { key: 'step', label: 'Step', type: 'select', options: WAREHOUSE_STEPS.map(s => ({ value: s.key, label: s.label })) },
            ...(warehouseForm.step === 'inspected' ? [{ key: 'inspectionResult', label: 'Inspection result', type: 'select', options: [
              { value: 'Pass', label: 'Pass' },
              { value: 'Fail', label: 'Fail — damage/shortage' },
            ]}] : []),
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ]}
        />
      )}

      {/* Forwarder assignment modal */}
      {forwarderModal && (
        <Modal
          form={forwarderForm} setForm={setForwarderForm} save={saveForwarder}
          close={() => { setForwarderModal(false); setForwarderForm({}); }}
          title="Assign freight forwarder"
          fields={[
            { key: 'forwarderId', label: 'Forwarder', type: 'select', options: [
              { value: '', label: '— None —' },
              ...forwarders.map(f => ({ value: f.id, label: `${f.name}${f.country ? ` (${f.country})` : ''}` })),
            ]},
            { key: 'forwarderRef', label: 'Forwarder reference / file #', type: 'text' },
          ]}
        />
      )}

      {/* Communications modal */}
      {commModal && (
        <Modal
          form={commForm} setForm={setCommForm} save={addComm}
          close={() => { setCommModal(false); setCommForm({}); }}
          title="Log communication"
          fields={[
            { key: 'direction', label: 'Direction', type: 'select', options: [
              { value: 'Outbound', label: 'Outbound (we sent)' },
              { value: 'Inbound', label: 'Inbound (we received)' },
              { value: 'Internal', label: 'Internal note' },
            ]},
            { key: 'channel', label: 'Channel', type: 'select', options: [
              { value: 'Email', label: 'Email' },
              { value: 'Phone', label: 'Phone' },
              { value: 'In-person', label: 'In-person' },
              { value: 'Slack/Teams', label: 'Slack / Teams' },
              { value: 'Other', label: 'Other' },
            ]},
            { key: 'party', label: 'With (party)', type: 'text' },
            { key: 'message', label: 'Message / summary', type: 'textarea' },
          ]}
        />
      )}
    </div>
  );
}

// Routing modal — picks drop-ship vs warehouse, sets domestic/international + Incoterm,
// suggests planned ship date from selected vendor's lead time.
function RouteModal({ order, form, setForm, vendors, save, close }) {
  const [vendorId, setVendorId] = useState('');
  const vendor = vendors.find(v => v.id === vendorId);
  const suggestedPlanned = computePlannedShipDate(order.date, vendor?.leadTimeDays);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Route order</h3>
          <button className="close-btn" onClick={close}>×</button>
        </div>

        <div className="form-group">
          <label>Route</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['drop_ship', 'warehouse'].map(r => (
              <button key={r}
                onClick={() => setForm({ ...form, route: r })}
                className="btn"
                style={{
                  flex: 1, padding: '14px', fontWeight: 600,
                  background: form.route === r ? '#1d4ed8' : '#fff',
                  color: form.route === r ? '#fff' : '#0f172a',
                  borderColor: form.route === r ? '#1d4ed8' : '#e2e8f0',
                }}>
                {ROUTE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>
            <input type="checkbox" checked={!!form.isInternational}
              onChange={e => setForm({ ...form, isInternational: e.target.checked })}
              style={{ marginRight: 6 }} />
            International shipment
          </label>
        </div>

        {form.isInternational && (
          <div className="form-group">
            <label>Incoterm</label>
            <select value={form.incoterm || 'FCA'} onChange={e => setForm({ ...form, incoterm: e.target.value })}>
              {INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Pick a vendor to estimate ship date (optional)</label>
          <select value={vendorId} onChange={e => setVendorId(e.target.value)}>
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name} {v.leadTimeDays ? `(${v.leadTimeDays}d lead)` : ''}</option>)}
          </select>
          {vendor && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Suggested planned ship date based on {vendor.leadTimeDays || 14}d lead: <strong style={{ color: '#1d4ed8' }}>{suggestedPlanned}</strong>
              {' '}<button className="btn" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 6 }} onClick={() => setForm({ ...form, plannedShipDate: suggestedPlanned })}>Use</button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Promise date to customer</label>
          <input type="date" value={form.promiseDate || ''} onChange={e => setForm({ ...form, promiseDate: e.target.value })} />
        </div>

        <div className="form-group">
          <label>Planned ship date</label>
          <input type="date" value={form.plannedShipDate || ''} onChange={e => setForm({ ...form, plannedShipDate: e.target.value })} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!form.route}>Save routing</button>
        </div>
      </div>
    </div>
  );
}
