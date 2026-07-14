-- Gringotshome: esquema inicial de base de datos (Supabase/Postgres)

create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ============ HOGAR (household) ============
create table households (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,          -- código compartido de invitación (ej. "gringots-8f2a")
  name text not null default 'Gringotshome',
  created_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,          -- "Sebastian" / "Dani", sin login formal
  created_at timestamptz not null default now(),
  unique (household_id, display_name)
);

-- ============ TIENDAS Y CANALES ============
-- tienda real: Éxito, Carulla, Makro, D1, Ara, PriceSmart...
create table stores (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  aisle_hint text                      -- opcional: notas de organización física
);

-- canal de compra: Rappi, D1 app, presencial...
create table channels (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null            -- 'rappi', 'd1_app', 'presencial'
);

-- ============ CATALOGO DE PRODUCTOS ============
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,           -- lácteos, aseo, granos, frutas y verduras...
  aisle_order int not null default 0   -- para ordenar la lista por pasillo
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  canonical_name text not null,        -- "Leche Alquería Entera"
  brand text,
  size_value numeric,                  -- 1, 900, 1000...
  size_unit text,                      -- 'L', 'ml', 'kg', 'g', 'unidad'
  category_id uuid references categories(id),
  created_at timestamptz not null default now()
);

create index products_name_trgm_idx on products using gin (canonical_name gin_trgm_ops);

-- variantes de texto vistas en recibos, para mejorar el matching futuro
create table product_aliases (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  raw_text text not null
);

-- ============ RECIBOS ============
create table receipts (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  uploaded_by uuid references household_members(id),
  store_id uuid references stores(id),
  channel_id uuid references channels(id),
  purchase_date date,
  total_amount numeric,
  delivery_fee numeric default 0,
  tip_amount numeric default 0,
  cost_split text not null default 'shared' check (cost_split in ('shared', 'mine_only')),
  image_path text,                     -- ruta en Supabase Storage, se borra a los 30 días
  image_expires_at timestamptz,
  raw_extraction jsonb,                -- respuesta cruda del LLM, por si toca reprocesar
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now()
);

create table receipt_items (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  product_id uuid references products(id),   -- null hasta que se confirme el matching
  raw_text text not null,
  quantity numeric not null default 1,
  list_price numeric,                  -- precio antes de descuento
  paid_price numeric not null,         -- precio realmente pagado
  matched_confidence numeric,          -- score del matching difuso (0-1)
  confirmed boolean not null default false
);

-- ============ HISTORIAL DE PRECIOS ============
-- se deriva de receipt_items confirmados, pero se guarda desnormalizado para consultas rápidas
create table prices (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id),
  channel_id uuid not null references channels(id),
  list_price numeric,
  paid_price numeric not null,
  source text not null default 'receipt' check (source in ('receipt', 'live_check')),
  observed_at timestamptz not null default now(),
  receipt_item_id uuid references receipt_items(id)
);

create index prices_product_store_idx on prices (product_id, store_id, observed_at desc);

-- caché del agente de precio en vivo (máx. 1 consulta real cada 24h por producto)
create table price_checks (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid references stores(id),
  channel_id uuid references channels(id),
  result_price numeric,
  on_discount boolean default false,
  raw_response jsonb,
  checked_at timestamptz not null default now()
);

create index price_checks_product_recent_idx on price_checks (product_id, checked_at desc);

-- ============ LISTA DE MERCADO ============
create table shopping_list_items (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid references products(id),
  raw_name text,                       -- si aún no está en el catálogo
  quantity numeric not null default 1,
  added_by uuid references household_members(id),
  ai_suggested boolean not null default false,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ ROW LEVEL SECURITY ============
-- App privada de 2 usuarios sin login formal: la anon key ya es un secreto de proyecto
-- que solo Sebastian y Dani tienen. Políticas abiertas por ahora; se puede endurecer
-- después con un JWT firmado por household_code si el proyecto crece.
alter table households enable row level security;
alter table household_members enable row level security;
alter table stores enable row level security;
alter table channels enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_aliases enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table prices enable row level security;
alter table price_checks enable row level security;
alter table shopping_list_items enable row level security;

create policy "anon full access" on households for all using (true) with check (true);
create policy "anon full access" on household_members for all using (true) with check (true);
create policy "anon full access" on stores for all using (true) with check (true);
create policy "anon full access" on channels for all using (true) with check (true);
create policy "anon full access" on categories for all using (true) with check (true);
create policy "anon full access" on products for all using (true) with check (true);
create policy "anon full access" on product_aliases for all using (true) with check (true);
create policy "anon full access" on receipts for all using (true) with check (true);
create policy "anon full access" on receipt_items for all using (true) with check (true);
create policy "anon full access" on prices for all using (true) with check (true);
create policy "anon full access" on price_checks for all using (true) with check (true);
create policy "anon full access" on shopping_list_items for all using (true) with check (true);

-- ============ DATOS INICIALES ============
insert into stores (name) values
  ('Éxito'), ('Carulla'), ('Makro'), ('D1'), ('Ara'), ('PriceSmart');

insert into channels (name) values
  ('rappi'), ('d1_app'), ('presencial');

insert into categories (name, aisle_order) values
  ('Lácteos', 1), ('Panadería', 2), ('Frutas y verduras', 3),
  ('Carnes', 4), ('Granos y abarrotes', 5), ('Aseo del hogar', 6),
  ('Aseo personal', 7), ('Bebidas', 8), ('Congelados', 9), ('Otros', 10);
