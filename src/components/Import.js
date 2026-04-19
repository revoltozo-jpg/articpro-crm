import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Shared.css';

const fieldMaps = {
  customers: {
    name: ['company', 'company name', 'customer', 'customer name', 'client', 'client name', 'business', 'account'],
    contact: ['contact', 'contact name', 'contact person', 'primary contact', 'name', 'full name', 'rep'],
    email: ['email', 'email address', 'e-mail', 'mail'],
    phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell'],
    address: ['address', 'street', 'location', 'site address'],
    industry: ['industry', 'sector', 'type', 'business type'],
    units: ['units', 'ac units', 'number of units', 'qty units', 'unit count'],
    status: ['status', 'active', 'account status'],
    notes: ['notes', 'note', 'comments', 'remarks', 'description'],
  },
  orders: {
    customerName: ['customer', 'customer name', 'client', 'company', 'account'],
    product: ['product', 'product name', 'model', 'unit', 'item', 'description', 'equipment'],
    qty: ['qty', 'quantity', 'units', 'count', 'amount'],
    unitPrice: ['unit price', 'price', 'cost', 'unit cost', 'rate', 'sale price'],
    date: ['date', 'order date', 'sale date', 'created', 'po date'],
    status: ['status', 'order status', 'state'],
    notes: ['notes', 'note', 'comments', 'remarks'],
  },
  vendors: {
    name: ['vendor', 'vendor name', 'supplier', 'supplier name', 'company', 'manufacturer'],
    contact: ['contact', 'contact name', 'rep', 'sales rep', 'contact person'],
    email: ['email', 'email address', 'e-mail'],
    phone: ['phone', 'telephone', 'tel', 'mobile'],
    territory: ['territory', 'region', 'area', 'coverage'],
    leadTime: ['lead time', 'lead', 'delivery time', 'turnaround'],
    status: ['status', 'vendor status'],
    notes: ['notes', 'note', 'comments', 'remarks'],
  },
  purchase_orders: {
    vendorName: ['vendor', 'vendor name', 'supplier', 'supplier name'],
    items: ['items', 'description', 'product', 'model', 'equipment', 'unit'],
    total: ['total', 'total cost', 'cost', 'amount', 'price', 'po total'],
    orderDate: ['order date', 'date', 'po date', 'created'],
    expectedDate: ['expected', 'expected date', 'delivery date', 'eta', 'due date'],
    status: ['status', 'po status'],
  },
};

function matchField(header, fieldAliases) {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    if (aliases.some(a => h.includes(a) || a.includes(h))) return field;
  }
  return null;
}

function mapRow(row, headers, fieldMap) {
  const result = {};
  headers.forEach((header, i) => {
    const field = matchField(header, fieldMap);
    if (field && row[i] !== undefined && row[i] !== null && row[i] !== '') {
      result[field] = String(row[i]).trim();
    }
  });
  return result;
}

