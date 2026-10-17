-- Additive local migration. Legacy cache rows and saved client reports are not certified evidence.
alter table public.legal_documents add column evidence jsonb not null default '{}'::jsonb
  check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) < 16000);

alter table public.legal_discovery_runs
  add column trust_version integer not null default 0 check (trust_version in (0, 1)),
  add column evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  add column validated_at timestamptz,
  add column created_user uuid;

alter table public.legal_discovery_runs add constraint legal_runs_validated_evidence
  check (trust_version = 0 or (live is true and evidence_sha256 is not null and validated_at is not null));

comment on column public.legal_discovery_runs.trust_version is '0: legacy client submission, untrusted. 1: server reconstruction from validated source cache; still advisory, not a legal certificate.';
comment on column public.legal_documents.evidence is 'Parser version, exact identity, coverage and limitations recorded by the server. Empty legacy evidence requires refetch.';

-- Existing RLS and service-only write grants remain in effect; no new client write policy.
