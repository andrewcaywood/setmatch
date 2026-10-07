import { demoProject, demoActors, genreChoices, skillChoices, scheduleChoices, recommend, semanticSimilarities } from "./matching.js";

const storageKey = "setmatch-forgehacks-demo-v1";
const $ = selector => document.querySelector(selector);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (stored && stored.project && Array.isArray(stored.actors) && Array.isArray(stored.invitations)) {
      return { project: stored.project, actors: stored.actors, invitations: stored.invitations, dismissedActorIds: Array.isArray(stored.dismissedActorIds) ? stored.dismissedActorIds : [], selectedActorId: stored.selectedActorId || demoActors[0].id, mode: stored.mode === "actor" ? "actor" : "filmmaker" };
    }
  } catch {}
  return { project: clone(demoProject), actors: clone(demoActors), invitations: [], dismissedActorIds: [], selectedActorId: demoActors[0].id, mode: "filmmaker" };
}

let state = loadState();
let ranked = recommend(state.project, state.actors);
let engine = "local";
let matchingRun = 0;
let toastTimer;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderedMode = null;
let currentMatchActorId = null;
const swipeBusy = { matches: false, inbox: false };

function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function tag(text, tone = "") { return `<span class="tag ${tone}">${escapeHtml(text)}</span>`; }
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function setEngineStatus(kind, title, detail) {
  const el = $("#engineStatus");
  el.className = `engine-status ${kind}`;
  el.innerHTML = `<span class="engine-icon">◎</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

async function updateMatches() {
  const run = ++matchingRun;
  engine = "local";
  ranked = recommend(state.project, state.actors);
  renderMatches();
  setEngineStatus("loading", "Preparing semantic matching", "Downloading the on-device language model can take a moment on first use. A text-based shortlist is shown meanwhile.");
  try {
    const scores = await semanticSimilarities(state.project, state.actors);
    if (run !== matchingRun) return;
    engine = "semantic";
    ranked = recommend(state.project, state.actors, "semantic", scores);
    renderMatches();
    setEngineStatus("semantic", "Semantic model ready · running on your device", "Sentence embeddings compare the role with actor descriptions. Genre, skills, and schedule remain visible so you can judge each suggestion.");
  } catch (error) {
    if (run !== matchingRun) return;
    console.warn("Semantic model unavailable; using local TF-IDF matching.", error);
    setEngineStatus("fallback", "Using local text matching", "The pretrained model could not load. The shortlist still works with on-device TF-IDF matching; retry by refreshing when online.");
  }
}

function renderProject() {
  const p = state.project;
  $("#projectCard").innerHTML = `<div class="project-visual"><span class="visual-tag">${escapeHtml(p.format || "STUDENT FILM")}</span><svg class="visual-human" viewBox="0 0 440 211" preserveAspectRatio="xMidYMax meet" role="img" aria-label="A student and their delayed shadow"><g class="visual-shadow" transform="translate(-96 5)"><circle cx="168" cy="39" r="18"/><path d="M153 63Q168 56 183 63L192 73 211 106 201 112 186 91 190 128H146L150 91 135 112 125 106 144 73Z"/><path d="M146 124H190L198 211H181L168 157 155 211H138Z"/></g><g class="visual-student"><circle cx="168" cy="39" r="18"/><path d="M153 63Q168 56 183 63L192 73 211 106 201 112 186 91 190 128H146L150 91 135 112 125 106 144 73Z"/><path d="M146 124H190L198 211H181L168 157 155 211H138Z"/></g></svg></div><div class="project-content"><span class="project-number">CURRENT FILM / 001</span><h3>${escapeHtml(p.title)}</h3><p class="logline">${escapeHtml(p.logline)}</p><div class="divider"></div><div class="data-block"><span class="data-label">CASTING FOR</span><span class="data-value">${escapeHtml(p.role)}</span></div><div class="data-block"><span class="data-label">THE ROLE</span><p>${escapeHtml(p.roleDescription)}</p></div><div class="data-block"><span class="data-label">CREATIVE DIRECTION</span><p>${escapeHtml(p.tone)}</p></div><div class="data-block"><span class="data-label">GENRE & SKILLS</span><div class="tags">${p.genres.map(x => tag(x,"orange")).join("")}${p.skills.map(x => tag(x)).join("")}</div></div><div class="data-block"><span class="data-label">SHOOT WINDOW</span><span class="data-value">${escapeHtml(p.schedule)} · ${escapeHtml(p.commitment)}</span></div></div><div class="project-footer">The full brief is shared only after an invitation.</div>`;
}

function invitationFor(actorId) { return state.invitations.find(item => item.actorId === actorId && item.projectId === state.project.id); }

function renderMatches() {
  if (swipeBusy.matches) return;
  const available = $("#availableOnly").checked ? ranked.filter(actor => actor.available) : ranked;
  const visible = available.filter(actor => !invitationFor(actor.id) && !state.dismissedActorIds.includes(actor.id));
  const actor = visible.find(item => item.id === currentMatchActorId) || visible[0];
  currentMatchActorId = actor?.id || null;
  $("#matchCount").textContent = `${visible.length} ${visible.length === 1 ? "match" : "matches"} left`;
  if (!actor) {
    const canReview = available.some(item => state.dismissedActorIds.includes(item.id));
    $("#actorMatches").innerHTML = `<div class="empty-state deck-empty"><strong>${canReview ? "You've seen everyone for now." : "No new matches for this shoot."}</strong>${canReview ? "Passed profiles can always be reviewed again." : "Try a different shoot window or turn off the availability filter."}${canReview ? `<button class="deck-reset" type="button" data-review-passed>Review passed actors ↶</button>` : ""}</div>`;
    return;
  }
  $("#actorMatches").innerHTML = `<div class="deck-topline"><span>PROFILE ${String(available.length - visible.length + 1).padStart(2, "0")} / ${String(available.length).padStart(2, "0")}</span><span>DRAG OR CHOOSE BELOW</span></div><div class="deck-stage"><article class="swipe-card actor-swipe-card" data-actor-id="${escapeHtml(actor.id)}" aria-label="${escapeHtml(actor.name)} match card"><span class="swipe-stamp stamp-left" aria-hidden="true">PASS</span><span class="swipe-stamp stamp-right" aria-hidden="true">INVITE</span><div class="swipe-card-hero"><div class="avatar ${escapeHtml(actor.color)}" aria-hidden="true">${escapeHtml(actor.initials)}</div><div><span class="deck-eyebrow">THE CREATIVE PROFILE</span><h4>${escapeHtml(actor.name)}</h4><span class="deck-year">${escapeHtml(actor.year)}</span></div><div class="deck-fit"><strong>${actor.score}<span>/100</span></strong><small>ROLE FIT</small></div></div><p class="deck-bio">${escapeHtml(actor.bio)}</p><div class="deck-facts"><div><span class="data-label">STORIES</span><div class="tags">${actor.genres.map(x => tag(x,"orange")).join("")}</div></div><div><span class="data-label">SKILLS</span><div class="tags">${actor.skills.map(x => tag(x)).join("")}</div></div><div><span class="data-label">PAST WORK</span><span class="data-value">${escapeHtml(actor.portfolio || "New to student film")}</span></div></div><div class="deck-reasons">${actor.reasons.map(reason => `<span class="reason ${reason.startsWith("Unavailable") ? "unavailable" : ""}">${escapeHtml(reason)}</span>`).join("")}</div></article></div><div class="deck-actions"><button type="button" class="deck-action deck-pass" data-deck-action="pass" aria-label="Pass on ${escapeHtml(actor.name)}"><span class="deck-action-icon" aria-hidden="true">×</span><span>Pass</span></button><button type="button" class="deck-action deck-invite" data-deck-action="invite" ${actor.available ? "" : "disabled"} aria-label="${actor.available ? "Send film invitation to" : "Unavailable for this shoot:"} ${escapeHtml(actor.name)}"><span class="deck-action-icon" aria-hidden="true">↗</span><span>${actor.available ? "Send invite" : "Unavailable"}</span></button></div><p class="deck-help">Swipe left to pass. Swipe right to share your film brief and note.</p>${state.dismissedActorIds.length ? `<button class="deck-reset" type="button" data-review-passed>Review passed actors ↶</button>` : ""}`;
}

function renderFilmmakerInvites() {
  if (!state.invitations.length) { $("#filmmakerInvites").textContent = "No invitations sent yet."; return; }
  $("#filmmakerInvites").innerHTML = state.invitations.map(invite => {
    const actor = state.actors.find(item => item.id === invite.actorId);
    return `<span class="invite-summary ${escapeHtml(invite.status)}">${escapeHtml(actor?.name || "Actor")}: ${escapeHtml(invite.status)}</span>`;
  }).join("");
}

function renderProfile() {
  const actor = state.actors.find(item => item.id === state.selectedActorId) || state.actors[0];
  if (!actor) return;
  $("#actorSelect").innerHTML = state.actors.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === actor.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  $("#currentProfile").innerHTML = `<div class="profile-top"><div class="avatar ${escapeHtml(actor.color)}" aria-hidden="true">${escapeHtml(actor.initials)}</div><div><h3>${escapeHtml(actor.name)}</h3><span>${escapeHtml(actor.year)}</span></div></div><p>${escapeHtml(actor.bio)}</p><div class="data-block"><span class="data-label">STORIES I LIKE</span><div class="tags">${actor.genres.map(x => tag(x,"orange")).join("")}</div></div><div class="data-block"><span class="data-label">SKILLS</span><div class="tags">${actor.skills.map(x => tag(x)).join("")}</div></div><div class="data-block"><span class="data-label">AVAILABLE</span><span class="data-value">${actor.availability.map(escapeHtml).join(" · ")}</span></div><div class="data-block"><span class="data-label">PAST WORK</span><span class="data-value">${escapeHtml(actor.portfolio || "New to student film")}</span></div>`;
}

function renderActorInvites() {
  if (swipeBusy.inbox) return;
  const invites = state.invitations.filter(item => item.actorId === state.selectedActorId);
  const pending = invites.filter(item => item.status === "pending");
  const responded = invites.filter(item => item.status !== "pending");
  $("#inboxCount").textContent = `${pending.length} to review`;
  if (!pending.length) {
    $("#actorInvites").innerHTML = responded.length ? `<div class="empty-state deck-empty"><strong>You're all caught up.</strong>${responded.map(item => `<p>${escapeHtml(state.project.title)} · <span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></p>`).join("")}Your response is saved in this demo.</div>` : `<div class="empty-state deck-empty"><strong>No invitations yet.</strong>In Filmmaker view, invite this actor to see the full brief here.</div>`;
    return;
  }
  const invite = pending[0];
  const p = state.project;
  $("#actorInvites").innerHTML = `<div class="deck-topline"><span>INVITATION 01 / ${String(pending.length).padStart(2, "0")}</span><span>DRAG OR CHOOSE BELOW</span></div><div class="deck-stage"><article class="swipe-card inbox-swipe-card" data-actor-id="${escapeHtml(invite.actorId)}" aria-label="Invitation to ${escapeHtml(p.title)}"><span class="swipe-stamp stamp-left" aria-hidden="true">PASS</span><span class="swipe-stamp stamp-right" aria-hidden="true">INTERESTED</span><div class="invite-topline"><span>FROM ${escapeHtml(p.filmmaker || "A STUDENT FILMMAKER")}</span><span class="status-pill pending">new role</span></div><h4>${escapeHtml(p.title)} <span aria-hidden="true">↗</span></h4><p class="invite-logline">${escapeHtml(p.logline)}</p><div class="brief-grid"><div><span class="data-label">YOUR ROLE</span><span class="data-value">${escapeHtml(p.role)}</span></div><div><span class="data-label">SHOOT WINDOW</span><span class="data-value">${escapeHtml(p.schedule)} · ${escapeHtml(p.commitment)}</span></div></div><div class="data-block"><span class="data-label">THE CHARACTER</span><p class="invite-logline">${escapeHtml(p.roleDescription)}</p></div><div class="data-block"><span class="data-label">TONE</span><span class="data-value">${escapeHtml(p.tone)}</span></div><div class="brief-note"><strong>From the filmmaker:</strong> ${escapeHtml(p.notes || "No additional notes yet.")}</div></article></div><div class="deck-actions"><button type="button" class="deck-action deck-pass" data-deck-action="declined"><span class="deck-action-icon" aria-hidden="true">×</span><span>Pass</span></button><button type="button" class="deck-action deck-invite" data-deck-action="accepted"><span class="deck-action-icon" aria-hidden="true">↗</span><span>I'm interested</span></button></div><p class="deck-help">Swipe left to pass. Swipe right to tell the filmmaker you're interested.</p>`;
}