function detectSheetType(headers) {
  const h = headers.map(x => x.toLowerCase());
  const scores = {
    customers: 0,
    orders: 0,
    vendors: 0,
    purchase_orders: 0,
  };

  if (h.some(x => ['company', 'customer name', 'client', 'account'].some(k => x.includes(k)))) scores.customers += 2;
  if (h.some(x => ['industry', 'ac units', 'site'].some(k => x.includes(k)))) scores.customers += 2;
  if (h.some(x => ['product', 'model', 'unit price', 'sale price', 'order date'].some(k => x.includes(k)))) scores.orders += 2;
  if (h.some(x => ['qty', 'quantity'].some(k => x.includes(k)))) scores.orders += 1;
  if (h.some(x => ['vendor', 'supplier', 'manufacturer', 'lead time', 'territory'].some(k => x.includes(k)))) scores.vendors += 2;
  if (h.some(x => ['po', 'purchase order', 'po total', 'expected date', 'eta'].some(k => x.includes(k)))) scores.purchase_orders += 2;

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

export default function Import({ onClose }) {
  const [step, setStep] = useState('upload');
  const [sheets, setSheets] = useState([]);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [workbook, setWorkbook] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      setWorkbook(wb);
      const sheetInfo = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const headers = data[0] || [];
        const rows = data.slice(1).filter(r => r.some(c => c !== ''));
        const detected = headers.length > 0 ? detectSheetType(headers.map(String)) : 'unknown';
        return { name, headers: headers.map(String), rows, detected, rowCount: rows.length };
      });
      setSheets(sheetInfo);
      const defaultAssignments = {};
      sheetInfo.forEach(s => { defaultAssignments[s.name] = s.detected; });
      setAssignments(defaultAssignments);
      setStep('review');
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const summary = { customers: 0, orders: 0, vendors: 0, purchase_orders: 0, skipped: 0 };

    for (const sheet of sheets) {
      const type = assignments[sheet.name];
      if (type === 'skip' || type === 'unknown') { summary.skipped += sheet.rowCount; continue; }
      const fieldMap = fieldMaps[type];

      for (const row of sheet.rows) {
        const mapped = mapRow(row, sheet.headers, fieldMap);
        if (Object.keys(mapped).length === 0) continue;

        try {
          if (type === 'customers') {
            await addDoc(collection(db, 'customers'), {
              name: mapped.name || '',
              contact: mapped.contact || '',
              email: mapped.email || '',
              phone: mapped.phone || '',
              address: mapped.address || '',
              industry: mapped.industry || '',
              units: Number(mapped.units) || 0,
              status: mapped.status || 'Active',
              notes: mapped.notes || '',
            });
            summary.customers++;
          } else if (type === 'orders') {
            await addDoc(collection(db, 'orders'), {
              customerName: mapped.customerName || '',
              customerId: '',
              product: mapped.product || '',
              qty: Number(mapped.qty) || 1,
              unitPrice: Number(mapped.unitPrice) || 0,
              date: mapped.date || '',
              status: mapped.status || 'Quoted',
              notes: mapped.notes || '',
              vendorPO: '',
            });
            summary.orders++;
          } else if (type === 'vendors') {
            await addDoc(collection(db, 'vendors'), {
              name: mapped.name || '',
              contact: mapped.contact || '',
              email: mapped.email || '',
              phone: mapped.phone || '',
              territory: mapped.territory || '',
              leadTime: mapped.leadTime || '',
              status: mapped.status || 'Active',
              notes: mapped.notes || '',
            });
            summary.vendors++;
          } else if (type === 'purchase_orders') {
            await addDoc(collection(db, 'purchase_orders'), {
              vendorName: mapped.vendorName || '',
              vendorId: '',
              relatedSO: '',
              items: mapped.items || '',
              total: Number(mapped.total) || 0,
              orderDate: mapped.orderDate || '',
              expectedDate: mapped.expectedDate || '',
              status: mapped.status || 'Draft',
            });
            summary.purchase_orders++;
          }
        } catch (err) {
          summary.skipped++;
        }
      }
    }

    setResults(summary);
    setImporting(false);
    setStep('done');
  };

  const typeLabels = {
    customers: 'Customers',
    orders: 'Customer orders',
    vendors: 'Vendors',
    purchase_orders: 'Purchase orders',
    skip: 'Skip this sheet',
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-header">
          <h3>Import from Excel</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {step === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Upload your Excel file (.xlsx or .xls). The importer will automatically detect customers, orders, vendors and purchase orders from your sheets and column names.
            </p>
            <label style={{ display: 'block', border: '2px dashed #e2e8f0', borderRadius: 10, padding: '32px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Click to select your Excel file</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>.xlsx or .xls files supported</div>
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {step === 'review' && (
          <div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
              We found <strong>{sheets.length} sheet{sheets.length > 1 ? 's' : ''}</strong>. Review how each sheet will be imported — you can change the type or skip sheets you don't need.
            </p>
            {sheets.map(sheet => (
              <div key={sheet.name} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{sheet.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{sheet.rowCount} rows • {sheet.headers.length} columns</div>
                  </div>
                  <select
                    value={assignments[sheet.name]}
                    onChange={e => setAssignments({ ...assignments, [sheet.name]: e.target.value })}
                    style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
                  >
                    {Object.entries(typeLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <span style={{ fontWeight: 600 }}>Columns: </span>
                  {sheet.headers.slice(0, 8).join(', ')}{sheet.headers.length > 8 ? ` +${sheet.headers.length - 8} more` : ''}
                </div>
                {sheet.rows.length > 0 && (
                  <div style={{ marginTop: 10, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {sheet.headers.slice(0, 5).map((h, i) => (
                            <th key={i} style={{ textAlign: 'left', padding: '4px 8px', background: '#e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>
                          ))}
                          {sheet.headers.length > 5 && <th style={{ textAlign: 'left', padding: '4px 8px', background: '#e2e8f0', color: '#94a3b8' }}>...</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.slice(0, 2).map((row, i) => (
                          <tr key={i}>
                            {row.slice(0, 5).map((cell, j) => (
                              <td key={j} style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                            ))}
                            {row.length > 5 && <td style={{ padding: '4px 8px', color: '#94a3b8' }}>...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={() => setStep('upload')}>← Back</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import ${sheets.filter(s => assignments[s.name] !== 'skip').reduce((a, s) => a + s.rowCount, 0)} rows`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && results && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Import complete!</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Your data has been imported into the CRM</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Customers imported', val: results.customers, icon: '👥' },
                { label: 'Orders imported', val: results.orders, icon: '📋' },
                { label: 'Vendors imported', val: results.vendors, icon: '🏭' },
                { label: 'POs imported', val: results.purchase_orders, icon: '🚚' },
              ].map(m => (
                <div key={m.label} className="info-box" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>
            {results.skipped > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                ⚠️ {results.skipped} rows were skipped due to missing data or errors.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}