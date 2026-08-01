# Player App Color Theme Design QA

## Comparison target

- Source structure truth: `/var/folders/v0/3cqjwg297g3b5zgzhfjwjhcm0000gn/T/codex-clipboard-e3dca3fc-1f2b-4d4b-8cba-6d30d0c73a0b.png`
- Source color truth: `july-updata/UI建议/**/*.png` (18 supplied reference screens), with `july-updata/UI建议/home/图片 1.png` used in the aligned home comparison
- Rendered home implementation: `/tmp/player-theme-qa-pass2.png`
- Rendered profile implementation: `/tmp/player-theme-qa-profile-mobile.jpg`
- Full-view comparison evidence: `/tmp/player-theme-qa-comparison.png`
- Viewport: 390 × 844 CSS px; additional responsive checks at 360 × 800 and 430 × 932
- State: representative approved-player home and profile content, rendered through the production Player components and final scoped theme tokens in a temporary local QA harness; the harness was removed after capture

The supplied UI references intentionally use different components and information architecture. This QA therefore treats the user's current screenshot as the layout/content baseline and the `UI建议` set as the color, contrast, surface, and visual-hierarchy target.

## Findings

No actionable P0, P1, or P2 findings remain.

- Colors and visual tokens: passed. The implementation uses a cool milk-white page background (`#F6F7F1`), white cards, forest green (`#3D6648`), deep green-black text (`#253228`), accessible green-gray secondary text (`#647066`), sage selected states, green-tinted shadows, and restrained deep-green gradients. Pink, blue, gold, and purple decorative roles are now green tonal roles inside `/app/*` only.
- Visual hierarchy: passed. A small number of primary surfaces use the dark forest gradient with white text; ordinary content remains on light surfaces. This reproduces the reference set's dark-focus/light-space rhythm without changing the existing component structure.
- Semantic colors: passed. Error/danger red, warning orange, success states, and LINE brand green remain distinct. Non-semantic blue `info` badges used by Player matching/script screens were converted to the scoped secondary green treatment.
- Accessibility: passed for the new core pairs. White on the lightest gradient endpoint (`#527858`) is about 5.02:1; white on primary (`#3D6648`) is about 6.58:1; `#253228` on `#F6F7F1` is about 12.45:1; `#647066` on `#F6F7F1` is about 4.81:1. Player text inputs and textareas explicitly use the `#7F8C81` input-border token (above 3:1 against their light surfaces), while focus uses `#3D6648`; red cancellation/error borders remain semantic.
- Fonts and typography: passed. Font families, sizes, weights, line heights, wrapping, and display/body hierarchy were intentionally preserved. Selected survey descriptions now inherit high-contrast foreground text, compact time-grid labels use the opaque primary surface, and the quiz watermark retains the accessible green-gray text tone.
- Spacing and layout rhythm: passed. Padding, gaps, radii, card proportions, component order, and navigation geometry remain unchanged. Only shadow/border colors changed; their structural role remains the same.
- Responsive behavior: passed. The QA harness reported no horizontal overflow at 360, 390, or 430 px widths. Header, cards, hero, tasks, and fixed navigation remained within the viewport.
- Image quality and asset fidelity: passed. No image, logo, illustration, crop, or source asset was modified. The existing activity-photo overlay now uses deep plant green while preserving white-title readability.
- Icons: passed. Existing Lucide and brand icons remain intact; only non-semantic icon colors are remapped to coordinated green tones.
- Copy and content: passed. No production copy, data, labels, or navigation destinations changed.
- States and interactions: passed for the requested change scope. No interaction logic changed; all four navigation links remained present in the rendered component harness, and the clean browser captures produced no console warnings or errors.

## Comparison history

### Pass 1

- [P2] Default inherited text still used the global warm ink rather than Player green-black.
  - Evidence: the Player wrapper had the new tokens, but its computed inherited color remained the global foreground value.
  - Impact: unclassed headings and card text would not fully adopt the requested green-gray system.
  - Fix: set `color: var(--foreground)` and `background-color: var(--background)` directly on `.player-app-theme`.

### Pass 2

