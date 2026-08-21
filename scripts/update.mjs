import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const login = process.env.GITHUB_LOGIN || 'Vasysik';
const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN or PROFILE_TOKEN is required');

const now = new Date();
const year = now.getUTCFullYear();
const from = new Date(Date.UTC(year, 0, 1)).toISOString();
const to = now.toISOString();

const query = `
query Profile($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login:$login) {
    login name url followers { totalCount }
    repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, orderBy:{field:UPDATED_AT,direction:DESC}) {
      totalCount
      nodes {
        name url description stargazerCount forkCount updatedAt
        primaryLanguage { name }
        languages(first:10, orderBy:{field:SIZE,direction:DESC}) { edges { size node { name } } }
      }
    }
    contributionsCollection(from:$from, to:$to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
  }
}`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    authorization: `bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'vasysik-profile-readme'
  },
  body: JSON.stringify({ query, variables: { login, from, to } })
});
if (!response.ok) throw new Error(`GitHub GraphQL HTTP ${response.status}: ${await response.text()}`);
const payload = await response.json();
if (payload.errors) throw new Error(JSON.stringify(payload.errors));
const u = payload.data.user;
if (!u) throw new Error(`GitHub user ${login} not found`);

const repos = u.repositories.nodes || [];
const cc = u.contributionsCollection;
const stars = repos.reduce((n, r) => n + r.stargazerCount, 0);
const forks = repos.reduce((n, r) => n + r.forkCount, 0);
const langMap = new Map();
for (const repo of repos) {
  for (const edge of repo.languages?.edges || []) {
    langMap.set(edge.node.name, (langMap.get(edge.node.name) || 0) + edge.size);
  }
}
const langTotal = [...langMap.values()].reduce((a,b)=>a+b,0) || 1;
const languages = [...langMap.entries()]
  .map(([name, bytes]) => ({ name, bytes, percent: bytes / langTotal * 100 }))
  .sort((a,b) => b.bytes - a.bytes)
  .slice(0,5);

const topRepos = [...repos]
  .sort((a,b) => b.stargazerCount-a.stargazerCount || b.forkCount-a.forkCount || new Date(b.updatedAt)-new Date(a.updatedAt))
  .slice(0,3)
  .map(r => ({
    name:r.name, url:r.url, description:r.description || '', stars:r.stargazerCount,
    forks:r.forkCount, language:r.primaryLanguage?.name || '—'
  }));

const total = cc.contributionCalendar.totalContributions;
// This number is intentionally an activity-derived visual identifier, NOT a GitHub metric.
const hash = crypto.createHash('sha256').update(`${login}:${year}:${total}:${stars}:${forks}`).digest('hex');
const n = BigInt('0x' + hash.slice(0, 10)).toString().padStart(10, '0');
const divergence = `${Number(n[0]) % 2}.${n.slice(1,7)}`;

const data = {
  generatedAt: now.toISOString(), year,
  user: { login:u.login, name:u.name || u.login, url:u.url, repositories:u.repositories.totalCount, followers:u.followers.totalCount },
  totals: {
    contributions: total, commits:cc.totalCommitContributions, pullRequests:cc.totalPullRequestContributions,
    issues:cc.totalIssueContributions, reviews:cc.totalPullRequestReviewContributions,
    restricted:cc.restrictedContributionsCount, stars, forks
  },
  divergence,
  calendar: cc.contributionCalendar.weeks.flatMap((w, weekIndex) => w.contributionDays.map(d => ({...d, weekIndex}))),
  languages, repositories:topRepos
};

await fs.mkdir(new URL('../assets/generated/', import.meta.url), {recursive:true});
await fs.writeFile(new URL('../assets/generated/data.json', import.meta.url), JSON.stringify(data,null,2)+'\n');

const esc = (v='') => String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const fmt = n => new Intl.NumberFormat('en-US').format(n);
const trunc = (s,n) => s.length <= n ? s : s.slice(0,n-1)+'…';

function theme(mode) {
  return mode === 'light' ? {
    bg:'#f3f0e7', panel:'#ece8dc', line:'#746c57', hair:'#c6bfad', text:'#302f28', muted:'#716d60', phosphor:'#385e3b', hot:'#a65022', empty:'#ddd8ca', levels:['#d7ddd0','#b3c7a8','#819f78','#537449']
  } : {
    bg:'#0b0d0b', panel:'#0e110e', line:'#4b4738', hair:'#24271f', text:'#c4c8ad', muted:'#777c69', phosphor:'#9bc67f', hot:'#e88942', empty:'#171b17', levels:['#253026','#3b5038','#5f8056','#91bd78']
  };
}

function svgStart(w,h,c,title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <rect width="${w}" height="${h}" rx="10" fill="${c.bg}"/>
  <rect x="0.5" y="0.5" width="${w-1}" height="${h-1}" rx="9.5" fill="none" stroke="${c.line}"/>
  <style>
    .m{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .label{font-size:11px;letter-spacing:1.35px}
    .small{font-size:12px}.body{font-size:13px}.value{font-size:15px;font-weight:600}
  </style>`;
}

