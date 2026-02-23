const RAMADAN_DAYS = 30;
const USERS_KEY = "shere_ramadan_users_v1";
const SESSION_KEY = "shere_ramadan_session_v1";
const LEGACY_STORAGE_KEY = "shere_ramadan_ul_moazam_state_v1";
const HISTORY_KEY_PREFIX = "shere_ramadan_ul_moazam_history_v3_";
const PBKDF2_ITERATIONS = 120000;
const STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  QAZA: "qaza",
};

const currentHijriDate = getCurrentHijriDate();
const currentHijriYear = currentHijriDate.year;

const state = {
  selectedYear: currentHijriYear,
  history: {},
  currentUser: null,
  authMode: "login",
};

const authCard = document.getElementById("authCard");
const trackerContent = document.getElementById("trackerContent");
const loginTabBtn = document.getElementById("loginTabBtn");
const signupTabBtn = document.getElementById("signupTabBtn");
const authForm = document.getElementById("authForm");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authConfirmPassword = document.getElementById("authConfirmPassword");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
const rememberMeInput = document.getElementById("rememberMeInput");
const authError = document.getElementById("authError");
const authStatusText = document.getElementById("authStatusText");
const logoutBtn = document.getElementById("logoutBtn");
const passwordToggles = document.querySelectorAll("[data-password-toggle]");
const loginTransition = document.getElementById("loginTransition");

const calendarGrid = document.getElementById("calendarGrid");
const timeline = document.getElementById("crescentTimeline");
const timelineFill = document.getElementById("timelineFill");
const dayTemplate = document.getElementById("dayTemplate");

const statCompleted = document.getElementById("statCompleted");
const statStreak = document.getElementById("statStreak");
const statPercent = document.getElementById("statPercent");
const completedCount = document.getElementById("completedCount");
const percentBadge = document.getElementById("percentBadge");
const selectedYearText = document.getElementById("selectedYearText");
const yearBadge = document.getElementById("yearBadge");
const calendarTitle = document.getElementById("calendarTitle");
const prevYearBtn = document.getElementById("prevYearBtn");
const nextYearBtn = document.getElementById("nextYearBtn");
const yearSwitcher = document.getElementById("yearSwitcher");

let trackerBootstrapped = false;

init();

function init() {
  bindAuthControls();
  const rememberedSession = readSession();
  if (rememberedSession) {
    signIn(rememberedSession.email, rememberedSession.remember, false).catch(() => {
      clearSession();
      showAuth();
    });
    return;
  }
  showAuth();
}

function bindAuthControls() {
  loginTabBtn.addEventListener("click", () => switchAuthMode("login"));
  signupTabBtn.addEventListener("click", () => switchAuthMode("signup"));
  authForm.addEventListener("submit", handleAuthSubmit);
  logoutBtn.addEventListener("click", handleLogout);
  bindPasswordToggles();
  switchAuthMode("login");
}

function switchAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";
  const signup = state.authMode === "signup";

  loginTabBtn.classList.toggle("active", !signup);
  signupTabBtn.classList.toggle("active", signup);
  loginTabBtn.setAttribute("aria-selected", String(!signup));
  signupTabBtn.setAttribute("aria-selected", String(signup));

  confirmPasswordGroup.classList.toggle("hidden", !signup);
  authConfirmPassword.required = signup;
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  authSubmitBtn.textContent = signup ? "Create Account" : "Log In";
  resetPasswordVisibility();
  setAuthError("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setAuthError("");

  const email = normalizeEmail(authEmail.value);
  const password = authPassword.value.trim();
  const confirmPassword = authConfirmPassword.value.trim();
  const remember = rememberMeInput.checked;

  const validationMessage = validateAuthInput(email, password, confirmPassword);
  if (validationMessage) {
    setAuthError(validationMessage);
    return;
  }

  if (!window.crypto?.subtle) {
    setAuthError("Secure authentication is not supported on this browser.");
    return;
  }

  authSubmitBtn.disabled = true;
  try {
    if (state.authMode === "signup") {
      await signUpUser(email, password);
    } else {
      await logInUser(email, password);
    }
    await signIn(email, remember, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    setAuthError(message);
  } finally {
    authSubmitBtn.disabled = false;
  }
}

function validateAuthInput(email, password, confirmPassword) {
  if (!email) return "Enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Password must include letters and numbers.";
  if (state.authMode === "signup" && password !== confirmPassword) return "Passwords do not match.";
  return "";
}

function normalizeEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "";
  return normalized;
}

