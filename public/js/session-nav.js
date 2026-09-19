export function ensureConfirmModal() {
  if (document.getElementById("session-confirm")) return;
  const wrap = document.createElement("div");
  wrap.id = "session-confirm";
  wrap.className = "modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal-card">
      <p class="eyebrow" id="session-confirm-kicker">確認</p>
      <h3 id="session-confirm-title">確定嗎？</h3>
      <p class="lede tight" id="session-confirm-body"></p>
      <div class="home-actions">
        <button type="button" class="btn primary" id="session-confirm-yes">確定</button>
        <button type="button" class="btn ghost" id="session-confirm-no">取消</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

export function confirmAction({ title, body, confirmLabel, onConfirm }) {
  ensureConfirmModal();
  const modal = document.getElementById("session-confirm");
  document.getElementById("session-confirm-title").textContent = title;
  document.getElementById("session-confirm-body").textContent = body;
  const yes = document.getElementById("session-confirm-yes");
  yes.textContent = confirmLabel || "確定";
  modal.hidden = false;
  const close = () => {
    modal.hidden = true;
    yes.onclick = null;
  };
  yes.onclick = () => {
    close();
    onConfirm();
  };
  document.getElementById("session-confirm-no").onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
}

export function bindSessionButtons({ socket, lobbyPath, onGoLobby, hasRoom } = {}) {
  const go = (action) => {
    const toMenu = action === "menu";
    confirmAction({
      title: toMenu ? "回到主選單？" : "結束遊戲？",
      body: toMenu
        ? "會結束這個房間目前的對局，然後返回遊戲選單。"
        : "會結束這個房間目前的對局，所有人回到開局前畫面。",
      confirmLabel: toMenu ? "回到主選單" : "結束遊戲",
      onConfirm: () => {
        const inRoom = hasRoom ? hasRoom() : Boolean(socket);
        if (toMenu && (!socket || !inRoom)) {
          location.assign("/");
          return;
        }
        if (!toMenu && (!socket || !inRoom)) {
          location.assign(lobbyPath || location.pathname);
          return;
        }
        socket.emit(toMenu ? "exitToMenu" : "endMatch");
      },
    });
  };

  document.querySelectorAll("[data-session]").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.session));
  });

  if (!socket) return;
  socket.on("matchEnded", ({ dest } = {}) => {
    if (dest === "menu") {
      location.assign("/");
      return;
    }
    if (typeof onGoLobby === "function") onGoLobby(dest);
    else location.assign(lobbyPath || "/");
  });
}
