-- Phase 1: Core member tables for pre-interview form

-- members: basic identification
create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_number text unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- member_identity: identity, education, and initial tags
create table public.member_identity (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  full_name text not null,
  nickname text,
  gender text not null check (gender in ('male', 'female', 'other')),
  age_range text not null,
  nationality text not null,
  current_city text not null,
  school_name text,
  department text,
  degree_level text,
  course_language text,
  enrollment_year int,
  hobby_tags text[] not null default '{}',
  activity_type_tags text[] not null default '{}',
  personality_self_tags text[] not null default '{}',
  taboo_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger members_updated_at
  before update on public.members
  for each row execute function public.update_updated_at();

create trigger member_identity_updated_at
  before update on public.member_identity
  for each row execute function public.update_updated_at();

-- RLS
alter table public.members enable row level security;
alter table public.member_identity enable row level security;

-- Allow anonymous inserts for the public interview form
create policy "allow_anon_insert_members"
  on public.members for insert
  to anon with check (true);

create policy "allow_anon_insert_identity"
  on public.member_identity for insert
  to anon with check (true);

-- Indexes
create index idx_members_status on public.members(status);
create index idx_member_identity_member_id on public.member_identity(member_id);
