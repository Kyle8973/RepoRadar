// ============================================================
// K8973-RR-4c4f7h9k-RADAR
//  RepoRadar — Cloudflare Worker
//  Deploy to: your-domain.com or worker.your-domain.com
//
//  Secrets required (set in Cloudflare dashboard):
//    ADMIN_USER     — your chosen username
//    ADMIN_PASS     — your chosen password
//    GITHUB_TOKEN   — GitHub PAT with repo scope
//    IS_PUBLIC      — set to "true" to make dashboard public (optional)
//
//  KV namespace required:
//    REPORADAR_KV   — bind in Worker settings
// ============================================================

// CORS — only the exact origin that serves this Worker is permitted.
// If you use a custom domain, set ALLOWED_ORIGIN in Worker environment variables
// e.g. https://radar.yourdomain.com
// If not set, the Worker derives the allowed origin from its own request URL,
// meaning only YOUR specific workers.dev URL is trusted — not any other Worker.
function getCors(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || ('https://' + new URL(request.url).hostname);
    const originOk = origin === allowed;
    return {
        'Access-Control-Allow-Origin':  originOk ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type':                 'application/json',
        'Cache-Control':                'no-store',
    };
}

// ── Auth ──────────────────────────────────────────────────────
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    if (aBytes.length !== bBytes.length) {
        let diff = 0;
        for (let i = 0; i < aBytes.length; i++) diff |= (aBytes[i] ^ (bBytes[i % bBytes.length] || 0));
        return false;
    }
    let diff = 0;
    for (let i = 0; i < aBytes.length; i++) diff |= (aBytes[i] ^ bBytes[i]);
    return diff === 0;
}

function checkAuth(request, env) {
    if (env.IS_PUBLIC === 'true') return true;
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('Basic ')) return false;
    let decoded;
    try { decoded = atob(header.slice(6)); } catch (e) { return false; }
    const colon = decoded.indexOf(':');
    if (colon === -1) return false;
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);
    return safeEqual(user, env.ADMIN_USER) && safeEqual(pass, env.ADMIN_PASS);
}

function ok(data, cors)              { return new Response(JSON.stringify(data), { headers: cors }); }
function err(msg, cors, status = 400){ return new Response(JSON.stringify({ error: msg }), { status, headers: cors }); }
function unauth(cors)                { return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors }); }

// ── GitHub API helper ─────────────────────────────────────────
async function gh(path, env) {
    const res = await fetch('https://api.github.com' + path, {
        headers: {
            'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
            'Accept':        'application/vnd.github+json',
            'User-Agent':    'RepoRadar/1.0',
        },
    });
    if (!res.ok) return { error: res.status };
    return res.json();
}

// ── KV helpers ────────────────────────────────────────────────
async function getRepos(env) {
    const raw = await env.REPORADAR_KV.get('repos');
    return raw ? JSON.parse(raw) : [];
}
async function saveRepos(env, repos) {
    await env.REPORADAR_KV.put('repos', JSON.stringify(repos));
}
async function getSettings(env) {
    const raw = await env.REPORADAR_KV.get('settings');
    return raw ? JSON.parse(raw) : { theme: 'default', accentColor: '#e2e8f0', customCss: '' };
}
async function saveSettings(env, settings) {
    await env.REPORADAR_KV.put('settings', JSON.stringify(settings));
}

// ── Rate limiting ─────────────────────────────────────────────
// Rate limiting is handled by Cloudflare WAF rules — not in Worker code.
// See setup instructions in the README for how to configure WAF rate limiting.

