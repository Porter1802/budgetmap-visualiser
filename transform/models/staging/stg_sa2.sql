with src as (
    select * from {{ source('atlas', 'sa2') }}
)
select
    sa2_code,
    sa2_name,
    sa3_code,
    sa4_code,
    sa4_name,
    gccsa_code,
    state_code,
    area_km2,
    geom
from src
