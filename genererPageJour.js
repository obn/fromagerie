// genererPageJour.js
// Génère une page HTML interactive (case "Fait", saisie DLC + N° de lot)
// à partir de output/commandes.json (produit par parseInput.js).
//
// Usage : node genererPageJour.js
// Sortie : output/carnet_du_jour.html

const fs = require('fs');
const path = require('path');
const { ecrireIndex } = require('./indexGenerator');

const FICHIER_COMMANDES = path.join(__dirname, 'output', 'commandes.json');
const DOSSIER_OUTPUT = path.join(__dirname, 'output');

function echapperHtml(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const JOURS_SEMAINE_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function nomAffichageClient(client) {
  const noms = {
    distral: 'Distral',
    scapalyon: 'Scapalyon',
    logifresh: 'Logifresh',
  };
  return noms[client] || client;
}

function parseDateFr(chaine) {
  if (!chaine) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(chaine.trim());
  if (!m) return null;
  let [, jour, mois, annee] = m;
  if (annee.length === 2) annee = `20${annee}`;
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formaterDateLivraisonAvecJour(chaine) {
  const date = parseDateFr(chaine);
  if (!date) return chaine;
  return `${JOURS_SEMAINE_FR[date.getUTCDay()]} ${chaine}`;
}

function genererLigne(commande, index) {
  const id = `r${index}`;
  const nonFiable = commande.certitude?.startsWith('NON FIABLE');

  if (nonFiable) {
    return `
      <div class="row unsure-row" data-id="${id}">
        <input type="checkbox" class="check">
        <div class="prodline">
          <span class="unsure product" contenteditable="true">⚠ ligne brute (chevauchement PDF, à relire) : "${echapperHtml(commande.ligneBrute)}"</span>
        </div>
        <input class="field" placeholder="DLC">
        <input class="field" placeholder="Lot">
      </div>`;
  }

  const qte = commande.quantite != null ? `${commande.quantite}${commande.unite ? ' ' + commande.unite : ''}` : '?';
  const ref = commande.codeInterne ? ` <input class="ref-input" value="${echapperHtml(commande.codeInterne)}">` : '';
  const aVerifier = commande.certitude?.startsWith('a verifier');

  return `
      <div class="row" data-id="${id}">
        <input type="checkbox" class="check">
        <div class="prodline">
          <span class="qty">${echapperHtml(qte)}</span>
          <input class="product-input ${aVerifier ? 'unsure' : ''}" value="${echapperHtml(commande.designation)}">${ref}
        </div>
        <input class="field" placeholder="DLC">
        <input class="field" placeholder="Lot">
      </div>`;
}

(async () => {
  if (!fs.existsSync(FICHIER_COMMANDES)) {
    console.log(`Fichier introuvable : ${FICHIER_COMMANDES}`);
    console.log('Lancez d\'abord "node parseInput.js" pour générer commandes.json.');
    return;
  }

  const commandes = JSON.parse(fs.readFileSync(FICHIER_COMMANDES, 'utf8'));
  if (commandes.length === 0) {
    console.log('commandes.json est vide -- aucun PDF reconnu dans input/.');
    return;
  }

  // Regroupement par client
  const parClient = {};
  commandes.forEach((c) => {
    (parClient[c.client] ??= []).push(c);
  });

  const clientsTries = Object.entries(parClient).sort(([clientA, lignesA], [clientB, lignesB]) => {
    const refA = lignesA[0];
    const refB = lignesB[0];
    const jourA = refA?.dateLivraison ? parseDateFr(refA.dateLivraison)?.getUTCDay() : 7;
    const jourB = refB?.dateLivraison ? parseDateFr(refB.dateLivraison)?.getUTCDay() : 7;
    if (jourA !== jourB) return jourA - jourB;
    return String(clientA).localeCompare(String(clientB), 'fr', { sensitivity: 'base' });
  });

  const dateAujourdHui = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [annee, mois] = dateAujourdHui.split('-');
  const cleStockage = `carnet-${dateAujourdHui}`;

  const dossierCible = path.join(DOSSIER_OUTPUT, annee, mois);
  fs.mkdirSync(dossierCible, { recursive: true });
  const FICHIER_SORTIE = path.join(dossierCible, `${dateAujourdHui}_carnet.html`);

  let blocsHtml = '';
  let compteur = 0;
  for (const [client, lignes] of clientsTries) {
    const lignesHtml = lignes.map((l) => genererLigne(l, ++compteur)).join('');
    const ref = lignes[0]; // infos de commande identiques pour toutes les lignes d'un même fichier
    const infosCommande = [
      ref.numeroCommande ? `N° ${echapperHtml(ref.numeroCommande)}` : null,
      ref.dateCommande ? `Cdé le ${echapperHtml(ref.dateCommande)}` : null,
      ref.dateLivraison ? `Livr. le ${echapperHtml(formaterDateLivraisonAvecJour(ref.dateLivraison))}` : null,
    ].filter(Boolean).join(' · ');

    blocsHtml += `
    <div class="client-block">
      <div class="client-name">
        ${echapperHtml(nomAffichageClient(client))}
        ${infosCommande ? `<span class="commande-infos">${infosCommande}</span>` : ''}
      </div>
      ${lignesHtml}
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<title>Carnet de commandes — ${dateAujourdHui}</title>
<style>
  :root {
    --paper: #fbf9f3; --ink: #1a2a4a; --unsure-bg: #fff3a0; --muted: #8a8470;
    --line: #ddd7c2; --done-bg: #eef6ec; --accent: #2f6f4f;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #e7e2d3; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; padding-bottom: 80px; }
  header { position: sticky; top: 0; z-index: 10; background: var(--ink); color: white; padding: 14px 18px;
    display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  header h1 { font-size: 1.05rem; margin: 0; font-weight: 600; }
  header .progress { font-size: 0.85rem; opacity: 0.85; }
  .legend { max-width: 900px; margin: 14px auto 4px; padding: 0 14px; font-size: 0.8rem; color: var(--muted);
    display: flex; gap: 16px; flex-wrap: wrap; }
  .legend .swatch { display: inline-block; width: 11px; height: 11px; background: var(--unsure-bg);
    border: 1px solid #d8c400; margin-right: 4px; vertical-align: middle; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 8px 14px 0; }
  .client-block { background: var(--paper); border-radius: 10px; margin-bottom: 16px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.12); overflow: hidden; }
  .client-name { font-weight: 700; color: var(--ink); font-size: 1rem; padding: 10px 12px;
    background: #f2eedf; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
  .client-name .commande-infos { font-size: 0.75rem; font-weight: 500; color: var(--muted); }
  .row { display: grid; grid-template-columns: 44px 1fr 110px 110px; gap: 8px; align-items: center;
    padding: 9px 12px; border-bottom: 1px solid var(--line); transition: background 0.15s; }
  .row:last-child { border-bottom: none; }
  .row.done { background: var(--done-bg); }
  .row.done .prodline { text-decoration: line-through; color: #6b7a6b; }
  .unsure-row { background: #fffaf0; }
  .check { width: 30px; height: 30px; accent-color: var(--accent); cursor: pointer; }
  .prodline { font-size: 0.92rem; color: #222; }
  .product-input { font-size: 0.92rem; border: 1px solid #cfc8af; border-radius: 6px; padding: 6px 8px; margin-left:6px; width: 70%; }
  .ref-input { font-size: 0.82rem; border: 1px solid transparent; background: transparent; padding: 2px 6px; margin-left:6px; color: #4a7a5a; }
  .prodline .qty { font-weight: 700; color: var(--ink); margin-right: 6px; }
  .prodline .ref { color: #4a7a5a; font-size: 0.82rem; }
  .unsure { background: var(--unsure-bg); padding: 0 2px; border-radius: 2px; }
  input.field { width: 100%; border: 1px solid #cfc8af; border-radius: 6px; padding: 7px 6px;
    font-size: 0.85rem; background: white; text-align: center; }
  input.field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(47,111,79,0.25); }
  .col-label { font-size: 0.65rem; text-transform: uppercase; color: var(--muted); text-align: center; letter-spacing: 0.03em; }
  .head-row { display: grid; grid-template-columns: 44px 1fr 110px 110px; gap: 8px; padding: 4px 12px 0; }
  .footer-note { max-width: 900px; margin: 18px auto 0; padding: 0 14px; font-size: 0.78rem; color: var(--muted); }
  #resetBtn { background: #b3261e; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 0.8rem; }
  .statut-bar { max-width: 900px; margin: 8px auto 0; padding: 0 14px; font-size: 0.78rem; color: var(--accent); text-align: right; }
</style>
</head>
<body>

  <header>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <a href="/index.html" style="color:white;text-decoration:none;font-weight:600;">← Index</a>
      <h1 style="margin:0;">${dateAujourdHui} — Carnet de commandes</h1>
    </div>
    <span class="progress" id="progress">0 / 0 fait</span>
  </header>
  <div class="statut-bar" id="statutSauvegarde">Chargement de l'historique…</div>

  <div class="legend">
    <span><span class="swatch"></span> à vérifier (lecture PDF incertaine)</span>
    <span>Généré automatiquement depuis ${commandes.length} ligne(s) de commande</span>
  </div>

  <div class="wrap">
    <div class="head-row">
      <span></span><span class="col-label">Produit</span><span class="col-label">DLC</span><span class="col-label">N° lot</span>
    </div>
    ${blocsHtml}
  </div>

  <p class="footer-note">
    Page générée automatiquement depuis les PDF du dossier input/. Les coches, DLC et numéros de lot sont
    envoyés au serveur local et écrits dans un vrai fichier historique
    (output/${annee}/${mois}/${dateAujourdHui}_etat.json) — consultable, archivable, exploitable plus tard.
    Le serveur (node server.js) doit être lancé et accessible depuis l'iPad pour que la sauvegarde fonctionne.
  </p>
  <div class="footer-note" style="text-align:right;">
    <button id="resetBtn">Réinitialiser la journée</button>
  </div>

  <script>
    const ANNEE = '${annee}';
    const MOIS = '${mois}';
    const DATE = '${dateAujourdHui}';
    const URL_ETAT = \`/api/etat/\${ANNEE}/\${MOIS}/\${DATE}\`;

    const rows = document.querySelectorAll('.row[data-id]');
    const progressEl = document.getElementById('progress');
    const statutEl = document.getElementById('statutSauvegarde');

    function updateProgress() {
      const total = rows.length;
      const done = document.querySelectorAll('.check:checked').length;
      progressEl.textContent = done + ' / ' + total + ' fait';
    }

    let delaiSauvegarde = null;
    function declencherSauvegarde() {
      statutEl.textContent = 'Enregistrement…';
      clearTimeout(delaiSauvegarde);
      delaiSauvegarde = setTimeout(saveState, 400); // on regroupe les frappes rapprochées
    }

    async function saveState() {
      const state = {};
      rows.forEach((row) => {
        const id = row.dataset.id;
        const checkbox = row.querySelector('.check');
        const fields = row.querySelectorAll('.field');
        const productEl = row.querySelector('.product-input');
        const refEl = row.querySelector('.ref-input');
        const produit = productEl ? productEl.value.trim() : '';
        const codeInterne = refEl ? refEl.value.trim() : '';
        state[id] = { done: checkbox.checked, dlc: fields[0].value, lot: fields[1].value, produit, codeInterne };
      });
      try {
        const reponse = await fetch(URL_ETAT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        if (!reponse.ok) throw new Error('reponse serveur non OK');
        statutEl.textContent = 'Enregistré ✓';
      } catch (e) {
        statutEl.textContent = 'Échec d\\'enregistrement — vérifiez la connexion au serveur';
        console.warn('Sauvegarde impossible:', e);
      }
    }

    async function loadState() {
      let state = {};
      try {
        const reponse = await fetch(URL_ETAT);
        state = await reponse.json();
      } catch (e) {
        console.warn('Lecture de l\\'historique impossible:', e);
        statutEl.textContent = 'Historique introuvable (serveur non joignable ?)';
      }
      rows.forEach((row) => {
        const saved = state[row.dataset.id];
        if (!saved) return;
        const checkbox = row.querySelector('.check');
        const fields = row.querySelectorAll('.field');
        checkbox.checked = !!saved.done;
        row.classList.toggle('done', checkbox.checked);
        fields[0].value = saved.dlc || '';
        fields[1].value = saved.lot || '';
        const productEl = row.querySelector('.product-input');
        if (productEl && typeof saved.produit !== 'undefined') productEl.value = saved.produit;
        const refEl = row.querySelector('.ref-input');
        if (refEl && typeof saved.codeInterne !== 'undefined') refEl.value = saved.codeInterne;
      });
      updateProgress();
    }

    rows.forEach((row) => {
      const checkbox = row.querySelector('.check');
      const fields = row.querySelectorAll('.field');
      const productEl = row.querySelector('.product-input');
      const refEl = row.querySelector('.ref-input');
      checkbox.addEventListener('change', () => {
        row.classList.toggle('done', checkbox.checked);
        updateProgress();
        declencherSauvegarde();
      });
      fields.forEach((field) => field.addEventListener('input', declencherSauvegarde));
      if (productEl) productEl.addEventListener('input', declencherSauvegarde);
      if (refEl) refEl.addEventListener('input', declencherSauvegarde);
    });

    document.getElementById('resetBtn').addEventListener('click', async () => {
      if (confirm('Effacer toutes les coches, DLC et numéros de lot saisis pour cette journée ? (le fichier historique sera remplacé par un état vide)')) {
        rows.forEach((row) => {
          row.querySelector('.check').checked = false;
          row.classList.remove('done');
          row.querySelectorAll('.field').forEach((f) => (f.value = ''));
          const p = row.querySelector('.product-input'); if (p) p.value = '';
          const r = row.querySelector('.ref-input'); if (r) r.value = '';
        });
        updateProgress();
        await saveState();
      }
    });

    loadState();
  </script>
</body>
</html>`;

  fs.writeFileSync(FICHIER_SORTIE, html);
  ecrireIndex();
  console.log(`Page générée : ${FICHIER_SORTIE}`);
  console.log('Index statique mis à jour : output/index.html');
  console.log(`${commandes.length} ligne(s) de commande, ${Object.keys(parClient).length} client(s).`);
})();
