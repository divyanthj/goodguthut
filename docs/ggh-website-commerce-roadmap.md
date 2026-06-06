# GGH Website And Commerce Roadmap

## Purpose

This document is the source of truth for the Good Gut Hut website and commerce upgrade. It translates the WhatsApp discussion, task sheet, and current repository foundations into a phased implementation roadmap.

Future implementation plans should cite this file before making website, catalog, order tracking, coupon, invoice, admin, or content changes.

## Snapshot-Derived Requirements

- The current public website feels too limited because it has a narrow color palette, little product photography, and does not yet showcase the GGH personality.
- The homepage needs a real product showcase, grouped by category: kanji, sparkle, pickles, gift packs, subscriptions, and custom orders.
- Product categories should have clear headings, pack options, fun pack names, and short education copy explaining what each product does.
- The navigation should include Products, Subscriptions, About Us, Contact, WhatsApp, and cart/order actions.
- Customers should be able to track order progress without requiring a full login if possible.
- Order stages should be understandable to customers, such as received, in production, ready/dispatched, and delivered.
- Different product categories need different lead times, especially pickles and kanjis.
- Admins should be able to update product lead times without code changes.
- Coupon functionality should support weekly offers, birthday discounts, and win-back nudges for customers who have not ordered in a while.
- Testimonials should be visible on the public site.
- Gift packs and custom packs should be explored as public product offerings.
- Bulk/custom orders need a dedicated section, currently referred to in notes as "Bull quarters".
- Invoices and weekly admin nudges are high-priority operations work.
- Fermentation articles should be added to educate people and attract search traffic.

## Current Repo Foundations

- Product catalog management exists through the SKU model and admin SKU catalog manager.
- One-time ordering and subscriptions are combined in the current homepage checkout flow.
- Preorder and subscription flows already support catalog items, combos, address capture, delivery quotes, discounts, Razorpay payment, and customer notifications.
- Discount codes already exist as percentage codes with active, archived, perpetual, and expiry behavior.
- Invoice models, settings, admin invoice pages, and resend behavior already exist.
- Production planning and production confirmation notifications already exist.
- Admin pages already exist for preorders, orders, subscriptions, SKUs, discount codes, invoices, production, route planning, stats, geo perks, and knowledge.
- The blog structure already exists and can support fermentation education content.
- The current homepage is very lightweight: brand hero plus the unified order checkout.

## Phase 1: Public Website Refresh

Goal: make the first public experience feel like GGH before customers reach checkout.

- Rebuild the homepage into a full brand and product experience.
- Add a stronger hero using the GGH brand as the first viewport signal.
- Add public navigation for Products, Subscriptions, About Us, Contact, WhatsApp, and cart/order.
- Add sections for product categories, brand values, testimonials, gift packs, bulk/custom orders, and contact.
- Keep checkout reachable through a clear order CTA, but do not make checkout the only meaningful page content.
- Use a warmer, richer visual system with room for product photography and hand-crafted brand personality.

## Phase 2: Product Showcase And Catalog Admin

Goal: let the site present products clearly by category and let admins maintain that presentation.

- Extend the product catalog with customer-facing metadata: category, image, short description, benefits or "what it does", display order, lead time, and pack label.
- Group public products under category headings such as Kanji, Sparkle, Pickles, Gift Packs, Subscriptions, and Custom Orders.
- Add pack options under relevant product categories.
- Support fun pack names without hard-coding them into the page.
- Update admin catalog editing so Devika can manage descriptions, categories, images, pack labels, and display order.
- Keep archived products hidden from public product showcases and checkout.

## Phase 3: Order Tracking And Customer Updates

Goal: give customers a simple way to understand where their order is without requiring a full account.

- Add an order tracking page that accepts order number plus phone or email verification.
- Map internal order statuses to customer-facing stages: Received, In Production, Ready/Dispatched, Delivered, and Cancelled.
- Show a concise timeline with delivery date, selected items, and latest known status.
- Keep private/customer-sensitive fields hidden unless verification succeeds.
- If login is not built in this phase, use email and WhatsApp updates as the primary customer notification path.

## Phase 4: Lead Times And Operational Controls

Goal: make different product lead times manageable by admins.

- Add category-level lead time defaults.
- Allow product-level lead time overrides where needed.
- Surface lead time clearly in product showcases and checkout.
- Ensure pickles and kanjis can have different lead times.
- Add admin controls so lead times can be updated without developer changes.
- Keep delivery date logic consistent with existing preorder and subscription scheduling.

## Phase 5: Coupons And Lifecycle Nudges

Goal: expand discounting from static codes into lightweight marketing campaigns.

- Keep existing percentage discount code behavior working.
- Add campaign metadata for weekly offers, birthday discounts, and win-back nudges.
- Support a weekly offer code even if the discount is small, such as 5%.
- Add a birthday discount path once customer birthday data is intentionally collected.
- Add a "haven't ordered in a while" nudge path using customer order history.
- Keep discounts scoped to subtotal unless a future decision explicitly changes delivery discount behavior.

## Phase 6: Invoices And Weekly Admin Hygiene

Goal: make operational follow-up harder to miss.

- Improve invoice visibility for delivered orders and resend status.
- Add a weekly admin reminder or nudge for invoices that need attention.
- Add a weekly admin nudge for operational follow-ups such as pending production, pending delivery, or missing customer communication.
- Keep invoice generation and resend behavior compatible with existing invoice settings and admin invoice pages.

## Phase 7: Fermentation Articles And SEO

Goal: use educational content to build trust and search traffic.

- Add fermentation education articles through the existing blog structure.
- Start with practical topics: what kanji is, why fermented foods matter, how to consume fermented drinks, what pickling does, and how GGH makes small batches.
- Add SEO metadata and clear category/tag structure for fermentation content.
- Link relevant articles from product category sections.
- Keep the tone approachable and GGH-specific, not generic wellness copy.

## Acceptance Criteria

- The roadmap exists at `docs/ggh-website-commerce-roadmap.md`.
- The document can guide future implementation phase by phase without needing the original screenshots.
- Public website, catalog, order tracking, lead time, coupon, invoice, admin, and content work are all represented.
- Existing repo foundations are captured so future work builds on current systems instead of duplicating them.
- Open decisions are listed separately from committed requirements.

## Open Decisions

- Final names for product categories and packs.
- Whether "Bull quarters" is the final label or should become "Bulk Orders", "Custom Packs", or another customer-facing name.
- Which product photos or generated placeholders should be used for the first visual refresh.
- Exact homepage copy for values, founder/brand introduction, and product benefits.
- Whether order tracking v1 should use phone verification, email verification, or both.
- Whether birthday discounts require collecting birthdays during checkout or through a later customer profile flow.
- Whether lifecycle nudges should be email-only first or also include WhatsApp.
- Whether product/category lead times should affect checkout date availability immediately or first be displayed as informational copy.
