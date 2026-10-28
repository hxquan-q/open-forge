<!-- Modified by The Open Forge contributors. -->
# Quality bar

Read before declaring a frame done. Applies to every product type; the product
preset in SKILL.md adds emphasis, it does not replace this.

- **Spacing** on one consistent scale (Tailwind's 4px steps). No `mt-[13px]`.
- **Type**: at most 4 sizes per frame, with a visible weight/size gap between
  levels. If two levels look similar, merge them.
- **Color**: theme tokens only, one accent used sparingly, neutrals tinted toward
  the anchor hue. Check text/background contrast — light gray on white is the
  second most common failure. See `references/taste/color.md`.
- **Corners, borders, shadows** consistent across the whole document.
- **Real content**: plausible names, prices, dates, copy — never Lorem ipsum or
  `Item 1 / Item 2`. Write copy in the language the user is writing to you in,
  regardless of the language of these instructions or of the app's interface.
- **States**: for interactive UI cover hover/disabled, and design the empty and
  loading cases when the screen can have them. Where a state is reachable by
  clicking, make it real rather than drawing a second frame for it.
- **Icons must match meaning** — never reach for a random glyph to fill space.

## Screenshot checklist

Run this against every screenshot you Read. These are rendering defects, not
taste: the source looks correct in all of them, which is exactly why the only
way to catch them is to look at the image.

**1. Misalignment** — the most common one, and the easiest to miss in code.

- Items in a row/column that should share an edge but do not: labels and values
  in a list, card titles, form labels, icon+text pairs whose baselines differ.
- Cards in the same row with different heights, or a grid whose last row breaks
  the rhythm. Usually a missing `items-stretch`/`items-center` or a per-card
  padding that drifted.
- Content that ignores the page's left edge — a section inset by `p-6` next to
  one inset by `p-8`. Pick one gutter for the frame and hold it everywhere.
- A sidebar/nav that does not line up with the content it labels.

**2. Unintended text wrapping** — the shot shows two lines where one was meant.

- Buttons, tabs, table headers, badges, nav items and stat labels wrapping to a
  second line, or a single word dropping alone onto the next line.
- CJK copy is wider than the English you sized the container for; the layout
  that fits "Save" does not fit "保存草稿".
- Fixes, in order: shorten the copy, widen the container, or `whitespace-nowrap`
  plus `truncate` where clipping is acceptable. Shrinking the font is the wrong
  fix — it breaks the type scale to hide a layout problem.
- The opposite defect counts too: text that should wrap but instead overflows
  its container or gets clipped mid-character.

**3. Classes that resolve to nothing** — most often an icon, but the same
mechanism hits colors. Tailwind emits no CSS at all for a class it cannot
resolve, so the element silently keeps its default appearance while the source
reads perfectly. Two variants, and you check them the same way — by looking:

- **A theme token that was never defined.** `bg-brand` without
  `--color-brand` in `theme.css` `@theme` leaves the element with no background
  — it inherits whatever is behind it, which on a light surface reads as "the
  card didn't render". Grep the token out of `theme.css` before trusting it.
- **A blank icon** — an icon slot rendering as empty space or a solid block,
  because the name does not exist in the set, or the set is not one of the
  offline ones (`lucide`, `tabler`, `mdi`, `simple-icons`). The span then has no
  glyph and no width, so the slot collapses.

Two icon failures that are NOT this mechanism but look similar in the shot:

- The glyph renders but is invisible: icons are a mask tinted with
  `currentColor`, so one sitting on an accent block without a foreground token
  is the same color as its background.
- Wrong size: without a `size-*`/`w-*`+`h-*` class an icon is `1em`, i.e. it
  follows the inherited font size — the same icon then comes out at different
  sizes in a heading and in a caption.

Check every icon and every token-colored surface in the shot, not just the ones
you added last.

**4. The rest**

- Clipping and truncation: anything cut off by an edge or an `overflow-hidden`.
- Contrast: light gray on white is the second most common failure.
- Height: the frame fills its declared height — no dead space at the bottom, no
  content running past it.
- Anything that renders as a raw placeholder: a broken image box, an empty list
  where content was expected, an unstyled control.

**5. Generated-UI tells** — taste, but taste that users read as "AI made this"
within a second. On a design whose direction was dealt or proposed (`vetd_direction`),
`vetd_screenshot` measures gradients, resting shadows, glass, tiny tracked
labels, small text, monospace, typeface count, long headlines, icon tiles,
emoji, picture slots faked with a gradient and an icon, and a landing page with
too few real pictures, and reports them as `tell-*` issues with their fix — clear those like any
other issue. Look for the rest in the shot; the fixes are in
`references/taste/anti-patterns.md`.

- The scaffold's neutral placeholder still in theme.css (`theme-placeholder`
  reports it), or a hand-picked indigo primary on slate.