// ── Main handler ──────────────────────────────────────────────
export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { headers: getCors(request, env) });

        const url    = new URL(request.url);
        const path   = url.pathname;
        const method = request.method;
        const cors   = getCors(request, env);

        // Serve dashboard from KV
        if (method === 'GET' && (path === '/' || path === '/index.html')) {
            const html = await env.REPORADAR_KV.get('dashboard_html');
            if (html) return new Response(html, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
        }

        // Public endpoints
        if (method === 'GET' && path === '/api/ping') {
            return ok({ ok: true, public: env.IS_PUBLIC === 'true' }, cors);
        }

        // Auth check for all /api routes
        if (!checkAuth(request, env)) return unauth(cors);

        // ── Settings ──────────────────────────────────────────
        if (method === 'GET' && path === '/api/settings') {
            return ok(await getSettings(env), cors);
        }
        if (method === 'PUT' && path === '/api/settings') {
            const body = await request.json();
            await saveSettings(env, body);
            return ok(body, cors);
        }

        // ── Repos ─────────────────────────────────────────────
        if (method === 'GET' && path === '/api/repos') {
            return ok(await getRepos(env), cors);
        }
        if (method === 'POST' && path === '/api/repos') {
            const body = await request.json();
            if (!body.full_name || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(body.full_name)) {
                return err('Invalid repo format. Expected owner/repo (e.g. Kyle8973/Tritone)', cors, 400);
            }
            const repos = await getRepos(env);
            if (repos.find(function(r){ return r.full_name === body.full_name; })) {
                return err('Repo already added', cors);
            }
            const repoData = await gh('/repos/' + body.full_name, env);
            if (repoData.error) return err('Repo not found or no access', cors, 404);
            repos.push({
                full_name:   repoData.full_name,
                name:        repoData.name,
                description: repoData.description || '',
                private:     repoData.private,
                added_at:    new Date().toISOString(),
            });
            await saveRepos(env, repos);
            return ok(repos, cors);
        }
        if (method === 'DELETE' && path.startsWith('/api/repos/')) {
            const fullName = decodeURIComponent(path.slice('/api/repos/'.length));
            let repos = await getRepos(env);
            repos = repos.filter(function(r){ return r.full_name !== fullName; });
            await saveRepos(env, repos);
            return ok(repos, cors);
        }

        // ── Watermark strings ──────────────────────────────────
        if (method === 'GET' && path === '/api/watermark-strings') {
            const raw = await env.REPORADAR_KV.get('watermark_strings');
            return ok(raw ? JSON.parse(raw) : [], cors);
        }
        if (method === 'POST' && path === '/api/watermark-strings') {
            const body = await request.json();
            const raw  = await env.REPORADAR_KV.get('watermark_strings');
            const list = raw ? JSON.parse(raw) : [];
            body.id = Date.now().toString();
            list.push(body);
            await env.REPORADAR_KV.put('watermark_strings', JSON.stringify(list));
            return ok(list, cors);
        }
        if (method === 'DELETE' && path.startsWith('/api/watermark-strings/')) {
            const id  = decodeURIComponent(path.slice('/api/watermark-strings/'.length));
            const raw = await env.REPORADAR_KV.get('watermark_strings');
            const list = raw ? JSON.parse(raw) : [];
            const filtered = list.filter(function(w){ return w.id !== id; });
            await env.REPORADAR_KV.put('watermark_strings', JSON.stringify(filtered));
            return ok(filtered, cors);
        }

        // ── GitHub data proxy ─────────────────────────────────
        if (method === 'GET' && path === '/api/overview') {
            const repos = await getRepos(env);
            const data  = await Promise.all(repos.map(async function(r) {
                const [repo, releases, issues] = await Promise.all([
                    gh('/repos/' + r.full_name, env),
                    gh('/repos/' + r.full_name + '/releases?per_page=5', env),
                    gh('/repos/' + r.full_name + '/issues?state=open&per_page=5', env),
                ]);
                let totalDownloads = 0;
                if (Array.isArray(releases)) {
                    releases.forEach(function(rel) {
                        (rel.assets || []).forEach(function(a){ totalDownloads += a.download_count; });
                    });
                }
                return {
                    full_name:   r.full_name,
                    name:        r.name,
                    description: r.description,
                    stars:       repo.stargazers_count || 0,
                    forks:       repo.forks_count || 0,
                    watchers:    repo.subscribers_count || 0,
                    open_issues: repo.open_issues_count || 0,
                    downloads:   totalDownloads,
                    language:    repo.language || '',
                    updated_at:  repo.updated_at,
                };
            }));
            return ok(data, cors);
        }

        // Per-repo GitHub data
        const repoMatch = path.match(/^\/api\/repo\/([^\/]+\/[^\/]+)\/(.+)$/);
        if (repoMatch) {
            const fullName = repoMatch[1];
            const action   = repoMatch[2];
            if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(fullName)) {
                return err('Invalid repo format', cors, 400);
            }

            if (action === 'releases') {
                const data = await gh('/repos/' + fullName + '/releases?per_page=20', env);
                return ok(data, cors);
            }
            if (action === 'traffic') {
                const [views, clones, referrers, paths] = await Promise.all([
                    gh('/repos/' + fullName + '/traffic/views', env),
                    gh('/repos/' + fullName + '/traffic/clones', env),
                    gh('/repos/' + fullName + '/traffic/popular/referrers', env),
                    gh('/repos/' + fullName + '/traffic/popular/paths', env),
                ]);
                return ok({ views, clones, referrers, paths }, cors);
            }
            if (action === 'issues') {
                const open   = await gh('/repos/' + fullName + '/issues?state=open&per_page=20', env);
                const closed = await gh('/repos/' + fullName + '/issues?state=closed&per_page=10', env);
                return ok({ open: Array.isArray(open) ? open : [], closed: Array.isArray(closed) ? closed : [] }, cors);
            }
            if (action === 'pulls') {
                const open   = await gh('/repos/' + fullName + '/pulls?state=open&per_page=20', env);
                const closed = await gh('/repos/' + fullName + '/pulls?state=closed&per_page=10', env);
                return ok({ open: Array.isArray(open) ? open : [], closed: Array.isArray(closed) ? closed : [] }, cors);
            }
            if (action === 'contributors') {
                const data = await gh('/repos/' + fullName + '/contributors?per_page=20', env);
                return ok(Array.isArray(data) ? data : [], cors);
            }
            if (action === 'commits') {
                const data = await gh('/repos/' + fullName + '/commits?per_page=20', env);
                return ok(Array.isArray(data) ? data : [], cors);
            }
            if (action === 'watermark') {
                const query = url.searchParams.get('q') || '';
                if (!query) return err('No query provided', cors);
                const data = await fetch('https://api.github.com/search/code?q=' + encodeURIComponent(query) + '&per_page=30', {
                    headers: {
                        'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
                        'Accept':        'application/vnd.github+json',
                        'User-Agent':    'RepoRadar/1.0',
                    },
                }).then(function(r){ return r.json(); });
                return ok(data, cors);
            }
        }

        return err('Not found', cors, 404);
    },
};