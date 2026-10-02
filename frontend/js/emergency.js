(async () => {
  const { $, esc } = HP;
  const token = new URLSearchParams(location.search).get('t');
  const main = $('emMain');

  const card = (icon, color, title, body) => `
    <div class="card"><div class="card-title"><i class="bi ${icon} ${color}"></i><h3>${title}</h3></div>${body}</div>`;
  const empty = '<p style="color:#9ca3af;margin:0">Sin registros</p>';
  const paras = (a) => (a.length ? `<div class="text-content">${a.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : empty);

  function render(d) {
    const v = d.visibilidad;
    let html = `
      <div class="card card-profile">
        <div class="avatar-circle">${esc(d.nombre.charAt(0).toUpperCase())}</div>
        <div class="profile-info"><h2>${esc(d.nombre)}</h2>
        <p>Fecha de nacimiento: ${esc(d.fecha_nacimiento || 'No registrada')}</p></div>
      </div>`;
    if (v.sangre) html += `
      <div class="card"><div class="card-header-line">
        <div class="card-icon icon-red"><i class="bi bi-droplet-fill"></i></div>
        <div><span class="card-label">Tipo de sangre</span><strong class="blood-type-text">${esc(d.tipo_sangre || 'No registrado')}</strong></div>
      </div></div>`;
    if (v.alergias) html += card('bi-exclamation-triangle-fill', 'icon-amber-text', 'Alergias',
      d.alergias.length ? `<div class="tags-container">${d.alergias.map((a) => `<span class="badge-tag">${esc(a)}</span>`).join('')}</div>` : empty);
    if (v.medicamentos) html += card('bi-capsule', 'icon-purple-text', 'Medicamentos actuales',
      d.medicamentos.length ? `<ul class="list-styled">${d.medicamentos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : empty);
    if (v.antecedentes) html += card('bi-info-circle-fill', 'icon-blue-text', 'Antecedentes médicos', paras(d.antecedentes));
    if (v.cirugias) html += card('bi-suit-heart-fill', 'icon-teal-text', 'Cirugías o procedimientos', paras(d.cirugias));
    if (v.contacto) {
      html += d.contactos.length ? d.contactos.map((c) => {
        const tel = c.telefono.replace(/[^0-9+]/g, '');
        return `<div class="card card-contact">
          <div class="contact-header"><div class="card-title"><i class="bi bi-telephone-fill icon-teal-text"></i><h3>Contacto de emergencia</h3></div></div>
          <div class="contact-body">
            <div class="contact-details"><strong class="contact-name">${esc(c.nombre)}</strong><span class="contact-relation">${esc(c.relacion)}</span>
            <a href="tel:${esc(tel)}" class="contact-phone">${esc(c.telefono)}</a></div>
            <a href="tel:${esc(tel)}" class="call-btn"><i class="bi bi-telephone-outbound-fill"></i><span>Llamar</span></a>
            <a href="${esc(HP.waLink(c.telefono))}" target="_blank" rel="noopener" class="call-btn" style="background:#16a34a"><i class="bi bi-whatsapp"></i><span>WhatsApp</span></a>
          </div></div>`;
      }).join('') : card('bi-telephone-fill', 'icon-teal-text', 'Contacto de emergencia', empty);
    }
    main.innerHTML = html;
  }

  try {
    if (token) {
      // Vista compartida: sin sesión, sin navegación interna
      document.querySelector('.bottom-nav').style.display = 'none';
      const close = document.querySelector('.close-btn');
      if (close) close.style.display = 'none';
      render(await HP.api('/public/emergency/' + encodeURIComponent(token)));
    } else {
      await HP.requireAuth();
      render(await HP.api('/emergency'));
    }
  } catch (e) {
    if (e.status === 401) return;
    main.innerHTML = `<div class="card"><p style="margin:0;text-align:center">${esc(e.message)}</p></div>`;
  }
})();