function renderHero(data, mode) {
  const c=theme(mode), W=920,H=214;
  const repo=data.repositories[0] || {name:'—',language:'—',stars:0,forks:0};
  let s=svgStart(W,H,c,`Vasysik profile observation record (${mode})`);
  // restrained frame / reference marks
  s += `<path d="M22 35H360 M430 35H898" stroke="${c.hair}"/><text x="22" y="25" fill="${c.muted}" class="m label">OBSERVATION RECORD / 004</text>`;
  s += `<text x="22" y="79" fill="${c.phosphor}" class="m" font-size="31" font-weight="700">VASYSIK</text>`;
  s += `<text x="22" y="102" fill="${c.muted}" class="m small">github.com/Vasysik  ·  EL PSY KONGROO</text>`;
  const metrics=[['REPOS',data.user.repositories],['FOLLOWERS',data.user.followers],['STARS',data.totals.stars],['FORKS',data.totals.forks]];
  let x=22;
  for(const [k,v] of metrics){
    s += `<text x="${x}" y="142" fill="${c.muted}" class="m label">${k}</text><text x="${x}" y="166" fill="${c.text}" class="m value">${fmt(v)}</text>`;
    x += 108;
  }
  s += `<text x="22" y="196" fill="${c.muted}" class="m small">signal: ${esc(repo.name)}  /  ${esc(repo.language)}  /  ★ ${fmt(repo.stars)}  /  fork ${fmt(repo.forks)}</text>`;

  const meterLeft = 430;
  const meterRight = 898;
  s += `<text x="${meterLeft}" y="25" fill="${c.muted}" class="m label">WORLD LINE / ACTIVITY HASH</text>`;

  // The divergence string can change length. Fit the whole Nixie bank into the
  // right half of the card instead of using a fixed x position.
  const chars=[...data.divergence];
  const units=chars.reduce((sum,ch)=>sum+(ch==='.' ? 0.42 : 1),0);
  const available=meterRight-meterLeft;
  const step=Math.min(49, available/Math.max(units,1));
  const dotAdvance=step*0.42;
  const boxW=Math.max(28, step-6);
  const boxH=74;
  const fontSize=Math.min(42, boxW*0.98);
  const totalAdvance=chars.reduce((sum,ch)=>sum+(ch==='.' ? dotAdvance : step),0);
  let dx=meterRight-totalAdvance;

  for(const ch of chars){
    if(ch==='.') {
      s += `<circle cx="${(dx+dotAdvance/2).toFixed(2)}" cy="105" r="3" fill="${c.hot}"/>`;
      dx += dotAdvance;
      continue;
    }
    const innerLeft=dx+Math.max(5,boxW*0.16);
    const innerRight=dx+boxW-Math.max(5,boxW*0.16);
    s += `<rect x="${dx.toFixed(2)}" y="56" width="${boxW.toFixed(2)}" height="${boxH}" rx="6" fill="${c.panel}" stroke="${c.line}"/>`;
    s += `<line x1="${innerLeft.toFixed(2)}" y1="66" x2="${innerRight.toFixed(2)}" y2="66" stroke="${c.hair}"/><line x1="${innerLeft.toFixed(2)}" y1="120" x2="${innerRight.toFixed(2)}" y2="120" stroke="${c.hair}"/>`;
    s += `<text x="${(dx+boxW/2).toFixed(2)}" y="109" text-anchor="middle" fill="${c.hot}" class="m" font-size="${fontSize.toFixed(1)}">${ch}</text>`;
    dx += step;
  }
  s += `<text x="${meterLeft}" y="154" fill="${c.muted}" class="m small">derived from public activity · visual identifier</text>`;
  s += `<text x="${meterLeft}" y="178" fill="${c.text}" class="m body">${fmt(data.totals.contributions)} contributions / ${data.year}</text>`;
  s += `<text x="${meterLeft}" y="197" fill="${c.muted}" class="m small">updated ${esc(data.generatedAt.slice(0,16).replace('T',' '))} UTC</text>`;
  return s + `</svg>`;
}

