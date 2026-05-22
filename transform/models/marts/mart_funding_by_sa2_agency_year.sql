-- Funding rolled up by SA2 x agency x financial year x source, allocated across
-- SA2s by the normalised overlap weight (int_project_sa2_alloc).
with funding as (
    select project_id, package_id, funding_source, sum(total_amount_aud) as total_amount_aud
    from {{ ref('stg_project_funding') }}
    group by 1, 2, 3
)
select
    a.sa2_code,
    p.financial_year,
    p.agency_name,
    f.funding_source,
    sum(f.total_amount_aud * a.alloc_weight)::bigint as allocated_funding_aud
from {{ ref('int_project_sa2_alloc') }} a
join funding f using (project_id, package_id)
join {{ ref('stg_projects') }} p using (project_id, package_id)
group by 1, 2, 3, 4
