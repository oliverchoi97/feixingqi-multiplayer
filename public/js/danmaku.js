export const CHAT_MAX = 48;

export function bindChatBar(form, { onSend, escapeHtml: _escapeHtml } = {}) {
  const input = form.querySelector("input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = String(input.value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CHAT_MAX);
    if (!text) return;
    if (onSend(text) === false) return;
    input.value = "";
  });
}

export function setChatOpen(form, on) {
  if (!form) return;
  form.hidden = !on;
}

export function spawnDanmaku(layer, { name, text }, escapeHtml) {
  if (!layer) return;
  const el = document.createElement("p");
  el.className = "danmaku";
  el.innerHTML = `<span class="danmaku-name">${escapeHtml(name || "玩家")}</span>${escapeHtml(text)}`;
  el.style.top = `${8 + Math.random() * 58}%`;
  el.style.animationDuration = `${6.4 + Math.random() * 2.2}s`;
  layer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}
