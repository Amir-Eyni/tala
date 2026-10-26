# گزارش ممیزی امنیتی و کیفیت کد — پلتفرم طلا

- **تاریخ ممیزی:** ۲۰۲۶-۱۰-۲۳
- **دامنه:** گام‌های ۱.۱ تا ۲.۴ (Next.js، دیزاین‌سیستم، ابزارها، اعتبارسنج، اسکرپرها، کش، موتور تجمیع و API)
- **نوع ممیزی:** فقط‌خواندنی (Read-only)
- **وضعیت تغییرات پروژه:** هیچ فایل پروژه‌ای در جریان ممیزی تغییر نکرد؛ تنها همین فایل `AUDIT_REPORT.md` ایجاد شده است.
- **محدودیت مهم:** هیچ درخواست زنده‌ای به سایت‌های منبع داده انجام نشد. تنها اتصال اینترنتی مجاز، `npm audit` بود. بنابراین درستی زنده‌ی URLها، سلکتورها، واحدها و پاسخ HTTP منابع، **تأییدنشده** است.

---

## ۱. خلاصه اجرایی

وضعیت کلی پروژه برای گام‌های ۱.۱ تا ۲.۴ **قابل قبول** است: lint، ۵۸ تست و build تولیدی همگی پاس می‌شوند و مسیر `/api/prices` به‌درستی Dynamic شناخته می‌شود. هیچ یافته‌ی **Critical** با شواهد قطعی پیدا نشد.

با این حال، دو ریسک **High** و چند ریسک **Medium** وجود دارد:

1. **اعتبارسنجی ریدایرکت بعد از دنبال‌شدن آن انجام می‌شود** و پروتکل نهایی بررسی نمی‌شود؛ در آزمایش، پاسخ نهایی با `http://` برای هاست مجاز پذیرفته شد. این می‌تواند منجر به downgrade از HTTPS و در حالت بدبینانه SSRF شود.
2. **خواندن بدنه‌ی پاسخ تایم‌اوت/abort ندارد.** تایمر فقط تا دریافت هدرها زنده است؛ در آزمایش، بدنه‌ی متوقف‌شده بعد از ۱۵۰ms هنوز معلق بود، در حالی که `fetchWithTimeout` قبلاً برگشته بود.
3. `commitPrice` هیچ گارد یکنواختی برای `updatedAt` ندارد؛ در آزمایش، نتیجه‌ی قدیمی‌تر، قیمت جدیدتر را بازنویسی کرد. مسیر فعلی موتور به‌دلیل `GROUP_DEADLINE_MS=12000 < SINGLE_FLIGHT_MAX_LOCK_MS=15000` از این حالت جلوگیری می‌کند، اما خود قرارداد کش محافظت ندارد.
4. اگر `now` در اعتبارسنج غایب یا نامعتبر باشد، گارد نوسان کاذب **غیرفعال** می‌شود و یک جهش ۱۰۰٪ پذیرفته می‌شود.
5. بدنه‌ی ۵۰۳ در `catch` مسیر API با قرارداد عادی پاسخ یکسان نیست.
6. در تم روشن، چند ترکیب رنگ زیر حد WCAG هستند و انتخابگر `:root:not([data-theme="dark"])` وجود ندارد.

### شمارش یافته‌ها

| شدت | تعداد |
| :--- | ---: |
| Critical | ۰ |
| High | ۲ |
| Medium | ۶ |
| Low | ۵ |
| Info | ۲ |
| **جمع** | **۱۵** |

### نتیجه‌ی کلی

- **امنیت:** دو یافته‌ی High در لایه‌ی HTTP؛ هیچ eval/`new Function`/`dangerouslySetInnerHTML`/`NEXT_PUBLIC_` یافت نشد.
- **صحت داده:** منطق اصلی درست است، اما گارد یکنواختی کش و الزام `now` در اعتبارسنج باید سخت‌تر شود.
- **White-Label:** خروجی API و باندل کلاینت پاک است؛ فقط مستند `v3.md` نام منابع را دارد.
- **کیفیت:** ساختار ماژول‌ها، جداسازی server-only، تست‌های آفلاین و پوشش خطاها خوب است. شکاف‌های تست عمدتاً در سناریوهای بدنه‌ی معلق، ریدایرکت downgrade و فالبک غیرفعال طلاسی است.

---

## ۲. وضعیت گام‌ها