- Post-fix evidence: the Player wrapper and ordinary cards computed to `rgb(37, 50, 40)`, while the hero remained white on the forest gradient.
- The aligned three-frame comparison shows the existing warm/multicolor baseline, the supplied forest-green reference, and the final implementation in one view.
- A broader Player component review then found three small-text contrast combinations outside the initial home/profile capture: the selected game-type description, the all-day time-grid control, and the quiz-result watermark.

### Pass 3

- Selected game-type descriptions now use `text-primary-foreground/90` on the primary surface.
- Selected all-day controls now use the opaque primary surface, while time-grid statistics use the accessible primary text token.
- The 10 px quiz watermark now uses the full muted-foreground tone.
- The Player-wide input border override was removed so component focus and red error borders keep their intended precedence.
- Standard Player text inputs and textareas now opt into `border-input` explicitly, preserving both visible control boundaries and focus/error-state precedence.
- No further P0/P1/P2 color findings remain after the component-wide contrast and state review.

## Focused-region evidence

A separate crop was not necessary for the home comparison because all three mobile frames are presented at approximately native 380 px width in `/tmp/player-theme-qa-comparison.png`; headings, muted labels, card edges, shadows, icon accents, and photo overlay are legible in that single aligned view. The profile hero and light-card hierarchy were additionally checked in `/tmp/player-theme-qa-profile-mobile.jpg`.

## Residual test gap

The repository has no local Supabase URL/key or authenticated fixture, so the real protected `/app/*` routes cannot be opened offline. Visual evidence was produced with the actual production components and final CSS through a temporary local-only harness, which was removed afterward. Typecheck, lint, and production build validate the final protected route code path structurally.

## Implementation checklist

- [x] Scope the new palette to `/app/*` only.
- [x] Preserve public site, admin, mini-program, and launch splash colors.
- [x] Convert extended decorative colors into scopeable variables without changing global defaults.
- [x] Add forest-gradient focal surfaces to home and profile.
- [x] Retint photo overlays, cards, borders, shadows, navigation, and form action bars.
- [x] Preserve semantic and brand colors.
- [x] Verify 360/390/430 px mobile widths, contrast, console output, typecheck, lint, and build.

Color theme final result: passed

# Player App Bottom Navigation Design QA

## Comparison target

- Source design truth: `july-updata/UI建议/community/图片 1.png`, with `july-updata/UI建议/home/图片 1.png` used to confirm the inactive and home-active icon system
- Rendered Chinese implementation: `/tmp/player-nav-qa-zh-390.png`
- Rendered Japanese narrow-screen implementation: `/tmp/player-nav-qa-ja-360.png`
- Focused side-by-side comparison: `/tmp/player-nav-qa-comparison.png`
- Viewports: 390 × 844 and 360 × 800 CSS px
- State: the production `PlayerTopHeader` and `PlayerBottomNav` components around the intentionally blank Community content area, rendered in a temporary local QA route; the route and its proxy bypass were removed after capture

The reference contains finished Community content, while the confirmed scope intentionally requires Community to remain blank. The focused comparison therefore treats the reference as the bottom-navigation visual truth and checks the blank page against the separately confirmed content requirement.

## Findings

No actionable P0, P1, or P2 findings remain.

- Information architecture: passed. The final order is Home, Activities, Matching, Community, My, with the existing destinations retained for the first three items and Profile content retained behind My.
- Community state: passed. `/app/community` returns no page content and inherits only the existing Player App top header and bottom navigation.
- Visual match: passed. The five equal-width items use the requested Home, Calendar, Sparkles, Message, and User icon system. The active item uses a pale-green circular icon surface with forest-green icon and label; the former short top indicator is absent.
- Chinese localization: passed. Labels are `首页 / 活动 / 匹配 / 社区 / 我的`.
- Japanese localization: passed. Labels are `ホーム / 活動 / マッチング / コミュニティ / マイページ`. At 360 px, the navigation uses 10 px labels with normal tracking; at 390 px it uses 11 px. All five labels rendered without truncation.
- Responsive layout: passed. The browser reported no horizontal overflow at either 360 or 390 px. Every label's `scrollWidth` equalled its `clientWidth` or remained below it.
- Fixed-navigation clearance: passed. The Player App layout reserves `5rem + env(safe-area-inset-bottom)` so the fixed navigation does not cover the final page content on iPhone-style safe areas.
- Route state: passed. Exactly one item was active for `/app`, `/app/scripts`, `/app/matches/*`, `/app/matching/*`, `/app/community`, and `/app/profile`. Prefix checks require a complete route-segment boundary, preventing future paths such as `/app/community-*` from activating Community accidentally.
- Accessibility: passed. Each destination remains a named link, the selected destination exposes `aria-current="page"`, and the keyboard focus ring remains visible. Decorative Lucide SVGs inherit the link's accessible name rather than introducing duplicate labels.
- Scope isolation: passed. The navigation and padding changes are consumed by the authenticated `/app/*` layout; the public site, admin, and mini-program surfaces are unchanged.
- Browser health: passed. A fresh browser tab produced no console warnings or errors after the final QA harness stabilized.

