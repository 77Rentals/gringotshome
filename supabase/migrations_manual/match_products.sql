-- Búsqueda difusa de productos por similitud de texto (pg_trgm), acotada al hogar.
create or replace function match_products(
  p_household_id uuid,
  p_query text,
  p_limit int default 5
)
returns table (
  id uuid,
  canonical_name text,
  brand text,
  size_value numeric,
  size_unit text,
  similarity real
)
language sql
stable
as $$
  select
    p.id,
    p.canonical_name,
    p.brand,
    p.size_value,
    p.size_unit,
    similarity(p.canonical_name, p_query) as similarity
  from products p
  where p.household_id = p_household_id
    and p.canonical_name % p_query
  order by similarity desc
  limit p_limit;
$$;