| گام | وضعیت | توضیح |
| :--- | :--- | :--- |
| ۰ — وضعیت پروژه و نسخه‌ها | پاس با ملاحظه | Next 16.4.2، React 19.3.0، Tailwind 4.3.3؛ گام ۲.۴ هنوز commit نشده است. |
| ۱.۱ — Next.js، React Compiler، RTL | پاس | `reactCompiler: true`، `cacheComponents`، `partialPrefetching`؛ build بدون خطا؛ `lang="fa"` و `dir="rtl"`. |
| ۱.۲ — دیزاین‌سیستم و Tailwind v4 | پاس با ملاحظه | توکن‌ها و `@theme inline` درست‌اند؛ کنتراست تم روشن و نبود `data-theme` ملاحظه دارد. |
| ۱.۳ — ابزارهای کمکی | پاس | `formatPrice.js`، `cn.js` و `constants.js` رفتار مورد انتظار را دارند. |
| ۲.۱ — اعتبارسنج Zod و Outlier Guard | پاس با ملاحظه | اسکیما و مرز ۱۵٪ درست؛ `now` غایب/نامعتبر گارد را غیرفعال می‌کند. |
| ۲.۲ — اسکرپرها | پاس با ملاحظه | خطاهای خنثی، محدودیت اندازه و fallback وجود دارد؛ ریدایرکت، بدنه‌ی معلق و فالبک تولیدی طلاسی مشکل دارند. |
| ۲.۳ — کش Singleton و Single-Flight | پاس با ملاحظه | Single-Flight در ۱۰۰۰ درخواست هم‌زمان فقط یک fetch انجام داد؛ گارد یکنواختی `commitPrice` ندارد. |
| ۲.۴ — موتور تجمیع و API | پاس با ملاحظه | payload هفت‌کلیدی و بدون `source`؛ route داینامیک؛ بدنه‌ی `catch` با قرارداد یکسان نیست. |
| Cross-cutting — امنیت/White-Label/کارایی | پاس با ملاحظه | باندل کلاینت پاک؛ دو ریسک HTTP؛ کش درون‌حافظه‌ای برای serverless محدودیت دارد. |

---

## ۳. نتایج دستورها و بررسی‌های اجرایی

| بررسی | نتیجه |
| :--- | :--- |
| `node -v` | `v24.20.0` |
| `npm -v` | `11.19.0` |
| `npm run lint` | بدون خطا و بدون خروجی؛ exit code = 0 |
| `npm test` | `tests 58`، `pass 58`، `fail 0`، `duration_ms 597.9312` |
| `npm run build` | موفق؛ Cache Components و Partial Prefetching فعال؛ `/` و `/_not-found` استاتیک و `/api/prices` داینامیک `ƒ` |
| `npm audit` | ۵ آسیب‌پذیری High، همگی در زنجیره‌ی توسعه |
| `npm audit --omit=dev` | ۰ آسیب‌پذیری در وابستگی‌های production |
| ۱۰۰۰ درخواست سرد هم‌زمان (fake fetch) | ۴۲.۵ms؛ دقیقاً یک fetch برای هر group |
| ۱۰۰۰ فراخوانی گرم متوالی | ۲۰.۹ms مجموع؛ حدود ۲۰.۹µs برای هر `resolvePrices` (بدون سربار HTTP) |
| تست late commit | `price=100`، `previousPrice=200`، `updatedAt` عقب‌تر؛ بازنویسی داده‌ی جدیدتر اثبات شد |
| تست بدنه‌ی معلق | بعد از ۱۵۰ms هنوز `still-pending`؛ تایم‌اوت ۱۰۰ms قبلاً گذشته بود |
| تست ریدایرکت | `http://www.tgju.org/...` **پذیرفته شد**؛ `https://evil.example` مسدود شد |
| تست Talasea timeout | کد نهایی `config` شد، در حالی که cause آن `timeout` بود |
| جست‌وجوی نام منابع در `.next/static` | هیچ موردی یافت نشد |
| جست‌وجوی نام منابع در سورس (بدون node_modules/.next/.git) | فقط `v3.md:28` و `v3.md:48` خارج از مسیرهای مجاز |

### نکته‌ی هشدار تست‌ها

`MODULE_TYPELESS_PACKAGE_JSON` برای `utils/constants.js`، `lib/cache.js` و `utils/constants.server.js` دیده می‌شود. این هشدار در اجرای تست با Node 24 بی‌خطر است و صرفاً به‌دلیل نبود `"type": "module"` در `package.json` است. توصیه نمی‌شود برای رفع آن، بدون بررسی، `"type": "module"` به پروژه اضافه شود.

### وضعیت Git

```
 M package.json
 M utils/constants.js
?? app/api/
?? lib/priceEngine.js
?? lib/pricesResponse.js
?? lib/scrapers/index.js
?? tests/priceEngine.test.mjs
```

