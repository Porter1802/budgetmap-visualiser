with src as (
    select * from {{ source('atlas', 'project_funding') }}
)
select
    project_id,
    package_id,
    funding_source,
    coalesce(annual_amount_aud, 0) as annual_amount_aud,
    coalesce(total_amount_aud, 0)  as total_amount_aud
from src
