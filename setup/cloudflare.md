
# RepoRadar - Cloudflare Setup Guide

Deploy RepoRadar on Cloudflare Workers + KV. The free tier is more than enough for personal use. No domain required - you get a free `reporadar.yourusername.workers.dev` URL automatically.

---

## Prerequisites:

- Cloudflare account (free at [cloudflare.com](https://cloudflare.com))
- GitHub Personal Access Token with `repo` scope
  - Go to [github.com/settings/tokens](https://github.com/settings/tokens)
  - Click **Generate new token (classic)**
  - Give it `repo` scope and generate - copy it somewhere safe

---

## Step 1 - Create KV Namespace:

1. Go to [dash.cloudflare.com/?to=/:account/workers/kv/namespaces](https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces)
2. Click **Create namespace**
3. Name it `REPORADAR_KV`
4. Click **Add**

---

## Step 2 - Create Worker:

1. Go to [dash.cloudflare.com/?to=/:account/workers/services/new](https://dash.cloudflare.com/?to=/:account/workers/services/new)
2. Click "Start with Hello World!"
2. Enter `reporadar` as the Worker name (reporadar.yourusername.workers.dev)
3. Click **Deploy**
4. Click **Edit code**
5. Delete everything in the editor and paste in the contents of `cloudflare/worker.js`
6. Click **Deploy**

Your dashboard URL will be:
`https://reporadar.yourusername.workers.dev`

---

## Step 3 - Bind KV Namespace:

1. Go to your Worker settings: [dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings](https://dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings)
2. Scroll to **Bindings** and click **Add**
3. Select **KV Namespace**
4. Variable name: `REPORADAR_KV`
5. KV namespace: select `REPORADAR_KV`
6. Click **Save and deploy**

---

## Step 4 - Add Secrets:

1. Go to [dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings](https://dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings)
2. Scroll to **Variables and Secrets**
3. Click **Add** and add each of the following as type **Secret**:

| Secret name | Value |
|---|---|
| `ADMIN_USER` | Your chosen username |
| `ADMIN_PASS` | Your chosen password |
| `GITHUB_TOKEN` | Your GitHub PAT from Prerequisites |
| `IS_PUBLIC` | `true` to skip login entirely (optional) |

---

## Step 5 - Deploy Dashboard:

1. Go to [dash.cloudflare.com/?to=/:account/workers/kv/namespaces](https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces)
2. Click on **REPORADAR_KV**
3. Click **Add entry**
4. Key: `dashboard_html`
5. Value: paste the entire contents of `dashboard/index.html`
6. Click **Add entry**

Now visit your Worker URL - you should see the RepoRadar login page.

---

## Step 6 - Sign In & Add Repos:

1. Visit `https://reporadar.yourusername.workers.dev`
2. Sign in with your `ADMIN_USER` and `ADMIN_PASS`
3. Go to **Settings**
4. Add repos in `owner/repo` format e.g. `Kyle8973/RepoRadar`

---

## Custom Domain (Optional):

1. Go to your Worker settings: [dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings](https://dash.cloudflare.com/?to=/:account/workers/services/view/reporadar/production/settings)
2. Click **Domains & Routes** -> **Add** -> **Custom domain**
3. Enter your domain e.g. `radar.yourdomain.com`

Cloudflare handles the DNS automatically if your domain is already on Cloudflare.

---

## Updating RepoRadar:

To update, go to your Worker, click **Edit code**, replace everything with the latest `cloudflare/worker.js` and redeploy. Your KV data is always preserved.