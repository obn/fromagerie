// parseInput.js
// Lit tous les PDF du dossier "input", détecte le client, et extrait
// une liste normalisée de lignes {client, codeInterne, designation, quantite}
// Sortie : output/commandes.json
//
// Utilise pdftotext -layout (Poppler) pour préserver l'alignement des
// colonnes -- beaucoup plus fiable que l'extraction "texte brut".
// Les images (PNG/JPG/TIFF) sont traitées via Tesseract OCR.
// Prérequis : poppler-utils (pdftotext) et tesseract installés et accessibles dans le PATH.
//   Windows : télécharger poppler pour Windows et ajouter le dossier bin au PATH
//   Windows : installer Tesseract et ajouter le dossier d'installation au PATH
//   ou utiliser WSL où ces outils s'installent via apt.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DOSSIER_INPUT = path.join(__dirname, 'input');
const DOSSIER_OUTPUT = path.join(__dirname, 'output');
const FICHIER_JOURS = path.join(__dirname, 'joursLivraison.json');
if (!fs.existsSync(DOSSIER_OUTPUT)) fs.mkdirSync(DOSSIER_OUTPUT);

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Correspondance entre la clé interne du parseur et le nom utilisé dans joursLivraison.json
const NOM_CANONIQUE = {
  distral: 'DISTRAL',
  scapalyon: 'SCAPA',
  logifresh: 'LOGIFRESH',
};

function chargerJoursLivraison() {
  if (!fs.existsSync(FICHIER_JOURS)) return null;
  try { return JSON.parse(fs.readFileSync(FICHIER_JOURS, 'utf8')); }
  catch { return null; }
}

function equalsIgnoreCase(a, b) {
  return typeof a === 'string' && typeof b === 'string'
    && a.trim().toUpperCase() === b.trim().toUpperCase();
}

// Cherche dans joursLivraison.json quel jour fixe correspond à un nom de client
// (chaque entrée peut être une chaîne ou { nom, _incertain, _note }).
function trouverJourFixe(configJours, nomCanonique) {
  if (!configJours || !nomCanonique) return null;
  for (const jour of JOURS_SEMAINE) {
    const liste = configJours[jour];
    if (!liste) continue;
    for (const entree of liste) {
      const nom = typeof entree === 'string' ? entree : entree.nom;
      if (equalsIgnoreCase(nom, nomCanonique)) return jour;
    }
  }
  return null;
}

// Parse "16/06/26" ou "23/06/2026" -> objet Date (UTC, pour éviter les soucis de fuseau)
function parseDateFr(chaine) {
  if (!chaine) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(chaine.trim());
  if (!m) return null;
  let [, jour, mois, annee] = m;
  if (annee.length === 2) annee = `20${annee}`;
  return new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
}

function formaterDateFr(date) {
  const j = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const a = date.getUTCFullYear();
  return `${j}/${m}/${a}`;
}

// Calcule la prochaine occurrence du jour fixe à partir d'une date de référence
// (la date de référence elle-même si son jour de semaine correspond déjà).
function calculerProchaineDateJour(dateReference, jourCible) {
  const idxCible = JOURS_SEMAINE.indexOf(jourCible);
  if (idxCible === -1) return null;
  const diff = (idxCible - dateReference.getUTCDay() + 7) % 7;
  const resultat = new Date(dateReference);
  resultat.setUTCDate(dateReference.getUTCDate() + diff);
  return resultat;
}