گام ۲.۴ پیاده‌سازی شده اما هنوز commit نشده است. این وضعیت در جریان ممیزی تغییر نکرد.

---

## ۴. یافته‌ها به ترتیب شدت

### F-01 — High — ریدایرکت قبل از اعتبارسنجی دنبال می‌شود و پروتکل نهایی بررسی نمی‌شود (SSRF / downgrade)

**شواهد:**

- `lib/scrapers/http.js:144-148` — `redirect: "follow"` باعث می‌شود fetch ریدایرکت را **قبل از** هر بررسی دنبال کند.
- `lib/scrapers/http.js:115-117` — فقط URL اولیه بررسی می‌شود که `https:` باشد.
- `lib/scrapers/http.js:168-184` — بعد از دریافت پاسخ، فقط `hostname` بررسی می‌شود؛ `protocol` بررسی نمی‌شود.
- `lib/scrapers/http.js:78-85` — allowlist علاوه بر هاست دقیق، 모든 زیردامنه را هم مجاز می‌کند.

**آزمایش انجام‌شده:**

```text
http://www.tgju.org/profile/geram24/today ACCEPTED 200
https://www.tgju.org/profile/geram24/today ACCEPTED 200
https://evil.example/x REJECTED blocked
```

یعنی پاسخ نهایی با HTTP ساده برای هاست مجاز پذیرفته می‌شود. برای هاست غیرمجاز، درخواست قبلاً ارسال شده و تنها بعد از دریافت پاسخ مسدود می‌شود.

**اثر:** یک منبع داده‌ی compromized یا ریدایرکت کنترل‌شده می‌تواند سرور را وادار به ارسال GET به هاست دلخواه، از جمله endpointهای داخلی HTTP، کند. حتی بدون کنترل مهاجم، downgrade به HTTP محرمانگی/یکپارچگی داده را تضعیف می‌کند.

**اطمینان:** رفتار کد **قطعی**؛ بهره‌برداری **مشروط** به کنترل/نفوذ در منبع یا DNS.

**پیشنهاد:** `redirect: "manual"` و دنبال‌کردن دستی حداکثر ۲–۳ hop با بررسی `https:` و هاست **دقیق** در هر hop؛ در نهایت هم `response.url` را از نظر protocol و host دوباره بررسی کنید. allowlist زیردامنه را فقط در صورت نیاز واقعی نگه دارید.

---

### F-02 — High — خواندن بدنه تایم‌اوت/abort ندارد و تایمر فقط تا هدرها زنده است

**شواهد:**

- `lib/scrapers/http.js:130-133` — تایمر ساخته می‌شود.
- `lib/scrapers/http.js:142-162` — تایمر در `finally` بلافاصله بعد از resolve شدن `fetchImpl` پاک می‌شود؛ یعنی بعد از دریافت هدرها، نه بعد از خواندن بدنه.
- `lib/scrapers/http.js:208-279` — `readTextLimited` حلقه‌ی `reader.read()` دارد ولی هیچ timeout/AbortSignal ندارد.
- `lib/priceEngine.js:443-446` و `lib/priceEngine.js:280-321` — deadline گروه فقط Promise را reject می‌کند و درخواست/استریم زیرین را abort نمی‌کند.

**آزمایش انجام‌شده:** با `timeoutMs=100` و بدنه‌ای که هیچ داده‌ای تولید نمی‌کند:

```text
still-pending-after-150ms elapsed 151
fetchWithTimeout returned headers, status 200
```

یعنی پاسخ‌های هدری برمی‌گردند، تایمر پاک شده، اما خواندن بدنه تا ابد معلق می‌ماند.

**اثر:** منبع کند/مخرب می‌تواند socket، reader و closureهای مربوطه را نگه دارد؛ با هر refresh جدید (حداکثر هر ۱۲ ثانیه برای هر group) این منابع می‌توانند جمع شوند. API ممکن است ۵۰۳ برگرداند، اما منبع زیرین آزاد نشده است. یک مورد جزئی‌تر: اگر `new Headers(headers)` در خط ۱۳۵–۱۴۰ خطا بدهد، تایمر قبل از `try` ساخته شده و پاک نمی‌شود.

**اطمینان:** رفتار **قطعی** با آزمایش؛ شدت اثر **مشروط** به منبع معلق/مخرب.

**پیشنهاد:** AbortController را تا پایان خواندن بدنه نگه دارید و signal را به reader بدهید؛ تایم‌اوت را با deadline گروه هم‌تراز کنید و در `finally` همیشه `clearTimeout` و در صورت لزوم `reader.cancel()` انجام دهید.

---

### F-03 — Medium — `commitPrice` گارد یکنواختی `updatedAt` ندارد

