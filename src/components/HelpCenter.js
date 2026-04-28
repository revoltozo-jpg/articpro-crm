// HelpCenter — built-in user manual with search.
// Opens as a full-screen overlay. Left rail = category nav, right pane =
// rendered article. Search bar filters across all articles in real time and
// shows matching results above the category nav.
//
// Content is intentionally written in plain English for non-technical
// operations users — not jargon-y developer docs. Every flow is described
// step-by-step, matching the labels they see in the UI.

import React, { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// CONTENT
// =============================================================================
// Each article: { id, title, category, body }
// `body` is an array of blocks. A block is one of:
//   { type: 'p', text: '...' }
//   { type: 'h', text: '...' }                 // section heading
//   { type: 'steps', items: ['step 1', ...] }  // numbered list
//   { type: 'bullets', items: ['...', ...] }   // bulleted list
//   { type: 'tip', text: '...' }               // green callout
//   { type: 'warn', text: '...' }              // yellow callout
//   { type: 'code', text: '...' }              // monospace block

const ARTICLES = [
  // -------------------------------- Getting Started --------------------------
  {
    id: 'overview',
    title: 'What this system does',
    category: 'Getting started',
    body: [
      { type: 'p', text: 'This is the Protec operations platform. It replaces the old Matrix spreadsheet with a real system that tracks every sales order from quote to closeout, manages vendor purchase orders and acknowledgments, runs the warehouse workflow, handles international export documents, and surfaces what needs attention right now.' },
      { type: 'h', text: 'The core idea' },
      { type: 'p', text: 'Every customer project lives as a single Sales Order record. That record moves through 7 operational stages. At each stage, the system shows you what is needed next, what is blocked, and what dates are at risk.' },
      { type: 'h', text: 'The 7 stages' },
      { type: 'steps', items: [
        'Sales Handoff — the project arrives with customer PO, submittals, equipment scope, contacts, and notes.',
        'Operations Review — Operations validates the order against the quote and submittals.',
        'Internal Tracking — the order is set up internally with contract # and billing.',
        'Vendor PO — purchase orders are issued to vendors.',
        'Vendor Ack — vendors acknowledge with commit dates and any discrepancies.',
        'Shipment — material ships (Drop Ship from vendor or via warehouse).',
        'Delivered — confirmed at the customer site, then closed out.',
      ]},
      { type: 'tip', text: 'You will see a stage rail at the top of every order detail page. The active stage is blue, completed stages are green checkmarks, and a red exclamation means the order is blocked at that stage.' },
    ],
  },
  {
    id: 'roles',
    title: 'User roles and permissions',
    category: 'Getting started',
    body: [
      { type: 'p', text: 'Each user has a role that controls what they can see and do.' },
      { type: 'h', text: 'The four roles' },
      { type: 'bullets', items: [
        'Viewer — can see records but cannot create, edit, or delete anything.',
        'Sales — can create and edit customers, quotes, and orders. Cannot see costs or vendor financials.',
        'Manager — full edit, sees all financials, can view reports.',
        'Admin — full access including user management, deletes, and Excel import.',
      ]},
      { type: 'p', text: 'Your current role appears in the bottom-left corner of the sidebar next to your email address.' },
      { type: 'tip', text: 'Only Admins can create new user accounts. Go to Admin → User management.' },
    ],
  },
  {
    id: 'navigation',
    title: 'Finding your way around',
    category: 'Getting started',
    body: [
      { type: 'p', text: 'The sidebar on the left has every screen, grouped by area:' },
      { type: 'bullets', items: [
        'Overview — Dashboard and Reports (legacy).',
        'Sales — Customers and the legacy Customer orders.',
        'Procurement — Vendors and legacy Purchase orders.',
        'Operations (v2) — the new operations platform: Operations dashboard, Sales orders, Scheduler, Vendor POs, Shipments, Inventory, Forwarders, Reports (v2).',
        'Admin — User management (admins only).',
      ]},
      { type: 'p', text: 'For the new operations workflow, only the Operations (v2) section matters. The legacy items above are kept temporarily so existing data is still accessible while the team migrates.' },
      { type: 'h', text: 'The notification bell' },
      { type: 'p', text: 'In the bottom-left of the sidebar, next to your email, you will see a small bell icon. It auto-refreshes every 60 seconds and shows a colored badge when something needs attention. Click it to see the list and jump straight to the relevant order or PO.' },
    ],
  },

  // -------------------------------- Sales Orders -----------------------------
  {
    id: 'create-quote',
    title: 'Creating a quote',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'Every project starts as a Quote. Even if you already have the customer PO in hand, the system creates the record at the Quote stage and you progress it from there.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'Sidebar → Operations (v2) → Sales orders.',
        'Click the "+ New quote" button in the top-right.',
        'Pick the Customer from the dropdown. (If they are not in the list, create them in Customers first.)',
        'Fill in Product / model, Quantity, Unit price, Quote date.',
        'Pick a Vendor in the "Vendor (for est. delivery)" field — the system will calculate an estimated delivery date based on that vendor\'s lead time + a 7-day buffer.',
        'Optionally fill in: Promise date to customer, Quote reference, Project contacts, Special notes.',
        'Click Save.',
      ]},
      { type: 'tip', text: 'If you set the vendor for est. delivery, when you open the quote you will see a big purple banner with the calculated delivery date. Use that as the date you promise the customer.' },
      { type: 'h', text: 'What happens after saving' },
      { type: 'p', text: 'The quote appears in the Sales orders list under the "Quotes" tab. Status is Quote. The order detail page shows a red banner saying "Awaiting customer PO" — that means until the customer\'s PO arrives, this order cannot be routed or have a vendor PO issued against it.' },
    ],
  },
  {
    id: 'gates',
    title: 'The PO and submittals gates',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'Two things must happen before an order can move forward: the customer must send their PO, and submittals must be approved.' },
      { type: 'h', text: 'Mark customer PO received' },
      { type: 'steps', items: [
        'Open the order. You will see two yellow gate cards — "PO not yet received" and "Submittals pending".',
        'If you have the customer PO number, click Edit (top right) and fill in Customer PO #.',
        'Click "Mark received" on the PO gate card. The card turns green.',
      ]},
      { type: 'h', text: 'Mark submittals approved' },
      { type: 'steps', items: [
        'Click "Mark approved" on the Submittals gate card.',
        'The card turns green and the order status changes to Confirmed.',
      ]},
      { type: 'tip', text: 'Shortcut: if you upload a Customer PO link in the Documents card, the PO gate auto-flips to green. You do not need to click "Mark received" separately.' },
      { type: 'warn', text: 'Until both gates are green, the "Route order" button stays disabled. This is intentional — it enforces the operational rule that we do not commit to vendors until the customer is committed.' },
    ],
  },
  {
    id: 'validation',
    title: 'Operations validation checklist',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'After the gates are green, Operations runs a validation pass to confirm the order matches the quote and submittals before committing to vendors.' },
      { type: 'h', text: 'The five checks' },
      { type: 'bullets', items: [
        'Model numbers confirmed against quote',
        'Quantities confirmed',
        'Accessories / options listed',
        'Split / phased / deadline notes captured',
        'Domestic vs international identified',
      ]},
      { type: 'p', text: 'Tick each box on the Operations validation card as you confirm it. When all five are checked, the card turns green and shows "Complete". Until then, the Route order button stays disabled.' },
      { type: 'tip', text: 'If accessories or options were promised, make sure they are listed in the Accessories field (Edit button → Accessories / options). This is often where order errors come from.' },
    ],
  },
  {
    id: 'routing',
    title: 'Routing: Drop Ship vs Warehouse',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'Once gates and validation are complete, you decide how the material gets to the customer.' },
      { type: 'h', text: 'Drop Ship' },
      { type: 'p', text: 'Material ships directly from the vendor to the customer or jobsite. Faster, less handling. Use for: standard equipment, customer is local to vendor, no inspection required.' },
      { type: 'h', text: 'Warehouse' },
      { type: 'p', text: 'Material comes to Protec warehouse first, gets received and inspected, then ships out to the customer. Use for: international consolidation, items that need inspection or staging, multi-vendor projects that ship together.' },
      { type: 'h', text: 'How to route' },
      { type: 'steps', items: [
        'On the order detail page, find the Routing card (right side).',
        'Click Route order.',
        'Choose Drop Ship or Warehouse.',
        'If international, check "International shipment" and pick Incoterm (FCA, CIF, or EXW).',
        'Pick a vendor in the dropdown to get a suggested planned ship date based on their lead time. Click "Use" to accept the suggestion.',
        'Confirm the Promise date to customer.',
        'Click Save routing.',
      ]},
      { type: 'p', text: 'The order status changes to Scheduled. New cards appear: Shipment plan, Warehouse workflow (if warehouse-routed), Freight forwarder + Export documents (if international).' },
    ],
  },
  {
    id: 'shipment-plan',
    title: 'Shipment plan: split and phased shipments',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'A shipment plan is a list of shipment lines. For a simple order, add one line. For phased deliveries, multi-vendor projects, or partial shipments, add multiple lines.' },
      { type: 'h', text: 'Adding a shipment line' },
      { type: 'steps', items: [
        'On the order detail, find the Shipment plan card.',
        'Click "+ Add shipment line".',
        'Label it (e.g. "Phase 1 — Units 1-2", "Backorder", "Pumps only").',
        'Quantity for this specific line.',
        'Planned ship date.',
        'Status: Planned, In Transit, Delivered, or Backorder.',
        'Optionally link a vendor PO, carrier, tracking #, and actual ship date.',
      ]},
      { type: 'h', text: 'How status rolls up to the order' },
      { type: 'bullets', items: [
        'If any line is In Transit → order status becomes In Transit.',
        'If all lines are Delivered → order status becomes Delivered automatically.',
        'Backorder lines flag the order in the dashboard\'s "Needs attention" feed.',
      ]},
      { type: 'tip', text: 'For a single-shipment order, just add one line. The system does not require you to use multiple lines — they are there when you need them.' },
    ],
  },
  {
    id: 'communications',
    title: 'Logging communications',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'Every conversation with the customer, vendor, forwarder, or warehouse should be logged on the order. This is what replaces digging through email threads to find "what did we say last Thursday?".' },
      { type: 'h', text: 'How to log' },
      { type: 'steps', items: [
        'On the order detail, scroll to the Communications card.',
        'Click "+ Log communication".',
        'Direction: Outbound (we sent), Inbound (we received), or Internal note.',
        'Channel: Email, Phone, In-person, Slack/Teams, or Other.',
        'With (party): who you spoke with.',
        'Message / summary: what was said.',
        'Save.',
      ]},
      { type: 'tip', text: 'You do not need to write a transcript. A 1-2 sentence summary is enough — "Confirmed pickup completed by FedEx this morning, BOL attached." Future you (or a teammate) can scan the log in seconds.' },
    ],
  },
  {
    id: 'issues',
    title: 'Logging and resolving issues',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'When something goes wrong — shortage, damage, late shipment, missing documents, wrong material — log it as an issue. The order becomes flagged and shows up in the dashboard alerts.' },
      { type: 'h', text: 'Logging an issue' },
      { type: 'steps', items: [
        'Scroll to the Issues card.',
        'Click "+ Log issue".',
        'Type: Shortage, Damage, Missing documents, Late shipment, Wrong material, or Other.',
        'Coordinating with: Vendor, Warehouse, Forwarder/Carrier, Customer, or Internal.',
        'Description and Revised plan / next steps.',
        'Save.',
      ]},
      { type: 'p', text: 'The order status changes to "Issue" and a red banner appears at the top.' },
      { type: 'h', text: 'Resolving' },
      { type: 'p', text: 'When the issue is solved, click Resolve next to the issue row. If there are no other open issues, the order goes back to its previous status (In Transit or Delivered).' },
    ],
  },
  {
    id: 'documents',
    title: 'Attaching documents',
    category: 'Sales orders',
    body: [
      { type: 'p', text: 'The Documents card on every order is where you link to all the files for that project — customer PO, submittals, drawings, test reports, anything.' },
      { type: 'h', text: 'How it works' },
      { type: 'p', text: 'You paste a link to the document — it can live in Google Drive, Dropbox, OneDrive, SharePoint, email, or anywhere else your team already stores files. The system does not host the file itself, just the reference.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'Scroll to the Documents card.',
        'Click "+ Customer PO link", "+ Submittal link", or "+ Document link" depending on category.',
        'Document name (e.g. "PO 12345 from TEST COMPANY").',
        'Paste the URL.',
        'Optional notes.',
        'Save.',
      ]},
      { type: 'tip', text: 'Customer POs uploaded this way auto-flip the PO Received gate to green. One less click.' },
      { type: 'p', text: 'The system detects what kind of link it is (Drive, Dropbox, PDF, etc.) and shows the appropriate icon. Click the document name to open it in a new tab.' },
    ],
  },

  // -------------------------------- Procurement ------------------------------
  {
    id: 'issue-vendor-po',
    title: 'Issuing a vendor PO',
    category: 'Procurement',
    body: [
      { type: 'p', text: 'Once an order is routed (or earlier if the route does not affect procurement), Operations issues a vendor PO. An order can have multiple POs to different vendors.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'On the order detail, find the Procurement card (right side).',
        'Click "+ Issue vendor PO". (If a PO already exists, it shows "+ Add another PO".)',
        'Vendor — pick from dropdown.',
        'Items / description.',
        'Total cost.',
        'Order date and Expected delivery date.',
        'Leave PO status as Draft.',
        'Save.',
      ]},
      { type: 'h', text: 'After saving' },
      { type: 'p', text: 'You land on the Vendor POs list. Click your new PO to open its detail page. The order it was issued against now shows "In Procurement" status. The PO starts in Draft status with vendor acknowledgment Pending.' },
    ],
  },
  {
    id: 'vendor-ack',
    title: 'Recording vendor acknowledgment',
    category: 'Procurement',
    body: [
      { type: 'p', text: 'When the vendor acknowledges your PO — either confirming the order or flagging a discrepancy — record it. This captures the vendor commit date that drives the rest of your timeline.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'Open the vendor PO from Vendor POs.',
        'Click "Record vendor ack" (top right).',
        'Ack status: Acknowledged or Discrepancy.',
        'Ack date: when they acknowledged.',
        'Vendor commit date: the date they committed to ship by.',
        'Notes: free text — capture pricing changes, lead time changes, exclusions, or any discrepancy details.',
        'Save.',
      ]},
      { type: 'p', text: 'The PO status auto-advances from Draft to Ordered. The Acknowledged badge (green) appears next to the PO ID.' },
      { type: 'h', text: 'Discrepancies' },
      { type: 'p', text: 'If the vendor flags a discrepancy (price changed, lead time pushed, model substitution, exclusions), pick Discrepancy as the ack status and document it in Notes. The PO will show a red Discrepancy badge and appear in the dashboard\'s Needs attention feed until resolved.' },
    ],
  },
  {
    id: 'esd-history',
    title: 'Tracking ESD changes',
    category: 'Procurement',
    body: [
      { type: 'p', text: 'When the vendor moves the commit date, the system records the change in a Lead time / ESD history table on the PO. Every change is timestamped with the previous date, the new date, and how many days it slipped.' },
      { type: 'h', text: 'How changes get logged' },
      { type: 'bullets', items: [
        'Automatic: when you record a vendor ack with a different commit date, the change is logged with source "Vendor ack".',
        'Automatic: when you Edit the PO and change the commit date or expected date, it is logged with source "Manual edit".',
      ]},
      { type: 'p', text: 'You can see the full history on the PO detail page in the "Lead time / ESD changes" section. The Slip column shows positive numbers in red (vendor pushed later) or negative in green (vendor pulled earlier).' },
      { type: 'tip', text: 'Use this history during vendor performance reviews. Repeated slips on a single vendor are a signal worth talking to them about.' },
    ],
  },
  {
    id: 'vendor-lead-times',
    title: 'Setting vendor lead times',
    category: 'Procurement',
    body: [
      { type: 'p', text: 'The Scheduler and the Quote EDD calculation both use the vendor\'s lead time in days. Without it, the system defaults to 14 days, which is rarely accurate.' },
      { type: 'h', text: 'Setting it' },
      { type: 'steps', items: [
        'Sidebar → Vendors.',
        'Open the vendor, click Edit.',
        'Fill in "Lead time (days, used by Scheduler)" — a number, e.g. 21.',
        'Save.',
      ]},
      { type: 'tip', text: 'For your top 10 vendors, take 5 minutes to fill in accurate lead times. The improvement to Scheduler suggestions and quote EDDs is immediate and dramatic.' },
    ],
  },

  // -------------------------------- Warehouse --------------------------------
  {
    id: 'warehouse-flow',
    title: 'Warehouse workflow',
    category: 'Warehouse',
    body: [
      { type: 'p', text: 'When an order is routed Warehouse, a Warehouse workflow card appears on the order detail. It walks the material through 6 steps.' },
      { type: 'h', text: 'The 6 steps' },
      { type: 'bullets', items: [
        'Awaiting receipt — material has been ordered, not yet at warehouse.',
        'Received — material arrived at warehouse.',
        'Inspected — visual inspection passed (or failed with notes).',
        'Staged — staged for outbound delivery.',
        'Out for delivery — material left warehouse for customer.',
        'Delivered — confirmed at customer site.',
      ]},
      { type: 'h', text: 'Advancing the steps' },
      { type: 'steps', items: [
        'Click "Advance step" on the Warehouse workflow card.',
        'Pick the next step from the dropdown.',
        'For Inspected: pick Pass or Fail. If Fail, fill in notes about damage or shortage.',
        'Optional notes.',
        'Save.',
      ]},
      { type: 'p', text: 'The warehouse rail at the top of the card progresses with each step. Reaching "Staged" auto-flips the order to In Transit. Reaching "Delivered" auto-flips to Delivered with today\'s date as actual delivery.' },
    ],
  },

  // -------------------------------- International ----------------------------
  {
    id: 'forwarders',
    title: 'Freight forwarders',
    category: 'International',
    body: [
      { type: 'p', text: 'For international shipments, you assign a freight forwarder per order. Forwarders are stored as records in the Forwarders module.' },
      { type: 'h', text: 'Adding a forwarder' },
      { type: 'steps', items: [
        'Sidebar → Operations (v2) → Forwarders.',
        'Click "+ New forwarder".',
        'Fill in name, contact, email, phone, country/region, address, default Incoterm.',
        'Save.',
      ]},
      { type: 'h', text: 'Assigning a forwarder to an order' },
      { type: 'steps', items: [
        'Open the international order.',
        'In the Freight forwarder card, click Assign (or Change).',
        'Pick the forwarder.',
        'Optionally enter a forwarder reference / file number.',
        'Save.',
      ]},
    ],
  },
  {
    id: 'incoterms',
    title: 'Understanding Incoterms (FCA, CIF, EXW)',
    category: 'International',
    body: [
      { type: 'p', text: 'When you flag an order as international, you must pick an Incoterm. The Incoterm defines who is responsible for what at each point in the shipment.' },
      { type: 'bullets', items: [
        'FCA (Free Carrier) — Protec delivers to the freight forwarder in Miami. Once delivered to the forwarder, the handoff is complete and the customer takes responsibility for international transport. This is the most common term Protec uses.',
        'CIF (Cost, Insurance, Freight) — Protec coordinates freight and insurance through the destination port. More responsibility on Protec, used when the customer wants us to handle international logistics.',
        'EXW (Ex Works) — customer picks up from Protec\'s location. Protec just notifies them when goods are ready.',
      ]},
      { type: 'tip', text: 'The fulfillment guidance section on the order detail page reminds you what each Incoterm means in plain English so you do not have to memorize it.' },
    ],
  },
  {
    id: 'export-docs',
    title: 'Export documents',
    category: 'International',
    body: [
      { type: 'p', text: 'For every international order, Protec must coordinate or prepare a set of export documents. The system provides a checklist on each international order.' },
      { type: 'h', text: 'The 6 standard documents' },
      { type: 'bullets', items: [
        'Commercial invoice',
        'Packing list',
        'Certificate of origin',
        'Bill of lading / AWB',
        'Export declaration (EEI)',
        'Insurance certificate',
      ]},
      { type: 'p', text: 'Tick each box as the document is received or prepared. When all six are checked, the badge changes from "Pending" to "Complete".' },
      { type: 'tip', text: 'You can attach the actual documents in the Documents card by category "Other" — that gives you the checklist plus the actual files in one order view.' },
    ],
  },

  // -------------------------------- Inventory --------------------------------
  {
    id: 'inventory-overview',
    title: 'How inventory works',
    category: 'Inventory',
    body: [
      { type: 'p', text: 'The Inventory module tracks SKUs you keep in the Protec warehouse. For each SKU, it shows on-hand, reserved, available, and incoming quantities.' },
      { type: 'h', text: 'The math' },
      { type: 'code', text: 'On hand: what you actually have in the warehouse right now\nReserved: total qty across open warehouse-routed orders matching this SKU\nAvailable: On hand − Reserved\nIncoming: total qty across open POs matching this SKU' },
      { type: 'p', text: 'Reserved and Incoming are computed automatically by matching the SKU code or item name against active orders and POs. You do not maintain those numbers manually — only On hand.' },
      { type: 'h', text: 'Stock status' },
      { type: 'bullets', items: [
        'OK — available is above the minimum threshold.',
        'LOW — available is below the minimum threshold (set Min stock when creating the SKU).',
        'OUT — available is zero.',
      ]},
    ],
  },
  {
    id: 'stock-adjustments',
    title: 'Adjusting stock levels',
    category: 'Inventory',
    body: [
      { type: 'p', text: 'When a physical count differs from the system, or when you receive/ship/discard stock outside the order flow, record an adjustment. Every adjustment is logged with reason, before/after, user, and timestamp.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'Sidebar → Inventory.',
        'Click into the SKU.',
        'Click "Adjust stock" (top right).',
        'Quantity change (positive to add, negative to remove).',
        'Reason: Cycle count, Received from vendor, Shipped to customer, Damage / write-off, Manual correction, or Other.',
        'Notes (optional but recommended).',
        'Save.',
      ]},
      { type: 'p', text: 'The new on-hand quantity is calculated immediately. The full audit trail shows up in the Adjustment history table on the SKU detail page.' },
      { type: 'warn', text: 'Never edit the on-hand number directly via Edit — always use Adjust stock. Direct edits skip the audit trail.' },
    ],
  },

  // -------------------------------- Operations -------------------------------
  {
    id: 'operations-dashboard',
    title: 'The Operations Dashboard',
    category: 'Operations',
    body: [
      { type: 'p', text: 'This is the screen Operations should open at the start of every day. It replaces "the Matrix" — instead of scanning rows of a spreadsheet, you see KPIs, actionable alerts, upcoming deliveries, and vendor health.' },
      { type: 'h', text: 'KPI strip (top)' },
      { type: 'p', text: '10 cells across two rows: awaiting customer PO, awaiting submittals, awaiting validation, in procurement, in transit, shipping this week, delivered this month, on-time delivery %, late vendor POs, and open issues + backorders combined.' },
      { type: 'h', text: 'Needs attention feed' },
      { type: 'p', text: 'A live list of items requiring action right now: late vendor POs, vendor acks overdue (5+ days since order), discrepancies, blocked orders, backorders. Sorted by severity. Click any row to jump to the relevant PO or order.' },
      { type: 'h', text: 'Upcoming deliveries' },
      { type: 'p', text: 'Next 14 days. Today\'s deliveries are red, next-2-days are amber, beyond is normal. Click any row to open the order.' },
      { type: 'h', text: 'Vendor PO health' },
      { type: 'p', text: 'Per-vendor scorecard showing only vendors with active issues — late count, awaiting-ack count, discrepancy count.' },
      { type: 'h', text: 'Recent activity' },
      { type: 'p', text: 'The last 15 events across all orders — every status change, PO issued, vendor ack, shipment, etc. Each row is click-through to the order.' },
    ],
  },
  {
    id: 'scheduler',
    title: 'Using the Scheduler',
    category: 'Operations',
    body: [
      { type: 'p', text: 'The Scheduler shows orders that are confirmed but not yet routed. For each one, you pick a route (Drop Ship or Warehouse) and a vendor. The system suggests a planned ship date based on the vendor\'s lead time.' },
      { type: 'h', text: 'Workflow' },
      { type: 'steps', items: [
        'Sidebar → Scheduler.',
        'In the "Ready to route" table, find the order.',
        'Pick a route in the Route dropdown.',
        'Pick a vendor in the Vendor dropdown — the Planned ship column updates automatically with the suggested date and shows whether you have buffer or are already late vs the customer promise.',
        'Click "Route" to commit.',
      ]},
      { type: 'h', text: 'The Blocked queue' },
      { type: 'p', text: 'The lower table on the Scheduler shows orders that should be routable but are blocked by missing PO, missing submittals approval, or incomplete validation. Each column shows ✓ or ✗. Click into the order to resolve the blocker.' },
    ],
  },
  {
    id: 'shipments-page',
    title: 'The Shipments page',
    category: 'Operations',
    body: [
      { type: 'p', text: 'A master list of every shipment line across every order, plus PO-level tracking when no shipment line was created. Use this when you want to see all in-flight shipments without opening each order.' },
      { type: 'h', text: 'Filters' },
      { type: 'p', text: 'Top of page: search by tracking number, customer, or label. Filter by status (Planned / In Transit / Delivered / Backorder), carrier, and route.' },
      { type: 'h', text: 'Late shipments' },
      { type: 'p', text: 'Any shipment whose planned date has passed without a delivery is flagged as Late in red, with the days-late count below the date.' },
    ],
  },
  {
    id: 'reports-v2',
    title: 'Reports (v2)',
    category: 'Operations',
    body: [
      { type: 'p', text: 'Four operational reports across tabs.' },
      { type: 'h', text: 'Vendor performance' },
      { type: 'p', text: 'Per-vendor: total POs, completed POs, on-time %, average slip in days, late now, awaiting ack, discrepancies, lead time. The on-time % is calculated from completed POs where vendor commit date and ship date are both set.' },
      { type: 'h', text: 'Customer on-time' },
      { type: 'p', text: 'Per-customer: total orders, delivered orders, on-time %, currently open orders, lifetime value (Manager+ only).' },
      { type: 'h', text: 'Pipeline' },
      { type: 'p', text: 'Open commitments bucketed by week with a workload bar. Lets you spot crunch weeks before they arrive.' },
      { type: 'h', text: 'Inventory snapshot' },
      { type: 'p', text: 'Total SKUs, low/out of stock counts, total inventory value, and a per-SKU table.' },
    ],
  },

  // -------------------------------- Bell + Alerts ----------------------------
  {
    id: 'bell',
    title: 'The notification bell',
    category: 'Alerts',
    body: [
      { type: 'p', text: 'In the bottom-left of the sidebar, next to your email, the bell icon shows a real-time count of items needing attention.' },
      { type: 'h', text: 'What the colors mean' },
      { type: 'bullets', items: [
        'Red dot — at least one high-severity alert (late vendor, discrepancy, promise at risk, open issue).',
        'Amber dot — only medium-severity alerts (vendor ack overdue, blocked order, backorder).',
        'No dot — everything is clear.',
      ]},
      { type: 'h', text: 'Using it' },
      { type: 'p', text: 'Click the bell to open the popover. It shows up to 30 alerts, sorted by severity. Click any alert to jump straight to the relevant order or PO. The bell auto-refreshes every 60 seconds.' },
      { type: 'tip', text: 'The "Needs attention" feed on the Operations Dashboard shows the same alerts plus more context. The bell is for at-a-glance, the dashboard is for focused work.' },
    ],
  },

  // -------------------------------- Importing --------------------------------
  {
    id: 'matrix-import',
    title: 'Importing the Matrix from Excel',
    category: 'Data',
    body: [
      { type: 'p', text: 'The Excel importer (Admin only) reads your existing Matrix spreadsheet and creates Sales Orders with all operational fields populated.' },
      { type: 'h', text: 'Steps' },
      { type: 'steps', items: [
        'Click "Import from Excel" in the bottom-left of the sidebar.',
        'Pick your Matrix .xlsx file.',
        'The importer scans each sheet and detects what type of data it contains. Matrix-style sheets (with columns like PO #, submittals, promise date, ESD, route, etc.) are auto-detected as "Matrix → Sales orders (v2)".',
        'Review each sheet — you can change the type or skip sheets you do not need.',
        'Click Import. The summary at the end shows how many rows were imported per type.',
      ]},
      { type: 'h', text: 'Field mapping' },
      { type: 'p', text: 'The importer recognizes common column names: Customer, PO, Submittals, Promise, ESD, Route, Incoterm, Payment terms, Invoice, etc. Boolean-style columns accept yes/y/true/x/1/complete/received/approved as "true" values.' },
      { type: 'tip', text: 'Imported rows are flagged with importedFromMatrix: true so you can find them later. They land in Confirmed status (or Delivered if a delivery date is in the row).' },
      { type: 'warn', text: 'The importer creates new records — it does not update existing ones. Run it on a clean import scenario, not on a system that already has overlapping data.' },
    ],
  },
  {
    id: 'excel-other',
    title: 'Importing customers, vendors, POs',
    category: 'Data',
    body: [
      { type: 'p', text: 'The same Import from Excel flow handles standard imports of customers, vendors, customer orders, and purchase orders. The importer auto-detects sheet type from headers but you can override.' },
      { type: 'h', text: 'Recognized columns' },
      { type: 'bullets', items: [
        'Customers: Company / Customer name, Contact, Email, Phone, Address, Industry, AC units, Status, Notes.',
        'Vendors: Vendor / Supplier name, Contact, Email, Phone, Territory, Lead time, Status, Notes.',
        'Customer orders: Customer, Product / Model, Qty, Unit price, Order date, Status, Notes.',
        'Purchase orders: Vendor, Items, Total, Order date, Expected delivery, Status.',
      ]},
    ],
  },
];

