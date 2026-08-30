import { Injectable } from '@angular/core';
import type { DashboardLanguage } from './dashboard-api.service';

const ENGLISH_PHRASES: Array<[string, string]> = [
  ['Maison principale', 'Main home'], ['Ma maison', 'My home'], ['La maison', 'My home'], ['Rez-de-chaussée', 'Ground floor'], ['Sous-sol', 'Basement'],
  ['Salle à Manger', 'Dining room'], ['Salle à manger', 'Dining room'], ['Salle de bain', 'Bathroom'], ['Buanderie', 'Laundry room'], ['Chambre', 'Bedroom'], ['Salon', 'Living room'], ['Entrée', 'Entry'],
  ['Pièces', 'Rooms'], ['Sécurité', 'Security'], ['Apparence', 'Appearance'], ['Système', 'System'], ['Connexion', 'Connection'], ['Caméras', 'Cameras'],
  ['Ajouter une pièce', 'Add room'], ['Nouvelle pièce', 'New room'], ['Gérer les étages', 'Manage floors'], ['Ajouter un étage', 'Add floor'], ['Étage', 'Floor'],
  ['Nom de la maison', 'Home name'], ['Image d’arrière-plan', 'Background image'], ["Image d'arrière-plan", 'Background image'], ['Photo et apparence de cette pièce.', 'Photo and appearance of this room.'],
  ['Choisir une image', 'Choose an image'], ['Position horizontale', 'Horizontal position'], ['Position verticale', 'Vertical position'], ['Luminosité', 'Brightness'], ['Voile sombre', 'Dark overlay'],
  ['Remettre les paramètres par défaut', 'Restore default settings'], ['Paramètres de l’image remis par défaut. Enregistrez pour les appliquer.', 'Image settings restored to defaults. Save to apply them.'],
  ['Équipements et commandes', 'Devices and controls'], ['Ajouter une commande', 'Add control'], ['Aucune commande', 'No controls'], ['Climat', 'Climate'], ['Aspirateur', 'Vacuum'],
  ['Choisir une entité', 'Choose an entity'], ['Rechercher par nom, identifiant ou état…', 'Search by name, ID, or state…'], ['Aucune entité ne correspond à cette recherche.', 'No entity matches this search.'],
  ['Minuterie seulement', 'Timer only'], ['Aucune entité Home Assistant', 'No Home Assistant entity'], ['Langue', 'Language'], ['Anglais', 'English'], ['Français', 'French'],
  ['Réglages globaux appliqués à toutes les pièces.', 'Global settings applied to every room.'], ['Taille de l’interface', 'Interface size'], ['Intensité du verre', 'Glass intensity'],
  ['Réduire les animations', 'Reduce animations'], ['Transitions plus courtes et sans mouvement', 'Shorter transitions with less motion'], ['Format 24 heures', '24-hour format'],
  ['Mode tablette murale', 'Wall tablet mode'], ['Mode tablette', 'Tablet mode'], ['Interface tactile et curseur discret', 'Touch interface with a discreet cursor'], ['Veille après', 'Sleep after'],
  ['Étage par défaut de cet écran', 'Default floor for this display'], ['Ce choix est conservé uniquement sur cette tablette.', 'This choice is stored only on this tablet.'],
  ['Pièce par défaut de cet écran', 'Default room for this display'], ['Cette pièce et son étage seront ouverts au prochain chargement. Ce choix est conservé uniquement sur cette tablette.', 'This room and its floor will open on the next load. This choice is stored only on this tablet.'],
  ['Maison et sécurité', 'Home and security'], ['Accès et ouvertures', 'Access and openings'], ['Serrures, portes, fenêtres et garage', 'Locks, doors, windows, and garage'],
  ['Sécurité vitale', 'Life safety'], ['Fumée, monoxyde, gaz et fuite d’eau', 'Smoke, carbon monoxide, gas, and water leaks'], ['Appareils et système', 'Devices and system'],
  ['Appareils importants', 'Important devices'], ['État du système', 'System status'], ['Durée des bannières', 'Banner duration'], ['secondes', 'seconds'],
  ['Système et sauvegardes', 'System and backups'], ['Actualiser', 'Refresh'], ['Chargement du système…', 'Loading system…'], ['Serveur', 'Server'],
  ['Opérationnel', 'Operational'], ['Attention requise', 'Attention required'], ['Temps actif', 'Uptime'], ['Accessible', 'Available'], ['Indisponible', 'Unavailable'],
  ['Santé technique', 'Technical health'], ['Tout est opérationnel', 'Everything is operational'], ['Non détecté', 'Not detected'], ['Éléments à vérifier', 'Items to check'],
  ['Versions précédentes', 'Previous versions'], ['Restaurer', 'Restore'], ['Aucune sauvegarde disponible pour le moment.', 'No backups are currently available.'],
  ['Connexion active', 'Connection active'], ['Configuration requise', 'Setup required'], ['Adresse Home Assistant', 'Home Assistant address'], ['Nouveau jeton d’accès', 'New access token'],
  ['Coller un jeton longue durée', 'Paste a long-lived token'], ['Tester et enregistrer', 'Test and save'], ['Vérification…', 'Checking…'], ['Fermer', 'Close'], ['Enregistrer', 'Save'],
  ['Modifications appliquées à cette session', 'Changes applied to this session'], ['Choisir une icône', 'Choose an icon'], ['Chargement du catalogue…', 'Loading catalog…'],
  ['icônes affichées', 'icons shown'], ['Afficher 300 de plus', 'Show 300 more'], ['entités compatibles provenant de Home Assistant', 'compatible entities from Home Assistant'],
  ['Déverrouiller la porte?', 'Unlock the door?'], ['La commande a échoué', 'The command failed'], ['Porte', 'Door'], ['Éclairage', 'Lighting'], ['Maison en ordre', 'Home is secure'],
  ['Dans la maison', 'In the home'], ['Météo indisponible', 'Weather unavailable'], ['Ensoleillé', 'Sunny'], ['Dégagé', 'Clear'], ['Nuageux', 'Cloudy'], ['Pluvieux', 'Rainy'],
  ['Neige', 'Snow'], ['Brouillard', 'Fog'], ['Venteux', 'Windy'], ['Orages', 'Thunderstorms'], ['Déverrouillée', 'Unlocked'], ['Allumée', 'On'], ['Ouverte', 'Open'],
  ['Accès administrateur', 'Administrator access'], ['Affichage des derniers états connus. Reconnexion automatique en cours.', 'Showing the latest known states. Reconnecting automatically.'],
  ['Adaptez le tableau de bord à l’écran et à son environnement.', 'Adapt the dashboard to this display and its environment.'], ['Appareils autorisés', 'Authorized devices'],
  ['Ajoutez et organisez librement les niveaux de la maison.', 'Add and organize your home’s floors.'], ['Ajoutez les caméras visibles et leur zone dans la propriété.', 'Add visible cameras and their zones.'],
  ['Ajoutez une pièce pour commencer.', 'Add a room to get started.'], ['Alertes importantes liées à la protection de la résidence.', 'Important alerts related to home security.'],
  ['Allumer', 'Turn on'], ['Appui long', 'Long press'], ['Aucun appareil enregistré. Autorisez celui-ci pour activer la protection.', 'No registered devices. Authorize this device to enable protection.'],
  ['Aucun élément configuré. L’autodétection reste utilisée jusqu’au premier enregistrement.', 'Nothing configured. Automatic detection remains active until the first save.'],
  ['Aucune caméra configurée.', 'No cameras configured.'], ['Aucune caméra dans cette zone', 'No cameras in this zone'], ['Aucune entité sélectionnée', 'No entity selected'],
  ['Aucune image personnalisée. L’image actuelle demeure utilisée.', 'No custom image. The current image remains in use.'], ['Aucune pièce', 'No rooms'],
  ['Autoriser cet appareil', 'Authorize this device'], ['Autoriser cet écran', 'Authorize this display'], ['Autorisez une tablette une seule fois, puis révoquez son accès à tout moment.', 'Authorize a tablet once, then revoke its access at any time.'],
  ['Basculer', 'Toggle'], ['Caméra de la porte', 'Door camera'], ['Carte climat', 'Climate card'], ['Centre de sécurité', 'Security center'], ['Cette pièce', 'This room'],
  ['Choisissez l’entité qui garde le tableau de bord éveillé.', 'Choose the entity that keeps the dashboard awake.'], ['Choisissez l’événement, la caméra et les actions proposées.', 'Choose the event, camera, and available actions.'],
  ['Code d’activation', 'Activation code'], ['Code ou NIP', 'Code or PIN'], ['Configurez le centre de surveillance et l’expérience de la sonnette.', 'Configure monitoring and the doorbell experience.'],
  ['Confirmer le NIP', 'Confirm PIN'], ['Connexion Home Assistant et serveur', 'Home Assistant and server connection'], ['Connexion sécurisée conservée uniquement sur le serveur.', 'Secure connection stored only on the server.'],
  ['Contrôles affichés quand cette pièce est active.', 'Controls shown while this room is active.'], ['Détection de présence', 'Presence detection'], ['Déverrouiller', 'Unlock'],
  ['Entité Home Assistant', 'Home Assistant entity'], ['Entrez un code temporaire ou le NIP administrateur.', 'Enter a temporary code or the administrator PIN.'], ['Entrez votre NIP pour continuer.', 'Enter your PIN to continue.'],
  ['Entrées', 'Entrances'], ['Extérieur', 'Exterior'], ['Icône Material Symbols', 'Material Symbols icon'], ['Icône remplie', 'Filled icon'], ['Ignorer', 'Dismiss'],
  ['Indisponibilité d’un contrôle, climat ou aspirateur affiché', 'An unavailable displayed control, climate device, or vacuum'], ['Infrastructure détectée automatiquement dans Home Assistant.', 'Infrastructure detected automatically in Home Assistant.'],
  ['Intérieur', 'Interior'], ['Le NIP est chiffré et conservé uniquement sur le serveur.', 'The PIN is encrypted and stored only on the server.'], ['Le jeton n’est jamais renvoyé au navigateur après son enregistrement.', 'The token is never returned to the browser after it is saved.'],
  ['Le tableau de bord reste silencieux, sauf lorsqu’une information mérite réellement votre attention.', 'The dashboard stays quiet unless something truly needs your attention.'],
  ['Maintenez l’heure pour mettre à jour la connexion.', 'Press and hold the time to update the connection.'], ['Maison sécurisée', 'Home secure'], ['Mode administrateur', 'Administrator mode'], ['Mode hors ligne', 'Offline mode'],
  ['Modifier la pièce', 'Edit room'], ['NIP administrateur', 'Administrator PIN'], ['Nom de la pièce', 'Room name'], ['Nom de l’écran', 'Display name'], ['Nouveau NIP', 'New PIN'], ['Nouveau code', 'New code'],
  ['Optimisations pour un écran dédié toujours ouvert.', 'Optimizations for an always-on dedicated display.'], ['Ordre d’affichage', 'Display order'], ["Ordre d'affichage", 'Display order'],
  ['Organisez ce qui apparaît dans la navigation de la maison.', 'Organize what appears in the home navigation.'], ['Paramètre de pièce', 'Room parameter'], ['Pause', 'Pause'],
  ['Pièces et étages', 'Rooms and floors'], ['Protégez l’administration et contrôlez le mode veille avec Home Assistant.', 'Protect administration and control sleep mode with Home Assistant.'],
  ['Quelqu’un est à la porte', 'Someone is at the door'], ['Rejoindre la base', 'Return to dock'], ['Retirer cette pièce', 'Remove this room'], ['Retour', 'Back'], ['Robot aspirateur', 'Robot vacuum'],
  ['Révoquer', 'Revoke'], ['Serrure', 'Lock'], ['Sonnette intelligente', 'Smart doorbell'], ['Sonnette', 'Doorbell'], ['Suspendre le nettoyage', 'Pause cleaning'],
  ['Surveillez le serveur et restaurez une configuration précédente.', 'Monitor the server and restore a previous configuration.'], ['Sécurité et veille', 'Security and sleep'], ['Sécurité vidéo', 'Video security'],
  ['Touchez pour ouvrir la maison', 'Tap to open the home'], ['Tout l’étage', 'Entire floor'], ['Toutes', 'All'], ['Vue globale', 'Overview'],
  ['Un étage contenant des pièces ne peut pas être supprimé.', 'A floor containing rooms cannot be deleted.'], ['Une version est créée automatiquement avant chaque enregistrement.', 'A version is created automatically before every save.'],
  ['Au moins un étage doit être conservé. Les pièces d’un étage supprimé seront déplacées vers un autre étage.', 'At least one floor must remain. Rooms from a deleted floor will be moved to another floor.'],
  ['Supprimer «', 'Delete “'], ['» et déplacer ses', '” and move its'], ['vers «', 'to “'], ['»?', '”?'], ['déplacer ses', 'move its'],
  ['Uniquement les équipements utilisés dans ce dashboard.', 'Only devices used by this dashboard.'],
  ['Impossible de', 'Unable to'], ['a échoué', 'failed'], ['Aucune', 'No'], ['Aucun', 'No'], ['Ajouter', 'Add'], ['Choisir', 'Choose'], ['Rechercher', 'Search'], ['Chargement', 'Loading'],
  ['Supprimer', 'Delete'], ['Annuler', 'Cancel'], ['Actualiser', 'Refresh'], ['minute', 'minute'], ['pièce', 'room'], ['étage', 'floor']
];