**شواهد:**

- `lib/cache.js:215-237` — قیمت و `updatedAt` بدون مقایسه با مقدار قبلی نوشته می‌شوند.
- `lib/cache.js:222` — `timestamp` فقط از `now` گرفته می‌شود.
- `lib/priceEngine.js:443-475` — موتور فقط `result.prices` را می‌خواند و با `now` درخواست commit می‌کند.

**آزمایش انجام‌شده:**

```text
commitPrice('usd', 200, T0+10000)
commitPrice('usd', 100, T0)
=> { price: 100, previousPrice: 200, updatedAt: T0 }
```

داده‌ی جدیدتر (۲۰۰ در T0+10s) با نتیجه‌ی قدیمی‌تر (۱۰۰ در T0) بازنویسی شد و `previousPrice` هم وارونه شد.

**محدودیت مهم:** در مسیر فعلی موتور، `GROUP_DEADLINE_MS=12000` کمتر از `SINGLE_FLIGHT_MAX_LOCK_MS=15000` است و `withDeadline` نتیجه‌ی دیررس را نادیده می‌گیرد؛ بنابراین از طریق API فعلی معمولاً قابل وقوع نیست. اما این محافظت در **لایه‌ی کش** وجود ندارد و با تغییر ثابت‌ها، caller آینده یا `now` تزریقی قابل وقوع می‌شود.

**اطمینان:** رفتار کش **قطعی**؛ دسترسی از API فعلی **بعید**.

**پیشنهاد:** در `commitPrice` قبل از نوشتن:

```js
if (Number.isFinite(record.updatedAt) && timestamp < record.updatedAt) {
  return false;
}
```

یا «فقط اگر جدیدتر است» را به یک invariant صریح تبدیل کنید. در صورت استفاده از `fetchedAt` (یافته‌ی F-06) هم باید همین گارد حفظ شود.

---

### F-04 — Medium — `now` غایب یا نامعتبر، گارد نوسان کاذب را غیرفعال می‌کند

**شواهد:**

- `lib/validator.js:108-112` — اگر `toTimestampMs(now)` برابر `null` شود، نتیجه `outside-window` و `isOutlier: false` است.

**آزمایش انجام‌شده:** با `lastGood.price=100000` و قیمت جدید `200000` (جهش ۱۰۰٪):

```text
now=undefined  => accepted: true, reason: outside-window
now=null       => accepted: true, reason: outside-window
now=invalid    => accepted: true, reason: outside-window
now=NaN        => accepted: true, reason: outside-window
now=Infinity   => accepted: true, reason: outside-window
now=1700000001000 => accepted: false, reason: outlier
```

**اثر:** هر caller که `now` را فراموش کند یا مقدار نامعتبر بدهد، محافظت outlier را از دست می‌دهد. در موتور فعلی `now` همیشه عدد معتبر است، بنابراین مسیر تولیدی فعلی امن است؛ اما قرارداد خود validator امن نیست.

**اطمینان:** **قطعی**.

**پیشنهاد:** `now` را اجباری کنید و در صورت نامعتبر بودن، نتیجه را reject کنید؛ یا حداقل `Date.now()` را به‌عنوان پیش‌فرض امن به کار ببرید. اگر `now < updatedAt` بود، آن را stale/outlier تلقی کنید، نه داخل پنجره.

---

### F-05 — Medium — بدنه‌ی ۵۰۳ در `catch` مسیر API با قرارداد پاسخ یکسان نیست

**شواهد:**

- `app/api/prices/route.js:28-39` — در catch فقط `{ status: "offline" }` برگردانده می‌شود.
- `lib/priceEngine.js:622-627` — payload عادی شامل `updatedAt`، `status`، `currency` و `assets` است.
- `lib/pricesResponse.js:30-39` — ۵۰۳ عادی، خودِ payload کامل را برمی‌گرداند.

**اثر:** کلاینتی که قرارداد `assets` را انتظار دارد، در خطای غیرمنتظره‌ی route بدنه‌ی ناقص می‌گیرد. همچنین `Retry-After` در این مسیر وجود ندارد، در حالی که ۵۰۳ عادی آن را دارد. این یک ناسازگاری قرارداد است، نه فقط یک تفاوت ظاهری.

**اطمینان:** **قطعی**.

**پیشنهاد:** در catch هم `buildFallbackPayload` یا یک payload خطای واحد با همان شکل برگردانید و هدرهای ۵۰۳ را از یک تابع مشترک بگیرید.

---

### F-06 — Medium — `fetchedAt` اسکرپرها نادیده گرفته می‌شود

**شواهد:**

