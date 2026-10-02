/* Login y registro */
(() => {
  const form = document.getElementById('authForm');
  if (!form) return;
  const mode = form.dataset.mode; // "login" | "register"
  const errBox = document.getElementById('formError');
  const btn = form.querySelector('button[type="submit"]');
  const val = (id) => (document.getElementById(id) || {}).value || '';

  // Si ya hay sesión, ir directo al panel
  HP.api('/auth/me').then(() => location.replace('dashboard.html')).catch(() => {});

  const showError = (m) => { errBox.textContent = m; errBox.hidden = false; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    let path, body;
    if (mode === 'register') {
      if (val('password').length < 8) return showError('La contraseña debe tener al menos 8 caracteres');
      if (val('password') !== val('confirm-password')) return showError('Las contraseñas no coinciden');
      path = '/auth/register';
      body = { nombre_completo: val('fullname'), email: val('email'), username: val('username'), password: val('password') };
    } else {
      path = '/auth/login';
      body = { username: val('username'), password: val('password') };
    }
    btn.disabled = true;
    try {
      await HP.api(path, { method: 'POST', body });
      location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
    }
  });
})();