@Injectable({ providedIn: 'root' })
export class I18nService {
  private language: DashboardLanguage = 'en';
  private observer?: MutationObserver;
  private applying = false;
  private readonly originalText = new WeakMap<Text, string>();
  private readonly originalAttributes = new WeakMap<Element, Map<string, string>>();

  constructor() { queueMicrotask(() => this.start()); }
  get currentLanguage(): DashboardLanguage { return this.language; }
  setLanguage(language: DashboardLanguage): void { this.language = language === 'fr' ? 'fr' : 'en'; document.documentElement.lang = this.language; this.apply(document.body); }
  text(value: string): string { return this.language === 'fr' ? value : ENGLISH_PHRASES.reduce((result, [fr, en]) => result.replaceAll(fr, en), value); }

  private start(): void {
    if (!document.body) return;
    document.documentElement.lang = this.language;
    this.apply(document.body);
    this.observer = new MutationObserver((mutations) => {
      if (this.applying) return;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) this.apply(node);
        if (mutation.type === 'characterData') {
          this.originalText.set(mutation.target as Text, (mutation.target as Text).data);
          this.apply(mutation.target);
        }
      }
    });
    this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  private apply(root: Node | null): void {
    if (!root) return;
    this.applying = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) this.applyText(root as Text);
      if (root.nodeType === Node.ELEMENT_NODE) this.applyElement(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) node.nodeType === Node.TEXT_NODE ? this.applyText(node as Text) : this.applyElement(node as Element);
    } finally { this.observer?.takeRecords(); this.applying = false; }
  }

  private applyText(node: Text): void {
    if (!this.originalText.has(node)) this.originalText.set(node, node.data);
    const original = this.originalText.get(node) ?? node.data;
    const value = this.language === 'fr' ? original : this.text(original);
    if (node.data !== value) node.data = value;
  }

  private applyElement(element: Element): void {
    let originals = this.originalAttributes.get(element);
    if (!originals) { originals = new Map(); this.originalAttributes.set(element, originals); }
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      if (element.hasAttribute(attribute) && !originals.has(attribute)) originals.set(attribute, element.getAttribute(attribute) || '');
      const original = originals.get(attribute);
      if (original !== undefined) element.setAttribute(attribute, this.language === 'fr' ? original : this.text(original));
    }
  }
}
