var root = ctx.root,
  view = new Date(),
  lastDate = "",
  days = root.querySelector(".calendar-days"),
  month = root.querySelector("[data-month]");
view = new Date(view.getFullYear(), view.getMonth(), 1);
function render() {
  var now = new Date(),
    year = view.getFullYear(),
    m = view.getMonth(),
    offset = (new Date(year, m, 1).getDay() + 6) % 7,
    count = new Date(year, m + 1, 0).getDate(),
    compactWeek =
      year === now.getFullYear() && m === now.getMonth()
        ? Math.floor((offset + now.getDate() - 1) / 7)
        : 0;
  month.textContent = view.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  days.textContent = "";
  for (var i = 0; i < 42; i++) {
    var cell = document.createElement("span"),
      day = i - offset + 1;
    cell.className = "calendar-day";
    cell.setAttribute(
      "data-compact",
      String(Math.floor(i / 7) === compactWeek),
    );
    cell.setAttribute("role", "gridcell");
    if (day > 0 && day <= count) {
      cell.textContent = day;
      cell.setAttribute(
        "aria-label",
        new Date(year, m, day).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      );
      if (
        year === now.getFullYear() &&
        m === now.getMonth() &&
        day === now.getDate()
      ) {
        cell.setAttribute("data-today", "true");
        cell.setAttribute("aria-current", "date");
      }
    } else cell.setAttribute("aria-hidden", "true");
    days.appendChild(cell);
  }
  lastDate = now.toDateString();
}
function previous() {
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  render();
}
function next() {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  render();
}
function today() {
  var now = new Date();
  view = new Date(now.getFullYear(), now.getMonth(), 1);
  render();
}
root
  .querySelector("[data-action=previous]")
  .addEventListener("click", previous);
root.querySelector("[data-action=next]").addEventListener("click", next);
month.addEventListener("click", today);
render();
var timer = setInterval(function () {
  if (new Date().toDateString() !== lastDate) render();
}, 60000);
return function () {
  clearInterval(timer);
  root
    .querySelector("[data-action=previous]")
    .removeEventListener("click", previous);
  root.querySelector("[data-action=next]").removeEventListener("click", next);
  month.removeEventListener("click", today);
};