const CATEGORIES = [
  'Getting started',
  'Sales orders',
  'Procurement',
  'Warehouse',
  'International',
  'Inventory',
  'Operations',
  'Alerts',
  'Data',
];

// =============================================================================
// SEARCH
// =============================================================================
function flattenForSearch(article) {
  const parts = [article.title, article.category];
  for (const b of article.body) {
    if (b.text) parts.push(b.text);
    if (Array.isArray(b.items)) parts.push(b.items.join(' '));
  }
  return parts.join(' ').toLowerCase();
}

const SEARCH_INDEX = ARTICLES.map(a => ({ article: a, haystack: flattenForSearch(a) }));

function searchArticles(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const tokens = needle.split(/\s+/).filter(Boolean);
  return SEARCH_INDEX
    .map(({ article, haystack }) => {
      let score = 0;
      let matched = true;
      for (const t of tokens) {
        const hits = (haystack.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (hits === 0) { matched = false; break; }
        score += hits;
        if (article.title.toLowerCase().includes(t)) score += 10;
      }
      return matched ? { article, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(r => r.article);
}

// Highlight occurrences of q (case-insensitive) within text. Returns React nodes.
function highlight(text, q) {
  if (!q) return text;
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;
  const pattern = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = String(text).split(pattern);
  return parts.map((p, i) =>
    pattern.test(p)
      ? <mark key={i} style={{ background: '#fde68a', color: '#0f172a', padding: '0 2px', borderRadius: 2 }}>{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

// =============================================================================
// RENDERING
// =============================================================================
function ArticleBody({ article, query }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {article.category}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 18px' }}>
        {highlight(article.title, query)}
      </h1>
      {article.body.map((b, i) => {
        if (b.type === 'p')
          return <p key={i} style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, margin: '0 0 14px' }}>{highlight(b.text, query)}</p>;
        if (b.type === 'h')
          return <h2 key={i} style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '20px 0 10px' }}>{highlight(b.text, query)}</h2>;
        if (b.type === 'steps')
          return (
            <ol key={i} style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, paddingLeft: 22, margin: '0 0 14px' }}>
              {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{highlight(it, query)}</li>)}
            </ol>
          );
        if (b.type === 'bullets')
          return (
            <ul key={i} style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, paddingLeft: 22, margin: '0 0 14px' }}>
              {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{highlight(it, query)}</li>)}
            </ul>
          );
        if (b.type === 'tip')
          return (
            <div key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', margin: '0 0 14px', display: 'flex', gap: 10 }}>
              <div style={{ fontSize: 16, color: '#15803d' }}>💡</div>
              <div style={{ fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>{highlight(b.text, query)}</div>
            </div>
          );
        if (b.type === 'warn')
          return (
            <div key={i} style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', margin: '0 0 14px', display: 'flex', gap: 10 }}>
              <div style={{ fontSize: 16, color: '#b45309' }}>⚠️</div>
              <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{highlight(b.text, query)}</div>
            </div>
          );
        if (b.type === 'code')
          return (
            <pre key={i} style={{
              background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: 14,
              fontSize: 12, fontFamily: 'ui-monospace, SF Mono, Monaco, Consolas, monospace',
              overflow: 'auto', margin: '0 0 14px', whiteSpace: 'pre-wrap',
            }}>{b.text}</pre>
          );
        return null;
      })}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function HelpCenter({ onClose }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(ARTICLES[0].id);
  const searchRef = useRef(null);

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // Esc closes
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const searchResults = useMemo(() => searchArticles(query), [query]);
  const showingSearch = query.trim().length > 0;

  // Active article: if searching and there's a match, prefer top result; else use activeId.
  const active = useMemo(() => {
    if (showingSearch && searchResults.length > 0) {
      // If activeId is in results, keep it; otherwise jump to top result.
      const inResults = searchResults.find(a => a.id === activeId);
      return inResults || searchResults[0];
    }
    return ARTICLES.find(a => a.id === activeId) || ARTICLES[0];
  }, [showingSearch, searchResults, activeId]);

  const articlesByCategory = useMemo(() => {
    const out = {};
    for (const cat of CATEGORIES) out[cat] = [];
    for (const a of ARTICLES) (out[a.category] || (out[a.category] = [])).push(a);
    return out;
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 41, 0.55)',
      zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 1100, height: '100%', maxHeight: 760,
        background: '#fff', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header with search */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Help Center</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>Learn how to use the system</div>
          </div>
          <div style={{ flex: 1, position: 'relative', maxWidth: 460, marginLeft: 16 }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search the manual… (e.g. 'route order', 'vendor ack', 'incoterm')"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 36px',
                border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, fontFamily: 'inherit',
                background: '#f8fafc', color: '#0f172a', outline: 'none',
              }}
              onFocus={e => e.target.style.background = '#fff'}
              onBlur={e => e.target.style.background = '#f8fafc'}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14,
            }}>
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#64748b', padding: 8,
          }} title="Close (Esc)">×</button>
        </div>

        {/* Body — left rail + article */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left rail */}
          <div style={{
            width: 260, borderRight: '1px solid #e2e8f0',
            overflowY: 'auto', background: '#f8fafc',
          }}>
            {showingSearch ? (
              <div style={{ padding: '12px 0' }}>
                <div style={{ padding: '6px 16px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
                </div>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '20px 16px', fontSize: 12, color: '#94a3b8' }}>
                    No matches. Try different keywords.
                  </div>
                ) : searchResults.map(a => (
                  <div key={a.id}
                    onClick={() => setActiveId(a.id)}
                    style={{
                      padding: '8px 16px', cursor: 'pointer',
                      borderLeft: a.id === active.id ? '3px solid #1d4ed8' : '3px solid transparent',
                      background: a.id === active.id ? '#eef2ff' : 'transparent',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>
                      {highlight(a.title, query)}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                      {a.category}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              CATEGORIES.map(cat => {
                const items = articlesByCategory[cat] || [];
                if (items.length === 0) return null;
                return (
                  <div key={cat} style={{ paddingTop: 10 }}>
                    <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {cat}
                    </div>
                    {items.map(a => (
                      <div key={a.id}
                        onClick={() => setActiveId(a.id)}
                        style={{
                          padding: '7px 16px', cursor: 'pointer', fontSize: 13,
                          color: a.id === active.id ? '#1d4ed8' : '#334155',
                          fontWeight: a.id === active.id ? 600 : 400,
                          borderLeft: a.id === active.id ? '3px solid #1d4ed8' : '3px solid transparent',
                          background: a.id === active.id ? '#eef2ff' : 'transparent',
                        }}>
                        {a.title}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Article pane */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
            <ArticleBody article={active} query={query} />
            <div style={{ marginTop: 30, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
              Did this help? If you found something missing or confusing, let your admin know.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
