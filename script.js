/* =========================================================
   script.js
   ---------------------------------------------------------
   WHY FIREBASE INSTEAD OF ONLY localStorage:
   localStorage lives on ONE browser, on ONE device. That's
   the exact problem described: edits made in one browser
   never show up in another. This file stores every room's
   data in a shared Firestore document instead, so every
   browser/device that opens the page listens for changes
   and updates live, in real time.

   If Firestore can't be reached (e.g. no internet), the app
   falls back to localStorage so it still works — but in
   that case it will only sync on that one device.
   ========================================================= */

// ---------- 1. BASIC SETUP ----------
const ROOM_IDS = ["A1", "A2", "A3", "A4", "A5", "A6", "B1", "B2", "B3", "B4", "B5", "B6"];
const RATE = 2700; // ₦ each room owes per month

// In-memory copy of everyone's data: { A1: { tenant: "", paid: 0 }, ... }
let roomsData = {};
ROOM_IDS.forEach(id => { roomsData[id] = { tenant: "", paid: 0, active: true }; });

let isAdmin = sessionStorage.getItem("isAdmin") === "true";
let usingFirestore = false;
let db = null;

// ---------- 2. FORMAT HELPERS ----------
function formatNaira(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG");
}

// ---------- 3. TRY TO CONNECT TO FIRESTORE ----------
function initFirebase() {
  const badge = document.getElementById("syncBadge");
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    usingFirestore = true;

    // Listen for live changes from ANY browser/device.
    // This is what makes edits show up everywhere instantly.
    db.collection("rooms").onSnapshot(
      (snapshot) => {
        badge.textContent = "Synced live";
        badge.className = "sync-badge sync-badge--live";

        snapshot.forEach(doc => {
          const id = doc.id;
          if (!ROOM_IDS.includes(id)) return;
          const data = doc.data();
          roomsData[id] = {
            tenant: data.tenant || "",
            paid: Number(data.paid) || 0,
            // Older saved rooms won't have this field yet — treat them as active.
            active: data.active === undefined ? true : Boolean(data.active)
          };
          updateCardDisplay(id);
        });
        updateDashboard();
      },
      (error) => {
        console.error("Firestore sync error:", error);
        badge.textContent = "Offline (device only)";
        badge.className = "sync-badge sync-badge--offline";
        usingFirestore = false;
        loadFromLocalStorage();
      }
    );
  } catch (err) {
    console.error("Firebase failed to start:", err);
    badge.textContent = "Offline (device only)";
    badge.className = "sync-badge sync-badge--offline";
    usingFirestore = false;
    loadFromLocalStorage();
  }
}

// ---------- 4. localStorage FALLBACK ----------
function saveToLocalStorage() {
  localStorage.setItem("lodgeWaterData", JSON.stringify(roomsData));
}
function loadFromLocalStorage() {
  const saved = localStorage.getItem("lodgeWaterData");
  if (saved) {
    roomsData = JSON.parse(saved);
    ROOM_IDS.forEach(updateCardDisplay);
    updateDashboard();
  }
}

// Saves one room's data wherever it belongs (Firestore if connected, else localStorage)
function saveRoom(id) {
  if (usingFirestore) {
    db.collection("rooms").doc(id).set(roomsData[id]).catch(err => {
      console.error("Save failed, falling back to local storage:", err);
      saveToLocalStorage();
    });
  } else {
    saveToLocalStorage();
  }
}

