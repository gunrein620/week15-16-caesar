# Frontend Reference Research

## Current UI Check

- The app already exposes the core workflow on the first screen: login, composer, feed, votes, comments, meal context, and AI judgement.
- The first impression is functional but plain. The header, composer, and feed all look like similar white cards, so the hierarchy between "service identity", "quick submission", and "case feed" is weak.
- The composer is usable, but notification, meal loading, form fields, image upload, and submit action compete for attention.
- Feed cards show all required data, but the visual grouping still reads as stacked utility boxes rather than a lively food/community feed.
- Image slider controls work, but the carousel can feel generic. It needs a stronger evidence/photo frame and count affordance.
- Vote buttons are clear but large and repetitive; a compact segmented action style is a better fit.
- Highlight comments and full comments are functionally separated, but the highlighted comments do not yet feel like "top testimony".
- Meal and AI panels are useful, but they need stronger labels and calmer surfaces so they feel attached to the case rather than bolted on.
- Mobile layout is basically safe, but long labels, tags, and action buttons benefit from better wrapping and stable dimensions.

## Research Candidates

The list below mixes food delivery/menu products, campus dining/menu tools, recipe/food communities, social feeds, comment/vote products, and UI reference libraries. The goal is inspiration, not cloning.

| # | Service / Site | URL | Category | Useful UI Element | Fit |
|---:|---|---|---|---|---|
| 1 | Baedal Minjok | https://www.baemin.com | Korean food delivery | Playful food-first tone, compact categories | High |
| 2 | Yogiyo | https://www.yogiyo.co.kr | Korean food delivery | Fast ordering layout, simple restaurant/menu cards | Medium |
| 3 | Coupang Eats | https://www.coupangeats.com | Korean food delivery | Clear status labels and delivery-card density | Medium |
| 4 | DoorDash | https://www.doordash.com | Food delivery | Strong food imagery, scannable cards | High |
| 5 | Uber Eats | https://www.ubereats.com | Food delivery | Minimal food cards, compact metadata | High |
| 6 | Grubhub | https://www.grubhub.com | Food delivery | Menu browsing patterns and campus tie-in | Medium |
| 7 | Grubhub Campus Dining | https://www.grubhub.com/campus-dining | Campus dining | Student meal context and campus ordering framing | High |
| 8 | Deliveroo | https://deliveroo.co.uk | Food delivery | Dense menu listing with bright action color | Medium |
| 9 | Wolt | https://wolt.com | Food delivery | Soft cards, city-local food discovery | Medium |
| 10 | foodpanda | https://www.foodpanda.com | Food delivery | Bold brand color and quick menu scanning | Medium |
| 11 | Swiggy | https://www.swiggy.com | Food delivery | Offer chips and high-density menu discovery | Medium |
| 12 | Zomato | https://www.zomato.com | Restaurant/community | Ratings, food lists, social proof | High |
| 13 | Meituan | https://www.meituan.com | Food/local services | Dense local-service marketplace layout | Low |
| 14 | Ele.me | https://www.ele.me | Food delivery | Quick restaurant cards and category navigation | Low |
| 15 | Just Eat | https://www.just-eat.co.uk | Food delivery | Simple order status and menu hierarchy | Medium |
| 16 | SkipTheDishes | https://www.skipthedishes.com | Food delivery | Meal card listing and status chips | Medium |
| 17 | Talabat | https://www.talabat.com | Food delivery | Card hierarchy for cuisine/category | Medium |
| 18 | Rappi | https://www.rappi.com | Delivery marketplace | Multi-service action tiles | Low |
| 19 | Glovo | https://glovoapp.com | Delivery marketplace | Bright quick-action tiles | Low |
| 20 | GrabFood | https://food.grab.com | Food delivery | Mobile menu cards and badge system | Medium |
| 21 | Tapingo | https://en.wikipedia.org/wiki/Tapingo | Campus food ordering | Campus-specific quick order and pickup context | High |
| 22 | Transact Mobile Ordering | https://www.transactcampus.com/solutions/mobile-ordering/ | Campus ordering | Student-first ordering workflow | Medium |
| 23 | CBORD GET | https://www.cbord.com/get | Campus card/dining | Campus account and meal access patterns | Medium |
| 24 | Nutrislice | https://www.nutrislice.com | School menu platform | Meal calendar, menu tags, nutrition-style chips | High |
| 25 | Dine On Campus | https://dineoncampus.com | Campus dining | Today's menu, campus dining location flow | High |
| 26 | Chartwells Higher Ed | https://chartwellshighered.com | Campus dining | Campus food service storytelling and menu sections | Medium |
| 27 | Sodexo Everyday | https://www.sodexo.com | Dining service | Food-service status and menu content | Low |
| 28 | Bon Appetit Management | https://www.bamco.com | Campus dining | Seasonal menu presentation | Medium |
| 29 | Cornell Dining | https://scl.cornell.edu/residential-life/dining | Campus dining | Dining hall/menu information density | Medium |
| 30 | UC Berkeley Cal Dining | https://dining.berkeley.edu | Campus dining | Campus meal page hierarchy | Medium |
| 31 | Stanford R&DE Dining | https://rde.stanford.edu/dining | Campus dining | Meal plans and daily dining context | Medium |
| 32 | MIT Dining | https://dining.mit.edu | Campus dining | Student-friendly dining service navigation | Medium |
| 33 | Yale Hospitality | https://hospitality.yale.edu | Campus dining | Menu/date context and institutional tone | Medium |
| 34 | Harvard University Dining Services | https://dining.harvard.edu | Campus dining | Dining hall menu and meal-period structure | Medium |
| 35 | UMass Dining | https://umassdining.com | Campus dining | Robust dining menu and badges | Medium |
| 36 | Seoul National University Food Menu | https://www.snu.ac.kr | Campus dining | Korean campus meal context | Medium |
| 37 | Allrecipes | https://www.allrecipes.com | Recipe community | Reviews, community notes, approachable food tone | High |
| 38 | Yummly | https://www.yummly.com | Recipe discovery | Recipe cards, recommendation chips | Medium |
| 39 | Tasty | https://tasty.co | Recipe/media | Food-first visual cards and short copy | Medium |
| 40 | Food52 | https://food52.com | Food community/shop | Editorial food cards and community tone | Medium |
| 41 | Epicurious | https://www.epicurious.com | Recipe/editorial | Recipe metadata and image hierarchy | Medium |
| 42 | Serious Eats | https://www.seriouseats.com | Food editorial | Dense content with practical metadata | Medium |
| 43 | NYT Cooking | https://cooking.nytimes.com | Recipe product | Save/share actions and recipe detail hierarchy | Medium |
| 44 | Cookpad | https://cookpad.com | Recipe community | User-submitted recipe feed and comments | High |
| 45 | 10000recipe | https://www.10000recipe.com | Korean recipe community | Korean food cards, tags, community density | High |
| 46 | Haemuk | https://haemukja.com | Korean recipe/community | Casual recipe feed and food photos | Medium |
| 47 | Wtable | https://wtable.co.kr | Korean food content | Clean recipe/product imagery | Medium |
| 48 | Maangchi | https://www.maangchi.com | Korean recipe community | Friendly comments and approachable food identity | Medium |
| 49 | BBC Good Food | https://www.bbcgoodfood.com | Recipe community | Recipe cards and ratings | Medium |
| 50 | SideChef | https://www.sidechef.com | Cooking app | Step cards and meal planning | Medium |
| 51 | Kitchen Stories | https://www.kitchenstories.com | Recipe app | Polished mobile recipe cards | Medium |
| 52 | Paprika Recipe Manager | https://www.paprikaapp.com | Recipe manager | Compact saved-item lists | Low |
| 53 | Mealime | https://www.mealime.com | Meal planning | Meal-plan cards and fast selection | High |
| 54 | BigOven | https://www.bigoven.com | Recipe community | Saved recipes, grocery-list metadata | Low |
| 55 | Samsung Food | https://app.samsungfood.com | Recipe/meal planning | Recipe discovery and save actions | Medium |
| 56 | SuperCook | https://www.supercook.com | Recipe search | Ingredient chips and result filtering | Low |
| 57 | The Kitchn | https://www.thekitchn.com | Food editorial | Friendly card typography | Medium |
| 58 | Instagram | https://www.instagram.com | SNS feed | Image carousel, dots, quick comments | High |
| 59 | Pinterest | https://www.pinterest.com | Image board | Visual discovery cards and image-first layout | High |
| 60 | TikTok | https://www.tiktok.com | Social video/feed | Fast vertical content scanning | Medium |
| 61 | Beli | https://beliapp.com | Food social/ranking | Gamified dining lists, friend-weighted reviews | High |
| 62 | Yelp | https://www.yelp.com | Local reviews | Review cards, ratings, photos | Medium |
| 63 | Foursquare | https://foursquare.com | Local discovery | Place lists and short tips | Medium |
| 64 | Swarm | https://www.swarmapp.com | Social check-in | Lightweight check-in feed | Medium |
| 65 | Eater | https://www.eater.com | Food editorial | Curated list cards | Low |
| 66 | The Infatuation | https://www.theinfatuation.com | Restaurant guides | Review badge and venue card hierarchy | Medium |
| 67 | HappyCow | https://www.happycow.net | Food discovery | Dietary tags and review cards | Medium |
| 68 | OpenTable | https://www.opentable.com | Restaurant reservation | Availability chips and review summary | Low |
| 69 | Resy | https://resy.com | Restaurant reservation | Compact venue cards | Low |
| 70 | Tasteit | https://tasteit.me | Food social app | Dish-based social matching | Medium |
| 71 | OLIO | https://olioapp.com | Food sharing/community | Local community listing and friendly action cards | Medium |
| 72 | ShareTheMeal | https://sharethemeal.org | Social impact food app | Clear single action and progress feedback | Medium |
| 73 | Reddit | https://www.reddit.com | Community/SNS | Votes, comments, nested discussion hierarchy | High |
| 74 | Threads | https://www.threads.net | Social feed | Lightweight text feed and replies | Medium |
| 75 | X | https://x.com | Social feed | Compact timeline density | Medium |
| 76 | Facebook Groups | https://www.facebook.com/groups | Community | Group post/comment conventions | Medium |
| 77 | Discord | https://discord.com | Community/chat | Channel context and quick reactions | Medium |
| 78 | Slack | https://slack.com | Team/community | Threaded replies and compact author blocks | Medium |
| 79 | Product Hunt | https://www.producthunt.com | Voting/community | Upvote-driven card ranking | Medium |
| 80 | Hacker News | https://news.ycombinator.com | Text community | Minimal vote/comment density | Low |
| 81 | Stack Overflow | https://stackoverflow.com | Q&A voting | Vote state and answer/comment hierarchy | Low |
| 82 | Blind | https://www.teamblind.com | Community | Anonymous work-community post feed | Medium |
| 83 | Everytime | https://everytime.kr | Korean campus community | Campus-specific anonymous board flow | High |
| 84 | Naver Cafe | https://section.cafe.naver.com | Korean community | Familiar Korean board/comment layout | Medium |
| 85 | Karrot | https://www.daangn.com | Local community | Neighborhood feed and compact cards | Medium |
| 86 | Kakao Channel | https://pf.kakao.com | Channel posts | Channel feed and post list pattern | Medium |
| 87 | Mobbin | https://mobbin.com | UI reference | Mobile app pattern library | High |
| 88 | Pageflows | https://pageflows.com | UX reference | Flow-level app interaction examples | Medium |
| 89 | Dribbble | https://dribbble.com | UI inspiration | Food/social visual explorations | Medium |
| 90 | Behance | https://www.behance.net | UI inspiration | Case studies and mobile app concepts | Medium |
| 91 | Godly | https://godly.website | Web UI reference | Modern web layout treatment | Low |
| 92 | Awwwards | https://www.awwwards.com | Web UI reference | High-polish visual systems | Low |
| 93 | Land-book | https://land-book.com | Web UI reference | Landing/product layout patterns | Low |
| 94 | Refero | https://refero.design | UI reference | Product screen references | Medium |
| 95 | Screenlane | https://screenlane.com | UI reference | Mobile screen browsing | Medium |
| 96 | UI Sources | https://www.uisources.com | UX reference | Mobile interaction flows | Medium |
| 97 | Really Good UX | https://www.reallygoodux.io | UX reference | Microcopy and state examples | Medium |
| 98 | Lapa Ninja | https://www.lapa.ninja | Web UI reference | Visual landing references | Low |
| 99 | Figma Community | https://www.figma.com/community | UI reference | Food app wireframe/components inspiration | Medium |
| 100 | Tailwind UI | https://tailwindui.com | UI component reference | Accessible Tailwind component structure | Medium |