## Comparison history

### Pass 1

- [P2] The 11 px Japanese Community label with wide tracking could truncate at 360 px.
  - Fix: use 10 px labels below 390 px, restore 11 px at 390 px, remove extra tracking, and reduce horizontal item padding.
- [P2] The existing `pb-16` page clearance was smaller than the approximately 76–78 px fixed navigation and did not include the safe area.
  - Fix: reserve `5rem + env(safe-area-inset-bottom)` in the Player App layout.

### Pass 2

- [P3] Broad `startsWith` matching could select a navigation item for a future sibling path with a shared string prefix.
  - Fix: require an exact path or a slash-delimited child route while retaining the confirmed `/app/matching/*` alias for Matching.
- Post-fix measurements at 360 px showed a 76 px navigation, one active item, zero horizontal overflow, and no clipped Japanese labels.
- The focused comparison shows that the reference and implementation share the same five-part rhythm, icon hierarchy, active pale-green circle, and forest-green selected state.

## Residual test gap

The repository still has no local Supabase public configuration or authenticated fixture, so the real protected `/app/*` pages cannot be opened directly offline. The visual QA used the actual production header and navigation components in a temporary route and separately verified the final protected route structure through typecheck, lint, unit tests, and production build.

## Implementation checklist

- [x] Preserve all existing Player routes and content.
- [x] Add a blank `/app/community` route.
- [x] Establish the confirmed five-item order and icons.
- [x] Add Chinese and Japanese navigation labels.
- [x] Verify all active-route mappings, including both Matching route families.
- [x] Verify 360 px and 390 px mobile widths with no truncation or overflow.
- [x] Reserve fixed-navigation and safe-area clearance.
- [x] Remove temporary QA code and proxy changes.

final result: passed

---

# Public Site 集体社交 — Design QA

- Date: 2026-08-02
- Routes: `/scripts` and `/scripts/collective-social`
- Selected visual direction: option 3, `/Users/seanmacmini/.codex/generated_images/019fbe52-ac77-70c1-9ae7-8af811ad78e5/exec-429ca563-b01a-4fad-81fb-e0a26582d142.png`
- Mandatory same-input comparison: `/tmp/collective-comparison-final-v2.jpg`
- Desktop evidence: `/tmp/collective-hero-revised.jpg`, `/tmp/collective-model-final.jpg`, `/tmp/collective-rail-aligned.jpg`, `/tmp/collective-timeline-final.jpg`, `/tmp/collective-closing-final.jpg`
- Mobile evidence: `/tmp/collective-mobile-390.jpg`, `/tmp/collective-mobile-model-390.jpg`, `/tmp/collective-mobile-rail-390.jpg`, `/tmp/collective-mobile-timeline-390.jpg`, `/tmp/collective-mobile-closing-390.jpg`, `/tmp/collective-mobile-ja-390.jpg`
- Viewports: 1920 × 878 Chrome desktop; 390 × 844 same-browser responsive frame (375 CSS content width after the visible scrollbar)

## Findings

No actionable P0, P1, or P2 visual findings remain.