// ---------- 5. BUILD THE ROOM CARDS (once, on page load) ----------
function buildRoomCards() {
  const grid = document.getElementById("roomsGrid");
  grid.innerHTML = "";

  ROOM_IDS.forEach(id => {
    const card = document.createElement("div");
    card.className = "room-card";
    card.id = `card-${id}`;

    card.innerHTML = `
      <div class="gauge">
        <span class="gauge__goal-tick"></span>
        <div class="gauge__fill" id="gaugeFill-${id}" style="height:0%"></div>
      </div>
      <div class="room-card__body">
        <div class="room-card__head">
          <span class="room-card__room">Room ${id}</span>
          <span class="room-card__status" id="status-${id}"></span>
        </div>

        <div class="room-toggle admin-only">
          <label class="switch">
            <input type="checkbox" id="active-${id}" checked />
            <span class="switch__track"></span>
          </label>
          <span class="room-toggle__label" id="activeLabel-${id}">Room occupied</span>
        </div>

        <div class="field">
          <label for="tenant-${id}">Tenant name</label>
          <input type="text" id="tenant-${id}" placeholder="Enter tenant name" />
        </div>

        <div class="field field--amount">
          <label for="paid-${id}">Amount paid (₦)</label>
          <input type="number" id="paid-${id}" min="0" step="50" placeholder="0" />
        </div>

        <div class="room-card__balance">
          <span>Balance remaining</span>
          <strong id="balance-${id}">${formatNaira(RATE)}</strong>
        </div>
      </div>
    `;
    grid.appendChild(card);

    // Update numbers instantly as the admin types (requirement #9)
    const tenantInput = card.querySelector(`#tenant-${id}`);
    const paidInput = card.querySelector(`#paid-${id}`);

    tenantInput.addEventListener("input", () => {
      roomsData[id].tenant = tenantInput.value;
      saveRoom(id);
      updateDashboard();
    });

    paidInput.addEventListener("input", () => {
      const value = Math.max(0, Number(paidInput.value) || 0);
      roomsData[id].paid = value;
      updateCardDisplay(id, /*skipInputs*/ true); // don't clobber what's mid-typing
      saveRoom(id);
      updateDashboard();
    });

    const activeToggle = card.querySelector(`#active-${id}`);
    activeToggle.addEventListener("change", () => {
      roomsData[id].active = activeToggle.checked;
      updateCardDisplay(id);
      saveRoom(id);
      updateDashboard();
    });
  });

  applyAdminLock(); // grey out inputs until an admin signs in
}

// ---------- 6. REFRESH ONE CARD'S DISPLAY ----------
// skipInputs=true avoids overwriting the exact field the person is typing in.
function updateCardDisplay(id, skipInputs = false) {
  const data = roomsData[id];
  const tenantInput = document.getElementById(`tenant-${id}`);
  const paidInput = document.getElementById(`paid-${id}`);
  if (!tenantInput || !paidInput) return; // cards not built yet

  if (!skipInputs && document.activeElement !== tenantInput) {
    tenantInput.value = data.tenant;
  }
  if (!skipInputs && document.activeElement !== paidInput) {
    paidInput.value = data.paid || "";
  }

  const isActive = data.active !== false;
  const activeToggle = document.getElementById(`active-${id}`);
  if (activeToggle && document.activeElement !== activeToggle) {
    activeToggle.checked = isActive;
  }
  const activeLabel = document.getElementById(`activeLabel-${id}`);
  if (activeLabel) activeLabel.textContent = isActive ? "Room occupied" : "Room vacant";

  const card = document.getElementById(`card-${id}`);
  card.classList.toggle("room-card--vacant", !isActive);

  const paid = Number(data.paid) || 0;
  const balance = Math.max(RATE - paid, 0);
  const isPaid = paid >= RATE;
  const percent = Math.min((paid / RATE) * 100, 100);

  const statusEl = document.getElementById(`status-${id}`);
  const balanceEl = document.getElementById(`balance-${id}`);

  if (!isActive) {
    // Vacant rooms don't owe anything and aren't counted as pending/paid.
    statusEl.textContent = "VACANT";
    statusEl.className = "room-card__status room-card__status--vacant";
    balanceEl.textContent = "—";
  } else {
    balanceEl.textContent = isPaid ? "₦0" : formatNaira(balance);
    statusEl.textContent = isPaid ? "✅ PAID" : "PENDING";
    statusEl.className = "room-card__status " + (isPaid ? "room-card__status--paid" : "room-card__status--pending");
  }

  const gaugeFill = document.getElementById(`gaugeFill-${id}`);
  gaugeFill.style.height = isActive ? percent + "%" : "0%";
  gaugeFill.classList.toggle("is-full", isActive && isPaid);

  // Tenant/paid inputs stay locked for vacant rooms even in admin mode —
  // nothing to type in for an empty room until it's reactivated.
  tenantInput.disabled = !isAdmin || !isActive;
  paidInput.disabled = !isAdmin || !isActive;
}

