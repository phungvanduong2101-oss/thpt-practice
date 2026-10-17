'use strict';

(() => {
  function init() {
    const get = id => document.getElementById(id);

    const nav = get('primaryNav');
    const mobileBtn = get('mobileMenuButton');
    const menuItems = [...document.querySelectorAll('.nav-menu')];

    const notificationBtn = get('notificationButton');
    const notificationPanel = get('notificationPanel');

    const accountBtn = get('accountButton');
    const accountPanel = get('accountPanel');

    const toast = get('toast');
    const searchForm = get('searchForm');
    const searchInput = get('searchInput');

    const mobileQuery = window.matchMedia('(max-width: 1230px)');

    let toastTimeout;

    function initIcons() {
      if (window.lucide?.createIcons) {
        window.lucide.createIcons({
          attrs: { 'stroke-width': 2.2 },
        });
        return;
      }

      const paths = {
        house:
          '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',

        'book-open':
          '<path d="M12 7v14M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3z"/>',

        'chevron-down':
          '<path d="m6 9 6 6 6-6"/>',

        'file-text':
          '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',

        users:
          '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',

        list:
          '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-linecap="round" stroke-width="4"/>',

        target:
          '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 8-8M16 4h4v4"/>',

        'user-round-check':
          '<circle cx="10" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 13-3M16 19l2 2 4-5"/>',

        'circle-plus':
          '<circle cx="12" cy="12" r="10"/><path d="M12 7v10M7 12h10"/>',

        bell:
          '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',

        menu:
          '<path d="M4 6h16M4 12h16M4 18h16"/>',

        x:
          '<path d="M18 6 6 18M6 6l12 12"/>',

        search:
          '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
      };

      document.querySelectorAll('[data-lucide]').forEach(element => {
        const name = element.dataset.lucide;
        if (!paths[name]) return;

        const svg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg'
        );

        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('class', element.getAttribute('class') || '');

        svg.innerHTML = paths[name];
        element.replaceWith(svg);
      });
    }

    function showToast(message) {
      if (!toast) return;

      window.clearTimeout(toastTimeout);

      toast.textContent = message;
      toast.classList.add('is-visible');

      toastTimeout = window.setTimeout(() => {
        toast.classList.remove('is-visible');
      }, 3500);
    }

    function setOpen(menu, open) {
      menu.classList.toggle('is-open', open);

      menu.querySelector('.nav-trigger')
        ?.setAttribute('aria-expanded', String(open));

      if (!open) {
        menu.dataset.pinned = 'false';
      }
    }

    function closeMenus(exclude = null) {
      menuItems.forEach(menu => {
        if (menu !== exclude) {
          setOpen(menu, false);
        }
      });
    }

    function closeUtilities() {
      if (notificationPanel) {
        notificationPanel.hidden = true;
      }

      if (accountPanel) {
        accountPanel.hidden = true;
      }

      notificationBtn?.setAttribute('aria-expanded', 'false');
      accountBtn?.setAttribute('aria-expanded', 'false');
    }

    function toggleUtility(button, panel) {
      if (!button || !panel) return;

      const open = panel.hidden;

      closeUtilities();
      closeMenus();

      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }

    function setMobileOpen(open) {
      if (!nav || !mobileBtn) return;

      nav.classList.toggle('mobile-open', open);

      mobileBtn.setAttribute('aria-expanded', String(open));
      mobileBtn.setAttribute(
        'aria-label',
        open ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'
      );

      const currentIcon = mobileBtn.querySelector('svg');

      if (currentIcon) {
        currentIcon.innerHTML = open
          ? '<path d="M18 6 6 18M6 6l12 12"/>'
          : '<path d="M4 6h16M4 12h16M4 18h16"/>';
      }

      if (!open) {
        closeMenus();
      }
    }

    // Khởi tạo icon trước các tương tác.
    initIcons();

    // Menu luyện tập / nhóm học tập.
    menuItems.forEach(menu => {
      const trigger = menu.querySelector('.nav-trigger');
      if (!trigger) return;

      trigger.addEventListener('click', () => {
        const pinned = menu.dataset.pinned === 'true';

        const open = mobileQuery.matches
          ? !menu.classList.contains('is-open')
          : !pinned;

        closeMenus(menu);
        closeUtilities();

        setOpen(menu, open);
        menu.dataset.pinned = String(open && !mobileQuery.matches);
      });

      menu.addEventListener('pointerenter', event => {
        if (
          event.pointerType !== 'mouse' ||
          mobileQuery.matches
        ) return;

        closeMenus(menu);
        closeUtilities();
        setOpen(menu, true);
      });

      menu.addEventListener('pointerleave', event => {
        if (
          event.pointerType !== 'mouse' ||
          mobileQuery.matches
        ) return;

        if (menu.dataset.pinned !== 'true') {
          setOpen(menu, false);
        }
      });
    });

    mobileBtn?.addEventListener('click', () => {
      if (!nav) return;

      setMobileOpen(!nav.classList.contains('mobile-open'));
      closeUtilities();
    });

    // Chưa có thông báo vẫn không gây lỗi JS.
    notificationBtn?.addEventListener('click', () => {
      toggleUtility(notificationBtn, notificationPanel);
    });

    // Chưa đăng nhập thì nút account không tồn tại.
    accountBtn?.addEventListener('click', () => {
      toggleUtility(accountBtn, accountPanel);
    });

    // Bấm bên ngoài để đóng.
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (!target.closest('.nav-menu')) {
        closeMenus();
      }

      const insideAccount =
        accountBtn?.contains(target) ||
        accountPanel?.contains(target);

      const insideNotification =
        notificationBtn?.contains(target) ||
        notificationPanel?.contains(target);

      if (!insideAccount && !insideNotification) {
        closeUtilities();
      }

      if (
        mobileQuery.matches &&
        !target.closest('.primary-nav, .hamburger')
      ) {
        setMobileOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;

      const accountWasOpen = accountPanel && !accountPanel.hidden;
      const notificationWasOpen =
        notificationPanel && !notificationPanel.hidden;

      closeMenus();
      closeUtilities();

      if (mobileQuery.matches) {
        setMobileOpen(false);
      }

      if (accountWasOpen) {
        accountBtn?.focus();
      } else if (notificationWasOpen) {
        notificationBtn?.focus();
      }
    });

    mobileQuery.addEventListener('change', () => {
      setMobileOpen(false);
      closeMenus();
      closeUtilities();
    });

    // Chỉ giữ thông báo cho những link còn đánh dấu demo.
    document.querySelectorAll('[data-demo]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();

        showToast(
          `${link.dataset.demo}: chức năng đang được hoàn thiện.`
        );

        closeMenus();
        closeUtilities();

        if (mobileQuery.matches) {
          setMobileOpen(false);
        }
      });
    });

    // Cho form GET gửi tìm kiếm thật lên backend.
    // Không còn chặn submit để hiển thị kết quả demo.
    if (searchForm && searchInput) {
      searchForm.addEventListener('submit', event => {
        searchInput.value = searchInput.value.trim();

        if (!searchInput.value) {
          event.preventDefault();
          showToast('Vui lòng nhập từ khóa cần tìm kiếm.');
          searchInput.focus();
        }
      });
    }

    // Logout dùng form POST trong Pug, không cần xử lý bằng JS.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();