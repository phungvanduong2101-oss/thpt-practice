document.querySelectorAll("[data-select]").forEach(
  (button) =>
    (button.onclick = () => {
      button
        .closest("fieldset")
        .querySelectorAll("input")
        .forEach((input) => (input.checked = button.dataset.select === "all"));
    }),
);
const form = document.querySelector("#work");
if (form) {
  const { url } = form.dataset,
    notice = document.querySelector("#notice");
  let version = Number(form.dataset.version),
    dirty = false,
    busy = false,
    locked = false;
  let due = Date.parse(form.dataset.due),
    offset = 0,
    checking = false;
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  function updateNavigation() {
    form.querySelectorAll(".et-option-label").forEach((label) => {
      label.classList.toggle(
        "is-selected",
        label.querySelector("input").checked,
      );
    });
    let total = 0;
    const cards = form.querySelectorAll("[data-id]");
    cards.forEach((card) => {
      const answered = Boolean(
        card.querySelector(":checked") ||
        card.querySelector("input[type=text]")?.value.trim(),
      );
      form
        .querySelector('[data-jump="' + card.dataset.id + '"]')
        .classList.toggle("is-answered", answered);
      if (answered) total++;
    });
    document.querySelector("#workCount").textContent =
      total + "/" + cards.length + " câu đã trả lời";
  }
  updateNavigation();
  form.oninput = () => {
    updateNavigation();
    dirty = true;
    notice.textContent = "Có thay đổi chưa lưu.";
  };
  function disable(value) {
    form
      .querySelectorAll("fieldset,button,input")
      .forEach((el) => (el.disabled = value));
  }
  async function check() {
    if (checking || locked) return;
    checking = true;
    try {
      const r = await fetch(url + "/status");
      if (r.status === 403 || r.status === 404) {
        locked = true;
        disable(true);
        notice.textContent = "Quyền truy cập đã bị thu hồi.";
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      due = Date.parse(data.due);
      offset = data.now - Date.now();
      if (due <= data.now) {
        locked = true;
        disable(true);
        notice.textContent = "Đã hết hạn. Hệ thống chấm phần đã lưu.";
      }
    } catch {
      notice.textContent = "Chưa thể kiểm tra thời hạn.";
    } finally {
      checking = false;
    }
  }
  check();
  setInterval(check, 15000);
  setInterval(() => {
    const seconds = Math.max(0, Math.ceil((due - Date.now() - offset) / 1000));
    document.querySelector("#clock").textContent =
      "Còn " +
      Math.floor(seconds / 3600) +
      " giờ " +
      Math.floor((seconds % 3600) / 60) +
      " phút " +
      (seconds % 60) +
      " giây";
    if (!seconds) check();
  }, 1000);
  form.onsubmit = (e) => e.preventDefault();
  form.querySelectorAll("[data-action]").forEach(
    (button) =>
      (button.onclick = async () => {
        if (busy || locked) return;
        const action = button.dataset.action;
        if (action === "submit" && !confirm("Nộp bài và khóa câu trả lời?"))
          return;
        const answers = {};
        form.querySelectorAll("[data-id]").forEach((q) => {
          const id = q.dataset.id;
          if (q.dataset.type === "fill")
            answers[id] = q.querySelector("input").value;
          else if (q.dataset.type === "mcq")
            answers[id] = q.querySelector(":checked")?.value;
          else
            answers[id] = Object.fromEntries(
              [...q.querySelectorAll(":checked")].map((el) => [
                el.dataset.key,
                el.value === "true",
              ]),
            );
        });
        busy = true;
        disable(true);
        notice.textContent = "Đang lưu…";
        try {
          const r = await fetch(url + "/" + action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers, version }),
          });
          if (!r.ok)
            throw Error(
              r.status === 409
                ? "Bài đã thay đổi trên thiết bị khác. Hãy tải lại trang."
                : "Không thể lưu. Kiểm tra quyền và thời hạn.",
            );
          version = (await r.json()).version;
          dirty = false;
          notice.textContent = "Đã lưu.";
          alert(action === "submit" ? "Nộp bài thành công!" : "Lưu bài thành công!");
          if (action === "submit") {
            locked = true;
            location.assign(url);
          }
        } catch (e) {
          notice.textContent = e.message;
          alert(e.message);
        } finally {
          busy = false;
          disable(locked);
        }
      }),
  );
}
document.querySelectorAll(".ql-formula[data-value]").forEach((el) => {
  const latex = el.dataset.value;
  if (window.katex)
    window.katex.render(latex, el, { throwOnError: false, trust: false });
  else el.textContent = latex;
});
const panel = document.querySelector("#hw-progress[data-assignment]");
if (panel && window.io) {
  const socket = window.notificationSocket || window.io();
  let running = false,
    pending = false;
  async function refresh() {
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending) {
        pending = false;
        const response = await fetch(location.pathname + "?view=progress", {
          cache: "no-store",
        });
        if (response.ok && !response.redirected)
          panel.innerHTML = await response.text();
      }
    } catch {
      /* Retry on reconnect and periodic reconciliation. */
    } finally {
      running = false;
    }
  }
  socket.on("homework:progress", (id) => {
    if (id === panel.dataset.assignment) refresh();
  });
  socket.on("connect", refresh);
  refresh();
  setInterval(refresh, 30000);
}


// Keep form values when an action fails and report every explicit action.
document.querySelectorAll("form[data-homework-action]").forEach(actionForm => {
  actionForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = actionForm.querySelector('button[type="submit"],button:not([type])');
    if (actionForm.dataset.busy === "true") return;
    actionForm.dataset.busy = "true";
    if (button) button.disabled = true;
    try {
      const data = {};
      const fields = new FormData(actionForm);
      for (const [key, value] of fields) {
        if (key === "students") (data.students ||= []).push(value);
        else data[key] = value;
      }
      const response = await fetch(actionForm.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = null; }
      if (response.redirected) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      if (!response.ok) throw new Error(result?.message || (text && !text.includes("<") ? text : "Thao tác thất bại. Vui lòng thử lại."));
      if (!result?.redirectUrl) throw new Error("Phản hồi không hợp lệ. Vui lòng tải lại trang.");
      alert(result.message);
      location.assign(result.redirectUrl);
    } catch (error) {
      alert(error instanceof TypeError ? "Không thể kết nối máy chủ. Vui lòng thử lại." : error.message);
    } finally {
      actionForm.dataset.busy = "false";
      if (button) button.disabled = false;
    }
  });
});
