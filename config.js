/* =========================================================
   config.js
   ---------------------------------------------------------
   This file is the stand-in for a ".env" file.
   Plain HTML/CSS/JS pages have no build step, so they can't
   read a real .env file — the browser can only load actual
   .js files. This file holds the same kind of settings a
   .env file would (secrets/config), kept in its own file so
   you only ever have to edit ONE place.

   Load order in index.html matters: config.js must be
   loaded BEFORE script.js so these values already exist.
   ========================================================= */

// The password an admin types in to unlock editing.
// Change this any time — just save the file.
const ADMIN_PASSWORD = "paymentveri";

// Your Firebase project settings (from the Firebase console).
// This is what makes data sync across every browser/device —
// not just the one that typed it in.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDKNtt1lZORhFjnMSYTpGert0Y5-wNxSP8",
  authDomain: "notepad-5fe30.firebaseapp.com",
  projectId: "notepad-5fe30",
  storageBucket: "notepad-5fe30.firebasestorage.app",
  messagingSenderId: "454347063507",
  appId: "1:454347063507:web:ef42fbfdf0c819ea471426",
  measurementId: "G-TJJ5FKPZ2L"
};
