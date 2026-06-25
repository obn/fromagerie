// server.js
// Petit serveur local qui :
//  1) sert les pages générées dans output/ sur le réseau local (pour l'iPad)
//  2) reçoit et sauvegarde l'état de saisie (coches, DLC, lots) dans un
//     fichier JSON historique à côté de chaque page : AAAA-MM-JJ_etat.json
//
// Lancement : node server.js
// Sur l'iPad : http://<IP-du-PC>:3000/2026/06/2026-06-24_carnet.html
// (trouver l'IP du PC avec "ipconfig" dans PowerShell, ligne "Adresse IPv4")

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const DOSSIER_OUTPUT = path.join(__dirname, 'output');
const { genererPageListe } = require('./indexGenerator');

function envoyerJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function cheminEtat(annee, mois, date) {
  return path.join(DOSSIER_OUTPUT, annee, mois, `${date}_etat.json`);
}

function servirFichierStatique(req, res, cheminDemande) {
  const cheminComplet = path.join(DOSSIER_OUTPUT, cheminDemande);
  if (!cheminComplet.startsWith(DOSSIER_OUTPUT)) {
    res.writeHead(403); res.end('Interdit'); return;
  }
  fs.readFile(cheminComplet, (err, contenu) => {
    if (err) { res.writeHead(404); res.end('Fichier introuvable'); return; }
    const ext = path.extname(cheminComplet);
    const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(contenu);
  });
}

const serveur = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const segments = parsed.pathname.split('/').filter(Boolean);

  // API : /api/etat/2026/06/2026-06-24
  if (segments[0] === 'api' && segments[1] === 'etat' && segments.length === 5) {
    const [, , annee, mois, date] = segments;
    const fichierEtat = cheminEtat(annee, mois, date);

    if (req.method === 'GET') {
      fs.readFile(fichierEtat, 'utf8', (err, contenu) => {
        if (err) return envoyerJson(res, 200, {}); // pas encore d'historique pour ce jour
        try { envoyerJson(res, 200, JSON.parse(contenu)); }
        catch { envoyerJson(res, 200, {}); }
      });
      return;
    }

    if (req.method === 'POST') {
      let corps = '';
      req.on('data', (chunk) => { corps += chunk; });
      req.on('end', () => {
        try {
          const etat = JSON.parse(corps);
          fs.mkdirSync(path.dirname(fichierEtat), { recursive: true });
          fs.writeFileSync(fichierEtat, JSON.stringify(etat, null, 2));
          envoyerJson(res, 200, { ok: true });
        } catch (e) {
          envoyerJson(res, 400, { ok: false, erreur: e.message });
        }
      });
      return;
    }
  }

  // Page d'accueil : liste de toutes les journées générées
  if (req.method === 'GET' && (parsed.pathname === '/' || parsed.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(genererPageListe());
    return;
  }

  // Sinon : fichier statique dans output/ (pages HTML, etc.)
  if (req.method === 'GET') {
    servirFichierStatique(req, res, parsed.pathname);
    return;
  }

  res.writeHead(404); res.end('Introuvable');
});

serveur.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur lancé sur http://0.0.0.0:${PORT} (toutes les interfaces réseau)`);
  console.log('Page d\'accueil (liste des journées) :');
  console.log(`  http://<IP-du-PC>:${PORT}/`);
  console.log('Trouvez l\'IP du PC avec "ipconfig" (PowerShell) -> ligne "Adresse IPv4".');
});
