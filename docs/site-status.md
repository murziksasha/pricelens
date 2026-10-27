# Site status

Offline snapshot tests (`pnpm --filter @pricelens/adapters test`) pass for all 16 built-in sites: each saved HTML page yields at least 10 listings with title, price and URL. Live contract tests (`RUN_LIVE=1`, query `ноутбук`) were run on 2026-10-27. Site delays, concurrency and captcha backoff stayed on. A challenge paused the site after 3 attempts. OLX and Rozetka were loaded once more in Chromium (`domcontentloaded`).

| Key | Site | Native search template | Browser | Live |
| --- | --- | --- | --- | --- |
| olx | OLX | `https://www.olx.ua/uk/list/q-{query}/` | yes | fail: HTTP and Chromium both returned a page with 0 listings |
| prom | Prom.ua | `https://prom.ua/ua/search?search_term={query}` | no | pass |
| bigl | Bigl.ua | `https://bigl.ua/ua/search?search_term={query}` | no | pass |
| hotline | Hotline | `https://hotline.ua/ua/sr/?q={query}` | no | pass |
| rozetka | Rozetka | `https://rozetka.com.ua/ua/search/?text={query}` | yes | fail: paused after captcha or rate limit; Chromium got HTTP 403 |
| ek | EK.ua | `https://ek.ua/ek-list.php?search_={query}` | no | failed: site_paused (rate limit / anti-bot block) |
| kvshop | KVShop | OpenCart `product/search` | no | pass |
| itbox | itbox | `https://www.itbox.ua/ua/search/?q={query}` | no | failed: site_paused (rate limit / anti-bot block) |
| click | Click.ua | `https://click.ua/search/?query={query}` | no | failed: site_paused (rate limit / anti-bot block) |
| brain | Brain | `https://brain.com.ua/ukr/search/?q={query}` | no | failed: site_paused (rate limit / anti-bot block) |
| touch | Touch | `https://touch.com.ua/search/?search={query}` | no | failed: 0 listings extracted |
| skay | Skay | `https://skay.ua/ua/search/?q={query}` | no | failed: 0 listings extracted |
| pcshop | PCShop | OpenCart `product/search` | no | failed: site_paused (rate limit / anti-bot block) |
| fua | F.ua | `https://f.ua/search/?query={query}` | no | failed: 0 listings extracted |
| proton | Proton-IT | OpenCart `product/search` | no | failed: 0 listings extracted |
| tex | Tex.ua | `https://tex.ua/search/?query={query}` | no | failed: 0 listings extracted |

Price, city and condition filters that a site does not put in the URL are applied to the extracted rows. Google Programmable Search is used only when a site mode is `google_fallback` or its latest health status is red, and only when `GOOGLE_API_KEY` and `GOOGLE_CX` are set.
