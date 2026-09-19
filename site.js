// Shared by the Home and Q&A pages: email prompt, "Yes Ker" video popup, sending posts.
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  // ── Email prompt (once per browser, skippable) ──
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal" id="emailModal" hidden role="dialog" aria-modal="true" aria-labelledby="emailTitle">
      <div class="sheet">
        <img class="logo-big" src="logo.png" alt="The City School">
        <h2 id="emailTitle">Hey, it's Musa!</h2>
        <p>Drop your email so I can get back to you. Don't feel like it? No problem, just skip.</p>
        <form id="emailForm" novalidate>
          <label for="emailInput">Your email</label>
          <input id="emailInput" type="email" placeholder="yourname@gmail.com" autocomplete="email">
          <p class="err" id="emailErr"></p>
          <button class="btn" type="submit">Save</button>
          <button class="btn plain" type="button" id="emailSkip">Skip</button>
        </form>
      </div>
    </div>
    <div class="modal" id="videoModal" hidden role="dialog" aria-modal="true" aria-labelledby="yesTitle">
      <div class="sheet">
        <div class="video-box">
          <p class="yes" id="yesTitle">Yes Ker!</p>
          <video id="yesVideo" src="yesker.mp4" playsinline preload="none"></video>
          <p class="loading" id="videoLoading" hidden>Loading…</p>
        </div>
        <p class="thanks" id="thanksText"></p>
        <button class="btn gold" type="button" id="videoClose">Done</button>
      </div>
    </div>`);

  const emailModal = $("#emailModal"), videoModal = $("#videoModal"), video = $("#yesVideo");
  const lockScroll = () => document.body.classList.toggle("modal-open", !emailModal.hidden || !videoModal.hidden);
  const getEmail = () => store.get("mj-email") || "";
  function refreshReplyTo() {
    document.querySelectorAll("[data-reply-to]").forEach((p) => {
      const e = getEmail();
      p.replaceChildren(e ? `I'll reply to ${e} · ` : "No email, so I can't reply to you · ");
      const b = document.createElement("button");
      b.type = "button"; b.textContent = e ? "change" : "add one";
      b.onclick = openEmail;
      p.append(b);
    });
  }
  function openEmail() { $("#emailInput").value = getEmail(); $("#emailErr").textContent = ""; emailModal.hidden = false; lockScroll(); $("#emailInput").focus(); }
  function closeEmail() { emailModal.hidden = true; lockScroll(); refreshReplyTo(); }
  $("#emailForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#emailInput").value.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { $("#emailErr").textContent = "Hmm, that email looks off. Double-check it?"; return; }
    store.set("mj-email", v); store.set("mj-asked", "1"); closeEmail();
  });
  $("#emailSkip").addEventListener("click", () => { store.set("mj-asked", "1"); closeEmail(); });
  if (!store.get("mj-asked")) { emailModal.hidden = false; lockScroll(); }
  refreshReplyTo();

  // ── Video popup ──
  function showYesKer(message) {
    $("#thanksText").textContent = message;
    if (!video.poster) video.poster = "yesker-poster.jpg";
    videoModal.hidden = false; lockScroll();
    $("#videoLoading").hidden = video.readyState >= 3;
    video.currentTime = 0;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  }
  function closeVideo() { video.pause(); videoModal.hidden = true; lockScroll(); }
  $("#videoClose").addEventListener("click", closeVideo);
  videoModal.addEventListener("click", (e) => { if (e.target === videoModal) closeVideo(); });
  video.addEventListener("playing", () => ($("#videoLoading").hidden = true));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!videoModal.hidden) closeVideo();
    else if (!emailModal.hidden) $("#emailSkip").click();
  });
  // Start downloading the video once someone starts filling a form, so it's ready when they hit send
  let preloaded = false;
  const preload = (e) => {
    if (preloaded || !e.target.closest || !e.target.closest("form[data-kind]")) return;
    preloaded = true; video.poster = "yesker-poster.jpg"; video.preload = "auto"; video.load();
  };
  ["focusin", "input", "pointerdown"].forEach((ev) => document.addEventListener(ev, preload));

  // ── Save the post and email it to Musa (server side, see /functions/api) ──
  async function sendToMusa(kind, fields) {
    let res;
    try {
      res = await fetch((window.API || "") + (kind === "Question" ? "/api/ask" : "/api/suggest"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fields.Name, class: fields.Class, text: fields[kind], email: getEmail() })
      });
    } catch {
      throw new Error("offline");
    }
    if (res.status === 429) throw new Error("slow_down");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "failed");
    return data;
  }

  function friendlyError(ex) {
    if (ex.message === "offline") return "That didn't go through. Check your internet and try again?";
    if (ex.message === "slow_down") return "Whoa, that's a lot of messages! Give it a few minutes.";
    return "Something went wrong on my end. Try again in a minute?";
  }

  // Wire any form with data-kind="Suggestion" / "Question"
  document.querySelectorAll("form[data-kind]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const kind = form.dataset.kind;
      const err = form.querySelector(".err");
      const btn = form.querySelector("button[type=submit]");
      const fields = {};
      form.querySelectorAll("[data-field]").forEach((f) => (fields[f.dataset.field] = f.value.trim()));
      const main = fields[kind];
      if (!main || main.length < 3) { err.textContent = kind === "Question" ? "You forgot to write your question!" : "You forgot to write your idea!"; return; }
      err.textContent = ""; btn.disabled = true; const label = btn.textContent; btn.textContent = "Sending…";
      try {
        await sendToMusa(kind, fields);
        form.querySelectorAll("textarea").forEach((t) => (t.value = ""));
        showYesKer(kind === "Question"
          ? "Got your question! I'll answer it soon."
          : "Thanks yaar! Your idea is with me now. Let's make it happen.");
      } catch (ex) {
        console.error("Send failed:", ex.message);
        err.textContent = friendlyError(ex);
      }
      btn.disabled = false; btn.textContent = label;
    });
  });

  // Highlight current page in the nav
  const page = location.pathname.split("/").pop().replace(".html", "") || "index";
  document.querySelectorAll("nav a").forEach((a) => {
    const target = a.getAttribute("href").replace(".html", "").replace("/", "") || "index";
    if (target === page) a.setAttribute("aria-current", "page");
  });
})();
