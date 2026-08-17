# Home Dashboard

Tableau de bord Angular avec serveur Node intégré et configuration JSON persistante.

## Développement

Prérequis : Node.js 20 ou 22 LTS.

```bash
npm run dev
```

- Interface Angular : `http://localhost:4200`
- API Node : `http://localhost:3000/api`
- Accès administrateur : maintenir l'heure pendant 1,5 seconde
- NIP local par défaut : `2580`

Pour choisir un autre NIP :

```bash
ADMIN_PIN=un-nip-unique npm run dev
```

## Données

La maison est enregistrée dans `data/homes/main.json`. Les écritures sont atomiques et une copie précédente est placée dans `data/backups/`. Le catalogue Google Material Symbols est actualisé toutes les 24 heures dans `data/cache/`.

En production, définir obligatoirement `ADMIN_PIN`, compiler Angular avec `npm run build`, puis lancer `npm start` derrière HTTPS.
