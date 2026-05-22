with src as (
    select * from {{ source('atlas', 'project_location_sa2') }}
),
loc as (
    select location_id, project_id, package_id
    from {{ source('atlas', 'project_locations') }}
)
select
    src.location_id,
    loc.project_id,
    loc.package_id,
    src.sa2_code,
    src.overlap_fraction
from src
join loc using (location_id)
