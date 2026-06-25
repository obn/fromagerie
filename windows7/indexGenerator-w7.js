const fs = require('fs');
const path = require('path');

const DOSSIER_OUTPUT = path.join(__dirname, 'output');

const NOMS_MOIS = {
  '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
  '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
  '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
};

function listerJournees() {
  const resultat = {}; // { '2026': { '06': ['2026-06-24', ...] } }

  if (!fs.existsSync(DOSSIER_OUTPUT)) return resultat;

  for (const annee of fs.readdirSync(DOSSIER_OUTPUT)) {
    const dossierAnnee = path.join(DOSSIER_OUTPUT, annee);
    if (!/^\d{4}$/.test(annee) || !fs.statSync(dossierAnnee).isDirectory()) continue;

    for (const mois of fs.readdirSync(dossierAnnee)) {
      const dossierMois = path.join(dossierAnnee, mois);
      if (!/^\d{2}$/.test(mois) || !fs.statSync(dossierMois).isDirectory()) continue;

      const dates = fs.readdirSync(dossierMois)
        .filter((f) => f.endsWith('_carnet.html'))
        .map((f) => f.replace('_carnet.html', ''))
        .sort()
        .reverse();

      if (dates.length > 0) {
        resultat[annee] ??= {};
        resultat[annee][mois] = dates;
      }
    }
  }
  return resultat;
}

function genererPageListe() {
  const journees = listerJournees();
  const annees = Object.keys(journees).sort().reverse();

  let blocsHtml = '';
  if (annees.length === 0) {
    blocsHtml = '<p class="vide">Aucune journée générée pour le moment. Lancez "node genererPageJour.js" après avoir traité des PDF.</p>';
  }

  for (const annee of annees) {
    const mois = Object.keys(journees[annee]).sort().reverse();
    blocsHtml += `<h2>${annee}</h2>`;
    for (const m of mois) {
      blocsHtml += `<h3>${NOMS_MOIS[m] || m}</h3><ul class="liste-jours">`;
      for (const date of journees[annee][m]) {
        blocsHtml += `<li><a href="/${annee}/${m}/${date}_carnet.html">${date}</a></li>`;
      }
      blocsHtml += '</ul>';
    }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Journées de commandes</title>
<style>
  body { margin: 0; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    background: #e7e2d3; color: #1a2a4a; padding: 0 16px 40px; }
  header { background: #1a2a4a; color: white; padding: 16px 18px; margin: 0 -16px 18px; }
  header h1 { margin: 0; font-size: 1.15rem; }
  h2 { font-size: 1.1rem; border-bottom: 2px solid #1a2a4a; padding-bottom: 4px; margin-top: 28px; }
  h3 { font-size: 0.95rem; color: #5a5440; margin: 14px 0 6px; }
  ul.liste-jours { list-style: none; margin: 0; padding: 0; }
  ul.liste-jours li { margin-bottom: 6px; }
  ul.liste-jours a { display: block; background: #fbf9f3; padding: 12px 14px; border-radius: 8px;
    color: #1a2a4a; text-decoration: none; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  ul.liste-jours a:active { background: #eef6ec; }
  .vide { color: #8a8470; margin-top: 30px; }
</style>
</head>
<body>
  <header><h1>📋 Journées de commandes</h1></header>
  ${blocsHtml}
</body>
</html>`;
}

function ecrireIndex() {
  const contenu = genererPageListe();
  fs.mkdirSync(DOSSIER_OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(DOSSIER_OUTPUT, 'index.html'), contenu, 'utf8');
}

module.exports = { listerJournees, genererPageListe, ecrireIndex };
