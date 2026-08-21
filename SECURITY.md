# Security policy

Do not commit Home Assistant tokens, URLs, entity inventories, room photographs, admin secrets, device registries, or runtime configuration.

Sensitive runtime values belong under `data/`, whose private subdirectories are ignored by Git. Use a unique `ADMIN_PIN`, HTTPS, and a dedicated Home Assistant long-lived access token with the minimum permissions suitable for the dashboard.

If a credential is ever committed, revoke it in Home Assistant immediately. Removing it in a later commit is not sufficient because it remains available in Git history.

Please report security issues privately to the project maintainer rather than opening a public issue.
