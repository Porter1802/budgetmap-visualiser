-- One row per project x package: core attributes, total funding by source, and
-- the SA2s the project touches (array) for the project detail page.
with funding as (
    select
        project_id,
        package_id,
        sum(total_amount_aud) as total_funding_aud,
        sum(total_amount_aud) filter (where funding_source = 'qld')     as qld_funding_aud,
        sum(total_amount_aud) filter (where funding_source = 'fed')     as fed_funding_aud,
        sum(total_amount_aud) filter (where funding_source = 'local')   as local_funding_aud,
        sum(total_amount_aud) filter (where funding_source = 'own_src') as own_src_funding_aud,
        sum(total_amount_aud) filter (where funding_source = 'private') as private_funding_aud
    from {{ ref('stg_project_funding') }}
    group by 1, 2
),
sa2s as (
    select project_id, package_id, array_agg(distinct sa2_code order by sa2_code) as sa2_codes
    from {{ ref('stg_project_location_sa2') }}
    group by 1, 2
)
select
    p.project_id,
    p.package_id,
    p.financial_year,
    p.name,
    p.description,
    p.agency_name,
    p.type_name,
    p.category,
    p.status,
    coalesce(f.total_funding_aud, 0)   as total_funding_aud,
    coalesce(f.qld_funding_aud, 0)     as qld_funding_aud,
    coalesce(f.fed_funding_aud, 0)     as fed_funding_aud,
    coalesce(f.local_funding_aud, 0)   as local_funding_aud,
    coalesce(f.own_src_funding_aud, 0) as own_src_funding_aud,
    coalesce(f.private_funding_aud, 0) as private_funding_aud,
    coalesce(s.sa2_codes, array[]::text[]) as sa2_codes
from {{ ref('stg_projects') }} p
left join funding f using (project_id, package_id)
left join sa2s s using (project_id, package_id)