- Display and body in the same face; an italic headline or italic emphasis word.
- Purple/blue gradient surfaces, gradient text, blurred blobs, decorative glass.
- Card-in-card, side-stripe cards, colored glow shadows, or lines and boxes doing
  what space would do (`taste/whitespace.md`).
- Three equal icon-over-title cards; four identical KPI tiles with sparklines.
- Everything on one centre axis; every gap and padding the same size.
- Emoji standing in for icons; more than one icon set.
- An eyebrow label on every section, or beside its heading.
- Numbers presented as product proof that the user never supplied; Jane Doe,
  张三, Acme, Lorem ipsum.
- A drawn browser bar, phone bezel or notch inside a frame.
- The accent covering far more than a small share of the frame.

Fix what you find and screenshot again. A frame is done when the image is
clean, not when the code reads correctly.

## Why remote image URLs are banned

The ban in SKILL.md is not a style preference. Screenshots (canvas thumbnails,
"Ask Vetta" edits, exported renders) must re-`fetch` every image and inline it as a data
URL — a browser cannot export a canvas tainted by a cross-origin image. So a
remote URL that renders perfectly on screen will still:

- **fail** the shot whenever `fetch` cannot get it (CDN without CORS headers,
  404, offline) — that image comes out blank, and the failure is cached for the
  rest of the frame's life;
- **slow it down** by a full network round trip per image; a frame with dozens
  of remote images turns a ~100ms shot into seconds.

Local assets are served same-origin by the engine dev server and have neither
problem. `vetd_assets` searches Wikimedia Commons and NASA, previews the
candidates, and imports the one you pick into `assets/` (downscaled to at most
2048px as WebP) with its credit recorded in `CREDITS.json`, so a real picture
costs one call, not a placeholder.

## When a frame fails to build

The canvas keeps showing its last good rendering with a "build failed" badge —
so a broken frame looks *fine* on the canvas, which is exactly why you cannot
judge it from there.

Every `vetd_screenshot` parses the sources first. A frame whose own file (or
`_layout.tsx`, or anything in `components/`) does not parse returns the syntax
error with its line instead of an image; `vetd_status` reports the same thing
under `issues`. Go to that line and fix the broken region with an `edit` — a
full rewrite costs many times more and usually breaks something else. Never
declare a frame done while it still reports one.

`vetd_status` also returns the engine's recent build output, which is where to
look when a frame renders blank for no obvious reason.

## Check severities

Every issue `vetd_status` and `vetd_screenshot` return carries a `severity`:

- **error** — the design cannot be trusted as it stands: source that does not
  parse, a package or icon set that is not installed, a token `theme.css` never
  defines, a frame with no declared size, `theme.css` still the scaffold
  placeholder, or a dealt/proposed direction never chosen. Fix these before
  anything else; a capture taken on top of one is not evidence.
- **warning** — a measured defect with a stated fix (hardcoded colour,
  `h-screen`, minified source, a font family no installed package provides, a
  layout defect the probe measured). Fix or explain each one.
- **review** — a judgement call the checker cannot settle: the generated-UI
  tells (`tell-*` rules) such as gradient text, glass, tinted icon tiles or too
  few real pictures. Read the image, decide, and say what you kept and why.

Severity is read-only metadata: it changes what you do first, never the files.
A clean `issues: []` means the source checks are clear, not that the design is
good.

## Fixed evaluation cases and the review record

Three cases are fixed so two reviews can be compared; the wording may be
localised, the scope must not be:

| Case | Request | Product | Must exercise |
|---|---|---|---|
| `landing-product` | A landing page for a named product with one clear CTA | `landing` | dealt directions, one hero picture, proof section, footer |
| `app-trip` | A trip-planning app: home, search, detail, checkout | `mobile` | proposed directions, shared shell, list + detail + form states |
| `desk-console` | An operations console with a sidebar, KPI row and a table | `desktop` | proposed directions, dense table, empty and error states |

For each case, capture every frame in one `vetd_screenshot` batch and record:

```markdown
### <case> — <date>

- Directions: <ids chosen, or the three proposed and why one won>
- Checks: <n> error / <n> warning / <n> review — <rules still open>
- Evidence: <snapshot paths actually Read> (captured after the last edit)
- Judgement: <what a person sees: hierarchy, spacing, palette, type, realism>
- Findings: <defects the checks missed, if any>
- Verdict: accept / revise (<what changes>) / reject (<why>)
- Limits: <what this review did not cover>
```

The engineering verdict (checks pass, tests green) and the human verdict above
are separate records: neither substitutes for the other, and an agent must not
write the human one on the user's behalf.