- `lib/scrapers/wallex.js:52-55` — `fetchedAt` برگردانده می‌شود.
- `lib/scrapers/tgju.js:66-69` — `fetchedAt` برگردانده می‌شود.
- `lib/scrapers/talasea.js:224-228` و `253-257` — `fetchedAt` برگردانده می‌شود.
- `lib/priceEngine.js:443-475` — موتور فقط `result.prices` را می‌خواند و `commitPrice(..., now)` را با زمان درخواست صدا می‌زند.

**آزمایش انجام‌شده:** اسکرپر ساختگی `fetchedAt = T0 - 5000` برگرداند، اما:

```text
payload.updatedAt = 2023-11-14T22:13:20.000Z   // T0
cache.updatedAt   = 2023-11-14T22:13:20.000Z   // T0
expectedFromFetchedAt = 2023-11-14T22:13:15.000Z
```

**اثر:** زمان داده، زمان شروع درخواست است نه زمان واقعی دریافت؛ در fetchهای کند، تازگی داده اشتباه گزارش می‌شود. همچنین بخشی از قرارداد اسکرپرها بی‌استفاده می‌ماند و با F-03 ترکیب می‌شود.

**اطمینان:** **قطعی**.

**پیشنهاد:** یا `fetchedAt` را در `commitPrice` استفاده کنید (با گارد یکنواختی)، یا آن را از قرارداد اسکرپرها حذف کنید تا دو منبع حقیقت نداشته باشیم.

---

### F-07 — Medium — فالبک DOM طلاسی در تولید غیرفعال است و خطای JSON را به `config` تبدیل می‌کند

**شواهد:**

- `utils/constants.server.js:19` — `talasea: ""`.
- `utils/constants.server.js:82` — `TALASEA_SELECTORS = []`.
- `lib/scrapers/talasea.js:229-267` — خطاهای `timeout`/`http`/`network`/`parse` به فالبک DOM می‌روند؛ چون `domUrl` خالی است، خطای نهایی `config` می‌شود.
- `lib/scrapers/talasea.js:263-266` — خطای اصلی فقط در `cause` نگه داشته می‌شود.

**آزمایش انجام‌شده:** با شبیه‌سازی timeout در JSON:

```text
final code config
message Source URL is not configured.
causeCode timeout
causeMessage Source request timed out.
```

**اثر:** دلیل واقعی خرابی (timeout) به `config` تبدیل می‌شود؛ لاگ‌ها/breaker و `lastErrorCode` گمراه می‌شوند. مهم‌تر اینکه طلای ۱۸ عیار در تولید فقط به JSON وابسته است و فالبک عملی ندارد. این تصمیم با توجه به چالش ArvanCloud قابل درک است، اما یک شکاف پایداری است.

**اطمینان:** **قطعی** برای رفتار؛ «خرابی JSON» **مشروط** به منبع.

**پیشنهاد:** اگر فالبک پیکربندی نشده است، خطای اصلی JSON را دوباره پرتاب کنید (نه `config`) تا کد/لاگ درست بماند؛ برای production یک مسیر جایگزین تأییدشده یا حداقل رفتار مستند داشته باشید.

---

### F-08 — Medium — کنتراست تم روشن در چند ترکیب زیر حد WCAG است

**شواهد:** رنگ‌های `app/globals.css:67-86` و حلقه‌ی فوکوس `app/globals.css:57-60`.

نسبت‌های محاسبه‌شده:

| ترکیب | نسبت | حد |
| :--- | ---: | :--- |
| `brand` روی `surface` (سفید) | ۲.۰۹ | ۴.۵ برای متن |
| `brand` روی `bg` | ۱.۸۵ | ۳ برای focus indicator |
| `up` روی `surface` | ۴.۱۲ | ۴.۵ |
| `up` روی `bg` | ۳.۶۵ | ۴.۵ |
| `warn` روی `surface` | ۳.۶۷ | ۴.۵ |
| `warn` روی `bg` | ۳.۲۴ | ۴.۵ |

در تم تیره همه‌ی ترکیب‌های بررسی‌شده پاس می‌شوند (مثلاً `text/bg = 16.19`، `up/surface = 8.79`، `warn/surface = 10.11`).

**اثر:** متن‌های کوچک سبز/کهربایی و حلقه‌ی فوکوس در light mode ممکن است برای کاربران کم‌بینا قابل تشخیص نباشد. چون Phase 3 هنوز UI ندارد، کاربرد واقعی این توکن‌ها **تأییدنشده** است؛ اما خود نسبت‌ها قطعی‌اند.