- Visual fidelity: passed. The detail page follows the selected Tokyo social-magazine direction: full-bleed dusk hero with a warm-paper text fade, centered manifesto, three connected class files, oversized horizontal class feature, editorial semester timeline, and deep bamboo-green closing band.
- Existing-product consistency: passed. The public site's fixed navigation, display typography, warm washi palette, bamboo-green accents, grain, footer, and existing activity-photo language remain intact.
- Entry flow: passed. The third module appears after Large Events and Social Scripts, keeps the exact requested Chinese title/subtitle/description, and the card CTA opens the new static route.
- Content truthfulness: passed. Chinese and Japanese consistently describe the system as planned or under preparation. No sample class, WeChat group, frequency, opening date, or participant result is presented as already available.
- Class rail: passed. Cards use a text-left/image-right editorial spread on desktop and a readable stacked layout on mobile. Native horizontal scrolling, snap alignment, 44 px pagination targets, localized previous/next labels, keyboard focus, and reduced-motion behavior are present. Visible-arrow testing changed the active card without changing vertical scroll position.
- Semester timeline: passed. The five stages use 3:2 imagery and a compact alternating desktop axis; the mobile axis retains practical text width and image crops.
- Responsive behavior: passed. At 375 CSS px, the Chinese and Japanese pages reported `scrollWidth === clientWidth`; hero titles, long Japanese copy, the three-step model, class rail, timeline, and closing CTA wrapped without clipping or horizontal page overflow.
- Accessibility: passed. The new route has one named H1, semantic section headings and ordered steps, meaningful hero/class image alternatives, decorative timeline alternatives, localized control names, visible focus rings, minimum 44 px controls, and reduced-motion fallbacks.
- Image quality: passed. The hero and cat feature use purpose-generated raster assets at the intended aspect ratios; supporting editorial images use existing project photography. No placeholder boxes, inline SVG art, or stretched sprites were introduced.
- Localization: passed. The Chinese and Japanese key sets are aligned. Both languages were switched through the real public navigation and rendered without overflow.
- Browser health: passed. A fresh Chrome tab reported no console warnings or errors after the final render.

## Comparison history

### Pass 1

- [P2] The initial hero used a hard split layout, causing the four-character Chinese title to wrap at wide desktop sizes and drifting from the selected full-image composition.
  - Fix: make the generated Tokyo dusk image full-bleed, add the selected warm-paper fade, and cap the content width and title scale.
- [P2] The first class rail placed imagery on the left, used small pagination targets, and relied on `scrollIntoView`, which could move the page vertically.
  - Fix: restore text-left/image-right spreads, add 44 px pagination controls, localize arrow labels, and scroll only the horizontal rail.
- [P2] Some entry and example copy implied that planned classes already existed.
  - Fix: change entry language and metadata to explicit proposal/preparation wording, remove unverified dates and frequency claims, and keep the requested Chinese module description unchanged.

### Pass 2

- [P2] Mobile hero copy crossed into the dark part of the image and lost contrast.
  - Fix: keep the warm-paper mobile overlay opaque through the complete copy block while preserving the group image at the lower edge.
- [P3] The joined three-column model read like a generic dashboard panel rather than the selected editorial class files.
  - Fix: separate the steps into rounded archive-style modules with numbered tabs and restrained Lucide connectors.
- [P3] Several timeline sources were too vertical or semantically mismatched for the initial wide crops.
  - Fix: use coherent project photography and fixed 3:2 slots.

### Pass 3

- [P1] The closing eyebrow and body could be read as an unverified current-semester launch promise.
  - Fix: use neutral preparation wording in Chinese, Japanese, and English without a semester date.
- [P2] A few small green labels were slightly below WCAG AA contrast, and generic editorial class imagery used topic-like alternatives.
  - Fix: darken the labels, treat the supporting imagery as decorative, and expose the localized class title through each 44 px pagination control.

## Functional and static verification

- Exact Chinese title, subtitle, and description: passed.
- Card-to-detail navigation: passed.
- Chinese/Japanese language switch: passed.
- Horizontal class arrows and active-state indicators: passed on desktop and mobile.
- TypeScript typecheck: passed.
- ESLint: passed.
- Unit tests: 40 files / 143 tests passed.
- Next.js production build: passed and includes `/scripts/collective-social`.
- JSON parsing and `git diff --check`: passed.
- Every edited or new TS/TSX source file remains below 150 lines.

## Residual note

The existing dismissible PWA install prompt can overlap a small part of lower-left content in some desktop sessions. It predates this route and was not changed in this scoped public-page implementation.

