# 05 — Security & Roles  (Status: Implemented)

- No public registration; first run creates the super-admin.
- Roles: **Admin** (manage users, roles, global settings, sites) and **User** (search, compare, mark, manage own saved searches).
- Admins can create other admins and users, set/reset passwords, deactivate accounts.
- Admins change role and password from the list (own password included); they delete any account except their own; the last active admin cannot be deleted or demoted; shared purchases, visits and shared notes remain.
- Passwords hashed (Argon2/bcrypt); session tokens with expiry.
- LAN-only by default; HTTPS optional with self-signed cert.
