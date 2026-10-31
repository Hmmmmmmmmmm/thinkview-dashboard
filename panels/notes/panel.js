var input = ctx.root.querySelector(".notes-input"),
  saved = ctx.storage.get("text", "");
input.value = typeof saved === "string" ? saved : "";
function persist() {
  ctx.storage.set("text", input.value);
}
input.addEventListener("input", persist);
return function () {
  persist();
  input.removeEventListener("input", persist);
};