## Final result

final result: passed

# Player App My Profile V1 Design QA

## Comparison target

- Selected visual direction: option 3, `/Users/seanmacmini/.codex/generated_images/019f6df9-59f4-7100-a4b8-a0513eb33592/exec-e3dd65ea-5846-4ae4-8aae-ed0e3122b786.png`
- Rendered implementation: `/tmp/profile-v1-implementation.png`
- Personal-profile editor: `/tmp/profile-v1-edit.png`
- Aligned selected-direction/implementation comparison: `/tmp/profile-v1-qa-comparison.png`
- Viewports: 360 × 800, 390 × 844, and 430 × 932 CSS px
- State: actual production profile, navigation, settings, and editor components rendered with realistic V1 member data in temporary local-only QA routes; those routes, their proxy bypass, and temporary avatar asset were removed after capture

## Findings

No actionable P0, P1, or P2 visual findings remain.

- Information hierarchy: passed. The screen leads with one compact identity card, moves through five profile-management destinations, and ends with quieter account settings. Level, compatibility score, and completed-activity count are read-only and visually subordinate to identity.
- Profile card: passed. The 64 px avatar, optional unified nickname, formal-member badge, real name, school, member number, and three equal metrics remain legible without creating a dashboard-heavy appearance.
- Navigation: passed. Personal profile, community management, supplementary profile, personality self-assessment, and personality test retain their established routes. LINE, language, and logout remain available in a separate lower-emphasis card.
- Profile editing: passed. Avatar change/reset, real name, gender, optional unified nickname, school, and department use a focused mobile form; email and member number remain read-only. The image upload flow uses real processing and a 1:1 avatar result rather than a decorative placeholder.
- Community avatar linkage: passed. Default plus three existing presets remain; the removed legacy fifth preset is replaced by the personal-profile avatar. The personal option is disabled until a personal avatar exists, and later avatar changes stay synchronized.
- Data privacy: passed. The Player's own profile receives the full summary, while another approved member's community profile receives only avatar, unified nickname, school, level, published compatibility score, and activity count. Real name, gender, email, member number, and internal score notes are not exposed there.
- Admin support: passed. The existing member detail page now contains level, compatibility score/status/source/note, activity-count recomputation, and an audit trail without creating a parallel member system.
- Responsive behavior: passed. At 390 px the profile card, all five management rows, and all three settings rows end immediately above the fixed navigation. At 360 px the page scrolls naturally with no horizontal overflow; at 430 px it retains the same compact rhythm with no stretched cards.
- Localization: passed. New Player-facing labels and validation feedback are available in Chinese and Japanese. Optional nickname absence does not produce a fake fallback name.
- Accessibility: passed. Interactive rows preserve 44 px or larger hit areas, form labels remain associated with controls, disabled avatar choices are visibly and semantically disabled, focus states remain available, and status/error copy uses live-region-compatible markup where applicable.
- Browser health: passed. The final component captures produced no console errors; the Next.js production build also included `/app/profile`, `/app/profile/edit`, `/app/profile/community`, `/app/community/profile/[memberId]`, `/admin/members/[id]`, and `/api/profile/avatar`.

## Comparison history

### Pass 1

- [P2] The first implementation was vertically heavy: the profile card was about 214 px, management card about 332 px, and settings card about 201 px.
  - Impact: the account actions extended too far below the first screen and lost the requested compact social-profile feel.
  - Fix: tighten card padding, use a 64 px identity avatar, reduce row height to roughly 56 px, reduce settings rows to roughly 52 px, and use 12 px section rhythm.

### Pass 2

- The 390 px implementation measured approximately 178 px for the profile card, 282 px for the five-row management card, and 159 px for settings.
- The settings card ended at approximately 763 px and the fixed navigation began at approximately 766.5 px, keeping the entire V1 structure visible without crowding.
- 360 px and 430 px checks reported zero horizontal overflow; no further spacing, crop, icon, or text hierarchy findings remained.

## Functional and security verification

