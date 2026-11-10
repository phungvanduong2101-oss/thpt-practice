"use strict";
// One save queue per page. Revision tracks local edits independently of MongoDB __v.
function createHomeworkSaver({ version, read, send, onState, onConflict, onClosed, canSend = () => true,
  schedule = setTimeout, cancel = clearTimeout }) {
  let revision = 0, confirmed = 0, running = null, timer = null, blocked = false,
    forceSave = false, submitRequested = false;
  const state = () => ({ version, dirty: revision !== confirmed, busy: Boolean(running), blocked });
  function clear() { if (timer !== null) cancel(timer); timer = null; }
  async function drain() {
    while (!blocked && canSend() && (revision !== confirmed || forceSave || submitRequested)) {
      const sentRevision = revision, action = submitRequested ? "submit" : "save";
      const answers = structuredClone(read());
      forceSave = false; submitRequested = false;
      onState("saving");
      try {
        const result = await send(action, { answers, version });
        version = result.version; confirmed = sentRevision;
        if (action === "submit") { blocked = true; onClosed("submitted"); break; }
        onState(revision === confirmed ? "saved" : "pending", result.savedAt);
      } catch (error) {
        if (error.status === 409) { blocked = true; onConflict(error.message); }
        else if ([401, 403, 404].includes(error.status)) { blocked = true; onClosed("check", error.message); }
        else { onState("error", error.message); }
        break;
      }
    }
  }
  function run() {
    clear();
    if (!running && !blocked) {
      running = drain().finally(() => { running = null; });
    }
    return running || Promise.resolve();
  }
  return {
    state,
    changed() {
      if (blocked) return;
      revision++; onState("pending"); clear();
      if (!running) timer = schedule(run, 800);
    },
    save() { forceSave = true; return run(); },
    submit() { submitRequested = true; return run(); },
    retry() { return timer !== null ? Promise.resolve() : run(); },
    stop() { blocked = true; clear(); },
  };
}
function initHomeworkWork(form) {
  const { url } = form.dataset;
  const notice = document.querySelector("#notice"), timeStatus = document.querySelector("#hw-time-status");
  let expiresAt = Date.parse(form.dataset.expires), offset = Number(form.dataset.serverNow) - Date.now(),
    synchronized = false, locked = true, terminal = false, conflict = false, checking = null, submitting = false;
  function disable(value) {
    form.querySelectorAll("fieldset,button,input").forEach(el => { el.disabled = value; });
  }
  function lock(message, ended = false) {
    locked = true; terminal ||= ended; disable(true);
    timeStatus.textContent = message;
    if (ended) saver.stop();
  }
  function updateNavigation() {
    form.querySelectorAll(".et-option-label").forEach(label => label.classList.toggle("is-selected", label.querySelector("input").checked));
    let total = 0;
    form.querySelectorAll("[data-id]").forEach(card => {
      const answered = Boolean(card.querySelector(":checked") || card.querySelector('input[type="text"]')?.value.trim());
      form.querySelector('[data-jump="' + card.dataset.id + '"]').classList.toggle("is-answered", answered);
      if (answered) total++;
    });
    document.querySelector("#workCount").textContent = total + "/" + form.querySelectorAll("[data-id]").length + " câu đã trả lời";
  }
  function read() {
    const answers = {};
    form.querySelectorAll("[data-id]").forEach(q => {
      if (q.dataset.type === "fill") answers[q.dataset.id] = q.querySelector("input").value;
      else if (q.dataset.type === "mcq") answers[q.dataset.id] = q.querySelector(":checked")?.value;
      else answers[q.dataset.id] = Object.fromEntries([...q.querySelectorAll(":checked")].map(el => [el.dataset.key, el.value === "true"]));
    });
    return answers;
  }
  const saver = createHomeworkSaver({
    version: Number(form.dataset.version), read,
    canSend: () => synchronized && !locked && !terminal && Date.now() + offset < expiresAt,
    async send(action, body) {
      const response = await fetch(url + "/" + action, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      if (response.redirected) throw Object.assign(new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."), { status: 401 });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.message || "Không thể lưu bài."), { status: response.status });
      return result;
    },
    onState(state, value) {
      notice.dataset.state = state;
      notice.textContent = state === "saving" ? "Đang lưu…"
        : state === "saved" ? "Đã lưu" + (value ? " lúc " + new Date(value).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "")
        : state === "pending" ? "Có thay đổi chưa lưu…"
        : "Chưa lưu được: " + (value || "Lỗi kết nối.") + " Hãy thử lưu lại; dữ liệu vẫn còn trên trang này.";
    },
    onConflict(message) {
      conflict = true;
      lock(message || "Bài đã thay đổi ở tab hoặc thiết bị khác. Hãy tải lại trang để tiếp tục.");
      notice.dataset.state = "error"; notice.textContent = "Xung đột phiên bản. Đáp án chưa lưu không được ghi đè lên dữ liệu máy chủ.";
    },
    onClosed(reason, message) {
      if (reason === "submitted") {
        lock("Nộp bài thành công.", true); location.assign(url);
      } else { lock(message || "Đang kiểm tra trạng thái bài làm…", true); void check(); }
    },
  });
  async function check() {
    if (checking) return checking;
    checking = (async () => {
      const requestedVersion = saver.state().version, wasSaving = saver.state().busy;
      try {
        const response = await fetch(url + "/status", { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        if ([401, 403, 404].includes(response.status) || response.redirected) {
          lock("Phiên đăng nhập hết hạn hoặc quyền truy cập đã bị thu hồi.", true); return;
        }
        if (!response.ok) throw Error("Chưa kết nối được máy chủ.");
        const data = await response.json();
        offset = Number(data.serverNow) - Date.now(); expiresAt = Date.parse(data.expiresAt); synchronized = true;
        if (data.status === "submitted") {
          lock(data.expired ? "Đã hết thời gian. Hệ thống đã nộp phần bài được lưu thành công cuối cùng." : "Bài đã được nộp.", true);
          return;
        }
        if (terminal || conflict) return;
        if (!data.available || data.status !== "in_progress") { lock("Đã hết thời gian. Hệ thống đang chốt phần bài đã lưu."); return; }
        if (!wasSaving && !saver.state().busy && saver.state().version === requestedVersion && data.version !== requestedVersion) {
          conflict = true; saver.stop(); lock("Bài đã thay đổi ở tab hoặc thiết bị khác. Hãy tải lại trang trước khi tiếp tục."); return;
        }
        locked = false; disable(submitting);
        timeStatus.textContent = "Thời gian vẫn trôi khi bạn thoát trang hoặc mất kết nối.";
        if (saver.state().dirty && !submitting) void saver.retry();
      } catch {
        timeStatus.textContent = "Chưa đồng bộ được với máy chủ. Thời gian vẫn tiếp tục trôi.";
      } finally { checking = null; }
    })();
    return checking;
  }
  function tick() {
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now() - offset) / 1000));
    document.querySelector("#clock").textContent = "Còn " + Math.floor(seconds / 3600) + " giờ " + Math.floor(seconds % 3600 / 60) + " phút " + seconds % 60 + " giây";
    if (!seconds && !terminal && !conflict) { lock("Đã hết thời gian. Đang xác nhận hệ thống nộp bài…"); void check(); }
  }
  updateNavigation(); disable(true); tick(); void check();
  form.addEventListener("input", () => { if (!locked && !submitting) { updateNavigation(); saver.changed(); } });
  form.addEventListener("submit", event => event.preventDefault());
  form.querySelector('[data-action="save"]').addEventListener("click", () => { if (!locked) void saver.save(); });
  form.querySelector('[data-action="submit"]').addEventListener("click", async () => {
    if (locked || submitting || !confirm("Nộp bài và khóa câu trả lời?")) return;
    submitting = true; disable(true);
    await saver.submit();
    submitting = false; if (!locked) disable(false);
  });
  window.addEventListener("beforeunload", event => {
    if (saver.state().dirty && !terminal) { event.preventDefault(); event.returnValue = ""; }
  });
  const recover = async () => { await check(); if (!locked && saver.state().dirty) void saver.retry(); };
  window.addEventListener("online", recover);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void recover(); });
  const socket = window.notificationSocket || (window.io && window.io());
  if (socket) {
    socket.on("connect", recover);
    socket.on("homework:expired", data => {
      if (String(data.assignmentId) !== form.dataset.assignment) return;
      lock("Đã hết thời gian. Hệ thống đã nộp phần bài được lưu thành công cuối cùng.", true);
      void check();
    });
  }
  setInterval(check, 5000); setInterval(tick, 1000);
}
if (typeof module !== "undefined" && module.exports) module.exports = { createHomeworkSaver };
if (typeof document !== "undefined") {
document.querySelectorAll("[data-select]").forEach(
  (button) =>
    (button.onclick = () => {
      button
        .closest("fieldset")
        .querySelectorAll('input[name="students"]')
        .forEach((input) => (input.checked = button.dataset.select === "all"));
      button.closest("fieldset").dispatchEvent(new Event("change", { bubbles: true }));
    }),
);
const form = document.querySelector("#work");
if (form) initHomeworkWork(form);
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
    const examId = actionForm.querySelector("#hw-exam-id");
    if (examId && !examId.value) {
      alert("Hãy chọn đề thi trước khi giao bài.");
      actionForm.querySelector("#hw-exam-search").focus();
      return;
    }
    if (actionForm.dataset.startWarning === "true" && !confirm("Bắt đầu tính thời gian ngay khi mở bài lần đầu. Thời gian vẫn trôi khi thoát trang, mất kết nối hoặc đổi thiết bị. Bài sẽ tự nộp khi hết thời lượng hoặc đến hạn nộp chung, tùy mốc nào tới trước. Bạn muốn bắt đầu?")) return;
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

const createHomework = document.querySelector(".hw-create form");
if (createHomework) {
  const students = [...createHomework.querySelectorAll('input[name="students"]')];
  const updateRecipients = () => {
    const count = students.filter(input => input.checked).length;
    createHomework.querySelector(".hw-recipient-count").textContent = `Đã chọn ${count} / ${students.length} học sinh`;
    if (students.length) students[0].setCustomValidity(count ? "" : "Hãy chọn ít nhất một học sinh nhận bài.");
  };
  createHomework.addEventListener("change", updateRecipients);
  updateRecipients();
}

}
