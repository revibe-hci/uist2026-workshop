// The characters above the fortune canvas (remix: several characters' fortunes).
//
// With one character this is the paper's name box ("Mike 's fortune", Figure 1 A1) plus a
// "+ Character" button. With several characters, each one is a chip: a colour swatch, a name box
// and a remove button (the protagonist, first, cannot be removed). Clicking a chip, or pressing
// its number key (1 to 4), chooses whose line the pen draws; that chip is outlined.

import { MAX_CHARACTERS, PALETTE } from "./characters.js";
import { state } from "./store.js";

export class CastBar {
  constructor({ root, prefix, suffix, addButton, onSelect, onRename, onRemove, onAdd }) {
    this.root = root;
    this.prefix = prefix;
    this.suffix = suffix;
    this.addButton = addButton;
    this.chips = new Map(); // character id -> { el, input, remove }
    this.handlers = { onSelect, onRename, onRemove, onAdd };
    addButton.addEventListener("click", () => onAdd());
    root.addEventListener("pointerdown", (e) => {
      const chip = e.target.closest(".char-chip");
      if (chip && !e.target.closest(".chip-remove")) onSelect(chip.dataset.id);
    });
    root.addEventListener("focusin", (e) => {
      const chip = e.target.closest(".char-chip");
      if (chip && e.target.matches("input")) onSelect(chip.dataset.id);
    });
    root.addEventListener("input", (e) => {
      const chip = e.target.closest(".char-chip");
      if (chip) onRename(chip.dataset.id, e.target.value);
    });
    root.addEventListener("click", (e) => {
      const button = e.target.closest(".chip-remove");
      if (button) onRemove(button.closest(".char-chip").dataset.id);
    });
  }

  create(c) {
    const el = document.createElement("div");
    el.className = "char-chip";
    el.dataset.id = c.id;
    el.innerHTML =
      '<span class="chip-swatch"></span><input class="name-input" autocomplete="off" />' +
      '<button class="chip-remove" type="button" title="Remove this character and its line">' +
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    const chip = { el, input: el.querySelector("input"), remove: el.querySelector(".chip-remove") };
    this.chips.set(c.id, chip);
    return chip;
  }

  focus(id) {
    const chip = this.chips.get(id);
    chip?.input.focus();
  }

  render() {
    const multi = state.characters.length > 1;
    const busy = state.ui.generating;
    this.root.classList.toggle("multi", multi);
    this.prefix.hidden = !multi;
    this.suffix.hidden = multi;
    let before = this.root.firstChild;
    const seen = new Set();
    state.characters.forEach((c, k) => {
      const chip = this.chips.get(c.id) || this.create(c);
      seen.add(c.id);
      if (chip.el !== before) this.root.insertBefore(chip.el, before);
      before = chip.el.nextSibling;
      const active = multi && c.id === state.activeCharacter;
      chip.el.classList.toggle("active", active);
      chip.el.style.setProperty("--c", PALETTE[c.color].line);
      if (document.activeElement !== chip.input && chip.input.value !== c.name) chip.input.value = c.name;
      // With several characters, each name box is as wide as its name, so the chips fit on one row.
      const chars = Math.min(14, Math.max(6, (chip.input.value || chip.input.placeholder || "").length + 1));
      chip.input.style.width = multi ? `${chars}ch` : "";
      chip.input.disabled = busy;
      chip.input.placeholder = k === 0 ? "Name" : `Character ${k + 1}`;
      chip.input.setAttribute("aria-label", k === 0 ? "Protagonist's name" : `Name of character ${k + 1}`);
      chip.remove.hidden = k === 0 || !multi;
      chip.remove.disabled = busy;
      chip.el.title = multi
        ? `${k === 0 ? "The protagonist. " : ""}Click to draw this character's fortune line (key ${k + 1}).`
        : "";
      chip.el.setAttribute("aria-pressed", String(active));
    });
    for (const [id, chip] of this.chips) {
      if (!seen.has(id)) {
        chip.el.remove();
        this.chips.delete(id);
      }
    }
    this.addButton.hidden = state.characters.length >= MAX_CHARACTERS;
    this.addButton.disabled = busy;
  }
}