function levelFor(count,max) {
  if(!count) return 0;
  const r=count/Math.max(max,1);
  if(r<.18) return 1;if(r<.4) return 2;if(r<.68) return 3;return 4;
}

function renderActivity(data, mode) {
  const c=theme(mode),W=920,H=286;
  let s=svgStart(W,H,c,`Vasysik ${data.year} GitHub activity (${mode})`);
  s += `<text x="22" y="27" fill="${c.muted}" class="m label">ACTIVITY / ${data.year}</text>`;
  s += `<text x="898" y="27" text-anchor="end" fill="${c.text}" class="m body">${fmt(data.totals.contributions)} CONTRIBUTIONS</text>`;
  s += `<line x1="22" y1="39" x2="898" y2="39" stroke="${c.hair}"/>`;

  const days=data.calendar || [];
  const max=Math.max(1,...days.map(d=>d.contributionCount||0));
  const x0=48,y0=71,cell=10,gap=3;
  if(days.length){
    // Month labels from first day appearing for each month.
    const seen=new Set();
    for(const day of days){
      const m=day.date.slice(0,7);
      if(!seen.has(m)){seen.add(m); const name=new Date(day.date+'T00:00:00Z').toLocaleString('en',{month:'short',timeZone:'UTC'}); const mx=x0+(day.weekIndex||0)*(cell+gap); s += `<text x="${mx}" y="58" fill="${c.muted}" class="m small">${name}</text>`;}
      const level=levelFor(day.contributionCount,max);
      const fill=level===0?c.empty:c.levels[level-1];
      const x=x0+(day.weekIndex||0)*(cell+gap), y=y0+day.weekday*(cell+gap);
      s += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="1.5" fill="${fill}"/>`;
    }
  } else {
    s += `<text x="48" y="112" fill="${c.muted}" class="m body">daily trace is generated by GitHub Actions after the first run</text>`;
    s += `<line x1="48" y1="128" x2="718" y2="128" stroke="${c.hair}" stroke-dasharray="3 5"/>`;
  }
  s += `<text x="22" y="76" fill="${c.muted}" class="m small">M</text><text x="22" y="102" fill="${c.muted}" class="m small">W</text><text x="22" y="128" fill="${c.muted}" class="m small">F</text>`;

  // Real language mix, drawn as one restrained strip rather than card zoo.
  const langs=data.languages?.slice(0,5)||[];
  const ly=203, barX=22, barW=876,barH=11;
  s += `<line x1="22" y1="173" x2="898" y2="173" stroke="${c.hair}"/>`;
  s += `<text x="22" y="194" fill="${c.muted}" class="m label">CODE MASS / OWN PUBLIC REPOSITORIES</text>`;
  let bx=barX;
  for(let i=0;i<langs.length;i++){
    const w=barW*(langs[i].percent/100);
    const fill=i===0?c.phosphor:(i===1?c.levels[2]:(i===2?c.levels[1]:c.line));
    s += `<rect x="${bx.toFixed(1)}" y="${ly}" width="${Math.max(1,w).toFixed(1)}" height="${barH}" fill="${fill}"/>`;
    bx+=w;
  }
  let tx=22;
  for(const [i,l] of langs.entries()){
    const fill=i===0?c.phosphor:c.text;
    s += `<text x="${tx}" y="243" fill="${fill}" class="m small">${esc(l.name)} ${l.percent.toFixed(1)}%</text>`;
    tx += Math.min(180, 74 + l.name.length*7);
  }
  const secondary=`commits ${fmt(data.totals.commits)}   PR ${fmt(data.totals.pullRequests)}   issues ${fmt(data.totals.issues)}   reviews ${fmt(data.totals.reviews)}`;
  s += `<text x="22" y="269" fill="${c.muted}" class="m small">${secondary}</text>`;
  return s+`</svg>`;
}

for(const mode of ['dark','light']){
  await fs.writeFile(new URL(`../assets/generated/hero-${mode}.svg`, import.meta.url), renderHero(data,mode));
  await fs.writeFile(new URL(`../assets/generated/activity-${mode}.svg`, import.meta.url), renderActivity(data,mode));
}
console.log(`Updated README SVGs for ${login}: ${total} contributions`);
