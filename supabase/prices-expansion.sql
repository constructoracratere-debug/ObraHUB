-- ======================================================================
-- ObraHub — Price expansion: electrical, carpentry, plumbing consumables
-- Run in: Supabase SQL Editor. Adds ~40 items for detailed trade breakdowns.
-- ======================================================================
insert into public.price_items (country, category, code, name, unit, price_cop, source) values
-- ELÉCTRICOS — Conduits y accesorios
('colombia','material','MAT-039','Tubo PVC conduit rígido ½" (6m)','tubo',18000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-040','Tubo PVC conduit rígido 1" (6m)','tubo',35000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-041','Caja de paso PVC cuadrada con tapa','unidad',6500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-042','Caja de conexión PVC octogonal','unidad',5500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-043','Codo PVC conduit ½" curva','unidad',2200,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-044','Unión PVC conduit ½" campana','unidad',1800,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-045','Pegante PVC para conduit (galón)','galón',42000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-046','Cinta aislante negra (rollo 20m)','rollo',3500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-047','Breaker termomagnético 15A','unidad',28000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-048','Breaker termomagnético 20A','unidad',32000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-049','Breaker termomagnético 30A','unidad',38000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-050','Breaker termomagnético 40A','unidad',45000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-051','Cable THW cal. 14 AWG (m)','m',2800,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-052','Cable THW cal. 8 AWG (m)','m',7200,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-053','Cable THW cal. 6 AWG (m)','m',10500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-054','Tomacorriente sencillo con placa','unidad',22000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-055','Interruptor doble con placa','unidad',26000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-056','Portalámpara rosca E27 bakelita','unidad',8500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-057','Varilla de cobre puesta a tierra 5/8" x 2.4m','unidad',68000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-058','Conector de compresión cable-tierra','unidad',12000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
-- CARPINTERÍA — Herrajes y consumibles
('colombia','material','MAT-059','Tornillo para madera 2" caja 100 und','caja',18000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-060','Tornillo para madera 1" caja 100 und','caja',14000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-061','Pegante para madera (galón)','galón',55000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-062','Bisagra de hierro 3" par','par',8500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-063','Bisagra piano latón 1m','unidad',28000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-064','Cerradura cilíndrica doble boca','unidad',85000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-065','Cerradura baño / privacidad','unidad',55000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-066','Lija de agua grano 120 (unidad)','unidad',1800,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-067','Lija para madera grano 80 (unidad)','unidad',1500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-068','Sella/Primer para madera (galón)','galón',62000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-069','Laca para madera transparente (galón)','galón',78000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-070','Tornillo autorroscante 1" p/metal (caja 100)','caja',16000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
-- PINTURA — Consumibles
('colombia','material','MAT-071','Rodillo de lana 9" (unidad)','unidad',8500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-072','Brocha 3" (unidad)','unidad',6500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-073','Bandeja para pintura (unidad)','unidad',12000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-074','Imprimación / sellador para pared (galón)','galón',52000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
-- CONCRETO — Aditivos y consumibles
('colombia','material','MAT-075','Aditivo plastificante para concreto (litro)','litro',12000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-076','Desmoldante para formaleta (litro)','litro',15000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-077','Gravilla de río 3/4" para concreto','m³',78000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-078','Aditivo impermeabilizante integral (litro)','litro',18000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
-- HIDROSANITARIO — Accesorios
('colombia','material','MAT-079','Codo PVC hidráulico ½" 90°','unidad',1200,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-080','Tee PVC hidráulica ½"','unidad',1500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-081','Reducción PVC hidráulica ½" x 3/8"','unidad',1100,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-082','Codo PVC sanitario 4" 90°','unidad',9500,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-083','Tee PVC sanitaria 4"','unidad',12000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-084','Sifón PVC para lavamanos','unidad',22000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-085','Llave de paso esférica ½" bronce','unidad',35000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','material','MAT-086','Accesorio tubería cobre codo soldable ½"','unidad',4800,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
-- MANO DE OBRA adicional
('colombia','labor','LAB-013','Ayudante electricista','día',70000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','labor','LAB-014','Ayudante de pintor','día',60000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','labor','LAB-015','Ayudante de albañil','día',60000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)'),
('colombia','labor','LAB-016','Maestro de obra negra (cimentación)','día',140000,'Base de datos ObraHub — precios de referencia Colombia (DANE/IPC 2025)')
on conflict do nothing;