function extraireTexteLayout(cheminPdf) {
  return execFileSync('pdftotext', ['-layout', cheminPdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function estFichierImage(nomFichier) {
  return /\.(png|jpe?g|tiff?|bmp)$/i.test(nomFichier);
}

function extraireTexteImage(cheminImage) {
  return execFileSync('tesseract', [cheminImage, 'stdout', '-l', 'fra'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------
function detecterClient(texte) {
  if (!texte) return 'inconnu';
  const upper = texte.toUpperCase();
  if (upper.includes('FROMDISTRAL.FR') || upper.includes('DISTRAL')) return 'distral';
  if (upper.includes('SCAPALYON.FR')) return 'scapalyon';
  if (upper.includes('LOGIFRESH')) return 'logifresh';
  return 'inconnu';
}

// ---------------------------------------------------------------
// Extrait le numéro de commande, la date de commande et la date de
// livraison au niveau du document (pas ligne par ligne).
// Renvoie null pour un champ quand il n'est pas trouvé dans le PDF.
// ---------------------------------------------------------------
function extraireInfosCommande(texte, client) {
  const infos = { numeroCommande: null, dateCommande: null, dateLivraisonPdf: null };

  if (client === 'distral') {
    infos.numeroCommande = /Commande Fournisseur\s+(\d+)/.exec(texte)?.[1] ?? null;
    infos.dateCommande = /Date de commande:\s*(\d{2}\/\d{2}\/\d{2})/.exec(texte)?.[1] ?? null;
    infos.dateLivraisonPdf = /Date de livraison:\s*(\d{2}\/\d{2}\/\d{2})/.exec(texte)?.[1] ?? null;
  } else if (client === 'scapalyon') {
    infos.numeroCommande = /Bon de commande n°\s*(\S+)/.exec(texte)?.[1] ?? null;
    infos.dateLivraisonPdf = /Date de Livraison souhaitée\s*:\s*(\S+\s+\d{1,2}\s+\S+\s+\d{4})/.exec(texte)?.[1]?.trim() ?? null;
    // Pas de "date de commande" explicite dans ce modèle Scapalyon.
  } else if (client === 'logifresh') {
    infos.numeroCommande = /No commande\s*:\s*(\d+)/.exec(texte)?.[1] ?? null;
    infos.dateCommande = /Date commande\s*:\s*(\d{2}\/\d{2}\/\d{4})/.exec(texte)?.[1] ?? null;
    infos.dateLivraisonPdf = /Date récep\.\s*prév\s*:\s*(\d{2}\/\d{2}\/\d{4})/.exec(texte)?.[1] ?? null;
  }

  return infos;
}

// ---------------------------------------------------------------
// DISTRAL : la colonne "Votre réf." = code interne Zachhee direct
// ---------------------------------------------------------------
function parseDistral(texte) {
  const lignes = [];
  const regex = /(\d{5})\s+(?:([A-Z]{2,4}\d{2,3})\s+)?(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d+)\s+COL/g;
  let m;
  while ((m = regex.exec(texte)) !== null) {
    const [, , votreRef, designation, , quantite] = m;
    lignes.push({
      client: 'distral',
      codeInterne: votreRef || null,
      designation: designation.trim(),
      quantite: parseInt(quantite, 10),
      certitude: votreRef ? 'haute (code interne fourni)' : 'a verifier (recherche par designation)',
    });
  }
  return lignes;
}

// ---------------------------------------------------------------
// LOGIFRESH : grâce au -layout, les lignes produit sont propres :
//   CODE7CHIFFRES   DESIGNATION...   QUANTITE   POIDS_UNITAIRE   UN   Fixe/F   TOTAL
// La désignation peut continuer sur la ligne suivante (ex: "FE STK").
// ---------------------------------------------------------------
function parseLogifresh(texte) {
  const lignes = [];
  const regex = /^\s*(\d{7})\s+(.+?)\s+(\d+)\s+([\d.]+)\s+(UN|U)\s+(F|Fixe)\s+([\d.]+)\s*$/gm;
  let m;
  while ((m = regex.exec(texte)) !== null) {
    const [, code, designation, quantite] = m;
    lignes.push({
      client: 'logifresh',
      codeInterne: code, // code fournisseur, pas un code Zachhee -> recherche par designation
      designation: designation.trim(),
      quantite: parseInt(quantite, 10),
      certitude: 'a verifier (recherche par designation, code = ref fournisseur)',
    });
  }
  return lignes;
}

// ---------------------------------------------------------------
// SCAPALYON : fonctionne pour les lignes SANS le texte d'avertissement
// "Veuillez impérativement...". Quand ce texte est détecté, il est
// physiquement superposé à la ligne produit dans le PDF source --
// l'extraction ne peut pas séparer les deux de façon fiable.
// Ces lignes sont signalées pour vérification manuelle plutôt que
// d'extraire une donnée potentiellement fausse.
// ---------------------------------------------------------------
function parseScapalyon(texte) {
  const lignes = [];
  const lignesTexte = texte.split('\n');

  for (let i = 0; i < lignesTexte.length; i++) {
    const ligne = lignesTexte[i];
    const refMatch = /^(\d{4})\s+/.exec(ligne);
    if (!refMatch) continue;

    if (/Veuillez/.test(ligne)) {
      lignes.push({
        client: 'scapalyon',
        codeInterne: null,
        designation: '(texte superpose dans le PDF source - voir ligne brute)',
        quantite: null,
        ligneBrute: ligne,
        certitude: 'NON FIABLE - verification manuelle obligatoire (chevauchement PDF)',
      });
      continue;
    }

    // ligne propre : "0030    FROMAGE FORT FERMIER BIO L. CRU SEAU    2    4,000 Kg   7,880  ..."
    const m = /^(\d{4})\s+(.+?)\s+(\d+)\s+([\d,]+)\s+(Kg|U)\s/.exec(ligne);
    if (m) {
      const [, , designation, , quantite, unite] = m;
      lignes.push({
        client: 'scapalyon',
        codeInterne: null,
        designation: designation.trim(),
        quantite: parseFloat(quantite.replace(',', '.')),
        unite,
        certitude: 'a verifier (recherche par designation)',
      });
    }
  }
  return lignes;
}

// ---------------------------------------------------------------
(async () => {
  const fichiers = fs.readdirSync(DOSSIER_INPUT)
    .filter((f) => /\.(pdf|png|jpe?g|tiff?|bmp)$/i.test(f));
  const nombrePdf = fichiers.filter((f) => f.toLowerCase().endsWith('.pdf')).length;
  const nombreImages = fichiers.length - nombrePdf;
  console.log(`${fichiers.length} fichier(s) trouvé(s) dans input/ (${nombrePdf} PDF, ${nombreImages} image(s)).`);

  const configJours = chargerJoursLivraison();
  if (!configJours) {
    console.log('ATTENTION : joursLivraison.json introuvable -- la date de livraison ne pourra pas être calculée (jour fixe inconnu).');
  }

  const toutesLesLignes = [];

  for (const fichier of fichiers) {
    const cheminFichier = path.join(DOSSIER_INPUT, fichier);
    const extension = path.extname(fichier).toLowerCase();
    let texte;
    try {
      if (extension === '.pdf') {
        texte = extraireTexteLayout(cheminFichier);
      } else if (estFichierImage(fichier)) {
        texte = extraireTexteImage(cheminFichier);
      } else {
        console.log(`  Fichier ignoré (extension non prise en charge) : ${fichier}`);
        continue;
      }
    } catch (e) {
      if (extension === '.pdf') {
        console.log(`  ERREUR pdftotext sur ${fichier}: ${e.message}`);
        console.log('  -> Vérifiez que poppler-utils est installé et que "pdftotext" est dans le PATH.');
      } else {
        console.log(`  ERREUR tesseract sur ${fichier}: ${e.message}`);
        console.log('  -> Vérifiez que Tesseract est installé et accessible depuis le PATH.');
      }
      continue;
    }

    const client = detecterClient(texte);
    console.log(`\n--- ${fichier} -> client détecté : ${client} ---`);

    let lignes = [];
    if (client === 'distral') lignes = parseDistral(texte);
    else if (client === 'logifresh') lignes = parseLogifresh(texte);
    else if (client === 'scapalyon') lignes = parseScapalyon(texte);
    else {
      console.log('  Client non reconnu, fichier ignoré. Ajoutez un parseur dédié.');
      continue;
    }

    const infosCommande = extraireInfosCommande(texte, client);

    // --- Calcul de la date de livraison à partir du jour fixe du client ---
    const nomCanonique = NOM_CANONIQUE[client] ?? null;
    const estVariable = (configJours?.variable ?? []).some(
      (n) => equalsIgnoreCase(typeof n === 'string' ? n : n.nom, nomCanonique)
    );
    const jourFixe = estVariable ? null : trouverJourFixe(configJours, nomCanonique);
    const dateCommandeObj = parseDateFr(infosCommande.dateCommande) ?? new Date(); // repli : date du jour de traitement

    let dateLivraisonCalculee = null;
    if (jourFixe) {
      const d = calculerProchaineDateJour(dateCommandeObj, jourFixe);
      dateLivraisonCalculee = d ? formaterDateFr(d) : null;
    } else if (estVariable) {
      dateLivraisonCalculee = infosCommande.dateLivraisonPdf; // pas de jour fixe -> on fait confiance au PDF
    }

    infosCommande.jourFixeClient = estVariable ? 'variable' : jourFixe; // "jeudi", "variable", ou null si client inconnu
    infosCommande.dateLivraison = dateLivraisonCalculee; // date OFFICIELLE désormais utilisée partout
    // infosCommande.dateLivraisonPdf reste disponible pour comparaison/contrôle

    if (!jourFixe && !estVariable) {
      console.log(`  ATTENTION : client "${nomCanonique}" absent de joursLivraison.json -- date de livraison non calculée (PDF: ${infosCommande.dateLivraisonPdf ?? 'absente'}).`);
    } else if (estVariable) {
      console.log(`  Client "${nomCanonique}" à jour variable -- date du PDF utilisée telle quelle (${infosCommande.dateLivraisonPdf ?? 'absente'}).`);
    } else if (infosCommande.dateLivraisonPdf && infosCommande.dateLivraisonPdf !== dateLivraisonCalculee) {
      console.log(`  Note : date PDF ("${infosCommande.dateLivraisonPdf}") différente de la date calculée ("${dateLivraisonCalculee}") -- la date calculée est utilisée.`);
    }

    lignes = lignes.map((l) => ({ ...l, ...infosCommande }));

    lignes.forEach((l) => console.log(' ', JSON.stringify(l)));
    toutesLesLignes.push(...lignes);
  }

  const sortie = path.join(DOSSIER_OUTPUT, 'commandes.json');
  fs.writeFileSync(sortie, JSON.stringify(toutesLesLignes, null, 2));

  const aVerifier = toutesLesLignes.filter((l) => l.certitude?.startsWith('NON FIABLE')).length;
  console.log(`\nTerminé. ${toutesLesLignes.length} ligne(s) écrite(s) dans ${sortie}`);
  if (aVerifier > 0) {
    console.log(`ATTENTION : ${aVerifier} ligne(s) signalée(s) "NON FIABLE" -- vérification manuelle requise avant saisie.`);
  }
})();