function renderMode() {
  const actorMode = state.mode === "actor";
  const modeChanged = renderedMode !== null && renderedMode !== state.mode;
  $("#filmmakerView").hidden = actorMode;
  $("#actorView").hidden = !actorMode;
  document.querySelectorAll("[data-mode]").forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll(".cinematic-switch").forEach(group => { group.dataset.active = state.mode; });
  $("#modeHeadline").textContent = actorMode ? "A role you can make your own." : "Your vision. Your ensemble.";
  $("#modeDescription").textContent = actorMode ? "Show your range, read the full story, and choose your next project." : "Shape a role, discover creative fits, and invite your cast.";
  $("#modeCta").textContent = actorMode ? "Find your next role" : "Find your cast";
  $("#workspaceModeLabel").textContent = actorMode ? "02 / ACTOR VIEW" : "01 / FILMMAKER VIEW";
  renderedMode = state.mode;
  if (modeChanged && !reduceMotion) {
    const view = actorMode ? $("#actorView") : $("#filmmakerView");
    view.classList.remove("view-enter");
    void view.offsetWidth;
    view.classList.add("view-enter");
    const preview = $(".mode-preview");
    preview.classList.remove("mode-changing");
    void preview.offsetWidth;
    preview.classList.add("mode-changing");
  }
}

