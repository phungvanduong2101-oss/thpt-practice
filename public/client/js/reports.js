"use strict";
(() => {
  const dialog = document.querySelector("#reportDialog");
  const reportForm = document.querySelector("#reportForm");
  const feedback = document.querySelector("#reportFeedback");
  let returnFocus = null;
  if (dialog && reportForm) {
    const resultLink = document.querySelector("#reportResultLink");
    const submit = reportForm.querySelector('[type="submit"]');
    document.addEventListener("click", event => {
      const trigger = event.target.closest("[data-report-type]");
      if (!trigger || submit.disabled) return;
      returnFocus = trigger;
      reportForm.reset(); feedback.textContent = ""; resultLink.hidden = true; submit.hidden = false;
      reportForm.elements.targetType.value = trigger.dataset.reportType;
      reportForm.elements.targetId.value = trigger.dataset.reportId;
      reportForm.elements.groupId.value = trigger.dataset.reportGroup || "";
      document.querySelector("#reportRecipient").textContent = trigger.dataset.reportType !== "group" && trigger.dataset.reportGroup
        ? "Báo cáo này được gửi đến chủ nhóm để xem xét." : "Báo cáo này được gửi đến admin để xem xét.";
      reportForm.elements.description.required = false;
      dialog.showModal();
    });
    dialog.querySelectorAll("[data-report-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("close", () => returnFocus?.isConnected && returnFocus.focus());
    reportForm.elements.reason.addEventListener("change", () => {
      reportForm.elements.description.required = reportForm.elements.reason.value === "other";
    });
    reportForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true; feedback.textContent = "Đang gửi báo cáo…";
      try {
        const result = await send("/reports", Object.fromEntries(new FormData(reportForm)));
        feedback.textContent = result.message;
        resultLink.href = result.redirectUrl; resultLink.hidden = false; submit.hidden = true;
      } catch (error) { feedback.textContent = error.message; }
      finally { submit.disabled = false; }
    });
  }
  document.querySelectorAll("[data-report-update]").forEach(form => {
    const note = form.elements.resolution;
    const updateRequired = () => note.required = form.elements.status.value !== "reviewing";
    form.elements.status.addEventListener("change", updateRequired); updateRequired();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]'), feedback = form.querySelector(".rp-feedback");
      if (button.disabled) return;
      button.disabled = true; feedback.textContent = "Đang lưu…";
      try {
        const result = await send(form.action, Object.fromEntries(new FormData(form)));
        location.assign(result.redirectUrl);
      } catch (error) { feedback.textContent = error.message; button.disabled = false; }
    });
  });
  async function send(url, data) {
    let response;
    try { response = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
    catch { throw new Error("Không thể kết nối máy chủ. Vui lòng thử lại."); }
    if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Phiên đăng nhập hết hạn hoặc phản hồi không hợp lệ. Hãy tải lại trang.");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Thao tác thất bại.");
    return result;
  }
})();
