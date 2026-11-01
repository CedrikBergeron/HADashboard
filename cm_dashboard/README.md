# CM Dashboard

Angular dashboard for Home Assistant. Configuration, secrets and uploaded images are stored persistently under `/data/dashboard` and are not included in the app image.

After installation, open the app web interface and hold the clock to access administration.

## Configurations de dashboard

Dans l’administration (maintenir l’heure 1,5 seconde, ou sélectionner l’heure et appuyer sur Entrée), ouvrir **Configurations**.

- **Enregistrer comme nouvelle configuration** : crée une variante indépendante à partir de l’éditeur, y compris les modifications non encore enregistrées, les images, les contrôles et la pièce d’accueil.
- **Charger sur cet iPad** : change uniquement la sélection de cet écran. Sur un autre iPad autorisé connecté au même serveur, ouvrir la même bibliothèque et charger la configuration souhaitée. Aucun transfert de fichier n’est nécessaire.
- **Enregistrer la configuration active** : met à jour la configuration sur le serveur. Les autres écrans utilisant cette configuration retrouvent les modifications au prochain chargement. Dupliquer une configuration pour personnaliser un iPad indépendamment.
- **Dupliquer / Renommer / Archiver** : organise la bibliothèque. Les archives peuvent être rétablies avec « Afficher les archives ». La configuration principale reste toujours disponible. Un écran utilisant une configuration archivée revient à la principale au prochain chargement.
- **Exporter JSON / Importer un fichier** : exporte une configuration sauvegardée ou en ajoute une nouvelle sans écraser les autres. Les images sont référencées sur leur serveur d’origine; il ne s’agit pas d’un export autonome des médias. Les secrets Home Assistant, NIP et autorisations d’appareils restent hors des exports.
- **Système et sauvegardes** : historique de la configuration active, créé avant chaque enregistrement et conservé 30 jours. Une restauration sauvegarde d’abord la version courante et recharge l’écran.

La configuration historique reste dans `data/homes/main.json`. Les configurations nommées se trouvent dans `data/configurations/main/`, avec leur historique dans `history/<id>/`. La sélection active et la pièce d’accueil propre à chaque configuration sont mémorisées dans le navigateur de l’iPad. La pièce d’accueil enregistrée sur le serveur sert de valeur initiale aux nouveaux écrans. La connexion Home Assistant et les appareils autorisés restent communs à la maison.

Validation serveur : `node --test server/configurations.test.mjs`.

### Pièces, étages et entités Home Assistant

Dans l’administration, « Pièce Home Assistant » propose les areas disponibles. Choisir une area propose son nom et son étage, tout en conservant un nom affiché personnalisable. Les étages Home Assistant peuvent aussi être ajoutés depuis « Gérer les étages », puis renommés librement. Les pièces et étages existants ne sont pas remplacés automatiquement.

Les sélecteurs des commandes, du climat et de l’aspirateur cochent par défaut « Afficher uniquement les entités de cette pièce ». L’area affectée directement à une entité a priorité sur celle de son appareil. Décochez pour inclure les autres pièces et les entités sans affectation, y compris les entités présentes uniquement dans les états Home Assistant. Les filtres par type et la recherche restent actifs.

Une pièce sans area, ou dont l’area a été supprimée, propose toutes les entités avec une explication. Une ancienne pièce peut reconnaître une area par un nom identique et unique; son renommage conserve alors la liaison. « Sans area Home Assistant » désactive cette reconnaissance. Les entités déjà configurées sont préservées, même si elles appartiennent à une autre pièce. Le registre des étages reste facultatif pour les anciennes versions de Home Assistant.
