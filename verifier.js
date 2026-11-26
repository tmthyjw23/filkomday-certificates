"use strict";

function findCertificate(records, input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  const matches = records.filter(row => row.number.toLowerCase() === value ||
    (/^\d+$/.test(value) && row.number.split("/")[0] === value.padStart(3, "0")));
  return matches.length === 1 ? matches[0] : null;
}

function verifyFile(record, digest) {
  const revision = record.revisions.find(item => item.sha256 === digest);
  if (!revision) return {message: "This file does not match the recorded version. Please contact the committee for a review.", error: true};
  if (record.status === "revoked") return {message: "This file is on record, but the certificate has been revoked.", error: true};
  if (revision.status !== "valid") return {message: "This file is an older version that has been replaced. Please use the latest revised PDF.", error: true};
  return {message: "This file matches the valid version of the certificate.", error: false};
}

if (typeof module !== "undefined") module.exports = {findCertificate, verifyFile};

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);
  let records = null, current = null;
  const showMessage = (message, error = false) => { $("message").textContent = message; $("message").dataset.error = String(error); };
  function lookup() {
    $("result").hidden = true;
    current = null;
    $("file-result").textContent = "";
    $("pdf").value = "";
    if (!records) return showMessage("The registry is not available yet. Please reload the page.", true);
    const match = findCertificate(records, $("number").value);
    if (!match) return showMessage(records.length ? "Certificate number not found. Check the full number or contact the committee." : "No certificates have been published in this copy yet.", true);
    current = match;
    $("recipient").textContent = match.name;
    $("cert-number").textContent = match.number;
    $("kind").textContent = match.kind === "peserta" ? "Participant" : "Committee";
    $("status").textContent = match.status === "revoked" ? "Certificate revoked" : "Certificate on record and valid";
    $("result").hidden = false;
    showMessage("Issuance record found.");
  }
  $("lookup").addEventListener("submit", event => { event.preventDefault(); lookup(); });
  $("pdf").addEventListener("change", async () => {
    const selected = $("pdf").files[0], checked = current;
    if (!selected || !checked) return;
    if (selected.size > 20 * 1024 * 1024) { $("file-result").textContent = "Please choose a PDF of 20 MB or less."; return; }
    try {
      const buffer = await selected.arrayBuffer();
      const header = new TextDecoder("ascii").decode(buffer.slice(0, 5));
      if (header !== "%PDF-") throw new Error("not-pdf");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map(b => b.toString(16).padStart(2, "0")).join("");
      if (current !== checked) return;
      const result = verifyFile(checked, digest);
      $("file-result").textContent = result.message;
      $("file-result").dataset.error = String(result.error);
    } catch (error) {
      $("file-result").textContent = "The file could not be checked. Use the original PDF and an up-to-date browser over HTTPS.";
      $("file-result").dataset.error = "true";
    }
  });
  try {
    const [data, manifest] = await Promise.all([fetch("registry.json", {cache: "no-store"}), fetch("manifest.json", {cache: "no-store"})]);
    if (!data.ok || !manifest.ok) throw new Error("unavailable");
    const registryText = await data.text(), publication = await manifest.json();
    const registryHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(registryText.replace(/\n+$/, ""))))).map(b => b.toString(16).padStart(2, "0")).join("");
    if (registryHash !== publication.registry_sha256) throw new Error("publication-mismatch");
    const registry = JSON.parse(registryText);
    if (registry.schema_version !== 1 || !Array.isArray(registry.certificates)) throw new Error("schema");
    records = registry.certificates;
    $("updated").textContent = "Copy updated: " + new Date(publication.exported_at).toLocaleString("en-GB", {timeZone: "Asia/Makassar"}) + " WITA (UTC+8)";
    showMessage(records.length ? "Registry ready. Enter a certificate number." : "No certificates have been published in this copy yet.");
    const number = new URLSearchParams(location.search).get("number");
    if (number) { $("number").value = number; lookup(); }
  } catch (error) {
    showMessage("The verification copy is not available. Please try again later or contact the committee.", true);
  }
});