async function signUpUser(email, password) {
  const users = loadUsers();
  if (users[email]) {
    throw new Error("This email is already registered. Please log in.");
  }
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  users[email] = {
    email,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
}

async function logInUser(email, password) {
  const users = loadUsers();
  const user = users[email];
  if (!user?.salt || !user?.hash) {
    throw new Error("No account found for this email.");
  }
  const hash = await hashPassword(password, user.salt);
  if (!secureEqual(hash, user.hash)) {
    throw new Error("Incorrect password.");
  }
}

async function signIn(email, remember, shouldAnimate) {
  state.currentUser = email;
  state.selectedYear = currentHijriYear;
  state.history = loadHistoryForUser(email);
  writeSession(email, remember);
  initTrackerUI();
  refreshUI(false);
  authStatusText.textContent = `Logged in as ${email}`;
  authForm.reset();
  showTracker();
  if (shouldAnimate) {
    await playPostLoginAnimation();
  }
}

function handleLogout() {
  state.currentUser = null;
  state.history = {};
  clearSession();
  showAuth();
}

function showAuth() {
  trackerContent.hidden = true;
  authCard.hidden = false;
  authForm.reset();
  resetPasswordVisibility();
  switchAuthMode("login");
}

function showTracker() {
  authCard.hidden = true;
  trackerContent.hidden = false;
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function writeSession(email, remember) {
  const payload = JSON.stringify({ email, remember: !!remember });
  if (remember) {
    localStorage.setItem(SESSION_KEY, payload);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, payload);
    localStorage.removeItem(SESSION_KEY);
  }
}

function readSession() {
  const sessionRaw = sessionStorage.getItem(SESSION_KEY);
  const localRaw = localStorage.getItem(SESSION_KEY);
  const raw = sessionRaw || localRaw;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const email = normalizeEmail(parsed.email || "");
    if (!email) return null;
    return {
      email,
      remember: !!parsed.remember,
    };
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function getCurrentHijriDate() {
  try {
    const formatter = new Intl.DateTimeFormat("en-TN-u-ca-islamic", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(new Date());
    const year = Number.parseInt(parts.find((part) => part.type === "year")?.value, 10);
    const month = Number.parseInt(parts.find((part) => part.type === "month")?.value, 10);
    const day = Number.parseInt(parts.find((part) => part.type === "day")?.value, 10);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch {
    // Fallback below.
  }
  return { year: 1447, month: 9, day: 1 };
}

function getHistoryStorageKey(email) {
  const encodedEmail = base64Encode(new TextEncoder().encode(email)).replace(/[+/=]/g, "_");
  return `${HISTORY_KEY_PREFIX}${encodedEmail}`;
}

function createEmptyDays() {
  return Array.from({ length: RAMADAN_DAYS }, () => STATUS.PENDING);
}

function normalizeDays(days) {
  if (!Array.isArray(days) || days.length !== RAMADAN_DAYS) {
    return createEmptyDays();
  }
  return days.map((value) => (Object.values(STATUS).includes(value) ? value : STATUS.PENDING));
}

function loadHistoryForUser(email) {
  const key = getHistoryStorageKey(email);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    const normalized = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([year, days]) => {
        normalized[year] = normalizeDays(days);
      });
    }
    return migrateLegacyHistory(normalized, key);
  } catch {
    return migrateLegacyHistory({}, key);
  }
}

function migrateLegacyHistory(history, key) {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) {
      return history;
    }
    const legacy = JSON.parse(legacyRaw);
    if (!history[String(currentHijriYear)] && Array.isArray(legacy) && legacy.length === RAMADAN_DAYS) {
      history[String(currentHijriYear)] = normalizeDays(legacy);
      localStorage.setItem(key, JSON.stringify(history));
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return history;
  } catch {
    return history;
  }
}

