{# Use the custom schema verbatim (staging, marts) rather than prefixing the
   target schema, so marts live in a clean `marts` schema the API/tiles read. #}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
