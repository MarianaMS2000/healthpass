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

  // Convierte un teléfono a enlace de WhatsApp (solo dígitos, con indicativo de país)
  function waLink(tel) {
    const raw = String(tel || '').trim();
    let digits = raw.replace(/\D/g, '');
    if (!raw.startsWith('+') && digits.length === 10) digits = '57' + digits; // asume Colombia
    return 'https://wa.me/' + digits;
  }

  // Saludo según la hora local del dispositivo de quien entra
  function greeting(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 12) return 'Buenos días';
    if (h >= 12 && h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  // "2026-10-03T15:20:00Z" -> "3 de octubre, 2026" (en la zona horaria de quien lo ve)
  function formatLongDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}, ${d.getFullYear()}`;
  }

  // ¿El texto dice "no tengo / ninguna / sin ..."? Es estricto a propósito: solo cuenta si TODO el
  // texto es una negación genérica. "No tolero la penicilina" NO cuenta (sigue siendo una alergia real).
  const NONE_ALONE = /^(no|nada|nunca|ninguno|ninguna|ningun|n a|na|no aplica|no hay|no tiene|no presenta|sin datos|sin registros?|sin informacion|ninguno conocido|ninguna conocida|sin registrar)$/;
  const NONE_LEAD = /^(no (tengo|presento|padezco|sufro|poseo|he tenido|tiene|presenta|padece|sufre|hay|existe|existen|registro|conozco|he sido|me han|le han|se me han|tomo|consumo|uso|estoy tomando|estoy usando)|nunca (he tenido|he sido|me han|tuve|he padecido)|sin|ninguna?|ningun)\b/;
  const NONE_FILLER = new Set(('alergia alergias alergico alergica alergicos alergicas conocida conocidas conocido conocidos antecedente antecedentes ' +
    'medico medica medicos medicas medicamento medicamentos medicina medicinas cirugia cirugias procedimiento procedimientos operacion operaciones ' +
    'operado operada intervenido intervenida enfermedad enfermedades condicion condiciones cronica cronicas cronico cronicos patologia patologias ' +
    'de del ni o y a la el los las en mi mis para que actualmente ahora momento hasta por aun todavia ningun ninguna ninguno alimentaria alimentarias ' +
    'alimento alimentos medicamentosa medicamentosas registrada registradas registrado registrados registrar importante importantes previa previas previo previos ' +
    'hospitalizacion hospitalizaciones tratamiento tratamientos regularmente permanente permanentes diagnosticada diagnosticado diagnosticadas diagnosticados hecho practicado practicada').split(' '));
  function isNone(text) {
    const n = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return false;
    if (NONE_ALONE.test(n)) return true;
    const m = n.match(NONE_LEAD);
    if (!m) return false;
    return n.slice(m[0].length).split(' ').filter(Boolean).every((w) => NONE_FILLER.has(w));
  }

  return { api, requireAuth, esc, $, setText, flash, toISODate, toDisplayDate, openModal, closeModal, waLink, greeting, formatLongDate, isNone };
})();
