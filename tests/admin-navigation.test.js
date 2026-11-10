const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../public/admin/js/common.js"),
  "utf8",
);

function setup(width) {
  const documentListeners = {},
    mediaListeners = {};
  let document;
  function element() {
    const classes = new Set(),
      attrs = {},
      listeners = {};
    return {
      hidden: true,
      inert: false,
      attrs,
      listeners,
      classList: {
        toggle(name, on) {
          if (on) classes.add(name);
          else classes.delete(name);
        },
        contains: (name) => classes.has(name),
      },
      setAttribute(name, value) {
        attrs[name] = value;
      },
      removeAttribute(name) {
        delete attrs[name];
      },
      addEventListener(name, fn) {
        listeners[name] = fn;
      },
      getClientRects: () => [{}],
      focus() {
        document.activeElement = this;
      },
    };
  }
  const button = element(),
    sidebar = element(),
    backdrop = element();
  const links = [element(), element()];
  sidebar.querySelectorAll = () => links;
  sidebar.contains = (el) => links.includes(el);
  const media = {
    matches: width <= 900,
    addEventListener(name, fn) {
      mediaListeners[name] = fn;
    },
  };
  document = {
    body: element(),
    activeElement: button,
    getElementById: (id) =>
      ({ menuButton: button, sidebar, sidebarBackdrop: backdrop })[id],
    querySelectorAll: () => [],
    addEventListener(name, fn) {
      documentListeners[name] = fn;
    },
  };
  vm.runInNewContext(source, { document, window: { matchMedia: () => media } });
  return {
    document,
    button,
    sidebar,
    backdrop,
    links,
    media,
    documentListeners,
    mediaListeners,
  };
}

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`Menu state matches responsive breakpoint at ${width}px`, () => {
    const ui = setup(width);
    assert.equal(ui.sidebar.inert, width <= 900);
    assert.equal(ui.backdrop.hidden, true);
    assert.equal(ui.button.attrs["aria-expanded"], "false");
    ui.button.listeners.click();
    assert.equal(ui.sidebar.classList.contains("is-open"), width <= 900);
    assert.equal(ui.backdrop.hidden, width > 900);
    if (width <= 900) assert.equal(ui.document.activeElement, ui.links[0]);
  });
}
test("Escape and backdrop close the drawer and restore focus", () => {
  const ui = setup(390);
  ui.button.listeners.click();
  let prevented = false;
  ui.documentListeners.keydown({
    key: "Escape",
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(ui.sidebar.inert, true);
  assert.equal(ui.document.activeElement, ui.button);
  assert.equal(ui.document.body.classList.contains("admin-nav-open"), false);
  ui.button.listeners.click();
  ui.backdrop.listeners.click();
  assert.equal(ui.backdrop.hidden, true);
  assert.equal(ui.button.attrs["aria-expanded"], "false");
});
test("Focus stays inside the open drawer in both directions", () => {
  const ui = setup(768);
  ui.button.listeners.click();
  ui.documentListeners.keydown({
    key: "Tab",
    shiftKey: true,
    preventDefault() {},
  });
  assert.equal(ui.document.activeElement, ui.links[1]);
  ui.documentListeners.keydown({
    key: "Tab",
    shiftKey: false,
    preventDefault() {},
  });
  assert.equal(ui.document.activeElement, ui.links[0]);
});
test("Changing to desktop clears modal state; returning to mobile closes access", () => {
  const ui = setup(390);
  ui.button.listeners.click();
  ui.media.matches = false;
  ui.mediaListeners.change();
  assert.equal(ui.sidebar.inert, false);
  assert.equal(ui.sidebar.attrs["aria-hidden"], undefined);
  assert.equal(ui.document.body.classList.contains("admin-nav-open"), false);
  ui.media.matches = true;
  ui.mediaListeners.change();
  assert.equal(ui.sidebar.inert, true);
  assert.equal(ui.document.activeElement, ui.button);
});
test("Selecting a navigation link closes the mobile drawer", () => {
  const ui = setup(390);
  ui.button.listeners.click();
  ui.sidebar.listeners.click({ target: { closest: () => ui.links[0] } });
  assert.equal(ui.backdrop.hidden, true);
  assert.equal(ui.sidebar.inert, true);
});
