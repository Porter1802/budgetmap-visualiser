{{ config(materialized='view') }}

-- Per (project, package, sa2) allocation weight. A project's locations may touch
-- several SA2s; we weight by summed overlap_fraction and normalise per project so
-- a project's funding splits across SA2s honestly and sums back to its total.
with pls as (
    select project_id, package_id, sa2_code, sum(overlap_fraction) as w
    from {{ ref('stg_project_location_sa2') }}
    group by 1, 2, 3
),
totals as (
    select project_id, package_id, sum(w) as w_total
    from pls
    group by 1, 2
)
select
    pls.project_id,
    pls.package_id,
    pls.sa2_code,
    pls.w / nullif(totals.w_total, 0) as alloc_weight
from pls
join totals using (project_id, package_id)
