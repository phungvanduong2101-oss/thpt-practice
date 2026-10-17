'use strict';

(() => {
  const list = document.getElementById('resultQuestionList');
  const nav = document.getElementById('resultNavGrid');

  if (!list || !nav) return;

  const cards = [...list.querySelectorAll('.er-question')];
  const links = [...nav.querySelectorAll('.er-nav-button')];

  function setCurrent(id) {
    links.forEach(link => {
      const current = link.dataset.qid === id;

      link.classList.toggle('is-current', current);

      if (current) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  nav.addEventListener('click', event => {
    const link = event.target.closest('.er-nav-button');
    if (!link) return;

    const card = cards.find(item =>
      item.dataset.qid === link.dataset.qid
    );

    if (!card) return;

    event.preventDefault();

    card.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    setCurrent(card.dataset.qid);
  });

  list.querySelectorAll('.ql-formula[data-value]').forEach(element => {
    const latex = element.dataset.value || '';

    if (!window.katex?.render) {
      element.textContent = latex;
      return;
    }

    element.replaceChildren();

    try {
      window.katex.render(latex, element, {
        throwOnError: false,
        trust: false,
      });
    } catch {
      element.textContent = latex;
    }
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setCurrent(entry.target.dataset.qid);
        }
      });
    }, {
      rootMargin: '-25% 0px -55% 0px',
    });

    cards.forEach(card => observer.observe(card));
  }

  if (cards[0]) {
    setCurrent(cards[0].dataset.qid);
  }
})();