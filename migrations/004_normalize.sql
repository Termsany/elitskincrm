-- Normalize city names
UPDATE doctors SET city='Al Khobar' WHERE city='Alkhobar';
UPDATE doctors SET city='Dammam' WHERE city='DAMMAM';
UPDATE doctors SET city='Al Ahsa' WHERE city='Alehsaa';
UPDATE doctors SET city='Al Jubail' WHERE city='jubil';
UPDATE doctors SET city='Sehhat' WHERE city='sehat';
-- Normalize clinic spacing: trim and fix " -" spacing
UPDATE doctors SET clinic_name = regexp_replace(trim(clinic_name), '\s*-\s*', ' - ', 'g');
UPDATE doctors SET clinic_name = regexp_replace(clinic_name, '\s+', ' ', 'g');
UPDATE doctors SET city = regexp_replace(trim(city), '\s+', ' ', 'g');
