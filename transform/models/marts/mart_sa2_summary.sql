-- One row per SA2 x financial year: the spine of the "my SA2" page. Project
-- counts + funding (overlap-allocated), dominant agency, and context indicators.
-- Phase 3 extends this with crime, transit, flood/bushfire, canopy columns.
with alloc as (
    select * from {{ ref('int_project_sa2_alloc') }}
),
proj as (
    select project_id, package_id, financial_year, agency_name
    from {{ ref('stg_projects') }}
),
funding as (
    select project_id, package_id, funding_source, sum(total_amount_aud) as amt
    from {{ ref('stg_project_funding') }}
    group by 1, 2, 3
),
per_sa2 as (
    select
        a.sa2_code,
        proj.financial_year,
        count(distinct a.project_id) as project_count,
        sum(case when f.funding_source = 'qld'     then f.amt * a.alloc_weight else 0 end)::bigint as qld_funding_aud,
        sum(case when f.funding_source = 'fed'     then f.amt * a.alloc_weight else 0 end)::bigint as fed_funding_aud,
        sum(case when f.funding_source = 'local'   then f.amt * a.alloc_weight else 0 end)::bigint as local_funding_aud,
        sum(case when f.funding_source = 'own_src' then f.amt * a.alloc_weight else 0 end)::bigint as own_src_funding_aud,
        sum(case when f.funding_source = 'private' then f.amt * a.alloc_weight else 0 end)::bigint as private_funding_aud,
        sum(f.amt * a.alloc_weight)::bigint as total_funding_aud
    from alloc a
    join proj using (project_id, package_id)
    left join funding f using (project_id, package_id)
    group by 1, 2
),
dominant_agency as (
    select sa2_code, financial_year, agency_name
    from (
        select
            a.sa2_code,
            proj.financial_year,
            proj.agency_name,
            sum(f.amt * a.alloc_weight) as agency_funding,
            row_number() over (
                partition by a.sa2_code, proj.financial_year
                order by sum(f.amt * a.alloc_weight) desc nulls last
            ) as rn
        from alloc a
        join proj using (project_id, package_id)
        left join funding f using (project_id, package_id)
        group by 1, 2, 3
    ) ranked
    where rn = 1
)
select
    s.sa2_code,
    s.sa2_name,
    s.sa4_name,
    coalesce(ps.financial_year, '{{ var("financial_year", "2024-25") }}') as financial_year,
    coalesce(ps.project_count, 0)        as project_count,
    coalesce(ps.total_funding_aud, 0)    as total_funding_aud,
    coalesce(ps.qld_funding_aud, 0)      as qld_funding_aud,
    coalesce(ps.fed_funding_aud, 0)      as fed_funding_aud,
    coalesce(ps.local_funding_aud, 0)    as local_funding_aud,
    coalesce(ps.own_src_funding_aud, 0)  as own_src_funding_aud,
    coalesce(ps.private_funding_aud, 0)  as private_funding_aud,
    da.agency_name                        as dominant_agency,
    seifa.irsd_score,
    seifa.irsd_decile,
    erp.erp                               as population,
    coalesce(transit.stop_count, 0)       as transit_stop_count,
    coalesce(flood.exposure_pct, 0)       as flood_exposure_pct,
    canopy.canopy_pct
from {{ ref('stg_sa2') }} s
left join per_sa2 ps on ps.sa2_code = s.sa2_code
left join dominant_agency da on da.sa2_code = s.sa2_code and da.financial_year = ps.financial_year
left join {{ source('atlas', 'seifa') }} seifa on seifa.sa2_code = s.sa2_code
left join (
    select distinct on (sa2_code) sa2_code, erp
    from {{ source('atlas', 'population_erp') }}
    order by sa2_code, year desc
) erp on erp.sa2_code = s.sa2_code
left join (
    select s2.sa2_code, count(ts.stop_id) as stop_count
    from {{ ref('stg_sa2') }} s2
    join {{ source('atlas', 'transit_isochrone_30min') }} iso on iso.sa2_code = s2.sa2_code
    join public.transit_stops ts on st_contains(iso.geom, ts.geom)
    group by 1
) transit on transit.sa2_code = s.sa2_code
left join (
    select s2.sa2_code,
           least(1.0, sum(st_area(st_intersection(s2.geom, fe.geom)::geography))
                      / nullif(max(st_area(s2.geom::geography)), 0)) as exposure_pct
    from {{ ref('stg_sa2') }} s2
    join {{ source('atlas', 'flood_extents') }} fe on st_intersects(s2.geom, fe.geom)
    group by 1
) flood on flood.sa2_code = s.sa2_code
left join {{ source('atlas', 'tree_canopy_sa2') }} canopy on canopy.sa2_code = s.sa2_code
