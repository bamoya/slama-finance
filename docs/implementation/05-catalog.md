# 05 — Categories, products, and packaged variants

[Index](README.md) · Depends on 02/03 · Next: [Workers and documents](06-document-delivery-foundation.md)

## Models and rules

Create `product_categories`, `products`, and `product_variants`. Category name and product reference are case-insensitively unique. A product has an optional category, optional image asset, optional suggested VAT, and at least one **active** variant. Each variant is one fixed-weight package: `weight_g` is a positive integer, `price_per_item` is the price of one package in MAD, and optional `cost_per_item` is private to staff. A product cannot have two variants of the same weight. Variant weight is immutable after creation; change a package size by archiving it and creating a new variant. Product and variant archives preserve existing document references. There are no services, loose-weight sales, generic units, stock, or inventory in this phase.

The minimum-active-variant rule is enforced in the service and by a deferred PostgreSQL constraint trigger, so creating a product and its first variant can happen atomically. Updates use optimistic `expectedVersion`; write operations are audited. Archive is reversible. Permanent deletion is only allowed for records without references. Archiving a category does not archive or unlink its products, but an archived category cannot be newly assigned.

## API contract

| Resource   | Routes                                                                                                                                 | Permission actions                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Categories | `GET/POST /v1/categories`, `GET/PATCH/DELETE /v1/categories/:id`, `POST /v1/categories/:id/archive`, `POST /v1/categories/:id/restore` | `read`, `create`, `update`, `delete`, `archive`, `restore` |
| Products   | `GET/POST /v1/products`, `GET/PATCH/DELETE /v1/products/:id`, `POST /v1/products/:id/archive`, `POST /v1/products/:id/restore`         | `read`, `create`, `update`, `delete`, `archive`, `restore` |

Product create/update accepts the full variant set, including each variant's fixed `weightG`, decimal-string `pricePerItem`, optional decimal-string `costPerItem`, and active state. Existing variants are identified by ID. The API validates category and image references, duplicate weights, nonnegative money, and the active-variant invariant. Product image uploads use Media's `product_image` purpose and cannot be deleted while referenced.

## UI and query state

The Catalog navigation has product and category lists, dedicated create, detail, and edit pages. Lists own search/status filters in the URL. Product list can filter by category. Product form has dynamic variant rows, a category selector, optional image, and optional suggested VAT. The displayed price is always **per item/package**, never per gram or kilogram. Generated Orval/TanStack Query hooks own server state; form input remains local; mutations invalidate catalog queries. RBAC gates routes and actions.

## Sales-document integration (next sequence)

Invoice, estimate, and delivery-note lines must select a `product_variant_id` and snapshot product name, reference, package weight in grams, per-item unit price, and integer package quantity. Financial net is `quantity × price_per_item`, not `weight × unit_price`. Document revisions must preserve their snapshots even if a variant's price or archive state changes. VAT is omitted unless explicitly added to the line/document. Existing sales-document screens are POC mockups until their APIs and migrations are implemented.

## Catalog insights

Read-only insights accompany the product/category lists and detail pages. Existing
CRUD contracts remain available for forms and document pickers; additive insights
endpoints provide summaries, filtered/sorted rows, and pagination.

- Products: active product/variant counts, catalog-product sales, packages sold,
  product detail totals, variant breakdown, snapshot weight sold, and recent invoices.
- Categories: active category counts, uncategorized products, leading category by
  sales, per-category performance, and a category's product breakdown.
- The period selector defaults to this month and supports last month, this year,
  all time, and an inclusive custom date range. Catalog navigation preserves the
  selected period and currency. Calendar presets use the company timezone;
  omitted currency uses the company currency. Totals cover the matching records
  before pagination. Catalog prices retain their company currency even when sales
  are filtered to another currency.
- Sales sum issued/sent invoice-line `net_amount`, excluding VAT. Use invoice
  `issue_date`, not payment or creation dates. Draft/cancelled invoices, estimates,
  and delivery notes do not contribute. No collection, stock, or margin metrics.
- Quantities count packages, not weight. Weight sold uses the invoice line's
  `package_weight_g` snapshot multiplied by quantity. Count invoices distinctly
  even when several variants occur on the same invoice.
- Historical selling prices and weights come from invoice lines; current catalog
  prices must not rewrite performance. Archived variants keep their history.
- Category attribution uses the product's current category. Moving a product moves
  its historical contribution in these live catalog views.
- Lines without a catalog variant are excluded. Label totals as catalog-product
  sales so they are not mistaken for complete company revenue.
- Never combine currencies. Financial summaries/rankings require both
  `reports.read` and `reports.sections.revenue`; basic catalog counts remain
  available with resource read permission. Recent invoice metadata additionally
  requires invoice-read access. Category detail's product breakdown additionally
  requires product-read access. Invoice history is paginated, not limited to a
  permanently truncated recent list.
- Invoice mutations invalidate catalog insight queries. Catalog changes invalidate
  counts, breakdowns, and current-category attribution.

## Acceptance

Test unique category/reference/variant weight, price boundaries, mandatory active variant, archive/restore, image reference protection, permissions, optimistic updates, and a two-package product (such as 100 g and 500 g with different per-item prices). Later document tests must cover variant selection, integer quantity, snapshot immutability, and optional VAT.

For insights, verify VAT-exclusive totals, currency separation, distinct invoice
counts, snapshot weights, inclusive dates, current-category attribution, archive
history, permission redaction, stable pagination, and invoice-mutation cache
invalidation. The UI must retain cents when formatting large decimal amounts and
preserve reporting context between catalog list/detail pages.
