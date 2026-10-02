(async () => {
  await HP.requireAuth();
  const { $, esc, flash } = HP;
  const LISTAS = [
    { plural: 'alergias',     list: 'listAlergias',     input: 'allergiesInput', modal: 'allergiesModal' },
    { plural: 'antecedentes', list: 'listAntecedentes', input: 'historyInput',   modal: 'historyModal' },
    { plural: 'medicamentos', list: 'listMedicamentos', input: 'medsInput',      modal: 'medsModal' },
    { plural: 'cirugias',     list: 'listCirugias',     input: 'surgeriesInput', modal: 'surgeriesModal' },
  ];

  async function load() {
    const d = await HP.api('/medical');
    const p = d.perfil;
    HP.setText('infoName', p.nombre_completo);
    HP.setText('infoBirth', p.fecha_nacimiento || 'Sin registrar');
    HP.setText('infoBasic', p.info_basica || 'Sin información');
    HP.setText('infoBlood', p.tipo_sangre || '—');
    HP.setText('infoInsurer', p.aseguradora || 'Sin registrar');
    HP.setText('infoAffType', p.tipo_afiliacion || 'Sin registrar');
    HP.setText('infoAffNum', p.numero_afiliacion || 'Sin registrar');

    $('fullName').value = p.nombre_completo;
    $('birthDate').value = HP.toDisplayDate(p.fecha_nacimiento);
    $('basicInfo').value = p.info_basica || '';
    $('insurerInput').value = p.aseguradora || '';
    $('affiliationTypeInput').value = p.tipo_afiliacion || '';
    $('affiliationNumInput').value = p.numero_afiliacion || '';
    document.querySelectorAll('.blood-option').forEach((b) => b.classList.toggle('active', b.textContent.trim() === p.tipo_sangre));

    LISTAS.forEach(({ plural, list, input }) => {
      const items = d[plural];
      $(list).innerHTML = items.length
        ? items.map((i) => `<div class="list-item"><span>${esc(i.descripcion)}</span>
            <button type="button" class="btn-delete" data-id="${i.id}" aria-label="Eliminar"><i class="bi bi-trash"></i></button></div>`).join('')
        : '<div class="list-item"><span style="color:#9ca3af">Sin registros</span></div>';
      $(input).value = items.map((i) => i.descripcion).join('\n');
    });
  }

  async function run(fn, modal, okMsg) {
    try { await fn(); if (modal) HP.closeModal(modal); await load(); flash(okMsg || 'Guardado'); }
    catch (e) { flash(e.message, true); }
  }

  // Datos personales
  $('form-editProfileModal').addEventListener('submit', (e) => {
    e.preventDefault();
    const iso = HP.toISODate($('birthDate').value);
    if (iso === null) return flash('Fecha inválida. Usa DD/MM/AAAA', true);
    run(() => HP.api('/medical/personal', { method: 'PUT', body: { nombre_completo: $('fullName').value, fecha_nacimiento: iso, info_basica: $('basicInfo').value } }), 'editProfileModal');
  });

  // Tipo de sangre
  document.querySelectorAll('.blood-option').forEach((b) =>
    b.addEventListener('click', () => run(() => HP.api('/medical/blood', { method: 'PUT', body: { tipo_sangre: b.textContent.trim() } }), null)));

  // Listas (un elemento por línea)
  LISTAS.forEach(({ plural, input, modal, list }) => {
    $('form-' + modal).addEventListener('submit', (e) => {
      e.preventDefault();
      run(() => HP.api('/medical/items/' + plural, { method: 'PUT', body: { items: $(input).value.split('\n') } }), modal);
    });
    $(list).addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete');
      if (btn) run(() => HP.api('/medical/items/' + btn.dataset.id, { method: 'DELETE' }), null, 'Eliminado');
    });
  });

  // Seguro
  $('form-insuranceModal').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => HP.api('/medical/insurance', { method: 'PUT', body: { aseguradora: $('insurerInput').value, tipo_afiliacion: $('affiliationTypeInput').value, numero_afiliacion: $('affiliationNumInput').value } }), 'insuranceModal');
  });

  await load();
})().catch(() => {});
