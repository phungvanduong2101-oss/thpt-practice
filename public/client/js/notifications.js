'use strict';

(() => {
  const button = document.getElementById('notificationButton');
  const list = document.getElementById('notificationList');
  const badge = document.getElementById('notificationCount');
  const errorElement = document.getElementById('notificationError');
  const connection = document.getElementById('notificationConnection');

  if (!button || !list || !badge) return;

  let loading = false;
  let reloadRequested = false;

  function setError(message = '') {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function updateCount(count) {
    badge.hidden = count === 0;
    badge.textContent = String(count);

    button.setAttribute(
      'aria-label',
      `Thông báo: ${count} thông báo chưa đọc`
    );
  }

  // Chỉ mở đường dẫn nội bộ của ứng dụng.
  function internalLink(value) {
    if (
      typeof value === 'string' &&
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\')
    ) {
      return value;
    }

    return '/';
  }

  function renderNotifications(notifications) {
    list.replaceChildren();

    if (!notifications.length) {
      const empty = document.createElement('p');
      empty.className = 'notification-empty';
      empty.textContent = 'Bạn chưa có thông báo.';
      list.appendChild(empty);
      return;
    }

    for (const notification of notifications) {
      const item = document.createElement('a');

      item.className = 'notification-item';
      item.href = internalLink(notification.link);
      item.dataset.notificationId = notification._id;

      if (!notification.isRead) {
        item.classList.add('is-unread');
      }

      const content = document.createElement('span');
      content.className = 'notification-item-content';
      content.textContent = notification.content;

      const time = document.createElement('time');
      time.className = 'notification-item-time';
      time.dateTime = notification.createdAt;
      time.textContent = new Date(
        notification.createdAt
      ).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false,
      });

      item.append(content, time);
      list.appendChild(item);
    }
  }

  async function loadNotifications() {
    if (loading) {
      reloadRequested = true;
      return;
    }

    loading = true;

    try {
      const response = await fetch('/notifications', {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Không tải được thông báo.');
      }

      const data = await response.json();

      if (data.code !== 'success') {
        throw new Error(
          data.message || 'Không tải được thông báo.'
        );
      }

      renderNotifications(data.notifications);
      updateCount(data.unreadCount);
      setError();
    } catch (error) {
      setError(error.message);
    } finally {
      loading = false;

      // Nếu có sự kiện mới trong lúc đang tải thì tải lại một lần.
      if (reloadRequested) {
        reloadRequested = false;
        loadNotifications();
      }
    }
  }

  list.addEventListener('click', async event => {
    const item = event.target.closest(
      'a[data-notification-id]'
    );

    if (!item) return;

    // Giữ thao tác mở tab mới của trình duyệt.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    if (item.dataset.reading === 'true') return;
    item.dataset.reading = 'true';

    try {
      const id = encodeURIComponent(
        item.dataset.notificationId
      );

      const response = await fetch(
        `/notifications/${id}/read`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || data.code !== 'success') {
        throw new Error(
          data.message || 'Không cập nhật được thông báo.'
        );
      }

      window.location.assign(
        internalLink(data.notification.link)
      );
    } catch (error) {
      setError(error.message);
      item.dataset.reading = 'false';
    }
  });

  // main.js vẫn phụ trách mở/đóng bảng.
  button.addEventListener('click', loadNotifications);

  if (typeof window.io !== 'function') {
    connection.textContent = 'Chưa kết nối realtime';
    loadNotifications();
    return;
  }

  const socket = window.io();

  socket.on('connect', () => {
    connection.textContent = 'Đã kết nối';

    // Lấy lại từ DB, bao gồm thông báo phát khi mất kết nối.
    loadNotifications();
  });

  socket.on('disconnect', () => {
    connection.textContent = 'Mất kết nối';
  });

  socket.on('connect_error', () => {
    connection.textContent = 'Chưa kết nối realtime';
  });

  socket.on('notification:new', loadNotifications);
  socket.on('notification:read', loadNotifications);

  loadNotifications();
})();