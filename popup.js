// General Bots - Popup Script
// Handles settings management, authentication, and UI updates

document.addEventListener("DOMContentLoaded", async function () {
  // Default settings
  const DEFAULT_SETTINGS = {
    serverUrl: "https://api.generalbots.com",
    gbServerUrl: "https://api.pragmatismo.com.br",
    enableProcessing: true,
    hideContacts: false,
    autoMode: false,
    grammarCorrection: true,
    whatsappNumber: "",
    authToken: "",
    instanceId: "",
    authenticated: false,
    stats: {
      messagesProcessed: 0,
      correctionsMade: 0,
      autoReplies: 0,
    },
  };

  // Load settings and update UI
  await loadSettings();
  await checkAuthStatus();
  loadStats();

  // Event listeners
  setupEventListeners();

  // Load saved settings
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, function (items) {
        // Update form fields
        document.getElementById("server-url").value =
          items.serverUrl || DEFAULT_SETTINGS.serverUrl;
        document.getElementById("whatsapp-number").value =
          items.whatsappNumber || "";
        document.getElementById("grammar-correction").checked =
          items.grammarCorrection;
        document.getElementById("enable-processing").checked =
          items.enableProcessing;
        document.getElementById("hide-contacts").checked = items.hideContacts;
        document.getElementById("auto-mode").checked = items.autoMode;

        resolve(items);
      });
    });
  }

  // Check authentication status
  async function checkAuthStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAuthStatus" }, (response) => {
        const statusBar = document.getElementById("status-bar");
        const authSection = document.getElementById("auth-section");
        const statusDot = statusBar.querySelector(".status-dot");
        const statusText = statusBar.querySelector(".status-text");

        if (response && response.authenticated) {
          statusBar.classList.add("connected");
          statusBar.classList.remove("disconnected");
          statusDot.style.background = "#22c55e";
          statusText.textContent = `Connected (${response.whatsappNumber || "Authenticated"})`;
          authSection.style.display = "none";
        } else {
          statusBar.classList.add("disconnected");
          statusBar.classList.remove("connected");
          statusDot.style.background = "#ef4444";
          statusText.textContent = "Not connected";
          authSection.style.display = "block";
        }

        resolve(response);
      });
    });
  }

  // Load statistics
  function loadStats() {
    chrome.storage.local.get(["stats"], function (result) {
      const stats = result.stats || DEFAULT_SETTINGS.stats;
      document.getElementById("messages-processed").textContent =
        stats.messagesProcessed || 0;
      document.getElementById("corrections-made").textContent =
        stats.correctionsMade || 0;
      document.getElementById("auto-replies").textContent =
        stats.autoReplies || 0;
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Save settings button
    document
      .getElementById("save-settings")
      .addEventListener("click", saveSettings);

    // Auth button
    document
      .getElementById("auth-btn")
      .addEventListener("click", handleAuthentication);

    // Open options page
    document.getElementById("open-options").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    // Toggle switches - save immediately on change
    const toggles = [
      "grammar-correction",
      "enable-processing",
      "hide-contacts",
      "auto-mode",
    ];
    toggles.forEach((id) => {
      document.getElementById(id).addEventListener("change", function () {
        saveSettings(true); // silent save
      });
    });
  }

  // Save settings
  async function saveSettings(silent = false) {
    const settings = {
      serverUrl: document.getElementById("server-url").value.trim(),
      grammarCorrection: document.getElementById("grammar-correction").checked,
      enableProcessing: document.getElementById("enable-processing").checked,
      hideContacts: document.getElementById("hide-contacts").checked,
      autoMode: document.getElementById("auto-mode").checked,
      whatsappNumber: document.getElementById("whatsapp-number").value.trim(),
    };

    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, function () {
        // Notify content script about settings change
        chrome.tabs.query(
          { url: "https://web.whatsapp.com/*" },
          function (tabs) {
            tabs.forEach((tab) => {
              chrome.tabs.sendMessage(tab.id, {
                action: "settingsUpdated",
                settings: settings,
              });
            });
          },
        );

        if (!silent) {
          showFeedback("save-settings", "Saved!", "success");
        }

        resolve(settings);
      });
    });
  }

  // Handle authentication
  async function handleAuthentication() {
    const numberInput = document.getElementById("whatsapp-number");
    const authBtn = document.getElementById("auth-btn");
    const number = numberInput.value.trim();

    // Validate number
    if (!number) {
      showError(numberInput, "Please enter your WhatsApp number");
      return;
    }

    // Clean number (remove spaces, dashes)
    const cleanNumber = number.replace(/[\s\-\(\)]/g, "");

    // Basic validation
    if (!/^\+?[0-9]{10,15}$/.test(cleanNumber)) {
      showError(numberInput, "Invalid phone number format");
      return;
    }

    // Update button state
    authBtn.disabled = true;
    authBtn.innerHTML = '<span class="btn-icon">⏳</span> Sending request...';

    // Send auth request
    chrome.runtime.sendMessage(
      {
        action: "authenticate",
        whatsappNumber: cleanNumber,
      },
      (response) => {
        if (response && response.success) {
          authBtn.innerHTML =
            '<span class="btn-icon">📱</span> Check your WhatsApp';
          authBtn.classList.add("btn-success");

          // Start polling for auth completion
          pollAuthStatus();
        } else {
          authBtn.disabled = false;
          authBtn.innerHTML =
            '<span class="btn-icon">🤖</span> Authenticate via WhatsApp';

          const errorMsg = response?.error || "Authentication failed";
          showNotification(errorMsg, "error");
        }
      },
    );
  }

  // Poll for authentication status
  function pollAuthStatus(attempts = 0) {
    if (attempts > 60) {
      // 5 minutes max
      showNotification("Authentication timed out. Please try again.", "error");
      resetAuthButton();
      return;
    }

    setTimeout(async () => {
      const response = await checkAuthStatus();

      if (response && response.authenticated) {
        showNotification("Successfully connected!", "success");
        resetAuthButton();
      } else {
        pollAuthStatus(attempts + 1);
      }
    }, 5000);
  }

  // Reset auth button
  function resetAuthButton() {
    const authBtn = document.getElementById("auth-btn");
    authBtn.disabled = false;
    authBtn.classList.remove("btn-success");
    authBtn.innerHTML =
      '<span class="btn-icon">🤖</span> Authenticate via WhatsApp';
  }

  // Show error on input
  function showError(input, message) {
    input.classList.add("error");
    const small = input.parentElement.querySelector("small");
    if (small) {
      small.textContent = message;
      small.classList.add("error-text");
    }

    setTimeout(() => {
      input.classList.remove("error");
      if (small) {
        small.textContent = "Include country code";
        small.classList.remove("error-text");
      }
    }, 3000);
  }

  // Show feedback on button
  function showFeedback(buttonId, message, type = "success") {
    const button = document.getElementById(buttonId);
    const originalHTML = button.innerHTML;
    const originalDisabled = button.disabled;

    button.disabled = true;
    button.innerHTML = `<span class="btn-icon">${type === "success" ? "✓" : "✗"}</span> ${message}`;
    button.classList.add(`btn-${type}`);

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.disabled = originalDisabled;
      button.classList.remove(`btn-${type}`);
    }, 1500);
  }

  // Show notification
  function showNotification(message, type = "info") {
    // Remove existing notification
    const existing = document.querySelector(".popup-notification");
    if (existing) existing.remove();

    const notification = document.createElement("div");
    notification.className = `popup-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
});
