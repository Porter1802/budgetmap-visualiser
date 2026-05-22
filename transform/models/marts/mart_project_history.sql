-- Same project_id across packages, with year-on-year funding delta. With a
-- single package today this is the current snapshot; once historical packages
-- land (deferred per decision #2) the lag() lights up the "what changed" view.
with enriched as (
    select
        project_id,
        package_id,
        financial_year,
        name,
        status,
        total_funding_aud
    from {{ ref('mart_project_enriched') }}
)
select
    project_id,
    package_id,
    financial_year,
    name,
    status,
    total_funding_aud,
    lag(total_funding_aud) over w as prev_funding_aud,
    total_funding_aud - lag(total_funding_aud) over w as funding_delta_aud
from enriched
window w as (partition by project_id order by financial_year)