function renderAll() {
  renderMode(); renderProject(); renderMatches(); renderFilmmakerInvites(); renderProfile(); renderActorInvites();
}

function setupMotion() {
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  const groups = [
    [".flavors-heading", 0], [".flavors-grid article:nth-child(1)", 0], [".flavors-grid article:nth-child(2)", 70],
    [".flavors-grid article:nth-child(3)", 140], [".flavors-grid article:nth-child(4)", 210],
    ["#filmmakerView .section-intro .kicker", 0], ["#filmmakerView .section-intro h2", 70], ["#filmmakerView .section-intro p", 140],
    ["#actorView .section-intro .kicker", 0], ["#actorView .section-intro h2", 70], ["#actorView .section-intro p", 140],
    [".project-card", 0], [".recommendations-panel", 100], [".profile-panel", 0], [".invitation-panel", 100],
    [".activity-strip", 0]
  ];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add("revealed");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
  for (const [selector, delay] of groups) {
    const element = $(selector);
    if (!element) continue;
    element.classList.add("reveal");
    element.style.setProperty("--reveal-delay", `${delay}ms`);
    observer.observe(element);
  }
  document.body.classList.add("motion-ready");
}

function setupIntroScroll() {
  const journey = $(".brand-journey");
  const stage = $(".journey-stage");
  const copy = $(".discover-copy");
  const nav = $(".journey-nav");
  const cue = $(".intro-scroll");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scheduled = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const update = () => {
    scheduled = false;
    const animateIntro = !motionPreference.matches && window.innerHeight >= 560;
    document.documentElement.classList.toggle("intro-motion", animateIntro);
    if (!animateIntro) {
      copy.inert = false;
      nav.inert = false;
      cue.inert = false;
      return;
    }
    const width = document.documentElement.clientWidth;
    const height = stage.clientHeight;
    const mobile = width <= 700;
    const travel = Math.max(1, journey.offsetHeight - height);
    const raw = clamp(-journey.getBoundingClientRect().top / travel);
    const progress = smooth(raw / .78);
    const reveal = smooth((raw - .4) / .42);
    const padding = mobile ? 18 : Math.max(28, width * .04);
    const endWidth = mobile ? width - padding * 2 : width * .43;
    const endHeight = mobile ? Math.min(230, height * .28) : Math.min(520, height * .66);
    const endY = mobile ? 64 : (height - endHeight) / 2 + 10;
    const endScale = mobile ? Math.min(.85, (endHeight - 48) / 205) : endWidth / width;
    const values = {
      "--panel-width": `${width + (endWidth - width) * progress}px`,
      "--panel-height": `${height + (endHeight - height) * progress}px`,
      "--panel-x": `${padding * progress}px`,
      "--panel-y": `${endY * progress}px`,
      "--panel-radius": `${24 * progress}px`,
      "--lockup-scale": 1 + (endScale - 1) * progress,
      "--copy-opacity": reveal,
      "--copy-shift": `${(1 - reveal) * (mobile ? 28 : 54)}px`,
      "--nav-opacity": smooth((raw - .5) / .3),
      "--cue-opacity": 1 - smooth(raw / .2),
      "--mobile-copy-top": `${endY + endHeight + 24}px`
    };
    for (const [property, value] of Object.entries(values)) journey.style.setProperty(property, value);
    const interactive = reveal > .75;
    copy.classList.toggle("is-open", interactive);
    nav.classList.toggle("is-open", interactive);
    copy.inert = !interactive;
    nav.inert = !interactive;
    cue.inert = raw > .15;
  };
  const requestUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  motionPreference.addEventListener("change", requestUpdate);
  cue.addEventListener("click", event => {
    if (motionPreference.matches || window.innerHeight < 560) return;
    event.preventDefault();
    const top = window.scrollY + journey.getBoundingClientRect().top + (journey.offsetHeight - stage.clientHeight) * .9;
    window.scrollTo({ top, behavior: "smooth" });
  });
  update();
}

