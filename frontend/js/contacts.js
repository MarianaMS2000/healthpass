(async () => {
  await HP.requireAuth();
  const { $, esc, flash } = HP;
  const COLORS = ['avatar-mint', 'avatar-blue'];
  let contactos = [];
  let editId = null;

  function render() {
    HP.setText('contactsCount', contactos.length === 1 ? '1 contacto registrado' : `${contactos.length} contactos registrados`);
    $('contactsList').innerHTML = contactos.length ? contactos.map((c, i) => `
      <div class="contact-card">
        <div class="contact-info">
          <div class="avatar ${COLORS[i % COLORS.length]}">${esc(c.nombre.charAt(0).toUpperCase())}</div>
          <div class="contact-details">
            <div class="name-row"><strong class="contact-name">${esc(c.nombre)}</strong>${c.es_principal ? '<span class="badge-principal">Principal</span>' : ''}</div>
            <p class="contact-sub">${esc(c.relacion)} · ${esc(c.telefono)}</p>
          </div>
        </div>
        <div class="contact-actions">
          <a href="tel:${esc(c.telefono.replace(/[^0-9+]/g, ''))}" class="btn-action btn-call" aria-label="Llamar a ${esc(c.nombre)}"><i class="bi bi-telephone"></i></a>
          <a href="${esc(HP.waLink(c.telefono))}" target="_blank" rel="noopener" class="btn-action btn-whatsapp" aria-label="WhatsApp a ${esc(c.nombre)}"><i class="bi bi-whatsapp"></i></a>
          <button type="button" class="btn-action btn-edit" data-id="${c.id}" aria-label="Editar contacto"><i class="bi bi-pencil-square"></i></button>
          <button type="button" class="btn-action btn-delete" data-id="${c.id}" aria-label="Eliminar contacto"><i class="bi bi-trash"></i></button>
        </div>
      </div>`).join('') : '<p style="text-align:center;color:#6b7280;padding:2rem 0">Aún no tienes contactos. Pulsa “Agregar”.</p>';
  }

  async function load() { contactos = (await HP.api('/contacts')).contactos; render(); }
  async function run(fn, modal, msg) {
    try { await fn(); if (modal) HP.closeModal(modal); await load(); flash(msg || 'Guardado'); }
    catch (e) { flash(e.message, true); }
  }

  // Agregar
  $('btnAddContact').addEventListener('click', () => {
    ['contactName', 'contactRelation', 'contactPhone'].forEach((id) => ($(id).value = ''));
    HP.openModal('addContactModal');
  });
  $('form-addContactModal').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => HP.api('/contacts', { method: 'POST', body: { nombre: $('contactName').value, relacion: $('contactRelation').value, telefono: $('contactPhone').value } }), 'addContactModal');
  });

  // Editar / eliminar (delegación de eventos)
  $('contactsList').addEventListener('click', (e) => {
    const edit = e.target.closest('.btn-edit');
    const del = e.target.closest('.btn-delete');
    if (edit) {
      const c = contactos.find((x) => x.id === Number(edit.dataset.id));
      editId = c.id;
      $('editContactName').value = c.nombre;
      $('editContactRelation').value = c.relacion;
      $('editContactPhone').value = c.telefono;
      HP.openModal('editContactModal');
    } else if (del && confirm('¿Eliminar este contacto?')) {
      run(() => HP.api('/contacts/' + del.dataset.id, { method: 'DELETE' }), null, 'Contacto eliminado');
    }
  });
  $('form-editContactModal').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => HP.api('/contacts/' + editId, { method: 'PUT', body: { nombre: $('editContactName').value, relacion: $('editContactRelation').value, telefono: $('editContactPhone').value } }), 'editContactModal');
  });

  // Cerrar modales
  [['closeAddContactModal', 'addContactModal'], ['cancelAddContactModal', 'addContactModal'], ['closeEditContactModal', 'editContactModal'], ['cancelEditContactModal', 'editContactModal']]
    .forEach(([btn, modal]) => $(btn).addEventListener('click', () => HP.closeModal(modal)));
  window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); });

  await load();
})().catch(() => {});
