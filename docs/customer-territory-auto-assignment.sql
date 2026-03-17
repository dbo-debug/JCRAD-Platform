-- Customer territory auto-assignment
-- ----------------------------------
-- Purpose:
-- 1. Preview conservative territory assignments for existing customers.
-- 2. Update only high-confidence matches.
-- 3. Audit overall assignment coverage after the update.
--
-- Notes:
-- - This is intentionally conservative. Ambiguous records stay unassigned.
-- - It uses only territory codes already seeded in public.territories.
-- - It prefers city matches first, then a small number of clean zip-based fallbacks.
-- - The update query only assigns customers whose territory_code is currently null.

-- ---------------------------------------------------------------------------
-- 1. READ-ONLY PREVIEW
-- ---------------------------------------------------------------------------
with normalized_customers as (
  select
    c.id,
    coalesce(
      nullif(trim(c.company_name), ''),
      nullif(trim(c.name), ''),
      nullif(trim(c.display_name), ''),
      'Unnamed customer'
    ) as company_name,
    nullif(trim(c.city), '') as city,
    lower(trim(coalesce(c.city, ''))) as city_norm,
    nullif(trim(c.state), '') as state,
    lower(trim(coalesce(c.state, ''))) as state_norm,
    nullif(trim(c.postal_code), '') as postal_code,
    case
      when length(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g')) >= 5
        then left(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g'), 5)
      else null
    end as zip5_text,
    case
      when length(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g')) >= 5
        then left(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g'), 5)::integer
      else null
    end as zip5,
    c.territory_code as current_territory_code
  from public.customers c
),
proposed_assignments as (
  select
    nc.id,
    nc.company_name,
    nc.city,
    nc.postal_code,
    nc.current_territory_code,
    case
      when not (
        nc.state_norm in ('ca', 'california')
        or nc.zip5 between 90001 and 96162
      ) then null

      -- Los Angeles core
      when nc.city_norm in (
        'los angeles', 'beverly hills', 'west hollywood', 'santa monica',
        'culver city', 'inglewood', 'hawthorne', 'gardena', 'torrance',
        'manhattan beach', 'hermosa beach', 'redondo beach', 'el segundo',
        'marina del rey'
      ) then 'CA-LA-CORE'
      when nc.zip5 between 90001 and 90089 then 'CA-LA-CORE'
      when nc.zip5 in (90210, 90211, 90212, 90230, 90245, 90254, 90266, 90301, 90302, 90303, 90304, 90401, 90402, 90403, 90404, 90405, 90501, 90502, 90503, 90504, 90505) then 'CA-LA-CORE'

      -- Long Beach
      when nc.city_norm in (
        'long beach', 'signal hill', 'lakewood'
      ) then 'CA-LONG-BEACH'
      when nc.zip5 in (90712, 90713, 90755, 90802, 90803, 90804, 90805, 90806, 90807, 90808, 90810, 90813, 90814, 90815) then 'CA-LONG-BEACH'

      -- San Gabriel Valley
      when nc.city_norm in (
        'pasadena', 'south pasadena', 'alhambra', 'arcadia', 'azusa',
        'baldwin park', 'covina', 'west covina', 'duarte', 'el monte',
        'south el monte', 'glendora', 'hacienda heights', 'la canada flintridge',
        'la puente', 'monrovia', 'montebello', 'monterey park', 'rosemead',
        'rowland heights', 'san dimas', 'san gabriel', 'san marino',
        'sierra madre', 'temple city', 'walnut', 'whittier'
      ) then 'CA-SAN-GABRIEL'

      -- San Fernando Valley
      when nc.city_norm in (
        'san fernando', 'sylmar', 'granada hills', 'porter ranch',
        'mission hills', 'north hills', 'northridge', 'reseda',
        'encino', 'sherman oaks', 'studio city', 'valley village',
        'north hollywood', 'van nuys', 'panorama city', 'pacoima',
        'arleta', 'sun valley', 'sunland', 'tujunga', 'tarzana',
        'woodland hills', 'west hills', 'canoga park', 'chatsworth',
        'burbank'
      ) then 'CA-SAN-FERNANDO-VALLEY'
      when nc.zip5 in (91303, 91304, 91306, 91307, 91311, 91316, 91324, 91325, 91326, 91331, 91335, 91340, 91342, 91343, 91344, 91345, 91352, 91356, 91364, 91367, 91401, 91402, 91403, 91405, 91406, 91411, 91423, 91436, 91504, 91505, 91601, 91602, 91604, 91605, 91606, 91607) then 'CA-SAN-FERNANDO-VALLEY'

      -- Orange County
      when nc.city_norm in (
        'anaheim', 'brea', 'buena park', 'costa mesa', 'cypress', 'dana point',
        'fountain valley', 'fullerton', 'garden grove', 'huntington beach',
        'irvine', 'la habra', 'laguna beach', 'laguna hills', 'laguna niguel',
        'lake forest', 'los alamitos', 'mission viejo', 'newport beach',
        'orange', 'placentia', 'rancho santa margarita', 'san clemente',
        'san juan capistrano', 'santa ana', 'seal beach', 'stanton',
        'tustin', 'villa park', 'westminster', 'yorba linda'
      ) then 'CA-ORANGE-COUNTY'
      when nc.zip5 between 92602 and 92799 then 'CA-ORANGE-COUNTY'
      when nc.zip5 in (92801, 92802, 92804, 92805, 92806, 92807, 92808, 92821, 92831, 92832, 92833, 92835, 92840, 92841, 92843, 92844, 92845, 92861, 92865, 92866, 92867, 92868, 92869, 92870, 92886, 92887) then 'CA-ORANGE-COUNTY'

      -- San Diego
      when nc.city_norm in (
        'san diego', 'chula vista', 'national city', 'la mesa', 'el cajon',
        'santee', 'poway', 'escondido', 'vista', 'san marcos', 'oceanside',
        'encinitas', 'carlsbad', 'solana beach', 'del mar', 'coronado',
        'imperial beach', 'lemon grove'
      ) then 'CA-SAN-DIEGO'
      when nc.zip5 between 91901 and 92199 then 'CA-SAN-DIEGO'

      -- Inland Empire
      when nc.city_norm in (
        'riverside', 'san bernardino', 'ontario', 'rancho cucamonga', 'upland',
        'fontana', 'redlands', 'colton', 'grand terrace', 'rialto', 'loma linda',
        'highland', 'yucaipa', 'chino', 'chino hills', 'eastvale', 'corona',
        'norco', 'moreno valley', 'perris', 'menifee', 'temecula', 'murrieta',
        'lake elsinore', 'hemet', 'san jacinto', 'beaumont', 'banning'
      ) then 'CA-INLAND-EMPIRE'
      when nc.zip5 between 92301 and 92599 then 'CA-INLAND-EMPIRE'

      -- Desert / High Desert
      when nc.city_norm in (
        'palm springs', 'cathedral city', 'rancho mirage', 'palm desert',
        'indio', 'la quinta', 'coachella', 'desert hot springs',
        'yucca valley', 'joshua tree', 'twentynine palms', 'barstow',
        'victorville', 'hesperia', 'apple valley', 'adelanto',
        'lancaster', 'palmdale', 'ridgecrest', 'needles'
      ) then 'CA-DESERT'
      when nc.zip5 between 92201 and 92299 then 'CA-DESERT'
      when nc.zip5 in (92307, 92308, 92311, 92344, 92345, 92371, 92392, 92394, 92395, 92397, 93255, 93534, 93535, 93536, 93550, 93551, 93552) then 'CA-DESERT'

      -- San Francisco / Peninsula
      when nc.city_norm in (
        'san francisco', 'daly city', 'south san francisco', 'brisbane',
        'pacifica', 'san bruno', 'millbrae', 'burlingame', 'hillsborough',
        'san mateo', 'foster city', 'belmont', 'san carlos', 'redwood city',
        'menlo park', 'atherton', 'half moon bay'
      ) then 'CA-SF-PENINSULA'
      when nc.zip5 in (94002, 94005, 94010, 94014, 94015, 94019, 94030, 94044, 94063, 94065, 94066, 94070, 94080, 94401, 94402, 94403, 94404, 94102, 94103, 94105, 94107, 94108, 94109, 94110, 94111, 94112, 94114, 94115, 94116, 94117, 94118, 94121, 94122, 94123, 94124, 94127, 94131, 94132, 94133, 94134) then 'CA-SF-PENINSULA'

      -- South Bay
      when nc.city_norm in (
        'san jose', 'santa clara', 'sunnyvale', 'cupertino', 'campbell',
        'saratoga', 'los gatos', 'milpitas', 'mountain view', 'palo alto',
        'los altos', 'los altos hills', 'morgan hill', 'gilroy'
      ) then 'CA-SOUTH-BAY'

      -- East Bay
      when nc.city_norm in (
        'oakland', 'berkeley', 'alameda', 'emeryville', 'piedmont',
        'richmond', 'el cerrito', 'albany', 'walnut creek', 'concord',
        'pleasant hill', 'martinez', 'lafayette', 'moraga', 'orinda',
        'antioch', 'pittsburg', 'brentwood', 'oakley', 'danville',
        'san ramon', 'dublin', 'pleasanton', 'livermore', 'hayward',
        'union city', 'newark', 'fremont', 'san leandro', 'castro valley'
      ) then 'CA-EAST-BAY'

      -- North Bay
      when nc.city_norm in (
        'san rafael', 'novato', 'mill valley', 'sausalito', 'larkspur',
        'petaluma', 'rohnert park', 'santa rosa', 'healdsburg', 'windsor',
        'sonoma', 'napa', 'american canyon'
      ) then 'CA-NORTH-BAY'

      -- North Mendocino
      when nc.city_norm in (
        'ukiah', 'willits', 'fort bragg', 'mendocino', 'point arena'
      ) then 'CA-NORTH-MENDOCINO'
      when nc.zip5 in (95410, 95417, 95437, 95445, 95449, 95454, 95456, 95459, 95460, 95466, 95470, 95482, 95490) then 'CA-NORTH-MENDOCINO'

      -- Sacramento / Delta
      when nc.city_norm in (
        'sacramento', 'west sacramento', 'elk grove', 'rancho cordova',
        'folsom', 'woodland', 'davis'
      ) then 'CA-SAC-DELTA'
      when nc.zip5 between 95605 and 95899 then 'CA-SAC-DELTA'

      -- Sierra foothills
      when nc.city_norm in (
        'auburn', 'grass valley', 'nevada city', 'placerville', 'cameron park',
        'shingle springs', 'jackson', 'sutter creek', 'ione', 'sonora'
      ) then 'CA-FOOTHILLS'

      -- Monterey Bay
      when nc.city_norm in (
        'monterey', 'pacific grove', 'carmel', 'carmel-by-the-sea',
        'seaside', 'marina', 'salinas', 'king city', 'greenfield', 'soledad'
      ) then 'CA-MONTEREY-BAY'

      -- Central Coast
      when nc.city_norm in (
        'santa barbara', 'goleta', 'carpinteria', 'ventura', 'oxnard',
        'camarillo', 'thousand oaks', 'simi valley', 'san luis obispo',
        'pismo beach', 'arroyo grande', 'paso robles', 'atascadero',
        'lompoc', 'santa maria'
      ) then 'CA-CENTRAL-COAST'
      when nc.zip5 between 93001 and 93465 then 'CA-CENTRAL-COAST'

      -- North San Joaquin Valley
      when nc.city_norm in (
        'stockton', 'lodi', 'manteca', 'tracy', 'modesto', 'turlock',
        'ceres', 'merced', 'los banos'
      ) then 'CA-CENTRAL-VALLEY-NORTH'
      when nc.zip5 between 95201 and 95399 then 'CA-CENTRAL-VALLEY-NORTH'

      -- South San Joaquin Valley
      when nc.city_norm in (
        'fresno', 'clovis', 'visalia', 'tulare', 'hanford', 'porterville',
        'bakersfield', 'delano'
      ) then 'CA-CENTRAL-VALLEY-SOUTH'
      when nc.zip5 between 93201 and 93799 then 'CA-CENTRAL-VALLEY-SOUTH'

      -- Far North / North Coast
      when nc.city_norm in (
        'redding', 'chico', 'eureka', 'arcata', 'red bluff', 'willows',
        'mt shasta', 'mount shasta', 'yreka', 'crescent city'
      ) then 'CA-FAR-NORTH'
      when nc.zip5 between 95501 and 96099 then 'CA-FAR-NORTH'

      else null
    end as proposed_territory_code
  from normalized_customers nc
)
select
  id,
  company_name,
  city,
  postal_code,
  current_territory_code as territory_code,
  proposed_territory_code
from proposed_assignments
where proposed_territory_code is not null
order by proposed_territory_code, city nulls last, company_name;

-- ---------------------------------------------------------------------------
-- 2. CONFIDENT UPDATE
-- ---------------------------------------------------------------------------
-- Safety rules:
-- - only assign when territory_code is currently null
-- - only assign when the proposed code exists in public.territories
with normalized_customers as (
  select
    c.id,
    lower(trim(coalesce(c.city, ''))) as city_norm,
    lower(trim(coalesce(c.state, ''))) as state_norm,
    case
      when length(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g')) >= 5
        then left(regexp_replace(coalesce(c.postal_code, ''), '[^0-9]', '', 'g'), 5)::integer
      else null
    end as zip5,
    c.territory_code
  from public.customers c
),
proposed_assignments as (
  select
    nc.id,
    case
      when not (
        nc.state_norm in ('ca', 'california')
        or nc.zip5 between 90001 and 96162
      ) then null
      when nc.city_norm in ('los angeles', 'beverly hills', 'west hollywood', 'santa monica', 'culver city', 'inglewood', 'hawthorne', 'gardena', 'torrance', 'manhattan beach', 'hermosa beach', 'redondo beach', 'el segundo', 'marina del rey') then 'CA-LA-CORE'
      when nc.zip5 between 90001 and 90089 then 'CA-LA-CORE'
      when nc.zip5 in (90210, 90211, 90212, 90230, 90245, 90254, 90266, 90301, 90302, 90303, 90304, 90401, 90402, 90403, 90404, 90405, 90501, 90502, 90503, 90504, 90505) then 'CA-LA-CORE'
      when nc.city_norm in ('long beach', 'signal hill', 'lakewood') then 'CA-LONG-BEACH'
      when nc.zip5 in (90712, 90713, 90755, 90802, 90803, 90804, 90805, 90806, 90807, 90808, 90810, 90813, 90814, 90815) then 'CA-LONG-BEACH'
      when nc.city_norm in ('pasadena', 'south pasadena', 'alhambra', 'arcadia', 'azusa', 'baldwin park', 'covina', 'west covina', 'duarte', 'el monte', 'south el monte', 'glendora', 'hacienda heights', 'la canada flintridge', 'la puente', 'monrovia', 'montebello', 'monterey park', 'rosemead', 'rowland heights', 'san dimas', 'san gabriel', 'san marino', 'sierra madre', 'temple city', 'walnut', 'whittier') then 'CA-SAN-GABRIEL'
      when nc.city_norm in ('san fernando', 'sylmar', 'granada hills', 'porter ranch', 'mission hills', 'north hills', 'northridge', 'reseda', 'encino', 'sherman oaks', 'studio city', 'valley village', 'north hollywood', 'van nuys', 'panorama city', 'pacoima', 'arleta', 'sun valley', 'sunland', 'tujunga', 'tarzana', 'woodland hills', 'west hills', 'canoga park', 'chatsworth', 'burbank') then 'CA-SAN-FERNANDO-VALLEY'
      when nc.zip5 in (91303, 91304, 91306, 91307, 91311, 91316, 91324, 91325, 91326, 91331, 91335, 91340, 91342, 91343, 91344, 91345, 91352, 91356, 91364, 91367, 91401, 91402, 91403, 91405, 91406, 91411, 91423, 91436, 91504, 91505, 91601, 91602, 91604, 91605, 91606, 91607) then 'CA-SAN-FERNANDO-VALLEY'
      when nc.city_norm in ('anaheim', 'brea', 'buena park', 'costa mesa', 'cypress', 'dana point', 'fountain valley', 'fullerton', 'garden grove', 'huntington beach', 'irvine', 'la habra', 'laguna beach', 'laguna hills', 'laguna niguel', 'lake forest', 'los alamitos', 'mission viejo', 'newport beach', 'orange', 'placentia', 'rancho santa margarita', 'san clemente', 'san juan capistrano', 'santa ana', 'seal beach', 'stanton', 'tustin', 'villa park', 'westminster', 'yorba linda') then 'CA-ORANGE-COUNTY'
      when nc.zip5 between 92602 and 92799 then 'CA-ORANGE-COUNTY'
      when nc.zip5 in (92801, 92802, 92804, 92805, 92806, 92807, 92808, 92821, 92831, 92832, 92833, 92835, 92840, 92841, 92843, 92844, 92845, 92861, 92865, 92866, 92867, 92868, 92869, 92870, 92886, 92887) then 'CA-ORANGE-COUNTY'
      when nc.city_norm in ('san diego', 'chula vista', 'national city', 'la mesa', 'el cajon', 'santee', 'poway', 'escondido', 'vista', 'san marcos', 'oceanside', 'encinitas', 'carlsbad', 'solana beach', 'del mar', 'coronado', 'imperial beach', 'lemon grove') then 'CA-SAN-DIEGO'
      when nc.zip5 between 91901 and 92199 then 'CA-SAN-DIEGO'
      when nc.city_norm in ('riverside', 'san bernardino', 'ontario', 'rancho cucamonga', 'upland', 'fontana', 'redlands', 'colton', 'grand terrace', 'rialto', 'loma linda', 'highland', 'yucaipa', 'chino', 'chino hills', 'eastvale', 'corona', 'norco', 'moreno valley', 'perris', 'menifee', 'temecula', 'murrieta', 'lake elsinore', 'hemet', 'san jacinto', 'beaumont', 'banning') then 'CA-INLAND-EMPIRE'
      when nc.zip5 between 92301 and 92599 then 'CA-INLAND-EMPIRE'
      when nc.city_norm in ('palm springs', 'cathedral city', 'rancho mirage', 'palm desert', 'indio', 'la quinta', 'coachella', 'desert hot springs', 'yucca valley', 'joshua tree', 'twentynine palms', 'barstow', 'victorville', 'hesperia', 'apple valley', 'adelanto', 'lancaster', 'palmdale', 'ridgecrest', 'needles') then 'CA-DESERT'
      when nc.zip5 between 92201 and 92299 then 'CA-DESERT'
      when nc.zip5 in (92307, 92308, 92311, 92344, 92345, 92371, 92392, 92394, 92395, 92397, 93255, 93534, 93535, 93536, 93550, 93551, 93552) then 'CA-DESERT'
      when nc.city_norm in ('san francisco', 'daly city', 'south san francisco', 'brisbane', 'pacifica', 'san bruno', 'millbrae', 'burlingame', 'hillsborough', 'san mateo', 'foster city', 'belmont', 'san carlos', 'redwood city', 'menlo park', 'atherton', 'half moon bay') then 'CA-SF-PENINSULA'
      when nc.zip5 in (94002, 94005, 94010, 94014, 94015, 94019, 94030, 94044, 94063, 94065, 94066, 94070, 94080, 94401, 94402, 94403, 94404, 94102, 94103, 94105, 94107, 94108, 94109, 94110, 94111, 94112, 94114, 94115, 94116, 94117, 94118, 94121, 94122, 94123, 94124, 94127, 94131, 94132, 94133, 94134) then 'CA-SF-PENINSULA'
      when nc.city_norm in ('san jose', 'santa clara', 'sunnyvale', 'cupertino', 'campbell', 'saratoga', 'los gatos', 'milpitas', 'mountain view', 'palo alto', 'los altos', 'los altos hills', 'morgan hill', 'gilroy') then 'CA-SOUTH-BAY'
      when nc.city_norm in ('oakland', 'berkeley', 'alameda', 'emeryville', 'piedmont', 'richmond', 'el cerrito', 'albany', 'walnut creek', 'concord', 'pleasant hill', 'martinez', 'lafayette', 'moraga', 'orinda', 'antioch', 'pittsburg', 'brentwood', 'oakley', 'danville', 'san ramon', 'dublin', 'pleasanton', 'livermore', 'hayward', 'union city', 'newark', 'fremont', 'san leandro', 'castro valley') then 'CA-EAST-BAY'
      when nc.city_norm in ('san rafael', 'novato', 'mill valley', 'sausalito', 'larkspur', 'petaluma', 'rohnert park', 'santa rosa', 'healdsburg', 'windsor', 'sonoma', 'napa', 'american canyon') then 'CA-NORTH-BAY'
      when nc.city_norm in ('ukiah', 'willits', 'fort bragg', 'mendocino', 'point arena') then 'CA-NORTH-MENDOCINO'
      when nc.zip5 in (95410, 95417, 95437, 95445, 95449, 95454, 95456, 95459, 95460, 95466, 95470, 95482, 95490) then 'CA-NORTH-MENDOCINO'
      when nc.city_norm in ('sacramento', 'west sacramento', 'elk grove', 'rancho cordova', 'folsom', 'woodland', 'davis') then 'CA-SAC-DELTA'
      when nc.zip5 between 95605 and 95899 then 'CA-SAC-DELTA'
      when nc.city_norm in ('auburn', 'grass valley', 'nevada city', 'placerville', 'cameron park', 'shingle springs', 'jackson', 'sutter creek', 'ione', 'sonora') then 'CA-FOOTHILLS'
      when nc.city_norm in ('monterey', 'pacific grove', 'carmel', 'carmel-by-the-sea', 'seaside', 'marina', 'salinas', 'king city', 'greenfield', 'soledad') then 'CA-MONTEREY-BAY'
      when nc.city_norm in ('santa barbara', 'goleta', 'carpinteria', 'ventura', 'oxnard', 'camarillo', 'thousand oaks', 'simi valley', 'san luis obispo', 'pismo beach', 'arroyo grande', 'paso robles', 'atascadero', 'lompoc', 'santa maria') then 'CA-CENTRAL-COAST'
      when nc.zip5 between 93001 and 93465 then 'CA-CENTRAL-COAST'
      when nc.city_norm in ('stockton', 'lodi', 'manteca', 'tracy', 'modesto', 'turlock', 'ceres', 'merced', 'los banos') then 'CA-CENTRAL-VALLEY-NORTH'
      when nc.zip5 between 95201 and 95399 then 'CA-CENTRAL-VALLEY-NORTH'
      when nc.city_norm in ('fresno', 'clovis', 'visalia', 'tulare', 'hanford', 'porterville', 'bakersfield', 'delano') then 'CA-CENTRAL-VALLEY-SOUTH'
      when nc.zip5 between 93201 and 93799 then 'CA-CENTRAL-VALLEY-SOUTH'
      when nc.city_norm in ('redding', 'chico', 'eureka', 'arcata', 'red bluff', 'willows', 'mt shasta', 'mount shasta', 'yreka', 'crescent city') then 'CA-FAR-NORTH'
      when nc.zip5 between 95501 and 96099 then 'CA-FAR-NORTH'
      else null
    end as proposed_territory_code
  from normalized_customers nc
)
update public.customers c
set territory_code = pa.proposed_territory_code
from proposed_assignments pa
where c.id = pa.id
  and c.territory_code is null
  and pa.proposed_territory_code is not null
  and exists (
    select 1
    from public.territories t
    where t.code = pa.proposed_territory_code
  );

-- ---------------------------------------------------------------------------
-- 3. FINAL AUDIT
-- ---------------------------------------------------------------------------

-- High-level summary
select
  count(*) as total_customers,
  count(*) filter (where territory_code is not null) as customers_assigned_to_territory,
  count(*) filter (where territory_code is null) as customers_still_unassigned
from public.customers;

-- Territory distribution, including unassigned
select
  coalesce(c.territory_code, 'UNASSIGNED') as territory_code,
  count(*) as customer_count
from public.customers c
group by coalesce(c.territory_code, 'UNASSIGNED')
order by
  case when coalesce(c.territory_code, 'UNASSIGNED') = 'UNASSIGNED' then 1 else 0 end,
  customer_count desc,
  territory_code;