// ---------- 7. DASHBOARD TOTALS ----------
function updateDashboard() {
  let activeCount = 0;
  let totalCollected = 0;
  let paidCount = 0;

  ROOM_IDS.forEach(id => {
    const room = roomsData[id];
    if (room.active === false) return; // vacant rooms don't owe water dues

    activeCount++;
    const paid = Number(room.paid) || 0;
    // Count only up to the rate so an overpayment doesn't inflate "collected"
    totalCollected += Math.min(paid, RATE);
    if (paid >= RATE) paidCount++;
  });

  const totalExpected = activeCount * RATE;
  const outstanding = totalExpected - totalCollected;

  document.getElementById("statExpected").textContent = formatNaira(totalExpected);
  document.getElementById("statCollected").textContent = formatNaira(totalCollected);
  document.getElementById("statOutstanding").textContent = formatNaira(outstanding);
  document.getElementById("statPaidCount").textContent = `${paidCount} / ${activeCount}`;
  document.getElementById("statActiveCount").textContent = `${activeCount} / ${ROOM_IDS.length}`;
}

// ---------- 8. SEARCH BAR ----------
function setupSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    ROOM_IDS.forEach(id => {
      const card = document.getElementById(`card-${id}`);
      const tenant = (roomsData[id].tenant || "").toLowerCase();
      const matches = id.toLowerCase().includes(query) || tenant.includes(query);
      card.classList.toggle("is-filtered-out", query.length > 0 && !matches);
    });
  });
}

// ---------- 9. ADMIN SIGN IN / LOCK ----------
function applyAdminLock() {
  ROOM_IDS.forEach(id => {
    const isActive = roomsData[id].active !== false;
    const tenantInput = document.getElementById(`tenant-${id}`);
    const paidInput = document.getElementById(`paid-${id}`);
    const activeToggle = document.getElementById(`active-${id}`);
    if (tenantInput) tenantInput.disabled = !isAdmin || !isActive;
    if (paidInput) paidInput.disabled = !isAdmin || !isActive;
    if (activeToggle) activeToggle.disabled = !isAdmin;

    // Only admins get to see/use the vacancy toggle at all.
    const toggleWrap = document.querySelector(`#active-${id}`)?.closest(".room-toggle");
    if (toggleWrap) toggleWrap.classList.toggle("hidden", !isAdmin);
  });

  document.getElementById("adminBtn").classList.toggle("hidden", isAdmin);
  document.getElementById("resetBtn").classList.toggle("hidden", !isAdmin);
  document.getElementById("signOutBtn").classList.toggle("hidden", !isAdmin);
  document.getElementById("adminModeNote").textContent = isAdmin
    ? "Admin mode — editing is unlocked."
    : "Viewing in read-only mode. Sign in as admin to edit.";
}

function setupAdminControls() {
  const adminBtn = document.getElementById("adminBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const modal = document.getElementById("passwordModal");
  const passwordInput = document.getElementById("passwordInput");
  const passwordError = document.getElementById("passwordError");

  adminBtn.addEventListener("click", () => {
    passwordInput.value = "";
    passwordError.classList.add("hidden");
    modal.classList.remove("hidden");
    passwordInput.focus();
  });

  document.getElementById("passwordCancel").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  function tryUnlock() {
    if (passwordInput.value === ADMIN_PASSWORD) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "true");
      applyAdminLock();
      modal.classList.add("hidden");
    } else {
      passwordError.classList.remove("hidden");
    }
  }

  document.getElementById("passwordSubmit").addEventListener("click", tryUnlock);
  passwordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

  signOutBtn.addEventListener("click", () => {
    isAdmin = false;
    sessionStorage.removeItem("isAdmin");
    applyAdminLock();
  });
}

// ---------- 10. RESET NEW MONTH ----------
function setupReset() {
  const resetBtn = document.getElementById("resetBtn");
  const modal = document.getElementById("resetModal");

  resetBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  document.getElementById("resetCancel").addEventListener("click", () => modal.classList.add("hidden"));

  document.getElementById("resetConfirm").addEventListener("click", () => {
    ROOM_IDS.forEach(id => {
      // Keep whatever occupied/vacant status the room already had —
      // a new month shouldn't silently "move someone back in."
      roomsData[id] = { tenant: "", paid: 0, active: roomsData[id].active };
      updateCardDisplay(id);
      saveRoom(id);
    });
    updateDashboard();
    modal.classList.add("hidden");
  });
}

// ---------- 11. START THE APP ----------
document.addEventListener("DOMContentLoaded", () => {
  buildRoomCards();
  updateDashboard();
  setupSearch();
  setupAdminControls();
  setupReset();
  initFirebase(); // will fall back to localStorage automatically if it fails
});
