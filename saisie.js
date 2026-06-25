// saisie.js
// Script d'automatisation de saisie de commandes sur l'ERP Zachhee
const { chromium } = require('playwright');

// --- Configuration ---
const BASE_URL = 'http://10.15.50.122/zacheefr6/STSaisieCommandesClients.php?AutoClose=1#';

// --- Données à saisir (à remplacer par le parsing de l'EDI/email plus tard) ---
const commande = {
  client: 'TERMARSTBO', // code client à taper dans le champ Client
  lignes: [
    { recherche: 'CERVELLE', quantite: 1 },
    { recherche: 'APERO EPICE', quantite: 2 },
    // ... etc
  ],
};

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  console.log('Ouverture de la page de saisie...');
  await page.goto(BASE_URL);

  // TODO: remplir le champ Client
  // await page.fill('selecteur_du_champ_client', commande.client);

  // TODO: pour chaque ligne, taper dans le champ Ref. Article,
  // attendre les suggestions, choisir la bonne, remplir la quantité
  for (const ligne of commande.lignes) {
    console.log(`Recherche article: ${ligne.recherche}`);
    // await page.fill('selecteur_ref_article_ligne_X', ligne.recherche);
    // await page.waitForSelector('selecteur_liste_suggestions');
    // await page.click('selecteur_suggestion_correspondante');
    // await page.fill('selecteur_quantite_ligne_X', String(ligne.quantite));
  }

  // TODO: cliquer sur Enregistrer
  // await page.click('selecteur_bouton_enregistrer');

  console.log('Saisie terminée (squelette - sélecteurs à compléter).');
  await browser.close();
})();
