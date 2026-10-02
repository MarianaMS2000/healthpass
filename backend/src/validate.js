const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function bad(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function parseDate(v) {
  const s = clean(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad('Fecha inválida (usa DD/MM/AAAA)');
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw bad('Fecha inválida');
  return s;
}

function userFields({ nombre_completo, email, username }) {
  const nombre = clean(nombre_completo);
  const mail = clean(email).toLowerCase();
  const user = clean(username).replace(/^@/, '').toLowerCase();
  if (nombre.length < 2 || nombre.length > 120) throw bad('Escribe tu nombre completo');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 160) throw bad('Correo electrónico inválido');
  if (!/^[a-z0-9_.]{3,40}$/.test(user)) throw bad('El usuario debe tener 3-40 caracteres: letras, números, punto o guion bajo');
  return { nombre, mail, user };
}

function password(p) {
  if (typeof p !== 'string' || p.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  if (p.length > 72) throw bad('La contraseña es demasiado larga (máx. 72)');
  return p;
}

module.exports = { clean, bad, parseDate, userFields, password };