## Top 10 Selected

| Rank | Reference | Why Selected | Takeaway | Adaptation for Jungle Snack Court |
|---:|---|---|---|---|
| 1 | Baedal Minjok | Korean food context and playful tone match the service personality. | Witty labels, high-contrast food category chips. | Keep the app feature-first, but add playful case labels and food-court language. |
| 2 | Grubhub Campus Dining / Tapingo | Campus food ordering maps directly to student meal context. | Meal-period context, student-first quick actions. | Make meal context feel like "today's lunch/dinner evidence" attached to the case. |
| 3 | Nutrislice / Dine On Campus | Menu/date/meal period display is directly relevant. | Date + meal type chips, compact menu cards. | Convert meal panels into compact evidence strips with lunch/dinner badges. |
| 4 | Beli | Food social + gamified ranking fits judgement voting. | Gamified score/leaderboard energy without heavy UI. | Style verdict votes as segmented court actions with counts and selected state. |
| 5 | Instagram | Image carousel and social post scanning are proven. | Stable image frame, dots, overlay count. | Upgrade snack images into "evidence" carousel with count badge and stronger controls. |
| 6 | Reddit | Vote/comment hierarchy maps to judgement voting and comments. | Clear action region and comment summary before full discussion. | Keep highlight comments first, then a single full-comments button. |
| 7 | Allrecipes | Food community comments and reviews are close to peer validation. | Friendly community notes and helpful-comment emphasis. | Present highlight comments as "top testimony" with like count prominence. |
| 8 | DoorDash / Uber Eats | Food cards are image-first and scannable. | Strong snack title, photo, metadata, quick status. | Make feed card header and image area more food-first, less admin-like. |
| 9 | Everytime | Korean campus community pattern matches target audience. | Compact mobile-first post feed and familiar anonymous/community rhythm. | Keep dense but readable card layout, with low-friction composer at top. |
| 10 | Mealime | Meal plan UI is compact and supportive, not dominant. | Meal cards that act as context rather than content replacement. | Keep 식단 불러오기 around composer, visually secondary to snack post creation. |

## Implementation Plan Applied

- Main first impression: replace the floating header card with a full-width app bar and compact status rail.
- Composer: reduce visual noise, group notification/meal tools, make submit action and required fields clearer.
- Meal UI: turn meal context into a clean evidence strip with meal type/date emphasis.
- Image preview and slider: add stable aspect ratio, evidence count, stronger carousel affordance, and no controls for single images.
- Feed cards: stronger author/time/snack hierarchy, small case metadata, better long-text wrapping.
- Vote buttons: convert to segmented action style with count badges and total-vote summary.
- Highlight comments: present as top testimony with quoted layout and like counts.
- Full comments button: keep one full-width action, improved text and count.
- AI judgement: use a verdict badge, summary, and expandable detailed reasoning with clearer affordance.
- Mobile: avoid tiny crowded cards by using one-column grids, wrapping chips, and stable button heights.
