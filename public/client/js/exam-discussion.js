"use strict";
let updatingDiscussion = false;
document.addEventListener("submit", async event => {
  const form = event.target.closest("#discussion form[data-post-form]");
  if (!form) return;
  event.preventDefault();
  if (updatingDiscussion) return;
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
  updatingDiscussion = true;
  const button = form.querySelector("button");
  if (button) button.disabled = true;
  let saved = false;
  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Thao tác thất bại.");
    saved = true;
    // New comments appear first. Keep the current page for edits and deletions.
    const url = new URL(location.href);
    if (new URL(form.action).pathname.endsWith("/comments")) url.searchParams.delete("page");
    const fresh = await fetch(url.pathname + url.search, { cache: "no-store" });
    if (!fresh.ok || fresh.redirected) throw new Error("Không thể cập nhật danh sách bình luận.");
    const doc = new DOMParser().parseFromString(await fresh.text(), "text/html");
    const section = doc.querySelector("#discussion");
    if (!section) throw new Error("Không thể cập nhật danh sách bình luận.");
    document.querySelector("#discussion").replaceWith(section);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    alert(saved
      ? "Thao tác đã được lưu nhưng chưa tải được danh sách mới. Hãy tải lại trang để xem."
      : error instanceof SyntaxError
        ? "Phiên đăng nhập hết hạn hoặc phản hồi không hợp lệ."
        : error.message || "Không thể kết nối máy chủ.");
  } finally {
    updatingDiscussion = false;
    if (button && button.isConnected) button.disabled = false;
  }
});

document.addEventListener("click", event => {
  const quote = event.target.closest("[data-exam-quote]");
  if (quote) {
    const input = document.querySelector("#examQuotedId");
    if (!input) return;
    input.value = quote.dataset.examQuote;
    document.querySelector("#examQuoteAuthor").textContent = quote.dataset.author + " viết:";
    document.querySelector("#examQuoteText").textContent = quote.dataset.content;
    document.querySelector("#examQuotePreview").hidden = false;
    document.querySelector("#examComment").scrollIntoView({behavior:"smooth",block:"center"});
    document.querySelector("#examComment").focus({preventScroll:true});
  }
  if (event.target.closest("#examCancelQuote")) {
    document.querySelector("#examQuotedId").value = "";
    document.querySelector("#examQuotePreview").hidden = true;
  }
});