**پیشنهاد:** نسخه‌های تیره‌تر `up`/`warn` برای light mode یا پس‌زمینه/حاشیه‌ی مکمل برای focus ring در نظر بگیرید. تغییر رنگ‌ها باید با تأیید طراحی انجام شود.

---

### F-09 — Low — پنج آسیب‌پذیری High فقط در زنجیره‌ی توسعه

**شواهد:** `npm audit`:

```text
braces <=3.0.3  Severity: high
eslint-config-next@16.4.2
  -> @next/eslint-plugin-next@16.4.2
  -> fast-glob@3.3.1
  -> micromatch@4.0.8
  -> braces@3.0.3
5 high severity vulnerabilities
```

`npm audit --omit=dev` نتیجه‌ی `0` می‌دهد.

**اثر:** مسیر production آسیب‌پذیر نیست؛ ریسک متوجه توسعه/CI و ابزار lint است. `npm audit fix --force` پیشنهاد `eslint-config-next@14.2.35` می‌دهد که با Next 16 سازگار نیست و **اعمال نشد**.

**پیشنهاد:** تا انتشار نسخه‌ی اصلاح‌شده از طرف Next صبر کنید یا در صورت امکان `braces` را با override به نسخه‌ی امن پین کنید؛ downgrade یک‌مرحله‌ای انجام ندهید.

---

### F-10 — Low — نام منابع در `v3.md` باقی مانده است

**شواهد:**

- `v3.md:28` — `(wallex.js, talasea.js, tgju.js)`
- `v3.md:48` — نام فارسی منابع و `TGJU`

**اثر:** این فایل مستند است و در باندل کلاینت نیست؛ جست‌وجوی `.next/static` هیچ موردی پیدا نکرد. بنابراین نشت به کلاینت **ندارد**، اما با قانون سخت‌گیرانه‌ی «فقط `lib/scrapers/`، `utils/constants.server.js` و `tests/`» ناسازگار است.

**پیشنهاد:** در مستندات از نام‌های خنثی (مثلاً «منبع FX»، «منبع طلای ۱۸») استفاده کنید یا مستندات را صریحاً از این قانون مستثنی کنید.

---

### F-11 — Low — انتخابگر `:root:not([data-theme="dark"])` برای تم روشن وجود ندارد

**شواهد:** `app/globals.css:67` فقط `@media (prefers-color-scheme: light)` دارد؛ جست‌وجوی `data-theme` در CSS خروجی و سورس نتیجه‌ای ندارد. `app/layout.js` هم هیچ theme toggle یا `data-theme` ست نمی‌کند.

**اثر:** تم روشن فقط با تنظیم سیستم فعال می‌شود و امکان override دستی/اجباری وجود ندارد. اگر قرارداد دیزاین‌سیستم این را الزام کرده باشد، پیاده‌سازی ناقص است.

**پیشنهاد:** اگر تم دستی لازم است، بلوک `:root:not([data-theme="dark"])` را اضافه کنید و `data-theme` را از layout/toggle مدیریت کنید؛ در غیر این صورت این محدودیت را مستند کنید.

---

### F-12 — Low — عقب رفتن ساعت، داده‌ی قدیمی را تازه نشان می‌دهد

**شواهد:** `lib/cache.js:146-149` از `Math.max(0, now - updatedAt)` استفاده می‌کند و `needsRefresh` را بر همین age بنا می‌کند. `lib/cache.js:99-101` هم فقط عدد finite را می‌پذیرد.

**آزمایش انجام‌شده:** بعد از commit در `T0`، با `now = T0 - 5000`:

```text
ageSeconds: 0, isStale: false, needsRefresh: false
```

**اثر:** اگر ساعت سیستم به عقب بپرد یا `now` اشتباه کوچک باشد، داده تا رسیدن ساعت به `updatedAt` تازه تلقی می‌شود و refresh نمی‌شود. در محیط NTP معمولاً نادر است.

**پیشنهاد:** `now < updatedAt` را به‌عنوان حالت ناسازگار تشخیص دهید و stale/needsRefresh را true کنید یا از monotonic clock استفاده کنید.

---

### F-13 — Low — مقادیر جادویی و تکرار منبع حقیقت

**شواهد:**

- `lib/pricesResponse.js:36` — `"Retry-After": "5"` به‌صورت hard-coded.
- `utils/constants.js:121` — `FLASH_DURATION_MS = 1500`.
- `app/globals.css:31` — `--tala-duration-flash: 1500ms`.

**اثر:** تغییر یکی بدون دیگری باعث drift می‌شود؛ مقدار `Retry-After` هم مستند/متمرکز نیست.

