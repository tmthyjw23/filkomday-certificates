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
  if (!revision) return {message: "Berkas berbeda dari versi yang tercatat. Hubungi panitia untuk pemeriksaan.", error: true};
  if (record.status === "revoked") return {message: "Berkas tercatat, tetapi sertifikat ini telah dicabut.", error: true};
  if (revision.status !== "valid") return {message: "Berkas ini merupakan versi lama yang sudah diganti. Gunakan PDF revisi terbaru.", error: true};
  return {message: "Berkas cocok dengan versi sertifikat yang berlaku.", error: false};
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
    if (!records) return showMessage("Daftar belum tersedia. Coba muat ulang halaman.", true);
    const match = findCertificate(records, $("number").value);
    if (!match) return showMessage(records.length ? "Nomor belum ditemukan. Periksa nomor lengkap atau hubungi panitia." : "Belum ada sertifikat yang dipublikasikan pada salinan ini.", true);
    current = match;
    $("recipient").textContent = match.name;
    $("cert-number").textContent = match.number;
    $("kind").textContent = match.kind === "peserta" ? "Peserta" : "Panitia";
    $("status").textContent = match.status === "revoked" ? "Sertifikat dicabut" : "Sertifikat tercatat dan berlaku";
    $("result").hidden = false;
    showMessage("Catatan penerbitan ditemukan.");
  }
  $("lookup").addEventListener("submit", event => { event.preventDefault(); lookup(); });
  $("pdf").addEventListener("change", async () => {
    const selected = $("pdf").files[0], checked = current;
    if (!selected || !checked) return;
    if (selected.size > 20 * 1024 * 1024) { $("file-result").textContent = "Pilih PDF maksimal 20 MB."; return; }
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
      $("file-result").textContent = "Berkas belum dapat diperiksa. Gunakan PDF asli dan browser terbaru melalui HTTPS.";
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
    $("updated").textContent = "Salinan diperbarui: " + new Date(publication.exported_at).toLocaleString("id-ID", {timeZone: "Asia/Makassar"}) + " WITA";
    showMessage(records.length ? "Daftar siap diperiksa." : "Belum ada sertifikat yang dipublikasikan pada salinan ini.");
    const number = new URLSearchParams(location.search).get("number");
    if (number) { $("number").value = number; lookup(); }
  } catch (error) {
    showMessage("Salinan verifikasi belum tersedia. Coba kembali atau hubungi panitia.", true);
  }
});