function setupHowScroll() {
  const journey = $(".how-journey");
  const scenes = [...document.querySelectorAll("[data-how-scene]")];
  if (!journey || scenes.length !== 3) return;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const animate = !motionPreference.matches && window.innerHeight >= (window.innerWidth <= 700 ? 680 : 560);
    document.documentElement.classList.toggle("how-motion", animate);
    if (!animate) return;
    const travel = Math.max(1, journey.offsetHeight - window.innerHeight);
    const progress = clamp(-journey.getBoundingClientRect().top / travel);
    scenes.forEach((scene, index) => {
      const position = progress * scenes.length - index;
      let opacity = position < -.32 ? 0 : position < 0 ? smooth((position + .32) / .32) : 1;
      if (index < scenes.length - 1 && position > .68) opacity *= 1 - smooth((position - .68) / .32);
      let offset = 100 * (1 - clamp((position + .15) / .65));
      if (index < scenes.length - 1 && position > .68) offset = -100 * clamp((position - .68) / .4);
      scene.style.setProperty("--how-opacity", opacity.toFixed(3));
      scene.style.setProperty("--how-x", `${offset.toFixed(2)}vw`);
    });
  };
  const requestUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  motionPreference.addEventListener("change", requestUpdate);
  update();
}

function setupWorkspaceShortcut() {
  const cta = $(".intro-cta");
  const workspace = $("#workspace");
  if (!cta || !workspace) return;
  cta.addEventListener("click", event => {
    event.preventDefault();
    const destination = Math.max(0, window.scrollY + workspace.getBoundingClientRect().top - 24);
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    history.pushState(null, "", "#workspace");
    window.scrollTo(0, destination);
    requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
  });
}

