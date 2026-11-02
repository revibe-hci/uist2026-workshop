// API key: lets a visitor use their own Anthropic API key instead of the workshop
// bridge (needed on a deployed copy, where there is no bridge).
// Loaded before app.js. It wraps fetch so every /api/ request carries the key in
// an X-Api-Key header; the server uses it for that request only.
(function () {
  const KEY = "talebrush-studio-api-key";
  const MODEL = "talebrush-studio-api-model";
  const MODELS = [
    ["claude-haiku-5-5", "Claude Haiku 5.5 — fast and cheapest (what the workshop bridge uses)"],
    ["claude-sonnet-5-5", "Claude Sonnet 5.5 — stronger, ~20× the cost of Haiku"],
    ["claude-opus-5-5", "Claude Opus 5.5 — strongest, ~40× the cost of Haiku"],
  ];
  let health = { require_key: false };

  // sessionStorage unless the visitor ticks "remember"; both wrapped, as storage can throw.
  function read(name) {
    try { return sessionStorage.getItem(name) || localStorage.getItem(name) || ""; } catch (_) { return ""; }
  }
  function write(name, value, remember) {
    try {
      sessionStorage.removeItem(name); localStorage.removeItem(name);
      if (value) (remember ? localStorage : sessionStorage).setItem(name, value);
    } catch (_) { /* storage blocked: the key lasts until the page closes */ }
  }
  let memKey = read(KEY), memModel = read(MODEL);
  const key = () => memKey;
  const remembered = () => { try { return !!localStorage.getItem(KEY); } catch (_) { return false; } };

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, opts = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/") && key()) {
      opts = { ...opts, headers: { ...(opts.headers || {}), "X-Api-Key": key(), "X-Llm-Model": memModel || "" } };
    } else if (url.startsWith("/api/") && opts.method === "POST" && health.require_key) {
      open();  // first AI action without a key: ask for one (the server answers with an error)
    }
    return realFetch(input, opts);
  };

  function renderButton() {
    const btn = document.getElementById("apiKeyBtn");
    if (!btn) return;
    btn.classList.toggle("needs", !key() && health.require_key);
    btn.classList.toggle("set", !!key());
    btn.textContent = key() ? "🔑 Key set" : "🔑 API key";
  }

  function open() {
    const d = document.getElementById("apiKeyDialog");
    if (!d || !d.hidden) return;
    document.getElementById("apiKeyInput").value = key();
    document.getElementById("apiKeyRemember").checked = remembered();
    const sel = document.getElementById("apiModel");
    sel.innerHTML = MODELS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
    sel.value = memModel || health.default_model || MODELS[0][0];
    d.hidden = false;
    document.getElementById("apiKeyInput").focus();
  }
  function close() { document.getElementById("apiKeyDialog").hidden = true; }

  function setup() {
    const head = document.querySelector(".editor-head");
    const btn = document.createElement("button");
    btn.id = "apiKeyBtn";
    btn.className = "key-btn";
    btn.title = "Use your own Anthropic API key for the AI features";
    btn.addEventListener("click", open);
    head.insertBefore(btn, document.getElementById("tourBtn"));

    document.body.insertAdjacentHTML("beforeend", `
      <div id="apiKeyDialog" class="dialog-backdrop" hidden>
        <form class="dialog key-dialog" id="apiKeyForm">
          <h3>Your Anthropic API key</h3>
          <p class="dialog-sub" id="apiKeyWhy"></p>
          <input id="apiKeyInput" type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" aria-label="Anthropic API key">
          <label class="key-row">Model <select id="apiModel"></select></label>
          <label class="key-row"><input type="checkbox" id="apiKeyRemember"> Remember on this device</label>
          <p class="key-fine">The key stays in this browser. It is sent with each AI request to this
            app's server, which passes it to Anthropic for that request and never stores or logs it.
            Calls are billed to your key: a story guide is 2 calls, a design space of 6 variants about 13.
            Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p>
          <div class="dialog-actions">
            <button type="button" id="apiKeyClear">Remove key</button>
            <button type="button" id="apiKeyCancel">Cancel</button>
            <button type="submit" class="primary">Save</button>
          </div>
        </form>
      </div>`);
    document.getElementById("apiKeyCancel").addEventListener("click", close);
    document.getElementById("apiKeyClear").addEventListener("click", () => {
      memKey = ""; write(KEY, ""); renderButton(); close(); window.checkModel?.();
    });
    document.getElementById("apiKeyForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const remember = document.getElementById("apiKeyRemember").checked;
      memKey = document.getElementById("apiKeyInput").value.trim();
      memModel = document.getElementById("apiModel").value;
      write(KEY, memKey, remember); write(MODEL, memModel, remember);
      renderButton(); close(); window.checkModel?.();
    });
    document.getElementById("apiKeyDialog").addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    realFetch("/api/health").then((r) => r.json()).then((h) => {
      health = h;
      document.getElementById("apiKeyWhy").textContent = h.require_key
        ? "This copy of TaleBrush Studio is online, so its AI features run on your own key."
        : "Optional here: without a key, calls go through the workshop LLM bridge.";
      renderButton();
    }).catch(() => {});
    renderButton();
  }

  window.ApiKey = { key, model: () => memModel || health.default_model, open, health: () => health };
  document.addEventListener("DOMContentLoaded", setup);
})();
