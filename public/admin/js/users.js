"use strict";
(() => {
  const dialog = document.getElementById("userEditDialog");
  if (!dialog) return;
  const form = document.getElementById("userEditForm");
  const name = document.getElementById("userFullName");
  const email = document.getElementById("userEmail");
  const role = document.getElementById("userRole");
  const error = document.getElementById("userEditError");
  const save = document.getElementById("saveUserEdit");
  let editingId = null;
  let busy = false;
  let trigger = null;
  function showError(message = "") { error.textContent = message; error.hidden = !message; }
  function close() { if (!busy) dialog.close(); }
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => trigger?.focus());
  document.getElementById("closeUserEdit").addEventListener("click", close);
  document.getElementById("cancelUserEdit").addEventListener("click", close);
  document.querySelectorAll("[data-edit-user]").forEach(button => {
    button.addEventListener("click", () => {
      if (busy) return;
      trigger = button;
      editingId = button.dataset.id;
      name.value = button.dataset.name;
      email.value = button.dataset.email;
      role.value = button.dataset.role;
      role.disabled = button.dataset.self === "true";
      document.getElementById("userSelfNote").hidden = !role.disabled;
      showError();
      dialog.showModal();
      name.focus();
    });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !editingId || !form.reportValidity()) return;
    busy = true; save.disabled = true; showError();
    try {
      const result = await request(`/admin/users/${encodeURIComponent(editingId)}`, "PATCH", {
        fullName: name.value.trim(), email: email.value.trim(), role: role.value,
      });
      if (result) window.location.reload();
    } catch (err) { showError(err.message); }
    finally { busy = false; save.disabled = false; }
  });
  document.querySelectorAll("[data-status-user]").forEach(button => {
    button.addEventListener("click", async () => {
      if (busy || button.disabled) return;
      const lock = button.dataset.status === "inactive";
      if (!confirm(`${lock ? "Khóa" : "Mở khóa"} tài khoản “${button.dataset.name}”?`)) return;
      busy = true; button.disabled = true;
      try {
        const result = await request(`/admin/users/${encodeURIComponent(button.dataset.id)}/status`, "PATCH", { status: button.dataset.status });
        if (result) window.location.reload();
      } catch (err) { alert(err.message); }
      finally { busy = false; button.disabled = false; }
    });
  });
})();
