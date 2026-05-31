# SoloFlow marketing site

Static site served at [soloflow.pmparker.net](https://soloflow.pmparker.net/). Deploy the contents of this folder to any static host (Cloudflare Pages, GitHub Pages, S3, etc.): use **`/`** as the site root so `index.html`, `styles/`, and `scripts/` resolve correctly.

**Regenerate / edit:** change `index.html`, `styles/main.css`, or `scripts/main.js`, then redeploy. Social preview images use the repo’s `docs/readme/website-hero.png` via `raw.githubusercontent.com` — keep that path valid on `main` or update the `og:image` / `twitter:image` URLs in `index.html`.

**Screenshots for the GitHub README** are generated from the live site via `../scripts/readme-screenshots/`.

**VPS (rsync):** from repo root, after SSH key login works (`BatchMode` / non-interactive), set `DEPLOY_PATH` to your Nginx/Caddy `root` and run:

```bash
export DEPLOY_PATH=/your/web/root
./scripts/deploy-website-remote.sh
```

If SSH only accepts passwords, enable `PubkeyAuthentication yes` in `/etc/ssh/sshd_config` on the server, reload `sshd`, then `ssh-copy-id -p PORT -i ~/.ssh/id_ed25519.pub user@host`.
test action trigger
