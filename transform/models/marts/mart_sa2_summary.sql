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
    erp.erp                               as population
from {{ ref('stg_sa2') }} s
left join per_sa2 ps on ps.sa2_code = s.sa2_code
left join dominant_agency da on da.sa2_code = s.sa2_code and da.financial_year = ps.financial_year
left join {{ source('atlas', 'seifa') }} seifa on seifa.sa2_code = s.sa2_code
left join (
    select distinct on (sa2_code) sa2_code, erp
    from {{ source('atlas', 'population_erp') }}
    order by sa2_code, year desc
) erp on erp.sa2_code = s.sa2_code