document.addEventListener("click", event => {
  if (reduceMotion) return;
  const control = event.target.closest("button, .primary-link");
  if (!control || control.disabled) return;
  control.classList.remove("tap-pop");
  void control.offsetWidth;
  control.classList.add("tap-pop");
  control.addEventListener("animationend", () => control.classList.remove("tap-pop"), { once: true });
});

function populateSelect(select, choices, selected = []) {
  select.innerHTML = choices.map(choice => `<option value="${escapeHtml(choice)}" ${selected.includes(choice) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("");
}

function setFormValues(form, record) {
  for (const [name, value] of Object.entries(record)) {
    const field = form.elements.namedItem(name);
    if (!field || !field.tagName) continue;
    if (field instanceof HTMLSelectElement && field.multiple) populateSelect(field, name === "genres" ? genreChoices : name === "skills" ? skillChoices : scheduleChoices, value);
    else field.value = value ?? "";
  }
}

function selectedValues(field) { return [...field.selectedOptions].map(option => option.value); }

function openProjectDialog() {
  setFormValues($("#projectForm"), state.project);
  $("#projectDialog").showModal();
}
function openProfileDialog() {
  const actor = state.actors.find(item => item.id === state.selectedActorId);
  if (!actor) return;
  setFormValues($("#profileForm"), actor);
  $("#profileDialog").showModal();
}

document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
  state.mode = button.dataset.mode === "actor" ? "actor" : "filmmaker";
  saveState(); renderMode(); renderProfile(); renderActorInvites();
}));
$("#editProjectBtn").addEventListener("click", openProjectDialog);
$("#editProfileBtn").addEventListener("click", openProfileDialog);
$("#availableOnly").addEventListener("change", renderMatches);
$("#actorSelect").addEventListener("change", event => { state.selectedActorId = event.target.value; saveState(); renderProfile(); renderActorInvites(); });
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $("#" + button.dataset.close).close()));

$("#projectForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const genres = selectedValues(form.elements.namedItem("genres"));
  const skills = selectedValues(form.elements.namedItem("skills"));
  if (!genres.length || !skills.length) { showToast("Choose at least one genre and one skill."); return; }
  state.project = { ...state.project, ...values, genres, skills };
  state.dismissedActorIds = [];
  currentMatchActorId = null;
  saveState(); renderAll(); updateMatches(); $("#projectDialog").close(); showToast("Film brief saved. The shortlist is updating.");
});

$("#profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const genres = selectedValues(form.elements.namedItem("genres"));
  const skills = selectedValues(form.elements.namedItem("skills"));
  const availability = selectedValues(form.elements.namedItem("availability"));
  if (!genres.length || !skills.length || !availability.length) { showToast("Choose genres, skills, and availability."); return; }
  const actor = state.actors.find(item => item.id === state.selectedActorId);
  Object.assign(actor, values, { genres, skills, availability, initials: values.name.trim().split(/\s+/).slice(0,2).map(word => word[0].toUpperCase()).join("") });
  saveState(); renderAll(); updateMatches(); $("#profileDialog").close(); showToast("Profile saved. Matches are updating.");
});

function animateDeckAction(deck, direction, commit) {
  if (swipeBusy[deck]) return;
  const container = deck === "matches" ? $("#actorMatches") : $("#actorInvites");
  const card = container.querySelector(".swipe-card");
  if (!card) return;
  swipeBusy[deck] = true;
  container.querySelectorAll(".deck-action").forEach(button => { button.disabled = true; });
  card.style.removeProperty("--drag-x");
  card.style.removeProperty("--drag-rotate");
  card.classList.remove("lean-left", "lean-right");
  card.classList.add(direction === "right" ? "swipe-exit-right" : "swipe-exit-left");
  setTimeout(() => {
    swipeBusy[deck] = false;
    commit();
    saveState();
    renderAll();
  }, reduceMotion ? 0 : 330);
}

function actOnMatch(action) {
  const card = $("#actorMatches .swipe-card");
  const actorId = card?.dataset.actorId;
  if (!actorId || swipeBusy.matches) return;
  const actor = ranked.find(item => item.id === actorId);
  if (!actor) return;
  if (action === "invite" && !actor.available) { showToast("This actor is unavailable for the current shoot window."); return; }
  if (action === "invite" && invitationFor(actorId)) return;
  animateDeckAction("matches", action === "invite" ? "right" : "left", () => {
    currentMatchActorId = null;
    if (action === "invite") {
      state.invitations.push({ actorId, projectId: state.project.id, status: "pending", createdAt: new Date().toISOString() });
      state.selectedActorId = actorId;
      showToast("Film brief and note sent to the actor's demo inbox.");
    } else {
      state.dismissedActorIds.push(actorId);
      showToast("Passed for now. You can review this profile again.");
    }
  });
}

function actOnInvitation(status) {
  const actorId = $("#actorInvites .swipe-card")?.dataset.actorId;
  const invite = actorId && invitationFor(actorId);
  if (!invite || invite.status !== "pending" || swipeBusy.inbox) return;
  animateDeckAction("inbox", status === "accepted" ? "right" : "left", () => {
    invite.status = status;
    showToast(status === "accepted" ? "Interest sent to the filmmaker." : "Invitation declined.");
  });
}

function setupSwipe(container, deck) {
  let gesture = null;
  container.addEventListener("pointerdown", event => {
    if (swipeBusy[deck] || event.target.closest("button, a, input, select")) return;
    const card = event.target.closest(".swipe-card");
    if (!card || (event.pointerType === "mouse" && event.button !== 0)) return;
    gesture = { pointerId: event.pointerId, card, startX: event.clientX, startY: event.clientY, dx: 0 };
    card.setPointerCapture(event.pointerId);
    card.classList.add("dragging");
  });
  container.addEventListener("pointermove", event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dy) > 10) return;
    gesture.dx = dx;
    gesture.card.style.setProperty("--drag-x", `${dx}px`);
    gesture.card.style.setProperty("--drag-rotate", `${Math.max(-11, Math.min(11, dx / 16))}deg`);
    gesture.card.classList.toggle("lean-left", dx < -45);
    gesture.card.classList.toggle("lean-right", dx > 45);
  });
  const finish = event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { card, dx } = gesture;
    gesture = null;
    card.classList.remove("dragging", "lean-left", "lean-right");
    if (event.type !== "pointercancel" && Math.abs(dx) > Math.min(110, card.offsetWidth * .24)) {
      const right = dx > 0;
      if (deck === "matches") actOnMatch(right ? "invite" : "pass");
      else actOnInvitation(right ? "accepted" : "declined");
    }
    if (!swipeBusy[deck]) {
      card.style.removeProperty("--drag-x");
      card.style.removeProperty("--drag-rotate");
    }
  };
  container.addEventListener("pointerup", finish);
  container.addEventListener("pointercancel", finish);
}

$("#actorMatches").addEventListener("click", event => {
  const reset = event.target.closest("[data-review-passed]");
  if (reset) { state.dismissedActorIds = []; currentMatchActorId = null; saveState(); renderMatches(); return; }
  const button = event.target.closest("[data-deck-action]");
  if (button && !button.disabled) actOnMatch(button.dataset.deckAction);
});
$("#actorInvites").addEventListener("click", event => {
  const button = event.target.closest("[data-deck-action]");
  if (button && !button.disabled) actOnInvitation(button.dataset.deckAction);
});
setupSwipe($("#actorMatches"), "matches");
setupSwipe($("#actorInvites"), "inbox");

$("#resetDemoBtn").addEventListener("click", () => {
  if (!confirm("Reset the film brief, actor profiles, and invitations in this browser?")) return;
  localStorage.removeItem(storageKey);
  state = loadState();
  ranked = recommend(state.project, state.actors); engine = "local";
  renderAll(); updateMatches(); showToast("Demo restored to its starting state.");
});

populateSelect($("#projectForm").elements.namedItem("genres"), genreChoices);
populateSelect($("#projectForm").elements.namedItem("skills"), skillChoices);
populateSelect($("#projectForm").elements.namedItem("schedule"), scheduleChoices);
populateSelect($("#profileForm").elements.namedItem("genres"), genreChoices);
populateSelect($("#profileForm").elements.namedItem("skills"), skillChoices);
populateSelect($("#profileForm").elements.namedItem("availability"), scheduleChoices);
renderAll();
setupMotion();
setupIntroScroll();
setupHowScroll();
setupWorkspaceShortcut();
updateMatches();