- TypeScript typecheck: passed.
- ESLint: passed.
- Unit tests: 33 files / 105 tests passed.
- Next.js production build: passed.
- `git diff --check`: passed.
- Nickname handling normalizes compatibility characters with NFKC at both application and database boundaries, including direct RPC paths.
- Personal-avatar upload requires processed ownership proof; failed registration falls back to the service-only media cleanup queue when immediate Storage deletion fails.
- Community media applies both directions of member blocking and fails closed on lookup errors.
- The copied score and level reference files match their source SHA-256 hashes exactly.

## Residual deployment gap

The new Supabase migration has been statically reviewed and contract-tested but has not been executed against a real Supabase database in this workspace. Authenticated end-to-end verification with persisted profile values therefore requires applying `supabase/migrations/20260717133952_player_profile_v1.sql` to the intended Preview database before deployment. No Production data or environment was modified during this implementation.

## Implementation checklist

- [x] Implement the selected compact option-3 visual direction.
- [x] Add the V1 profile summary and five profile-management destinations.
- [x] Add personal profile editing and processed avatar upload/reset.
- [x] Unify optional nickname and personal/community avatar synchronization.
- [x] Add manual level and compatibility-score administration with audit history.
- [x] Derive completed activity count while excluding no-shows.
- [x] Restrict other-member community metrics to approved public fields.
- [x] Preserve LINE, language, logout, existing routes, and five-item bottom navigation.
- [x] Copy and checksum-verify the two governing product documents.
- [x] Remove all temporary QA routes, proxy bypasses, and assets.

My Profile V1 final result: passed

# Player App Activity V1 Design QA

## Comparison target

- Selected visual direction: option 1, `/Users/seanmacmini/.codex/generated_images/019f6f31-289c-71f2-b0d6-4c808e8827a4/exec-131f4bf7-5409-4d11-9dfb-c00478a71bda.png`
- Rendered implementation: `/tmp/zhuxi-activity-v1-390-final.png`
- Aligned selected-direction/implementation comparison: `/tmp/zhuxi-activity-v1-comparison-final.png`
- Viewports: 360 x 800, 390 x 844, and 430 x 932 CSS px
- State: actual production Activity components rendered with realistic existing activity and script data in a temporary local-only QA harness; the harness and its access bypass were removed after capture

## Findings

No actionable P0, P1, or P2 visual findings remain.

- Information hierarchy: passed. The parent page leads with two large activities, continues with a compact horizontal social-script shelf, and ends with one quiet full-width Script Library entry.
- Large activities: passed. Manual parent placement and order take precedence; remaining positions auto-fill with upcoming activities before latest past activities. The minimal `即将举办` / `最新活动` labels communicate the two states without turning the cards into a status dashboard.
- Social scripts: passed. Admin-selected scripts retain their chosen order and the remaining slots auto-fill to the configured count. The full social library separates pinned scripts from the two-column catalogue without duplicates.
- Script library: passed. The existing catalogue is preserved behind a dedicated entry and adds search, horizontal genre chips, and a two-column mobile result grid.
- Detail flow: passed. Large-activity cards open an internal detail page with full Japan-local date/time, location, content, gallery, and an optional external registration action. Cancelled items remain available in the library with a subdued state and disabled signup.
- Responsive behavior: passed. At 390 px the complete parent hierarchy ends immediately above the fixed navigation. At 360 px it scrolls naturally with zero horizontal overflow and 20 px clearance above the fixed navigation at the bottom. At 430 px it preserves the same compact rhythm without stretched cards.
- Localization: passed. Activity hub, large-activity library/detail, social library, filters, states, and empty/error messaging have Chinese and Japanese labels.
- Accessibility: passed. Linked cards and list entries preserve large hit targets, images have meaningful alternative text, controls retain visible focus states, and admin icon buttons carry explicit accessible names.
- Image behavior: passed. Local assets and the project's approved Unsplash and Supabase Storage hosts are supported; first-view cover images receive priority loading.
- Website isolation: passed. The public website's existing `/reviews` presentation, anchors, social showcases, and ordering remain visually unchanged. Player publishing and website visibility are independent controls.
- Release compatibility: passed. Migrated Player seed activities default to hidden from the legacy website query, so applying the shared-database migration before a Preview deployment cannot duplicate Production website cards. The website continues to use its established static catalogue unless an administrator explicitly publishes a database row.

## Comparison history

### Pass 1

