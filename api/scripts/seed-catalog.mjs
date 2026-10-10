/** Reviewed public catalogue snapshot, 2026-10-10. No live scraping at deployment. */
export const seedProducts = [
  {
    reference: 'SLAMA-WEB-CUMIN',
    name: 'Cumin',
    category: 'Épices',
    source: 'https://slamaagricole.ma/product/cumin_spice_slama/',
    variants: [
      [100, '15.00'],
      [200, '30.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-FARINE-MAIS',
    name: 'Farine de maïs',
    category: 'Zamita et farines',
    source: 'https://slamaagricole.ma/product/corn_flour_slama/',
    variants: [
      [500, '15.00'],
      [1000, '25.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-BELBOULA-ORGE',
    name: 'Belboula d’orge',
    category: 'Belboula et soupes',
    source: 'https://slamaagricole.ma/product/barley_belboula_slama/',
    variants: [
      [500, '11.00'],
      [1000, '18.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-CANNELLE',
    name: 'Cannelle',
    category: 'Épices',
    source: 'https://slamaagricole.ma/product/cinnamon_spice_slama/',
    variants: [
      [100, '12.00'],
      [200, '20.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-POIVRE-NOIR',
    name: 'Poivre noir',
    category: 'Épices',
    source: 'https://slamaagricole.ma/product/black_pepper_slama/',
    variants: [
      [100, '14.00'],
      [200, '25.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-GINGEMBRE',
    name: 'Gingembre',
    category: 'Épices',
    source: 'https://slamaagricole.ma/product/ginger_spice_slama/',
    variants: [
      [100, '12.00'],
      [200, '20.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-ZEMITA-BLE',
    name: 'Zemita de blé',
    category: 'Zamita et farines',
    source: 'https://slamaagricole.ma/product/zemita-wheat/',
    variants: [
      [500, '15.00'],
      [1000, '25.00'],
    ],
  },
  {
    reference: 'SLAMA-WEB-CURCUMA',
    name: 'Curcuma',
    category: 'Épices',
    source: 'https://slamaagricole.ma/product/turmeric_spice_slama/',
    variants: [
      [100, '12.00'],
      [200, '20.00'],
    ],
  },
]

export async function seedCatalog(connection) {
  return connection.begin(async (tx) => {
    // Same deployment lock as the initializer, including standalone callers.
    await tx`SELECT pg_advisory_xact_lock(1936482669, 2)`
    const applied = await tx`SELECT id FROM public.audit_events
      WHERE action = 'seed' AND entity_table = 'catalog_seed'
      AND entity_key->>'name' = 'slama-public-catalog-v1' LIMIT 1`
    if (applied.length) return false
    // Fill only missing public contact details, never overwrite administrator settings.
    // Registered legal name, IF/RC/legal form and bank details require company confirmation.
    await tx`UPDATE public.company_settings SET
      trade_name = coalesce(trade_name, 'Slama Agricole'),
      address_line1 = coalesce(address_line1, 'Rue 20 Aout Oulad Mbarek'),
      city = coalesce(city, 'Beni Mellal'), postal_code = coalesce(postal_code, '23000'),
      phone = coalesce(phone, '+212633280907'),
      email = coalesce(email, 'cooperative.slama@gmail.com'),
      ice = coalesce(ice, '002145843000048'),
      version = version + 1, updated_at = now() WHERE id = 1`
    for (const product of seedProducts) {
      const [createdCategory] = await tx`INSERT INTO public.product_categories (name)
        VALUES (${product.category}) ON CONFLICT DO NOTHING RETURNING id`
      const category =
        createdCategory ??
        (
          await tx`SELECT id FROM public.product_categories
        WHERE lower(trim(name)) = lower(trim(${product.category}))`
        )[0]
      const [created] =
        await tx`INSERT INTO public.products (reference, name, category_id, description)
        VALUES (${product.reference}, ${product.name}, ${category.id}, ${'Public catalogue import: ' + product.source + ' (2026-10-10). Verify prices before use.'})
        ON CONFLICT DO NOTHING RETURNING id`
      // An existing reference belongs to the user: don't change its variants or pricing.
      if (!created) continue
      for (const [weight, price] of product.variants)
        await tx`INSERT INTO public.product_variants (product_id, weight_g, price_per_item)
          VALUES (${created.id}, ${weight}, ${price})`
    }
    await tx`INSERT INTO public.audit_events (actor_kind, action, entity_table, entity_key, after_values)
      VALUES ('system', 'seed', 'catalog_seed', ${JSON.stringify({ name: 'slama-public-catalog-v1' })}::text::jsonb,
        ${JSON.stringify({ source: 'https://slamaagricole.ma', capturedOn: '2026-10-10', products: seedProducts.length })}::text::jsonb)`
    return true
  })
}
