// Built app served by the backend: same origin. `npm run dev`: backend on port 4000. Override with VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
const KEY = 'claimready_token';

// sessionStorage: signing out happens when the tab closes (good for shared clinic computers).
export const token = {
  get: () => sessionStorage.getItem(KEY),
  set: (t) => sessionStorage.setItem(KEY, t),
  clear: () => sessionStorage.removeItem(KEY),
};

async function request(path, { method = 'GET', body, form, blob } = {}) {
  const t = token.get();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('Cannot reach the ClaimReady server. Check that the backend is running.');
  }
  const signingIn = path.startsWith('/auth/login') || path.startsWith('/auth/register');
  if (res.status === 401 && t && !signingIn) {
    token.clear();
    window.dispatchEvent(new Event('claimready:signed-out'));
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (blob && res.ok) return res.blob();
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const api = {
  login: async (email, password) => token.set((await request('/auth/login', { method: 'POST', body: { email, password } })).token),
  register: async (email, password) => token.set((await request('/auth/register', { method: 'POST', body: { email, password } })).token),
  logout: async () => { try { await request('/auth/logout', { method: 'POST' }); } catch { /* already signed out */ } token.clear(); },
  changePassword: (current, newPassword) => request('/auth/password', { method: 'POST', body: { current, newPassword } }),
  me: () => request('/me'),
  bootstrap: (body) => request('/org/bootstrap', { method: 'POST', body }),
  aiStatus: () => request('/ai-status'),
  stats: () => request('/claims/stats'),
  listClaims: () => request('/claims'),
  listQueries: () => request('/queries'),
  createQuery: (body) => request('/queries', { method: 'POST', body }),
  updateQuery: (id, body) => request(`/queries/${id}`, { method: 'PATCH', body }),
  draftQuery: (id) => request(`/queries/${id}/draft`, { method: 'POST' }),
  listPayments: () => request('/payments'),
  parseRemittance: (file) => { const form = new FormData(); form.append('file', file); return request('/payments/parse-remittance', { method: 'POST', form }); },
  savePayment: (claimId, body) => request(`/payments/${claimId}`, { method: 'PUT', body }),
  addPaymentAdjustment: (claimId, body) => request(`/payments/${claimId}/adjustments`, { method: 'POST', body }),
  deletePaymentAdjustment: (claimId, adjustmentId) => request(`/payments/${claimId}/adjustments/${adjustmentId}`, { method: 'DELETE' }),
  getPacket: (claimId) => request(`/packets/${claimId}`),
  addPacketItem: (claimId, body) => request(`/packets/${claimId}/items`, { method: 'POST', body }),
  updatePacketItem: (claimId, itemId, body) => request(`/packets/${claimId}/items/${itemId}`, { method: 'PATCH', body }),
  deletePacketItem: (claimId, itemId) => request(`/packets/${claimId}/items/${itemId}`, { method: 'DELETE' }),
  uploadPacketItem: (claimId, itemId, file) => { const form = new FormData(); form.append('file', file); return request(`/packets/${claimId}/items/${itemId}/file`, { method: 'POST', form }); },
  downloadPacket: (claimId) => request(`/packets/${claimId}/download`, { blob: true }),
  getClaim: (id) => request(`/claims/${id}`),
  getStatus: (id) => request(`/claims/${id}/status`),
  analyze: (form) => request('/claims/analyze', { method: 'POST', form }),
  setIssueStatus: (id, review_status) => request(`/issues/${id}`, { method: 'PATCH', body: { review_status } }),
  openDocument: async (id) => {
    const file = await request(`/documents/${id}/file`, { blob: true });
    window.open(URL.createObjectURL(file), '_blank', 'noopener');
  },
  members: () => request('/org/members'),
  invite: (body) => request('/org/invites', { method: 'POST', body }),
  setRole: (userId, role) => request(`/org/members/${userId}`, { method: 'PATCH', body: { role } }),
  resetMemberPassword: (userId, newPassword) => request(`/org/members/${userId}/password`, { method: 'POST', body: { newPassword } }),
  removeMember: (userId) => request(`/org/members/${userId}`, { method: 'DELETE' }),
};
