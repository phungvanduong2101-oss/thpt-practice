'use strict';
(() => {
  const form = document.getElementById('practiceForm');
  if (!form) return;
  const subject = document.getElementById('practiceSubject');
  const topic = document.getElementById('practiceTopic');
  const button = document.getElementById('practiceCreate');
  const errorElement = document.getElementById('practiceError');
  const topics = JSON.parse(document.getElementById('practiceData').dataset.topics);
  subject.addEventListener('change', () => {
    topic.replaceChildren(new Option('Tất cả chuyên đề', 'all'));
    for (const item of topics) {
      if (String(item.subjectId) === subject.value) topic.appendChild(new Option(item.name, item._id));
    }
    topic.disabled = !subject.value;
    errorElement.hidden = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (button.disabled) return;
    errorElement.hidden = true;
    button.disabled = true;
    button.textContent = 'Đang tạo bài...';
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ subjectId: subject.value, topicId: topic.value, count: Number(form.elements.count.value) }),
    })
      .then(response => response.json().then(data => {
        if (!response.ok || data.code !== 'success') throw new Error(data.message || 'Không tạo được bài luyện tập.');
        return data;
      }))
      .then(data => window.location.assign(data.url))
      .catch(error => { errorElement.textContent = error.message; errorElement.hidden = false; })
      .finally(() => { button.disabled = false; button.textContent = 'Tạo bài ngẫu nhiên'; });
  });
})();
