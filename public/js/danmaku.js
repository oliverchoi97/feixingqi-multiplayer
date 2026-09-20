import { SONG_INPUT_MAX } from "/shared/song.js";

export const CHAT_MAX = 48;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function bindChatBar(form, { onSend, escapeHtml: _escapeHtml } = {}) {
  if (!form) return emptyLog();
  const input = form.querySelector("input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const trimmed = String(input.value || "")
      .replace(/\s+/g, " ")
      .trim();
    const isSong = /^\/song/i.test(trimmed);
    const text = trimmed.slice(0, isSong ? SONG_INPUT_MAX : CHAT_MAX);
    if (!text) return;
    if (onSend(text) === false) return;
    input.value = "";
  });
  return mountChatLog(form);
}

export function setChatOpen(form, on) {
  if (!form) return;
  form.hidden = !on;
  if (!on) form._chatLog?.collapse?.();
}

export function spawnDanmaku(layer, { name, text }, esc = escapeHtml) {
  if (!layer) return;
  const el = document.createElement("p");
  el.className = "danmaku";
  el.innerHTML = `<span class="danmaku-name">${esc(name || "玩家")}</span>${esc(text)}`;
  el.style.top = `${8 + Math.random() * 58}%`;
  el.style.animationDuration = `${6.4 + Math.random() * 2.2}s`;
  layer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function emptyLog() {
  return { append() {}, replace() {}, clear() {}, collapse() {} };
}

function formatTime(at) {
  const d = new Date(at || Date.now());
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function mountChatLog(form) {
  if (form._chatLog) return form._chatLog;
  form.classList.add("has-chat-log");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn ghost chat-log-toggle";
  toggle.id = "chat-log-toggle";
  toggle.textContent = "記錄";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "chat-log");
  toggle.setAttribute("aria-label", "聊天記錄");

  const panel = document.createElement("div");
  panel.className = "chat-log";
  panel.id = "chat-log";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="chat-log-head">本局聊天</div>
    <div class="chat-log-list" role="log" aria-live="polite"></div>
    <p class="chat-log-empty">還沒有訊息</p>
  `;

  form.appendChild(toggle);
  form.appendChild(panel);

  const list = panel.querySelector(".chat-log-list");
  const empty = panel.querySelector(".chat-log-empty");
  const messages = [];

  function render() {
    empty.hidden = messages.length > 0;
    list.replaceChildren();
    for (const m of messages) {
      const row = document.createElement("p");
      row.className = m.system ? "chat-log-row chat-log-system" : "chat-log-row";
      const time = document.createElement("time");
      time.dateTime = new Date(m.at).toISOString();
      time.textContent = formatTime(m.at);
      const name = document.createElement("span");
      name.className = "chat-log-name";
      name.textContent = m.nickname || "玩家";
      const text = document.createElement("span");
      text.className = "chat-log-text";
      text.textContent = m.text || "";
      row.append(time, name, text);
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  }

  function collapse() {
    panel.hidden = true;
    panel.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "記錄";
  }

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    panel.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "收合" : "記錄";
    if (open) list.scrollTop = list.scrollHeight;
  });

  const api = {
    append(msg) {
      const text = String(msg?.text || "").trim();
      if (!text) return;
      messages.push({
        nickname: String(msg.nickname || "玩家").slice(0, 12),
        text: text.slice(0, msg.system ? 80 : CHAT_MAX),
        playerId: msg.playerId || "",
        at: Number(msg.at) || Date.now(),
        system: Boolean(msg.system),
      });
      if (messages.length > 80) messages.splice(0, messages.length - 80);
      render();
    },
    replace(items) {
      messages.length = 0;
      for (const m of items || []) {
        const text = String(m?.text || "").trim();
        if (!text) continue;
        messages.push({
          nickname: String(m.nickname || "玩家").slice(0, 12),
          text: text.slice(0, m.system ? 80 : CHAT_MAX),
          playerId: m.playerId || "",
          at: Number(m.at) || Date.now(),
          system: Boolean(m.system),
        });
      }
      render();
    },
    clear() {
      messages.length = 0;
      collapse();
      render();
    },
    collapse,
  };
  form._chatLog = api;
  render();
  return api;
}
