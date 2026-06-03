---
name: web-research
description: "General web research: search engines, information retrieval, and extracting data from web sources when browser-based search is blocked by bot detection."
tags: [web, search, research, curl, brave, scraping]
triggers:
  - User asks to find information online about a topic, organization, or entity
  - User asks to look up something on the internet
  - Browser search engines return captcha or bot-detection pages
---

# Web Research

## Search Engine Fallback Strategy

When you need to search the web, try these in order. Stop at the first that works.

### Tier 1: Browser-based search
Try navigating to search engines via `browser_navigate`. Order of preference:
1. Google — best results, but aggressive bot detection
2. Bing — moderate detection
3. Yandex — good for Russian-language queries, but captcha-prone
4. DuckDuckGo — captcha-prone from servers
5. Brave Search — often triggers captcha in browser

### Tier 2: curl + Brave Search HTML (reliable fallback)
When all browser search engines are blocked by bot detection, use this technique. Brave is the most reliable server-side search engine from headless environments.

**Method A — Simple text extraction (works well):**

```bash
curl -sL "https://search.brave.com/search?q=ENCODED_QUERY" \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  | python3 -c "
import sys, re, html
content = sys.stdin.read()
texts = re.findall(r'<(?:p|div|span)[^>]*>(.*?)</(?:p|div|span)>', content, re.DOTALL)
for t in texts[:60]:
    clean = re.sub(r'<[^>]+>', '', t).strip()
    if len(clean) > 40 and 'display' not in clean and 'noscript' not in clean and 'background' not in clean and '{' not in clean:
        print(html.unescape(clean))
        print()
"
```

**Method B — JSON endpoint (try first, but often returns nothing):**

```bash
curl -sL "https://search.brave.com/search?q=QUERY&format=json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json"
```

**Method C — Embedded JSON blob extraction from HTML:**

Brave embeds results as a large JSON blob inside the HTML page. Extract specific fields:

```bash
curl -sL "https://search.brave.com/search?q=ENCODED_QUERY" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  | python3 -c "
import sys, re, html, json
content = sys.stdin.buffer.read().decode('utf-8', errors='replace')
matches = re.findall(r'\"title\":\"([^\"]+)\",\"url\":\"([^\"]+)\".*?\"description\":\"([^\"]*?)\"', content)
for title, url, desc in matches[:10]:
    title = json.loads('\"' + title + '\"')
    desc = json.loads('\"' + desc + '\"')
    url = json.loads('\"' + url + '\"')
    print(f'Title: {title}')
    print(f'URL: {url}')
    print(f'Desc: {desc}')
    print('---')
"
```

### Tier 3: curl + Bing HTML
Bing sometimes works via curl when browser doesn't. Extract text:

```bash
curl -sL "https://www.bing.com/search?q=ENCODED_QUERY" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  | python3 -c "
import sys, re, html
content = sys.stdin.buffer.read().decode('utf-8', errors='replace')
text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', content, flags=re.DOTALL)
text = re.sub(r'<[^>]+>', '\n', text)
text = html.unescape(text)
lines = [l.strip() for l in text.split('\n') if l.strip() and len(l.strip()) > 30]
for l in lines[:50]:
    print(l[:300])
"
```

### Tier 4: Direct site access
If you can guess the organization's website (e.g., `gov.ru` domains for Russian government entities), navigate directly. Many organizations have search functionality on their own sites that don't trigger bot detection.

## Pitfalls

- Google, Yandex, and DuckDuckGo almost always block server-based requests via captcha — don't waste time retrying them via browser repeatedly.
- **If ANY browser search engine shows captcha, skip immediately to Tier 2 (curl + Brave).** Do NOT try multiple browser search engines sequentially — they all trigger bot detection from the same server IP, so trying Bing after Google fails just wastes turns. One browser attempt is enough to confirm bot detection; then go straight to curl.
- Bing via browser often works but may return empty result containers when accessed via curl (results rendered by JS). Use the text extraction approach above.
- Rutube search via browser is blocked (returns empty/"nothing found" for automated requests). No known curl workaround — suggest direct links to the user.
- Russian government organizations (ГКУ, ГБУ, etc.) often have sites at `<shortname>.<region>.gov.ru` — try common patterns before searching.
- URL-encode non-ASCII queries before passing to curl.
- The Brave HTML page is very large (200KB+) because it embeds the full result set as JSON — grep for specific fields rather than trying to parse the whole thing at once.

## Organization Lookup Pattern

For Russian organizations (ИНН, ОГРН, legal entities):
1. Search Brave for the abbreviation + full name guess
2. Cross-reference on: checko.ru, vbankcenter.ru, synapsenet.ru, zakgo.ru, tbank.ru — these aggregate EGRUL data
3. Look for official `.gov.ru` site in results
