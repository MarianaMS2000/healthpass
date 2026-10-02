(async () => {
  const user = await HP.requireAuth();
  const { $, flash } = HP;

  function paint(u) {
    HP.setText('pName', u.nombre_completo);
    HP.setText('pHandle', '@' + u.username);
    HP.setText('pAvatar', u.nombre_completo.charAt(0).toUpperCase());
    HP.setText('pFullName', u.nombre_completo);
    HP.setText('pEmail', u.email);
    HP.setText('pUsername', '@' + u.username);
    $('editFullName').value = u.nombre_completo;
    $('editEmail').value = u.email;
    $('editUsername').value = '@' + u.username;
  }
  paint(user);

  $('form-editProfileModal').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await HP.api('/me', { method: 'PUT', body: { nombre_completo: $('editFullName').value, email: $('editEmail').value, username: $('editUsername').value } });
      paint(r.user); HP.closeModal('editProfileModal'); flash('Datos actualizados');
    } catch (err) { flash(err.message, true); }
  });

  $('form-changePasswordModal').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('newPassword').value !== $('confirmPassword').value) return flash('Las contraseñas nuevas no coinciden', true);
    try {
      await HP.api('/me/password', { method: 'PUT', body: { actual: $('currentPassword').value, nueva: $('newPassword').value } });
      e.target.reset(); HP.closeModal('changePasswordModal'); flash('Contraseña actualizada');
    } catch (err) { flash(err.message, true); }
  });

  // La confirmación y el aviso rojo ya los maneja el script de la página; aquí se borra en la base de datos
  $('confirmDeleteBtn').addEventListener('click', async () => {
    try { await HP.api('/me/data', { method: 'DELETE' }); } catch (err) { flash(err.message, true); }
  });

  document.querySelector('.btn-logout').addEventListener('click', async () => {
    try { await HP.api('/auth/logout', { method: 'POST' }); } finally { location.href = 'login.html'; }
  });
})().catch(() => {});
