"use strict";
const groupEditForm = document.getElementById("groupEditForm");
if (groupEditForm) {
  groupEditForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = groupEditForm.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    groupEditForm.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(groupEditForm.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupEditForm.elements.name.value,
          description: groupEditForm.elements.description.value,
          acceptingMembers: groupEditForm.elements.acceptingMembers.checked,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Cập nhật thất bại.");
      alert(data.message);
      location.assign(data.redirectUrl);
    } catch (error) {
      alert(error instanceof SyntaxError ? "Phiên đăng nhập có thể đã hết hạn. Hãy tải lại trang." : error.message || "Không thể kết nối máy chủ.");
    } finally {
      button.disabled = false;
      groupEditForm.removeAttribute("aria-busy");
    }
  });
}
