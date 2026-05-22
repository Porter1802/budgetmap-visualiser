with src as (
    select * from {{ source('atlas', 'projects') }}
)
select
    project_id,
    package_id,
    financial_year,
    package_version,
    name,
    description,
    activity_word,
    agency_id,
    nullif(agency_name, '') as agency_name,
    type_id,
    type_name,
    category,
    coalesce(from_bp3, category = 'capital') as from_bp3,
    status,
    region_sa4,
    region_lga,
    region_sed,
    pin_geom
from src