function saveHistory() {
  if (!state.currentUser) return;
  const key = getHistoryStorageKey(state.currentUser);
  localStorage.setItem(key, JSON.stringify(state.history));
}

function ensureYearData(year) {
  const key = String(year);
  if (!state.history[key]) {
    state.history[key] = createEmptyDays();
    saveHistory();
  }
}

function getSelectedYearDays() {
  ensureYearData(state.selectedYear);
  return state.history[String(state.selectedYear)];
}

function initTrackerUI() {
  if (trackerBootstrapped) return;
  renderTimeline();
  renderCalendar();
  bindYearControls();
  trackerBootstrapped = true;
}

function renderTimeline() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < RAMADAN_DAYS; i += 1) {
    const item = document.createElement("div");
    item.className = "crescent";
    item.role = "listitem";
    item.setAttribute("aria-label", `Day ${i + 1}`);
    item.dataset.day = String(i + 1);
    frag.append(item);
  }
  timeline.innerHTML = "";
  timeline.append(frag);
}

function renderCalendar() {
  const frag = document.createDocumentFragment();

  for (let i = 0; i < RAMADAN_DAYS; i += 1) {
    const node = dayTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = String(i);

    const dayLabel = node.querySelector(".day-label");
    dayLabel.textContent = `Day ${i + 1}`;

    attachDayGestureHandlers(node, i);
    frag.append(node);
  }

  calendarGrid.innerHTML = "";
  calendarGrid.append(frag);
}

function bindYearControls() {
  prevYearBtn.addEventListener("click", () => shiftYear(-1));
  nextYearBtn.addEventListener("click", () => shiftYear(1));

  let startX = 0;
  let startY = 0;

  yearSwitcher.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
  });

  yearSwitcher.addEventListener("pointerup", (event) => {
    const dx = event.clientX - startX;
    const dy = Math.abs(event.clientY - startY);
    if (Math.abs(dx) > 48 && dy < 26) {
      shiftYear(dx < 0 ? 1 : -1);
    }
  });
}

function shiftYear(delta) {
  if (!state.currentUser) return;
  state.selectedYear += delta;
  ensureYearData(state.selectedYear);
  refreshUI(true);
}

function attachDayGestureHandlers(element, index) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let moved = false;
  let longPressTimer = null;

  const clearTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  element.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    startTime = Date.now();
    moved = false;

    longPressTimer = setTimeout(() => {
      setDayStatus(index, STATUS.QAZA, true);
      moved = true;
    }, 560);
  });

  element.addEventListener("pointermove", (event) => {
    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    if (dx > 8 || dy > 8) {
      moved = true;
    }
    if (dy > 16) {
      clearTimer();
    }
  });

  element.addEventListener("pointerup", (event) => {
    const dx = event.clientX - startX;
    const absDx = Math.abs(dx);
    const elapsed = Date.now() - startTime;
    clearTimer();

    if (absDx > 48) {
      setDayStatus(index, dx > 0 ? STATUS.COMPLETED : STATUS.PENDING, true);
      return;
    }

    if (!moved && elapsed < 540) {
      const current = getSelectedYearDays()[index];
      const next = current === STATUS.COMPLETED ? STATUS.PENDING : STATUS.COMPLETED;
      setDayStatus(index, next, true);
    }
  });

  element.addEventListener("pointercancel", clearTimer);
  element.addEventListener("pointerleave", clearTimer);
}

function setDayStatus(index, status, animate) {
  if (!state.currentUser) return;
  const days = getSelectedYearDays();
  days[index] = status;
  saveHistory();
  refreshUI(animate, index);
}

