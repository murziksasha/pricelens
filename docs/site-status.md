# Site status

Offline snapshot tests (`pnpm --filter @pricelens/adapters test`) pass for all 16 built-in sites: each saved HTML page yields at least 10 listings with title, price and URL. Live contract tests are opt-in (`RUN_LIVE=1`) and were not executed in this environment.

| Key | Site | Native search template | Browser | Live |
| --- | --- | --- | --- | --- |
| olx | OLX | `https://www.olx.ua/uk/list/q-{query}/` | yes | not run |
| prom | Prom.ua | `https://prom.ua/ua/search?search_term={query}` | no | not run |
| bigl | Bigl.ua | `https://bigl.ua/ua/search?search_term={query}` | no | not run |
| hotline | Hotline | `https://hotline.ua/ua/sr/?q={query}` | no | not run |
| rozetka | Rozetka | `https://rozetka.com.ua/ua/search/?text={query}` | yes | not run |
| ek | EK.ua | `https://ek.ua/ek-list.php?search_={query}` | no | not run |
| kvshop | KVShop | OpenCart `product/search` | no | not run |
| itbox | itbox | `https://www.itbox.ua/ua/search/?q={query}` | no | not run |
| click | Click.ua | `https://click.ua/search/?query={query}` | no | not run |
| brain | Brain | `https://brain.com.ua/ukr/search/?q={query}` | no | not run |
| touch | Touch | `https://touch.com.ua/search/?search={query}` | no | not run |
| skay | Skay | `https://skay.ua/ua/search/?q={query}` | no | not run |
| pcshop | PCShop | OpenCart `product/search` | no | not run |
| fua | F.ua | `https://f.ua/search/?query={query}` | no | not run |
| proton | Proton-IT | OpenCart `product/search` | no | not run |
| tex | Tex.ua | `https://tex.ua/search/?query={query}` | no | not run |

Price, city and condition filters that a site does not put in the URL are applied to the extracted rows. Google Programmable Search is used only when a site mode is `google_fallback` or its latest health status is red, and only when `GOOGLE_API_KEY` and `GOOGLE_CX` are set.
