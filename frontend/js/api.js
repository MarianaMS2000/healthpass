/* HealthPass · utilidades compartidas del frontend */
const HP = (() => {
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HealthPass' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Error del servidor');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Protege páginas privadas: si no hay sesión, redirige al login
  async function requireAuth() {
    document.documentElement.style.visibility = 'hidden';
    try {
      const { user } = await api('/auth/me');
      document.documentElement.style.visibility = '';
      return user;
    } catch (e) {
      if (e.status === 401) { location.replace('login.html'); }
      else { document.documentElement.style.visibility = ''; flash('No se pudo conectar con el servidor', true); }
      throw e;
    }
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  // Aviso flotante simple (no depende del CSS de cada página)
  function flash(msg, danger = false) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:12px;color:#fff;font:600 14px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:90vw;text-align:center;background:' + (danger ? '#dc2626' : '#0d9488');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  // dd/mm/aaaa o aaaa-mm-dd  ->  aaaa-mm-dd  (null si es inválida)
  function toISODate(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  }
  function toDisplayDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function openModal(id) { const m = $(id); if (m) m.classList.add('active'); }
  function closeModal(id) { const m = $(id); if (m) m.classList.remove('active'); }

  return { api, requireAuth, esc, $, setText, flash, toISODate, toDisplayDate, openModal, closeModal };
})();
