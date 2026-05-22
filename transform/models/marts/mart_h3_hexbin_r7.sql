{{ config(materialized='table') }}

-- H3 R7 aggregation of project counts and dollars for the statewide hexbin.
-- Funding is attributed to the location's hex; multi-location projects spread
-- their funding evenly across locations so statewide totals stay honest.
with loc as (
    select
        l.location_id,
        l.project_id,
        l.package_id,
        h3_lat_lng_to_cell(st_centroid(l.geom), 7) as h3_r7,
        count(*) over (partition by l.project_id, l.package_id) as loc_count
    from {{ source('atlas', 'project_locations') }} l
    where l.geom is not null
),
funding as (
    select project_id, package_id, sum(total_amount_aud) as total_amount_aud
    from {{ ref('stg_project_funding') }}
    group by 1, 2
)
select
    loc.h3_r7::text as h3_index,
    count(distinct loc.project_id) as project_count,
    sum(coalesce(f.total_amount_aud, 0) / loc.loc_count)::bigint as total_funding_aud,
    h3_cell_to_boundary_geometry(loc.h3_r7) as geom
from loc
left join funding f using (project_id, package_id)
group by 1, loc.h3_r7
