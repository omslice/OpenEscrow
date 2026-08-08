const DEFAULT_MVP_URL = "https://openescrow-demo.omrigross.chatgpt.site/";
const DEFAULT_SOURCE_URL = "https://github.com/omslice/OpenEscrow";

const normalizePublicUrl = (value, fallback) => {
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : fallback;
  } catch {
    return fallback;
  }
};

const mvpUrl = normalizePublicUrl(import.meta.env.VITE_MVP_URL, DEFAULT_MVP_URL);
const sourceUrl = normalizePublicUrl(
  import.meta.env.VITE_SOURCE_URL,
  DEFAULT_SOURCE_URL,
);

document.querySelectorAll("[data-mvp-link]").forEach((link) => {
  link.setAttribute("href", mvpUrl);
});

document.querySelectorAll("[data-source-link]").forEach((link) => {
  link.setAttribute("href", sourceUrl);
});

const currentYear = document.querySelector("#current-year");
if (currentYear) currentYear.textContent = String(new Date().getFullYear());

const copyButton = document.querySelector("#copy-donation");
const copyStatus = document.querySelector("#copy-status");
const donationAddress = "omslice.eth";

copyButton?.addEventListener("click", async () => {
  if (!copyStatus) return;
  copyStatus.classList.remove("error");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(donationAddress);
    copyStatus.textContent = "Donation address copied.";
  } catch {
    copyStatus.classList.add("error");
    copyStatus.textContent =
      "We could not copy the address. Select omslice.eth and copy it manually.";
  }
});