**پیشنهاد:** `Retry-After` را از یک ثابت مشترک بگیرید و مدت فلش را یک منبع حقیقت واحد بدهید (مثلاً CSS variable و خواندن آن در JS، یا کامنت صریح همگام‌سازی).

---

### F-14 — Info — معناشناسی `updatedAt` تجمیعی و ترکیب ۲۰۰ با `offline`

**شواهد:**

- `lib/priceEngine.js:580-598` — `updatedAt` برابر **جدیدترین** timestamp دارایی‌هاست، نه قدیمی‌ترین.
- `lib/priceEngine.js:624` — `status` از `getHealth` می‌آید.
- `lib/pricesResponse.js:17-23` و `30-40` — اگر هر قیمتی وجود داشته باشد، HTTP 200 می‌شود؛ حتی اگر status برابر `offline` باشد.

**اثر:** اگر یک دارایی تازه و سه دارایی کهنه باشند، `updatedAt` تجمیعی تازه به نظر می‌رسد؛ یا اگر همه‌ی دارایی‌ها قیمت داشته باشند ولی همه failure داشته باشند، پاسخ `200` با `status: "offline"` ممکن است. این لزوماً باگ نیست و `isStale` هر دارایی کمک می‌کند، اما قرارداد باید مستند شود.

**پیشنهاد:** مشخص کنید `updatedAt` تجمیعی باید «قدیمی‌ترین» باشد یا «جدیدترین»، و آیا `offline` با داده‌ی last-good مجاز است.

---

### F-15 — Info — ملاحظات استقرار: کش درون‌حافظه‌ای، `after` و cold start

**شواهد:**

- `lib/cache.js:10` — state روی `globalThis` با `Symbol.for` نگه داشته می‌شود؛ در serverless هر instance کش جدا دارد.
- `app/api/prices/route.js:17-22` — `after(() => refresh)` با fallback `void refresh`.
- `utils/constants.js:103` — cold start تا ۷ ثانیه صبر می‌کند.
- `utils/constants.js:109` — deadline گروه ۱۲ ثانیه است.

**اثر:** در محیط چند-instance، هر instance ممکن است fetch جدا انجام دهد و نرخ منابع بالا برود. `after` برای اجرا به `waitUntil` پلتفرم نیاز دارد؛ fallback بدون extension ممکن است در serverless قطع شود. cold start می‌تواند تا ۷ ثانیه طول بکشد.

**وضعیت:** این‌ها ریسک استقرارند، نه باگ قطعی؛ رفتار پلتفرم هدف **تأییدنشده** است.

**پیشنهاد:** پلتفرم target را مشخص و مستند کنید؛ برای چند-instance از کش مشترک استفاده کنید یا پذیرش کنید که هر instance مستقل است.

---

## ۵. موارد تأییدشده‌ی خوب

- **Build و تست:** `npm run lint` پاک، `npm test` با ۵۸/۵۸ پاس، `npm run build` موفق.
- **مسیر API:** `/api/prices` در build به‌صورت `ƒ` (Dynamic) شناخته می‌شود؛ `connection()` و `after()` در Next 16.4.2 موجود و قابل استفاده‌اند.
- **RTL و فونت:** `lang="fa"`، `dir="rtl"`، `Vazirmatn` با `display: "swap"`، viewport و `themeColor`؛ `viewportFit: "cover"` برای safe-area.
- **دیزاین‌سیستم:** مقادیر رنگ‌ها، فلش‌ها، radiusها و مدت ۱۵۰۰ms با مرجع می‌خوانند. کامپایل موقت Tailwind نشان داد `bg-surface`، `bg-brand`، `text-up`، `rounded-hero`، `text-hero`، `bg-flash-up` و سایر utilityها واقعاً تولید می‌شوند. `prefers-reduced-motion` و `tabular-nums` پیاده‌سازی شده‌اند.
- **Formatting:** `formatToman(8450000) = "۸,۴۵۰,۰۰۰"`، `0 = "۰"`، مقادیر null/NaN/negative/Infinity/string/BigInt/Symbol = `"—"`. `calcChange` نمونه‌های ۰.۲۳ و -۰.۱۱ را درست می‌دهد. `formatPercent(-0.11) = "۰٫۱۱٪"` (بدون منفی؛ جهت جداگانه است) و `0.005`/`-0.005` به `"۰٫۰۱٪"` گرد می‌شوند. `formatTime` تهران درست است و ورودی نامعتبر `"—"` می‌دهد.
- **Validator:** اسکیما رشته، اعشار، صفر، منفی، NaN، Infinity، BigInt و Symbol را رد می‌کند. مرز دقیق ±۱۵٪ پذیرفته و بیشتر از آن رد می‌شود. ورودی‌های عجیب exception ایجاد نمی‌کنند.
- **Cache:** ۱۰۰۰ درخواست سرد هم‌زمان فقط یک fetch برای هر group انجام داد؛ ۱۰۰۰ فراخوانی گرم حدود ۲۰.۹µs برای هر مورد بود. deadline گروه، قفل را آزاد می‌کند و fetch تکراری نمی‌سازد. قفل قدیمی، قفل جدید را حذف نمی‌کند.
- **Engine:** payload دقیقاً شامل `updatedAt`، `status`، `currency` و چهار دارایی با فیلدهای مورد انتظار است؛ `usd` و `usdt` مستقل‌اند؛ `changePercent` با `calcChange` هم‌خوان است؛ هیچ `source` وجود ندارد. پاسخ ۲۰۰/۵۰۳ و هدرهای امنیتی در `pricesResponse` درست‌اند.
- **White-Label در خروجی:** جست‌وجوی `.next/static` برای نام منابع و دامنه‌ها هیچ موردی پیدا نکرد. نام منابع فقط در `lib/scrapers/`، `utils/constants.server.js`، `tests/` و مستند `v3.md` است. لاگ‌های engine با group ID خنثی (`fx`، `gold18`، `gold24`) و error code خنثی نوشته می‌شوند.
- **Security hygiene:** هیچ `eval`، `new Function`، `dangerouslySetInnerHTML`، `NEXT_PUBLIC_` یا console.log غیرخنثی پیدا نشد. `server-only` در ماژول‌های سروری import شده و هیچ ماژول کلاینتی به `constants.server` وابسته نیست. درخت production با `npm audit --omit=dev` صفر آسیب‌پذیری دارد.

