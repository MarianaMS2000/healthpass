(async () => {
  // El saludo depende de la hora del dispositivo; se pone de inmediato, sin esperar a la red
  HP.setText('greeting', HP.greeting());

  await HP.requireAuth();
  const [d, med] = await Promise.all([HP.api('/dashboard'), HP.api('/medical')]);

  const setVal = (id, text, muted) => {
    HP.setText(id, text);
    HP.$(id).classList.toggle('is-none', !!muted);
  };
  // Las listas donde la persona escribió "no tengo" / "ninguna" no cuentan como registros reales
  const summarize = (items, one, many, none) => {
    const real = items.filter((i) => !HP.isNone(i.descripcion)).length;
    if (items.length && !real) return [none, true];
    return [real === 1 ? one : `${real} ${many}`, false];
  };

  HP.setText('userName', d.nombre);
  setVal('dashBlood', d.tipo_sangre || 'Sin registrar', !d.tipo_sangre);
  setVal('dashAllergies', ...summarize(med.alergias, '1 registrada', 'registradas', 'Ninguna'));
  HP.setText('dashContacts', d.n_contactos === 1 ? '1 contacto' : `${d.n_contactos} contactos`);
  setVal('dashMeds', ...summarize(med.medicamentos, '1 activo', 'activos', 'Ninguno'));
  const insurer = d.aseguradora || 'Sin registrar';
  setVal('dashInsurance', insurer, !d.aseguradora || HP.isNone(insurer));
  HP.setText('dashProfile', d.nombre);

  // Fecha real del último cambio que hizo la persona en sus datos
  const when = d.ultima_actualizacion ? HP.formatLongDate(d.ultima_actualizacion) : '';
  HP.setText('lastUpdate', when ? `Información actualizada el ${when}` : 'Aún no has actualizado tu información');
})().catch(() => {});
