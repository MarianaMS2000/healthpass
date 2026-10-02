(async () => {
  await HP.requireAuth();
  const { $ } = HP;
  const toast = $('toastNotification');
  let t1, t2;

  function showToast(msg, danger = false) {
    HP.setText('toastText', msg);
    toast.classList.toggle('toast-danger', danger);
    toast.classList.remove('hidden');
    clearTimeout(t1); clearTimeout(t2);
    t1 = setTimeout(() => toast.classList.add('show'), 10);
    t2 = setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.classList.add('hidden'), 200); }, 2000);
  }
  const statusText = (chk) => (chk.closest('.toggle-item').querySelector('.toggle-status').textContent =
    chk.checked ? 'Visible en la vista de emergencia' : 'Oculto en la vista de emergencia');

  function showLink(token) {
    $('linkText').textContent = `${location.origin}/emergency.html?t=${token}`;
    $('btnGenerateLink').classList.add('hidden');
    $('generatedLinkBox').classList.remove('hidden');
  }
  function hideLink() {
    $('generatedLinkBox').classList.add('hidden');
    $('btnGenerateLink').classList.remove('hidden');
  }

  // Estado inicial desde la base de datos
  const { visibilidad, enlace } = await HP.api('/privacy');
  document.querySelectorAll('.switch input[data-key]').forEach((chk) => {
    chk.checked = !!visibilidad[chk.dataset.key];
    statusText(chk);
    chk.addEventListener('change', async () => {
      statusText(chk);
      try { await HP.api('/privacy', { method: 'PUT', body: { clave: chk.dataset.key, visible: chk.checked } }); }
      catch (e) { chk.checked = !chk.checked; statusText(chk); showToast(e.message, true); }
    });
  });
  if (enlace) showLink(enlace.token);

  $('btnGenerateLink').addEventListener('click', async () => {
    try { const r = await HP.api('/share', { method: 'POST' }); showLink(r.token); showToast('Enlace generado'); }
    catch (e) { showToast(e.message, true); }
  });
  $('btnRevokeAccess').addEventListener('click', async () => {
    try { await HP.api('/share', { method: 'DELETE' }); hideLink(); showToast('Acceso revocado', true); }
    catch (e) { showToast(e.message, true); }
  });
  $('btnCopyLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('linkText').textContent); showToast('Enlace copiado'); }
    catch { showToast('Copia el enlace manualmente', true); }
  });
})().catch(() => {});