---

## ۶. موارد تأییدنشده

این موارد به‌دلیل محدودیت «عدم درخواست زنده به منابع» یا نبود UI قابل بررسی نبودند:

1. درستی زنده‌ی URLها، وضعیت HTTP، سلکتورها و واحدهای واقعی Wallex/Talasea/TGJU.
2. پاسخ واقعی `GET /api/prices` با `npm run dev` یا `npm start` (چون به منابع درخواست می‌زد).
3. رفتار واقعی `after()` روی پلتفرم استقرار (وجود `waitUntil`).
4. رفتار چند-instance کش در serverless و نرخ واقعی fetch.
5. زمان cold start و warm request در HTTP واقعی (فقط in-process اندازه‌گیری شد).
6. حجم واقعی صفحه‌ی TGJU نسبت به سقف ۲MB.
7. ظاهر و کنتراست واقعی UI در مرورگر (Phase 3 هنوز پیاده‌سازی نشده).
8. دسترسی عمومی به source mapهای `.next/server` در محیط استقرار.
9. عملکرد `next/font/google` در CI کاملاً آفلاین (build فعلی موفق بود).
10. کارکرد تم دستی `data-theme` (چون چنین selector/toggle وجود ندارد).

---

## ۷. پنج اولویت اول

1. **F-01 — اصلاح ریدایرکت و پروتکل:** `redirect: "manual"`، بررسی هر hop، الزام HTTPS و allowlist دقیق. (High)
2. **F-02 — اتصال تایم‌اوت به خواندن بدنه:** AbortController تا پایان body، cancel کردن reader و پاک‌سازی تضمینی تایمر. (High)
3. **F-03 — گارد یکنواختی `commitPrice`:** عدم پذیرش timestamp قدیمی‌تر از `updatedAt`. (Medium، اما داده‌محور و مهم)
4. **F-04 — الزام `now` معتبر در اعتبارسنج:** جلوگیری از غیرفعال شدن outlier guard. (Medium)
5. **F-05 + F-06 — یکسان‌سازی قرارداد API و timestamp:** payload کامل در همه‌ی ۵۰۳ها و تعیین تکلیف `fetchedAt`. (Medium)

پس از این‌ها: F-07 (پایداری طلاسی)، F-08 (کنتراست تم روشن) و F-09 (زنجیره‌ی توسعه) در اولویت‌های بعدی هستند.

---

## ۸. پرسش نهایی

هیچ تغییری در کد پروژه اعمال نشده است. کدام موارد را اصلاح کنم؟

- فقط دو یافته‌ی High (F-01 و F-02)
- همه‌ی Highها و Mediumها (F-01 تا F-08)
- همه‌ی یافته‌ها (F-01 تا F-15)
- فقط موارد مشخصی که انتخاب می‌کنید

لطفاً بگویید کدام گزینه یا کدام شناسه‌ها (مثلاً F-01، F-03، F-08) را انجام دهم.