- [P2] The first parent implementation was too tall for the selected compact direction.
  - Fix: reduce large-card height and vertical section rhythm, narrow the social posters, and compress the Script Library entry while preserving touch targets.
- [P2] Social parent auto-fill could leave fewer cards than the configured count.
  - Fix: keep manual selection/order first, then fill from the remaining eligible social scripts.

### Pass 2

- [P2] A static website fallback could resurrect a migrated activity after an administrator hid or deleted its database row.
  - Fix: treat the database catalogue as authoritative after the Activity V1 migration marker exists, including a valid zero-row result.
- [P2] Player publishing and public-website visibility were initially coupled.
  - Fix: make them independent fields and remove the synchronization trigger.
- [P2] Browser-native datetime handling could shift Japan event times by nine hours in another deployment timezone.
  - Fix: parse and format all administrator event inputs explicitly in `Asia/Tokyo`, with round-trip tests.

### Pass 3

- The final 390 px implementation follows the selected direction with two compact landscape activities, a five-item social shelf, and a Script Library entry above the navigation.
- 360 px and 430 px checks reported zero horizontal overflow; crop, spacing, label hierarchy, full-detail time display, search, filters, and all core routes passed.

## Functional and security verification

- TypeScript typecheck: passed.
- ESLint: passed.
- Unit tests: 39 files / 139 tests passed.
- Next.js production build: passed with all 72 generated pages.
- `git diff --check`: passed.
- Approved-member access remains enforced for Player activity data.
- Administrator and super-administrator writes continue through protected server actions and database policies.
- Website visibility defaults to off for newly created Player activities and changes only when an administrator explicitly enables it.
- The migrated large-activity rows use stable source keys, preserving the public website's static ordering and metadata adapter without duplicating content.

## Residual deployment gap

The Activity V1 migrations are contract-tested and include a forward compatibility step that keeps migrated seed activities out of the legacy website query by default. The full Script Library filter currently considers the newest 200 published scripts, which is sufficient for V1 but should become server-paginated if the catalogue grows beyond that boundary.

## Implementation checklist

- [x] Implement the selected compact option-1 visual direction.
- [x] Add the Activity parent page, large-activity library/detail, social-script library, and dedicated Script Library.
- [x] Add configurable parent count, manual selection/order, and deterministic auto-fill behavior.
- [x] Add independent social membership, parent placement, and child pin/order controls.
- [x] Add bilingual large-activity editing and independent Player/website visibility controls.
- [x] Seed all current public large activities with stable source keys while preserving the website presentation.
- [x] Verify search, genre filters, card-to-detail navigation, and optional external registration.
- [x] Verify 360 px, 390 px, and 430 px layouts with no horizontal overflow.
- [x] Remove all temporary QA routes, fixtures, and proxy bypasses.

Activity V1 final result: passed

---

# Player App 首页 V1 — Design QA

- Date: 2026-07-19
- Route: `/app`
- Target viewport: `390 × 844`
- Source of truth: `/Users/seanmacmini/.codex/generated_images/019f73d0-9dec-7213-8563-bbef611a4497/exec-31ee2d8e-7cdb-411a-a84e-8d432b825c3d.png`
- Previous live capture: `/tmp/01-play-app-home-mobile-viewport-390x844.png`

## Source and implementation evidence

- Correct browser profile: Chrome profile `风`; all browser QA was isolated to that profile.
- Same-state implementation capture: `/Users/seanmacmini/.codex/visualizations/2026/07/18/019f73d0-9dec-7213-8563-bbef611a4497/player-home-v1/player-home-v1-same-state-390x844.png`.
- Mandatory same-input comparison: `/Users/seanmacmini/.codex/visualizations/2026/07/18/019f73d0-9dec-7213-8563-bbef611a4497/player-home-v1/player-home-reference-vs-v1-same-state.png`.
- Recruiting sheet capture: `/Users/seanmacmini/.codex/visualizations/2026/07/18/019f73d0-9dec-7213-8563-bbef611a4497/player-home-v1/player-home-recruiting-sheet-390x844.png`.
- Feedback Dialog capture: `/Users/seanmacmini/.codex/visualizations/2026/07/18/019f73d0-9dec-7213-8563-bbef611a4497/player-home-v1/player-home-feedback-dialog-390x844.png`.
- The selected source and implementation were compared in the same image at the same 390 × 844 CSS viewport and the same content state: greeting, two pending reviews, review-first primary action, growth level, featured activity, announcement, and unread-notification badge.

