"use strict";

(() => {
  const search = document.getElementById("formulaSearch");
  if (!search) return;
  const deleteBtn = document.getElementById("formulaDelete");
  if (!deleteBtn) return;

  const params = new URLSearchParams(window.location.search);
  search.value = params.get("search") || "";

  let timer;

  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(submitSearch, 500);
  });

  search.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    clearTimeout(timer);
    submitSearch();
  });

  deleteBtn.addEventListener("click", () => {
    const confirmed = confirm("Bạn có chắc muốn xóa công thức này?");
    if (!confirmed) return;
    const url = deleteBtn.getAttribute("href");
    fetch(url, {
      method: "DELETE"
    }).then(res => res.json()).then(data => {
      if (data.code == 'success') {
        alert(data.message);
        window.location.reload();
      } else {
        alert(data.message);
      }
    })
  });

  function submitSearch() {
    const url = new URL(window.location.href);
    const keyword = search.value.trim();

    if (keyword) {
      url.searchParams.set("search", keyword);
    } else {
      url.searchParams.delete("search");
    }

    // Tìm kiếm mới quay về trang 1.
    url.searchParams.delete("page");

    window.location.assign(url.href);
  }
})();