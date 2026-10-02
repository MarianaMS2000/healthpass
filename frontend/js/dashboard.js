(async () => {
  await HP.requireAuth();
  const d = await HP.api('/dashboard');
  const h = new Date().getHours();
  HP.setText('greeting', h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
  HP.setText('userName', d.nombre);
  HP.setText('dashBlood', d.tipo_sangre || 'Sin registrar');
  HP.setText('dashAllergies', d.n_alergias === 1 ? '1 registrada' : `${d.n_alergias} registradas`);
  HP.setText('dashContacts', d.n_contactos === 1 ? '1 contacto' : `${d.n_contactos} contactos`);
  HP.setText('dashMeds', d.n_medicamentos === 1 ? '1 activo' : `${d.n_medicamentos} activos`);
  HP.setText('dashInsurance', d.aseguradora || 'Sin registrar');
  HP.setText('dashProfile', d.nombre);
})().catch(() => {});
