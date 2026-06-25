import { useEffect, useMemo, useState } from 'react';
import { FiMail, FiTrash2, FiBarChart2 } from 'react-icons/fi';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:3000/api';
const socket = io('http://localhost:3000', { transports: ['websocket'] });

const formatDate = (value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

const formatFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

const getSourceLabel = (source) => {
  if (source === 'php_form' || source === 'php') return 'PHP Form';
  if (source === 'n8n') return 'n8n';
  return source || 'n8n';
};

const getScoreBand = (score) => {
  if (score >= 70) return { label: 'Hot', color: 'bg-emerald-100 text-emerald-700' };
  if (score >= 50) return { label: 'Warm', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Cold', color: 'bg-rose-100 text-rose-700' };
};

const normalizeScoreBreakdown = (lead = {}) => {
  const source = lead.score_breakdown || lead.scoreBreakdown || lead.score_details || lead.scoreDetails;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.fromEntries(
      Object.entries(source)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    );
  }

  const reasons = lead.score_reasons || lead.scoreReasons || lead.reasons || [];
  if (Array.isArray(reasons) && reasons.length > 0) {
    return reasons.reduce((acc, item, index) => {
      if (typeof item === 'string') {
        acc[`reason_${index + 1}`] = item;
        return acc;
      }
      if (item && typeof item === 'object') {
        const key = item.label || item.reason || item.name || `reason_${index + 1}`;
        const value = item.score ?? item.value ?? item.points ?? 1;
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  const fallback = lead.score_breakdown_json || lead.scoreBreakdownJson;
  if (typeof fallback === 'string') {
    try {
      const parsed = JSON.parse(fallback);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeScoreBreakdown(parsed);
      }
    } catch {
      // Ignore invalid JSON and fall back to empty breakdown
    }
  }

  return {};
};

const normalizeLead = (lead) => ({
  ...lead,
  _id: lead._id || lead.id,
  name: lead.name || lead.full_name || 'Unnamed Lead',
  title: lead.title || lead.headline || '',
  company: lead.company || lead.organization || '',
  industry: lead.industry || '',
  source: lead.source || 'n8n_apify_scraper',
  source_label: getSourceLabel(lead.source),
  score: Number(lead.score || 0),
  score_breakdown: normalizeScoreBreakdown(lead),
  status: lead.status || 'new',
  company_size: lead.company_size ?? lead.companySize ?? lead.company_size_range ?? lead.companySizeRange ?? lead.company_size_label ?? null,
  funding_status: lead.funding_status ?? lead.fundingStatus ?? lead.funding_status_label ?? lead.fundingStatusLabel ?? null,
  notes: Array.isArray(lead.notes) ? lead.notes : (lead.notes ? [lead.notes] : []),
  created_at: lead.created_at || lead.updated_at || new Date().toISOString()
});

function App() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [filters, setFilters] = useState({ scoreBand: 'all', status: 'all', source: 'all' });
  const [socketConnected, setSocketConnected] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.scoreBand === 'hot') params.set('score_min', '70');
      if (filters.scoreBand === 'warm') { params.set('score_min', '50'); params.set('score_max', '69'); }
      if (filters.scoreBand === 'cold') params.set('score_max', '49');
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.source !== 'all') params.set('source', filters.source === 'php' ? 'php_form' : 'n8n_apify_scraper');

      const response = await fetch(`${API_BASE}/leads?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      const normalized = Array.isArray(data) ? data.map(normalizeLead) : [];
      setLeads(normalized);
      if (!selectedLead && normalized[0]) setSelectedLead(normalizeLead(normalized[0]));
    } catch (error) {
      showToast('Unable to load leads right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [filters.status, filters.scoreBand, filters.source]);

  useEffect(() => {
    const handleConnect = () => {
      setSocketConnected(true);
      fetchLeads();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleConnectionStatus = ({ connected }) => {
      setSocketConnected(connected);
      if (connected) fetchLeads();
    };

    const handleNewLead = (lead) => {
      setLeads((current) => [normalizeLead(lead), ...current]);
      setHighlightedId(lead._id);
      window.setTimeout(() => setHighlightedId(null), 1800);
      showToast(`New lead received: ${lead.name}`);
      if (!selectedLead) setSelectedLead(normalizeLead(lead));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connection_status', handleConnectionStatus);
    socket.on('new_lead', handleNewLead);

    window.addEventListener('online', fetchLeads);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connection_status', handleConnectionStatus);
      socket.off('new_lead', handleNewLead);
      window.removeEventListener('online', fetchLeads);
    };
  }, []);

  const handleStatusUpdate = async (leadId, newStatus) => {
    try {
      const response = await fetch(`${API_BASE}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const updatedLead = await response.json();
      setLeads((current) => current.map((lead) => (lead._id === leadId ? normalizeLead(updatedLead) : lead)));
      if (selectedLead && selectedLead._id === leadId) setSelectedLead(normalizeLead(updatedLead));
      showToast('Status updated.');
    } catch (error) {
      showToast('Could not update status.');
    }
  };

  const handleDelete = async (leadId) => {
    try {
      await fetch(`${API_BASE}/leads/${leadId}`, { method: 'DELETE' });
      setLeads((current) => current.filter((lead) => lead._id !== leadId));
      if (selectedLead && selectedLead._id === leadId) setSelectedLead(null);
      showToast('Lead removed.');
    } catch (error) {
      showToast('Could not remove lead.');
    }
  };

  const handleAddNote = async () => {
    if (!noteDraft.trim() || !selectedLead) return;
    try {
      const response = await fetch(`${API_BASE}/leads/${selectedLead._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft.trim() })
      });
      const updatedLead = await response.json();
      setLeads((current) => current.map((lead) => (lead._id === selectedLead._id ? normalizeLead(updatedLead) : lead)));
      setSelectedLead(normalizeLead(updatedLead));
      setNoteDraft('');
      showToast('Note added.');
    } catch (error) {
      showToast('Could not add note.');
    }
  };

  const stats = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter((lead) => lead.score >= 70).length;
    const warm = leads.filter((lead) => lead.score >= 50 && lead.score < 70).length;
    const cold = leads.filter((lead) => lead.score < 50).length;
    return { total, hot, warm, cold };
  }, [leads]);

  const visibleLeads = leads.filter((lead) => {
    if (!selectedLead && lead._id) setSelectedLead(lead);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(visibleLeads.length / pageSize));
  const pagedLeads = visibleLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.scoreBand, filters.status, filters.source]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <nav className="bg-slate-900 text-white px-6 py-4 shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="text-xl font-semibold">LeadGen</div>
          <div className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {socketConnected ? 'Live connection' : 'Offline'}
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
        <section className="flex-1 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total Leads', value: stats.total, accent: 'from-indigo-600 to-indigo-500' },
              { label: 'Hot Leads', value: stats.hot, accent: 'from-emerald-600 to-emerald-500' },
              { label: 'Warm Leads', value: stats.warm, accent: 'from-amber-500 to-orange-500' },
              { label: 'Cold Leads', value: stats.cold, accent: 'from-rose-500 to-rose-400' }
            ].map((card) => (
              <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className={`mb-3 h-2 w-20 rounded-full bg-gradient-to-r ${card.accent}`} />
                <div className="text-sm text-slate-500">{card.label}</div>
                <div className="mt-2 text-3xl font-semibold">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex flex-wrap gap-3">
              <select className="rounded-lg border border-slate-200 px-3 py-2" value={filters.scoreBand} onChange={(e) => setFilters((cur) => ({ ...cur, scoreBand: e.target.value }))}>
                <option value="all">All Score Ranges</option>
                <option value="hot">Hot 70+</option>
                <option value="warm">Warm 50-69</option>
                <option value="cold">Cold below 50</option>
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2" value={filters.status} onChange={(e) => setFilters((cur) => ({ ...cur, status: e.target.value }))}>
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="rejected">Rejected</option>
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2" value={filters.source} onChange={(e) => setFilters((cur) => ({ ...cur, source: e.target.value }))}>
                <option value="all">All Sources</option>
                <option value="n8n">n8n</option>
                <option value="php">PHP Form</option>
              </select>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : visibleLeads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                No leads match the current filters yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-3 pr-4">Lead</th>
                      <th className="py-3 pr-4">Company</th>
                      <th className="py-3 pr-4">Source</th>
                      <th className="py-3 pr-4">Score</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Created</th>
                      <th className="py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLeads.map((lead) => {
                      const band = getScoreBand(lead.score || 0);
                      return (
                        <tr key={lead._id} className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${highlightedId === lead._id ? 'bg-emerald-50' : ''}`} onClick={() => setSelectedLead(lead)}>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-slate-800">{lead.name}</div>
                            <div className="text-slate-500">{lead.title}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium">{lead.company}</div>
                            <div className="text-slate-500">{lead.industry}</div>
                          </td>
                          <td className="py-3 pr-4 text">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${lead.source === 'n8n_apify_scraper' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>{lead.source_label}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${band.color}`} title={JSON.stringify(lead.score_breakdown || {})}>{lead.score || 0}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" value={lead.status} onClick={(e) => e.stopPropagation()} onChange={(e) => handleStatusUpdate(lead._id, e.target.value)}>
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="py-3 pr-4">{formatDate(lead.created_at)}</td>
                          <td className="py-3">
                            <button className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); handleDelete(lead._id); }}>
                              <FiTrash2 />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {visibleLeads.length > pageSize && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, visibleLeads.length)} of {visibleLeads.length} leads
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                    Previous
                  </button>
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5">{currentPage} / {totalPages}</span>
                  <button className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className={`w-full shrink-0 border-l border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 lg:w-[380px] ${selectedLead ? 'translate-x-0' : 'translate-x-4 opacity-0'}`}>
          {!selectedLead ? (
            <div className="flex h-full items-center justify-center text-slate-500">Select a lead to view details.</div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedLead.name}</h2>
                    <p className="text-sm text-slate-500">{selectedLead.title}</p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-medium ${getScoreBand(selectedLead.score || 0).color}`}>{selectedLead.score || 0}</div>
                </div>
                <div className="mt-4 text-sm text-slate-600">{selectedLead.company} • {selectedLead.industry}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FiMail />
                  <a href={`mailto:${selectedLead.email}`} className="text-indigo-600 no-underline transition hover:text-indigo-700">{selectedLead.email || 'No email listed'}</a>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FiBarChart2 />
                  Score breakdown
                </div>
                <div className="mt-3 space-y-2">
                  {Object.entries(selectedLead.score_breakdown || {}).length > 0 ? (
                    Object.entries(selectedLead.score_breakdown || {}).map(([key, value]) => {
                      const numericValue = Number(value);
                      const width = Number.isFinite(numericValue) ? Math.min(100, numericValue) : 0;
                      return (
                        <div key={key}>
                          <div className="mb-1 flex justify-between text-xs uppercase tracking-wide text-slate-500">
                            <span>{key}</span>
                            <span>{value}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-slate-500">No score breakdown available for this lead yet.</div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <div><span className="font-medium">Company Size:</span> {formatFieldValue(selectedLead.company_size)}</div>
                <div><span className="font-medium">Funding Status:</span> {formatFieldValue(selectedLead.funding_status)}</div>
                <div><span className="font-medium">Industry:</span> {selectedLead.industry || ''}</div>
                <div><span className="font-medium">Source:</span> {selectedLead.source_label}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Status</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={selectedLead.status} onChange={(e) => handleStatusUpdate(selectedLead._id, e.target.value)}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 text-sm font-medium text-slate-700">Notes</div>
                <div className="max-h-40 space-y-2 overflow-auto">
                  {selectedLead.notes?.length ? selectedLead.notes.map((note, index) => (
                    <div key={`${note}-${index}`} className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{note}</div>
                  )) : <div className="text-sm text-slate-500">No notes yet.</div>}
                </div>
                <textarea className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-sm" rows="3" placeholder="Add a note for this lead" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                <button className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white" onClick={handleAddNote}>Add Note</button>
              </div>
            </div>
          )}
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

export default App;
