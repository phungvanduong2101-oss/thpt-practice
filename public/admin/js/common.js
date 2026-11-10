"use strict";

document.querySelectorAll("[data-filter-form]").forEach((form) => {
  form.addEventListener("change", (event) => {
    const select = event.target;
    if (!select.matches("select")) return;

    const resetId = select.dataset.resetFilter;

    if (resetId) {
      const resetSelect = form.querySelector(`#${resetId}`);
      if (resetSelect) resetSelect.value = "all";
    }

    form.requestSubmit();
  });
});

async function request(url, method = "GET", payload) {
  const options = {
    method,
    headers: {
      Accept: "application/json",
    },
  };

  if (payload !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(url, options);

  if (response.redirected) {
    window.location.href = response.url;
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Server không trả JSON (HTTP ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok || data.code !== "success") {
    throw new Error(data.message || "Thao tác thất bại!");
  }

  return data;
}

function makeCode(value, maxLength) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function setFieldError(input, errorId, message) {
  document.getElementById(errorId).textContent = message;

  const hasError = Boolean(message);

  input.classList.toggle("is-invalid", hasError);
  input.setAttribute("aria-invalid", String(hasError));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function idOf(value) {
  return String(value?._id ?? value ?? "");
}

function renderFormulas(container) {
  container.querySelectorAll(".ql-formula[data-value]").forEach((element) => {
    const latex = element.dataset.value || "";
    element.replaceChildren();

    if (!window.katex?.render) {
      element.textContent = latex;
      return;
    }

    try {
      window.katex.render(latex, element, {
        throwOnError: false,
        trust: false,
        displayMode: false,
      });
    } catch {
      element.textContent = latex;
    }
  });
}
// Admin navigation is independent from the client site's mobile navigation.
(() => {
  const button = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!button || !sidebar || !backdrop) return;

  const mobile = window.matchMedia("(max-width: 900px)");
  const focusable = () =>
    [
      ...sidebar.querySelectorAll(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0);

  function setOpen(open, restoreFocus = false) {
    open = mobile.matches && open;
    sidebar.classList.toggle("is-open", open);
    backdrop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute(
      "aria-label",
      open ? "Đóng menu quản trị" : "Mở menu quản trị",
    );
    document.body.classList.toggle("admin-nav-open", open);
    sidebar.inert = mobile.matches && !open;
    if (mobile.matches && !open) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
    if (open) focusable()[0]?.focus();
    else if (restoreFocus) button.focus();
  }

  button.addEventListener("click", () =>
    setOpen(!sidebar.classList.contains("is-open"), true),
  );
  backdrop.addEventListener("click", () => setOpen(false, true));
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("a[href]") && mobile.matches) setOpen(false, true);
  });
  document.addEventListener("keydown", (event) => {
    if (!mobile.matches || !sidebar.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false, true);
    } else if (event.key === "Tab") {
      const elements = focusable();
      const first = elements[0],
        last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  mobile.addEventListener("change", () => {
    const focusWasInside = sidebar.contains(document.activeElement);
    setOpen(false, mobile.matches && focusWasInside);
  });
  setOpen(false);
})();