## Findings

No actionable P0, P1, or P2 visual findings remain.

- Hierarchy: passed. The screen reads in the intended order: greeting → one primary action → four shortcuts → personal status → one recommended activity → announcement.
- Visual fidelity: passed. The implementation matches the selected direction's 22px page gutter, compact clipped forest card, four-column shortcuts, two-column status layout, 110px featured card, type hierarchy, and restrained border/shadow treatment.
- Existing-product consistency: passed. The production name `竹溪社`, real notification control, established theme tokens, and confirmed bottom navigation (`首页 / 活动 / 匹配 / 社区 / 我的`) are intentionally preserved instead of copying the mock's typo and alternate information architecture.
- State behavior: passed. The visual fixture proves the conditional two-person review badge, review-first action, pending-review status, activity card, and announcement states. Production V1 still avoids fabricating a review count when the current backend cannot determine per-person eligibility safely.
- Responsive behavior: passed. At 360 × 800 and 430 × 932 there is no horizontal overflow; the 390 × 844 reference breakpoint keeps the core hierarchy aligned and scrolls naturally behind the fixed navigation when content extends below the first viewport.
- Assets: passed. The page uses the real bamboo decorative asset, a real local activity image or approved fallback, and Lucide icons; no placeholder drawings or fabricated SVG assets were introduced.
- Localization: passed. Chinese and Japanese keys remain aligned, and the narrow Japanese quick-action label is the compact `ご意見`.

## Functional and accessibility checks

- `募集中` opens a Base UI Dialog sheet, lists upcoming activities, and exposes both activity-detail links and `查看全部活动`.
- `待互评` remains visible and routes to `/app/matches`; V1 deliberately does not fabricate a count until review eligibility is represented correctly in the data model.
- `参与记录` routes to `/app/profile/stats`.
- `反馈` opens a focus-managed Base UI Dialog, discloses real-name handling, exposes the five categories, keeps submit disabled below ten characters, updates the Unicode-consistent counter, and enables submit after valid input. Browser QA did not submit a real feedback record.
- Both dialogs fit the 390 × 844 viewport, retain accessible names and close controls, and keep the background inert while open.
- Feedback is stored as real-name staff-only data. Admin processing includes status filters, pagination, notes, optimistic concurrency protection, and stable completion timestamps.
- Upcoming/date-only activity logic is evaluated in the Tokyo calendar day and no longer renders a synthetic `00:00` time.

## Browser and console evidence

- A production build of the isolated visual fixture was opened in the selected Chrome profile at 390 × 844.
- DOM snapshots confirmed all primary headings, routes, dialog controls, badge values, feedback categories, counter state, and disabled/enabled submit states.
- A fresh production-build tab reported an empty console log after the final render and interaction pass.
- The authenticated branch Preview was inspected first and confirmed to still show the previously deployed homepage; no Preview or Production deployment was performed during this QA pass.

## Static verification

- TypeScript typecheck: passed.
- ESLint: passed.
- Unit tests: 40 files / 143 tests passed.
- Next.js production build: passed.
- `git diff --check`: passed.
- Temporary QA route and runtime server: removed/stopped after capture.

## Release follow-up

- The homepage and feedback administration implementation was committed as `7b61c65` (`Redesign Player App home and add feedback workflow`), pushed to `codex/July_updata`, and verified on the branch Preview at `/app`.
- `supabase/migrations/20260718164721_player_feedback.sql` was subsequently applied to the shared Supabase database. The follow-up migration `20260721024131_harden_player_feedback_privileges.sql` tightened the effective table and function privileges and was committed as `4728ed8`.
- The final database verification covered the object structure, migration history, effective ACLs, role privileges, RLS, a rollback smoke test, and the real Preview `/admin/feedback` page.
- The original QA pass did not deploy the `main` branch or the Production frontend. Preview and Production share the same Supabase database, so the applied schema and privilege migrations affect that shared database even though the Production frontend was not redeployed.

## Final result

final result: passed