function refreshUI(animate = false, changedIndex = null) {
  if (!state.currentUser) return;

  const days = getSelectedYearDays();
  const completed = days.filter((s) => s === STATUS.COMPLETED).length;
  const percent = Math.round((completed / RAMADAN_DAYS) * 100);
  const streak = computeCurrentStreak(days);

  selectedYearText.textContent = `${state.selectedYear} AH`;
  calendarTitle.textContent = `Ramadan Tracker • ${state.selectedYear} AH`;

  const current = state.selectedYear === currentHijriYear;
  yearBadge.textContent = current ? "Current Year" : "Past Record";
  yearBadge.classList.toggle("past", !current);

  const dayCards = calendarGrid.querySelectorAll(".day-card");
  dayCards.forEach((card, i) => {
    const status = days[i];
    card.classList.remove(STATUS.PENDING, STATUS.COMPLETED, STATUS.QAZA, "pulse");
    card.classList.add(status);

    const statusLabel = card.querySelector(".day-status");
    statusLabel.textContent = status === STATUS.COMPLETED ? "Completed" : status === STATUS.QAZA ? "Qaza" : "Pending";
    card.setAttribute("aria-label", `Day ${i + 1}, ${statusLabel.textContent}`);

    if (animate && changedIndex === i) {
      card.classList.add("pulse");
    }
  });

  timeline.querySelectorAll(".crescent").forEach((item, i) => {
    item.classList.toggle("done", days[i] === STATUS.COMPLETED);
  });
  timelineFill.style.width = `${percent}%`;

  animateCount(statCompleted, completed);
  animateCount(statStreak, streak);
  statPercent.textContent = `${percent}%`;
  percentBadge.textContent = `${percent}%`;
  completedCount.textContent = String(completed);

  statPercent.classList.add("bump");
  setTimeout(() => statPercent.classList.remove("bump"), 220);
  applyAdaptiveTheme(percent);
}

function computeCurrentStreak(days) {
  let streak = 0;
  let endIndex = RAMADAN_DAYS - 1;

  while (endIndex >= 0 && days[endIndex] === STATUS.PENDING) {
    endIndex -= 1;
  }

  for (let i = endIndex; i >= 0; i -= 1) {
    if (days[i] === STATUS.COMPLETED) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function animateCount(node, value) {
  if (node.textContent !== String(value)) {
    node.textContent = String(value);
    node.classList.add("bump");
    setTimeout(() => node.classList.remove("bump"), 220);
  }
}

function applyAdaptiveTheme(percent) {
  const t = percent / 100;
  const bgTopLight = 11 + 8 * t;
  const bgBottomLight = 8 + 6 * t;
  const accentHue = 39 - 7 * t;
  const accentLight = 62 + 8 * t;

  document.documentElement.style.setProperty("--bg-top", `hsl(220 50% ${bgTopLight.toFixed(1)}%)`);
  document.documentElement.style.setProperty("--bg-bottom", `hsl(232 45% ${bgBottomLight.toFixed(1)}%)`);
  document.documentElement.style.setProperty("--accent", `hsl(${accentHue.toFixed(1)} 84% ${accentLight.toFixed(1)}%)`);
  document.documentElement.style.setProperty("--accent-soft", `hsl(${accentHue.toFixed(1)} 84% 54% / 0.24)`);
}

async function hashPassword(password, saltBase64) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: base64Decode(saltBase64),
    },
    keyMaterial,
    256
  );

  return base64Encode(new Uint8Array(bits));
}

function generateSalt() {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  return base64Encode(salt);
}

function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function setAuthError(message) {
  authError.textContent = message || "";
}

function bindPasswordToggles() {
  passwordToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.getAttribute("data-password-toggle");
      const input = document.getElementById(targetId);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.classList.toggle("active", !showing);
      toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

function resetPasswordVisibility() {
  [authPassword, authConfirmPassword].forEach((input) => {
    if (input) input.type = "password";
  });
  passwordToggles.forEach((toggle) => {
    toggle.classList.remove("active");
    toggle.setAttribute("aria-label", "Show password");
  });
}

async function playPostLoginAnimation() {
  if (!loginTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  loginTransition.hidden = false;
  loginTransition.classList.remove("fade-out");
  requestAnimationFrame(() => {
    loginTransition.classList.add("active");
  });
  await wait(900);
  loginTransition.classList.add("fade-out");
  loginTransition.classList.remove("active");
  await wait(380);
  loginTransition.hidden = true;
  loginTransition.classList.remove("fade-out");
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function base64Encode(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64Decode(input) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
